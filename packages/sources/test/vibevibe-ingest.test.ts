import { createPgliteDb, migrate } from '@scout/db';
import { describe, expect, it } from 'vitest';
import { type RawLog, VV_TOPICS } from '../src/vibevibe.js';
import { claimLiveSync, ingestVibeVibe, liveSyncState } from '../src/vibevibe-ingest.js';
import receipts from './fixtures/vibevibe-receipts.json' with { type: 'json' };

const R = receipts as unknown as Record<string, { logs: RawLog[] }>;
const SCOUT_POOL = '0x90dbcadd611784273b3fd14633274e1c762bbb30';

/** A fake RPC serving the recorded logs, plus a graduation of the $SCOUT pool built from the real one. */
function fakeClient(extra: RawLog[] = []) {
  const grad = R.graduation!.logs.find((l) => l.topics[0] === VV_TOPICS.graduated)!;
  const all: RawLog[] = [
    ...R.scoutLaunch!.logs,
    ...R.buyViaRouter!.logs,
    ...R.sellViaRouter!.logs,
    ...R.graduation!.logs, // a pool launched before indexing started: its trades are skipped
    { ...grad, address: SCOUT_POOL, blockNumber: `0x${(131_700_000).toString(16)}`, logIndex: '0x0' },
    ...extra,
  ];
  const head = 131_800_000n;
  return {
    async request({ params: [p] }: { method: string; params: [{ fromBlock: string; toBlock: string; address?: string; topics?: (string | string[])[] }] }) {
      const t0 = p.topics?.[0];
      const wanted = typeof t0 === 'string' ? [t0] : t0;
      return all.filter(
        (l) =>
          BigInt(l.blockNumber) >= BigInt(p.fromBlock) &&
          BigInt(l.blockNumber) <= BigInt(p.toBlock) &&
          (!p.address || l.address.toLowerCase() === p.address.toLowerCase()) &&
          (!wanted || wanted.includes(l.topics[0]!)),
      );
    },
    async getBlock({ blockNumber }: { blockNumber: bigint }) {
      if (blockNumber > head) throw new Error('block not found');
      return { timestamp: 1_700_000_000n + blockNumber / 4n };
    },
    async getBlockNumber() {
      return head;
    },
  };
}

describe('ingestVibeVibe', () => {
  it('stores real launches, trades and graduations, and resumes from its cursor', async () => {
    const db = await createPgliteDb();
    await migrate(db);
    const client = fakeClient() as never;
    const first = await ingestVibeVibe(db, { client, startBlock: 131_490_000n, maxBlocks: 1_000_000n, chunkSize: 50_000n, now: 1 });
    expect(first).toMatchObject({ launches: 1, trades: 3, graduations: 1, caughtUp: true });
    expect(first.tradesSkipped).toBeGreaterThan(0);

    const [launch] = await db.query<Record<string, unknown>>('SELECT * FROM launches WHERE id = $1', ['vv-8422']);
    expect(launch).toMatchObject({ token: '0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de', creator: '0x3acb6d0cb65532a90665330f5ff4cbc0c68cd185', pair_class: 'eth', tax_bps: 100 });
    expect(launch!.graduated_at).not.toBeNull();
    const [vv] = await db.query<Record<string, unknown>>('SELECT * FROM vv_launches WHERE launch_id = $1', ['vv-8422']);
    expect(vv).toMatchObject({ name: 'Graduation Scout', symbol: 'SCOUT', pool: SCOUT_POOL });
    const trades = await db.query<{ wallet: string; side: string; token_amount: string }>(
      "SELECT wallet, side, token_amount::text FROM trades WHERE launch_id = 'vv-8422' ORDER BY ts, log_index",
    );
    expect(trades.map((t) => t.side)).toEqual(['buy', 'buy', 'sell']);
    expect(trades[0]).toMatchObject({ wallet: '0x3acb6d0cb65532a90665330f5ff4cbc0c68cd185', token_amount: (10_000_000n * 10n ** 18n).toString() });

    // A second run starts after the stored range and changes nothing.
    const again = await ingestVibeVibe(db, { client, startBlock: 131_490_000n, chunkSize: 50_000n, now: 2 });
    expect(again).toMatchObject({ launches: 0, trades: 0, caughtUp: true });
    expect((await liveSyncState(db))!.block).toBe(first.toBlock);

    // One sync per minute: the first claim wins, the next is refused until a minute has passed.
    expect(await claimLiveSync(db, 1_000)).toBe(true);
    expect(await claimLiveSync(db, 1_030)).toBe(false);
    expect(await claimLiveSync(db, 1_061)).toBe(true);
    await db.close();
  });

  it('works through a long range in bounded steps', async () => {
    const db = await createPgliteDb();
    await migrate(db);
    const client = fakeClient() as never;
    let r = await ingestVibeVibe(db, { client, startBlock: 131_490_000n, maxBlocks: 100_000n, chunkSize: 50_000n });
    let steps = 1;
    while (!r.caughtUp) {
      r = await ingestVibeVibe(db, { client, startBlock: 131_490_000n, maxBlocks: 100_000n, chunkSize: 50_000n });
      steps++;
    }
    expect(steps).toBeGreaterThan(1);
    expect((await db.query("SELECT count(*)::int AS n FROM trades WHERE launch_id = 'vv-8422'"))[0]).toEqual({ n: 3 });
    await db.close();
  });
});
