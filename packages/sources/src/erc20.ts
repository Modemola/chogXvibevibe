import { normalizeAddress, type Address } from '@scout/core';
import type { BalanceSnapshotRecord } from '@scout/db';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

/**
 * SPARK on Base, as given in the project notes. Verify against the official
 * announcement before relying on a snapshot.
 */
export const SPARK_BASE: Address = '0x0fb07c88bc6d195c196279523957c004eb868248';

export const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

const ZERO = '0x0000000000000000000000000000000000000000';

export interface TransferLog {
  args: { from?: string; to?: string; value?: bigint };
  blockNumber: bigint | null;
  logIndex: number | null;
}

/** The slice of a viem PublicClient the snapshotter needs. Easy to fake in tests. */
export interface Erc20LogClient {
  getLogs(args: {
    address: Address;
    event: typeof TRANSFER_EVENT;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<TransferLog[]>;
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
}

export interface SnapshotOptions {
  client: Erc20LogClient;
  token: Address;
  chain: string;
  /** Token deployment block (or any block before the first transfer). */
  fromBlock: bigint;
  toBlock: bigint;
  /** Blocks per getLogs call. Halved on provider errors, regrown on success. */
  chunkSize?: bigint;
  minChunkSize?: bigint;
  onProgress?: (p: { block: bigint; toBlock: bigint; holders: number }) => void;
}

/**
 * Rebuilds every holder's balance at `toBlock` by replaying Transfer logs.
 * Works on any RPC that serves eth_getLogs; no indexer or archive balance
 * calls needed.
 */
export async function snapshotErc20(opts: SnapshotOptions): Promise<BalanceSnapshotRecord> {
  const token = normalizeAddress(opts.token);
  const maxChunk = opts.chunkSize ?? 10_000n;
  const minChunk = opts.minChunkSize ?? 50n;
  if (opts.toBlock < opts.fromBlock) throw new Error('toBlock must be >= fromBlock');

  const balances = new Map<string, bigint>();
  let chunk = maxChunk;
  let from = opts.fromBlock;

  while (from <= opts.toBlock) {
    const to = from + chunk - 1n > opts.toBlock ? opts.toBlock : from + chunk - 1n;
    let logs: TransferLog[];
    try {
      logs = await opts.client.getLogs({ address: token, event: TRANSFER_EVENT, fromBlock: from, toBlock: to });
    } catch (e) {
      // Most providers cap results or range; shrink and retry.
      if (chunk <= minChunk) throw e;
      chunk = chunk / 2n < minChunk ? minChunk : chunk / 2n;
      continue;
    }

    logs.sort((x, y) => Number((x.blockNumber ?? 0n) - (y.blockNumber ?? 0n)) || (x.logIndex ?? 0) - (y.logIndex ?? 0));
    for (const log of logs) {
      const { from: src, to: dst, value } = log.args;
      if (src === undefined || dst === undefined || value === undefined) continue;
      const f = src.toLowerCase();
      const t = dst.toLowerCase();
      if (f !== ZERO) {
        const next = (balances.get(f) ?? 0n) - value;
        if (next < 0n) throw new Error(`Negative balance for ${f} at block ${log.blockNumber}: logs are incomplete`);
        balances.set(f, next);
      }
      if (t !== ZERO) balances.set(t, (balances.get(t) ?? 0n) + value);
    }

    opts.onProgress?.({ block: to, toBlock: opts.toBlock, holders: balances.size });
    from = to + 1n;
    if (chunk < maxChunk) chunk = chunk * 2n > maxChunk ? maxChunk : chunk * 2n;
  }

  const block = await opts.client.getBlock({ blockNumber: opts.toBlock });
  return {
    id: `${opts.chain}-${token}-${opts.toBlock}`,
    token,
    chain: opts.chain,
    block: opts.toBlock,
    takenAt: Number(block.timestamp),
    balances: [...balances.entries()]
      .filter(([, b]) => b > 0n)
      .map(([wallet, balance]) => ({ wallet: wallet as Address, balance }))
      .sort((x, y) => (x.wallet < y.wallet ? -1 : 1)),
  };
}

export function createBaseClient(rpcUrl: string): Erc20LogClient & { getBlockNumber(): Promise<bigint> } {
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}
