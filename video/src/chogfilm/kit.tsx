import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource-variable/jetbrains-mono';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import chogs from '../data/chog.json';

export const FPS = 30;

/** Pastel-on-Monad palette. */
export const P = {
  night: '#1b1238',
  deep: '#2a1b5e',
  monad: '#836ef9',
  lilac: '#c8b8ff',
  pink: '#ff8fd0',
  bubble: '#ffc2e6',
  butter: '#ffd94a',
  gold: '#f6b93b',
  mint: '#7cf2c9',
  sky: '#8fd3ff',
  white: '#ffffff',
  ink: '#1b1238',
  grey: '#9a94b3',
  red: '#ff5c7a',
};

export const FONT = { fun: "'Fredoka', 'Arial Rounded MT Bold', sans-serif", mono: "'JetBrains Mono Variable', monospace" };

export interface ChogArt {
  token: number;
  tokenId: number;
  file: string;
}
export const CHOGS = chogs as ChogArt[];

/** Holds the render until the fonts and every Chog image have loaded. */
export function useAssets() {
  const [handle] = useState(() => delayRender('chog assets'));
  useEffect(() => {
    const fonts = ['500 40px Fredoka', '600 40px Fredoka', '700 40px Fredoka', '400 32px "JetBrains Mono Variable"'].map((f) => document.fonts.load(f));
    const imgs = CHOGS.map(
      (c) =>
        new Promise<void>((res) => {
          const i = new Image();
          i.onload = () => res();
          i.onerror = () => res();
          i.src = staticFile(c.file);
        }),
    );
    Promise.all([...fonts, ...imgs]).then(() => continueRender(handle));
  }, [handle]);
}

/** Seconds since the scene started. */
export function useT() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
}

export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const ease = (t: number, a: number, b: number) => {
  const k = clamp((t - a) / (b - a));
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};
export const out = (t: number, a: number, b: number) => 1 - (1 - clamp((t - a) / (b - a))) ** 3;

/** A bouncy 0→1 (with overshoot) starting at `at` seconds. */
export function pop(t: number, at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) {
  if (t < at) return 0;
  return spring({ frame: (t - at) * FPS, fps: FPS, config: { damping: cfg.damping ?? 9, stiffness: cfg.stiffness ?? 140, mass: cfg.mass ?? 0.7 } });
}

/** Squash and stretch for a landing at `at`: returns [scaleX, scaleY]. */
export function squash(t: number, at: number, amount = 0.22): [number, number] {
  if (t < at) return [1, 1];
  const d = t - at;
  const k = Math.exp(-d * 7) * Math.cos(d * 22) * amount;
  return [1 + k, 1 - k];
}

let rs = 7;
export function rng(seed: number) {
  rs = seed >>> 0;
  return () => {
    rs = (rs + 0x6d2b79f5) >>> 0;
    let x = rs;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const r0 = rng(42);
const STARS = Array.from({ length: 90 }, () => ({ x: r0(), y: r0() * 0.8, s: 1 + r0() * 2.6, p: r0() * 6 }));
const BUBBLES = Array.from({ length: 16 }, () => ({ x: r0(), s: 40 + r0() * 120, sp: 0.02 + r0() * 0.03, p: r0(), hue: r0() }));

/** Deep Monad-purple sky with twinkling stars, soft glows and drifting bubbles. */
export function Sky({ glow = P.monad, t, warm = 0 }: { glow?: string; t: number; warm?: number }) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${P.night} 0%, ${P.deep} 60%, #3b2378 100%)`, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(55% 45% at 50% 18%, ${glow}55, transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(40% 35% at 85% 90%, ${P.pink}${Math.round(30 + warm * 40).toString(16)}, transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(40% 35% at 10% 85%, ${P.sky}22, transparent 70%)` }} />
      {STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${s.x * 100}%`,
            top: `${s.y * 100}%`,
            width: s.s,
            height: s.s,
            borderRadius: 99,
            background: '#fff',
            opacity: 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 + s.p)),
          }}
        />
      ))}
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="bubble-hi" cx="0.32" cy="0.3" r="0.3">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {BUBBLES.map((b, i) => {
          const y = 1.15 - ((t * b.sp + b.p) % 1.3);
          const r = b.s / 2;
          const cx = b.x * 1920 + r;
          const cy = y * 1080 + r;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill="url(#bubble-hi)" />
              <circle cx={cx} cy={cy} r={r - 1} fill="none" stroke={b.hue > 0.5 ? P.pink : P.lilac} strokeOpacity={0.2} strokeWidth={2} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
}

/** A Chog as a glossy die-cut sticker. */
export function Sticker({ c, size, tilt = 0, label = true, glow = 0, style }: { c: ChogArt; size: number; tilt?: number; label?: boolean; glow?: number; style?: CSSProperties }) {
  const b = Math.max(5, size * 0.045);
  return (
    <div style={{ width: size, transform: `rotate(${tilt}deg)`, ...style }}>
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: size * 0.16,
          background: '#fff',
          padding: b,
          boxShadow: `0 ${size * 0.06}px ${size * 0.12}px rgba(10,4,30,0.55), 0 0 ${size * 0.3 * glow}px ${P.butter}${glow ? 'aa' : '00'}`,
        }}
      >
        <Img src={staticFile(c.file)} style={{ width: size - 2 * b, height: size - 2 * b, borderRadius: size * 0.12, display: 'block', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: b, borderRadius: size * 0.12, background: 'linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 35%)' }} />
      </div>
      {label && (
        <div style={{ marginTop: size * 0.05, textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: Math.max(14, size * 0.11), color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
          Chog #{c.token}
        </div>
      )}
    </div>
  );
}

/** Rounded fun headline: words pop in one by one with a wobble. `*word*` is highlighted. */
export function Title({ text, t, at, size, color = '#fff', accent = P.butter, align = 'center', outAt, style }: { text: string; t: number; at: number; size: number; color?: string; accent?: string; align?: 'center' | 'left'; outAt?: number; style?: CSSProperties }) {
  const words = text.split(' ');
  const gone = outAt !== undefined ? out(t, outAt, outAt + 0.35) : 0;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: `0 ${size * 0.28}px`, opacity: 1 - gone, ...style }}>
      {words.map((w, i) => {
        const hl = w.startsWith('*');
        const word = w.replace(/\*/g, '');
        const k = pop(t, at + i * 0.09, { damping: 8, stiffness: 160 });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontFamily: FONT.fun,
              fontWeight: 700,
              fontSize: size,
              lineHeight: 1.08,
              color: hl ? accent : color,
              transform: `translateY(${(1 - k) * size * 0.6 + gone * size * 0.3}px) scale(${0.4 + 0.6 * k}) rotate(${(1 - k) * (i % 2 ? 8 : -8)}deg)`,
              opacity: clamp(k * 2),
              textShadow: `0 ${size * 0.06}px 0 ${P.night}, 0 ${size * 0.1}px ${size * 0.25}px rgba(0,0,0,0.35)`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

/** A pill label. */
export function Pill({ children, bg = P.white, color = P.ink, size = 30, style }: { children: ReactNode; bg?: string; color?: string; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.4, padding: `${size * 0.35}px ${size * 0.8}px`, borderRadius: 999, background: bg, color, fontFamily: FONT.fun, fontWeight: 600, fontSize: size, boxShadow: `0 ${size * 0.15}px 0 rgba(10,4,30,0.35)`, whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  );
}

/** A flat gold coin. */
export function Coin({ size, spin = 0, style }: { size: number; spin?: number; style?: CSSProperties }) {
  const sx = Math.max(0.12, Math.abs(Math.cos(spin)));
  return (
    <div style={{ width: size, height: size, transform: `scaleX(${sx})`, ...style }}>
      <div style={{ width: size, height: size, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, #fff6c2, ${P.butter} 35%, ${P.gold} 75%, #c98a12)`, border: `${size * 0.07}px solid #e6a21c`, boxShadow: '0 4px 10px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: size * 0.5, height: size * 0.5, borderRadius: 999, border: `${size * 0.06}px solid #e6a21c`, background: 'rgba(255,240,180,0.35)' }} />
      </div>
    </div>
  );
}

/** A four-point sparkle. */
export function Sparkle({ x, y, size, t, at, color = '#fff' }: { x: number; y: number; size: number; t: number; at: number; color?: string }) {
  const k = clamp((t - at) / 0.7);
  if (k <= 0 || k >= 1) return null;
  const s = Math.sin(k * Math.PI);
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, transform: `scale(${s}) rotate(${k * 90}deg)` }}>
      <path d="M0,-10 C1,-2 2,-1 10,0 C2,1 1,2 0,10 C-1,2 -2,1 -10,0 C-2,-1 -1,-2 0,-10Z" fill={color} />
    </svg>
  );
}

/** A grey wallet blob: a flipper (with a SOLD sign) or a farm clone. */
export function Blob({ size, kind, t, flip = false, style }: { size: number; kind: 'flipper' | 'farm'; t: number; flip?: boolean; style?: CSSProperties }) {
  const wob = Math.sin(t * 9) * 0.04;
  return (
    <div style={{ position: 'relative', width: size, height: size, transform: `scale(${1 + wob}, ${1 - wob}) scaleX(${flip ? -1 : 1})`, ...style }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <path d="M14,92 C4,92 6,60 12,44 C20,16 40,8 52,8 C70,8 88,22 90,48 C92,66 96,92 84,92 C76,92 74,84 66,84 C58,84 56,92 48,92 C40,92 38,84 30,84 C22,84 22,92 14,92Z" fill={kind === 'farm' ? '#8c86a6' : '#a7a1bf'} />
        <ellipse cx="38" cy="44" rx="6" ry={kind === 'farm' ? 3 : 7} fill={P.ink} />
        <ellipse cx="64" cy="44" rx="6" ry={kind === 'farm' ? 3 : 7} fill={P.ink} />
        {kind === 'flipper' ? <path d="M40,62 Q51,56 62,62" stroke={P.ink} strokeWidth="4" fill="none" strokeLinecap="round" /> : <rect x="40" y="60" width="22" height="4" rx="2" fill={P.ink} />}
      </svg>
    </div>
  );
}

/** The Scout orb: a silver ball with a friendly eye. */
export function Orb({ size, t, look = 0, blink = -1, style }: { size: number; t: number; look?: number; blink?: number; style?: CSSProperties }) {
  const b = blink >= 0 && t > blink && t < blink + 0.18 ? 0.1 : 1;
  return (
    <div style={{ position: 'relative', width: size, height: size, ...style }}>
      <div style={{ width: size, height: size, borderRadius: 999, background: 'radial-gradient(circle at 35% 28%, #ffffff, #e3e7ee 22%, #a9b1ba 55%, #5d646e 85%)', boxShadow: `0 ${size * 0.08}px ${size * 0.2}px rgba(0,0,0,0.45), inset 0 -${size * 0.06}px ${size * 0.12}px rgba(40,30,80,0.4)` }} />
      <div style={{ position: 'absolute', left: size * (0.42 + look * 0.12), top: size * 0.38, width: size * 0.16, height: size * 0.2 * b, borderRadius: 99, background: P.ink, transform: `translateY(${(1 - b) * size * 0.09}px)` }} />
      <div style={{ position: 'absolute', left: size * (0.47 + look * 0.12), top: size * 0.41, width: size * 0.05, height: size * 0.05 * b, borderRadius: 99, background: '#fff' }} />
      <div style={{ position: 'absolute', left: size * 0.2, top: size * 0.55, width: size * 0.12, height: size * 0.06, borderRadius: 99, background: P.pink, opacity: 0.55 }} />
      <div style={{ position: 'absolute', left: size * 0.68, top: size * 0.55, width: size * 0.12, height: size * 0.06, borderRadius: 99, background: P.pink, opacity: 0.55 }} />
    </div>
  );
}

/** Fades a scene in and out at its edges. */
export function SceneFade({ t, dur, children, fadeIn = 0.25, fadeOut = 0.25 }: { t: number; dur: number; children: ReactNode; fadeIn?: number; fadeOut?: number }) {
  const o = Math.min(clamp(t / fadeIn), clamp((dur - t) / fadeOut));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

export const lin = (t: number, a: number, b: number, from: number, to: number) => interpolate(t, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
