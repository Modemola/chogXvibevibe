import { merkleProofs } from './merkle.js';
import type { AllocationSet } from './resolve.js';

/** Plain CSV a creator can paste into any airdrop tool: wallet,amount,score,buckets. */
export function allocationToCsv(set: AllocationSet): string {
  const lines = ['wallet,amount,score,buckets'];
  for (const r of set.recipients) {
    lines.push(`${r.wallet},${r.amount},${r.score},${r.buckets.map((b) => b.id).join('|')}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * JSON-safe form of an allocation (bigints as decimal strings), with Merkle
 * proofs attached to each recipient so it can be served as-is to claimers.
 */
export function allocationToJson(set: AllocationSet, opts: { proofs?: boolean } = {}): unknown {
  const proofs = opts.proofs ? merkleProofs(set.recipients) : undefined;
  return JSON.parse(
    JSON.stringify(
      {
        ...set,
        recipients: set.recipients.map((r) => (proofs ? { ...r, proof: proofs.get(r.wallet) } : r)),
      },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    ),
  );
}
