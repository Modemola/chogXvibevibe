import type { Address } from '@scout/core';
import { describe, expect, it } from 'vitest';
import { type Erc20LogClient, type TransferLog, snapshotErc20 } from '../src/index.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
const TOKEN = a(0x70);

function fakeClient(logs: (TransferLog & { blockNumber: bigint })[], maxRange = 1_000n) {
  const calls: [bigint, bigint][] = [];
  const client: Erc20LogClient = {
    async getLogs({ fromBlock, toBlock }) {
      calls.push([fromBlock, toBlock]);
      if (toBlock - fromBlock + 1n > maxRange) throw new Error('block range too large');
      return logs.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
    },
    async getBlock({ blockNumber }) {
      return { timestamp: 1_700_000_000n + blockNumber };
    },
  };
  return { client, calls };
}

const t = (block: number, from: string, to: string, value: bigint, logIndex = 0): TransferLog & { blockNumber: bigint } => ({
  args: { from, to, value },
  blockNumber: BigInt(block),
  logIndex,
});

describe('snapshotErc20', () => {
  it('replays mints, transfers and burns into balances', async () => {
    const { client } = fakeClient([
      t(10, ZERO, a(1), 1_000n),
      t(20, a(1), a(2), 300n),
      t(20, a(2), a(3), 100n, 1),
      t(30, a(3), ZERO, 100n), // burn
      t(40, a(1), a(2), 700n),
      t(5_000, a(2), a(4), 1n), // after toBlock
    ]);
    const snap = await snapshotErc20({ client, token: TOKEN, chain: 'test', fromBlock: 0n, toBlock: 4_000n, chunkSize: 500n });
    expect(snap.balances).toEqual([{ wallet: a(2), balance: 900n }]); // a(1) and a(3) are empty
    expect(snap.id).toBe(`test-${TOKEN}-4000`);
    expect(snap.takenAt).toBe(1_700_004_000);
  });

  it('shrinks the range when the provider refuses, then regrows it', async () => {
    const { client, calls } = fakeClient([t(10, ZERO, a(1), 5n)], 1_000n);
    const snap = await snapshotErc20({ client, token: TOKEN, chain: 'test', fromBlock: 0n, toBlock: 9_999n, chunkSize: 4_000n });
    expect(snap.balances).toEqual([{ wallet: a(1), balance: 5n }]);
    expect(calls.some(([f, to]) => to - f + 1n === 1_000n)).toBe(true);
    // Every block covered exactly once by successful calls.
    const ok = calls.filter(([f, to]) => to - f + 1n <= 1_000n);
    expect(ok[0]![0]).toBe(0n);
    for (let i = 1; i < ok.length; i++) expect(ok[i]![0]).toBe(ok[i - 1]![1] + 1n);
    expect(ok[ok.length - 1]![1]).toBe(9_999n);
  });

  it('fails loudly on incomplete logs', async () => {
    const { client } = fakeClient([t(10, a(1), a(2), 5n)]);
    await expect(snapshotErc20({ client, token: TOKEN, chain: 'test', fromBlock: 0n, toBlock: 100n })).rejects.toThrow(/Negative balance/);
  });
});
