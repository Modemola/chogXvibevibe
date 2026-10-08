import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../theme';

const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/**
 * The website's atmosphere: near-black, a slow silver mist lit from above, a vignette,
 * and film grain that changes every frame (deterministically).
 */
export function Backdrop({ intensity = 1 }: { intensity?: number }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const m = (phase: number, amp: number, speed: number) => Math.sin(t * speed + phase) * amp;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ opacity: intensity }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(60% 45% at ${50 + m(0, 6, 0.05)}% ${-4 + m(1, 3, 0.04)}%, rgba(150,160,172,0.20), transparent 70%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(38% 34% at ${22 + m(2, 8, 0.03)}% ${62 + m(3, 6, 0.035)}%, rgba(120,130,142,0.07), transparent 70%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(42% 36% at ${80 + m(4, 7, 0.028)}% ${48 + m(5, 8, 0.03)}%, rgba(140,150,162,0.06), transparent 70%)`,
          }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 90% at 50% 30%, transparent 45%, rgba(3,4,6,0.85) 100%)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, width, height }} />
    </AbsoluteFill>
  );
}

/** Film grain over everything. Offset jumps every frame from a fixed sequence. */
export function Grain({ opacity = 0.05 }: { opacity?: number }) {
  const frame = useCurrentFrame();
  const x = (frame * 97) % 256;
  const y = (frame * 61) % 256;
  return (
    <AbsoluteFill
      style={{ pointerEvents: 'none', backgroundImage: NOISE, backgroundPosition: `${x}px ${y}px`, opacity, mixBlendMode: 'overlay' }}
    />
  );
}
