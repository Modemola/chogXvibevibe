import { type Address, normalizeAddress } from '@scout/core';
import { type Db, getCursor, setCursor, writeBatch } from '@scout/db';
import { type LogClient, readScoutDropEvents, readTokenTransfers } from '@scout/sources';

export interface IngestResult {
  fromBlock: bigint;
  toBlock: bigint;
  drops: number;
  /** Drops whose token isn't an indexed launch. Their claims are not recorded. */
  unknownTokens: Address[];
  claims: number;
  claimsRecorded: number;
  transfers: number;
}

const eventsCursor = (contract: Address) => `scoutdrop:${contract}`;
const transfersCursor = (token: string) => `transfers:${token}`;

/**
 * Pulls ScoutDrop events and launch-token transfers from the chain into the
 * database, from where the last run stopped. Each claim becomes a Scout drop
 * for aftermath, using the amount the recipient actually received (a taxed
 * token delivers less than the claimed amount). Safe to re-run.
 */
export async function ingestScoutDrops(
  db: Db,
  opts: { client: LogClient; contract: Address; startBlock: bigint; toBlock: bigint; chunkSize?: bigint; now?: number },
): Promise<IngestResult> {
  const contract = normalizeAddress(opts.contract);
  const cursor = await getCursor<{ block: string }>(db, eventsCursor(contract));
  const fromBlock = cursor ? BigInt(cursor.block) + 1n : opts.startBlock;
  const result: IngestResult = { fromBlock, toBlock: opts.toBlock, drops: 0, unknownTokens: [], claims: 0, claimsRecorded: 0, transfers: 0 };
  if (fromBlock > opts.toBlock) return result;

  const events = await readScoutDropEvents({ client: opts.client, contract, fromBlock, toBlock: opts.toBlock, chunkSize: opts.chunkSize });

  // 1. Drops, linked to launches by token.
  for (const d of events.drops) {
    const [launch] = await db.query<{ id: string }>('SELECT id FROM launches WHERE token = $1 ORDER BY created_at LIMIT 1', [d.token]);
    if (!launch) result.unknownTokens.push(d.token);
    await db.query(
      `INSERT INTO onchain_drops (contract, drop_id, token, creator, launch_id, merkle_root, policy_hash, total, deadline, sink, created_at, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING`,
      [contract, d.dropId.toString(), d.token, d.creator, launch?.id ?? null, d.merkleRoot, d.policyHash, d.total.toString(), d.deadline, d.sink, d.createdAt, d.txHash],
    );
    // Start following this token's transfers from the drop's block.
    const tc = await getCursor<{ block: string }>(db, transfersCursor(d.token));
    if (!tc) await setCursor(db, transfersCursor(d.token), { block: (d.blockNumber - 1n).toString() }, d.createdAt);
    result.drops++;
  }

  // 2. Transfers for every token this contract has dropped, each from its own cursor.
  const tokens = await db.query<{ token: string }>('SELECT DISTINCT token FROM onchain_drops WHERE contract = $1 ORDER BY token', [contract]);
  for (const { token } of tokens) {
    const tc = await getCursor<{ block: string }>(db, transfersCursor(token));
    const from = tc ? BigInt(tc.block) + 1n : fromBlock;
    if (from > opts.toBlock) continue;
    const transfers = await readTokenTransfers({ client: opts.client, token: token as Address, fromBlock: from, toBlock: opts.toBlock, chunkSize: opts.chunkSize });
    await writeBatch(db, { transfers });
    await setCursor(db, transfersCursor(token), { block: opts.toBlock.toString() }, opts.now ?? 0);
    result.transfers += transfers.length;
  }

  // 3. Claims → scout_drops, at the amount actually received.
  for (const c of events.claims) {
    result.claims++;
    const [drop] = await db.query<{ launch_id: string | null; token: string }>(
      'SELECT launch_id, token FROM onchain_drops WHERE contract = $1 AND drop_id = $2',
      [contract, c.dropId.toString()],
    );
    if (!drop?.launch_id) continue;
    const [received] = await db.query<{ amount: string | null }>(
      `SELECT sum(amount)::text AS amount FROM transfers WHERE token = $1 AND tx_hash = $2 AND "from" = $3 AND "to" = $4`,
      [drop.token, c.txHash, contract, c.account],
    );
    const amount = received?.amount ? BigInt(received.amount) : c.amount;
    const inserted = await db.query(
      `INSERT INTO scout_drops (launch_id, wallet, amount, received_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING RETURNING wallet`,
      [drop.launch_id, c.account, amount.toString(), c.ts],
    );
    if (inserted.length) result.claimsRecorded++;
  }

  // 4. Running totals.
  for (const c of events.claims) {
    await db.query('UPDATE onchain_drops SET claimed = claimed + $3 WHERE contract = $1 AND drop_id = $2', [contract, c.dropId.toString(), c.amount.toString()]);
  }
  for (const s of events.sweeps) {
    await db.query('UPDATE onchain_drops SET swept_at = $3 WHERE contract = $1 AND drop_id = $2', [contract, s.dropId.toString(), s.ts]);
  }

  await setCursor(db, eventsCursor(contract), { block: opts.toBlock.toString() }, opts.now ?? 0);
  return result;
}
