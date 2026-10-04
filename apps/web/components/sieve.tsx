'use client';

import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/**
 * "The Sieve": a scroll-pinned canvas that tells Scout's story with wallet dots.
 *   1. wallets arrive and settle into a field
 *   2. farms pull into clusters, turn rose and fall away with the dumpers
 *   3. survivors become the leaves of a Merkle tree that draws up to its root
 *   4. they drop into four aftermath columns, coloured by who held
 */

type Kind = 'holder' | 'trencher' | 'dumper' | 'farm';

interface Dot {
  kind: Kind;
  farm: number;
  survivor: number; // index among survivors, -1 if filtered out
  u: number; // outcome draw: held at window k if u > SOLD[k]
  sx: number; sy: number; // start (far away)
  fx: number; fy: number; // field
  cx: number; cy: number; // cluster (farms) or field
  lx: number; ly: number; // leaf
  ax: number; ay: number; // aftermath column slot
  heldMask: number;
  col: number;
}

const N = 220;
const SOLD = [0.16, 0.3, 0.41, 0.5];
const WINDOWS = ['1h', '24h', '7d', '30d'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const local = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function build(w: number, h: number): { dots: Dot[]; survivors: number; leafY: number; rootX: number; rootY: number; mids: { x: number; y: number }[]; tops: { x: number; y: number }[]; colX: number[]; baseY: number; held: number[] } {
  const r = rng(7);
  const R = w < 900 ? Math.min(w * 0.4, h * 0.3) : Math.min(w * 0.36, h * 0.42);
  const narrow = w < 900;
  const cx = narrow ? w * 0.5 : w * 0.65;
  const cy = narrow ? h * 0.36 : h * 0.52;
  const farmCenters = [
    [0.55, -0.42],
    [0.82, 0.05],
    [0.5, 0.42],
    [0.95, -0.32],
  ];
  const dots: Dot[] = [];
  let survivors = 0;
  for (let i = 0; i < N; i++) {
    const roll = r();
    const kind: Kind = roll < 0.16 ? 'farm' : roll < 0.27 ? 'dumper' : roll < 0.42 ? 'trencher' : 'holder';
    const farm = kind === 'farm' ? Math.floor(r() * 4) : -1;
    const a = r() * Math.PI * 2;
    const far = R * (1.9 + r() * 0.8);
    // field: an ellipse, denser in the middle
    const fr = Math.sqrt(r());
    const fa = r() * Math.PI * 2;
    const fx = cx + Math.cos(fa) * fr * R * 1.05;
    const fy = cy + Math.sin(fa) * fr * R * 0.62;
    let ccx = fx;
    let ccy = fy;
    if (farm >= 0) {
      const c = farmCenters[farm]!;
      const jr = Math.sqrt(r()) * R * 0.09;
      const ja = r() * Math.PI * 2;
      ccx = cx + c[0]! * R + Math.cos(ja) * jr;
      ccy = cy + c[1]! * R + Math.sin(ja) * jr;
    }
    const surviving = kind === 'holder' || kind === 'trencher';
    dots.push({
      kind,
      farm,
      survivor: surviving ? survivors++ : -1,
      u: kind === 'holder' ? 0.25 + r() * 0.75 : r() * 0.75,
      sx: cx + Math.cos(a) * far,
      sy: cy + Math.sin(a) * far,
      fx,
      fy,
      cx: ccx,
      cy: ccy,
      lx: 0,
      ly: 0,
      ax: 0,
      ay: 0,
      heldMask: 0,
      col: 0,
    });
  }

  // Merkle tree: leaves on a row, 16 mids, 4 tops, 1 root.
  const span = w < 900 ? R * 2.2 : R * 1.9;
  const leafY = cy + R * 0.48;
  const rootX = cx;
  const rootY = cy - R * 0.62;
  const mids = Array.from({ length: 16 }, (_, i) => ({ x: cx - span / 2 + ((i + 0.5) * span) / 16, y: cy + R * 0.12 }));
  const tops = Array.from({ length: 4 }, (_, i) => ({ x: cx - span / 2 + ((i + 0.5) * span) / 4, y: cy - R * 0.25 }));
  for (const d of dots) {
    if (d.survivor < 0) continue;
    d.lx = cx - span / 2 + ((d.survivor + 0.5) * span) / survivors;
    d.ly = leafY;
  }

  // Aftermath: survivors split across four columns, held at the bottom, sold above.
  const colX = [-0.75, -0.25, 0.25, 0.75].map((k) => cx + k * R * 1.15);
  const baseY = cy + R * 0.62;
  const perRow = 7;
  const gap = Math.max(5, R * 0.032);
  const held = [0, 0, 0, 0];
  const byCol: Dot[][] = [[], [], [], []];
  for (const d of dots) {
    if (d.survivor < 0) continue;
    d.col = d.survivor % 4;
    byCol[d.col]!.push(d);
  }
  byCol.forEach((list, c) => {
    list.sort((a, b) => b.u - a.u);
    list.forEach((d, k) => {
      const isHeld = d.u > SOLD[c]!;
      if (isHeld) held[c]!++;
      d.heldMask = isHeld ? 1 : 0;
      d.ax = colX[c]! + ((k % perRow) - (perRow - 1) / 2) * gap;
      d.ay = baseY - Math.floor(k / perRow) * gap;
    });
    held[c] = held[c]! / Math.max(1, list.length);
  });
  return { dots, survivors, leafY, rootX, rootY, mids, tops, colX, baseY, held };
}

const CAPTIONS = [
  { k: '01 · Opt in', t: 'Wallets arrive.', b: 'Every opted-in wallet brings its history: what it held, what it dumped, who funded it.' },
  { k: '02 · Sieve', t: 'Farms fall away.', b: 'Wallets sharing funders and identical trades collapse into one. Serial dumpers lose their claim.' },
  { k: '03 · Resolve', t: 'One list. One root.', b: 'Survivors become the leaves of a Merkle tree. The root goes on-chain with the policy hash.' },
  { k: '04 · Aftermath', t: 'The drop remembers.', b: 'At 1h, 24h, 7d and 30d Scout records who held. That memory is the next score.' },
];

function Caption({ i, progress }: { i: number; progress: ReturnType<typeof useScroll>['scrollYProgress'] }) {
  const a = i / 4;
  const b = (i + 1) / 4;
  // Function transforms run in JS: accelerated scroll timelines mis-track sticky children.
  const opacity = useTransform(progress, (v) => {
    const fadeIn = i === 0 ? 1 : clamp01((v - (a - 0.02)) / 0.06);
    const fadeOut = i === 3 ? 1 : clamp01((b - v) / 0.05);
    return Math.min(fadeIn, fadeOut);
  });
  const y = useTransform(progress, (v) => (i === 0 ? 0 : (1 - clamp01((v - (a - 0.02)) / 0.08)) * 24));
  const c = CAPTIONS[i]!;
  return (
    <motion.div className="sieve-caption" style={{ opacity, y }}>
      <div className="kicker">{c.k}</div>
      <h2 className="display">{c.t}</h2>
      <p className="lead">{c.b}</p>
    </motion.div>
  );
}

export function Sieve() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  const [phase, setPhase] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setPhase(Math.min(3, Math.floor(v * 4))));

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let model = build(1, 1);
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      model = build(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let shown = 0; // eased copy of the scroll progress
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      if (visible && !raf) raf = requestAnimationFrame(draw);
    });
    io.observe(el);

    function draw(now: number) {
      raf = 0;
      shown += (scrollYProgress.get() - shown) * 0.12;
      const p = shown;
      ctx.clearRect(0, 0, w, h);
      const tArrive = ease(local(p, 0.0, 0.18));
      const tCluster = ease(local(p, 0.22, 0.34));
      const tFall = ease(local(p, 0.36, 0.48));
      const tLeaf = ease(local(p, 0.5, 0.62));
      const tTree = local(p, 0.6, 0.74);
      const tCols = ease(local(p, 0.76, 0.9));
      const m = model;
      const breathe = Math.sin(now / 1400);

      // Tree lines, drawn upward level by level.
      if (tLeaf > 0.02 && tCols < 0.98) {
        const fade = 1 - tCols;
        ctx.lineWidth = 1;
        const lv1 = clamp01(tTree * 3);
        const lv2 = clamp01(tTree * 3 - 1);
        const lv3 = clamp01(tTree * 3 - 2);
        const line = (x1: number, y1: number, x2: number, y2: number, k: number, alpha: number) => {
          if (k <= 0) return;
          ctx.strokeStyle = `rgba(214, 219, 225, ${alpha * fade})`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(mix(x1, x2, k), mix(y1, y2, k));
          ctx.stroke();
        };
        for (const d of m.dots) {
          if (d.survivor < 0) continue;
          const mid = m.mids[Math.floor((d.survivor / m.survivors) * 16)]!;
          line(d.lx, d.ly, mid.x, mid.y, lv1, 0.12);
        }
        m.mids.forEach((mid, i) => line(mid.x, mid.y, m.tops[Math.floor(i / 4)]!.x, m.tops[Math.floor(i / 4)]!.y, lv2, 0.3));
        m.tops.forEach((t) => line(t.x, t.y, m.rootX, m.rootY, lv3, 0.5));
        for (const n of [...(lv1 >= 1 ? m.mids : []), ...(lv2 >= 1 ? m.tops : [])]) {
          ctx.fillStyle = `rgba(232, 237, 243, ${0.8 * fade})`;
          ctx.fillRect(n.x - 3, n.y - 3, 6, 6);
        }
        if (lv3 >= 1) {
          const g = ctx.createRadialGradient(m.rootX, m.rootY, 0, m.rootX, m.rootY, 46);
          g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
          g.addColorStop(0.25, `rgba(214,219,225,${0.35 * fade})`);
          g.addColorStop(1, 'rgba(214,219,225,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(m.rootX, m.rootY, 46 + breathe * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '500 11px "JetBrains Mono Variable", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = `rgba(238, 241, 244, ${0.85 * fade})`;
          ctx.fillText('MERKLE ROOT · 0x0974…0cbb', m.rootX, m.rootY - 56);
        }
      }

      // Farm links while clustered.
      if (tCluster > 0.05 && tFall < 0.05) {
        ctx.lineWidth = 0.8;
        const byFarm = new Map<number, Dot[]>();
        for (const d of m.dots) if (d.farm >= 0) byFarm.set(d.farm, [...(byFarm.get(d.farm) ?? []), d]);
        for (const list of byFarm.values()) {
          const hub = list[0]!;
          for (const d of list.slice(1)) {
            ctx.strokeStyle = `rgba(240, 138, 156, ${0.35 * tCluster * (1 - tFall)})`;
            ctx.beginPath();
            ctx.moveTo(hub.cx, hub.cy + tFall * h * 0.6);
            ctx.lineTo(d.cx, d.cy + tFall * h * 0.6);
            ctx.stroke();
          }
        }
      }

      // Aftermath column labels.
      if (tCols > 0.3) {
        ctx.textAlign = 'center';
        m.colX.forEach((x, c) => {
          ctx.font = '500 11px "JetBrains Mono Variable", monospace';
          ctx.fillStyle = `rgba(108, 114, 123, ${tCols})`;
          ctx.fillText(WINDOWS[c]!.toUpperCase(), x, m.baseY + 30);
          ctx.font = '400 30px "Instrument Serif", serif';
          ctx.fillStyle = `rgba(238, 241, 244, ${tCols})`;
          ctx.fillText(`${Math.round(m.held[c]! * 100)}%`, x, m.baseY + 64);
        });
      }

      // Dots.
      for (const d of m.dots) {
        let x = mix(d.sx, d.fx, tArrive);
        let y = mix(d.sy, d.fy, tArrive);
        let alpha = 0.15 + 0.85 * tArrive;
        let col = '232, 237, 243';
        let size = 2.1;
        if (d.farm >= 0) {
          x = mix(x, d.cx, tCluster);
          y = mix(y, d.cy, tCluster);
          col = tCluster > 0.3 ? '240, 138, 156' : col;
        }
        if (d.kind === 'dumper' && tCluster > 0.3) col = '240, 138, 156';
        if (d.kind === 'trencher') col = '174, 181, 189';
        if (d.survivor < 0) {
          y += tFall * tFall * h * 0.6;
          alpha *= 1 - tFall;
        } else {
          x = mix(x, d.lx, tLeaf);
          y = mix(y, d.ly, tLeaf);
          x = mix(x, d.ax, tCols);
          y = mix(y, d.ay, tCols);
          if (tCols > 0.4) col = d.heldMask ? '143, 227, 192' : '240, 138, 156';
          if (tCols > 0.4 && !d.heldMask) alpha *= 0.55;
          size = mix(2.1, 2.4, tCols);
        }
        if (alpha < 0.01) continue;
        ctx.fillStyle = `rgba(${col}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${col}, ${alpha * 0.08})`;
        ctx.beginPath();
        ctx.arc(x, y, size * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (visible && !document.hidden) raf = requestAnimationFrame(draw);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [scrollYProgress]);

  return (
    <section ref={section} className="sieve" aria-label="How Scout works">
      <div className="sieve-sticky">
        <div className="tessellation" />
        <canvas ref={canvas} className="sieve-canvas" aria-hidden />
        <div className="wrap sieve-copy">
          {CAPTIONS.map((_, i) => (
            <Caption key={i} i={i} progress={scrollYProgress} />
          ))}
          <div className="sieve-rail" aria-hidden>
            {CAPTIONS.map((c, i) => (
              <span key={c.k} className={i <= phase ? 'on' : ''} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
