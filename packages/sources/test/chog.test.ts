import type { Address } from '@scout/core';
import { createPgliteDb, migrate } from '@scout/db';
import { describe, expect, it } from 'vitest';
import { CHOG_MONAD, chogArtUrl, readChogHoldings, syncChog, syncChogTokens } from '../src/chog.js';
import { chogTokensOf } from '@scout/db';

const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;

/** A fake Monad: balances per contract, and a count of multicalls so tests can see what was read. */
function fakeMonad(nft: Record<string, number>, token: Record<string, bigint>) {
  const calls: number[] = [];
  return {
    calls,
    async multicall({ contracts }: { contracts: readonly { address: string; args: readonly [string] }[] }) {
      calls.push(contracts.length);
      return contracts.map((c) => (c.address === CHOG_MONAD.nft ? BigInt(nft[c.args[0]] ?? 0) : (token[c.args[0]] ?? 0n)));
    },
  };
}

describe('Chog on Monad', () => {
  it('reads Chog Genesis counts and $CHOG balances in batches', async () => {
    const m = fakeMonad({ [a(1)]: 3 }, { [a(2)]: 5n * 10n ** 18n });
    const r = await readChogHoldings(m as never, [a(1), a(2), a(3)], 2);
    expect(r).toEqual([
      { wallet: a(1), tokens: 3, chogBalance: 0n },
      { wallet: a(2), tokens: 0, chogBalance: 5n * 10n ** 18n },
      { wallet: a(3), tokens: 0, chogBalance: 0n },
    ]);
    expect(m.calls).toEqual([4, 2]);
  });

  it('stores readings, keeps the first-seen date, and skips wallets checked recently', async () => {
    const db = await createPgliteDb();
    await migrate(db);
    const m = fakeMonad({ [a(1)]: 1 }, {});
    const first = await syncChog(db, { client: m as never, wallets: [a(1), a(2)], now: 1_000 });
    expect(first).toMatchObject({ checked: 2, holders: 1, changed: 1 });
    expect(first.statuses.get(a(1))!.heldSince).toBe(1_000);

    const cached = await syncChog(db, { client: m as never, wallets: [a(1)], now: 1_100, maxAgeSec: 600 });
    expect(cached.checked).toBe(0);
    expect(m.calls).toHaveLength(1);

    const later = await syncChog(db, { client: m as never, wallets: [a(1)], now: 5_000, maxAgeSec: 600 });
    expect(later).toMatchObject({ checked: 1, changed: 0 });
    expect(later.statuses.get(a(1))!.heldSince).toBe(1_000);
    await db.close();
  });

  it('snapshots who owns each Chog, and keeps what it can when a read is partial', async () => {
    const db = await createPgliteDb();
    await migrate(db);
    let fail = false;
    const monad = {
      async multicall({ contracts }: { contracts: readonly { functionName: string; args: readonly [bigint] }[] }) {
        return contracts.map((c) => {
          const id = Number(c.args[0]);
          if (fail && id === 3) return { status: 'failure', error: new Error('x') };
          return c.functionName === 'ownerOf'
            ? { status: 'success', result: id % 2 ? a(1) : a(2) }
            : { status: 'success', result: `ipfs://cid/${1460 + id}.json` };
        });
      },
    };
    expect(await syncChogTokens(db, { client: monad as never, now: 1_000, supply: 5 })).toEqual({ refreshed: true, tokens: 5 });
    expect((await chogTokensOf(db, a(1))).map((t) => t.meta)).toEqual([1461, 1463, 1465]);
    expect((await syncChogTokens(db, { client: monad as never, now: 1_100, maxAgeSec: 600, supply: 5 })).refreshed).toBe(false);
    fail = true;
    expect(await syncChogTokens(db, { client: monad as never, now: 9_000, maxAgeSec: 600, supply: 5 })).toEqual({ refreshed: false, tokens: 4 });
    expect((await chogTokensOf(db, a(1))).map((t) => t.meta)).toEqual([1461, 1463, 1465]);
    // A partial first scan on an empty table is kept, and the next call fills in the rest even within maxAgeSec.
    const fresh = await createPgliteDb();
    await migrate(fresh);
    expect(await syncChogTokens(fresh, { client: monad as never, now: 1_000, supply: 5 })).toEqual({ refreshed: false, tokens: 4 });
    expect((await chogTokensOf(fresh, a(1))).map((t) => t.meta)).toEqual([1461, 1465]);
    fail = false;
    expect(await syncChogTokens(fresh, { client: monad as never, now: 1_010, maxAgeSec: 600, supply: 5 })).toEqual({ refreshed: true, tokens: 5 });
    expect((await chogTokensOf(fresh, a(1))).map((t) => t.meta)).toEqual([1461, 1463, 1465]);
    await fresh.close();
    expect(chogArtUrl(1462)).toBe(`https://gateway.pinata.cloud/ipfs/${CHOG_MONAD.artCid}/1462.webp`);
    await db.close();
  });
});
