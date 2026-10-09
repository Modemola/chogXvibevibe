import type { Address } from '@scout/core';
import { type Db, getCursor, setCursor, writeBatch } from '@scout/db';
import type { PublicClient } from 'viem';
import { VIBEVIBE_TESTNET, interpolatedTimes, readVibeVibe } from './vibevibe.js';

const CURSOR = `vibevibe:${VIBEVIBE_TESTNET.chainId}`;
/** Launch ids for real vibe/vibe launches, so they never collide with simulated ones. */
export const liveLaunchId = (n: bigint | number | string) => `vv-${n}`;

export interface VvIngestResult {
  fromBlock: bigint;
  toBlock: bigint;
  head: bigint;
  launches: number;
  trades: number;
  /** Trades in pools launched before indexing started; their launch is unknown, so they are skipped. */
  tradesSkipped: number;
  graduations: number;
  caughtUp: boolean;
}

/**
 * Pulls real vibe/vibe launches, trades and graduations into the database, from where the last
 * run stopped (or `startBlock`), at most `maxBlocks` per call so it fits a serverless request.
 * Safe to re-run: every write is keyed, and the cursor only moves after a range is stored.
 *
 * vibe/vibe has no lanes; live launches are stored as 'meme', the lane with no quality bonus,
 * until creators can declare one.
 */
export async function ingestVibeVibe(
  db: Db,
  opts: { client: Pick<PublicClient, 'request' | 'getBlock' | 'getBlockNumber'>; startBlock: bigint; maxBlocks?: bigint; toBlock?: bigint; chunkSize?: bigint; now?: number },
): Promise<VvIngestResult> {
  const cursor = await getCursor<{ block: string }>(db, CURSOR);
  const fromBlock = cursor ? BigInt(cursor.block) + 1n : opts.startBlock;
  const head = opts.toBlock ?? (await opts.client.getBlockNumber());
  const max = opts.maxBlocks ?? 50_000n;
  const toBlock = fromBlock + max - 1n < head ? fromBlock + max - 1n : head;
  const result: VvIngestResult = { fromBlock, toBlock, head, launches: 0, trades: 0, tradesSkipped: 0, graduations: 0, caughtUp: toBlock >= head };
  if (fromBlock > toBlock) return { ...result, caughtUp: true };

  const read = await readVibeVibe({ client: opts.client, fromBlock, toBlock, chunkSize: opts.chunkSize });
  const time = interpolatedTimes(opts.client);

  await db.transaction(async (tx) => {
    for (const l of read.launches) {
      const id = liveLaunchId(l.id);
      const created = await time(l.block);
      const inserted = await tx.query(
        `INSERT INTO launches (id, token, creator, lane, pair_class, pair_token, tax_bps, created_at, has_product_links, flagged_rug)
         VALUES ($1, $2, $3, 'meme', $4, $5, $6, $7, false, false) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, l.token, l.creator, l.pairClass, l.pairToken ?? null, l.taxBps, created],
      );
      await tx.query(
        `INSERT INTO vv_launches (launch_id, number, pool, name, symbol, uri, block, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [id, l.id.toString(), l.pool, l.name.slice(0, 200), l.symbol.slice(0, 50), l.uri.slice(0, 500), l.block.toString(), l.txHash],
      );
      if (inserted.length) result.launches++;
    }

    const pools = [...new Set([...read.trades.map((t) => t.pool), ...read.graduations.map((g) => g.pool)])];
    const known = new Map<string, string>();
    for (let i = 0; i < pools.length; i += 500) {
      const rows = await tx.query<{ pool: string; launch_id: string }>('SELECT pool, launch_id FROM vv_launches WHERE pool = ANY($1::text[])', [
        pools.slice(i, i + 500),
      ]);
      for (const r of rows) known.set(r.pool, r.launch_id);
    }

    const trades = [];
    for (const t of read.trades) {
      const launchId = known.get(t.pool);
      if (!launchId) {
        result.tradesSkipped++;
        continue;
      }
      trades.push({
        txHash: t.txHash,
        logIndex: t.logIndex,
        launchId,
        wallet: t.wallet as Address,
        side: t.side,
        tokenAmount: t.tokenAmount,
        // Pair-token units (ETH for most launches). Scoring only uses volume as a weight between a wallet's positions.
        volumeUsd: Number(t.quoteAmount) / 1e18,
        ts: await time(t.block),
      });
    }
    if (trades.length) await writeBatch(tx, { trades });
    result.trades = trades.length;

    for (const g of read.graduations) {
      const launchId = known.get(g.pool);
      if (!launchId) continue;
      const updated = await tx.query('UPDATE launches SET graduated_at = $2 WHERE id = $1 AND graduated_at IS NULL RETURNING id', [
        launchId,
        await time(g.block),
      ]);
      result.graduations += updated.length;
    }
    await setCursor(tx, CURSOR, { block: toBlock.toString() }, opts.now ?? Math.floor(Date.now() / 1000));
  });
  return result;
}

/** How far live indexing has got: the last block stored, and when. */
export async function liveSyncState(db: Db): Promise<{ block: bigint; updatedAt: number } | undefined> {
  const [row] = await db.query<{ cursor: { block: string }; updated_at: string }>('SELECT cursor, updated_at FROM source_cursors WHERE source = $1', [CURSOR]);
  return row ? { block: BigInt(row.cursor.block), updatedAt: Number(row.updated_at) } : undefined;
}
