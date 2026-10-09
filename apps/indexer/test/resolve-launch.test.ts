import { TEMPLATES, compilePolicy, policyHash } from '@scout/core';
import { type Db, createPgliteDb, migrate, runAftermath, writeBatch } from '@scout/db';
import { simulateWorld } from '@scout/sources';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveLaunch } from '../src/resolve-launch.js';

/** The keeper's path: the creator's locked policy wins, and a drop is resolved as of graduation. */
describe('resolveLaunch', () => {
  let db: Db;
  const world = simulateWorld({ seed: 3, wallets: 150, launches: 30 });
  let launchId: string;
  let graduatedAt: number;

  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    await writeBatch(db, world.batch);
    await runAftermath(db, { now: world.asOf });
    const [row] = await db.query<{ id: string; graduated_at: string }>(
      'SELECT id, graduated_at FROM launches WHERE graduated_at IS NOT NULL ORDER BY graduated_at DESC LIMIT 1',
    );
    launchId = row!.id;
    graduatedAt = Number(row!.graduated_at);
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });

  it('resolves a graduated launch as of its graduation', async () => {
    const r = await resolveLaunch(db, { launch: launchId, template: 'hold_or_die', sliceTokens: 1_000_000n });
    expect(r.launch.asOf).toBe(graduatedAt);
    expect(r.set.asOf).toBe(graduatedAt);
    expect(r.locked).toBeUndefined();
  });

  it("uses the creator's locked policy and refuses a different template", async () => {
    const policy = compilePolicy({ ...TEMPLATES.custom.policy, buckets: [{ id: 'only_spark', weightBps: 10_000, filter: 'spark_tier >= 1' }] });
    const hash = policyHash(policy);
    await db.query('INSERT INTO policies (hash, policy, created_at) VALUES ($1, $2::jsonb, 0)', [hash, JSON.stringify(policy)]);
    await db.query(
      `INSERT INTO policy_locks (launch_id, policy_hash, creator, message, signature, locked_at) VALUES ($1, $2, 'x', 'x', 'x', 0)`,
      [launchId, hash],
    );
    const r = await resolveLaunch(db, { launch: launchId, sliceTokens: 1_000_000n });
    expect(r.locked).toBe(hash);
    expect(r.set.policyHash).toBe(hash);
    expect(r.set.buckets.map((b) => b.id)).toEqual(['only_spark']);
    await expect(resolveLaunch(db, { launch: launchId, template: 'hold_or_die', sliceTokens: 1_000_000n })).rejects.toThrow(/locked policy/);
  });
});
