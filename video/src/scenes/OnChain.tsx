import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Canvas } from '../components/Canvas';
import { Glass, Headline, Kicker } from '../components/Type';
import d from '../data/onchain.json';
import { C, F, clamp, expoOut, lerp, ramp, softInOut, vis } from '../theme';

const N = d.recipients; // 184
const BATCHES = [50, 50, 50, N - 150];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const TOTAL = Number(BigInt(d.total) / 10n ** 18n); // 898,000

/** Merkle levels: 184 → 92 → … → 1. */
function levels() {
  const out = [N];
  while (out[out.length - 1]! > 1) out.push(Math.ceil(out[out.length - 1]! / 2));
  return out;
}

/** 2:15–2:35. Leaves become a Merkle tree; the root flies into ScoutDrop; 184 wallets get paid. */
export function OnChain() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);
  const L = levels();
  const treeOut = ramp(t, 7.2, 8.6, softInOut);
  const block = { x: 160 * u, y: 250 * u, w: 700 * u, h: 220 * u };
  const blockIn = ramp(t, 6.8, 8.2, expoOut);
  const rootFly = ramp(t, 7, 8.8, softInOut);
  // Wallet grid on the right: 23 × 8.
  const cols = 23;
  const gx0 = 1000 * u;
  const gy0 = 300 * u;
  const gap = 33 * u;
  const wallet = (i: number) => ({ x: gx0 + (i % cols) * gap, y: gy0 + Math.floor(i / cols) * gap });
  // Claim batches land in sequence, as the four claimMany transactions did.
  const batchStart = (b: number) => 9.6 + b * 1.4;
  const arrival = (i: number) => {
    let b = 0;
    let idx = i;
    while (idx >= BATCHES[b]!) idx -= BATCHES[b++]!;
    return batchStart(b) + (idx / BATCHES[b]!) * 1.1;
  };
  const paid = Array.from({ length: N }, (_, i) => t >= arrival(i) + 0.5).filter(Boolean).length;
  const leave = ramp(t, 18.8, 20, softInOut);
  const rootPos = (w: number, h: number) => ({ x: w / 2, y: h * 0.24 });
  const blockCentre = { x: block.x + block.w * 0.12, y: block.y + block.h * 0.5 };

  return (
    <AbsoluteFill>
      <Backdrop />
      <Canvas
        draw={(ctx, w, h) => {
          // Merkle tree.
          if (treeOut < 1) {
            ctx.globalAlpha = 1 - treeOut;
            const yLeaf = h * 0.84;
            const yRoot = h * 0.24;
            const pos = (lvl: number, i: number) => {
              const n = L[lvl]!;
              const span = lerp(w * 0.84, w * 0.1, lvl / (L.length - 1));
              const x = n === 1 ? w / 2 : w / 2 - span / 2 + (i / (n - 1)) * span;
              return { x, y: lerp(yLeaf, yRoot, lvl / (L.length - 1)) };
            };
            for (let lvl = 0; lvl < L.length; lvl++) {
              const k = ramp(t, 0.6 + lvl * 0.62, 1.4 + lvl * 0.62, expoOut);
              if (k <= 0) continue;
              for (let i = 0; i < L[lvl]!; i++) {
                const p = pos(lvl, i);
                if (lvl > 0) {
                  for (const c of [i * 2, i * 2 + 1]) {
                    if (c >= L[lvl - 1]!) continue;
                    const q = pos(lvl - 1, c);
                    ctx.strokeStyle = `rgba(214,219,225,${0.28 * k})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(q.x, q.y);
                    ctx.lineTo(lerp(q.x, p.x, k), lerp(q.y, p.y, k));
                    ctx.stroke();
                  }
                }
                ctx.fillStyle = `rgba(238,241,244,${(lvl === 0 ? 0.8 : 0.9) * k})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, (lvl === 0 ? 2.6 : 2 + lvl * 0.5) * u, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.globalAlpha = 1;
          }
          // The root, glowing, then flying into the contract.
          const rk = ramp(t, 0.6 + (L.length - 1) * 0.62, 1.4 + (L.length - 1) * 0.62, expoOut);
          if (rk > 0 && rootFly < 1) {
            const a = rootPos(w, h);
            const p = { x: lerp(a.x, blockCentre.x, rootFly), y: lerp(a.y, blockCentre.y, rootFly) - Math.sin(rootFly * Math.PI) * 80 * u };
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 70 * u);
            glow.addColorStop(0, `rgba(238,241,244,${0.5 * rk})`);
            glow.addColorStop(1, 'rgba(238,241,244,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 70 * u, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, lerp(9, 6, rootFly) * u, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1 - leave;
          // Wallets and the token stream.
          if (t > 8.6) {
            const gk = ramp(t, 8.6, 9.6, expoOut);
            for (let i = 0; i < N; i++) {
              const p = wallet(i);
              const at = arrival(i);
              const k = clamp((t - at) / 0.5);
              if (k > 0 && k < 1) {
                const e = softInOut(k);
                const cx = lerp(blockCentre.x + block.w * 0.75, p.x, e);
                const cy = lerp(blockCentre.y, p.y, e) - Math.sin(e * Math.PI) * 120 * u;
                ctx.fillStyle = 'rgba(143,227,192,0.95)';
                ctx.beginPath();
                ctx.arc(cx, cy, 3 * u, 0, Math.PI * 2);
                ctx.fill();
              }
              const lit = k >= 1;
              ctx.fillStyle = lit ? 'rgba(143,227,192,0.95)' : `rgba(138,146,156,${0.5 * gk})`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, (lit ? 5 : 3.5) * u, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }}
      />

      <div style={{ position: 'absolute', left: 160 * u, top: 92 * u, width: 1200 * u }}>
        <Headline text="On-chain, *for real.*" t={t} at={0.4} out={6.4} size={96 * u} />
      </div>
      <div style={{ position: 'absolute', left: width / 2 + 40 * u, top: height * 0.24 - 20 * u, opacity: vis(t, 5.2, 7.2), fontFamily: F.mono, fontSize: 28 * u, color: C.ink, whiteSpace: 'nowrap' }}>
        Merkle root <span style={{ color: C.steel }}>{d.merkleRoot.slice(0, 10)}…{d.merkleRoot.slice(-4)}</span>
      </div>
      <div style={{ position: 'absolute', left: 160 * u, top: height * 0.84 + 28 * u, opacity: vis(t, 1.2, 7.2) }}>
        <Kicker size={28 * u}>{N} recipients · Hold or Die</Kicker>
      </div>

      {/* Contract block */}
      <div style={{ position: 'absolute', left: block.x, top: block.y, width: block.w, opacity: blockIn * (1 - leave), transform: `translateY(${(1 - blockIn) * 30 * u}px)` }}>
        <Glass style={{ padding: `${30 * u}px ${36 * u}px` }}>
          <Kicker size={28 * u} style={{ whiteSpace: 'nowrap' }}>
            Robinhood Chain testnet
          </Kicker>
          <div style={{ fontFamily: F.serif, fontSize: 80 * u, lineHeight: 1.05, color: C.ink, marginTop: 14 * u }}>
            Scout<i style={{ backgroundImage: C.chromeX, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', paddingRight: '0.05em' }}>Drop</i>
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 28 * u, lineHeight: 1.4, color: C.body, marginTop: 10 * u }}>
            <div>{d.scoutDrop.slice(0, 22)}</div>
            <div>{d.scoutDrop.slice(22)} · chain {d.chainId}</div>
          </div>
        </Glass>
      </div>

      {/* Explorer log: real transactions, read from the chain */}
      <div style={{ position: 'absolute', left: block.x, top: block.y + 300 * u, width: block.w, opacity: ramp(t, 10, 11.2) * (1 - leave) }}>
        <div style={{ fontFamily: F.mono, fontSize: 28 * u, color: C.steel, letterSpacing: '0.04em', marginBottom: 14 * u }}>explorer.testnet.chain.robinhood.com</div>
        {d.receipts.map((r, i) => {
          const k = ramp(t, 10.4 + i * 0.5, 11.2 + i * 0.5, expoOut);
          return (
            <div key={r.hash} style={{ display: 'flex', justifyContent: 'space-between', gap: 20 * u, padding: `${6 * u}px 0`, borderTop: `1px solid ${C.hair}`, opacity: k, transform: `translateY(${(1 - k) * 14 * u}px)`, fontFamily: F.mono, fontSize: 28 * u, whiteSpace: 'nowrap' }}>
              <span style={{ color: C.ink, width: 300 * u }}>{r.label}</span>
              <span style={{ color: C.steel }}>{r.hash.slice(0, 8)}…</span>
              <span style={{ color: C.good }}>✓</span>
            </div>
          );
        })}
      </div>

      {/* Counters */}
      <div style={{ position: 'absolute', left: gx0, top: gy0 + 8 * gap + 60 * u, display: 'flex', gap: 64 * u, opacity: ramp(t, 9.4, 10.4) * (1 - leave) }}>
        <div>
          <div style={{ fontFamily: F.serif, fontSize: 110 * u, lineHeight: 1, color: C.ink, whiteSpace: 'nowrap' }}>
            {paid}
            <span style={{ color: C.faint }}> / {N}</span>
          </div>
          <div style={{ marginTop: 12 * u }}>
            <Kicker size={28 * u} color={paid === N ? C.good : C.steel}>
              wallets paid
            </Kicker>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: F.serif, fontSize: 110 * u, lineHeight: 1, color: C.ink }}>{fmt((TOTAL * paid) / N)}</div>
          <div style={{ marginTop: 12 * u }}>
            <Kicker size={28 * u}>tokens · drop #{d.dropId}</Kicker>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: gx0, top: gy0 + 8 * gap + 290 * u, opacity: ramp(t, 15.6, 16.6) * (1 - leave), fontFamily: F.sans, fontWeight: 300, fontSize: 32 * u, color: C.body }}>
        Deployed to fully paid in {d.receipts.at(-1)!.timestamp - d.receipts[0]!.timestamp} seconds. Nothing left unclaimed.
      </div>
    </AbsoluteFill>
  );
}
