import { type Address, type AllocationSet, merkleProofs } from '@scout/core';

export { ScoutDrop, TestToken } from './artifacts.js';

/** Conventional burn address. Scout's default sink for unclaimed tokens. */
export const BURN_SINK: Address = '0x000000000000000000000000000000000000dead';

export const DAY = 86_400;

/** Arguments for ScoutDrop.createDrop from a resolved allocation. */
export function createDropArgs(set: AllocationSet, opts: { token: Address; claimPeriodSec?: number; sink?: Address }) {
  if (!set.merkleRoot) throw new Error('Allocation has no recipients');
  return [opts.token, set.merkleRoot, set.policyHash, set.allocated, BigInt(opts.claimPeriodSec ?? 30 * DAY), opts.sink ?? BURN_SINK] as const;
}

/**
 * Claim batches for ScoutDrop.claimMany, `batchSize` recipients each
 * (keep batches well under the block gas limit; ~70k gas per claim, so 100 ≈ 7M gas).
 */
export function claimBatches(set: AllocationSet, batchSize = 100) {
  const proofs = merkleProofs(set.recipients);
  const batches: { accounts: Address[]; amounts: bigint[]; proofs: `0x${string}`[][] }[] = [];
  for (let i = 0; i < set.recipients.length; i += batchSize) {
    const slice = set.recipients.slice(i, i + batchSize);
    batches.push({
      accounts: slice.map((r) => r.wallet),
      amounts: slice.map((r) => r.amount),
      proofs: slice.map((r) => proofs.get(r.wallet)!),
    });
  }
  return batches;
}
