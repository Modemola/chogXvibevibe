import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import type { Address } from './types.js';

/**
 * OpenZeppelin StandardMerkleTree over (address, uint256) leaves, so a claim
 * contract can verify with MerkleProof.verify and
 * keccak256(bytes.concat(keccak256(abi.encode(account, amount)))).
 */
export const LEAF_ENCODING = ['address', 'uint256'] as const;

export interface MerkleClaim {
  wallet: Address;
  amount: bigint;
}

export function buildMerkleTree(claims: readonly MerkleClaim[]) {
  if (!claims.length) throw new Error('Cannot build a Merkle tree with no claims');
  return StandardMerkleTree.of(
    claims.map((c) => [c.wallet, c.amount.toString()]),
    [...LEAF_ENCODING],
  );
}

export function merkleRoot(claims: readonly MerkleClaim[]): `0x${string}` | null {
  if (!claims.length) return null;
  return buildMerkleTree(claims).root as `0x${string}`;
}

/** Proof for every claim, keyed by wallet. */
export function merkleProofs(claims: readonly MerkleClaim[]): Map<Address, `0x${string}`[]> {
  const out = new Map<Address, `0x${string}`[]>();
  if (!claims.length) return out;
  const tree = buildMerkleTree(claims);
  for (const [i, [wallet]] of tree.entries()) {
    out.set(wallet as Address, tree.getProof(i) as `0x${string}`[]);
  }
  return out;
}

export function verifyClaim(root: string, claim: MerkleClaim, proof: string[]): boolean {
  return StandardMerkleTree.verify(root, [...LEAF_ENCODING], [claim.wallet, claim.amount.toString()], proof);
}
