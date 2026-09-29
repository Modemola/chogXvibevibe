import type { Address } from '@scout/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Db,
  type RecordBatch,
  createPgliteDb,
  latestSnapshotId,
  listProfileWallets,
  loadLaunchContext,
  loadWalletFacts,
  migrate,
  writeBatch,
} from '../src/index.js';

const T0 = 1_790_000_000;
const DAY = 86_400;
const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;
const E18 = 10n ** 18n;

const ALICE = a(1);
const BOB = a(2);
const CREATOR = a(9);
const SPARK = a(0x5a);

function batch(): RecordBatch {
  return {
    launches: [
      { id: 'L1', token: a(101), creator: CREATOR, lane: 'utility', pairClass: 'stock', taxBps: 200, createdAt: T0 - 30 * DAY, graduatedAt: T0 - 29 * DAY, hasProductLinks: true, flaggedRug: false },
      { id: 'L2', token: a(102), creator: CREATOR, lane: 'meme', pairClass: 'eth', taxBps: 100, createdAt: T0 - 20 * DAY, hasProductLinks: false, flaggedRug: false },
      { id: 'L3', token: a(103), creator: ALICE, lane: 'vibecoded', pairClass: 'eth', taxBps: 100, createdAt: T0 + DAY, hasProductLinks: true, flaggedRug: false },
    ],
    trades: [
      { txHash: tx(1), logIndex: 0, launchId: 'L1', wallet: ALICE, side: 'buy', tokenAmount: 100n * E18, volumeUsd: 50, ts: T0 - 29.5 * DAY },
      { txHash: tx(2), logIndex: 0, launchId: 'L1', wallet: ALICE, side: 'sell', tokenAmount: 40n * E18, volumeUsd: 30, ts: T0 - 10 * DAY },
      { txHash: tx(3), logIndex: 0, launchId: 'L2', wallet: ALICE, side: 'buy', tokenAmount: 10n * E18, volumeUsd: 5, ts: T0 - 19 * DAY },
      { txHash: tx(4), logIndex: 0, launchId: 'L2', wallet: ALICE, side: 'sell', tokenAmount: 10n * E18, volumeUsd: 7, ts: T0 - 18 * DAY },
      // After asOf: must be invisible.
      { txHash: tx(5), logIndex: 0, launchId: 'L1', wallet: BOB, side: 'buy', tokenAmount: 1n, volumeUsd: 1, ts: T0 + 60 },
    ],
    funding: [
      { wallet: ALICE, funder: a(0xf1), ts: T0 - 40 * DAY },
      { wallet: BOB, funder: a(0xf1), ts: T0 - 40 * DAY + 60 },
    ],
    scoutDrops: [{ launchId: 'L1', wallet: BOB, amount: 5n * E18, receivedAt: T0 - 29 * DAY }],
    dropOutcomes: [
      { launchId: 'L1', wallet: BOB, window: 'h1', soldBps: 9_000 },
      { launchId: 'L1', wallet: BOB, window: 'h24', soldBps: 10_000 },
    ],
    snapshots: [
      { id: 'spark-1', token: SPARK, chain: 'base', block: 100n, takenAt: T0 - 5 * DAY, balances: [{ wallet: ALICE, balance: 250_000n * E18 }] },
      { id: 'spark-2', token: SPARK, chain: 'base', block: 200n, takenAt: T0 + 5 * DAY, balances: [{ wallet: ALICE, balance: 1n }] },
    ],
    vibers: [
      { tokenId: '1', wallet: ALICE, level: 3, lastChargedAt: T0 - 2 * DAY },
      { tokenId: '2', wallet: ALICE, level: 7, lastChargedAt: T0 + DAY },
    ],
    guildMembers: [{ guildId: 'g1', wallet: ALICE, goodStanding: true }],
    profiles: [
      { wallet: ALICE, optedInAt: T0 - DAY, message: null, signature: null },
      { wallet: BOB, optedInAt: T0 + DAY, message: null, signature: null },
    ],
    links: [{ wallet: BOB, primaryWallet: ALICE, linkedAt: T0 - DAY, signature: null }],
  };
}

describe('db', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
  });
  beforeEach(async () => {
    const tables = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
    );
    await db.exec(`TRUNCATE ${tables.map((t) => t.tablename).join(', ')} CASCADE`);
  });
  afterAll(async () => {
    await db.close();
  });

  it('migrations are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
  });

  it('writes are idempotent', async () => {
    await writeBatch(db, batch());
    await writeBatch(db, batch());
    const [{ n }] = (await db.query<{ n: string }>('SELECT count(*)::text AS n FROM trades')) as [{ n: string }];
    expect(n).toBe('5');
  });

  it('assembles WalletFacts as of a point in time', async () => {
    await writeBatch(db, batch());
    const snap = await latestSnapshotId(db, SPARK, T0);
    expect(snap).toBe('spark-1');
    const [alice, bob] = await loadWalletFacts(db, { wallets: [ALICE, BOB], asOf: T0, sparkSnapshotId: snap });

    expect(alice!.sparkBalance).toBe(250_000n * E18);
    expect(alice!.positions).toHaveLength(2);
    const l1 = alice!.positions.find((p) => p.launchId === 'L1')!;
    expect(l1).toMatchObject({ lane: 'utility', pairClass: 'stock', graduated: true, volumeUsd: 80 });
    expect(l1.exitedAt).toBeUndefined(); // still holds 60
    const l2 = alice!.positions.find((p) => p.launchId === 'L2')!;
    expect(l2.exitedAt).toBe(T0 - 18 * DAY);
    expect(l2.graduated).toBe(false);
    expect(alice!.earlyBuys.map((b) => b.launchId)).toEqual(['L1', 'L2']);
    expect(alice!.createdLaunches).toEqual([]); // L3 is created after asOf
    expect(alice!.viber).toEqual({ level: 7, lastChargedAt: T0 - 2 * DAY });
    expect(alice!.guilds).toEqual([{ id: 'g1', goodStanding: true }]);
    expect(alice!.firstFunding).toEqual({ funder: a(0xf1), at: T0 - 40 * DAY });

    expect(bob!.positions).toEqual([]); // trade after asOf
    expect(bob!.scoutDrops).toEqual([
      { launchId: 'L1', receivedAt: T0 - 29 * DAY, amount: 5n * E18, sold: { h1: 9_000, h24: 10_000 } },
    ]);
    expect(bob!.linkedTo).toBe(ALICE);
  });

  it('lists creators, profiles and launch context', async () => {
    await writeBatch(db, batch());
    const [creator] = await loadWalletFacts(db, { wallets: [CREATOR], asOf: T0 });
    expect(creator!.createdLaunches.map((c) => [c.launchId, c.graduated])).toEqual([
      ['L1', true],
      ['L2', false],
    ]);
    expect(await listProfileWallets(db, T0)).toEqual([ALICE]);
    expect(await loadLaunchContext(db, 'L1', T0)).toEqual({ launchId: 'L1', lane: 'utility', pairClass: 'stock', creator: CREATOR, asOf: T0 });
  });

  it('keeps the earliest funding and never rewrites a snapshot', async () => {
    await writeBatch(db, batch());
    await writeBatch(db, {
      funding: [{ wallet: ALICE, funder: a(0xf9), ts: T0 }],
      snapshots: [{ id: 'spark-1', token: SPARK, chain: 'base', block: 100n, takenAt: T0 - 5 * DAY, balances: [{ wallet: BOB, balance: 1n }] }],
    });
    const [alice, bob] = await loadWalletFacts(db, { wallets: [ALICE, BOB], asOf: T0, sparkSnapshotId: 'spark-1' });
    expect(alice!.firstFunding!.funder).toBe(a(0xf1));
    expect(bob!.sparkBalance).toBe(0n);
  });

  it('rolls back a failed batch completely', async () => {
    await expect(
      writeBatch(db, {
        launches: [{ id: 'OK', token: a(1), creator: a(2), lane: 'meme', pairClass: 'eth', taxBps: 0, createdAt: 1, hasProductLinks: false, flaggedRug: false }],
        trades: [{ txHash: tx(9), logIndex: 0, launchId: 'MISSING', wallet: a(3), side: 'buy', tokenAmount: 1n, volumeUsd: 0, ts: 1 }],
      }),
    ).rejects.toThrow();
    expect(await db.query("SELECT id FROM launches WHERE id = 'OK'")).toEqual([]);
  });
});
