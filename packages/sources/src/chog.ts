import { type Address, normalizeAddress } from '@scout/core';
import { type Db, getChogStatus, saveChogStatus, type ChogStatusRecord } from '@scout/db';
import { type PublicClient, createPublicClient, defineChain, erc20Abi, erc721Abi, http } from 'viem';

/** Chog on Monad mainnet. Scout only reads it: the same address holds Chogs on Monad and trades on vibe/vibe. */
export const CHOG_MONAD = {
  chainId: 143,
  rpc: 'https://rpc.monad.xyz',
  /** Chog Genesis, ERC-721, 1,969 supply. */
  nft: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763' as Address,
  /** $CHOG, ERC-20, 18 decimals. */
  token: '0x350035555e10d9afaf1566aaebfced5ba6c27777' as Address,
} as const;

export const monadChain = defineChain({
  id: CHOG_MONAD.chainId,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [CHOG_MONAD.rpc] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});

export function monadClient(rpcUrl: string = CHOG_MONAD.rpc): PublicClient {
  return createPublicClient({ chain: monadChain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) }) as PublicClient;
}

export interface ChogHolding {
  wallet: Address;
  tokens: number;
  chogBalance: bigint;
}

/** Chog Genesis count and $CHOG balance for each wallet, two calls per wallet batched through Multicall3. */
export async function readChogHoldings(client: Pick<PublicClient, 'multicall'>, wallets: Address[], batch = 200): Promise<ChogHolding[]> {
  const out: ChogHolding[] = [];
  for (let i = 0; i < wallets.length; i += batch) {
    const slice = wallets.slice(i, i + batch).map(normalizeAddress);
    const results = await client.multicall({
      allowFailure: false,
      contracts: slice.flatMap((w) => [
        { address: CHOG_MONAD.nft, abi: erc721Abi, functionName: 'balanceOf', args: [w] } as const,
        { address: CHOG_MONAD.token, abi: erc20Abi, functionName: 'balanceOf', args: [w] } as const,
      ]),
    });
    slice.forEach((wallet, j) => {
      out.push({ wallet, tokens: Number(results[2 * j] as bigint), chogBalance: results[2 * j + 1] as bigint });
    });
  }
  return out;
}

/**
 * Reads wallets' Chog holdings from Monad and stores them. Wallets checked within `maxAgeSec`
 * are skipped, so page visits don't hammer the public RPC.
 */
export async function syncChog(
  db: Db,
  opts: { client: Pick<PublicClient, 'multicall'>; wallets: Address[]; now?: number; maxAgeSec?: number },
): Promise<{ checked: number; holders: number; statuses: Map<Address, ChogStatusRecord> }> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const wallets = [...new Set(opts.wallets.map(normalizeAddress))];
  const known = await getChogStatus(db, wallets);
  const stale = wallets.filter((w) => {
    const k = known.get(w);
    return !k || now - k.checkedAt >= (opts.maxAgeSec ?? 0);
  });
  const statuses = new Map(known);
  let holders = 0;
  if (stale.length) {
    for (const h of await readChogHoldings(opts.client, stale)) {
      const saved = await saveChogStatus(db, { ...h, checkedAt: now });
      statuses.set(h.wallet, saved);
      if (h.tokens > 0) holders++;
    }
  }
  return { checked: stale.length, holders, statuses };
}
