import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from './config.js';
import { type WalletFields, computeFields } from './fields.js';
import { evaluateFilter } from './filter.js';
import { type FillCandidate, waterFill } from './fill.js';
import { merkleRoot } from './merkle.js';
import { type CompiledBucket, type Policy, compilePolicy, policyHash } from './policy.js';
import { scoreWallet } from './score.js';
import { type ClusterInfo, clusterWallets, singletonCluster } from './sybil.js';
import { resolveWeights } from './templates.js';
import type { Address, LaunchContext, Reason, ScoreWeights, WalletFacts } from './types.js';
import { compareAddress, hashJson, normalizeAddress } from './util.js';

export interface ResolveInput {
  /** Raw policy JSON (validated here) or an already compiled policy. */
  policy: unknown;
  launch: LaunchContext;
  /** Tokens reserved for the graduation airdrop, in raw units. */
  slice: bigint;
  /** Opted-in Scout profiles. */
  wallets: readonly WalletFacts[];
  /** The creator's own facts, if known. Improves creator-cluster detection. */
  creatorFacts?: WalletFacts;
  config?: ScoringConfig;
}

export interface Recipient {
  wallet: Address;
  amount: bigint;
  score: number;
  clusterId: Address;
  buckets: { id: string; amount: bigint }[];
  reasons: Reason[];
}

export interface BucketResult {
  id: string;
  target: bigint;
  carriedIn: bigint;
  allocated: bigint;
  carriedOut: bigint;
  candidates: number;
  recipients: number;
}

export type ExclusionRule = 'creator_cluster' | 'min_score' | `exclude:${number}`;

export interface Exclusion {
  wallet: Address;
  rule: ExclusionRule;
}

export interface AllocationSet {
  launchId: string;
  asOf: number;
  template: Policy['template'];
  policyHash: `0x${string}`;
  scoringVersion: string;
  configHash: `0x${string}`;
  weights: ScoreWeights;
  slice: bigint;
  allocated: bigint;
  /** Returned to the launch (burn/LP per the pad's rules). Never routed to the creator. */
  unallocated: bigint;
  merkleRoot: `0x${string}` | null;
  recipients: Recipient[];
  buckets: BucketResult[];
  excluded: Exclusion[];
  warnings: string[];
}

interface Candidate {
  facts: WalletFacts;
  cluster: ClusterInfo;
  score: number;
  reasons: Reason[];
  fields: WalletFields;
}

export function emptyFacts(wallet: Address): WalletFacts {
  return { wallet, sparkBalance: 0n, guilds: [], scoutDrops: [], positions: [], createdLaunches: [], earlyBuys: [] };
}

function scoreWeight(score: number): bigint {
  return BigInt(Math.max(0, Math.round(score * 1e9)));
}

/**
 * Turns (policy × opted-in profiles × launch) into an Allocation Set.
 *
 * Deterministic: same inputs, same asOf, same config → byte-identical output.
 */
export function resolveAllocation(input: ResolveInput): AllocationSet {
  const config = input.config ?? DEFAULT_SCORING_CONFIG;
  const policy = compilePolicy(input.policy);
  const weights = resolveWeights(policy.template, policy.weights);
  const launch: LaunchContext = { ...input.launch, creator: normalizeAddress(input.launch.creator) };
  if (input.slice < 0n) throw new Error('slice must be >= 0');

  // Profiles, plus allowlisted wallets that never opted in (the creator's own community).
  const facts = new Map<Address, WalletFacts>();
  for (const f of input.wallets) {
    const wallet = normalizeAddress(f.wallet);
    if (facts.has(wallet)) throw new Error(`Duplicate wallet facts for ${wallet}`);
    facts.set(wallet, { ...f, wallet });
  }
  const optedIn = new Set(facts.keys());
  for (const b of policy.buckets) {
    for (const w of b.allowlist ?? []) if (!facts.has(w)) facts.set(w, emptyFacts(w));
  }
  const creatorFacts = input.creatorFacts
    ? { ...input.creatorFacts, wallet: normalizeAddress(input.creatorFacts.wallet) }
    : (facts.get(launch.creator) ?? emptyFacts(launch.creator));
  if (creatorFacts.wallet !== launch.creator) throw new Error('creatorFacts.wallet must equal launch.creator');

  const clusters = clusterWallets([...facts.values(), ...(facts.has(launch.creator) ? [] : [creatorFacts])], config);
  const creatorCluster = (clusters.get(launch.creator) ?? singletonCluster(launch.creator)).clusterId;

  // Score, then apply exclusions.
  const excluded: Exclusion[] = [];
  const eligible: Candidate[] = [];
  const sortedWallets = [...facts.keys()].sort(compareAddress);
  for (const wallet of sortedWallets) {
    const f = facts.get(wallet)!;
    const cluster = clusters.get(wallet) ?? singletonCluster(wallet);
    const inCreatorCluster = cluster.clusterId === creatorCluster;
    const scored = scoreWallet(f, launch, cluster, weights, config);
    const fields = computeFields(f, scored, cluster, launch, inCreatorCluster, config);

    if (inCreatorCluster) {
      excluded.push({ wallet, rule: 'creator_cluster' });
      continue;
    }
    const hit = policy.excludes.findIndex((e) => evaluateFilter(e, fields));
    if (hit >= 0) {
      excluded.push({ wallet, rule: `exclude:${hit}` });
      continue;
    }
    if (policy.minScore !== undefined && scored.score < policy.minScore) {
      excluded.push({ wallet, rule: 'min_score' });
      continue;
    }
    eligible.push({ facts: f, cluster, score: scored.score, reasons: scored.reasons, fields });
  }
  eligible.sort((a, b) => b.score - a.score || compareAddress(a.facts.wallet, b.facts.wallet));

  // Caps are global across buckets.
  const walletCap = (input.slice * BigInt(policy.caps.perWalletBps)) / 10_000n;
  const clusterCap = (input.slice * BigInt(policy.caps.perClusterBps)) / 10_000n;
  const walletRoom = new Map<Address, bigint>();
  const clusterRoom = new Map<Address, bigint>();
  for (const c of eligible) {
    walletRoom.set(c.facts.wallet, walletCap);
    clusterRoom.set(c.cluster.clusterId, clusterCap);
  }

  const bucketCandidates = (b: CompiledBucket): Candidate[] => {
    const allow = b.allowlist ? new Set(b.allowlist) : undefined;
    return eligible
      // Allowlisted wallets that never opted in only count for their own bucket.
      .filter((c) => (allow ? allow.has(c.facts.wallet) : optedIn.has(c.facts.wallet)))
      .filter((c) => (b.filter ? evaluateFilter(b.filter, c.fields) : true))
      .filter((c) => (b.minScore !== undefined ? c.score >= b.minScore : true))
      .filter((c) => (b.distribution === 'score' ? c.score > 0 : true))
      .slice(0, b.maxRecipients);
  };
  const toFill = (b: CompiledBucket, list: Candidate[]): FillCandidate[] =>
    list.map((c) => ({
      wallet: c.facts.wallet,
      cluster: c.cluster.clusterId,
      weight: b.distribution === 'equal' ? 1n : scoreWeight(c.score),
    }));

  const grants = new Map<Address, Map<string, bigint>>();
  const record = (bucketId: string, g: Map<Address, bigint>) => {
    for (const [wallet, amount] of g) {
      const perBucket = grants.get(wallet) ?? new Map<string, bigint>();
      perBucket.set(bucketId, (perBucket.get(bucketId) ?? 0n) + amount);
      grants.set(wallet, perBucket);
    }
  };

  // Bucket targets sum exactly to the slice: the last bucket absorbs rounding.
  const targets = policy.buckets.map((b) => (input.slice * BigInt(b.weightBps)) / 10_000n);
  const roundingDust = input.slice - targets.reduce((s, t) => s + t, 0n);
  targets[targets.length - 1]! += roundingDust;

  const warnings: string[] = [];
  const bucketResults: BucketResult[] = [];
  const candidatesById = new Map<string, Candidate[]>();
  let carry = 0n;
  policy.buckets.forEach((b, i) => {
    const list = bucketCandidates(b);
    candidatesById.set(b.id, list);
    const amount = targets[i]! + carry;
    const { grants: g, leftover } = waterFill(amount, toFill(b, list), walletRoom, clusterRoom);
    record(b.id, g);
    if (!list.length) warnings.push(`EMPTY_BUCKET: '${b.id}' matched no eligible wallets`);
    bucketResults.push({
      id: b.id,
      target: targets[i]!,
      carriedIn: carry,
      allocated: amount - leftover,
      carriedOut: leftover,
      candidates: list.length,
      recipients: g.size,
    });
    carry = leftover;
  });

  if (carry > 0n && policy.fallbackBucket !== undefined) {
    const b = policy.buckets.find((x) => x.id === policy.fallbackBucket)!;
    const { grants: g, leftover } = waterFill(carry, toFill(b, candidatesById.get(b.id)!), walletRoom, clusterRoom);
    record(b.id, g);
    const result = bucketResults.find((r) => r.id === b.id)!;
    result.allocated += carry - leftover;
    result.recipients = [...grants.values()].filter((m) => m.has(b.id)).length;
    carry = leftover;
  }

  const byWallet = new Map(eligible.map((c) => [c.facts.wallet, c]));
  const recipients: Recipient[] = [...grants.entries()]
    .map(([wallet, perBucket]) => {
      const c = byWallet.get(wallet)!;
      const buckets = policy.buckets
        .filter((b) => perBucket.has(b.id))
        .map((b) => ({ id: b.id, amount: perBucket.get(b.id)! }));
      return {
        wallet,
        amount: buckets.reduce((s, b) => s + b.amount, 0n),
        score: c.score,
        clusterId: c.cluster.clusterId,
        buckets,
        reasons: c.reasons,
      };
    })
    .filter((r) => r.amount > 0n)
    .sort(
      (a, b) =>
        (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0) ||
        b.score - a.score ||
        compareAddress(a.wallet, b.wallet),
    );

  const allocated = recipients.reduce((s, r) => s + r.amount, 0n);
  const unallocated = input.slice - allocated;

  // Warnings the creator and operator should see before locking.
  const allowlisted = new Set(policy.buckets.flatMap((b) => b.allowlist ?? []));
  const creatorAllowlisted = excluded.filter((e) => e.rule === 'creator_cluster' && allowlisted.has(e.wallet));
  if (creatorAllowlisted.length) {
    warnings.push(
      `ALLOWLIST_CREATOR_CLUSTER: ${creatorAllowlisted.length} allowlisted wallet(s) are in the creator's cluster and were excluded`,
    );
  }
  const manualBps = policy.buckets.filter((b) => b.allowlist).reduce((s, b) => s + b.weightBps, 0);
  if (manualBps > 5_000) {
    warnings.push(`MANUAL_HEAVY: ${manualBps / 100}% of the slice goes to hand-picked allowlists`);
  }
  if (unallocated > 0n) {
    const bps = input.slice > 0n ? Number((unallocated * 10_000n) / input.slice) : 0;
    warnings.push(`UNALLOCATED: ${unallocated} (${bps / 100}%) could not be placed under the caps; returned to the launch`);
  }

  return {
    launchId: launch.launchId,
    asOf: launch.asOf,
    template: policy.template,
    policyHash: policyHash(policy),
    scoringVersion: config.version,
    configHash: hashJson(config),
    weights,
    slice: input.slice,
    allocated,
    unallocated,
    merkleRoot: merkleRoot(recipients),
    recipients,
    buckets: bucketResults,
    excluded,
    warnings,
  };
}

export type Preview = AllocationSet & { totalRecipients: number };

/** Same as resolve, trimmed to the top N recipients for the create-token UI. */
export function previewAllocation(input: ResolveInput, topN = 50): Preview {
  const full = resolveAllocation(input);
  return { ...full, recipients: full.recipients.slice(0, topN), totalRecipients: full.recipients.length };
}
