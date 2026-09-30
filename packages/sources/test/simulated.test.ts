import { describe, expect, it } from 'vitest';
import { simulateWorld } from '../src/index.js';

describe('simulateWorld', () => {
  const world = simulateWorld({ seed: 7 });
  const b = world.batch;

  it('is deterministic per seed', () => {
    const again = simulateWorld({ seed: 7 });
    expect(again.batch.trades!.length).toBe(b.trades!.length);
    expect(again.batch.trades![100]).toEqual(b.trades![100]);
    expect(simulateWorld({ seed: 8 }).batch.trades![100]).not.toEqual(b.trades![100]);
  });

  it('produces a referentially consistent world', () => {
    const launchIds = new Set(b.launches!.map((l) => l.id));
    expect(launchIds.size).toBe(80);
    for (const t of b.trades!) {
      expect(launchIds.has(t.launchId)).toBe(true);
      expect(t.ts).toBeLessThanOrEqual(world.asOf);
    }
    const drops = new Set(b.scoutDrops!.map((d) => `${d.launchId}|${d.wallet}`));
    for (const o of world.intendedOutcomes) expect(drops.has(`${o.launchId}|${o.wallet}`)).toBe(true);
    expect(b.dropOutcomes).toBeUndefined(); // measured by the aftermath job, not written by the simulator
    const tokens = new Set(b.launches!.map((l) => l.token));
    for (const t of b.transfers!) {
      expect(tokens.has(t.token)).toBe(true);
      expect(t.ts).toBeLessThanOrEqual(world.asOf);
    }
    expect(new Set(b.transfers!.map((t) => t.txHash)).size).toBe(b.transfers!.length);
    const txKeys = new Set(b.trades!.map((t) => `${t.txHash}|${t.logIndex}`));
    expect(txKeys.size).toBe(b.trades!.length);
  });

  it('only drops to wallets that opted in before the drop, never the creator', () => {
    const optIn = new Map(b.profiles!.map((p) => [p.wallet, p.optedInAt]));
    const creator = new Map(b.launches!.map((l) => [l.id, l.creator]));
    for (const d of b.scoutDrops!) {
      expect(optIn.get(d.wallet)).toBeLessThanOrEqual(d.receivedAt);
      expect(d.wallet).not.toBe(creator.get(d.launchId));
    }
    expect(b.scoutDrops!.length).toBeGreaterThan(100);
  });

  it('intended drop outcomes are monotone', () => {
    const byKey = new Map<string, Record<string, number>>();
    for (const o of world.intendedOutcomes) {
      const m = byKey.get(`${o.launchId}|${o.wallet}`) ?? {};
      m[o.window] = o.soldBps;
      byKey.set(`${o.launchId}|${o.wallet}`, m);
    }
    for (const m of byKey.values()) {
      const seq = ['h1', 'h24', 'd7', 'd30'].map((w) => m[w]).filter((x) => x !== undefined) as number[];
      for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]!);
    }
  });

  it('builds farms with the advertised styles', () => {
    expect(world.farms.map((f) => f.style)).toEqual(['naive', 'split_funding', 'staggered', 'naive']);
    const naive = world.farms[0]!;
    const funders = new Set(b.funding!.filter((f) => naive.members.includes(f.wallet)).map((f) => f.funder));
    expect(funders.size).toBe(1);
  });
});
