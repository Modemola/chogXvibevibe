import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Canvas } from '../components/Canvas';
import { Headline, Kicker } from '../components/Type';
import dumper from '../data/dumper.json';
import holder from '../data/holder.json';
import { C, F, clamp, expoOut, lerp, ramp, rng, short, softInOut, vis } from '../theme';

const LABELS: Record<string, string> = {
  HOLD_SCOUT_DROPS: 'Held past Scout airdrops',
  HOLD_GRAD_POSITIONS: 'Held graduated positions',
  HOLD_PRIOR: 'Baseline hold history',
  MARKET_QUALITY_MIX: 'Trades substance lanes',
  LANE_AFFINITY: 'Fits this launch',
  MARKET_PRIOR: 'Baseline trading history',
  GUILD_GOOD_STANDING: 'Guild in good standing',
  SHIPPED_SUBSTANCE: 'Shipped a product that graduated',
  DUMPED_1H_LAST_DROP: 'Dumped the last drop within 1h',
  DUMP_LAST_DROP: 'Sold part of the last drop',
  DUMP_HISTORY: 'Sold earlier drops',
  SYBIL_CLUSTER: 'Part of a funding cluster',
};
const label = (code: string) => LABELS[code] ?? (code.startsWith('SPARK_') ? `Holds ${code.slice(6).replace('K', ',000')}+ SPARK` : code);
const term = (code: string) =>
  code.startsWith('HOLD') ? 'H' : code.startsWith('MARKET') || code === 'LANE_AFFINITY' ? 'Q' : code.startsWith('DUMP') ? 'D' : code === 'SYBIL_CLUSTER' ? 'Y' : 'A';

const TERMS = [
  { sym: 'S', name: '' },
  { sym: '=', name: '' },
  { sym: 'αH', name: 'hold' },
  { sym: '+', name: '' },
  { sym: 'βQ', name: 'quality' },
  { sym: '+', name: '' },
  { sym: 'γA', name: 'alignment' },
  { sym: '−', name: '' },
  { sym: 'δD', name: 'dumping' },
  { sym: '−', name: '' },
  { sym: 'εY', name: 'sybil' },
];

type Reason = { code: string; contrib: number };

/** Horizontal waterfall: each reason steps the running total; the last row is the score. */
function Waterfall({ reasons, score, t, at, x, y, w, rowH, u, leave }: { reasons: Reason[]; score: number; t: number; at: number; x: number; y: number; w: number; rowH: number; u: number; leave: number }) {
  const sorted = [...reasons].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  let run = 0;
  let lo = 0;
  let hi = 0;
  const rows = sorted.map((r) => {
    const from = run;
    run += r.contrib;
    lo = Math.min(lo, run, from);
    hi = Math.max(hi, run, from);
    return { ...r, from, to: run };
  });
  const labelW = 560 * u;
  const barX = x + labelW;
  const barW = w - labelW - 40 * u;
  const scale = barW / (hi - lo || 1);
  const zx = barX + -lo * scale;
  const total = ramp(t, at + rows.length * 0.32 + 0.4, at + rows.length * 0.32 + 1.6, expoOut);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - leave, transform: `translateX(${-leave * 80 * u}px)` }}>
      {/* zero line */}
      <div style={{ position: 'absolute', left: zx, top: y - 18 * u, width: 1, height: rowH * (rows.length + 1.6), background: C.stroke, opacity: ramp(t, at - 0.6, at) }} />
      <div style={{ position: 'absolute', left: zx - 40 * u, width: 80 * u, textAlign: 'center', top: y - 58 * u, fontFamily: F.mono, fontSize: 28 * u, color: C.faint, opacity: ramp(t, at - 0.6, at) }}>0</div>
      {rows.map((r, i) => {
        const k = ramp(t, at + i * 0.32, at + i * 0.32 + 0.9, expoOut);
        const neg = r.contrib < 0;
        const left = zx + Math.min(r.from, r.to) * scale;
        const width = Math.max(2, Math.abs(r.contrib) * scale);
        const top = y + i * rowH;
        return (
          <div key={r.code} style={{ opacity: k }}>
            <div style={{ position: 'absolute', left: x, top: top + rowH * 0.12, width: labelW - 30 * u, fontFamily: F.sans, fontWeight: 400, fontSize: 28 * u, color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ fontFamily: F.mono, color: neg ? C.bad : C.steel, marginRight: 14 * u }}>{term(r.code)}</span>
              {label(r.code)}
            </div>
            <div
              style={{
                position: 'absolute',
                left: neg ? left + width * (1 - k) : left,
                top: top + rowH * 0.2,
                width: width * k,
                height: rowH * 0.56,
                borderRadius: 4 * u,
                background: neg ? 'linear-gradient(90deg, #f08a9c, #c96c7d)' : 'linear-gradient(90deg, #8d949d, #eef1f4)',
                boxShadow: neg ? '0 0 24px rgba(240,138,156,0.25)' : '0 0 24px rgba(214,222,232,0.12)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: neg ? left - 150 * u : left + width + 14 * u,
                width: 136 * u,
                textAlign: neg ? 'right' : 'left',
                top: top + rowH * 0.12,
                fontFamily: F.mono,
                fontSize: 28 * u,
                color: neg ? C.bad : C.ink,
                opacity: clamp(k * 2 - 1),
              }}
            >
              {r.contrib >= 0 ? '+' : '−'}
              {Math.abs(r.contrib).toFixed(3)}
            </div>
          </div>
        );
      })}
      {/* total */}
      <div style={{ position: 'absolute', left: x, top: y + rows.length * rowH + 20 * u, width: w, height: 1, background: C.stroke, opacity: total }} />
      <div style={{ position: 'absolute', left: x, top: y + rows.length * rowH + 40 * u, display: 'flex', alignItems: 'baseline', gap: 24 * u, opacity: total, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: F.mono, fontSize: 28 * u, letterSpacing: '0.18em', color: C.steel }}>SUM OF REASONS</span>
        <span style={{ fontFamily: F.serif, fontSize: 96 * u, lineHeight: 1, color: score < 0 ? C.bad : C.ink }}>
          {score < 0 ? '−' : ''}
          {Math.abs(score * total).toFixed(3)}
        </span>
        <span style={{ fontFamily: F.mono, fontSize: 28 * u, color: C.good, opacity: ramp(t, at + rows.length * 0.32 + 1.6, at + rows.length * 0.32 + 2.2) }}>= score, exactly</span>
      </div>
    </div>
  );
}

/** Cluster of wallets around the dumper: 11 wallets with identical early buys (from the data). */
export function clusterLayout(cx: number, cy: number, u: number) {
  const r = rng(11);
  const n = dumper.cluster.size;
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return { x: cx, y: cy };
    const a = (i / (n - 1)) * Math.PI * 2 + r() * 0.3;
    const d = (150 + r() * 70) * u;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.82 };
  });
}

/** 1:05–1:35. The formula builds; reasons stack into the holder's score; then the dumper's. */
export function Score() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);
  const M = 160 * u;

  // Arrival: the dive's ring contracts.
  const arrive = ramp(t, 0, 1.6, expoOut);
  // Formula: big and centred, then up into a header.
  const fUp = ramp(t, 7.4, 9, softInOut);
  const fSize = lerp(124, 64, fUp) * u;
  const fY = lerp(height * 0.36, 118 * u, fUp);
  const holderLeave = ramp(t, 17.8, 18.8, softInOut);
  const cluster = clusterLayout(width * 0.79, height * 0.62, u);
  const ck = ramp(t, 22.2, 24.6, expoOut);

  return (
    <AbsoluteFill>
      <Backdrop />
      <Canvas
        draw={(ctx, w, h) => {
          if (arrive < 1) {
            ctx.strokeStyle = `rgba(214,219,225,${0.7 * (1 - arrive)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(w / 2, h * 0.47, lerp(Math.hypot(w, h) * 0.6, 40 * u, arrive), 0, Math.PI * 2);
            ctx.stroke();
          }
          // The dumper's funding cluster.
          if (ck > 0) {
            const leave = ramp(t, 29.2, 30, softInOut);
            ctx.globalAlpha = 1 - leave * 0.2;
            const c0 = cluster[0]!;
            cluster.slice(1).forEach((p, i) => {
              const k = clamp(ck * 1.6 - i * 0.06);
              ctx.strokeStyle = `rgba(240,138,156,${0.55 * k})`;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(c0.x, c0.y);
              ctx.lineTo(lerp(c0.x, p.x, k), lerp(c0.y, p.y, k));
              ctx.stroke();
            });
            cluster.forEach((p, i) => {
              const k = i === 0 ? 1 : clamp(ck * 1.6 - i * 0.06);
              const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34 * u);
              glow.addColorStop(0, `rgba(240,138,156,${0.35 * k})`);
              glow.addColorStop(1, 'rgba(240,138,156,0)');
              ctx.fillStyle = glow;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 34 * u, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = i === 0 ? '#f6c3cd' : `rgba(240,138,156,${k})`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, (i === 0 ? 10 : 6) * u, 0, Math.PI * 2);
              ctx.fill();
            });
            ctx.globalAlpha = 1;
          }
        }}
      />

      {/* Formula */}
      <div style={{ position: 'absolute', left: 0, width, top: fY, opacity: 1 - ramp(t, 28.6, 29.8, softInOut), display: 'flex', justifyContent: 'center', gap: lerp(30, 18, fUp) * u, alignItems: 'flex-start' }}>
        {TERMS.map((tm, i) => {
          const k = ramp(t, 1.4 + i * 0.32, 2.6 + i * 0.32, expoOut);
          const isTerm = tm.name !== '';
          const isNeg = tm.sym === 'δD' || tm.sym === 'εY';
          return (
            <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: k, transform: `translateY(${(1 - k) * 40 * u}px)`, filter: k < 1 ? `blur(${(1 - k) * 10}px)` : undefined }}>
              <div
                style={{
                  fontFamily: F.serif,
                  fontStyle: isTerm || tm.sym === 'S' ? 'italic' : 'normal',
                  fontSize: fSize,
                  lineHeight: 1,
                  color: isNeg && fUp > 0 ? C.bad : C.ink,
                  ...(tm.sym === 'S'
                    ? { backgroundImage: C.chromeX, backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', paddingRight: '0.08em' }
                    : {}),
                }}
              >
                {tm.sym}
              </div>
              {isTerm && (
                <div style={{ position: 'absolute', top: fSize * 1.08, whiteSpace: 'nowrap', fontFamily: F.mono, fontSize: 28 * u, letterSpacing: '0.12em', color: isNeg ? C.bad : C.steel, opacity: ramp(t, 3.6 + i * 0.2, 4.6 + i * 0.2) * (1 - fUp) }}>
                  {tm.name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Holder */}
      <div style={{ position: 'absolute', left: M, top: 204 * u, opacity: vis(t, 8.6, 18.6) }}>
        <Kicker size={28 * u}>Holder · {short(holder.wallet)} · simulated</Kicker>
      </div>
      {t < 19.5 && <Waterfall reasons={holder.reasons} score={holder.score} t={t} at={9.4} x={M} y={300 * u} w={1060 * u} rowH={50 * u} u={u} leave={holderLeave} />}
      <div style={{ position: 'absolute', left: 1330 * u, top: 360 * u, width: 440 * u }}>
        <Headline text="Every score *explains itself.*" t={t} at={13.4} out={17.8} size={80 * u} />
      </div>

      {/* Dumper */}
      <div style={{ position: 'absolute', left: M, top: 204 * u, opacity: vis(t, 19.2, 29.6) }}>
        <Kicker size={28 * u} color={C.bad}>
          Dumper · {short(dumper.wallet)} · simulated
        </Kicker>
      </div>
      {t > 18.8 && <Waterfall reasons={dumper.reasons} score={dumper.score} t={t} at={19.4} x={M} y={300 * u} w={1060 * u} rowH={50 * u} u={u} leave={ramp(t, 29, 30, softInOut)} />}
      <div style={{ position: 'absolute', left: cluster[0]!.x - 260 * u, width: 520 * u, top: cluster[0]!.y + 250 * u, textAlign: 'center', opacity: vis(t, 23.2, 29.6) }}>
        <div style={{ fontFamily: F.mono, fontSize: 28 * u, letterSpacing: '0.14em', color: C.bad }}>CLUSTER OF {dumper.cluster.size}</div>
        <div style={{ marginTop: 10 * u, fontFamily: F.sans, fontWeight: 300, fontSize: 28 * u, color: C.body }}>identical early buys</div>
      </div>
      <div style={{ position: 'absolute', left: 1330 * u, top: 250 * u, width: 470 * u }}>
        <Headline text="Dumping *follows you.*" t={t} at={25.2} out={29.2} size={80 * u} />
      </div>
    </AbsoluteFill>
  );
}
