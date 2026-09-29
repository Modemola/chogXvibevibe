import type { Address } from './types.js';

export interface FillCandidate {
  wallet: Address;
  cluster: Address;
  /** Relative share. Zero-weight candidates get nothing. */
  weight: bigint;
}

/**
 * Proportional water-filling in exact integer token units.
 *
 * `amount` is split across candidates in proportion to `weight`. A candidate
 * that hits its wallet cap or its cluster cap stops receiving, and what it
 * would have received is re-split among the rest. Rounding dust goes one unit
 * at a time to the heaviest candidates first. Whatever cannot be placed under
 * the caps is returned as `leftover`.
 *
 * `walletRoom` / `clusterRoom` hold remaining capacity and are updated in place,
 * so caps hold across buckets.
 */
export function waterFill(
  amount: bigint,
  candidates: readonly FillCandidate[],
  walletRoom: Map<Address, bigint>,
  clusterRoom: Map<Address, bigint>,
): { grants: Map<Address, bigint>; leftover: bigint } {
  const grants = new Map<Address, bigint>();
  let remaining = amount;

  const room = (c: FillCandidate) => {
    const w = walletRoom.get(c.wallet) ?? 0n;
    const k = clusterRoom.get(c.cluster) ?? 0n;
    return w < k ? w : k;
  };
  const give = (c: FillCandidate, g: bigint) => {
    grants.set(c.wallet, (grants.get(c.wallet) ?? 0n) + g);
    walletRoom.set(c.wallet, (walletRoom.get(c.wallet) ?? 0n) - g);
    clusterRoom.set(c.cluster, (clusterRoom.get(c.cluster) ?? 0n) - g);
  };

  while (remaining > 0n) {
    const active = candidates.filter((c) => c.weight > 0n && room(c) > 0n);
    if (!active.length) break;
    const total = active.reduce((s, c) => s + c.weight, 0n);

    const roundStart = remaining;
    let given = 0n;
    for (const c of active) {
      const share = (roundStart * c.weight) / total;
      const r = room(c);
      const g = share < r ? share : r;
      if (g > 0n) {
        give(c, g);
        given += g;
      }
    }

    if (given === 0n) {
      // Every share floored to zero: remaining < number of active candidates.
      const byWeight = [...active].sort((a, b) => (b.weight > a.weight ? 1 : b.weight < a.weight ? -1 : 0));
      for (const c of byWeight) {
        if (remaining - given === 0n) break;
        if (room(c) > 0n) {
          give(c, 1n);
          given += 1n;
        }
      }
      if (given === 0n) break;
    }
    remaining -= given;
  }

  return { grants, leftover: remaining };
}
