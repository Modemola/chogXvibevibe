import {
  DEFAULT_SCORING_CONFIG,
  type Address,
  type ScoringConfig,
  TEMPLATES,
  TEMPLATE_IDS,
  type TemplateId,
  type WalletFields,
  clusterWallets,
  compilePolicy,
  computeFields,
  merkleProofs,
  policyHash,
  resolveAllocation,
  resolveWeights,
  scoreWallet,
  singletonCluster,
  verifyClaim,
} from '@scout/core';
import { type Db, createPgliteDb, hubFunders, listProfileWallets, loadEvidenceFacts, loadLaunchContext, loadSimLabels, loadWalletFacts, migrate, runAftermath, writeBatch } from '@scout/db';
import { simulateWorld } from '@scout/sources';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Every template, resolved at real graduation times in the simulated world, checked against
 * hand-written versions of its rules (not Scout's filter engine): who may be paid, from which
 * bucket, within which caps, with proofs that verify. Also guards the SPARK snapshot being
 * visible at graduation time, which once left every SPARK bucket silently empty.
 */
type Rule = (f: WalletFields) => boolean;
const notSybil: Rule = (f) => f.sybil_score < 0.8;
const RULES: Record<TemplateId, { buckets: Record<string, Rule>; allowed: Rule }> = {
  spark_core: { buckets: { spark: (f) => f.spark_tier >= 1 }, allowed: notSybil },
  hold_or_die: {
    buckets: {
      holders: (f) => f.scout_drops_received >= 1 && f.dump_score < 0.25 && f.hold_quality >= 0.5,
      spark: (f) => f.spark_tier >= 1 && f.dump_score < 0.5,
      builders: (f) => f.shipped_substance,
    },
    allowed: (f) => notSybil(f) && f.last_drop_sold_1h < 0.8,
  },
  builder_lane: {
    buckets: { builders: (f) => f.shipped_substance, substance_holders: (f) => f.held_substance_days_max >= 14, spark: (f) => f.spark_tier >= 1 },
    allowed: (f) => notSybil(f) && !f.created_rug,
  },
  stock_pair_natives: {
    buckets: { natives: (f) => f.stock_pair_markets >= 3 && f.stock_pair_share >= 0.5, spark: (f) => f.spark_tier >= 1 },
    allowed: notSybil,
  },
  chog_holders: {
    buckets: {
      chogs: (f) => f.chog_holder && f.dump_score < 0.5,
      long_chogs: (f) => f.chog_held_days >= 30 && f.dump_score < 0.5,
      holders: (f) => f.scout_drops_received >= 1 && f.dump_score < 0.25 && f.hold_quality >= 0.5,
    },
    allowed: (f) => notSybil(f) && f.last_drop_sold_1h < 0.8,
  },
  custom: {
    buckets: { spark: (f) => f.spark_tier >= 1, holders: (f) => f.dump_score < 0.25 && f.hold_quality > 0.5, builders: (f) => f.shipped_substance },
    allowed: notSybil,
  },
};

const SLICE = 1_000_000n * 10n ** 18n;
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));

describe('templates resolve correctly at graduation', () => {
  let db: Db;
  const world = simulateWorld({ seed: 42 });
  let config: ScoringConfig;
  let farms: Set<string>;
  let launchIds: string[];

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    await writeBatch(db, world.batch);
    await runAftermath(db, { now: world.asOf });
    const hubs = await hubFunders(db, 20);
    config = { ...DEFAULT_SCORING_CONFIG, sybil: { ...DEFAULT_SCORING_CONFIG.sybil, ignoredFunders: hubs.map((h) => h.funder) } };
    farms = new Set([...(await loadSimLabels(db))].filter(([, l]) => l.farmId).map(([w]) => w));
    // The first graduations matter most: few profiles, and farms with only one wallet signed up.
    const rows = await db.query<{ id: string }>('SELECT id FROM launches WHERE graduated_at IS NOT NULL ORDER BY graduated_at, id');
    launchIds = [rows[0]!.id, rows[1]!.id, rows[2]!.id, rows[Math.floor(rows.length / 2)]!.id, rows[rows.length - 1]!.id];
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });

  async function resolveAt(template: TemplateId, launchId: string) {
    const [row] = await db.query<{ graduated_at: string }>('SELECT graduated_at FROM launches WHERE id = $1', [launchId]);
    const launch = (await loadLaunchContext(db, launchId, Number(row!.graduated_at)))!;
    // As the web service does: only a snapshot taken by the graduation time counts.
    const [snap] = await db.query<{ id: string }>('SELECT id FROM snapshots WHERE taken_at <= $1 ORDER BY taken_at DESC LIMIT 1', [launch.asOf]);
    const wallets = await listProfileWallets(db, launch.asOf);
    const facts = await loadWalletFacts(db, { wallets, asOf: launch.asOf, sparkSnapshotId: snap?.id });
    const [creatorFacts] = await loadWalletFacts(db, { wallets: [launch.creator], asOf: launch.asOf, sparkSnapshotId: snap?.id });
    const evidence = await loadEvidenceFacts(db, { asOf: launch.asOf });
    const input = { policy: TEMPLATES[template].policy, launch, slice: SLICE, wallets: facts, evidence, creatorFacts, config };
    return { input, set: resolveAllocation(input), again: resolveAllocation(input), facts, evidence, creatorFacts: creatorFacts!, launch };
  }

  it('sees the SPARK snapshot at graduation time', async () => {
    for (const id of launchIds) {
      const { set } = await resolveAt('spark_core', id);
      expect(set.recipients.length, id).toBeGreaterThan(0);
    }
    const { set } = await resolveAt('spark_core', launchIds.at(-1)!);
    expect(set.recipients.length).toBeGreaterThan(20);
  });

  for (const template of TEMPLATE_IDS) {
    it(`${template}: pays only wallets its rules allow, within caps, with valid proofs`, async () => {
      for (const id of launchIds) {
        const { set, again, facts, evidence, creatorFacts, launch } = await resolveAt(template, id);
        const tag = `${template} ${id}`;
        // Nobody in the simulated world holds a Chog, so the Chog recipe may rightly pay nobody early on.
        if (template !== 'chog_holders') expect(set.recipients.length, tag).toBeGreaterThan(0);
        expect(json(again), `${tag} deterministic`).toBe(json(set));
        expect(set.policyHash).toBe(policyHash(compilePolicy(TEMPLATES[template].policy)));
        expect(set.recipients.reduce((s, r) => s + r.amount, 0n)).toBe(set.allocated);
        expect(set.allocated + set.unallocated).toBe(SLICE);

        const clusters = clusterWallets(facts.some((f) => f.wallet === launch.creator) ? facts : [...facts, creatorFacts], config, evidence);
        const creatorCluster = (clusters.get(launch.creator) ?? singletonCluster(launch.creator)).clusterId;
        const byWallet = new Map(facts.map((f) => [f.wallet, f]));
        const { caps } = compilePolicy(TEMPLATES[template].policy);
        const walletCap = (SLICE * BigInt(caps.perWalletBps)) / 10_000n;
        const clusterCap = (SLICE * BigInt(caps.perClusterBps)) / 10_000n;
        const perCluster = new Map<Address, bigint>();
        for (const r of set.recipients) {
          const f = byWallet.get(r.wallet)!;
          expect(f, `${tag} ${r.wallet} opted in`).toBeDefined();
          // A farm wallet can only slip through while there is nothing yet to link it by:
          // fewer than earlyBuyMin buys and no shared funder (it then looks like any newcomer).
          if (farms.has(r.wallet)) expect(f.earlyBuys.length, `${tag} ${r.wallet} is a linkable farm`).toBeLessThan(config.sybil.earlyBuyMin);
          const cluster = clusters.get(r.wallet) ?? singletonCluster(r.wallet);
          expect(cluster.clusterId, `${tag} ${r.wallet} creator cluster`).not.toBe(creatorCluster);
          const scored = scoreWallet(f, launch, cluster, resolveWeights(template), config);
          const fields = computeFields(f, scored, cluster, launch, false, config);
          expect(RULES[template].allowed(fields), `${tag} ${r.wallet} excluded`).toBe(true);
          for (const b of r.buckets) expect(RULES[template].buckets[b.id]?.(fields), `${tag} ${r.wallet} in ${b.id}`).toBe(true);
          expect(r.buckets.reduce((s, b) => s + b.amount, 0n)).toBe(r.amount);
          expect(r.amount <= walletCap, `${tag} wallet cap`).toBe(true);
          perCluster.set(cluster.clusterId, (perCluster.get(cluster.clusterId) ?? 0n) + r.amount);
        }
        for (const total of perCluster.values()) expect(total <= clusterCap, `${tag} cluster cap`).toBe(true);

        const claims = set.recipients.map((r) => ({ wallet: r.wallet, amount: r.amount }));
        const proofs = merkleProofs(claims);
        for (const c of claims) expect(verifyClaim(set.merkleRoot!, c, proofs.get(c.wallet)!)).toBe(true);
        if (claims.length) {
          expect(verifyClaim(set.merkleRoot!, { ...claims[0]!, amount: claims[0]!.amount + 1n }, proofs.get(claims[0]!.wallet)!)).toBe(false);
        }
      }
    }, 120_000);
  }

  it('rejects custom filters on unknown fields or with broken syntax', () => {
    const base = TEMPLATES.custom.policy;
    const withFilter = (filter: string) => () => compilePolicy({ ...base, buckets: [{ id: 'x', weightBps: 10_000, filter }] });
    expect(withFilter('viber_charged AND viber_level >= 2')).not.toThrow();
    for (const bad of ['holds_my_token > 0', 'spark_tier >=', 'spark_tier >= 1 OR']) expect(withFilter(bad), bad).toThrow();
    expect(() => compilePolicy({ ...base, buckets: [{ id: 'a', weightBps: 6_000, filter: 'spark_tier >= 1' }] })).toThrow();
  });
});
