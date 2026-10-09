import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_CONFIG as cfg, clusterWallets } from '../src/index.js';
import { DAY, T0, addr, wallet } from './fixtures.js';

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

  it('uses wallets that never opted in as evidence: one signed-up farm wallet is still caught', () => {
    const signedUp = wallet(1, { firstFunding: { funder: FUNDER, at: T0 } });
    const siblings = [2, 3, 4, 5].map((i) => wallet(i, { firstFunding: { funder: FUNDER, at: T0 + i * 60 } }));
    expect(clusterWallets([signedUp], cfg).get(addr(1))!.sybilScore).toBe(0);
    const out = clusterWallets([signedUp], cfg, siblings);
    expect(out.get(addr(1))!.detectedSize).toBe(5);
    expect(out.get(addr(1))!.sybilScore).toBe(1);
  });

  it('identical early buys link a signed-up wallet to unsigned copies', () => {
    const buys = [10, 11, 12].map((n) => ({ launchId: `L${n}`, at: T0 + n * 3_600 }));
    const copy = (n: number, offset: number) => wallet(n, { earlyBuys: buys.map((b) => ({ ...b, at: b.at + offset })) });
    const out = clusterWallets([copy(1, 0)], cfg, [copy(2, 20), copy(3, 45)]);
    expect(out.get(addr(1))!.detectedSize).toBe(3);
  });

  it('being funded by an unsigned wallet, or funding one, is not evidence by itself', () => {
    const friend = wallet(7, { firstFunding: { funder: addr(0xbeef), at: T0 } });
    const me = wallet(1, { firstFunding: { funder: addr(7), at: T0 + DAY } });
    expect(clusterWallets([me], cfg, [friend]).get(addr(1))!.sybilScore).toBe(0);
    const funded = wallet(8, { firstFunding: { funder: addr(1), at: T0 } });
    expect(clusterWallets([wallet(1)], cfg, [funded]).get(addr(1))!.sybilScore).toBe(0);
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
