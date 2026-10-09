import { AbsoluteFill, useVideoConfig } from 'remotion';
import { useFonts } from './components/Fonts';
import { Orb, unitPx } from './components/Orb';

/**
 * The $SCOUT token logo: the site's mercury orb on near-black, sized to survive a circular
 * crop, with an optional hairline orbit. Rendered as stills (Logo, LogoPlain).
 */
export function Logo({ ring = true, time = 22, light = 1, contrast = 1.5, brightness = 1.02 }: { ring?: boolean; time?: number; light?: number; contrast?: number; brightness?: number }) {
  useFonts();
  const { width, height } = useVideoConfig();
  const px = unitPx(height);
  const rPx = width * 0.29; // orb diameter ≈ 58% of the frame
  const cx = width / 2;
  const cy = height / 2;
  const rx = rPx * 1.5;
  const ry = rPx * 0.34;
  const tilt = -9;
  // The ring's back half is drawn under the orb and its front half over it, so it reads as orbiting.
  const ringPath = (front: boolean) => {
    const a0 = front ? 0 : Math.PI;
    const a1 = front ? Math.PI : Math.PI * 2;
    const p = (a: number) => {
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      const t = (tilt * Math.PI) / 180;
      return `${cx + x * Math.cos(t) - y * Math.sin(t)},${cy + x * Math.sin(t) + y * Math.cos(t)}`;
    };
    const steps = 96;
    return Array.from({ length: steps + 1 }, (_, i) => `${i ? 'L' : 'M'}${p(a0 + ((a1 - a0) * i) / steps)}`).join(' ');
  };
  const moonA = Math.PI * 0.18;
  const moon = (() => {
    const t = (tilt * Math.PI) / 180;
    const x = Math.cos(moonA) * rx;
    const y = Math.sin(moonA) * ry;
    return { x: cx + x * Math.cos(t) - y * Math.sin(t), y: cy + x * Math.sin(t) + y * Math.cos(t) };
  })();
  const stroke = Math.max(2, width / 300);
  return (
    <AbsoluteFill style={{ background: '#07080a' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(42% 42% at 50% 46%, rgba(170,182,196,0.16), transparent 70%)' }} />
      {ring && (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <path d={ringPath(false)} fill="none" stroke="#dfe4ea" strokeOpacity={0.35} strokeWidth={stroke} />
        </svg>
      )}
      {/* Deeper darks and brighter speculars than the site's ambient orb, so the chrome reads at avatar size. */}
      <AbsoluteFill style={{ filter: `contrast(${contrast}) brightness(${brightness})` }}>
        <Orb time={time} drops={[{ x: 0, y: 0, r: rPx / px, wobble: 0.045, light }]} detail={64} />
      </AbsoluteFill>
      {ring && (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <path d={ringPath(true)} fill="none" stroke="#e8ecf0" strokeOpacity={0.75} strokeWidth={stroke} />
          <circle cx={moon.x} cy={moon.y} r={stroke * 3.2} fill="#ffffff" />
          <circle cx={moon.x} cy={moon.y} r={stroke * 9} fill="url(#glow)" />
          <defs>
            <radialGradient id="glow">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>
      )}
    </AbsoluteFill>
  );
}
