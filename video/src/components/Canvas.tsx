import { useLayoutEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

/** A full-frame 2D canvas redrawn synchronously for every frame. */
export function Canvas({ draw, style }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
  });
  return <canvas ref={ref} width={width} height={height} data-frame={frame} style={{ position: 'absolute', inset: 0, ...style }} />;
}

/** Silver → rose mix as an rgba string. */
export function tint(rose: number, alpha: number) {
  const r = Math.round(226 + (240 - 226) * rose);
  const g = Math.round(231 + (138 - 231) * rose);
  const b = Math.round(237 + (156 - 237) * rose);
  return `rgba(${r},${g},${b},${alpha})`;
}
