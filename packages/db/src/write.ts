import type { Db } from './client.js';
import type { RecordBatch } from './records.js';

const CHUNK = 5_000;

interface Column {
  name: string;
  type: 'text' | 'integer' | 'bigint' | 'numeric' | 'boolean' | 'double precision';
}

function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  return v;
}

/**
 * Bulk insert via unnest(): one parameter per column instead of one per cell,
 * so a 5k-row chunk is a single round trip on both Postgres and PGlite.
 */
async function insertRows(db: Db, table: string, columns: Column[], rows: unknown[][], onConflict: string) {
  const colList = columns.map((c) => `"${c.name}"`).join(', ');
  const unnest = columns.map((c, i) => `$${i + 1}::${c.type}[]`).join(', ');
  const sql = `INSERT INTO ${table} (${colList}) SELECT * FROM unnest(${unnest}) ${onConflict}`;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const params = columns.map((_, i) => chunk.map((r) => toParam(r[i])));
    await db.query(sql, params);
  }
}

const col = (name: string, type: Column['type']): Column => ({ name, type });

/**
 * Writes a batch idempotently in one transaction. Re-writing the same batch
 * changes nothing; mutable facts (graduation, rug flags, Viber levels, guild
 * standing, drop outcomes) are updated in place.
 */
export async function writeBatch(db: Db, batch: RecordBatch): Promise<void> {
  await db.transaction(async (tx) => {
    if (batch.launches?.length) {
      await insertRows(
        tx,
        'launches',
        [
          col('id', 'text'), col('token', 'text'), col('creator', 'text'), col('lane', 'text'),
          col('pair_class', 'text'), col('pair_token', 'text'), col('tax_bps', 'integer'),
          col('created_at', 'bigint'), col('graduated_at', 'bigint'), col('has_product_links', 'boolean'),
          col('flagged_rug', 'boolean'),
        ],
        batch.launches.map((l) => [
          l.id, l.token, l.creator, l.lane, l.pairClass, l.pairToken, l.taxBps, l.createdAt, l.graduatedAt,
          l.hasProductLinks, l.flaggedRug,
        ]),
        `ON CONFLICT (id) DO UPDATE SET
           graduated_at = EXCLUDED.graduated_at,
           has_product_links = EXCLUDED.has_product_links,
           flagged_rug = EXCLUDED.flagged_rug`,
      );
    }

    if (batch.trades?.length) {
      await insertRows(
        tx,
        'trades',
        [
          col('tx_hash', 'text'), col('log_index', 'integer'), col('launch_id', 'text'), col('wallet', 'text'),
          col('side', 'text'), col('token_amount', 'numeric'), col('volume_usd', 'double precision'), col('ts', 'bigint'),
        ],
        batch.trades.map((t) => [t.txHash, t.logIndex, t.launchId, t.wallet, t.side, t.tokenAmount, t.volumeUsd, t.ts]),
        'ON CONFLICT DO NOTHING',
      );
    }

    if (batch.funding?.length) {
      await insertRows(
        tx,
        'wallet_funding',
        [col('wallet', 'text'), col('funder', 'text'), col('ts', 'bigint')],
        batch.funding.map((f) => [f.wallet, f.funder, f.ts]),
        // Keep the earliest funding we have ever seen.
        `ON CONFLICT (wallet) DO UPDATE SET funder = EXCLUDED.funder, ts = EXCLUDED.ts
           WHERE EXCLUDED.ts < wallet_funding.ts`,
      );
    }

    if (batch.scoutDrops?.length) {
      await insertRows(
        tx,
        'scout_drops',
        [col('launch_id', 'text'), col('wallet', 'text'), col('amount', 'numeric'), col('received_at', 'bigint')],
        batch.scoutDrops.map((d) => [d.launchId, d.wallet, d.amount, d.receivedAt]),
        'ON CONFLICT DO NOTHING',
      );
    }

    if (batch.dropOutcomes?.length) {
      await insertRows(
        tx,
        'drop_outcomes',
        [col('launch_id', 'text'), col('wallet', 'text'), col('window', 'text'), col('sold_bps', 'integer')],
        batch.dropOutcomes.map((o) => [o.launchId, o.wallet, o.window, o.soldBps]),
        'ON CONFLICT (launch_id, wallet, "window") DO UPDATE SET sold_bps = EXCLUDED.sold_bps',
      );
    }

    for (const s of batch.snapshots ?? []) {
      const [created] = await tx.query(
        `INSERT INTO snapshots (id, token, chain, block, taken_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [s.id, s.token, s.chain, s.block.toString(), s.takenAt],
      );
      if (!created) continue; // snapshots are immutable once written
      await insertRows(
        tx,
        'snapshot_balances',
        [col('snapshot_id', 'text'), col('wallet', 'text'), col('balance', 'numeric')],
        s.balances.map((b) => [s.id, b.wallet, b.balance]),
        'ON CONFLICT DO NOTHING',
      );
    }

    if (batch.vibers?.length) {
      await insertRows(
        tx,
        'vibers',
        [col('token_id', 'text'), col('wallet', 'text'), col('level', 'integer'), col('last_charged_at', 'bigint')],
        batch.vibers.map((v) => [v.tokenId, v.wallet, v.level, v.lastChargedAt]),
        `ON CONFLICT (token_id) DO UPDATE SET wallet = EXCLUDED.wallet, level = EXCLUDED.level,
           last_charged_at = EXCLUDED.last_charged_at`,
      );
    }

    if (batch.guildMembers?.length) {
      await insertRows(
        tx,
        'guild_members',
        [col('guild_id', 'text'), col('wallet', 'text'), col('good_standing', 'boolean')],
        batch.guildMembers.map((g) => [g.guildId, g.wallet, g.goodStanding]),
        'ON CONFLICT (guild_id, wallet) DO UPDATE SET good_standing = EXCLUDED.good_standing',
      );
    }

    if (batch.profiles?.length) {
      await insertRows(
        tx,
        'profiles',
        [col('wallet', 'text'), col('opted_in_at', 'bigint'), col('message', 'text'), col('signature', 'text')],
        batch.profiles.map((p) => [p.wallet, p.optedInAt, p.message, p.signature]),
        'ON CONFLICT (wallet) DO NOTHING',
      );
    }

    if (batch.links?.length) {
      await insertRows(
        tx,
        'wallet_links',
        [
          col('wallet', 'text'), col('primary_wallet', 'text'), col('linked_at', 'bigint'), col('signature', 'text'),
          col('primary_signature', 'text'),
        ],
        batch.links.map((l) => [l.wallet, l.primaryWallet, l.linkedAt, l.signature, l.primarySignature]),
        `ON CONFLICT (wallet) DO UPDATE SET primary_wallet = EXCLUDED.primary_wallet,
           linked_at = EXCLUDED.linked_at, signature = EXCLUDED.signature,
           primary_signature = EXCLUDED.primary_signature`,
      );
    }

    if (batch.transfers?.length) {
      await insertRows(
        tx,
        'transfers',
        [
          col('token', 'text'), col('tx_hash', 'text'), col('log_index', 'integer'), col('from', 'text'),
          col('to', 'text'), col('amount', 'numeric'), col('ts', 'bigint'),
        ],
        batch.transfers.map((t) => [t.token, t.txHash, t.logIndex, t.from, t.to, t.amount, t.ts]),
        'ON CONFLICT DO NOTHING',
      );
    }

    if (batch.holdContracts?.length) {
      await insertRows(
        tx,
        'hold_contracts',
        [col('address', 'text'), col('label', 'text')],
        batch.holdContracts.map((h) => [h.address, h.label]),
        'ON CONFLICT (address) DO UPDATE SET label = EXCLUDED.label',
      );
    }

    if (batch.simLabels?.length) {
      await insertRows(
        tx,
        'sim_labels',
        [col('wallet', 'text'), col('persona', 'text'), col('farm_id', 'text')],
        batch.simLabels.map((s) => [s.wallet, s.persona, s.farmId]),
        'ON CONFLICT (wallet) DO UPDATE SET persona = EXCLUDED.persona, farm_id = EXCLUDED.farm_id',
      );
    }
  });
}

export async function getCursor<T>(db: Db, source: string): Promise<T | undefined> {
  const [row] = await db.query<{ cursor: T }>('SELECT cursor FROM source_cursors WHERE source = $1', [source]);
  return row?.cursor;
}

export async function setCursor(db: Db, source: string, cursor: unknown, now: number): Promise<void> {
  await db.query(
    `INSERT INTO source_cursors (source, cursor, updated_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (source) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = EXCLUDED.updated_at`,
    [source, JSON.stringify(cursor), now],
  );
}
