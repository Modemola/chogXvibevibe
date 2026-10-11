import { describe, expect, it } from 'vitest';
import {
  type AllocationSet,
  type ResolveInput,
  TEMPLATES,
  TEMPLATE_IDS,
  allocationToCsv,
  allocationToJson,
  merkleProofs,
  previewAllocation,
  resolveAllocation,
  verifyClaim,
} from '../src/index.js';
import type { Lane, PairClass, WalletFacts } from '../src/index.js';
import { CREATOR, DAY, SPARK, T0, addr, drop, launch, position, rng, wallet } from './fixtures.js';

const SLICE = 1_000_000n * SPARK;

function population(): WalletFacts[] {
  return [
    // Diamond hands with SPARK.
    wallet(1, { sparkBalance: 300_000n * SPARK, scoutDrops: [drop(30, 0), drop(60, 0)] }),
    wallet(2, { sparkBalance: 60_000n * SPARK, scoutDrops: [drop(20, 0.1)] }),
    // Serial dumper with SPARK.
    wallet(3, { sparkBalance: 2_000_000n * SPARK, scoutDrops: [drop(5, 1), drop(15, 1), drop(25, 0.9)] }),
    // Builder.
    wallet(4, {
      createdLaunches: [{ launchId: 'p1', lane: 'utility', graduated: true, hasProductLinks: true, flaggedRug: false }],
      positions: [position({ lane: 'utility', pairClass: 'stock', firstBuyAt: T0 - 40 * DAY })],
    }),
    // Nobody yet.
    wallet(5),
  ];
}

const input = (over: Partial<ResolveInput> = {}): ResolveInput => ({
  policy: TEMPLATES.custom.policy,
  launch: launch(),
  slice: SLICE,
  wallets: population(),
  ...over,
});

function checkInvariants(set: AllocationSet, perWalletBps: number, perClusterBps: number) {
  expect(set.allocated + set.unallocated).toBe(set.slice);
  expect(set.recipients.reduce((s, r) => s + r.amount, 0n)).toBe(set.allocated);
  const walletCap = (set.slice * BigInt(perWalletBps)) / 10_000n;
  const clusterCap = (set.slice * BigInt(perClusterBps)) / 10_000n;
  const byCluster = new Map<string, bigint>();
  for (const r of set.recipients) {
    expect(r.amount).toBeGreaterThan(0n);
    expect(r.amount).toBeLessThanOrEqual(walletCap);
    byCluster.set(r.clusterId, (byCluster.get(r.clusterId) ?? 0n) + r.amount);
    expect(r.buckets.reduce((s, b) => s + b.amount, 0n)).toBe(r.amount);
  }
  for (const v of byCluster.values()) expect(v).toBeLessThanOrEqual(clusterCap);
  const excludedCreator = new Set(set.excluded.filter((e) => e.rule === 'creator_cluster').map((e) => e.wallet));
  for (const r of set.recipients) expect(excludedCreator.has(r.wallet)).toBe(false);
}

describe('resolveAllocation', () => {
  it('produces a consistent allocation with explainable recipients', () => {
    const set = resolveAllocation(input({ policy: { ...TEMPLATES.custom.policy, caps: { perWalletBps: 5_000, perClusterBps: 5_000 } } }));
    checkInvariants(set, 5_000, 5_000);
    const w1 = set.recipients.find((r) => r.wallet === addr(1))!;
    const w3 = set.recipients.find((r) => r.wallet === addr(3));
    expect(w1.reasons.map((r) => r.code)).toContain('SPARK_200K');
    // The dumper holds 7x more SPARK but gets less than the holder.
    expect(w3 === undefined || w3.amount < w1.amount).toBe(true);
    expect(set.merkleRoot).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('with default caps (0.5% per wallet) a tiny population leaves most of the slice unallocated, and says so', () => {
    const set = resolveAllocation(input());
    checkInvariants(set, 50, 80);
    expect(set.unallocated).toBeGreaterThan(0n);
    const warning = set.warnings.find((w) => w.startsWith('UNALLOCATED'));
    expect(warning).toMatch(/^UNALLOCATED: [\d,.]+ tokens \(/); // whole tokens, not raw base units
  });

  it('is deterministic regardless of input order', () => {
    const a = resolveAllocation(input());
    const b = resolveAllocation(input({ wallets: [...population()].reverse() }));
    expect(allocationToJson(b)).toEqual(allocationToJson(a));
  });

  it('excludes the creator and everything clustered with them, including allowlisted alts', () => {
    const alt = wallet(50, { firstFunding: { funder: CREATOR, at: T0 - DAY }, sparkBalance: 500_000n * SPARK });
    const set = resolveAllocation(
      input({
        wallets: [...population(), alt, wallet(0xc0ffee, { sparkBalance: 1_000_000n * SPARK })],
        policy: {
          version: 1,
          buckets: [
            { id: 'friends', weightBps: 2_000, allowlist: [addr(50)] },
            { id: 'spark', weightBps: 8_000, filter: 'spark_tier >= 1' },
          ],
        },
      }),
    );
    const recipients = set.recipients.map((r) => r.wallet);
    expect(recipients).not.toContain(CREATOR);
    expect(recipients).not.toContain(addr(50));
    expect(set.excluded).toContainEqual({ wallet: addr(50), rule: 'creator_cluster' });
    expect(set.warnings.some((w) => w.startsWith('ALLOWLIST_CREATOR_CLUSTER'))).toBe(true);
  });

  it('allowlisted wallets that never opted in only receive from their own bucket', () => {
    const outsider = addr(777);
    const set = resolveAllocation(
      input({
        policy: {
          version: 1,
          caps: { perWalletBps: 10_000, perClusterBps: 10_000 },
          buckets: [
            { id: 'community', weightBps: 1_000, allowlist: [outsider] },
            { id: 'everyone', weightBps: 9_000 },
          ],
        },
      }),
    );
    const r = set.recipients.find((x) => x.wallet === outsider)!;
    expect(r.buckets.map((b) => b.id)).toEqual(['community']);
    expect(r.amount).toBe(SLICE / 10n);
  });

  it('spills an empty bucket into the next one, and the fallback absorbs the tail', () => {
    const set = resolveAllocation(
      input({
        policy: {
          version: 1,
          caps: { perWalletBps: 10_000, perClusterBps: 10_000 },
          buckets: [
            { id: 'stock_natives', weightBps: 6_000, filter: 'stock_pair_markets >= 3' },
            { id: 'spark', weightBps: 3_000, filter: 'spark_tier >= 1' },
            { id: 'nobody', weightBps: 1_000, filter: 'viber_level >= 99' },
          ],
          fallbackBucket: 'spark',
        },
      }),
    );
    const [natives, spark, nobody] = set.buckets;
    expect(natives!.candidates).toBe(0);
    expect(natives!.carriedOut).toBe(natives!.target);
    expect(spark!.carriedIn).toBe(natives!.target);
    expect(nobody!.carriedOut).toBe(nobody!.target);
    expect(set.unallocated).toBe(0n);
    expect(set.warnings.filter((w) => w.startsWith('EMPTY_BUCKET'))).toHaveLength(2);
  });

  it('applies policy excludes and minScore with rule codes', () => {
    const set = resolveAllocation(
      input({ policy: { ...TEMPLATES.custom.policy, excludes: ['dump_score >= 0.5'], minScore: 0.25 } }),
    );
    expect(set.excluded).toContainEqual({ wallet: addr(3), rule: 'exclude:0' });
    expect(set.excluded).toContainEqual({ wallet: addr(5), rule: 'min_score' });
  });

  it('shares one cap across a declared cluster', () => {
    const wallets = [
      wallet(1, { sparkBalance: 300_000n * SPARK }),
      wallet(2, { sparkBalance: 300_000n * SPARK, linkedTo: addr(1) }),
      wallet(3, { sparkBalance: 300_000n * SPARK, linkedTo: addr(1) }),
      ...Array.from({ length: 30 }, (_, i) => wallet(100 + i, { sparkBalance: 60_000n * SPARK })),
    ];
    const set = resolveAllocation(input({ wallets, policy: TEMPLATES.spark_core.policy }));
    checkInvariants(set, 50, 80);
    const cluster = set.recipients.filter((r) => r.clusterId === addr(1)).reduce((s, r) => s + r.amount, 0n);
    expect(cluster).toBe((SLICE * 80n) / 10_000n);
  });

  it('merkle proofs verify for every recipient and fail for tampered amounts', () => {
    const set = resolveAllocation(input());
    const proofs = merkleProofs(set.recipients);
    for (const r of set.recipients) {
      expect(verifyClaim(set.merkleRoot!, r, proofs.get(r.wallet)!)).toBe(true);
    }
    const r = set.recipients[0]!;
    expect(verifyClaim(set.merkleRoot!, { ...r, amount: r.amount + 1n }, proofs.get(r.wallet)!)).toBe(false);
  });

  it('Chog Holders pays Chog Genesis holders who stay, extra to long holders, and explains why', () => {
    const wallets = [
      wallet(1, { chog: { tokens: 2, heldSince: T0 - 90 * DAY } }), // long-time Chog
      wallet(2, { chog: { tokens: 1, heldSince: T0 - 3 * DAY } }), // new Chog
      wallet(3, { chog: { tokens: 1, heldSince: T0 - 90 * DAY }, scoutDrops: [drop(5, 1), drop(15, 1), drop(25, 0.9)] }), // Chog who dumps
      wallet(4, { chog: { tokens: 1, heldSince: T0 + DAY } }), // bought after the snapshot
      wallet(5, { chog: { tokens: 0, chogBalance: 5_000n * SPARK } }), // $CHOG only, no NFT
      wallet(6), // nobody
    ];
    // Loose caps: with only two holders, the default 0.5% wallet cap would fill before the long-hold bucket.
    const policy = { ...TEMPLATES.chog_holders.policy, caps: { perWalletBps: 10_000, perClusterBps: 10_000 } };
    const set = resolveAllocation(input({ wallets, policy }));
    const paid = new Map(set.recipients.map((r) => [r.wallet, r]));
    expect([...paid.keys()].sort()).toEqual([addr(1), addr(2)]);
    expect(paid.get(addr(1))!.buckets.map((b) => b.id).sort()).toEqual(['chogs', 'long_chogs']);
    expect(paid.get(addr(2))!.buckets.map((b) => b.id)).toEqual(['chogs']);
    expect(paid.get(addr(1))!.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['CHOG_HOLDER', 'CHOG_LONG_HOLD']));
    const w2 = paid.get(addr(2))!.reasons.map((r) => r.code);
    expect(w2).toContain('CHOG_HOLDER');
    expect(w2).not.toContain('CHOG_LONG_HOLD');
    expect(paid.get(addr(1))!.amount).toBeGreaterThan(paid.get(addr(2))!.amount);
  });

  it('handles an empty population', () => {
    const set = resolveAllocation(input({ wallets: [] }));
    expect(set.recipients).toEqual([]);
    expect(set.merkleRoot).toBeNull();
    expect(set.unallocated).toBe(SLICE);
  });

  it('preview trims recipients but keeps totals; exports are well-formed', () => {
    const p = previewAllocation(input({ policy: { ...TEMPLATES.custom.policy, caps: { perWalletBps: 5_000, perClusterBps: 5_000 } } }), 2);
    expect(p.recipients).toHaveLength(2);
    expect(p.totalRecipients).toBeGreaterThanOrEqual(2);
    const csv = allocationToCsv(resolveAllocation(input()));
    expect(csv.split('\n')[0]).toBe('wallet,amount,score,buckets');
    const json = allocationToJson(resolveAllocation(input()), { proofs: true }) as { recipients: { proof: string[]; amount: string }[] };
    expect(typeof json.recipients[0]!.amount).toBe('string');
    expect(Array.isArray(json.recipients[0]!.proof)).toBe(true);
  });
});

describe('invariants on random populations', () => {
  const lanes: Lane[] = ['meme', 'art', 'utility', 'rwa', 'vibecoded'];
  const pairs: PairClass[] = ['eth', 'stock', 'other'];

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}`, () => {
      const r = rng(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
      const funders = [addr(0xf1), addr(0xf2), CREATOR];
      const wallets = Array.from({ length: 150 }, (_, i) =>
        wallet(1_000 + i, {
          sparkBalance: BigInt(Math.floor(r() * 1_500_000)) * SPARK,
          scoutDrops: Array.from({ length: Math.floor(r() * 4) }, () => drop(1 + Math.floor(r() * 90), r(), r(), r())),
          positions: Array.from({ length: Math.floor(r() * 6) }, (_, j) =>
            position({ launchId: `p${j}`, lane: pick(lanes), pairClass: pick(pairs), volumeUsd: r() * 1_000, graduated: r() > 0.5 }),
          ),
          firstFunding: r() > 0.6 ? { funder: pick(funders), at: T0 - Math.floor(r() * 10) * 600 } : undefined,
          viber: r() > 0.7 ? { level: Math.floor(r() * 12), lastChargedAt: T0 - Math.floor(r() * 60) * DAY } : undefined,
        }),
      );
      const tpl = TEMPLATES[TEMPLATE_IDS[seed % TEMPLATE_IDS.length]!];
      const caps = { perWalletBps: 50 + Math.floor(r() * 400), perClusterBps: 500 };
      const slice = BigInt(Math.floor(r() * 1e9)) * SPARK + 7n; // odd amount to exercise rounding
      const set = resolveAllocation({ policy: { ...tpl.policy, caps }, launch: launch(), slice, wallets });
      checkInvariants(set, caps.perWalletBps, caps.perClusterBps);
    });
  }
});
