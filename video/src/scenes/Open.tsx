import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Orb, unitPx } from '../components/Orb';
import { Headline, Kicker, Line } from '../components/Type';
import { useEdition } from '../edition';
import { C, F, clamp, expoOut, lerp, ramp, softInOut } from '../theme';

/** Orb radius in world units for a frame, sized from the shorter side. */
export const orbRadius = (width: number, height: number) => (Math.min(width, height) * 0.26) / unitPx(height);

/** 0:00–0:15. Black; a silver droplet falls, lands, and swells into the mercury orb. Title resolves. */
export function Open() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);
  const px = unitPx(height);
  const R = orbRadius(width, height);
  const portrait = height > width;
  const chog = useEdition() === 'chog';

  // Fall: gravity ease-in from above the frame to the centre.
  const fall = interpolate(t, [1.2, 3.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) });
  const topY = height / 2 / px + 0.4;
  // Swell: after impact the droplet grows into the orb with a soft overshoot.
  const swell = interpolate(t, [3.4, 6.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.32, 0.5, 1) });
  // Make room for the title, then come back to centre before the shatter.
  const lift = ramp(t, 6.4, 8.2, softInOut) * (1 - ramp(t, 12.8, 14.6, softInOut));
  const liftY = portrait ? 0.9 : 0.62;
  const r = t < 3.4 ? 0.07 : lerp(0.07, R, swell) * lerp(1, 0.8, lift);
  const y = t < 3.4 ? lerp(topY, 0, fall) : lerp(0, liftY * R * 1.6, lift);
  const impact = Math.exp(-Math.max(0, t - 3.4) * 5) * (t >= 3.4 ? 1 : 0);
  const stretch = t < 3.4 ? lerp(1.2, 1.9, fall) : 1 - impact * 0.35;
  const tremble = ramp(t, 13, 15, Easing.in(Easing.quad));
  const wobble = 0.07 + impact * 0.5 + tremble * 0.03;

  // Splash ring at impact.
  const ring = ramp(t, 3.4, 5.4, expoOut);
  const ringOpacity = (t >= 3.4 ? 1 : 0) * (1 - ring) * 0.8;
  // Hairline orbits drawing on.
  const orbit = ramp(t, 5.2, 8, expoOut) * (1 - ramp(t, 13.2, 14.6, softInOut));
  const cx = width / 2;
  const cy = height / 2 - y * px;

  const titleSize = 178 * u * (portrait ? 1.5 : 1);
  const titleY = portrait ? height * 0.62 : height * 0.635;

  return (
    <AbsoluteFill>
      <Backdrop intensity={ramp(t, 3.2, 7, softInOut)} />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <ellipse cx={width / 2} cy={height / 2} rx={lerp(10, R * px * 2.6, ring)} ry={lerp(3, R * px * 0.5, ring)} fill="none" stroke="#e6eaee" strokeWidth={1.2} opacity={ringOpacity} />
        {[
          { rx: 2.15, ry: 0.42, rot: -9, o: 0.5 },
          { rx: 2.7, ry: 0.62, rot: 14, o: 0.3 },
        ].map((e, i) => {
          const L = Math.PI * 2 * Math.sqrt((e.rx ** 2 + e.ry ** 2) / 2) * R * px;
          return (
            <ellipse
              key={i}
              cx={cx}
              cy={cy}
              rx={e.rx * R * px * lerp(1, 0.8, lift)}
              ry={e.ry * R * px * lerp(1, 0.8, lift)}
              transform={`rotate(${e.rot + t * (i ? -1.2 : 1.6)} ${cx} ${cy})`}
              fill="none"
              stroke="#dfe4ea"
              strokeWidth={1}
              strokeDasharray={L}
              strokeDashoffset={L * (1 - orbit)}
              opacity={e.o * clamp(orbit * 2)}
            />
          );
        })}
      </svg>
      <Orb time={t + 40} drops={[{ x: 0, y, r, wobble, stretch, light: lerp(0.6, 1, ramp(t, 2, 6)) }]} />
      <AbsoluteFill style={{ alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: titleY, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 * u }}>
          <Headline text="Graduation *Scout*" t={t} at={7.2} size={titleSize} stagger={0.16} dur={1.6} out={12.6} align="center" />
          <div style={{ opacity: 1 - ramp(t, 12.4, 13.2) }}>
            <Line t={t} at={9.4} size={46 * u * (portrait ? 1.35 : 1)} color={C.body} style={{ textAlign: 'center', fontFamily: F.sans }}>
              Airdrops for the ones who stay.
            </Line>
          </div>
          {chog && (
            <div style={{ opacity: ramp(t, 10.4, 11.4) * (1 - ramp(t, 12.4, 13.2)), marginTop: 6 * u }}>
              <Kicker size={28 * u} color={C.ink}>Chogathon · vibe/vibe × Chog</Kicker>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
