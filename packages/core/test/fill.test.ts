import { describe, expect, it } from 'vitest';
import { type Address, waterFill } from '../src/index.js';
import { addr } from './fixtures.js';

const rooms = (wallets: Address[], w: bigint, clusters: Address[] = wallets, c: bigint = w) => ({
  walletRoom: new Map(wallets.map((x) => [x, w])),
  clusterRoom: new Map(clusters.map((x) => [x, c])),
});

describe('water-fill', () => {
  it('splits proportionally and exactly', () => {
    const ws = [addr(1), addr(2)];
    const { walletRoom, clusterRoom } = rooms(ws, 1_000n);
    const { grants, leftover } = waterFill(
      300n,
      [
        { wallet: ws[0]!, cluster: ws[0]!, weight: 2n },
        { wallet: ws[1]!, cluster: ws[1]!, weight: 1n },
      ],
      walletRoom,
      clusterRoom,
    );
    expect(grants.get(ws[0]!)).toBe(200n);
    expect(grants.get(ws[1]!)).toBe(100n);
    expect(leftover).toBe(0n);
  });

  it('redistributes past a capped wallet and hands dust to the heaviest', () => {
    const ws = [addr(1), addr(2), addr(3)];
    const { walletRoom, clusterRoom } = rooms(ws, 40n);
    const { grants, leftover } = waterFill(
      101n,
      ws.map((w, i) => ({ wallet: w, cluster: w, weight: BigInt(10 - i) })),
      walletRoom,
      clusterRoom,
    );
    const total = [...grants.values()].reduce((s, g) => s + g, 0n);
    expect(total).toBe(101n);
    expect(leftover).toBe(0n);
    for (const g of grants.values()) expect(g).toBeLessThanOrEqual(40n);
  });

  it('respects a shared cluster cap and returns what cannot be placed', () => {
    const ws = [addr(1), addr(2)];
    const cluster = addr(1);
    const { walletRoom, clusterRoom } = rooms(ws, 100n, [cluster], 60n);
    const { grants, leftover } = waterFill(
      500n,
      ws.map((w) => ({ wallet: w, cluster, weight: 1n })),
      walletRoom,
      clusterRoom,
    );
    expect((grants.get(ws[0]!) ?? 0n) + (grants.get(ws[1]!) ?? 0n)).toBe(60n);
    expect(leftover).toBe(440n);
    expect(clusterRoom.get(cluster)).toBe(0n);
  });

  it('gives nothing to zero-weight candidates', () => {
    const ws = [addr(1)];
    const { walletRoom, clusterRoom } = rooms(ws, 100n);
    const { grants, leftover } = waterFill(50n, [{ wallet: ws[0]!, cluster: ws[0]!, weight: 0n }], walletRoom, clusterRoom);
    expect(grants.size).toBe(0);
    expect(leftover).toBe(50n);
  });
});
