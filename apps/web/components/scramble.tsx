'use client';

import { useEffect, useRef, useState } from 'react';

const GLYPHS = '0123456789abcdef'.split('');

/**
 * Cycles through `lines`, each one resolving left to right out of hex noise,
 * like a wallet being read. Characters in `keep` never scramble.
 */
export function Scramble({ lines, className, resolveMs = 1100, holdMs = 2600, keep = ' ·.%→' }: { lines: string[]; className?: string; resolveMs?: number; holdMs?: number; keep?: string }) {
  const [text, setText] = useState(lines[0] ?? '');
  const idx = useRef(0);
  useEffect(() => {
    if (!lines.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setText(lines[0]!);
      return;
    }
    let raf = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      const target = lines[idx.current % lines.length]!;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / resolveMs);
        const settled = Math.floor(p * target.length);
        let out = '';
        for (let i = 0; i < target.length; i++) {
          const ch = target[i]!;
          out += i < settled || keep.includes(ch) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        setText(out);
        if (p < 1) raf = requestAnimationFrame(step);
        else {
          idx.current++;
          timer = setTimeout(run, holdMs);
        }
      };
      raf = requestAnimationFrame(step);
    };
    run();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [lines, resolveMs, holdMs, keep]);
  return (
    <span className={className} aria-live="off">
      {text}
    </span>
  );
}
