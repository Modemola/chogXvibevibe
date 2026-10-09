import { randomBytes } from 'node:crypto';
import {
  type Address,
  type AllocationSet,
  DEFAULT_SCORING_CONFIG,
  type LaunchContext,
  type Lane,
  LANES,
  MessageError,
  PAIR_CLASSES,
  type PairClass,
  PolicyError,
  type ScoringConfig,
  TEMPLATES,
  TEMPLATE_IDS,
  type TemplateId,
  type WalletFacts,
  allocationToCsv,
  allocationToJson,
  clusterWallets,
  compilePolicy,
  computeFields,
  evaluateFilter,
  normalizeAddress,
  parseMessage,
  policyHash,
  resolveAllocation,
  resolveWeights,
  scoreWallet,
  singletonCluster,
  verifySignature,
} from '@scout/core';
import {
  type Db,
  hubFunders,
  latestSnapshotId,
  loadEvidenceFacts,
  listProfileWallets,
  loadLaunchAftermath,
  loadLaunchContext,
  loadWalletFacts,
} from '@scout/db';
import { SPARK_BASE } from '@scout/sources';

/**
 * Everything the web app and API do, as plain async methods over a Db.
 * Route handlers are thin wrappers around this, and tests call it directly.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: string[],
  ) {
    super(message);
  }
}

export interface ServiceOptions {
  now?: () => number;
  /** Funders with at least this many funded wallets are ignored for sybil links. 0 disables. */
  ignoreHubsMinFanout?: number;
  nonceTtlSec?: number;
  /** How long a loaded population stays cached. */
  cacheSec?: number;
}

export type LaunchSpec = { launchId: string } | { lane: Lane; pairClass: PairClass; creator: string };

interface Population {
  asOf: number;
  config: ScoringConfig;
  snapshotId?: string;
  wallets: Address[];
  facts: Map<Address, WalletFacts>;
  /** Every other indexed wallet's funding and early buys: sybil evidence only. */
  evidence: WalletFacts[];
}

const E18 = 10n ** 18n;
const DEAD: Address = '0x000000000000000000000000000000000000dead';

export class ScoutService {
  private readonly now: () => number;
  private readonly hubFanout: number;
  private readonly nonceTtl: number;
  private readonly cacheSec: number;
  private cache?: { key: number; at: number; pop: Promise<Population> };

  constructor(
    private readonly db: Db,
    opts: ServiceOptions = {},
  ) {
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.hubFanout = opts.ignoreHubsMinFanout ?? 20;
    this.nonceTtl = opts.nonceTtlSec ?? 600;
    this.cacheSec = opts.cacheSec ?? 60;
  }

  // --- Population -------------------------------------------------------------

  private invalidate() {
    this.cache = undefined;
  }

  /** All opted-in profiles' facts at `asOf`, cached briefly. */
  private population(asOf: number): Promise<Population> {
    const now = this.now();
    if (this.cache && this.cache.key === asOf && now - this.cache.at < this.cacheSec) return this.cache.pop;
    const pop = this.loadPopulation(asOf);
    this.cache = { key: asOf, at: now, pop };
    pop.catch(() => this.invalidate());
    return pop;
  }

  private async loadPopulation(asOf: number): Promise<Population> {
    const config = await this.config();
    const snapshotId = await this.snapshotFor(asOf);
    const wallets = await listProfileWallets(this.db, asOf);
    const [facts, evidence] = await Promise.all([
      loadWalletFacts(this.db, { wallets, asOf, sparkSnapshotId: snapshotId }),
      loadEvidenceFacts(this.db, { asOf }),
    ]);
    return { asOf, config, snapshotId, wallets, facts: new Map(facts.map((f) => [f.wallet, f])), evidence };
  }

  private async config(): Promise<ScoringConfig> {
    if (this.hubFanout <= 0) return DEFAULT_SCORING_CONFIG;
    const hubs = await hubFunders(this.db, this.hubFanout);
    return {
      ...DEFAULT_SCORING_CONFIG,
      sybil: { ...DEFAULT_SCORING_CONFIG.sybil, ignoredFunders: hubs.map((h) => h.funder) },
    };
  }

  private async snapshotFor(asOf: number): Promise<string | undefined> {
    const real = await latestSnapshotId(this.db, SPARK_BASE, asOf);
    if (real) return real;
    const [row] = await this.db.query<{ id: string }>(
      'SELECT id FROM snapshots WHERE taken_at <= $1 ORDER BY taken_at DESC, id DESC LIMIT 1',
      [asOf],
    );
    return row?.id;
  }

  /** Default "now", rounded up to the minute so cached populations are reused and fresh actions stay visible. */
  asOf(): number {
    return Math.ceil(this.now() / 60) * 60;
  }

  // --- Read ---------------------------------------------------------------------

  async stats() {
    const one = async (sql: string) => Number((await this.db.query<{ n: string }>(sql))[0]?.n ?? 0);
    return {
      profiles: await one('SELECT count(*)::text AS n FROM profiles'),
      launches: await one('SELECT count(*)::text AS n FROM launches'),
      graduated: await one('SELECT count(*)::text AS n FROM launches WHERE graduated_at IS NOT NULL'),
      scoutDrops: await one('SELECT count(*)::text AS n FROM scout_drops'),
      lockedPolicies: await one('SELECT count(*)::text AS n FROM policy_locks'),
    };
  }

  async launches(limit = 200) {
    const rows = await this.db.query<{
      id: string;
      creator: string;
      lane: Lane;
      pair_class: PairClass;
      created_at: string;
      graduated_at: string | null;
      policy_hash: string | null;
      drops: number;
    }>(
      `SELECT l.id, l.creator, l.lane, l.pair_class, l.created_at, l.graduated_at, pl.policy_hash,
              (SELECT count(*)::int FROM scout_drops d WHERE d.launch_id = l.id) AS drops
         FROM launches l LEFT JOIN policy_locks pl ON pl.launch_id = l.id
        ORDER BY l.created_at DESC, l.id LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      creator: r.creator,
      lane: r.lane,
      pairClass: r.pair_class,
      createdAt: Number(r.created_at),
      graduatedAt: r.graduated_at === null ? null : Number(r.graduated_at),
      lockedPolicy: r.policy_hash,
      drops: Number(r.drops),
    }));
  }

  /** Recent measured drop outcomes (latest window per drop), for the live ticker. */
  async highlights(limit = 24) {
    const rows = await this.db.query<{ launch_id: string; wallet: string; window: string; sold_bps: number }>(
      `SELECT DISTINCT ON (o.launch_id, o.wallet) o.launch_id, o.wallet, o."window", o.sold_bps
         FROM drop_outcomes o JOIN scout_drops d ON d.launch_id = o.launch_id AND d.wallet = o.wallet
        ORDER BY o.launch_id, o.wallet,
                 CASE o."window" WHEN 'd30' THEN 4 WHEN 'd7' THEN 3 WHEN 'h24' THEN 2 ELSE 1 END DESC`,
    );
    // Interleave holders and dumpers so the ticker shows both sides.
    const held = rows.filter((r) => Number(r.sold_bps) < 1_000);
    const dumped = rows.filter((r) => Number(r.sold_bps) >= 9_000);
    const out: { launchId: string; wallet: string; window: string; soldBps: number }[] = [];
    for (let i = 0; out.length < limit && (i < held.length || i < dumped.length); i++) {
      for (const r of [held[held.length - 1 - i], dumped[dumped.length - 1 - i]]) {
        if (r && out.length < limit) out.push({ launchId: r.launch_id, wallet: r.wallet, window: r.window, soldBps: Number(r.sold_bps) });
      }
    }
    return out;
  }

  /** The launch with the most measured drop recipients at 7 days, for the home page. */
  async featuredLaunch(): Promise<string | undefined> {
    const [row] = await this.db.query<{ launch_id: string }>(
      `SELECT launch_id FROM drop_outcomes WHERE "window" = 'd7' GROUP BY launch_id ORDER BY count(*) DESC, launch_id LIMIT 1`,
    );
    return row?.launch_id;
  }

  /** What the guided tour shows: the featured launch, its steadiest holder and its fastest dumper. */
  async tourTargets() {
    const launchId = await this.featuredLaunch();
    if (!launchId) return { launchId: null, holder: null, dumper: null };
    const { recipients } = await this.aftermath(launchId);
    const last = (r: (typeof recipients)[number]) => r.sold.d30 ?? r.sold.d7 ?? r.sold.h24 ?? r.sold.h1 ?? -1;
    const measured = recipients.filter((r) => last(r) >= 0);
    const byAmount = (a: (typeof recipients)[number], b: (typeof recipients)[number]) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0);
    const holder = [...measured].sort((a, b) => last(a) - last(b) || byAmount(a, b))[0];
    const dumper = [...measured].sort((a, b) => (b.sold.h1 ?? 0) - (a.sold.h1 ?? 0) || byAmount(a, b))[0];
    return { launchId, holder: holder?.wallet ?? null, dumper: dumper?.wallet ?? null };
  }

  /** Public Aftermath card: who held and who dumped a launch's Scout drop. */
  async aftermath(launchId: string) {
    const [launch] = await this.db.query<{ id: string; lane: Lane; pair_class: PairClass; creator: string; graduated_at: string | null; token: string }>(
      'SELECT id, lane, pair_class, creator, graduated_at, token FROM launches WHERE id = $1',
      [launchId],
    );
    if (!launch) throw new ApiError(404, `Launch ${launchId} not found`);
    const am = await loadLaunchAftermath(this.db, launchId);
    const order = ['d30', 'd7', 'h24', 'h1'] as const;
    const latest = (sold: Partial<Record<(typeof order)[number], number>>) => {
      for (const w of order) if (sold[w] !== undefined) return sold[w]!;
      return -1;
    };
    return {
      launch: {
        id: launch.id,
        lane: launch.lane,
        pairClass: launch.pair_class,
        creator: launch.creator,
        token: launch.token,
        graduatedAt: launch.graduated_at === null ? null : Number(launch.graduated_at),
      },
      windows: am.windows,
      totalAmount: am.recipients.reduce((s, r) => s + r.amount, 0n),
      // Holders first, then by amount, so the page leads with who stayed.
      recipients: am.recipients.sort((a, b) => latest(a.sold) - latest(b.sold) || (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0)),
    };
  }

  async profile(walletInput: string, opts: { template?: string; lane?: string; pairClass?: string; asOf?: number } = {}) {
    const wallet = parseAddress(walletInput, 'wallet');
    const template = parseTemplate(opts.template ?? 'custom');
    const asOf = opts.asOf ?? this.asOf();
    const launch: LaunchContext = {
      launchId: 'profile-view',
      lane: parseLane(opts.lane ?? 'utility'),
      pairClass: parsePair(opts.pairClass ?? 'stock'),
      creator: DEAD,
      asOf,
    };

    // The profile row is read fresh: the cached population can be up to a minute old, and on a host with
    // several server instances an opt-in made through another instance would otherwise not show up yet.
    const [profileRow] = await this.db.query<{ opted_in_at: string }>('SELECT opted_in_at FROM profiles WHERE wallet = $1', [wallet]);
    let pop = await this.population(asOf);
    if (profileRow && Number(profileRow.opted_in_at) <= asOf && !pop.facts.has(wallet)) {
      this.invalidate();
      pop = await this.population(asOf);
    }
    const optedIn = pop.facts.has(wallet);
    const [facts] = optedIn
      ? [pop.facts.get(wallet)!]
      : await loadWalletFacts(this.db, { wallets: [wallet], asOf, sparkSnapshotId: pop.snapshotId });
    const everyone = optedIn ? [...pop.facts.values()] : [...pop.facts.values(), facts!];
    const clusters = clusterWallets(everyone, pop.config, pop.evidence);
    const cluster = clusters.get(wallet) ?? singletonCluster(wallet);
    const weights = resolveWeights(template, undefined);
    const scored = scoreWallet(facts!, launch, cluster, weights, pop.config);
    const fields = computeFields(facts!, scored, cluster, launch, false, pop.config);

    // Which templates would include this wallet, and through which bucket.
    const eligibility = TEMPLATE_IDS.map((id) => {
      const policy = compilePolicy(TEMPLATES[id].policy);
      const s = scoreWallet(facts!, launch, cluster, resolveWeights(id, undefined), pop.config);
      const f = computeFields(facts!, s, cluster, launch, false, pop.config);
      const excludedBy = policy.excludes.findIndex((e) => evaluateFilter(e, f));
      const excludeSource = TEMPLATES[id].policy.excludes?.[excludedBy];
      return {
        template: id,
        name: TEMPLATES[id].name,
        score: s.score,
        excludedBy: excludedBy >= 0 ? (typeof excludeSource === 'string' ? excludeSource : `exclude ${excludedBy}`) : null,
        buckets: policy.buckets
          .filter((b) => !b.allowlist && (!b.filter || evaluateFilter(b.filter, f)) && (b.distribution !== 'score' || s.score > 0))
          .map((b) => b.id),
      };
    });

    const alts = await this.db.query<{ wallet: string }>('SELECT wallet FROM wallet_links WHERE primary_wallet = $1 ORDER BY wallet', [wallet]);

    return {
      wallet,
      asOf,
      template,
      launch: { lane: launch.lane, pairClass: launch.pairClass },
      optedIn,
      optedInAt: profileRow ? Number(profileRow.opted_in_at) : null,
      linkedTo: facts!.linkedTo ?? null,
      alts: alts.map((a) => a.wallet),
      score: scored.score,
      reasons: scored.reasons,
      features: scored.features,
      fields,
      cluster: { id: cluster.clusterId, size: cluster.size, sybilScore: cluster.sybilScore, edges: cluster.edges },
      sparkBalance: facts!.sparkBalance,
      viber: facts!.viber ?? null,
      guilds: facts!.guilds,
      drops: [...facts!.scoutDrops].sort((a, b) => b.receivedAt - a.receivedAt),
      createdLaunches: facts!.createdLaunches,
      eligibility,
    };
  }

  // --- Policies -------------------------------------------------------------------

  private async launchContext(spec: LaunchSpec, asOf: number): Promise<LaunchContext> {
    if ('launchId' in spec) {
      const ctx = await loadLaunchContext(this.db, spec.launchId, asOf);
      if (!ctx) throw new ApiError(404, `Launch ${spec.launchId} not found`);
      return ctx;
    }
    return {
      launchId: 'adhoc',
      lane: parseLane(spec.lane),
      pairClass: parsePair(spec.pairClass),
      creator: parseAddress(spec.creator, 'creator'),
      asOf,
    };
  }

  async resolve(input: { policy: unknown; launch: LaunchSpec; sliceTokens: string | number; asOf?: number }): Promise<AllocationSet> {
    const asOf = input.asOf ?? this.asOf();
    const launch = await this.launchContext(input.launch, asOf);
    const slice = parseSlice(input.sliceTokens);
    const pop = await this.population(asOf);
    const [creatorFacts] = await loadWalletFacts(this.db, { wallets: [launch.creator], asOf, sparkSnapshotId: pop.snapshotId });
    try {
      return resolveAllocation({
        policy: input.policy,
        launch,
        slice,
        wallets: [...pop.facts.values()],
        evidence: pop.evidence,
        creatorFacts,
        config: pop.config,
      });
    } catch (e) {
      if (e instanceof PolicyError) throw new ApiError(400, e.message, e.issues);
      throw e;
    }
  }

  async preview(input: { policy: unknown; launch: LaunchSpec; sliceTokens: string | number; topN?: number; asOf?: number }) {
    const set = await this.resolve(input);
    return { ...set, totalRecipients: set.recipients.length, recipients: set.recipients.slice(0, input.topN ?? 50) };
  }

  async exportCsv(input: { policy: unknown; launch: LaunchSpec; sliceTokens: string | number; asOf?: number }): Promise<string> {
    return allocationToCsv(await this.resolve(input));
  }

  /** Full allocation with a Merkle proof per recipient, for ScoutDrop claims. */
  async exportClaims(input: { policy: unknown; launch: LaunchSpec; sliceTokens: string | number; asOf?: number }) {
    return allocationToJson(await this.resolve(input), { proofs: true });
  }

  async savePolicy(policyInput: unknown): Promise<{ hash: `0x${string}` }> {
    let policy;
    try {
      policy = compilePolicy(policyInput);
    } catch (e) {
      if (e instanceof PolicyError) throw new ApiError(400, e.message, e.issues);
      throw e;
    }
    const hash = policyHash(policy);
    await this.db.query(
      'INSERT INTO policies (hash, policy, created_at) VALUES ($1, $2::jsonb, $3) ON CONFLICT (hash) DO NOTHING',
      [hash, JSON.stringify(policy), this.now()],
    );
    return { hash };
  }

  async getPolicy(hash: string) {
    const [row] = await this.db.query<{ policy: unknown; created_at: string }>('SELECT policy, created_at FROM policies WHERE hash = $1', [
      hash.toLowerCase(),
    ]);
    if (!row) throw new ApiError(404, 'Policy not found');
    const policy = typeof row.policy === 'string' ? JSON.parse(row.policy) : row.policy;
    return { hash: hash.toLowerCase(), policy, createdAt: Number(row.created_at) };
  }

  // --- Signed actions ---------------------------------------------------------------

  async issueNonce(): Promise<{ nonce: string; issuedAt: number }> {
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = this.now();
    // Expired nonces can never be used again; drop them so requesting nonces can't grow the table forever.
    await this.db.query('DELETE FROM auth_nonces WHERE created_at < $1', [issuedAt - this.nonceTtl]);
    await this.db.query('INSERT INTO auth_nonces (nonce, created_at) VALUES ($1, $2)', [nonce, issuedAt]);
    return { nonce, issuedAt };
  }

  /** Parses, checks freshness and burns the nonce. Signature checks are the caller's. */
  private async consume(message: string) {
    let parsed;
    try {
      parsed = parseMessage(message);
    } catch (e) {
      if (e instanceof MessageError) throw new ApiError(400, e.message);
      throw e;
    }
    const now = this.now();
    const { nonce, issuedAt } = parsed.envelope;
    if (Math.abs(now - issuedAt) > this.nonceTtl) throw new ApiError(400, 'Message expired. Sign a fresh one.');
    const burned = await this.db.query(
      `UPDATE auth_nonces SET used_at = $2
        WHERE nonce = $1 AND used_at IS NULL AND created_at >= $3
        RETURNING nonce`,
      [nonce, now, now - this.nonceTtl],
    );
    if (!burned.length) throw new ApiError(400, 'Unknown, used or expired nonce');
    return parsed;
  }

  private async requireSignature(message: string, signer: Address, signature: unknown, who: string) {
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) throw new ApiError(400, `Missing ${who} signature`);
    if (!(await verifySignature(message, signer, signature as `0x${string}`))) {
      throw new ApiError(401, `Invalid signature from ${who} ${signer}`);
    }
  }

  async optIn(input: { message: string; signature: string }) {
    const { action } = await this.parseFor(input.message, 'opt_in');
    await this.requireSignature(input.message, action.wallet, input.signature, 'wallet');
    await this.consume(input.message);
    const inserted = await this.db.query(
      `INSERT INTO profiles (wallet, opted_in_at, message, signature) VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet) DO NOTHING RETURNING wallet`,
      [action.wallet, this.now(), input.message, input.signature],
    );
    this.invalidate();
    return { wallet: action.wallet, created: inserted.length > 0 };
  }

  async link(input: { message: string; signature: string; primarySignature: string }) {
    const { action } = await this.parseFor(input.message, 'link');
    if (action.primary === action.alt) throw new ApiError(400, 'A wallet cannot link to itself');
    await this.requireSignature(input.message, action.alt, input.signature, 'alt');
    await this.requireSignature(input.message, action.primary, input.primarySignature, 'primary');

    // Keep clusters one level deep: a primary is not itself an alt, an alt has no alts.
    const [primaryIsAlt] = await this.db.query('SELECT 1 FROM wallet_links WHERE wallet = $1', [action.primary]);
    if (primaryIsAlt) throw new ApiError(409, 'The primary wallet is already linked as an alt of another wallet');
    const [altHasAlts] = await this.db.query('SELECT 1 FROM wallet_links WHERE primary_wallet = $1', [action.alt]);
    if (altHasAlts) throw new ApiError(409, 'The alt wallet already has alts of its own');

    await this.consume(input.message);
    const now = this.now();
    await this.db.transaction(async (tx) => {
      for (const w of [action.primary, action.alt]) {
        await tx.query('INSERT INTO profiles (wallet, opted_in_at, message, signature) VALUES ($1, $2, NULL, NULL) ON CONFLICT DO NOTHING', [
          w,
          now,
        ]);
      }
      await tx.query(
        `INSERT INTO wallet_links (wallet, primary_wallet, linked_at, signature, primary_signature) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (wallet) DO UPDATE SET primary_wallet = EXCLUDED.primary_wallet, linked_at = EXCLUDED.linked_at,
           signature = EXCLUDED.signature, primary_signature = EXCLUDED.primary_signature`,
        [action.alt, action.primary, now, input.signature, input.primarySignature],
      );
    });
    this.invalidate();
    return { primary: action.primary, alt: action.alt };
  }

  async lockPolicy(input: { message: string; signature: string }) {
    const { action } = await this.parseFor(input.message, 'lock_policy');
    const launch = await loadLaunchContext(this.db, action.launchId, this.now());
    if (!launch) throw new ApiError(404, `Launch ${action.launchId} not found`);
    if (launch.creator !== action.creator) throw new ApiError(403, 'Only the launch creator can lock its policy');
    // Rules are committed before the outcome is known: once a launch graduates, its drop can be resolved,
    // so locking then would let a creator pick the policy that favours wallets they choose.
    const [{ graduated_at } = { graduated_at: null }] = await this.db.query<{ graduated_at: string | null }>(
      'SELECT graduated_at FROM launches WHERE id = $1',
      [action.launchId],
    );
    if (graduated_at !== null && Number(graduated_at) <= this.now()) throw new ApiError(409, 'This launch has already graduated; its policy can no longer be locked');
    await this.getPolicy(action.policyHash); // must be saved first
    await this.requireSignature(input.message, action.creator, input.signature, 'creator');
    const [existing] = await this.db.query('SELECT 1 FROM policy_locks WHERE launch_id = $1', [action.launchId]);
    if (existing) throw new ApiError(409, 'This launch already has a locked policy');
    await this.consume(input.message);
    await this.db.query(
      `INSERT INTO policy_locks (launch_id, policy_hash, creator, message, signature, locked_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [action.launchId, action.policyHash, action.creator, input.message, input.signature, this.now()],
    );
    return { launchId: action.launchId, policyHash: action.policyHash };
  }

  private async parseFor<K extends 'opt_in' | 'link' | 'lock_policy'>(message: unknown, kind: K) {
    if (typeof message !== 'string') throw new ApiError(400, 'Missing message');
    try {
      const parsed = parseMessage(message);
      if (parsed.action.kind !== kind) throw new ApiError(400, `Expected a ${kind} message`);
      return parsed as { action: Extract<typeof parsed.action, { kind: K }>; envelope: typeof parsed.envelope };
    } catch (e) {
      if (e instanceof MessageError) throw new ApiError(400, e.message);
      throw e;
    }
  }
}

// --- Input parsing ------------------------------------------------------------------

function parseAddress(v: unknown, name: string): Address {
  try {
    return normalizeAddress(String(v));
  } catch {
    throw new ApiError(400, `Invalid ${name} address`);
  }
}

function parseTemplate(v: string): TemplateId {
  if (!TEMPLATE_IDS.includes(v as TemplateId)) throw new ApiError(400, `Unknown template '${v}'`);
  return v as TemplateId;
}

function parseLane(v: string): Lane {
  if (!LANES.includes(v as Lane)) throw new ApiError(400, `Unknown lane '${v}'`);
  return v as Lane;
}

function parsePair(v: string): PairClass {
  if (!PAIR_CLASSES.includes(v as PairClass)) throw new ApiError(400, `Unknown pair class '${v}'`);
  return v as PairClass;
}

/** Slice in whole tokens (18 decimals). */
function parseSlice(v: string | number): bigint {
  const s = String(v).trim();
  if (!/^\d{1,30}$/.test(s) || s === '0') throw new ApiError(400, 'Slice must be a positive whole number of tokens');
  return BigInt(s) * E18;
}

/** JSON with bigints as strings. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}
