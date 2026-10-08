import { unitPx } from './components/Orb';
import { clamp, expoOut, lerp, rng, softInOut } from './theme';

/**
 * The wallet world of scenes 2 and 3, as pure functions of time, so a scene can start
 * exactly where the previous one ended (match cuts) and every frame is deterministic.
 */
export type Role = 'holder' | 'farm' | 'dumper';
export interface Particle {
  role: Role;
  farm: number; // farm index, or -1
  ox: number; // burst origin, relative to the orb centre (px)
  oy: number;
  bx: number; // burst displacement (px)
  by: number;
  tx: number; // resting place in the crowd
  ty: number;
  delay: number;
  size: number;
  phase: number;
  bright: number;
}

export interface WorldGeom {
  width: number;
  height: number;
  lineY: number;
  farms: { x: number; y: number }[];
  particles: Particle[];
}

const cache = new Map<string, WorldGeom>();

export function world(width: number, height: number): WorldGeom {
  const key = `${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(42);
  const u = Math.min(width, height) / 1080;
  const portrait = height > width;
  const n = portrait ? 1100 : 1500;
  const orbR = Math.min(width, height) * 0.26;
  const lineY = height * (portrait ? 0.7 : 0.68);
  const farms = portrait
    ? [
        { x: width * 0.27, y: height * 0.5 },
        { x: width * 0.72, y: height * 0.46 },
        { x: width * 0.32, y: height * 0.61 },
        { x: width * 0.7, y: height * 0.6 },
      ]
    : [
        { x: width * 0.2, y: height * 0.5 },
        { x: width * 0.43, y: height * 0.43 },
        { x: width * 0.63, y: height * 0.55 },
        { x: width * 0.83, y: height * 0.45 },
      ];
  const particles: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * orbR;
    const dir = Math.atan2(Math.sin(a), Math.cos(a)) + (r() - 0.5) * 0.6;
    const dist = lerp(180, 1100, r() ** 1.6) * u;
    const roll = r();
    const role: Role = roll < 0.12 ? 'farm' : roll < 0.27 ? 'dumper' : 'holder';
    // Resting crowd: above the graduation line, denser near it.
    const tx = lerp(width * 0.04, width * 0.96, r());
    const ty = lineY - 14 * u - (r() ** 1.7) * height * (portrait ? 0.38 : 0.42);
    particles.push({
      role,
      farm: role === 'farm' ? Math.floor(r() * 4) : -1,
      ox: Math.cos(a) * rad,
      oy: Math.sin(a) * rad,
      bx: Math.cos(dir) * dist,
      by: Math.sin(dir) * dist - 120 * u,
      tx,
      ty,
      delay: r() * 1.6,
      size: lerp(1.3, 3.2, r() ** 2) * u * 1.25,
      phase: r() * Math.PI * 2,
      bright: lerp(0.45, 1, r()),
    });
  }
  const geom = { width, height, lineY, farms, particles };
  cache.set(key, geom);
  return geom;
}

/** Time slows to a stop from 21 s (the freeze that opens scene 3). */
export const effectiveTime = (t: number) => (t < 21 ? t : 21 + (1 - Math.exp(-(t - 21) * 1.1)) / 1.1);

export interface Point {
  x: number;
  y: number;
  /** 0 = silver, 1 = fully rose. */
  rose: number;
  alpha: number;
  size: number;
  /** Previous position for motion trails (dumpers). */
  px: number;
  py: number;
}

/** Where particle `p` is at scene-2 time `t` (seconds). */
export function problemPoint(g: WorldGeom, p: Particle, t: number): Point {
  const te = effectiveTime(t);
  const cx = g.width / 2;
  const cy = g.height / 2;
  const u = Math.min(g.width, g.height) / 1080;

  // Burst out of the orb, then rain into the crowd.
  const kb = expoOut(clamp(te / 2.4));
  const bx = cx + p.ox + p.bx * kb;
  const by = cy + p.oy + p.by * kb;
  const kr = softInOut(clamp((te - 1.4 - p.delay) / 3.2));
  const drift = 6 * u * Math.sin(te * 0.6 + p.phase);
  let x = lerp(bx, p.tx, kr) + drift * kr;
  let y = lerp(by, p.ty, kr) + drift * 0.5 * kr;
  let rose = 0;
  let alpha = clamp(te * 3) * p.bright;

  if (p.role === 'farm') {
    // Farms pull into tight clusters that move as one.
    const f = g.farms[p.farm]!;
    const k = softInOut(clamp((te - 9.4 - p.delay * 0.4) / 2.6));
    const ang = p.phase;
    const rr = (10 + ((p.phase * 37) % 26)) * u;
    const sync = Math.sin(te * 1.7 + p.farm) * 26 * u;
    x = lerp(x, f.x + Math.cos(ang) * rr + sync, k);
    y = lerp(y, f.y + Math.sin(ang) * rr * 0.8 + Math.cos(te * 1.7 + p.farm) * 10 * u, k);
    rose = k;
    alpha = lerp(alpha, 1, k);
  }
  let px = x;
  let py = y;
  if (p.role === 'dumper') {
    // Dumpers flash as they claim, then streak away out of frame.
    const start = 12.6 + p.delay * 1.4;
    const flash = Math.exp(-Math.abs(te - start) * 3);
    const k = clamp((te - start) / 2.2);
    const kk = k * k * k;
    const dx = (g.width * 0.95 + 400 * u) * kk;
    // Flee right and slightly down, so the streaks never cross the headline above the crowd.
    const dy = g.height * 0.035 * kk * (p.phase % 1);
    px = x + dx * 0.7;
    py = y + dy * 0.7;
    x += dx;
    y += dy;
    rose = clamp(k * 3) * 0.55;
    alpha = Math.max(alpha, flash);
  }
  // Holders who stayed dim as the price falls.
  if (p.role === 'holder') alpha *= lerp(1, 0.55, softInOut(clamp((te - 17.5) / 3)));
  return { x, y, rose, alpha, size: p.size, px, py };
}

/** World units per pixel helper for scenes that mix the orb and particles. */
export const pxToWorld = (height: number, px: number) => px / unitPx(height);
