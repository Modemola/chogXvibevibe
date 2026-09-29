import type { Address, DropOutcome, LaunchContext, Position, WalletFacts } from '../src/index.js';

export const T0 = 1_790_000_000; // fixed "now" for deterministic tests
export const HOUR = 3_600;
export const DAY = 86_400;
export const SPARK = 10n ** 18n;

export function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address;
}

export function wallet(n: number, over: Partial<WalletFacts> = {}): WalletFacts {
  return {
    wallet: addr(n),
    sparkBalance: 0n,
    guilds: [],
    scoutDrops: [],
    positions: [],
    createdLaunches: [],
    earlyBuys: [],
    ...over,
  };
}

/** A fully observed drop `daysAgo` days before T0. `sold1h` etc. are fractions. */
export function drop(daysAgo: number, sold1h: number, sold24h = sold1h, sold7d = sold24h, sold30d = sold7d): DropOutcome {
  return {
    launchId: `drop-${daysAgo}-${sold1h}`,
    receivedAt: T0 - daysAgo * DAY,
    amount: 1_000n * SPARK,
    sold: {
      h1: Math.round(sold1h * 10_000),
      h24: Math.round(sold24h * 10_000),
      d7: Math.round(sold7d * 10_000),
      d30: Math.round(sold30d * 10_000),
    },
  };
}

export function position(over: Partial<Position> = {}): Position {
  return {
    launchId: 'L-x',
    lane: 'meme',
    pairClass: 'eth',
    volumeUsd: 100,
    firstBuyAt: T0 - 30 * DAY,
    graduated: true,
    ...over,
  };
}

export const CREATOR = addr(0xc0ffee);

export function launch(over: Partial<LaunchContext> = {}): LaunchContext {
  return { launchId: 'L-test', lane: 'utility', pairClass: 'stock', creator: CREATOR, asOf: T0, ...over };
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
