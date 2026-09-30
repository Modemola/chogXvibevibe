import type { Address, SoldByWindow } from './types.js';

/**
 * Aftermath: what a recipient did with a Scout airdrop, measured from token
 * transfers alone.
 *
 * Rule (published): sold by window W = (balance right after the drop) − (lowest
 * balance at any point up to receivedAt + W), capped at the drop amount.
 *
 * - The lowest balance is used, so selling and buying back later still counts
 *   as selling.
 * - Tokens are fungible: selling tokens held before the drop counts too.
 * - The holder is the recipient plus its declared linked wallets. Moving tokens
 *   between them is not selling.
 * - Moving tokens into a known hold contract (locker, staking vault) is not
 *   selling either. Anything else leaving the holder is.
 */

export interface TokenTransfer {
  txHash: string;
  logIndex: number;
  from: Address;
  to: Address;
  amount: bigint;
  ts: number;
}

export const AFTERMATH_WINDOWS: readonly (readonly [keyof SoldByWindow, number])[] = [
  ['h1', 3_600],
  ['h24', 86_400],
  ['d7', 7 * 86_400],
  ['d30', 30 * 86_400],
];

export interface MeasureDropInput {
  wallet: Address;
  amount: bigint;
  receivedAt: number;
  /** Transfers of the launch token touching the holder. Order does not matter. */
  transfers: readonly TokenTransfer[];
  /** Linked wallets treated as the same holder. */
  linked?: readonly Address[];
  holdContracts?: readonly Address[];
  /** Only windows that ended by this time are measured. */
  asOf: number;
}

export type MeasureResult =
  | { observed: true; sold: SoldByWindow; balanceBefore: bigint }
  | { observed: false; reason: string };

export function compareTransfers(a: TokenTransfer, b: TokenTransfer): number {
  return a.ts - b.ts || (a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0) || a.logIndex - b.logIndex;
}

export function measureDrop(input: MeasureDropInput): MeasureResult {
  if (input.amount <= 0n) return { observed: false, reason: 'drop amount is zero' };
  const holder = new Set<string>([input.wallet, ...(input.linked ?? [])].map((a) => a.toLowerCase()));
  const holds = new Set<string>((input.holdContracts ?? []).map((a) => a.toLowerCase()));
  const internal = (a: string) => holder.has(a) || holds.has(a);

  const delta = (t: TokenTransfer): bigint => {
    const from = t.from.toLowerCase();
    const to = t.to.toLowerCase();
    if (internal(from) && internal(to)) return 0n;
    if (holder.has(to)) return t.amount;
    if (holder.has(from)) return -t.amount;
    return 0n; // hold contract ↔ outside, or unrelated
  };

  const sorted = [...input.transfers].sort(compareTransfers);
  const dropIndex = sorted.findIndex(
    (t) => t.ts === input.receivedAt && t.to.toLowerCase() === input.wallet.toLowerCase() && t.amount === input.amount,
  );
  if (dropIndex < 0) return { observed: false, reason: 'drop transfer not found in indexed transfers' };

  let balanceBefore = 0n;
  for (let i = 0; i < dropIndex; i++) balanceBefore += delta(sorted[i]!);
  const high = balanceBefore + input.amount;

  let running = high;
  let low = high;
  let i = dropIndex + 1;
  const sold: SoldByWindow = {};
  for (const [key, len] of AFTERMATH_WINDOWS) {
    const end = input.receivedAt + len;
    if (end > input.asOf) break;
    while (i < sorted.length && sorted[i]!.ts <= end) {
      running += delta(sorted[i]!);
      if (running < low) low = running;
      i++;
    }
    let out = high - low;
    if (out < 0n) out = 0n;
    if (out > input.amount) out = input.amount;
    sold[key] = Number((out * 10_000n + input.amount / 2n) / input.amount);
  }
  return { observed: true, sold, balanceBefore };
}

export interface AftermathDrop {
  wallet: Address;
  amount: bigint;
  sold: SoldByWindow;
}

export interface WindowSummary {
  window: keyof SoldByWindow;
  /** Recipients measured for this window. */
  measured: number;
  /** Amount-weighted share of the airdrop still held, 0..1. */
  retained: number;
  held: number; // sold < 10%
  trimmed: number; // 10–50%
  mostlySold: number; // 50–90%
  dumped: number; // ≥ 90%
}

/** Per-window distribution of hold vs dump across a launch's recipients. */
export function summarizeAftermath(drops: readonly AftermathDrop[]): WindowSummary[] {
  return AFTERMATH_WINDOWS.map(([window]) => {
    const measured = drops.filter((d) => d.sold[window] !== undefined);
    let total = 0n;
    let kept = 0n;
    const s: WindowSummary = { window, measured: measured.length, retained: 0, held: 0, trimmed: 0, mostlySold: 0, dumped: 0 };
    for (const d of measured) {
      const bps = d.sold[window]!;
      total += d.amount;
      kept += (d.amount * BigInt(10_000 - bps)) / 10_000n;
      if (bps < 1_000) s.held++;
      else if (bps < 5_000) s.trimmed++;
      else if (bps < 9_000) s.mostlySold++;
      else s.dumped++;
    }
    s.retained = total > 0n ? Number((kept * 1_000_000n) / total) / 1_000_000 : 0;
    return s;
  });
}
