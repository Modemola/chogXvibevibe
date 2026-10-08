import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Canvas } from '../components/Canvas';
import { Glass, Headline, Kicker } from '../components/Type';
import { C, F, clamp, expoOut, lerp, ramp, rng, softInOut, vis } from '../theme';
import { clusterLayout } from './Score';

const Z0 = 3;

interface Node {
  x: number; // field position at zoom 1
  y: number;
  farm: number; // -1 honest; 0 is the dumper's cluster; 3 is the staggered farm
  hubbed: boolean;
  seed: number;
}

function field(w: number, h: number, u: number) {
  const r = rng(95);
  const F0 = { x: w * 0.62, y: h * 0.4 };
  const nodes: Node[] = [];
  // Farm 0: the dumper's cluster from the previous scene, shrunk by the pull-back.
  for (const p of clusterLayout(0, 0, u)) nodes.push({ x: F0.x + p.x / Z0, y: F0.y + p.y / Z0, farm: 0, hubbed: false, seed: r() });
  const centres = [
    { x: w * 0.18, y: h * 0.32, n: 6 },
    { x: w * 0.38, y: h * 0.5, n: 11 },
  ];
  centres.forEach((c, i) => {
    for (let k = 0; k < c.n; k++) {
      const a = r() * Math.PI * 2;
      const d = (k === 0 ? 0 : 40 + r() * 34) * u;
      nodes.push({ x: c.x + Math.cos(a) * d * 1.6, y: c.y + Math.sin(a) * d * 1.3, farm: i + 1, hubbed: false, seed: r() });
    }
  });
  // Staggered farm: 9 wallets spread out (their buys were hours apart, so no cluster forms).
  for (let k = 0; k < 9; k++) nodes.push({ x: w * (0.1 + r() * 0.8), y: h * (0.26 + r() * 0.38), farm: 3, hubbed: false, seed: r() });
  // Honest wallets, kept clear of the farm centres.
  const avoid = [F0, ...centres];
  while (nodes.filter((n) => n.farm === -1).length < 120) {
    const x = w * (0.05 + r() * 0.9);
    const y = h * (0.23 + r() * 0.44);
    if (avoid.some((c) => Math.hypot(c.x - x, c.y - y) < 120 * u)) continue;
    nodes.push({ x, y, farm: -1, hubbed: r() < 0.3, seed: r() });
  }
  return { nodes, F0 };
}

/** 1:35–1:55. Pull back from the dumper's cluster; farms snap together and fall through a sieve. */
export function Sybil() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);
  const { nodes, F0 } = field(width, height, u);

  const pull = ramp(t, 0.2, 3.6, softInOut);
  const zoom = lerp(Z0, 1, pull);
  const anchor = { x: lerp(width * 0.79, F0.x, pull), y: lerp(height * 0.62, F0.y, pull) };
  const toScreen = (x: number, y: number) => ({ x: (x - F0.x) * zoom + anchor.x, y: (y - F0.y) * zoom + anchor.y });
  const others = ramp(t, 1.2, 3.8, softInOut);
  const hub = vis(t, 4, 9.2, 0.9);
  const snap = ramp(t, 5.2, 7.6, softInOut);
  const stag = ramp(t, 8.2, 9.4, expoOut);
  const sieveY = height * 0.74;
  const sieve = ramp(t, 9.6, 11, expoOut);
  const drop = (n: Node) => Math.max(0, t - 10.6 - n.seed * 0.8);

  const exit = 1 - ramp(t, 19, 19.95, softInOut);
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ opacity: exit }}>
      <Canvas
        draw={(ctx, w) => {
          const hubPos = { x: w * 0.5, y: height * 0.06 };
          // Exchange hub: funds many honest wallets, and is ignored.
          if (hub > 0) {
            ctx.setLineDash([3 * u, 7 * u]);
            ctx.strokeStyle = `rgba(138,146,156,${0.45 * hub})`;
            ctx.lineWidth = 1;
            for (const n of nodes) {
              if (!n.hubbed) continue;
              const p = toScreen(n.x, n.y);
              ctx.beginPath();
              ctx.moveTo(hubPos.x, hubPos.y);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.fillStyle = `rgba(214,219,225,${hub})`;
            ctx.beginPath();
            ctx.arc(hubPos.x, hubPos.y, 9 * u, 0, Math.PI * 2);
            ctx.fill();
          }
          // Sieve.
          if (sieve > 0) {
            ctx.strokeStyle = `rgba(214,219,225,${0.6 * sieve})`;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([22 * u, 14 * u]);
            ctx.beginPath();
            ctx.moveTo(w / 2 - (w / 2 - 120 * u) * sieve, sieveY);
            ctx.lineTo(w / 2 + (w / 2 - 120 * u) * sieve, sieveY);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          // Farm cluster edges (union-find: funding and identical early buys).
          const centreOf = (f: number) => {
            const m = nodes.filter((n) => n.farm === f);
            return { x: m.reduce((s, n) => s + n.x, 0) / m.length, y: m.reduce((s, n) => s + n.y, 0) / m.length };
          };
          const pos = (n: Node) => {
            let { x, y } = n;
            if (n.farm >= 0 && n.farm <= 2 && n.farm !== 0) {
              const c = centreOf(n.farm);
              x = lerp(x, lerp(c.x, x, 0.55), snap);
              y = lerp(y, lerp(c.y, y, 0.55), snap);
            }
            let p = toScreen(x, y);
            if (n.farm >= 0) {
              const d = drop(n);
              p = { x: p.x, y: p.y + 0.5 * 2400 * u * d * d };
            }
            return p;
          };
          for (const f of [0, 1, 2]) {
            const m = nodes.filter((n) => n.farm === f);
            const k = f === 0 ? 1 : ramp(t, 4.6 + f * 0.4, 6.4 + f * 0.4, expoOut);
            const a = f === 0 ? 1 : others;
            const head = pos(m[0]!);
            for (const n of m.slice(1)) {
              const p = pos(n);
              ctx.strokeStyle = `rgba(240,138,156,${0.5 * k * a * clamp(1 - drop(n) * 1.4)})`;
              ctx.lineWidth = 1.1;
              ctx.beginPath();
              ctx.moveTo(head.x, head.y);
              ctx.lineTo(lerp(head.x, p.x, k), lerp(head.y, p.y, k));
              ctx.stroke();
            }
          }
          // Wallets.
          for (const n of nodes) {
            const p = pos(n);
            const fade = n.farm >= 0 ? clamp(1 - drop(n) * 1.3) * (p.y > sieveY ? clamp(1 - (p.y - sieveY) / (160 * u)) : 1) : 1;
            const base = n.farm === 0 ? 1 : others;
            const rose = n.farm === 0 ? 1 : n.farm === 1 || n.farm === 2 ? snap : n.farm === 3 ? stag : 0;
            const alpha = base * fade * (n.farm === -1 ? 0.75 : 1);
            if (alpha <= 0.01) continue;
            const rr = Math.round(lerp(226, 240, rose));
            const gg = Math.round(lerp(231, 138, rose));
            const bb = Math.round(lerp(237, 156, rose));
            if (rose > 0.5) {
              const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 22 * u);
              glow.addColorStop(0, `rgba(240,138,156,${0.3 * alpha})`);
              glow.addColorStop(1, 'rgba(240,138,156,0)');
              ctx.fillStyle = glow;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 22 * u, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, (n.farm === 0 ? lerp(6, 4.5, pull) : 4.5) * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }}
      />

      {/* Labels */}
      <div style={{ position: 'absolute', left: width * 0.5 + 28 * u, top: height * 0.06 - 18 * u, opacity: hub, fontFamily: F.mono, fontSize: 28 * u, letterSpacing: '0.14em', color: C.steel, whiteSpace: 'nowrap' }}>
        EXCHANGE HOT WALLET · IGNORED
      </div>
      <div style={{ position: 'absolute', left: 160 * u, top: height * 0.74 + 24 * u, opacity: sieve * (1 - ramp(t, 11.8, 12.4)) }}>
        <Kicker size={28 * u}>The sieve</Kicker>
      </div>
      <div style={{ position: 'absolute', left: width * 0.5 - 500 * u, width: 1000 * u, top: height * 0.67, textAlign: 'center', whiteSpace: 'nowrap', opacity: vis(t, 8.4, 11.2), fontFamily: F.mono, fontSize: 28 * u, letterSpacing: '0.1em', color: C.bad }}>
        STAGGERED FARM · CAUGHT BY ITS DUMPING
      </div>

      {/* Data card */}
      <div style={{ position: 'absolute', left: 160 * u, top: height * 0.79, display: 'flex', gap: 28 * u, opacity: ramp(t, 12.2, 13.6), transform: `translateY(${(1 - ramp(t, 12.2, 13.6)) * 30 * u}px)` }}>
        <Glass style={{ padding: `${26 * u}px ${36 * u}px`, display: 'flex', alignItems: 'baseline', gap: 26 * u }}>
          <span style={{ fontFamily: F.serif, fontSize: 96 * u, lineHeight: 1, color: C.ink }}>
            0<span style={{ color: C.faint }}> / 336</span>
          </span>
          <span style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 30 * u, color: C.body, maxWidth: 300 * u, lineHeight: 1.3 }}>honest wallets wrongly flagged</span>
        </Glass>
        <Glass style={{ padding: `${26 * u}px ${36 * u}px`, display: 'flex', alignItems: 'baseline', gap: 26 * u }}>
          <span style={{ fontFamily: F.serif, fontSize: 96 * u, lineHeight: 1, color: C.bad }}>0%</span>
          <span style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 30 * u, color: C.body, maxWidth: 320 * u, lineHeight: 1.3 }}>of the drop to the 4 farms</span>
        </Glass>
      </div>
      <div style={{ position: 'absolute', left: 160 * u, top: 222 * u, opacity: vis(t, 13, 19.2) }}>
        <Kicker size={28 * u}>Simulated world · seed 42</Kicker>
      </div>
      <div style={{ position: 'absolute', left: 160 * u, top: 96 * u, width: 900 * u }}>
        <Headline text="Farms fall *through.*" t={t} at={11.4} out={19.2} size={96 * u} />
      </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
