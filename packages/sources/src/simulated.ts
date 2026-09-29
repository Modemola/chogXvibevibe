import type { Address, Lane, PairClass } from '@scout/core';
import type {
  DropOutcomeRecord,
  DropWindow,
  FundingRecord,
  LaunchRecord,
  ProfileRecord,
  RecordBatch,
  ScoutDropRecord,
  TradeRecord,
  WalletLinkRecord,
} from '@scout/db';

/**
 * A deterministic, simulated vibe/vibe world.
 *
 * It exists so every other part of Scout can be built and demoed before the
 * real testnet contracts are reachable, and so the scoring model can be
 * evaluated against ground truth: every wallet has a known persona, and the
 * sybil farms are known.
 *
 * Nothing here claims to match real vibe/vibe numbers. It is a plausible
 * world with the behaviours Scout has to tell apart.
 */

export const PERSONAS = [
  'diamond',
  'trencher',
  'dumper',
  'builder',
  'stock_native',
  'whale',
  'newbie',
  'rugger',
  'farm',
] as const;
export type Persona = (typeof PERSONAS)[number];

export type FarmStyle = 'naive' | 'split_funding' | 'staggered';

export interface SimOptions {
  seed?: number;
  wallets?: number;
  launches?: number;
  farms?: number;
  /** End of the simulated period; also the default asOf for scoring. */
  asOf?: number;
  days?: number;
  optInRate?: number;
}

export interface SimWorld {
  batch: RecordBatch;
  asOf: number;
  sparkToken: Address;
  sparkSnapshotId: string;
  /** Exchange hot wallets that fund many unrelated users. Put these in `ignoredFunders`. */
  cexFunders: Address[];
  personas: Map<Address, Persona>;
  farms: { id: string; style: FarmStyle; members: Address[] }[];
}

const DAY = 86_400;
const HOUR = 3_600;
const E18 = 10n ** 18n;

export const SIM_DEFAULTS = {
  seed: 42,
  wallets: 400,
  launches: 80,
  farms: 4,
  asOf: 1_790_000_000,
  days: 90,
  optInRate: 0.85,
} as const;

const PERSONA_WEIGHTS: [Persona, number][] = [
  ['diamond', 0.18],
  ['trencher', 0.24],
  ['dumper', 0.14],
  ['builder', 0.07],
  ['stock_native', 0.1],
  ['whale', 0.04],
  ['newbie', 0.2],
  ['rugger', 0.03],
];

/** Behaviour table. Ranges are [min, max]. */
const BEHAVIOUR: Record<
  Persona,
  {
    trades: [number, number];
    holdDays: [number, number];
    /** Max 1h sell fraction, then max fraction of the remainder sold in each later window. */
    drop: [number, number, number, number];
    dropFloor1h?: number;
  }
> = {
  diamond: { trades: [4, 10], holdDays: [10, 60], drop: [0.02, 0.05, 0.1, 0.15] },
  builder: { trades: [3, 8], holdDays: [7, 45], drop: [0.02, 0.05, 0.1, 0.15] },
  stock_native: { trades: [6, 14], holdDays: [5, 30], drop: [0.08, 0.15, 0.2, 0.2] },
  trencher: { trades: [12, 30], holdDays: [0.5, 10], drop: [0.3, 0.3, 0.3, 0.3] },
  newbie: { trades: [0, 3], holdDays: [1, 30], drop: [0.15, 0.2, 0.3, 0.3] },
  whale: { trades: [3, 8], holdDays: [1, 20], drop: [0.7, 0.3, 0.3, 0.3], dropFloor1h: 0.2 },
  dumper: { trades: [8, 20], holdDays: [0.02, 1], drop: [1, 1, 1, 1], dropFloor1h: 0.7 },
  rugger: { trades: [2, 6], holdDays: [0.1, 3], drop: [1, 1, 1, 1], dropFloor1h: 0.7 },
  farm: { trades: [10, 10], holdDays: [0.02, 0.5], drop: [1, 1, 1, 1], dropFloor1h: 0.9 },
};

const WINDOW_SECONDS: [DropWindow, number][] = [
  ['h1', HOUR],
  ['h24', DAY],
  ['d7', 7 * DAY],
  ['d30', 30 * DAY],
];

class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }
  float(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  int(lo: number, hi: number): number {
    return Math.floor(this.float(lo, hi + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  weighted<T>(items: readonly [T, number][]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let x = this.next() * total;
    for (const [item, w] of items) {
      x -= w;
      if (x < 0) return item;
    }
    return items[items.length - 1]![0];
  }
  sample<T>(xs: readonly T[], n: number): T[] {
    const copy = [...xs];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy.slice(0, n);
  }
  address(): Address {
    let hex = '';
    for (let i = 0; i < 5; i++) hex += Math.floor(this.next() * 2 ** 32).toString(16).padStart(8, '0');
    return `0x${hex}` as Address;
  }
  whole(lo: number, hi: number): bigint {
    return BigInt(this.int(lo, hi)) * E18;
  }
}

interface SimWallet {
  wallet: Address;
  persona: Persona;
  farmId?: string;
  linkedTo?: Address;
}

export function simulateWorld(options: SimOptions = {}): SimWorld {
  const o = { ...SIM_DEFAULTS, ...options };
  const r = new Rng(o.seed);
  const asOf = o.asOf;
  const start = asOf - o.days * DAY;

  const cexFunders = [r.address(), r.address(), r.address()];
  const sparkToken = r.address();

  // --- Wallets ---------------------------------------------------------------
  const wallets: SimWallet[] = [];
  for (let i = 0; i < o.wallets; i++) wallets.push({ wallet: r.address(), persona: r.weighted(PERSONA_WEIGHTS) });

  // Some careful users declare an alt.
  for (const w of [...wallets]) {
    if ((w.persona === 'diamond' || w.persona === 'builder') && r.chance(0.08)) {
      wallets.push({ wallet: r.address(), persona: w.persona, linkedTo: w.wallet });
    }
  }

  const styles: FarmStyle[] = ['naive', 'split_funding', 'staggered'];
  const farms: SimWorld['farms'] = [];
  for (let f = 0; f < o.farms; f++) {
    const style = styles[f] ?? 'naive';
    const members: Address[] = [];
    for (let i = 0, n = r.int(6, 12); i < n; i++) {
      const w = r.address();
      members.push(w);
      wallets.push({ wallet: w, persona: 'farm', farmId: `${style}-${f}` });
    }
    farms.push({ id: `${style}-${f}`, style, members });
  }
  const byAddress = new Map(wallets.map((w) => [w.wallet, w]));
  const farmStyle = new Map(farms.map((f) => [f.id, f.style]));

  // --- Funding -----------------------------------------------------------------
  const funding: FundingRecord[] = [];
  for (const w of wallets) {
    if (w.persona === 'farm') continue;
    if (w.linkedTo) {
      funding.push({ wallet: w.wallet, funder: w.linkedTo, ts: Math.floor(r.float(start - 20 * DAY, start)) });
    } else if (r.chance(0.75)) {
      funding.push({ wallet: w.wallet, funder: r.pick(cexFunders), ts: Math.floor(r.float(start - 30 * DAY, start + o.days * DAY * 0.5)) });
    } else {
      funding.push({ wallet: w.wallet, funder: r.address(), ts: Math.floor(r.float(start - 30 * DAY, start)) });
    }
  }
  for (const farm of farms) {
    const master = r.address();
    let t = Math.floor(r.float(start - 10 * DAY, start));
    for (const m of farm.members) {
      if (farm.style === 'naive') {
        t += r.int(30, 300);
        funding.push({ wallet: m, funder: master, ts: t });
      } else {
        funding.push({ wallet: m, funder: r.address(), ts: Math.floor(r.float(start - 30 * DAY, start)) });
      }
    }
  }

  // --- Launches ----------------------------------------------------------------
  const substanceLanes: Lane[] = ['utility', 'rwa', 'vibecoded'];
  const launches: LaunchRecord[] = [];
  const newLaunch = (creator: Address, lane: Lane, links: boolean, rug: boolean) => {
    const pairClass: PairClass = r.weighted<PairClass>(
      lane === 'rwa'
        ? [['stock', 0.6], ['eth', 0.35], ['other', 0.05]]
        : [['stock', 0.35], ['eth', 0.55], ['other', 0.1]],
    );
    const createdAt = Math.floor(r.float(start, asOf - 2 * DAY));
    const gradP = rug ? 0.15 : substanceLanes.includes(lane) && links ? 0.7 : lane === 'art' ? 0.3 : 0.35;
    const graduatedAt = r.chance(gradP) ? createdAt + r.int(HOUR, 72 * HOUR) : undefined;
    const launch: LaunchRecord = {
      id: `sim-${launches.length.toString().padStart(4, '0')}`,
      token: r.address(),
      creator,
      lane,
      pairClass,
      taxBps: r.pick([100, 200, 300]),
      createdAt,
      hasProductLinks: links,
      flaggedRug: rug,
    };
    if (graduatedAt !== undefined && graduatedAt <= asOf) launch.graduatedAt = graduatedAt;
    launches.push(launch);
  };
  for (const w of wallets) {
    if (w.persona === 'builder' && !w.linkedTo) {
      for (let i = 0, n = r.int(1, 3); i < n; i++) newLaunch(w.wallet, r.pick(substanceLanes), r.chance(0.85), false);
    } else if (w.persona === 'rugger') {
      for (let i = 0, n = r.int(1, 2); i < n; i++) newLaunch(w.wallet, r.pick<Lane>(['meme', 'art']), false, r.chance(0.7));
    } else if (w.persona === 'trencher' && r.chance(0.15)) {
      newLaunch(w.wallet, 'meme', false, false);
    }
  }
  const trenchers = wallets.filter((w) => w.persona === 'trencher');
  while (launches.length < o.launches && trenchers.length) newLaunch(r.pick(trenchers).wallet, r.pick<Lane>(['meme', 'art']), false, false);
  launches.length = Math.min(launches.length, Math.max(o.launches, 1));
  launches.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  // --- Trades --------------------------------------------------------------------
  const trades: TradeRecord[] = [];
  let txCounter = 0;
  const txHash = () => `0x${(++txCounter).toString(16).padStart(64, '0')}` as `0x${string}`;
  const trade = (launch: LaunchRecord, wallet: Address, buyAt: number, holdDays: number, volume: number) => {
    if (buyAt > asOf) return;
    const amount = r.whole(1_000, 1_000_000);
    trades.push({ txHash: txHash(), logIndex: 0, launchId: launch.id, wallet, side: 'buy', tokenAmount: amount, volumeUsd: volume, ts: buyAt });
    const sellAt = buyAt + Math.floor(holdDays * DAY);
    if (sellAt <= asOf) {
      const partial = r.chance(0.1);
      trades.push({
        txHash: txHash(),
        logIndex: 0,
        launchId: launch.id,
        wallet,
        side: 'sell',
        tokenAmount: partial ? amount / 2n : amount,
        volumeUsd: volume * r.float(0.3, 3),
        ts: sellAt,
      });
    }
  };

  const stockLaunches = launches.filter((l) => l.pairClass === 'stock');
  const substanceLaunches = launches.filter((l) => substanceLanes.includes(l.lane));
  for (const w of wallets) {
    if (w.persona === 'farm') continue;
    const b = BEHAVIOUR[w.persona];
    const n = r.int(b.trades[0], b.trades[1]);
    const chosen = new Set<LaunchRecord>();
    for (let i = 0; i < n * 3 && chosen.size < Math.min(n, launches.length); i++) {
      let pool: LaunchRecord[] = launches;
      if (w.persona === 'stock_native' && stockLaunches.length && r.chance(0.8)) pool = stockLaunches;
      else if (w.persona === 'builder' && substanceLaunches.length && r.chance(0.7)) pool = substanceLaunches;
      else if (w.persona === 'diamond' && substanceLaunches.length && r.chance(0.5)) pool = substanceLaunches;
      chosen.add(r.pick(pool));
    }
    for (const l of chosen) {
      const buyAt = l.createdAt + Math.floor(r.next() ** 2 * 5 * DAY);
      const volume = r.float(20, 2_000) * (w.persona === 'whale' ? 10 : 1);
      trade(l, w.wallet, buyAt, r.float(b.holdDays[0], b.holdDays[1]), volume);
    }
  }

  for (const farm of farms) {
    const script = r
      .sample(launches.filter((l) => l.createdAt < asOf - 3 * DAY), 10)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((l) => ({ launch: l, at: l.createdAt + r.int(60, 2 * HOUR) }));
    for (const m of farm.members) {
      const own = farm.style === 'staggered' ? r.sample(script, 6) : script;
      for (const s of own) {
        const jitter = farm.style === 'staggered' ? r.int(0, 6 * HOUR) : r.int(0, 60);
        trade(s.launch, m, s.at + jitter, r.float(0.02, 0.5), r.float(20, 200));
      }
    }
  }
  trades.sort((a, b) => a.ts - b.ts || a.txHash.localeCompare(b.txHash));

  // --- Profiles --------------------------------------------------------------------
  const profiles: ProfileRecord[] = [];
  const optedInAt = new Map<Address, number>();
  for (const w of wallets) {
    if (w.persona !== 'farm' && !w.linkedTo && !r.chance(o.optInRate)) continue;
    const at = Math.floor(r.float(start, asOf - DAY));
    optedInAt.set(w.wallet, at);
    profiles.push({ wallet: w.wallet, optedInAt: at, message: null, signature: null });
  }
  const links: WalletLinkRecord[] = wallets
    .filter((w) => w.linkedTo && optedInAt.has(w.wallet))
    .map((w) => ({ wallet: w.wallet, primaryWallet: w.linkedTo!, linkedAt: optedInAt.get(w.wallet)!, signature: null }));

  // --- Scout drops ------------------------------------------------------------------
  const scoutDrops: ScoutDropRecord[] = [];
  const dropOutcomes: DropOutcomeRecord[] = [];
  for (const l of launches) {
    if (l.graduatedAt === undefined || l.graduatedAt > asOf - HOUR || !r.chance(0.55)) continue;
    const receivedAt = l.graduatedAt + 60;
    const eligible = [...optedInAt.entries()]
      .filter(([w, at]) => at <= receivedAt && w !== l.creator)
      .map(([w]) => w)
      .sort();
    for (const w of r.sample(eligible, r.int(15, 50))) {
      scoutDrops.push({ launchId: l.id, wallet: w, amount: r.whole(1_000, 50_000), receivedAt });
      const b = BEHAVIOUR[byAddress.get(w)!.persona];
      let sold = 0;
      WINDOW_SECONDS.forEach(([window, len], i) => {
        const maxStep = b.drop[i]!;
        if (i === 0) sold = Math.max(b.dropFloor1h ?? 0, r.float(0, maxStep));
        else sold = Math.min(1, sold + (1 - sold) * r.float(0, maxStep));
        if (receivedAt + len <= asOf) {
          dropOutcomes.push({ launchId: l.id, wallet: w, window, soldBps: Math.round(Math.min(1, sold) * 10_000) });
        }
      });
    }
  }

  // --- SPARK snapshot ------------------------------------------------------------------
  const sparkBalances: { wallet: Address; balance: bigint }[] = [];
  for (const w of wallets) {
    let bal = 0n;
    const p = w.persona;
    if (p === 'whale') bal = r.whole(1_000_000, 5_000_000);
    else if (p === 'diamond' && r.chance(0.45)) bal = r.whole(50_000, 400_000);
    else if (p === 'builder' && r.chance(0.3)) bal = r.whole(10_000, 250_000);
    else if (p === 'dumper' && r.chance(0.3)) bal = r.whole(1_000, 300_000);
    else if (p === 'stock_native' && r.chance(0.25)) bal = r.whole(1_000, 150_000);
    else if (p === 'trencher' && r.chance(0.2)) bal = r.whole(1_000, 120_000);
    else if (p === 'newbie' && r.chance(0.05)) bal = r.whole(1_000, 60_000);
    else if (p === 'farm' && farmStyle.get(w.farmId!) !== 'staggered') bal = r.whole(50_000, 60_000);
    if (bal > 0n) sparkBalances.push({ wallet: w.wallet, balance: bal });
  }
  for (let i = 0; i < 200; i++) sparkBalances.push({ wallet: r.address(), balance: r.whole(1, 500_000) });
  const sparkSnapshotId = `sim-spark-${o.seed}`;

  // --- Vibers and guilds ------------------------------------------------------------------
  const vibers: NonNullable<RecordBatch['vibers']> = [];
  const guildMembers: NonNullable<RecordBatch['guildMembers']> = [];
  const guilds = ['alpha', 'forge', 'trench', 'stockers'];
  let tokenId = 0;
  for (const w of wallets) {
    if (w.persona === 'farm') continue;
    const p = w.persona === 'diamond' || w.persona === 'builder' ? 0.35 : 0.15;
    if (r.chance(p)) {
      const v: (typeof vibers)[number] = { tokenId: `${++tokenId}`, wallet: w.wallet, level: r.int(1, 10) };
      if (r.chance(0.7)) v.lastChargedAt = asOf - r.int(0, 29 * DAY);
      else if (r.chance(0.5)) v.lastChargedAt = asOf - r.int(31 * DAY, 80 * DAY);
      vibers.push(v);
    }
    if (r.chance(0.3)) guildMembers.push({ guildId: r.pick(guilds), wallet: w.wallet, goodStanding: r.chance(0.9) });
  }

  const batch: RecordBatch = {
    launches,
    trades,
    funding,
    scoutDrops,
    dropOutcomes,
    snapshots: [
      {
        id: sparkSnapshotId,
        token: sparkToken,
        chain: 'sim',
        block: 30_000_000n,
        takenAt: asOf - DAY,
        balances: sparkBalances.sort((a, b) => (a.wallet < b.wallet ? -1 : 1)),
      },
    ],
    vibers,
    guildMembers,
    profiles,
    links,
    simLabels: wallets.map((w) => (w.farmId ? { wallet: w.wallet, persona: w.persona, farmId: w.farmId } : { wallet: w.wallet, persona: w.persona })),
  };

  return {
    batch,
    asOf,
    sparkToken,
    sparkSnapshotId,
    cexFunders,
    personas: new Map(wallets.map((w) => [w.wallet, w.persona])),
    farms,
  };
}
