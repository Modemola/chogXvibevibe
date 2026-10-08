import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Headline, Kicker } from '../components/Type';
import onchain from '../data/onchain.json';
import { C, F, clamp, expoOut, lerp, ramp, softInOut, vis } from '../theme';

/** Screenshot of the live builder (1440 CSS px wide, captured at 2×). */
const SHOT = { w: 1440, h: 2700 };

const CALLOUTS = [
  { at: 2.4, k: 'Template', v: ['Hold or Die'] },
  { at: 3.6, k: 'Buckets', v: ['Holders 50% · Spark 30%', 'Builders 20%'] },
  { at: 4.8, k: 'Caps', v: ['0.5% per wallet', '0.8% per cluster'] },
  { at: 8.6, k: 'Preview', v: ['183 recipients', '89.3% allocated'] },
];

/** Camera over the screenshot (CSS px): centre x/y and zoom, per phase. */
const SHOTS = [
  { at: 0, x: 540, y: 790, z: 1.42 },
  { at: 6.6, x: 540, y: 1790, z: 1.5 },
  { at: 11.4, x: 540, y: 2080, z: 1.42 },
];

/** 1:55–2:15. The live policy builder in a floating glass frame; the policy hash prints and locks. */
export function Builder() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);

  const enter = ramp(t, 0, 2.2, expoOut);
  const push = ramp(t, 0, 20, softInOut);
  const frameW = 1120 * u;
  const frameH = 690 * u;
  // Glide the camera between the template, the preview and the bucket table.
  let cam = { ...SHOTS[0]! };
  for (let i = 1; i < SHOTS.length; i++) {
    const k = ramp(t, SHOTS[i]!.at, SHOTS[i]!.at + 2.6, softInOut);
    cam = { at: 0, x: lerp(cam.x, SHOTS[i]!.x, k), y: lerp(cam.y, SHOTS[i]!.y, k), z: lerp(cam.z, SHOTS[i]!.z, k) };
  }
  cam.y += ramp(t, 0, 20, softInOut) * 40;
  const scale = (frameW / SHOT.w) * cam.z;
  const hash = onchain.policyHash;
  const typed = Math.floor(clamp((t - 13.2) / 2.2) * hash.length);
  const lock = ramp(t, 15.8, 16.8, expoOut);
  const leave = ramp(t, 18.8, 20, softInOut);

  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ position: 'absolute', left: 160 * u, top: 92 * u, width: 1100 * u }}>
        <Headline text="Creators *design the drop.*" t={t} at={0.6} out={18.6} size={88 * u} />
      </div>

      {/* Glass frame with the real builder */}
      <div style={{ position: 'absolute', left: 160 * u, top: 250 * u, width: frameW, height: frameH, perspective: 2600 * u, opacity: enter * (1 - leave) }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: '30% 50%',
            transform: `translateY(${(1 - enter) * 80 * u}px) rotateY(${lerp(16, 7, push)}deg) rotateX(${lerp(7, 3, push)}deg) scale(${lerp(0.94, 1.03, push)})`,
            borderRadius: 26 * u,
            overflow: 'hidden',
            border: '1px solid rgba(214,219,225,0.18)',
            boxShadow: '0 60px 140px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.08)',
            background: C.bg,
            position: 'relative',
          }}
        >
          <Img src={staticFile('shots/builder-full.png')} style={{ position: 'absolute', left: frameW / 2 - cam.x * scale, top: frameH / 2 - cam.y * scale, width: SHOT.w * scale, height: SHOT.h * scale }} />
          {/* glass sheen */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(115deg, transparent ${lerp(10, 50, push)}%, rgba(255,255,255,0.07) ${lerp(18, 58, push)}%, transparent ${lerp(30, 70, push)}%)`,
            }}
          />
        </div>
      </div>

      {/* Callouts */}
      <div style={{ position: 'absolute', left: 1360 * u, top: 250 * u, width: 420 * u, display: 'flex', flexDirection: 'column', gap: 30 * u, opacity: 1 - leave }}>
        {CALLOUTS.map((c) => {
          const k = ramp(t, c.at, c.at + 1, expoOut);
          return (
            <div key={c.k} style={{ opacity: k, transform: `translateX(${(1 - k) * 30 * u}px)` }}>
              <Kicker size={28 * u}>{c.k}</Kicker>
              <div style={{ marginTop: 10 * u, fontFamily: F.sans, fontWeight: 400, fontSize: 30 * u, lineHeight: 1.3, color: C.ink, whiteSpace: 'nowrap' }}>
                {c.v.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ opacity: ramp(t, 13, 13.6) }}>
          <Kicker size={28 * u} color={lock > 0.5 ? C.good : C.steel}>
            {lock > 0.5 ? 'Policy locked' : 'Policy hash'}
          </Kicker>
          <div style={{ marginTop: 12 * u, fontFamily: F.mono, fontSize: 28 * u, lineHeight: 1.45, color: C.ink, wordBreak: 'break-all', width: 380 * u }}>
            {hash.slice(0, typed)}
            <span style={{ opacity: typed < hash.length ? (Math.floor(t * 4) % 2 ? 1 : 0.2) : 0 }}>▍</span>
          </div>
          <div style={{ marginTop: 16 * u, display: 'flex', alignItems: 'center', gap: 14 * u, opacity: lock, transform: `scale(${lerp(0.9, 1, lock)})`, transformOrigin: 'left center' }}>
            <svg width={30 * u} height={34 * u} viewBox="0 0 30 34">
              <rect x="3" y="14" width="24" height="18" rx="4" fill="none" stroke={C.good} strokeWidth="2" />
              <path d={`M9 14 V${lerp(4, 9, lock)} a6 6 0 0 1 12 0 V14`} fill="none" stroke={C.good} strokeWidth="2" />
            </svg>
            <span style={{ fontFamily: F.sans, fontSize: 28 * u, color: C.body }}>goes on-chain with the drop</span>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 160 * u, top: 970 * u, opacity: vis(t, 2, 18.6) }}>
        <Kicker size={28 * u}>Live policy builder · simulated launch</Kicker>
      </div>
    </AbsoluteFill>
  );
}
