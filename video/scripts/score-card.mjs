// Renders a 10 s personal score clip for one wallet, from its live Scout profile.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/score-card.mjs <wallet> [--out file.mp4] [--no-music] [--refresh]
// Reads the profile from the live site (which also reads the wallet's Chogs from Monad), finds which Chog Genesis
// tokens the wallet owns (ownerOf over all 1,969, cached), fetches their art from the collection's metadata, renders.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const args = process.argv.slice(2);
const wallet = (args.find((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) ?? '').toLowerCase();
if (!wallet) {
  console.error('usage: node scripts/score-card.mjs <wallet> [--out file.mp4] [--no-music] [--refresh]');
  process.exit(1);
}
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const SITE = process.env.SCOUT_SITE ?? 'https://graduation-scout.vercel.app';
const RPC = process.env.SCOUT_CHOG_RPC ?? 'https://rpc.monad.xyz';
const NFT = '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763';
const GATEWAY = process.env.IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs/';
const SUPPLY = 1969;
const short = `${wallet.slice(0, 6)}-${wallet.slice(-4)}`;
const out = opt('--out') ?? `out/cards/score-${short}.mp4`;

// 1. The live profile (the site reads Monad for the wallet when the profile loads).
const res = await fetch(`${SITE}/api/profiles/${wallet}?template=chog_holders`);
if (!res.ok) throw new Error(`profile ${res.status}: ${await res.text()}`);
const p = await res.json();

// 2. Which Chogs the wallet owns.
async function rpcBatch(calls) {
  // The public Monad RPC rate-limits bursts: back off and retry when it answers with an error instead of results.
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(calls) });
    const body = await r.json().catch(() => null);
    if (Array.isArray(body)) return body;
    await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt));
  }
  throw new Error('Monad RPC kept refusing the batch');
}
async function owners() {
  const cache = '.cache/chog-owners.json';
  if (!flag('--refresh') && existsSync(cache) && Date.now() - statSync(cache).mtimeMs < 6 * 3600_000) {
    const cached = JSON.parse(readFileSync(cache, 'utf8'));
    if (Object.keys(cached).length === SUPPLY) return cached;
  }
  const map = {};
  // Some calls in a batch come back as errors under load, so keep asking for the missing ones until all are in.
  for (let round = 0; round < 8; round++) {
    const missing = [];
    for (let id = 1; id <= SUPPLY; id++) if (!map[id]) missing.push(id);
    if (!missing.length) break;
    for (let k = 0; k < missing.length; k += 100) {
      const calls = missing.slice(k, k + 100).map((id) => ({ jsonrpc: '2.0', id, method: 'eth_call', params: [{ to: NFT, data: '0x6352211e' + id.toString(16).padStart(64, '0') }, 'latest'] }));
      for (const r of await rpcBatch(calls)) if (r.result) map[r.id] = `0x${r.result.slice(-40)}`;
      await new Promise((ok) => setTimeout(ok, 400 + round * 400));
    }
  }
  const n = Object.keys(map).length;
  if (n < SUPPLY) console.warn(`warning: owners found for ${n} of ${SUPPLY} Chogs`);
  mkdirSync('.cache', { recursive: true });
  if (n === SUPPLY) writeFileSync(cache, JSON.stringify(map));
  return map;
}
const tokenCount = p.chog?.tokens ?? 0;
let owned = [];
if (tokenCount > 0) {
  const map = await owners();
  owned = Object.entries(map).filter(([, o]) => o === wallet).map(([id]) => Number(id)).sort((a, b) => a - b);
}

// 3. Art for up to four of them, from each token's own metadata.
const gw = (u) => u.replace('ipfs://', GATEWAY);
async function tokenURI(id) {
  const [r] = await rpcBatch([{ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: NFT, data: '0xc87b56dd' + id.toString(16).padStart(64, '0') }, 'latest'] }]);
  const hex = r.result.slice(2);
  const len = parseInt(hex.slice(64, 128), 16);
  return Buffer.from(hex.slice(128, 128 + len * 2), 'hex').toString('utf8');
}
mkdirSync('public/cards', { recursive: true });
const chogs = [];
for (const id of owned.slice(0, 4)) {
  const meta = await (await fetch(gw(await tokenURI(id)))).json();
  const ext = meta.image.split('.').pop();
  const file = `cards/${id}.${ext}`;
  if (!existsSync(`public/${file}`)) {
    const img = await fetch(gw(meta.image));
    if (!img.ok) throw new Error(`image ${id}: ${img.status}`);
    writeFileSync(`public/${file}`, Buffer.from(await img.arrayBuffer()));
  }
  chogs.push({ token: Number(/#(\d+)/.exec(meta.name)?.[1] ?? id), file });
}

// 4. Plain-language reasons, from the site's own labels.
const fmt = readFileSync('../apps/web/lib/format.ts', 'utf8');
const LABELS = Object.fromEntries([...fmt.matchAll(/^\s+([A-Z0-9_]+): '([^']+)',$/gm)].map((m) => [m[1], m[2]]));
const label = (code) => LABELS[code] ?? (/^SPARK_(.+)$/.test(code) ? `Holds ${code.slice(6)}+ SPARK` : code);
const reasons = [...p.reasons].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).slice(0, 3).map((r) => ({ label: label(r.code), contrib: r.contrib }));
const eligible = p.eligibility
  .filter((e) => e.buckets.length && !e.excludedBy)
  // Chog holders see the Chog recipe first; everyone else sees it in its usual place.
  .sort((a, b) => ((p.chog?.tokens ?? 0) > 0 ? (a.template === 'chog_holders' ? -1 : b.template === 'chog_holders' ? 1 : 0) : 0))
  .map((e) => ({ name: e.name, bucket: e.buckets[0] }));

const props = {
  wallet,
  optedIn: p.optedIn,
  score: p.score,
  reasons,
  chogCount: tokenCount,
  chogBalance: Number(BigInt(p.chog?.chogBalance ?? '0') / 10n ** 18n),
  chogs,
  eligible,
  readAt: new Date().toISOString().slice(0, 10),
  music: !flag('--no-music'),
};
console.log(JSON.stringify({ ...props, owned: owned.length }, null, 2));

// 5. Render.
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const chromiumOptions = { gl: 'swangle' };
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'ScoreCard', inputProps: props, browserExecutable, chromiumOptions });
mkdirSync(path.dirname(out), { recursive: true });
await renderMedia({ composition, serveUrl, inputProps: props, codec: 'h264', crf: 20, pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '192k', outputLocation: out, browserExecutable, chromiumOptions, concurrency: 4 });
console.log(`→ ${out}`);
