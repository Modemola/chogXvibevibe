import {
  type AllocationSet,
  DEFAULT_SCORING_CONFIG,
  type LaunchContext,
  type ScoringConfig,
  TEMPLATES,
  type TemplateId,
  type WalletFacts,
  resolveAllocation,
} from '@scout/core';
import {
  type Db,
  hubFunders,
  latestSnapshotId,
  listProfileWallets,
  loadEvidenceFacts,
  loadLaunchContext,
  loadPolicyLock,
  loadWalletFacts,
} from '@scout/db';
import { SPARK_BASE } from '@scout/sources';

export async function latestActivity(db: Db): Promise<number> {
  const [row] = await db.query<{ t: string | null }>(
    'SELECT GREATEST((SELECT max(ts) FROM trades), (SELECT max(opted_in_at) FROM profiles)) AS t',
  );
  return row?.t ? Number(row.t) : Math.floor(Date.now() / 1000);
}

export async function configWithHubs(db: Db, minFanout: number | undefined): Promise<ScoringConfig> {
  if (minFanout === undefined) return DEFAULT_SCORING_CONFIG;
  const hubs = await hubFunders(db, minFanout);
  return { ...DEFAULT_SCORING_CONFIG, sybil: { ...DEFAULT_SCORING_CONFIG.sybil, ignoredFunders: hubs.map((h) => h.funder) } };
}

export async function sparkSnapshotFor(db: Db, asOf: number): Promise<string | undefined> {
  // Prefer the real SPARK snapshot; fall back to whatever the simulator wrote.
  const real = await latestSnapshotId(db, SPARK_BASE, asOf);
  if (real) return real;
  const [row] = await db.query<{ id: string }>(
    'SELECT id FROM snapshots WHERE taken_at <= $1 ORDER BY taken_at DESC, id DESC LIMIT 1',
    [asOf],
  );
  return row?.id;
}

export interface ResolveLaunchOptions {
  /** A stored launch, or an ad-hoc launch context (its asOf is ignored). */
  launch: string | Omit<LaunchContext, 'asOf'>;
  /** Only for launches without a locked policy. */
  template?: TemplateId;
  /** Defaults to the launch's graduation, else the latest indexed activity. */
  asOf?: number;
  /** Whole tokens. */
  sliceTokens: bigint;
  ignoreHubsMinFanout?: number;
}

export interface ResolvedLaunch {
  set: AllocationSet;
  launch: LaunchContext;
  facts: WalletFacts[];
  template: TemplateId;
  /** The creator's locked policy hash, when the launch has one. */
  locked?: string;
}

/**
 * Resolves a drop the way the keeper runs it. A launch whose creator locked a policy always
 * resolves with that policy (asking for another template is an error), and a graduated launch
 * resolves as of its graduation.
 */
export async function resolveLaunch(db: Db, opts: ResolveLaunchOptions): Promise<ResolvedLaunch> {
  const launchId = typeof opts.launch === 'string' ? opts.launch : undefined;
  const [graduated] = launchId
    ? await db.query<{ graduated_at: string | null }>('SELECT graduated_at FROM launches WHERE id = $1', [launchId])
    : [];
  const asOf = opts.asOf ?? (graduated?.graduated_at ? Number(graduated.graduated_at) : await latestActivity(db));
  const launch = launchId ? await loadLaunchContext(db, launchId, asOf) : { ...(opts.launch as Omit<LaunchContext, 'asOf'>), asOf };
  if (!launch) throw new Error(`Launch ${launchId} not found`);

  const lock = launchId ? await loadPolicyLock(db, launchId) : undefined;
  if (lock && opts.template) throw new Error(`${launchId} has a locked policy (${lock.policyHash}); drop --template`);
  const template = lock ? (lock.policy as { template: TemplateId }).template : (opts.template ?? 'custom');
  const policy = lock ? lock.policy : TEMPLATES[template].policy;

  const config = await configWithHubs(db, opts.ignoreHubsMinFanout);
  const wallets = await listProfileWallets(db, asOf);
  const snapshot = await sparkSnapshotFor(db, asOf);
  const [facts, [creatorFacts], evidence] = await Promise.all([
    loadWalletFacts(db, { wallets, asOf, sparkSnapshotId: snapshot }),
    loadWalletFacts(db, { wallets: [launch.creator], asOf, sparkSnapshotId: snapshot }),
    loadEvidenceFacts(db, { asOf }),
  ]);
  const set = resolveAllocation({ policy, launch, slice: opts.sliceTokens * 10n ** 18n, wallets: facts, evidence, creatorFacts, config });
  return { set, launch, facts, template, ...(lock ? { locked: lock.policyHash } : {}) };
}
