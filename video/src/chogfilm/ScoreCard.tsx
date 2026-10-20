import { AbsoluteFill, Audio, Img, interpolate, staticFile } from 'remotion';
import { FONT, Orb, P, Pill, Sky, Sparkle, clamp, ease, lerp, out, pop, squash, useAssets, useT } from './kit';

export type ScoreCardProps = {
  wallet: string;
  optedIn: boolean;
  score: number;
  reasons: { label: string; contrib: number }[];
  chogCount: number;
  chogBalance: number;
  chogs: { token: number; file: string }[];
  eligible: { name: string; bucket: string }[];
  readAt: string;
  music: boolean;
};

export const SAMPLE_CARD: ScoreCardProps = {
  wallet: '0x84113421a8a564b594ee9ae78c875310332d7023',
  optedIn: false,
  score: 0.22,
  reasons: [
    { label: 'Baseline (thin hold history)', contrib: 0.14 },
    { label: 'Holds a Chog Genesis NFT', contrib: 0.05 },
    { label: 'Baseline (thin trading history)', contrib: 0.03 },
  ],
  chogCount: 59,
  chogBalance: 0,
  chogs: [
    { token: 1462, file: 'chog/1.webp' },
    { token: 1881, file: 'chog/420.webp' },
    { token: 269, file: 'chog/777.webp' },
  ],
  eligible: [{ name: 'Chog Holders', bucket: 'chogs' }],
  readAt: '2026-10-20',
  music: true,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A 10 s personal score clip (1080×1350): the wallet, its Chogs, its score and who would pay it. */
export function ScoreCard(props: ScoreCardProps) {
  useAssets();
  const t = useT();
  const W = 1080;
  const has = props.chogCount > 0;
  const scan = clamp((t - 0.5) / 1.1);
  const shown = props.chogs.slice(0, 4);
  const scoreK = ease(t, 4.3, 6.2);
  const shownScore = props.score * scoreK;
  const verdict = out(t, 7.3, 7.8);
  const chogsOut = out(t, 4.0, 4.4);
  const scoreOut = out(t, 7.1, 7.4);
  const fadeEnd = 1 - out(t, 9.7, 10);
  return (
    <AbsoluteFill style={{ opacity: Math.min(clamp(t / 0.15), fadeEnd + 0.0001) }}>
      <Sky t={t + 4} glow={P.pink} warm={0.6} />

      {/* Header */}
      <div style={{ position: 'absolute', top: 60, width: W, textAlign: 'center' }}>
        <div style={{ fontFamily: FONT.fun, fontWeight: 600, fontSize: 40, color: P.lilac, opacity: out(t, 0.1, 0.5) }}>Scout read your wallet</div>
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', transform: `scale(${pop(t, 0.3)})` }}>
          <Pill bg="#fff" size={44}>
            <span style={{ fontFamily: FONT.mono, fontWeight: 600 }}>{short(props.wallet)}</span>
          </Pill>
        </div>
      </div>

      {/* Orb with a scanning beam */}
      <div style={{ position: 'absolute', left: W / 2 - 60, top: 250 + Math.sin(t * 2.4) * 8, opacity: 1 - verdict * 0.0 }}>
        <Orb size={120} t={t} look={Math.sin(t * 1.8) * 0.8} blink={3.2} />
      </div>
      {t > 0.5 && t < 1.8 && (
        <div style={{ position: 'absolute', left: 90, width: W - 180, top: lerp(420, 1200, scan), height: 6, borderRadius: 9, background: `linear-gradient(90deg, transparent, ${P.mint}, transparent)`, opacity: Math.sin(scan * Math.PI) }} />
      )}

      {/* Act 1: the Chogs */}
      <div style={{ position: 'absolute', top: 430, width: W, opacity: 1 - chogsOut, transform: `translateY(${chogsOut * -40}px)` }}>
        {has ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 22, height: 270 }}>
              {shown.map((c, i) => {
                const at = 1.5 + i * 0.22;
                const k = pop(t, at, { damping: 10 });
                const [sx, sy] = squash(t, at + 0.3, 0.16);
                const size = shown.length > 3 ? 210 : 240;
                return (
                  <div key={c.token} style={{ transform: `translateY(${(1 - k) * -500}px) scale(${sx}, ${sy}) rotate(${(i % 2 ? 1 : -1) * 4}deg)`, opacity: k > 0 ? 1 : 0, textAlign: 'center' }}>
                    <div style={{ width: size, height: size, borderRadius: size * 0.16, background: '#fff', padding: 10, boxShadow: '0 16px 30px rgba(10,4,30,0.55)' }}>
                      <Img src={staticFile(c.file)} style={{ width: size - 20, height: size - 20, borderRadius: size * 0.12, display: 'block' }} />
                    </div>
                    <div style={{ fontFamily: FONT.fun, fontWeight: 600, fontSize: 30, color: '#fff', marginTop: 10 }}>#{c.token}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 70, textAlign: 'center', fontFamily: FONT.fun, fontWeight: 700, fontSize: 92, color: P.butter, transform: `scale(${pop(t, 2.5)})`, textShadow: `0 8px 0 ${P.night}` }}>
              {props.chogCount} Chog{props.chogCount === 1 ? '' : 's'}!
            </div>
            <div style={{ textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: 38, color: P.lilac, marginTop: 6, opacity: out(t, 2.8, 3.2) }}>
              read live from Monad{props.chogBalance > 0 ? ` · ${props.chogBalance.toLocaleString('en-US')} $CHOG` : ''}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 260, height: 260, margin: '0 auto', borderRadius: 42, border: '8px dashed #ffffff55', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pop(t, 1.5)})`, fontFamily: FONT.fun, fontWeight: 700, fontSize: 150, color: '#ffffff55' }}>?</div>
            <div style={{ marginTop: 50, fontFamily: FONT.fun, fontWeight: 700, fontSize: 84, color: '#fff', transform: `scale(${pop(t, 2.2)})` }}>No Chog yet</div>
            <div style={{ fontFamily: FONT.fun, fontWeight: 600, fontSize: 38, color: P.lilac, marginTop: 6, opacity: out(t, 2.6, 3) }}>holding one adds +0.10 to your score</div>
          </div>
        )}
      </div>

      {/* Act 2: the score */}
      <div style={{ position: 'absolute', top: 430, width: W, opacity: out(t, 4.0, 4.4) * (1 - scoreOut), transform: `translateY(${(1 - out(t, 4.0, 4.4)) * 40}px)` }}>
        <div style={{ textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: 40, color: P.lilac }}>your Scout score</div>
        <div style={{ textAlign: 'center', fontFamily: FONT.fun, fontWeight: 700, fontSize: 230, color: '#fff', lineHeight: 1.05, textShadow: `0 12px 0 ${P.night}` }}>{shownScore.toFixed(2)}</div>
        <div style={{ margin: '10px auto 0', width: 780, height: 36, borderRadius: 99, background: '#ffffff22', border: '3px solid #ffffff33', overflow: 'hidden' }}>
          <div style={{ width: `${clamp(Math.max(0, shownScore) / 0.7) * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${P.pink}, ${P.butter}, ${P.mint})` }} />
        </div>
        <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          {props.reasons.slice(0, 3).map((r, i) => {
            const k = pop(t, 5.0 + i * 0.35, { damping: 11 });
            return (
              <div key={r.label} style={{ transform: `translateX(${(1 - k) * 300}px)`, opacity: clamp(k * 2) }}>
                <Pill bg={r.contrib >= 0 ? P.mint : P.red} color={r.contrib >= 0 ? P.ink : '#fff'} size={34}>
                  <b style={{ fontFamily: FONT.mono }}>{r.contrib >= 0 ? '+' : ''}{r.contrib.toFixed(2)}</b> {r.label}
                </Pill>
              </div>
            );
          })}
        </div>
      </div>

      {/* Act 3: the verdict */}
      <div style={{ position: 'absolute', top: 430, width: W, opacity: verdict, transform: `translateY(${(1 - verdict) * 40}px)`, textAlign: 'center' }}>
        {props.eligible.length ? (
          <>
            <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 76, color: '#fff', textShadow: `0 8px 0 ${P.night}` }}>{props.optedIn ? 'You get the drop on' : 'You’d get the drop on'}</div>
            <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              {props.eligible.slice(0, 3).map((e, i) => (
                <div key={e.name} style={{ transform: `scale(${pop(t, 7.7 + i * 0.25)})` }}>
                  <Pill bg={i === 0 ? P.butter : '#fff'} size={46}>{e.name}</Pill>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 76, color: '#fff' }}>Not on a recipe yet</div>
            <div style={{ marginTop: 20, fontFamily: FONT.fun, fontWeight: 600, fontSize: 40, color: P.lilac }}>hold your next drop and it climbs</div>
          </>
        )}
        {!props.optedIn && (
          <div style={{ marginTop: 36, fontFamily: FONT.fun, fontWeight: 600, fontSize: 36, color: P.lilac, opacity: out(t, 8.3, 8.7) }}>preview · join to be eligible</div>
        )}
      </div>
      {t > 7.6 && [0, 1, 2, 3, 4].map((i) => <Sparkle key={i} x={170 + i * 185} y={470 + (i % 2) * 380} size={64} t={t} at={7.7 + i * 0.12} color={i % 2 ? P.butter : '#fff'} />)}

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 70, width: W, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Pill bg={P.butter} size={36}>
            <span style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 32 }}>graduation-scout.vercel.app</span>
          </Pill>
        </div>
        <div style={{ marginTop: 18, fontFamily: FONT.fun, fontWeight: 600, fontSize: 32, color: '#fff' }}>reply with your wallet to get yours</div>
        <div style={{ marginTop: 10, fontFamily: FONT.mono, fontSize: 22, color: '#ffffff88' }}>Graduation Scout × Chog · read {props.readAt}</div>
      </div>

      {props.music && (
        <Audio
          src={staticFile('chog-tune.wav')}
          startFrom={10 * 30}
          volume={(f) => 0.9 * interpolate(f / 30, [0, 0.3, 9.2, 10], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
    </AbsoluteFill>
  );
}
