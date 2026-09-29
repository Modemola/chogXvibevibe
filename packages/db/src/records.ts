import type { Address, Lane, PairClass, SoldByWindow, Timestamp } from '@scout/core';

/**
 * Normalized records every data source produces and the database stores.
 * A source (simulated, vibe/vibe testnet, Base ERC-20 logs) only has to emit
 * these; nothing downstream knows where they came from.
 */

export interface LaunchRecord {
  id: string;
  token: Address;
  creator: Address;
  lane: Lane;
  pairClass: PairClass;
  pairToken?: Address;
  taxBps: number;
  createdAt: Timestamp;
  graduatedAt?: Timestamp;
  hasProductLinks: boolean;
  flaggedRug: boolean;
}

export interface TradeRecord {
  txHash: `0x${string}`;
  logIndex: number;
  launchId: string;
  wallet: Address;
  side: 'buy' | 'sell';
  tokenAmount: bigint;
  volumeUsd: number;
  ts: Timestamp;
}

/** First inbound native-token transfer that funded a wallet. */
export interface FundingRecord {
  wallet: Address;
  funder: Address;
  ts: Timestamp;
}

export interface ScoutDropRecord {
  launchId: string;
  wallet: Address;
  amount: bigint;
  receivedAt: Timestamp;
}

export type DropWindow = keyof SoldByWindow;
export const DROP_WINDOWS: readonly DropWindow[] = ['h1', 'h24', 'd7', 'd30'];

export interface DropOutcomeRecord {
  launchId: string;
  wallet: Address;
  window: DropWindow;
  soldBps: number;
}

export interface BalanceSnapshotRecord {
  /** Stable id, e.g. `spark-base-12345678`. Re-running the same snapshot is a no-op. */
  id: string;
  token: Address;
  chain: string;
  block: bigint;
  takenAt: Timestamp;
  balances: { wallet: Address; balance: bigint }[];
}

export interface ViberRecord {
  tokenId: string;
  wallet: Address;
  level: number;
  lastChargedAt?: Timestamp;
}

export interface GuildMemberRecord {
  guildId: string;
  wallet: Address;
  goodStanding: boolean;
}

export interface ProfileRecord {
  wallet: Address;
  optedInAt: Timestamp;
  /** Signed opt-in message. Null only for simulated data. */
  message: string | null;
  signature: `0x${string}` | null;
}

export interface WalletLinkRecord {
  wallet: Address;
  primaryWallet: Address;
  linkedAt: Timestamp;
  signature: `0x${string}` | null;
}

/** Ground-truth labels, written only by the simulator, used to evaluate scoring. */
export interface SimLabelRecord {
  wallet: Address;
  persona: string;
  farmId?: string;
}

export interface RecordBatch {
  launches?: LaunchRecord[];
  trades?: TradeRecord[];
  funding?: FundingRecord[];
  scoutDrops?: ScoutDropRecord[];
  dropOutcomes?: DropOutcomeRecord[];
  snapshots?: BalanceSnapshotRecord[];
  vibers?: ViberRecord[];
  guildMembers?: GuildMemberRecord[];
  profiles?: ProfileRecord[];
  links?: WalletLinkRecord[];
  simLabels?: SimLabelRecord[];
}
