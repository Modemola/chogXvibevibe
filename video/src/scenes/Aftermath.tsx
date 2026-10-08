import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Canvas } from '../components/Canvas';
import { Headline, Kicker } from '../components/Type';
import a from '../data/aftermath.json';
import { C, F, clamp, expoOut, lerp, ramp, softInOut, vis } from '../theme';

const WINDOWS = ['h1', 'h24', 'd7', 'd30'] as const;
const NAMES = { h1: '1 hour', h24: '24 hours', d7: '7 days', d30: '30 days' } as const;
const AT = [1.6, 4.0, 6.4, 8.8];
type Sold = Record<(typeof WINDOWS)[number], number>;
const recipients = [...a.recipients].sort((x, y) => (x.sold as Sold).d30 - (y.sold as Sold).d30);
const retained = a.windows.map((w) => w.retained);

/** Fraction of the drop still held, interpolated through the windows at scene time t. */
function heldAt(s: Sold, t: number) {
  let v = 1;
  WINDOWS.forEach((w, i) => {
    const k = ramp(t, AT[i]!, AT[i]! + 1.6, softInOut);
    v = lerp(v, 1 - s[w] / 10_000, k);
  });
  return v;
}
function colour(held: number) {
  // held ≥ 0.9 silver-green, sold ≥ 0.9 rose; in between silver.
  if (held >= 0.9) return [143, 227, 192];
  if (held <= 0.1) return [240, 138, 156];
  if (held < 0.5) return [201, 160, 170];
  return [214, 219, 225];
}

/** The flywheel ring the retention curve becomes. */
export const flywheel = (w: number, h: number, u: number) => ({ x: w / 2, y: h * 0.47, r: 150 * u });

/** 2:35–2:50. Recipients become columns; holders stay, dumpers drain; the curve loops back into the score. */
export function Aftermath() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);
  const base = height * 0.8;
  const maxH = height * 0.42;
  const x0 = 160 * u;
  const x1 = width - 160 * u;
  const n = recipients.length;
  const colW = (x1 - x0) / n;
  const grow = ramp(t, 0.2, 1.6, expoOut);
  const loop = ramp(t, 10.8, 12.6, softInOut);
  const barsOut = ramp(t, 10.6, 11.8, softInOut);
  const active = AT.filter((x) => t >= x).length - 1;
  const ret = active < 0 ? 1 : lerp(active ? retained[active - 1]! : 1, retained[active]!, ramp(t, AT[active]!, AT[active]! + 1.6, softInOut));

  return (
    <AbsoluteFill>
      <Backdrop />
      <Canvas
        draw={(ctx, w, h) => {
          // Columns: one per recipient, amount still held.
          ctx.globalAlpha = 1 - barsOut;
          recipients.forEach((r, i) => {
            const held = heldAt(r.sold as Sold, t);
            const [cr, cg, cb] = colour(held);
            const bh = maxH * held * grow;
            const x = x0 + i * colW + colW * 0.18;
            const bw = colW * 0.64;
            const g = ctx.createLinearGradient(0, base - bh, 0, base);
            g.addColorStop(0, `rgba(${cr},${cg},${cb},0.95)`);
            g.addColorStop(1, `rgba(${cr},${cg},${cb},0.25)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.roundRect(x, base - bh, bw, bh, [3 * u, 3 * u, 0, 0]);
            ctx.fill();
          });
          ctx.strokeStyle = 'rgba(214,219,225,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0, base + 0.5);
          ctx.lineTo(x1, base + 0.5);
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Retention curve over the windows, then curling into the flywheel.
          const pts: { x: number; y: number }[] = [{ x: x0, y: base - maxH }];
          retained.forEach((v, i) => pts.push({ x: lerp(x0, x1, (i + 1) / 4), y: base - maxH * v }));
          const drawn = clamp((t - 1.6) / (AT[3]! + 1.6 - 1.6));
          const fw = flywheel(w, h, u);
          const S = 120;
          ctx.strokeStyle = 'rgba(238,241,244,0.95)';
          ctx.lineWidth = 2.6 * u;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let k = 0; k <= S; k++) {
            const s = k / S;
            if (s > drawn && loop === 0) break;
            // Point on the curve (piecewise smooth through the window points).
            const f = s * (pts.length - 1);
            const i = Math.min(pts.length - 2, Math.floor(f));
            const e = softInOut(f - i);
            const cx = lerp(pts[i]!.x, pts[i + 1]!.x, f - i);
            const cy = lerp(pts[i]!.y, pts[i + 1]!.y, e);
            // Point on the flywheel ring.
            const ang = -Math.PI / 2 + s * Math.PI * 2 * 0.92;
            const rx = fw.x + Math.cos(ang) * fw.r;
            const ry = fw.y + Math.sin(ang) * fw.r;
            const x = lerp(cx, rx, loop);
            const y = lerp(cy, ry, loop);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          // Arrowhead once the ring closes.
          if (loop > 0.6) {
            const ang = -Math.PI / 2 + Math.PI * 2 * 0.92;
            const ax = fw.x + Math.cos(ang) * fw.r;
            const ay = fw.y + Math.sin(ang) * fw.r;
            const k = clamp((loop - 0.6) / 0.4);
            ctx.fillStyle = `rgba(238,241,244,${k})`;
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(ang + Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(14 * u, 0);
            ctx.lineTo(-8 * u, -10 * u);
            ctx.lineTo(-8 * u, 10 * u);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          // Window markers.
          if (loop < 1) {
            pts.slice(1).forEach((p, i) => {
              const k = ramp(t, AT[i]! + 1.2, AT[i]! + 1.8, expoOut) * (1 - loop);
              ctx.fillStyle = `rgba(238,241,244,${k})`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 6 * u, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        }}
      />

      {/* Header */}
      <div style={{ position: 'absolute', left: 160 * u, top: 96 * u, opacity: ramp(t, 0.1, 1.1) * (1 - barsOut) }}>
        <Kicker size={28 * u}>Aftermath · launch sim-0010 · simulated</Kicker>
        <div style={{ marginTop: 18 * u, display: 'flex', alignItems: 'baseline', gap: 26 * u }}>
          <span style={{ fontFamily: F.serif, fontSize: 120 * u, lineHeight: 1, color: C.ink }}>{(ret * 100).toFixed(1)}%</span>
          <span style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 32 * u, color: C.body }}>of the drop still held</span>
        </div>
      </div>
      <div style={{ position: 'absolute', right: 160 * u, top: 120 * u, display: 'flex', gap: 34 * u, opacity: ramp(t, 0.3, 1.3) * (1 - barsOut) }}>
        {WINDOWS.map((w, i) => (
          <div key={w} style={{ fontFamily: F.mono, fontSize: 30 * u, letterSpacing: '0.06em', color: i === active ? C.ink : C.faint, borderBottom: `2px solid ${i === active ? C.ink : 'transparent'}`, paddingBottom: 8 * u }}>
            {NAMES[w]}
          </div>
        ))}
      </div>
      {retained.map((v, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: lerp(160 * u, width - 160 * u, (i + 1) / 4) - (i === 3 ? 150 * u : 70 * u),
            width: 140 * u,
            textAlign: i === 3 ? 'right' : 'center',
            top: height * 0.8 - height * 0.42 * v - 62 * u,
            fontFamily: F.mono,
            fontSize: 28 * u,
            color: C.ink,
            opacity: ramp(t, AT[i]! + 1.4, AT[i]! + 2) * (1 - barsOut),
          }}
        >
          {(v * 100).toFixed(1)}%
        </div>
      ))}
      <div style={{ position: 'absolute', left: 160 * u, top: height * 0.8 + 26 * u, display: 'flex', gap: 40 * u, opacity: ramp(t, 2, 3) * (1 - barsOut), fontFamily: F.mono, fontSize: 28 * u, letterSpacing: '0.08em' }}>
        <span style={{ color: C.good }}>● HELD</span>
        <span style={{ color: '#d6dbe1' }}>● TRIMMED</span>
        <span style={{ color: C.bad }}>● DUMPED</span>
        <span style={{ color: C.steel }}>{a.recipients.length} RECIPIENTS</span>
      </div>

      {/* Flywheel */}
      <div style={{ position: 'absolute', left: 0, width, top: height * 0.47 - 40 * u, textAlign: 'center', opacity: vis(t, 12.4, 15, 0.6) }}>
        <div style={{ fontFamily: F.serif, fontStyle: 'italic', fontSize: 64 * u, color: C.ink, lineHeight: 1 }}>
          H <span style={{ color: C.faint, fontStyle: 'normal' }}>&amp;</span> <span style={{ color: C.bad }}>D</span>
        </div>
        <div style={{ marginTop: 14 * u, fontFamily: F.mono, fontSize: 28 * u, color: C.steel, letterSpacing: '0.1em' }}>NEXT SCORE</div>
      </div>
      <div style={{ position: 'absolute', left: 0, width, top: height * 0.73, display: 'flex', justifyContent: 'center' }}>
        <Headline text="Every drop makes the next one *smarter.*" t={t} at={12.2} out={14.4} size={84 * u} align="center" />
      </div>
    </AbsoluteFill>
  );
}
