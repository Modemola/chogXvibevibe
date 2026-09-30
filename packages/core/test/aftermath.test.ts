import { describe, expect, it } from 'vitest';
import { type TokenTransfer, measureDrop, summarizeAftermath } from '../src/index.js';
import { addr } from './fixtures.js';

const W = addr(1);
const ALT = addr(2);
const POOL = addr(0x9001);
const SENDER = addr(0x5e);
const LOCKER = addr(0x10c);
const T = 1_790_000_000;
const H = 3_600;
const D = 86_400;
let n = 0;
const tr = (from: string, to: string, amount: bigint, ts: number): TokenTransfer => ({
  txHash: `0x${(++n).toString(16).padStart(64, '0')}`,
  logIndex: 0,
  from: from as TokenTransfer['from'],
  to: to as TokenTransfer['to'],
  amount,
  ts,
});
const drop = tr(SENDER, W, 1_000n, T);
const base = { wallet: W, amount: 1_000n, receivedAt: T };

describe('measureDrop', () => {
  it('measures cumulative selling per elapsed window', () => {
    const r = measureDrop({
      ...base,
      transfers: [drop, tr(W, POOL, 100n, T + 10 * 60), tr(W, POOL, 200n, T + 5 * H), tr(W, POOL, 300n, T + 10 * D)],
      asOf: T + 40 * D,
    });
    expect(r).toEqual({ observed: true, balanceBefore: 0n, sold: { h1: 1_000, h24: 3_000, d7: 3_000, d30: 6_000 } });
  });

  it('only reports windows that have ended', () => {
    const r = measureDrop({ ...base, transfers: [drop, tr(W, POOL, 1_000n, T + 60)], asOf: T + 2 * D });
    expect(r.observed && r.sold).toEqual({ h1: 10_000, h24: 10_000 });
  });

  it('counts a dump even if the wallet buys back later', () => {
    const r = measureDrop({ ...base, transfers: [drop, tr(W, POOL, 1_000n, T + 60), tr(POOL, W, 1_000n, T + 120)], asOf: T + 31 * D });
    expect(r.observed && r.sold.d30).toBe(10_000);
  });

  it('pre-existing tokens are fungible, and selling is capped at the drop', () => {
    const r = measureDrop({ ...base, transfers: [tr(POOL, W, 500n, T - D), drop, tr(W, POOL, 1_500n, T + 60)], asOf: T + 2 * H });
    expect(r).toMatchObject({ observed: true, balanceBefore: 500n, sold: { h1: 10_000 } });
  });

  it('moving to a linked wallet or a hold contract is not selling', () => {
    const r = measureDrop({
      ...base,
      transfers: [drop, tr(W, ALT, 400n, T + 60), tr(W, LOCKER, 500n, T + 120), tr(ALT, POOL, 100n, T + 30 * 60)],
      linked: [ALT],
      holdContracts: [LOCKER],
      asOf: T + 2 * H,
    });
    expect(r.observed && r.sold.h1).toBe(1_000);
    // Without the link and the locker, the same history reads as a 90% dump.
    const naive = measureDrop({ ...base, transfers: [drop, tr(W, ALT, 400n, T + 60), tr(W, LOCKER, 500n, T + 120)], asOf: T + 2 * H });
    expect(naive.observed && naive.sold.h1).toBe(9_000);
  });

  it('includes transfers exactly on the window boundary, and ignores ones after', () => {
    const r = measureDrop({ ...base, transfers: [drop, tr(W, POOL, 100n, T + H), tr(W, POOL, 100n, T + H + 1)], asOf: T + 2 * H });
    expect(r.observed && r.sold.h1).toBe(1_000);
  });

  it('is unobserved when the drop transfer is missing', () => {
    expect(measureDrop({ ...base, transfers: [tr(W, POOL, 1n, T + 60)], asOf: T + D })).toMatchObject({ observed: false });
  });

  it('is independent of transfer order', () => {
    const transfers = [drop, tr(W, POOL, 100n, T + 60), tr(POOL, W, 50n, T + 90), tr(W, POOL, 300n, T + 2 * D)];
    const a = measureDrop({ ...base, transfers, asOf: T + 8 * D });
    const b = measureDrop({ ...base, transfers: [...transfers].reverse(), asOf: T + 8 * D });
    expect(b).toEqual(a);
  });
});

describe('summarizeAftermath', () => {
  it('buckets recipients and weights retention by amount', () => {
    const s = summarizeAftermath([
      { wallet: addr(1), amount: 3_000n, sold: { h1: 0 } },
      { wallet: addr(2), amount: 1_000n, sold: { h1: 10_000 } },
      { wallet: addr(3), amount: 1_000n, sold: { h1: 2_000 } },
      { wallet: addr(4), amount: 1_000n, sold: {} },
    ]);
    expect(s[0]).toEqual({ window: 'h1', measured: 3, retained: 0.76, held: 1, trimmed: 1, mostlySold: 0, dumped: 1 });
    expect(s[3]!.measured).toBe(0);
  });
});
