import type { Address } from '@scout/core';
import type { Db } from './client.js';

export interface ChogStatusRecord {
  wallet: Address;
  tokens: number;
  chogBalance: bigint;
  /** When Scout first saw this wallet holding a Chog; undefined while it holds none. */
  heldSince?: number;
  checkedAt: number;
}

/**
 * Records a fresh Monad reading. "Held since" starts the first time a wallet is seen holding a
 * Chog, carries over while it keeps holding, and clears once it holds none.
 */
export async function saveChogStatus(db: Db, s: { wallet: Address; tokens: number; chogBalance: bigint; checkedAt: number }): Promise<ChogStatusRecord> {
  const [row] = await db.query<{ held_since: string | null }>(
    `INSERT INTO chog_status (wallet, tokens, chog_balance, held_since, checked_at)
     VALUES ($1, $2, $3, CASE WHEN $2 > 0 THEN $4::bigint END, $4)
     ON CONFLICT (wallet) DO UPDATE SET
       tokens = EXCLUDED.tokens,
       chog_balance = EXCLUDED.chog_balance,
       held_since = CASE WHEN EXCLUDED.tokens > 0 THEN COALESCE(chog_status.held_since, EXCLUDED.held_since) END,
       checked_at = EXCLUDED.checked_at
     RETURNING held_since`,
    [s.wallet, s.tokens, s.chogBalance.toString(), s.checkedAt],
  );
  const heldSince = row?.held_since == null ? undefined : Number(row.held_since);
  return { ...s, ...(heldSince !== undefined ? { heldSince } : {}) };
}

export async function getChogStatus(db: Db, wallets: Address[]): Promise<Map<Address, ChogStatusRecord>> {
  const rows = await db.query<{ wallet: string; tokens: number; chog_balance: string; held_since: string | null; checked_at: string }>(
    'SELECT wallet, tokens, chog_balance::text AS chog_balance, held_since, checked_at FROM chog_status WHERE wallet = ANY($1::text[])',
    [wallets],
  );
  const out = new Map<Address, ChogStatusRecord>();
  for (const r of rows) {
    out.set(r.wallet as Address, {
      wallet: r.wallet as Address,
      tokens: Number(r.tokens),
      chogBalance: BigInt(r.chog_balance),
      ...(r.held_since != null ? { heldSince: Number(r.held_since) } : {}),
      checkedAt: Number(r.checked_at),
    });
  }
  return out;
}

/** Holders Scout knows of, most Chogs first. */
export async function listChogHolders(db: Db, limit = 200): Promise<ChogStatusRecord[]> {
  const rows = await db.query<{ wallet: string }>(
    'SELECT wallet FROM chog_status WHERE tokens > 0 ORDER BY tokens DESC, held_since ASC, wallet LIMIT $1',
    [limit],
  );
  const map = await getChogStatus(db, rows.map((r) => r.wallet as Address));
  return rows.map((r) => map.get(r.wallet as Address)!);
}
