import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_CONFIG as cfg, clusterWallets } from '../src/index.js';
import { T0, addr, wallet } from './fixtures.js';

const FUNDER = addr(0xf00d);

describe('sybil clustering', () => {
  it('links wallets funded by the same funder within the window, penalty grows with size', () => {
    const farm = [1, 2, 3, 4, 5].map((i) => wallet(i, { firstFunding: { funder: FUNDER, at: T0 + i * 60 } }));
    const loner = wallet(9, { firstFunding: { funder: FUNDER, at: T0 + 10 * 3_600 } });
    const out = clusterWallets([...farm, loner], cfg);
    expect(out.get(addr(3))!.size).toBe(5);
    expect(out.get(addr(3))!.clusterId).toBe(addr(1));
    expect(out.get(addr(3))!.sybilScore).toBe(1);
    expect(out.get(addr(9))!.size).toBe(1);
    expect(out.get(addr(9))!.sybilScore).toBe(0);

    const pair = clusterWallets(farm.slice(0, 2), cfg);
    expect(pair.get(addr(1))!.sybilScore).toBeCloseTo(0.25);
  });

  it('never links through ignored funders (CEX hot wallets)', () => {
    const farm = [1, 2, 3].map((i) => wallet(i, { firstFunding: { funder: FUNDER, at: T0 + i } }));
    const out = clusterWallets(farm, { ...cfg, sybil: { ...cfg.sybil, ignoredFunders: [FUNDER] } });
    expect(out.get(addr(1))!.size).toBe(1);
  });

  it('declared links merge caps without a penalty', () => {
    const out = clusterWallets([wallet(1), wallet(2, { linkedTo: addr(1) })], cfg);
    expect(out.get(addr(2))!.clusterId).toBe(addr(1));
    expect(out.get(addr(2))!.size).toBe(2);
    expect(out.get(addr(2))!.sybilScore).toBe(0);
  });

  it('does not penalize a declared alt for also being funded by its primary', () => {
    const out = clusterWallets(
      [wallet(1), wallet(2, { linkedTo: addr(1), firstFunding: { funder: addr(1), at: T0 } })],
      cfg,
    );
    expect(out.get(addr(2))!.size).toBe(2);
    expect(out.get(addr(2))!.sybilScore).toBe(0);
  });

  it('links near-identical early buy sequences', () => {
    const buys = (offset: number) =>
      Array.from({ length: 10 }, (_, i) => ({ launchId: `L${i}`, at: T0 + i * 600 + offset }));
    const out = clusterWallets(
      [wallet(1, { earlyBuys: buys(0) }), wallet(2, { earlyBuys: buys(30) }), wallet(3, { earlyBuys: buys(3_600) })],
      cfg,
    );
    expect(out.get(addr(1))!.clusterId).toBe(out.get(addr(2))!.clusterId);
    expect(out.get(addr(3))!.size).toBe(1);
    expect(out.get(addr(1))!.edges[0]!.kind).toBe('early_buys');
  });

  it('links a wallet to its funder when the funder is also in the set', () => {
    const out = clusterWallets([wallet(1), wallet(2, { firstFunding: { funder: addr(1), at: T0 } })], cfg);
    expect(out.get(addr(2))!.clusterId).toBe(addr(1));
  });
});
