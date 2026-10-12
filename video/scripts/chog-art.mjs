// Fetches Chog Genesis artwork for a few tokens: tokenURI on Monad → metadata → image, via an IPFS gateway.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/chog-art.mjs [tokenId …]. Writes public/chog/<id>.webp and src/data/chog.json.
import { mkdirSync, writeFileSync } from 'node:fs';

const NFT = '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763';
const RPC = 'https://rpc.monad.xyz';
const GATEWAY = process.env.IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs/';
const ids = process.argv.slice(2).map(Number);
const tokens = ids.length ? ids : [143, 1, 420, 777, 1969];

const gw = (u) => u.replace('ipfs://', GATEWAY);
async function tokenURI(id) {
  const data = '0xc87b56dd' + id.toString(16).padStart(64, '0');
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: NFT, data }, 'latest'] }) });
  const hex = (await r.json()).result.slice(2);
  const len = parseInt(hex.slice(64, 128), 16);
  return Buffer.from(hex.slice(128, 128 + len * 2), 'hex').toString('utf8');
}

mkdirSync('public/chog', { recursive: true });
const out = [];
for (const id of tokens) {
  const uri = await tokenURI(id);
  const meta = await (await fetch(gw(uri))).json();
  const img = await fetch(gw(meta.image));
  if (!img.ok) throw new Error(`image ${id}: ${img.status}`);
  const ext = meta.image.split('.').pop();
  const file = `chog/${id}.${ext}`;
  writeFileSync(`public/${file}`, Buffer.from(await img.arrayBuffer()));
  const number = Number(/#(\d+)/.exec(meta.name)?.[1] ?? id);
  out.push({ token: number, tokenId: id, file, name: meta.name });
  console.log(id, meta.name, file, uri);
}
writeFileSync('src/data/chog.json', JSON.stringify(out, null, 2) + '\n');
