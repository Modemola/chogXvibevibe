import { AbsoluteFill } from 'remotion';
import { CHOGS, FONT, Orb, P, Pill, Sky, Sticker, useAssets } from './kit';

/** README cover: the title, a wall of real Chogs and the Scout orb (1920×960). */
export function Cover() {
  useAssets();
  return (
    <AbsoluteFill>
      <Sky t={3} glow={P.pink} warm={1} />
      {CHOGS.map((c, i) => {
        const x = 960 + ((i % 6) - 2.5) * 236;
        const y = 70 + Math.floor(i / 6) * 205;
        return (
          <div key={c.token} style={{ position: 'absolute', left: x - 80, top: y }}>
            <Sticker c={c} size={160} label={false} tilt={((i * 7) % 9) - 4} />
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 960 - 55, top: 505 }}>
        <Orb size={110} t={0} look={0.2} />
      </div>
      <div style={{ position: 'absolute', top: 640, width: '100%', textAlign: 'center', fontFamily: FONT.fun, fontWeight: 700, fontSize: 124, color: '#fff', lineHeight: 1, textShadow: `0 8px 0 ${P.night}` }}>
        Graduation <span style={{ color: P.butter }}>Scout</span>
      </div>
      <div style={{ position: 'absolute', top: 790, width: '100%', textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: 46, color: P.lilac }}>
        Airdrops for the Chogs who stay.
      </div>
      <div style={{ position: 'absolute', top: 870, width: '100%', display: 'flex', justifyContent: 'center', gap: 18 }}>
        <Pill bg="#fff" size={28}>vibe/vibe × Chog</Pill>
        <Pill bg={P.butter} size={28}>graduation-scout.vercel.app</Pill>
      </div>
    </AbsoluteFill>
  );
}
