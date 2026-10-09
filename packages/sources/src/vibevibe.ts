import { type Address, type PairClass, normalizeAddress } from '@scout/core';
import { type Hex, type PublicClient, hexToString, toHex } from 'viem';

/**
 * vibe/vibe on Robinhood Chain testnet, read from its public event logs.
 *
 * The contracts are not published, so the layouts below were decoded from known transactions
 * (the $SCOUT launch and its trades) and are checked against them in tests:
 *
 * - Factory `Launched(uint256 indexed id, address indexed creator, address indexed token, ...)`:
 *   data words: pool, name/symbol/uri offsets, pair token (0 = ETH), tax bps, ..., graduation target.
 * - Pool `LaunchBuy(address indexed buyer)`: [gross tokens, tokens to buyer, quote in, fee].
 * - Pool `Buy(address indexed sender, address indexed buyer)`: [gross, to buyer, tax, quote in, fee, tax bps].
 * - Pool `Sell(address indexed sender, address indexed seller)`: [tokens in, net, tax, quote out, fee].
 * - Pool `Graduated(bytes32 indexed dexPool)`: [quote, tokens, 0]. Liquidity then moves to Uniswap v4,
 *   where holders are followed through plain token transfers.
 */
export const VIBEVIBE_TESTNET = {
  chainId: 46630,
  factory: '0xe794217880011f9ca6961340ed5c16ec9559fea0' as Address,
  /** The VIBEVIBE token, which other launches can pair against. */
  vibevibeToken: '0xf1f6b050550531226ee0257fec4a1e575ff4c341' as Address,
} as const;

export const VV_TOPICS = {
  launched: '0xa7e8032bfd07a9fbcde50eabe91eb2901faee6dbddd9cced579491d9b07ef5c8',
  launchBuy: '0x5b18697b3628e2e1fc787629f624c31f0e98e273ced4f25efbb83d3865368dda',
  buy: '0x55867fe9a84ea30ad247ef1bb703eba47fd9af476149002512a2814b1e3d8fb5',
  sell: '0x3899b2b9ba4dfe77b54ff5e6f921672b2a7563ade468f2a106b25a4b808d60de',
  graduated: '0xab164bba6f9a29b6722f18be5ea821368fedba444c4f8733118f3557d77ab2ae',
} as const;

/** A raw JSON-RPC log, as eth_getLogs returns it. */
export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export interface VvLaunch {
  id: bigint;
  creator: Address;
  token: Address;
  pool: Address;
  name: string;
  symbol: string;
  uri: string;
  /** Pair token; undefined when the launch pairs against ETH. */
  pairToken?: Address;
  pairClass: PairClass;
  taxBps: number;
  /** Graduation target, in pair-token units (18 decimals). */
  graduationTarget: bigint;
  block: bigint;
  txHash: Hex;
  logIndex: number;
}

export interface VvTrade {
  pool: Address;
  wallet: Address;
  side: 'buy' | 'sell';
  /** Tokens the wallet received (buy) or sent into the pool (sell). */
  tokenAmount: bigint;
  /** Pair-token amount paid (buy) or received (sell), before fees. */
  quoteAmount: bigint;
  block: bigint;
  txHash: Hex;
  logIndex: number;
}

export interface VvGraduation {
  pool: Address;
  quoteAmount: bigint;
  tokenAmount: bigint;
  block: bigint;
  txHash: Hex;
}

const words = (data: string): bigint[] => (data.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt(`0x${w}`));
const topicAddress = (t: string | undefined): Address => normalizeAddress(`0x${(t ?? '').slice(26)}`);
const wordAddress = (w: bigint): Address => normalizeAddress(`0x${w.toString(16).padStart(40, '0')}`);

function abiString(data: string, offset: bigint): string {
  const hex = data.slice(2);
  const at = Number(offset) * 2;
  const len = Number(BigInt(`0x${hex.slice(at, at + 64)}`));
  if (!len || len > 4096) return '';
  try {
    return hexToString(`0x${hex.slice(at + 64, at + 64 + len * 2)}` as Hex);
  } catch {
    return '';
  }
}

export function pairClassOf(pairToken: Address | undefined): PairClass {
  if (!pairToken) return 'eth';
  // Everything else on vibe/vibe pairs against tokenised stocks and pre-IPO shares, or VIBEVIBE itself.
  return pairToken === VIBEVIBE_TESTNET.vibevibeToken ? 'other' : 'stock';
}

export function decodeLaunch(l: RawLog): VvLaunch {
  const w = words(l.data);
  const pairWord = w[4] ?? 0n;
  const pairToken = pairWord === 0n ? undefined : wordAddress(pairWord);
  return {
    id: BigInt(l.topics[1]!),
    creator: topicAddress(l.topics[2]),
    token: topicAddress(l.topics[3]),
    pool: wordAddress(w[0]!),
    name: abiString(l.data, w[1]!),
    symbol: abiString(l.data, w[2]!),
    uri: abiString(l.data, w[3]!),
    ...(pairToken ? { pairToken } : {}),
    pairClass: pairClassOf(pairToken),
    taxBps: Number(w[5] ?? 0n),
    graduationTarget: w[8] ?? 0n,
    block: BigInt(l.blockNumber),
    txHash: l.transactionHash as Hex,
    logIndex: Number(l.logIndex),
  };
}

/** Buy, sell or launch-buy log → trade; graduation and anything else → undefined. */
export function decodeTrade(l: RawLog): VvTrade | undefined {
  const w = words(l.data);
  const base = { pool: normalizeAddress(l.address), block: BigInt(l.blockNumber), txHash: l.transactionHash as Hex, logIndex: Number(l.logIndex) };
  switch (l.topics[0]) {
    case VV_TOPICS.launchBuy:
      return { ...base, wallet: topicAddress(l.topics[1]), side: 'buy', tokenAmount: w[1]!, quoteAmount: w[2]! };
    case VV_TOPICS.buy:
      return { ...base, wallet: topicAddress(l.topics[2]), side: 'buy', tokenAmount: w[1]!, quoteAmount: w[3]! };
    case VV_TOPICS.sell:
      return { ...base, wallet: topicAddress(l.topics[2]), side: 'sell', tokenAmount: w[0]!, quoteAmount: w[3]! };
    default:
      return undefined;
  }
}

export function decodeGraduation(l: RawLog): VvGraduation | undefined {
  if (l.topics[0] !== VV_TOPICS.graduated) return undefined;
  const w = words(l.data);
  return { pool: normalizeAddress(l.address), quoteAmount: w[0]!, tokenAmount: w[1]!, block: BigInt(l.blockNumber), txHash: l.transactionHash as Hex };
}

type RpcClient = Pick<PublicClient, 'request' | 'getBlock'>;

/**
 * Block timestamps by interpolation between anchor blocks a fixed distance apart: one RPC call per
 * anchor instead of one per block. Robinhood Chain produces blocks steadily, so the error within
 * a span is a few seconds, well inside Scout's two-minute early-buy window.
 */
export function interpolatedTimes(client: RpcClient, step = 500n) {
  const anchors = new Map<bigint, Promise<number>>();
  const at = (b: bigint) => {
    let p = anchors.get(b);
    if (!p) {
      p = client.getBlock({ blockNumber: b }).then((x) => Number(x.timestamp));
      anchors.set(b, p);
    }
    return p;
  };
  return async (block: bigint): Promise<number> => {
    const lo = (block / step) * step;
    if (lo === block) return at(block);
    try {
      const [t0, t1] = await Promise.all([at(lo), at(lo + step)]);
      return Math.round(t0 + ((t1 - t0) * Number(block - lo)) / Number(step));
    } catch {
      // The upper anchor is past the chain head: read this block directly.
      anchors.delete(lo + step);
      return at(block);
    }
  };
}

async function getLogs(client: RpcClient, params: Record<string, unknown>): Promise<RawLog[]> {
  return (await client.request({ method: 'eth_getLogs', params: [params] } as never)) as RawLog[];
}

/**
 * Reads launches, trades and graduations between two blocks. Trades are read for every pool
 * (one topic-filtered query per chunk); callers keep the ones whose pool they know.
 */
export async function readVibeVibe(opts: {
  client: RpcClient;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize?: bigint;
  factory?: Address;
}): Promise<{ launches: VvLaunch[]; trades: VvTrade[]; graduations: VvGraduation[] }> {
  const factory = opts.factory ?? VIBEVIBE_TESTNET.factory;
  let chunk = opts.chunkSize ?? 5_000n;
  const launches: VvLaunch[] = [];
  const trades: VvTrade[] = [];
  const graduations: VvGraduation[] = [];
  let cur = opts.fromBlock;
  while (cur <= opts.toBlock) {
    const end = cur + chunk - 1n > opts.toBlock ? opts.toBlock : cur + chunk - 1n;
    const range = { fromBlock: toHex(cur), toBlock: toHex(end) };
    let launchLogs: RawLog[];
    let poolLogs: RawLog[];
    try {
      [launchLogs, poolLogs] = await Promise.all([
        getLogs(opts.client, { ...range, address: factory, topics: [VV_TOPICS.launched] }),
        getLogs(opts.client, { ...range, topics: [[VV_TOPICS.launchBuy, VV_TOPICS.buy, VV_TOPICS.sell, VV_TOPICS.graduated]] }),
      ]);
    } catch (e) {
      // Too many logs in the range: halve and retry.
      if (chunk <= 100n) throw e;
      chunk /= 2n;
      continue;
    }
    for (const l of launchLogs) launches.push(decodeLaunch(l));
    for (const l of poolLogs) {
      const t = decodeTrade(l);
      if (t) trades.push(t);
      const g = decodeGraduation(l);
      if (g) graduations.push(g);
    }
    cur = end + 1n;
  }
  return { launches, trades, graduations };
}
