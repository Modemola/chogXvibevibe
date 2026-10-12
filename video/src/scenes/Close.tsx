import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Canvas } from '../components/Canvas';
import { Orb, unitPx } from '../components/Orb';
import { Headline, Kicker } from '../components/Type';
import chogs from '../data/chog.json';
import { useEdition } from '../edition';
import { C, F, clamp, lerp, ramp, rng, softInOut } from '../theme';
import { flywheel } from './Aftermath';
import { orbRadius } from './Open';

const r = rng(170);
const MOTES = Array.from({ length: 260 }, () => ({ a: r() * Math.PI * 2, d: 0.6 + r() * 2.8, delay: r() * 0.6, s: 1 + r() * 2 }));

/** 2:50–3:00. Everything collapses back into the orb. The line. The end card. */
export function Close() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);
  const px = unitPx(height);
  const R = orbRadius(width, height) * 0.9;
  const fw = flywheel(width, height, u);
  const chog = useEdition() === 'chog';
  const form = interpolate(t, [0.5, 2.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.3, 0.5, 1) });
  const card = ramp(t, 5.2, 6.4, softInOut);
  const startY = (height / 2 - fw.y) / px;
  const lift = ramp(t, 1.6, 3, softInOut);
  const orbY = lerp(startY, 0, ramp(t, 0, 2.2, softInOut)) + lerp(lift * R * 0.5, R * 0.95, card);
  const rr = R * form * lerp(1, 0.62, card);

  return (
    <AbsoluteFill>
      <Backdrop />
      <Canvas
        draw={(ctx, w, h) => {
          // The flywheel ring and loose motes collapse into the centre.
          const k = ramp(t, 0, 1.6, Easing.in(Easing.cubic));
          const cx = w / 2;
          const cy = lerp(fw.y, h / 2, ramp(t, 0, 2.2, softInOut));
          if (k < 1) {
            ctx.strokeStyle = `rgba(238,241,244,${1 - k})`;
            ctx.lineWidth = 2.6 * u;
            ctx.beginPath();
            ctx.arc(cx, cy, fw.r * (1 - k), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.92);
            ctx.stroke();
          }
          for (const m of MOTES) {
            const mk = clamp((t - m.delay) / 1.6);
            if (mk >= 1) continue;
            const e = Easing.in(Easing.cubic)(mk);
            const d = m.d * fw.r * (1 - e);
            ctx.fillStyle = `rgba(226,231,237,${0.7 * (1 - e) * clamp(t * 4)})`;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(m.a) * d * 1.6, cy + Math.sin(m.a) * d, m.s * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }}
      />
      <Orb time={150 + t} drops={[{ x: 0, y: orbY, r: rr, wobble: 0.07 + (1 - form) * 0.3 }]} />

      <div style={{ position: 'absolute', left: 0, width, top: height * 0.73, display: 'flex', justifyContent: 'center' }}>
        <Headline text="Curate a community, *not a dump.*" t={t} at={2.2} out={4.9} size={104 * u} align="center" />
      </div>

      {/* End card */}
      <div style={{ position: 'absolute', left: 0, width, top: height * 0.56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 * u, opacity: card, transform: `translateY(${(1 - card) * 30 * u}px)` }}>
        <Headline text="Graduation *Scout*" t={t} at={5.4} size={128 * u} align="center" stagger={0.14} dur={1.3} />
        <div style={{ opacity: ramp(t, 6.0, 6.9), fontFamily: F.sans, fontWeight: 300, fontSize: 34 * u, color: C.body }}>
          {chog ? 'built for the Chogathon · vibe/vibe × Chog' : 'built for vibe/vibe on Robinhood Chain'}
        </div>
        {chog && (
          <div style={{ display: 'flex', gap: 14 * u, marginTop: 6 * u }}>
            {(chogs as { token: number; file: string }[]).slice(0, 5).map((c, i) => (
              <Img key={c.token} src={staticFile(c.file)} style={{ width: 64 * u, height: 64 * u, borderRadius: 14 * u, border: `1px solid ${C.stroke}`, opacity: ramp(t, 6.3 + i * 0.1, 7.0 + i * 0.1) }} />
            ))}
          </div>
        )}
        <div style={{ opacity: ramp(t, 6.2, 7.0), marginTop: 10 * u }}>
          <Kicker size={30 * u} color={C.ink} style={{ letterSpacing: '0.08em', textTransform: 'none' }}>
            graduation-scout.vercel.app
          </Kicker>
        </div>
      </div>
    </AbsoluteFill>
  );
}
