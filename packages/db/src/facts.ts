import type {
  Address,
  CreatedLaunch,
  DropOutcome,
  Lane,
  LaunchContext,
  PairClass,
  Position,
  WalletFacts,
} from '@scout/core';
import type { Db } from './client.js';
import type { DropWindow } from './records.js';

const num = (v: unknown): number => Number(v);
const optNum = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v));

export interface LoadFactsOptions {
  wallets: readonly Address[];
  /** Nothing after this time is visible. */
  asOf: number;
  /** Balance snapshot to read SPARK from. Omit for zero balances. */
  sparkSnapshotId?: string;
  /** How many early buys to load for sybil detection. */
  earlyBuyCount?: number;
}

function blankFacts(wallet: Address): WalletFacts {
  return { wallet, sparkBalance: 0n, guilds: [], scoutDrops: [], positions: [], createdLaunches: [], earlyBuys: [] };
}

/**
 * Assembles `WalletFacts` for a set of wallets as of a point in time. One
 * query per fact type, all keyed on `wallet = ANY($1)`. Results come back in
 * the order of `opts.wallets`.
 */
export async function loadWalletFacts(db: Db, opts: LoadFactsOptions): Promise<WalletFacts[]> {
  const wallets = [...new Set(opts.wallets.map((w) => w.toLowerCase() as Address))];
  const byWallet = new Map(wallets.map((w) => [w, blankFacts(w)]));
  if (!wallets.length) return [];
  const asOf = opts.asOf;
  const earlyBuyCount = opts.earlyBuyCount ?? 10;
  const get = (w: string) => byWallet.get(w as Address)!;

  // Trades → positions + early buys.
  const trades = await db.query<{
    wallet: string;
    launch_id: string;
    side: 'buy' | 'sell';
    token_amount: string;
    volume_usd: number;
    ts: string;
    lane: Lane;
    pair_class: PairClass;
    graduated_at: string | null;
  }>(
    `SELECT t.wallet, t.launch_id, t.side, t.token_amount::text AS token_amount, t.volume_usd, t.ts,
            l.lane, l.pair_class, l.graduated_at
       FROM trades t JOIN launches l ON l.id = t.launch_id
      WHERE t.wallet = ANY($1::text[]) AND t.ts <= $2
      ORDER BY t.wallet, t.ts, t.tx_hash, t.log_index`,
    [wallets, asOf],
  );
  interface Acc {
    launchId: string;
    lane: Lane;
    pairClass: PairClass;
    graduated: boolean;
    net: bigint;
    volumeUsd: number;
    firstBuyAt?: number;
    lastSellAt?: number;
  }
  const positions = new Map<string, Map<string, Acc>>();
  for (const t of trades) {
    const ts = num(t.ts);
    const perWallet = positions.get(t.wallet) ?? new Map<string, Acc>();
    positions.set(t.wallet, perWallet);
    const graduatedAt = optNum(t.graduated_at);
    const acc: Acc = perWallet.get(t.launch_id) ?? {
      launchId: t.launch_id,
      lane: t.lane,
      pairClass: t.pair_class,
      graduated: graduatedAt !== undefined && graduatedAt <= asOf,
      net: 0n,
      volumeUsd: 0,
    };
    perWallet.set(t.launch_id, acc);
    const amount = BigInt(t.token_amount);
    acc.volumeUsd += num(t.volume_usd);
    if (t.side === 'buy') {
      acc.net += amount;
      acc.firstBuyAt ??= ts;
      const f = get(t.wallet);
      if (f.earlyBuys.length < earlyBuyCount) f.earlyBuys.push({ launchId: t.launch_id, at: ts });
    } else {
      acc.net -= amount;
      acc.lastSellAt = ts;
    }
  }
  for (const [wallet, perWallet] of positions) {
    const f = get(wallet);
    for (const acc of perWallet.values()) {
      if (acc.firstBuyAt === undefined) continue; // only sells: tokens came from elsewhere
      const p: Position = {
        launchId: acc.launchId,
        lane: acc.lane,
        pairClass: acc.pairClass,
        volumeUsd: acc.volumeUsd,
        firstBuyAt: acc.firstBuyAt,
        graduated: acc.graduated,
      };
      if (acc.net <= 0n && acc.lastSellAt !== undefined) p.exitedAt = acc.lastSellAt;
      f.positions.push(p);
    }
  }

  // Launches they created.
  const created = await db.query<{
    id: string;
    creator: string;
    lane: Lane;
    graduated_at: string | null;
    has_product_links: boolean;
    flagged_rug: boolean;
  }>(
    `SELECT id, creator, lane, graduated_at, has_product_links, flagged_rug
       FROM launches WHERE creator = ANY($1::text[]) AND created_at <= $2 ORDER BY created_at, id`,
    [wallets, asOf],
  );
  for (const l of created) {
    const graduatedAt = optNum(l.graduated_at);
    const c: CreatedLaunch = {
      launchId: l.id,
      lane: l.lane,
      graduated: graduatedAt !== undefined && graduatedAt <= asOf,
      hasProductLinks: l.has_product_links,
      flaggedRug: l.flagged_rug,
    };
    get(l.creator).createdLaunches.push(c);
  }

  // First funding.
  const funding = await db.query<{ wallet: string; funder: string; ts: string }>(
    'SELECT wallet, funder, ts FROM wallet_funding WHERE wallet = ANY($1::text[]) AND ts <= $2',
    [wallets, asOf],
  );
  for (const r of funding) get(r.wallet).firstFunding = { funder: r.funder as Address, at: num(r.ts) };

  // Scout drops and outcomes.
  const drops = await db.query<{
    launch_id: string;
    wallet: string;
    amount: string;
    received_at: string;
    window: DropWindow | null;
    sold_bps: number | null;
  }>(
    `SELECT d.launch_id, d.wallet, d.amount::text AS amount, d.received_at, o."window", o.sold_bps
       FROM scout_drops d
       LEFT JOIN drop_outcomes o ON o.launch_id = d.launch_id AND o.wallet = d.wallet
      WHERE d.wallet = ANY($1::text[]) AND d.received_at <= $2
      ORDER BY d.wallet, d.received_at, d.launch_id`,
    [wallets, asOf],
  );
  const dropMap = new Map<string, DropOutcome>();
  for (const r of drops) {
    const key = `${r.wallet}|${r.launch_id}`;
    let d = dropMap.get(key);
    if (!d) {
      d = { launchId: r.launch_id, receivedAt: num(r.received_at), amount: BigInt(r.amount), sold: {} };
      dropMap.set(key, d);
      get(r.wallet).scoutDrops.push(d);
    }
    // Core ignores windows that had not elapsed at asOf, so it is safe to load all.
    if (r.window) d.sold[r.window] = num(r.sold_bps);
  }

  // SPARK balance.
  if (opts.sparkSnapshotId) {
    const balances = await db.query<{ wallet: string; balance: string }>(
      `SELECT wallet, balance::text AS balance FROM snapshot_balances
        WHERE snapshot_id = $1 AND wallet = ANY($2::text[])`,
      [opts.sparkSnapshotId, wallets],
    );
    for (const b of balances) get(b.wallet).sparkBalance = BigInt(b.balance);
  }

  // Vibers: highest level held, most recent charge at or before asOf.
  const vibers = await db.query<{ wallet: string; level: number; last_charged_at: string | null }>(
    'SELECT wallet, level, last_charged_at FROM vibers WHERE wallet = ANY($1::text[])',
    [wallets],
  );
  for (const v of vibers) {
    const f = get(v.wallet);
    const charged = optNum(v.last_charged_at);
    const visibleCharge = charged !== undefined && charged <= asOf ? charged : undefined;
    const cur = f.viber ?? { level: 0 };
    cur.level = Math.max(cur.level, num(v.level));
    if (visibleCharge !== undefined && (cur.lastChargedAt === undefined || visibleCharge > cur.lastChargedAt)) {
      cur.lastChargedAt = visibleCharge;
    }
    f.viber = cur;
  }

  // Chog Genesis on Monad. Only the current reading is kept, so a Chog first seen after asOf does not count.
  const chogs = await db.query<{ wallet: string; tokens: number; chog_balance: string; held_since: string | null }>(
    'SELECT wallet, tokens, chog_balance::text AS chog_balance, held_since FROM chog_status WHERE wallet = ANY($1::text[])',
    [wallets],
  );
  for (const c of chogs) {
    const tokens = num(c.tokens);
    const chogBalance = BigInt(c.chog_balance);
    if (tokens === 0 && chogBalance === 0n) continue;
    const heldSince = optNum(c.held_since);
    get(c.wallet).chog = { tokens, chogBalance, ...(heldSince !== undefined ? { heldSince } : {}) };
  }

  const guilds = await db.query<{ wallet: string; guild_id: string; good_standing: boolean }>(
    'SELECT wallet, guild_id, good_standing FROM guild_members WHERE wallet = ANY($1::text[]) ORDER BY guild_id',
    [wallets],
  );
  for (const g of guilds) get(g.wallet).guilds.push({ id: g.guild_id, goodStanding: g.good_standing });

  const links = await db.query<{ wallet: string; primary_wallet: string }>(
    'SELECT wallet, primary_wallet FROM wallet_links WHERE wallet = ANY($1::text[]) AND linked_at <= $2',
    [wallets, asOf],
  );
  for (const l of links) get(l.wallet).linkedTo = l.primary_wallet as Address;

  return wallets.map((w) => byWallet.get(w)!);
}

/** Wallets that had opted in by `asOf`. */
export async function listProfileWallets(db: Db, asOf: number): Promise<Address[]> {
  const rows = await db.query<{ wallet: string }>(
    'SELECT wallet FROM profiles WHERE opted_in_at <= $1 ORDER BY wallet',
    [asOf],
  );
  return rows.map((r) => r.wallet as Address);
}

/**
 * Sybil evidence: first funding and first buys of every indexed wallet that had not opted in
 * by `asOf`. Only what clustering reads is loaded; everything else stays blank, because
 * these wallets are never scored.
 */
export async function loadEvidenceFacts(db: Db, opts: { asOf: number; earlyBuyCount?: number }): Promise<WalletFacts[]> {
  const asOf = opts.asOf;
  const notOptedIn = 'NOT EXISTS (SELECT 1 FROM profiles p WHERE p.wallet = x.wallet AND p.opted_in_at <= $1)';
  const byWallet = new Map<string, WalletFacts>();
  const get = (w: string) => {
    let f = byWallet.get(w);
    if (!f) byWallet.set(w, (f = blankFacts(w as Address)));
    return f;
  };
  const funding = await db.query<{ wallet: string; funder: string; ts: string }>(
    `SELECT x.wallet, x.funder, x.ts FROM wallet_funding x WHERE x.ts <= $1 AND ${notOptedIn}`,
    [asOf],
  );
  for (const r of funding) get(r.wallet).firstFunding = { funder: r.funder as Address, at: num(r.ts) };
  // Same order and count as loadWalletFacts, so a wallet's early buys look the same either way.
  const buys = await db.query<{ wallet: string; launch_id: string; ts: string }>(
    `SELECT wallet, launch_id, ts FROM (
       SELECT x.wallet, x.launch_id, x.ts,
              row_number() OVER (PARTITION BY x.wallet ORDER BY x.ts, x.tx_hash, x.log_index) AS n
         FROM trades x WHERE x.side = 'buy' AND x.ts <= $1 AND ${notOptedIn}
     ) b WHERE n <= $2 ORDER BY wallet, n`,
    [asOf, opts.earlyBuyCount ?? 10],
  );
  for (const r of buys) get(r.wallet).earlyBuys.push({ launchId: r.launch_id, at: num(r.ts) });
  return [...byWallet.values()].sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0));
}

/** The policy a launch's creator signed and locked, if any. */
export async function loadPolicyLock(db: Db, launchId: string): Promise<{ policyHash: string; policy: unknown; lockedAt: number } | undefined> {
  const [row] = await db.query<{ policy_hash: string; policy: unknown; locked_at: string }>(
    `SELECT pl.policy_hash, p.policy, pl.locked_at FROM policy_locks pl JOIN policies p ON p.hash = pl.policy_hash WHERE pl.launch_id = $1`,
    [launchId],
  );
  if (!row) return undefined;
  return { policyHash: row.policy_hash, policy: typeof row.policy === 'string' ? JSON.parse(row.policy) : row.policy, lockedAt: num(row.locked_at) };
}

/** Latest snapshot of `token` taken at or before `asOf`. */
export async function latestSnapshotId(db: Db, token: Address, asOf: number): Promise<string | undefined> {
  const [row] = await db.query<{ id: string }>(
    'SELECT id FROM snapshots WHERE token = $1 AND taken_at <= $2 ORDER BY taken_at DESC, id DESC LIMIT 1',
    [token.toLowerCase(), asOf],
  );
  return row?.id;
}

export async function loadLaunchContext(db: Db, launchId: string, asOf: number): Promise<LaunchContext | undefined> {
  const [row] = await db.query<{ id: string; lane: Lane; pair_class: PairClass; creator: string }>(
    'SELECT id, lane, pair_class, creator FROM launches WHERE id = $1',
    [launchId],
  );
  if (!row) return undefined;
  return { launchId: row.id, lane: row.lane, pairClass: row.pair_class, creator: row.creator as Address, asOf };
}

/**
 * Funders that funded at least `minFanout` wallets: exchange hot wallets,
 * bridges, faucets. Candidates for `sybil.ignoredFunders`; an operator should
 * review the list, because a large farm master also has a big fanout.
 */
export async function hubFunders(db: Db, minFanout: number): Promise<{ funder: Address; fanout: number }[]> {
  const rows = await db.query<{ funder: string; fanout: number }>(
    `SELECT funder, count(*)::int AS fanout FROM wallet_funding
      GROUP BY funder HAVING count(*) >= $1 ORDER BY fanout DESC, funder`,
    [minFanout],
  );
  return rows.map((r) => ({ funder: r.funder as Address, fanout: Number(r.fanout) }));
}

export async function loadSimLabels(db: Db): Promise<Map<Address, { persona: string; farmId?: string }>> {
  const rows = await db.query<{ wallet: string; persona: string; farm_id: string | null }>(
    'SELECT wallet, persona, farm_id FROM sim_labels',
  );
  return new Map(
    rows.map((r) => [r.wallet as Address, r.farm_id ? { persona: r.persona, farmId: r.farm_id } : { persona: r.persona }]),
  );
}
