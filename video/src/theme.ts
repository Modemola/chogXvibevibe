import { Easing, interpolate } from 'remotion';

/** Silver-noir tokens, identical to the website (apps/web/app/globals.css). */
export const C = {
  bg: '#07080a',
  panel: '#0e1013',
  ink: '#eef1f4',
  body: '#aeb5bf',
  steel: '#8a929c',
  faint: '#5b626b',
  hair: '#1d2026',
  stroke: '#2b2f36',
  good: '#8fe3c0',
  bad: '#f08a9c',
  chrome: 'linear-gradient(180deg, #ffffff 0%, #e6eaee 28%, #a9b1ba 52%, #eef1f4 70%, #8d949d 100%)',
  chromeX: 'linear-gradient(100deg, #8d949d 0%, #eef1f4 30%, #ffffff 45%, #a9b1ba 62%, #eef1f4 80%, #8d949d 100%)',
};

export const F = {
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Inter Tight Variable', 'Inter Tight', Arial, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', 'Courier New', monospace",
};

export const FPS = 60;
export const s = (sec: number) => Math.round(sec * FPS);

/** Scene start times in seconds (the film is exactly 180 s). */
export const SCENES = [
  { id: 'open', start: 0, end: 15 },
  { id: 'problem', start: 15, end: 40 },
  { id: 'idea', start: 40, end: 65 },
  { id: 'score', start: 65, end: 95 },
  { id: 'sybil', start: 95, end: 115 },
  { id: 'builder', start: 115, end: 135 },
  { id: 'onchain', start: 135, end: 155 },
  { id: 'aftermath', start: 155, end: 170 },
  { id: 'close', start: 170, end: 180 },
] as const;

export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const expoInOut = Easing.bezier(0.87, 0, 0.13, 1);
export const softOut = Easing.bezier(0.22, 1, 0.36, 1);
export const softInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 between two times (seconds, scene-local), eased. */
export function ramp(t: number, from: number, to: number, easing: (x: number) => number = expoOut) {
  return interpolate(t, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
}

/** Fade in at `a`, out at `b` (seconds), each over `d`. */
export function vis(t: number, a: number, b: number, d = 0.8) {
  return Math.min(ramp(t, a, a + d, softOut), 1 - ramp(t, b - d, b, softInOut));
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/** Deterministic PRNG so every frame renders identically. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
