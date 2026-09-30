import type { Address } from '@scout/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Db, createPgliteDb, loadLaunchAftermath, loadWalletFacts, migrate, runAftermath, transfersHead, writeBatch } from '../src/index.js';

const T = 1_790_000_000;
const H = 3_600;
const D = 86_400;
const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
let n = 0;
const tx = () => `0x${(++n).toString(16).padStart(64, '0')}` as `0x${string}`;
const TOKEN = a(0x70);
const SENDER = a(0x5e);
const POOL = a(0x9001);
const LOCKER = a(0x10c);
const [HOLDER, DUMPER, PRIMARY, ALT, GHOST] = [a(1), a(2), a(3), a(4), a(5)];

const t = (from: Address, to: Address, amount: bigint, ts: number) => ({ token: TOKEN, txHash: tx(), logIndex: 0, from, to, amount, ts });

describe('runAftermath', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createPgliteDb();
    await migrate(db);
    await writeBatch(db, {
      launches: [{ id: 'L', token: TOKEN, creator: a(9), lane: 'utility', pairClass: 'stock', taxBps: 100, createdAt: T - D, graduatedAt: T, hasProductLinks: true, flaggedRug: false }],
      scoutDrops: [HOLDER, DUMPER, ALT, GHOST].map((w) => ({ launchId: 'L', wallet: w, amount: 1_000n, receivedAt: T })),
      links: [{ wallet: ALT, primaryWallet: PRIMARY, linkedAt: T - D, signature: null }],
      holdContracts: [{ address: LOCKER, label: 'test locker' }],
      transfers: [
        ...[HOLDER, DUMPER, ALT].map((w) => t(SENDER, w, 1_000n, T)), // GHOST's drop was never indexed
        t(HOLDER, LOCKER, 800n, T + 2 * H), // staking is not selling
        t(DUMPER, POOL, 950n, T + 60),
        t(ALT, PRIMARY, 1_000n, T + 120), // consolidating to the primary is not selling
        t(PRIMARY, POOL, 250n, T + 3 * D),
        t(POOL, a(0xbeef), 1n, T + 8 * D), // unrelated: moves the indexed head to T+8d
      ],
    });
  }, 30_000);
  afterAll(async () => {
    await db.close();
  });

  it('measures up to the indexed head, idempotently', async () => {
    expect(await transfersHead(db)).toBe(T + 8 * D);
    const first = await runAftermath(db);
    expect(first).toEqual({ now: T + 8 * D, due: 4, measured: 3, unobserved: 1, windowsWritten: 9 });

    const facts = await loadWalletFacts(db, { wallets: [HOLDER, DUMPER, ALT], asOf: T + 8 * D });
    expect(facts.map((f) => f.scoutDrops[0]!.sold)).toEqual([
      { h1: 0, h24: 0, d7: 0 },
      { h1: 9_500, h24: 9_500, d7: 9_500 },
      { h1: 0, h24: 0, d7: 2_500 },
    ]);

    // Nothing new is due until the head moves past another window.
    const again = await runAftermath(db);
    expect(again).toMatchObject({ due: 1, measured: 0, unobserved: 1 }); // only the ghost remains due
  });

  it('closes the 30d window when the head passes it', async () => {
    await writeBatch(db, { transfers: [t(HOLDER, POOL, 200n, T + 20 * D), t(POOL, a(0xbeef), 1n, T + 31 * D)] });
    const run = await runAftermath(db);
    expect(run.measured).toBe(3);
    const am = await loadLaunchAftermath(db, 'L');
    const holder = am.recipients.find((r) => r.wallet === HOLDER)!;
    expect(holder.sold).toEqual({ h1: 0, h24: 0, d7: 0, d30: 2_000 });
    const d30 = am.windows.find((w) => w.window === 'd30')!;
    expect(d30).toMatchObject({ measured: 3, held: 0, trimmed: 2, dumped: 1 });
    expect(am.recipients.find((r) => r.wallet === GHOST)!.sold).toEqual({});
  });
});
