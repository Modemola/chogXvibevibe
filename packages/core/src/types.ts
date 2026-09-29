/**
 * Shared data shapes for the Scout engine.
 *
 * Everything in @scout/core is pure: callers (the indexer, the API) assemble
 * `WalletFacts` from whatever data source is live and hand them in. The engine
 * never touches a chain, a database or the clock.
 */

/** Lowercased 0x-prefixed 20-byte hex address. Use `normalizeAddress` to produce one. */
export type Address = `0x${string}`;

/** Unix time in seconds. */
export type Timestamp = number;

/** Basis points: 10_000 = 100%. */
export type Bps = number;

/** vibe/vibe launch lanes. `utility`, `rwa` and `vibecoded` are the "substance" lanes. */
export type Lane = 'meme' | 'art' | 'utility' | 'rwa' | 'vibecoded';

/** What the launched token is paired against. */
export type PairClass = 'eth' | 'stock' | 'other';

export const LANES: readonly Lane[] = ['meme', 'art', 'utility', 'rwa', 'vibecoded'];
export const PAIR_CLASSES: readonly PairClass[] = ['eth', 'stock', 'other'];

/**
 * Fraction of a Scout airdrop the recipient had sold (or moved out) by the end
 * of each window, in bps of the amount received. A window that has not
 * elapsed yet is left undefined.
 */
export interface SoldByWindow {
  h1?: Bps;
  h24?: Bps;
  d7?: Bps;
  d30?: Bps;
}

/** A Scout graduation airdrop this wallet received, plus what it did afterwards. */
export interface DropOutcome {
  launchId: string;
  receivedAt: Timestamp;
  amount: bigint;
  sold: SoldByWindow;
}

/** A trading position on a vibe/vibe launch (non-airdrop exposure). */
export interface Position {
  launchId: string;
  lane: Lane;
  pairClass: PairClass;
  /** Total traded volume in USD (buys + sells). Used only as a weight. */
  volumeUsd: number;
  firstBuyAt: Timestamp;
  /** When the position was fully exited. Undefined = still holding. */
  exitedAt?: Timestamp;
  graduated: boolean;
}

/** A launch this wallet created. */
export interface CreatedLaunch {
  launchId: string;
  lane: Lane;
  graduated: boolean;
  /** Has a live product link / repo attached to the launch page. */
  hasProductLinks: boolean;
  /** Operator-flagged rug / abandoned page. */
  flaggedRug: boolean;
}

export interface ViberStatus {
  level: number;
  /** Last time the NFT was "charged" by launchpad activity. */
  lastChargedAt?: Timestamp;
}

export interface GuildMembership {
  id: string;
  goodStanding: boolean;
}

/**
 * Everything the engine knows about one wallet, assembled by the data layer.
 * Arrays may be empty; a brand-new wallet is a valid input.
 */
export interface WalletFacts {
  wallet: Address;
  /** Raw SPARK balance (18 decimals) at the snapshot the caller chose. */
  sparkBalance: bigint;
  viber?: ViberStatus;
  guilds: GuildMembership[];
  scoutDrops: DropOutcome[];
  positions: Position[];
  createdLaunches: CreatedLaunch[];
  /** First inbound native-token transfer that funded this wallet. */
  firstFunding?: { funder: Address; at: Timestamp };
  /** First few buys on vibe/vibe, oldest first. Used for sybil detection. */
  earlyBuys: { launchId: string; at: Timestamp }[];
  /**
   * Primary wallet this one was linked to by a verified signature
   * ("B is owned by A"). The data layer verifies the signature.
   */
  linkedTo?: Address;
}

/** The launch Scout is resolving an airdrop for. */
export interface LaunchContext {
  launchId: string;
  lane: Lane;
  pairClass: PairClass;
  creator: Address;
  /** Scores are computed as of this time. Makes resolution deterministic. */
  asOf: Timestamp;
}

/** One line of the "why" behind a score. */
export interface Reason {
  code: string;
  /** Signed contribution to the final score S(w, L). */
  contrib: number;
  detail?: string;
}

/** A feature value plus the pieces it is made of. Components sum to `value`. */
export interface Feature {
  value: number;
  components: FeatureComponent[];
}

export interface FeatureComponent {
  code: string;
  value: number;
  detail?: string;
}

export interface WalletFeatures {
  wallet: Address;
  /** H: hold quality, 0..1. */
  holdQuality: Feature;
  /** Q: quality of markets entered, 0..1, launch-relative. */
  marketQuality: Feature;
  /** A: alignment (SPARK, Vibers, guilds, shipping), -1..1. */
  alignment: Feature;
  /** D: dump score, 0..1. */
  dumpScore: Feature;
  /** Y: sybil penalty, 0..1. */
  sybil: Feature;
}

export interface ScoreWeights {
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
  epsilon: number;
}

export interface WalletScore {
  wallet: Address;
  score: number;
  reasons: Reason[];
  features: WalletFeatures;
}
