'use client';

import { useEffect, useRef } from 'react';

/**
 * Silver dust: particles at three depths drift upward, twinkle, parallax with the
 * pointer and part around it. Canvas 2D, paused when off-screen.
 */
export function Dust({ count = 90, className }: { count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const parts = Array.from({ length: count }, () => {
      const z = 0.25 + Math.random() * 0.75;
      return { x: Math.random() * w, y: Math.random() * h, z, ox: 0, oy: 0, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 1.4 };
    });
    const mouse = { x: -9999, y: -9999, px: 0, py: 0 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.px = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.py = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      if (visible) raf = requestAnimationFrame(tick);
    });
    io.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 16.7;
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= 0.12 * p.z * p.speed * dt;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        // part around the pointer
        const dx = p.x + p.ox - mouse.x;
        const dy = p.y + p.oy - mouse.y;
        const d2 = dx * dx + dy * dy;
        const R = 130;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * 2.2;
          p.ox += (dx / d) * f;
          p.oy += (dy / d) * f;
        }
        p.ox *= 0.94;
        p.oy *= 0.94;
        const x = p.x + p.ox - mouse.px * 14 * p.z;
        const y = p.y + p.oy - mouse.py * 10 * p.z;
        const tw = 0.55 + 0.45 * Math.sin(now / 900 + p.phase);
        const a = (0.15 + p.z * 0.6) * tw;
        const size = 0.4 + p.z * 1.3;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 237, 243, ${a})`;
        ctx.fill();
        if (p.z > 0.85) {
          ctx.beginPath();
          ctx.arc(x, y, size * 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(232, 237, 243, ${a * 0.06})`;
          ctx.fill();
        }
      }
      if (visible && !reduce && !document.hidden) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, [count]);
  return <canvas ref={ref} className={className} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
