'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { EASE } from './motion';

/** Animated score ring. Scores run roughly -1..1; the ring shows -0.5..1 as 0..100%. */
export function ScoreRing({ score, size = 220, label }: { score: number; size?: number; label?: string }) {
  const id = useId().replace(/:/g, '');
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (score + 0.5) / 1.5));
  const negative = score < 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`rg-${id}`} x1="0" y1="0" x2="1" y2="1">
            {negative ? (
              <>
                <stop offset="0" stopColor="#f6b2bf" />
                <stop offset="1" stopColor="#d9667c" />
              </>
            ) : (
              <>
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.5" stopColor="#8e959f" />
                <stop offset="1" stopColor="#eef1f4" />
              </>
            )}
          </linearGradient>
          <filter id={`rf-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="10" />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const r1 = r + 9;
          const r2 = r + (i % 5 === 0 ? 14 : 11);
          return (
            <line key={i} x1={size / 2 + Math.cos(a) * r1} y1={size / 2 + Math.sin(a) * r1} x2={size / 2 + Math.cos(a) * r2} y2={size / 2 + Math.sin(a) * r2} stroke="rgba(255,255,255,.14)" strokeWidth="1" />
          );
        })}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#rg-${id})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter={`url(#rf-${id})`}
          opacity={0.7}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 1.8, ease: EASE, delay: 0.2 }}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#rg-${id})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 1.8, ease: EASE, delay: 0.2 }}
        />
      </svg>
      <div className="ring-center">
        <div className={`score-big ${negative ? 'neg' : ''}`}>{score.toFixed(3)}</div>
        {label && <div className="tiny faint mono">{label}</div>}
      </div>
    </div>
  );
}

/** Five-axis radar for H, Q, A, D, Y. Good axes point outward; D and Y are drawn as risk (red). */
export function Radar({ values, size = 260 }: { values: { label: string; value: number; risk?: boolean }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2 + 6;
  const R = size / 2 - 34;
  const n = values.length;
  const pt = (i: number, v: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  const good = values.map((v) => (v.risk ? 0 : Math.max(0.04, Math.min(1, v.value))));
  const risk = values.map((v) => (v.risk ? Math.max(0.04, Math.min(1, v.value)) : 0.04));
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size + 12}`} className="radar">
      <defs>
        <radialGradient id="radar-g">
          <stop offset="0" stopColor="#eef1f4" stopOpacity=".06" />
          <stop offset="1" stopColor="#d6dbe1" stopOpacity=".32" />
        </radialGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={poly(values.map(() => k))} fill="none" stroke="rgba(255,255,255,.08)" />
      ))}
      {values.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.08)" />;
      })}
      <motion.polygon
        points={poly(good)}
        fill="url(#radar-g)"
        stroke="#e6e9ed"
        strokeWidth="1.5"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      <motion.polygon
        points={poly(risk)}
        fill="rgba(240,138,156,.14)"
        stroke="#f08a9c"
        strokeWidth="1.2"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: EASE, delay: 0.5 }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {values.map((v, i) => {
        const [x, y] = pt(i, 1.2);
        return (
          <text key={v.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label" fill={v.risk ? '#f08a9c' : '#c8cdd4'}>
            {v.label} {v.value.toFixed(2)}
          </text>
        );
      })}
    </svg>
  );
}

/** Diverging contribution bar: positive grows right in iris, negative left in rose. */
export function ContribBar({ value, max, delay = 0 }: { value: number; max: number; delay?: number }) {
  const w = `${Math.min(1, Math.abs(value) / max) * 50}%`;
  return (
    <div className="contrib">
      <motion.span
        className={value < 0 ? 'neg' : 'pos'}
        style={{ [value < 0 ? 'right' : 'left']: '50%' }}
        initial={{ width: 0 }}
        whileInView={{ width: w }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, ease: EASE, delay }}
      />
    </div>
  );
}

/** Four-window sold profile as a tiny area chart. Values are bps sold (undefined = pending). */
export function SoldSpark({ sold }: { sold: Partial<Record<'h1' | 'h24' | 'd7' | 'd30', number>> }) {
  const keys = ['h1', 'h24', 'd7', 'd30'] as const;
  const pts = keys.map((k, i) => ({ x: 6 + i * 36, v: sold[k] })).filter((p) => p.v !== undefined) as { x: number; v: number }[];
  if (!pts.length) return <span className="faint tiny">pending</span>;
  const y = (v: number) => 30 - (1 - v / 10_000) * 24;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${y(p.v)}`).join(' ');
  const last = pts[pts.length - 1]!;
  const color = last.v >= 9_000 ? '#f08a9c' : last.v < 1_000 ? '#8fe3c0' : '#aeb5bd';
  return (
    <svg width="120" height="34" viewBox="0 0 120 34" aria-label={`held ${Math.round(100 - last.v / 100)}%`}>
      <path d={`${line} L${last.x} 32 L6 32 Z`} fill={color} opacity=".12" />
      <motion.path d={line} fill="none" stroke={color} strokeWidth="1.6" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE }} />
      {pts.map((p) => (
        <circle key={p.x} cx={p.x} cy={y(p.v)} r="2.2" fill={color} />
      ))}
    </svg>
  );
}

/** Share still held after each window, as a glowing curve that draws itself. */
export function RetentionCurve({ points }: { points: { label: string; value: number | null }[] }) {
  const W = 640;
  const H = 240;
  const pad = { l: 44, r: 24, t: 24, b: 36 };
  const xs = points.map((_, i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1));
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const known = points.map((p, i) => ({ ...p, x: xs[i]! })).filter((p) => p.value !== null) as { label: string; value: number; x: number }[];
  const line = known.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${y(p.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="curve">
      <defs>
        <linearGradient id="curve-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6dbe1" stopOpacity=".22" />
          <stop offset="1" stopColor="#d6dbe1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="curve-line" x1="0" x2="1">
          <stop offset="0" stopColor="#8e959f" />
          <stop offset=".5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#aeb5bd" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.06)" />
          <text x={pad.l - 10} y={y(v)} textAnchor="end" dominantBaseline="middle" className="curve-tick">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={p.label} x={xs[i]} y={H - 10} textAnchor="middle" className="curve-tick">
          {p.label}
        </text>
      ))}
      {known.length > 1 && (
        <motion.path
          d={`${line} L${known[known.length - 1]!.x} ${y(0)} L${known[0]!.x} ${y(0)} Z`}
          fill="url(#curve-area)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.8 }}
        />
      )}
      <motion.path
        d={line}
        fill="none"
        stroke="url(#curve-line)"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 8px rgba(214,222,232,.55))' }}
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.8, ease: EASE }}
      />
      {known.map((p, i) => (
        <motion.g key={p.label} initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE, delay: 0.4 + i * 0.35 }} style={{ transformOrigin: `${p.x}px ${y(p.value)}px` }}>
          <circle cx={p.x} cy={y(p.value)} r="9" fill="rgba(214,219,225,.14)" />
          <circle cx={p.x} cy={y(p.value)} r="4.5" fill="#fff" />
          <text x={p.x} y={y(p.value) - 18} textAnchor="middle" className="curve-val">
            {(p.value * 100).toFixed(1)}%
          </text>
        </motion.g>
      ))}
    </svg>
  );
}

export const BUCKET_COLORS = ['#f2f4f6', '#a9b0b9', '#6f7680', '#c9d8e6', '#bfe3d3', '#e3d7bf', '#d6d0ea', '#e9b8c4', '#8e959f', '#dfe3e8'];

/** Allocation by bucket as a glowing donut with the allocated share in the middle. */
export function BucketDonut({ segments, center, sub, size = 200 }: { segments: { id: string; value: number }[]; center: string; sub: string; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 16;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14" />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const off = acc;
          acc += len;
          return (
            <motion.circle
              key={s.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={BUCKET_COLORS[i % BUCKET_COLORS.length]}
              strokeWidth="14"
              strokeDasharray={`${Math.max(0, len - 3)} ${c}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ filter: `drop-shadow(0 0 6px ${BUCKET_COLORS[i % BUCKET_COLORS.length]})` }}
              initial={{ strokeDashoffset: -off + len }}
              animate={{ strokeDashoffset: -off }}
              transition={{ duration: 1.1, ease: EASE, delay: i * 0.08 }}
            />
          );
        })}
      </svg>
      <div className="ring-center">
        <div className="score-big" style={{ fontSize: 36 }}>
          {center}
        </div>
        <div className="tiny faint">{sub}</div>
      </div>
    </div>
  );
}
