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

export interface ChogToken {
  tokenId: number;
  owner: Address;
  /** The number in the token's metadata and artwork file names, shown as "Chog #n". */
  meta: number;
}

/** Replaces the ownership snapshot of every Chog Genesis token. */
export async function saveChogTokens(db: Db, tokens: ChogToken[], at: number): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < tokens.length; i += 500) {
      const part = tokens.slice(i, i + 500);
      await tx.query(
        `INSERT INTO chog_tokens (token_id, owner, meta, updated_at)
         SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::bigint[])
         ON CONFLICT (token_id) DO UPDATE SET owner = EXCLUDED.owner, meta = EXCLUDED.meta, updated_at = EXCLUDED.updated_at`,
        [part.map((t) => t.tokenId), part.map((t) => t.owner), part.map((t) => t.meta), part.map(() => at)],
      );
    }
  });
}

/** When the ownership snapshot was last refreshed, or undefined if it never was. */
export async function chogTokensUpdatedAt(db: Db): Promise<number | undefined> {
  const [row] = await db.query<{ at: string | null }>('SELECT max(updated_at) AS at FROM chog_tokens');
  return row?.at == null ? undefined : Number(row.at);
}

/** The Chog Genesis tokens a wallet owns, lowest number first. */
export async function chogTokensOf(db: Db, wallet: Address): Promise<ChogToken[]> {
  const rows = await db.query<{ token_id: number; owner: string; meta: number }>(
    'SELECT token_id, owner, meta FROM chog_tokens WHERE owner = $1 ORDER BY meta',
    [wallet],
  );
  return rows.map((r) => ({ tokenId: Number(r.token_id), owner: r.owner as Address, meta: Number(r.meta) }));
}

/** The lowest-numbered Chog of each of these wallets, for avatars. */
export async function chogAvatars(db: Db, wallets: Address[]): Promise<Map<Address, number>> {
  const rows = await db.query<{ owner: string; meta: number }>(
    'SELECT owner, min(meta) AS meta FROM chog_tokens WHERE owner = ANY($1::text[]) GROUP BY owner',
    [wallets],
  );
  return new Map(rows.map((r) => [r.owner as Address, Number(r.meta)]));
}
