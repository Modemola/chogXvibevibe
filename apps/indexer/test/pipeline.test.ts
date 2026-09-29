import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from '@scout/core';
import { type Db, createPgliteDb, hubFunders, listProfileWallets, loadSimLabels, loadWalletFacts, migrate, writeBatch } from '@scout/db';
import { simulateWorld } from '@scout/sources';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluate, renderReport } from '../src/evaluate.js';

/**
 * End to end: simulated world → Postgres (PGlite) → WalletFacts → scores and
 * allocation, checked against the simulator's ground truth. These are the
 * properties the scoring model has to keep as it gets tuned.
 */
describe('simulate → db → evaluate', () => {
  let db: Db;
  const world = simulateWorld({ seed: 42 });
  let config: ScoringConfig;
  let report: ReturnType<typeof evaluate>;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    await writeBatch(db, world.batch);
    const hubs = await hubFunders(db, 20);
    config = { ...DEFAULT_SCORING_CONFIG, sybil: { ...DEFAULT_SCORING_CONFIG.sybil, ignoredFunders: hubs.map((h) => h.funder) } };
    const wallets = await listProfileWallets(db, world.asOf);
    const facts = await loadWalletFacts(db, { wallets, asOf: world.asOf, sparkSnapshotId: world.sparkSnapshotId });
    report = evaluate({
      facts,
      labels: await loadSimLabels(db),
      launch: { launchId: 'eval', lane: 'utility', pairClass: 'stock', creator: '0x000000000000000000000000000000000000dead', asOf: world.asOf },
      template: 'custom',
      slice: 1_000_000n * 10n ** 18n,
      config,
    });
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });

  const row = (p: string) => report.personas.find((r) => r.persona === p)!;

  it('finds exactly the simulated exchange hot wallets as hubs', async () => {
    const hubs = (await hubFunders(db, 20)).map((h) => h.funder).sort();
    expect(hubs).toEqual([...world.cexFunders].sort());
  });

  it('ranks good actors above bad ones', () => {
    for (const good of ['diamond', 'builder', 'stock_native']) {
      for (const bad of ['dumper', 'rugger', 'farm']) {
        expect(row(good).meanScore, `${good} > ${bad}`).toBeGreaterThan(row(bad).meanScore);
      }
    }
    expect(row('diamond').meanScore).toBeGreaterThan(row('trencher').meanScore);
  });

  it('gives farms nothing and dumpers little', () => {
    for (const f of report.farms) expect(f.allocationShare).toBe(0);
    expect(row('dumper').allocationShare).toBeLessThan(0.05);
    expect(row('diamond').allocationShare + row('builder').allocationShare + row('stock_native').allocationShare).toBeGreaterThan(0.6);
  });

  it('flags coordinated farms, with no false positives once hubs are ignored', () => {
    for (const f of report.farms.filter((x) => !x.farmId.startsWith('staggered'))) expect(f.flagged).toBe(f.members);
    expect(report.falsePositives).toBe(0);
    expect(renderReport(report)).toContain('False positives: 0');
  });
});
