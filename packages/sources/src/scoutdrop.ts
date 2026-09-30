import { type Address, normalizeAddress } from '@scout/core';
import { ScoutDrop } from '@scout/contracts';
import type { TransferRecord } from '@scout/db';
import { type Log, type PublicClient, createPublicClient, http, parseEventLogs } from 'viem';
import { TRANSFER_EVENT } from './erc20.js';

/**
 * Reads ScoutDrop contract events and launch-token transfers from any EVM RPC
 * (Robinhood Chain testnet once its contracts are known). Everything returned
 * is plain records; the indexer decides what to store.
 */

export type LogClient = Pick<PublicClient, 'getLogs' | 'getBlock'>;

export interface OnchainDrop {
  contract: Address;
  dropId: bigint;
  token: Address;
  creator: Address;
  merkleRoot: `0x${string}`;
  policyHash: `0x${string}`;
  total: bigint;
  deadline: number;
  sink: Address;
  createdAt: number;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface OnchainClaim {
  contract: Address;
  dropId: bigint;
  account: Address;
  amount: bigint;
  ts: number;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: number;
}

export interface OnchainSweep {
  contract: Address;
  dropId: bigint;
  amount: bigint;
  ts: number;
}

/** Calls `fetch` over [from, to] in chunks, halving on provider errors and regrowing on success. */
export async function chunked<T>(
  from: bigint,
  to: bigint,
  fetch: (from: bigint, to: bigint) => Promise<T[]>,
  opts: { chunkSize?: bigint; minChunkSize?: bigint } = {},
): Promise<T[]> {
  const max = opts.chunkSize ?? 10_000n;
  const min = opts.minChunkSize ?? 50n;
  const out: T[] = [];
  let chunk = max;
  let cur = from;
  while (cur <= to) {
    const end = cur + chunk - 1n > to ? to : cur + chunk - 1n;
    try {
      out.push(...(await fetch(cur, end)));
    } catch (e) {
      if (chunk <= min) throw e;
      chunk = chunk / 2n < min ? min : chunk / 2n;
      continue;
    }
    cur = end + 1n;
    if (chunk < max) chunk = chunk * 2n > max ? max : chunk * 2n;
  }
  return out;
}

/** Block timestamps, fetched once per block. */
export function blockTimes(client: LogClient) {
  const cache = new Map<bigint, Promise<number>>();
  return (blockNumber: bigint) => {
    let p = cache.get(blockNumber);
    if (!p) {
      p = client.getBlock({ blockNumber }).then((b) => Number(b.timestamp));
      cache.set(blockNumber, p);
    }
    return p;
  };
}

const ordered = (a: Log, b: Log) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) || (a.logIndex ?? 0) - (b.logIndex ?? 0);

export async function readScoutDropEvents(opts: {
  client: LogClient;
  contract: Address;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize?: bigint;
}): Promise<{ drops: OnchainDrop[]; claims: OnchainClaim[]; sweeps: OnchainSweep[] }> {
  const contract = normalizeAddress(opts.contract);
  const time = blockTimes(opts.client);
  const logs = (
    await chunked(opts.fromBlock, opts.toBlock, (fromBlock, toBlock) => opts.client.getLogs({ address: contract, fromBlock, toBlock }), {
      chunkSize: opts.chunkSize,
    })
  ).sort(ordered);
  const parsed = parseEventLogs({ abi: ScoutDrop.abi, logs });

  const drops: OnchainDrop[] = [];
  const claims: OnchainClaim[] = [];
  const sweeps: OnchainSweep[] = [];
  for (const ev of parsed) {
    const ts = await time(ev.blockNumber!);
    if (ev.eventName === 'DropCreated') {
      drops.push({
        contract,
        dropId: ev.args.dropId,
        token: normalizeAddress(ev.args.token),
        creator: normalizeAddress(ev.args.creator),
        merkleRoot: ev.args.merkleRoot,
        policyHash: ev.args.policyHash,
        total: ev.args.total,
        deadline: Number(ev.args.deadline),
        sink: normalizeAddress(ev.args.sink),
        createdAt: ts,
        blockNumber: ev.blockNumber!,
        txHash: ev.transactionHash!,
      });
    } else if (ev.eventName === 'Claimed') {
      claims.push({
        contract,
        dropId: ev.args.dropId,
        account: normalizeAddress(ev.args.account),
        amount: ev.args.amount,
        ts,
        blockNumber: ev.blockNumber!,
        txHash: ev.transactionHash!,
        logIndex: ev.logIndex!,
      });
    } else if (ev.eventName === 'Swept') {
      sweeps.push({ contract, dropId: ev.args.dropId, amount: ev.args.amount, ts });
    }
  }
  return { drops, claims, sweeps };
}

/** Every Transfer of `token` in the block range, with block timestamps. */
export async function readTokenTransfers(opts: {
  client: LogClient;
  token: Address;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize?: bigint;
}): Promise<TransferRecord[]> {
  const token = normalizeAddress(opts.token);
  const time = blockTimes(opts.client);
  const logs = await chunked(
    opts.fromBlock,
    opts.toBlock,
    (fromBlock, toBlock) => opts.client.getLogs({ address: token, event: TRANSFER_EVENT, fromBlock, toBlock }),
    { chunkSize: opts.chunkSize },
  );
  const out: TransferRecord[] = [];
  for (const log of logs.sort(ordered)) {
    const { from, to, value } = log.args;
    if (!from || !to || value === undefined) continue;
    out.push({
      token,
      txHash: log.transactionHash!,
      logIndex: log.logIndex!,
      from: normalizeAddress(from),
      to: normalizeAddress(to),
      amount: value,
      ts: await time(log.blockNumber!),
    });
  }
  return out;
}

/** A read-only client for any EVM JSON-RPC endpoint (e.g. Robinhood Chain testnet). */
export function createRpcClient(rpcUrl: string): LogClient & Pick<PublicClient, 'getBlockNumber'> {
  return createPublicClient({ transport: http(rpcUrl, { retryCount: 3 }) }) as PublicClient;
}
