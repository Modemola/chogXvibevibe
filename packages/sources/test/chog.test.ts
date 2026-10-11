import type { Address } from '@scout/core';
import { createPgliteDb, migrate } from '@scout/db';
import { describe, expect, it } from 'vitest';
import { CHOG_MONAD, readChogHoldings, syncChog } from '../src/chog.js';

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
});
