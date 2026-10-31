import { type Address, normalizeAddress } from '@scout/core';
import { type ChogToken, type Db, chogTokensCoverage, getChogStatus, saveChogStatus, saveChogTokens, type ChogStatusRecord } from '@scout/db';
import { type PublicClient, createPublicClient, defineChain, erc20Abi, erc721Abi, http, parseAbi } from 'viem';

/** Chog on Monad mainnet. Scout only reads it: the same address holds Chogs on Monad and trades on vibe/vibe. */
export const CHOG_MONAD = {
  chainId: 143,
  rpc: 'https://rpc.monad.xyz',
  /** Chog Genesis, ERC-721, 1,969 supply. */
  nft: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763' as Address,
  /** $CHOG, ERC-20, 18 decimals. */
  token: '0x350035555e10d9afaf1566aaebfced5ba6c27777' as Address,
  supply: 1969,
  /** IPFS folder of the artwork; each image is named after its metadata number. */
  artCid: 'bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e',
} as const;

/** The artwork of the Chog whose metadata number is `meta`, through a public IPFS gateway. */
export const chogArtUrl = (meta: number, gateway = 'https://gateway.pinata.cloud/ipfs/') => `${gateway}${CHOG_MONAD.artCid}/${meta}.webp`;

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
): Promise<{ checked: number; holders: number; changed: number; statuses: Map<Address, ChogStatusRecord> }> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const wallets = [...new Set(opts.wallets.map(normalizeAddress))];
  const known = await getChogStatus(db, wallets);
  const stale = wallets.filter((w) => {
    const k = known.get(w);
    return !k || now - k.checkedAt >= (opts.maxAgeSec ?? 0);
  });
  const statuses = new Map(known);
  let holders = 0;
  let changed = 0;
  if (stale.length) {
    for (const h of await readChogHoldings(opts.client, stale)) {
      const saved = await saveChogStatus(db, { ...h, checkedAt: now });
      statuses.set(h.wallet, saved);
      if (h.tokens > 0) holders++;
      const before = known.get(h.wallet);
      if ((before?.tokens ?? 0) !== h.tokens || (before?.chogBalance ?? 0n) !== h.chogBalance) changed++;
    }
  }
  return { checked: stale.length, holders, changed, statuses };
}

const OWNERSHIP_ABI = parseAbi(['function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)']);

/**
 * Reads the owner and metadata number of Chog Genesis tokens, 250 per Multicall3 request, all requests at once, with
 * up to two more rounds for tokens whose calls failed. Tokens still failing are left out.
 */
export async function readChogTokens(
  client: Pick<PublicClient, 'multicall'>,
  supply: number = CHOG_MONAD.supply,
  ids: number[] = Array.from({ length: supply }, (_, i) => i + 1),
): Promise<ChogToken[]> {
  const got = new Map<number, ChogToken>();
  let missing = ids;
  for (let round = 0; round < 3 && missing.length; round++) {
    const chunks: number[][] = [];
    for (let k = 0; k < missing.length; k += 250) chunks.push(missing.slice(k, k + 250));
    await Promise.all(
      chunks.map(async (chunk) => {
        const r = await client
          .multicall({
            allowFailure: true,
            contracts: chunk.flatMap((id) => [
              { address: CHOG_MONAD.nft, abi: OWNERSHIP_ABI, functionName: 'ownerOf', args: [BigInt(id)] } as const,
              { address: CHOG_MONAD.nft, abi: OWNERSHIP_ABI, functionName: 'tokenURI', args: [BigInt(id)] } as const,
            ]),
          })
          .catch(() => [] as { status: string; result?: unknown }[]);
        chunk.forEach((tokenId, j) => {
          const owner = r[2 * j];
          const uri = r[2 * j + 1];
          if (owner?.status !== 'success' || uri?.status !== 'success') return;
          const meta = Number(/\/(\d+)\.json$/.exec(String(uri.result))?.[1]);
          if (!Number.isFinite(meta)) return;
          got.set(tokenId, { tokenId, owner: normalizeAddress(String(owner.result)), meta });
        });
      }),
    );
    missing = missing.filter((id) => !got.has(id));
  }
  return [...got.values()].sort((x, y) => x.tokenId - y.tokenId);
}

/**
 * Refreshes the ownership snapshot when it is incomplete or its stalest token is older than `maxAgeSec`. Every token
 * read is saved, so a slow or partial read still makes progress; a token that could not be read keeps its last
 * known owner, so a partial read never makes a holder's Chogs disappear.
 */
export async function syncChogTokens(
  db: Db,
  opts: { client: Pick<PublicClient, 'multicall'>; now?: number; maxAgeSec?: number; supply?: number },
): Promise<{ refreshed: boolean; tokens: number }> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const supply = opts.supply ?? CHOG_MONAD.supply;
  const cov = await chogTokensCoverage(db);
  if (cov.count >= supply && cov.oldest !== undefined && now - cov.oldest < (opts.maxAgeSec ?? 0)) return { refreshed: false, tokens: 0 };
  const tokens = await readChogTokens(opts.client, supply);
  if (tokens.length) await saveChogTokens(db, tokens, now);
  return { refreshed: tokens.length >= supply, tokens: tokens.length };
}
