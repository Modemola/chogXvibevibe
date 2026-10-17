import { Blob, CHOGS, Coin, FONT, Orb, P, Pill, SceneFade, Sky, Sparkle, Sticker, Title, clamp, ease, lerp, out, pop, rng, squash, useT } from './kit';
import { CoinRain, HeroCard } from './three';

const rr = rng(77);
const CANDLES = Array.from({ length: 26 }, () => ({ x: 80 + rr() * 1760, d: rr() * 3.4, sp: 300 + rr() * 260, h: 70 + rr() * 110 }));

/** 0:58–1:16. A Chog holds through a red-candle storm; the score fills: +0.10, then 30 days, +0.05. */
export function Hold() {
  const t = useT();
  const hero = CHOGS[0]!;
  const storm = t > 2 && t < 6.4;
  const shake = storm ? Math.sin(t * 40) * 4 : 0;
  const s1 = out(t, 6.4, 7.4);
  const day = Math.min(30, Math.max(1, Math.floor(lin(t, 8, 11.6, 1, 30))));
  const s2 = out(t, 12.0, 13.0);
  const score = 0.42 + 0.1 * s1 + 0.05 * s2;
  const [cx, cy] = squash(t, 12, 0.25);
  return (
    <SceneFade t={t} dur={18}>
      <Sky t={t} glow={storm ? P.red : P.mint} />
      <div style={{ position: 'absolute', top: 50, width: '100%' }}>
        <Title text="Now… *hold.*" t={t} at={0.3} size={130} outAt={6.2} />
      </div>
      <div style={{ position: 'absolute', top: 50, width: '100%' }}>
        <Title text="Holding *raises your score.*" t={t} at={6.5} size={112} accent={P.mint} outAt={13.4} />
      </div>
      <div style={{ position: 'absolute', top: 50, width: '100%' }}>
        <Title text="Patience *pays.*" t={t} at={13.8} size={130} />
      </div>

      {/* Red-candle storm */}
      {CANDLES.map((c, i) => {
        const age = t - 1.8 - c.d;
        if (age < 0 || age > 3.4) return null;
        const y = -200 + age * c.sp * 1.4;
        return (
          <div key={i} style={{ position: 'absolute', left: c.x, top: y, opacity: 1 - clamp((age - 2.8) / 0.6) }}>
            <div style={{ position: 'absolute', left: 13, top: -30, width: 4, height: c.h + 60, background: P.red, borderRadius: 2 }} />
            <div style={{ width: 30, height: c.h, background: P.red, borderRadius: 6, boxShadow: '0 0 20px #ff5c7a88' }} />
          </div>
        );
      })}
      {storm && (
        <div style={{ position: 'absolute', left: 1180, top: 250, transform: `rotate(6deg) scale(${pop(t, 2.4)})` }}>
          <Pill bg={P.red} color="#fff" size={44}>DUMP IT!!</Pill>
        </div>
      )}

      {/* The hero Chog in 3D */}
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${shake}px, 0) scale(${cx}, ${cy})`, transformOrigin: '30% 70%' }}>
        <HeroCard c={hero} t={t} rotY={Math.sin(t * 0.9) * 0.45 + (t > 12 ? (1 - Math.exp(-(t - 12) * 2)) * Math.PI * 2 : 0)} scale={1.75} x={-1.55} y={-0.35} />
      </div>
      {t > 3 && t < 6.6 && (
        <div style={{ position: 'absolute', left: 560, top: 330, transform: `scale(${pop(t, 3.4)})`, transformOrigin: '0% 100%' }}>
          <div style={{ background: '#fff', borderRadius: 30, padding: '16px 30px', fontFamily: FONT.fun, fontWeight: 700, fontSize: 48, color: P.ink, boxShadow: `0 8px 0 ${P.night}` }}>nope.</div>
        </div>
      )}

      {/* Score meter */}
      <div style={{ position: 'absolute', left: 1040, top: 360, width: 760 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
          <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 150, color: '#fff', lineHeight: 1 }}>{score.toFixed(2)}</div>
          <div style={{ fontFamily: FONT.fun, fontWeight: 600, fontSize: 44, color: P.lilac }}>Scout score</div>
        </div>
        <div style={{ marginTop: 18, height: 44, borderRadius: 99, background: '#ffffff22', overflow: 'hidden', border: '3px solid #ffffff33' }}>
          <div style={{ width: `${score * 100 / 0.7}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${P.pink}, ${P.butter}, ${P.mint})` }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 30 }}>
          <div style={{ opacity: s1, transform: `translateX(${(1 - pop(t, 6.4)) * 120}px)` }}>
            <Pill bg={P.mint} size={40}>
              <b>+0.10</b> holds a Chog
            </Pill>
          </div>
          <div style={{ opacity: s2, transform: `translateX(${(1 - pop(t, 12)) * 120}px)` }}>
            <Pill bg={P.butter} size={40}>
              <b>+0.05</b> held 30+ days
            </Pill>
          </div>
        </div>
      </div>

      {/* Calendar */}
      {t > 7.6 && (
        <div style={{ position: 'absolute', left: 560, top: 640, transform: `scale(${pop(t, 7.6)}) rotate(-6deg)`, opacity: 1 - out(t, 13.4, 13.9) }}>
          <div style={{ width: 200, borderRadius: 26, overflow: 'hidden', boxShadow: `0 10px 0 ${P.night}`, background: '#fff' }}>
            <div style={{ background: P.red, color: '#fff', fontFamily: FONT.fun, fontWeight: 700, fontSize: 30, textAlign: 'center', padding: 8 }}>DAY</div>
            <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 104, color: P.ink, textAlign: 'center', lineHeight: 1.25 }}>{day}</div>
          </div>
        </div>
      )}
      {t > 12 && [0, 1, 2, 3, 4, 5].map((i) => <Sparkle key={i} x={300 + i * 90} y={250 + (i % 3) * 180} size={70} t={t} at={12.05 + i * 0.1} color={i % 2 ? P.butter : '#fff'} />)}
      <div style={{ position: 'absolute', right: 40, bottom: 30, fontFamily: FONT.mono, fontSize: 22, color: '#ffffff88' }}>illustration · real boosts</div>
    </SceneFade>
  );
}

/** 0:76–0:96 (1:16–1:36). Graduation day: the Chog Holders recipe fills three jars; the drop rains on Chogs; farms bounce off. */
export function Drop() {
  const t = useT();
  const jars = [
    { pct: 60, label: 'Chogs who don’t dump', color: P.pink, at: 3.0 },
    { pct: 25, label: 'Long-time Chogs (30+ days)', color: P.butter, at: 3.6 },
    { pct: 15, label: 'Proven holders', color: P.mint, at: 4.2 },
  ];
  const jarsOut = out(t, 9.6, 10.2);
  const row = pop(t, 10.4, { damping: 11 });
  return (
    <SceneFade t={t} dur={20}>
      <Sky t={t} glow={P.butter} warm={1} />
      <div style={{ position: 'absolute', top: 44, width: '100%' }}>
        <Title text="Graduation *day!*" t={t} at={0.2} size={140} outAt={9.4} />
      </div>
      <div style={{ position: 'absolute', top: 44, width: '100%' }}>
        <Title text="Chogs get *the drop.*" t={t} at={9.9} size={130} />
      </div>
      <CoinRain t={t} start={0.2} dur={2.4} density={1} />

      {/* The recipe */}
      <div style={{ position: 'absolute', top: 236, width: '100%', display: 'flex', justifyContent: 'center', opacity: out(t, 2.4, 2.9) * (1 - jarsOut) }}>
        <Pill bg="#fff" size={36}>The Chog Holders recipe</Pill>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 340, width: '100%', display: 'flex', justifyContent: 'center', gap: 90, opacity: 1 - jarsOut, transform: `translateY(${jarsOut * 80}px)` }}>
        {jars.map((j) => {
          const k = pop(t, j.at, { damping: 12 });
          const fill = ease(t, j.at + 0.4, j.at + 2.6);
          const h = 380;
          return (
            <div key={j.label} style={{ width: 360, transform: `scale(${k})`, textAlign: 'center' }}>
              <div style={{ position: 'relative', width: 260, height: h, margin: '0 auto', borderRadius: '40px 40px 70px 70px', border: '8px solid #ffffffcc', background: '#ffffff14', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${fill * j.pct * 1.45}%`, background: `linear-gradient(180deg, ${j.color}, ${j.color}aa)` }}>
                  {Array.from({ length: Math.round(j.pct / 6) }, (_, i) => (
                    <Coin key={i} size={40} spin={i} style={{ position: 'absolute', left: 20 + ((i * 53) % 190), bottom: 10 + Math.floor(i / 4) * 34 }} />
                  ))}
                </div>
                <div style={{ position: 'absolute', left: 30, top: 20, width: 26, height: h - 90, borderRadius: 99, background: '#ffffff33' }} />
              </div>
              <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 84, color: '#fff', marginTop: 10, lineHeight: 1 }}>{Math.round(fill * j.pct)}%</div>
              <div style={{ fontFamily: FONT.fun, fontWeight: 600, fontSize: 30, color: j.color }}>{j.label}</div>
            </div>
          );
        })}
      </div>

      {/* The Chogs collect; farms bounce off the shield */}
      {[0, 1, 2, 3, 4].map((i) => {
        const c = CHOGS[(i * 3 + 1) % CHOGS.length]!;
        const x = 150 + i * 230;
        const coinsIn = Math.min(6, Math.floor(Math.max(0, t - 11.2 - i * 0.15) * 3));
        const [sx, sy] = squash(t, 11.2 + i * 0.15 + 0.3, 0.12);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: 640 + (1 - row) * 500, transform: `scale(${sx}, ${sy})`, transformOrigin: '50% 100%' }}>
            <div style={{ position: 'absolute', left: 30, top: -40 - coinsIn * 16, display: 'flex', flexDirection: 'column-reverse' }}>
              {Array.from({ length: coinsIn }, (_, k) => (
                <Coin key={k} size={60} spin={0} style={{ marginTop: -44 }} />
              ))}
            </div>
            <Sticker c={c} size={190} label={false} tilt={(i % 2 ? 1 : -1) * 4} glow={coinsIn > 3 ? 0.8 : 0} />
          </div>
        );
      })}
      {/* Coins arcing into the Chogs */}
      {t > 10.8 && t < 14.5 &&
        Array.from({ length: 14 }, (_, i) => {
          const a = clamp((t - 10.8 - i * 0.18) / 0.8);
          if (a <= 0 || a >= 1) return null;
          const tx = 150 + (i % 5) * 230 + 70;
          return <Coin key={i} size={48} spin={a * 9} style={{ position: 'absolute', left: lerp(960, tx, a), top: lerp(-60, 600, a) - Math.sin(a * Math.PI) * 160 }} />;
        })}
      {/* Shield */}
      <div style={{ position: 'absolute', left: 1330, top: 560 + (1 - row) * 500, width: 520, height: 400 }}>
        <svg width={520} height={400} viewBox="0 0 520 400" style={{ position: 'absolute', inset: 0 }}>
          <path d="M20,390 A240,240 0 0 1 500,390" fill="#8fd3ff22" stroke={P.sky} strokeWidth={6} opacity={0.6 + 0.4 * Math.sin(t * 6)} />
        </svg>
        {[0, 1, 2].map((i) => {
          const ph = (t * 1.6 + i * 0.33) % 1;
          const bx = 430 + i * 30 - Math.sin(ph * Math.PI) * 120;
          return <Blob key={i} size={100} kind={i === 1 ? 'farm' : 'flipper'} t={t + i} flip style={{ position: 'absolute', left: bx, top: 280 - Math.sin(ph * Math.PI) * 90 }} />;
        })}
        <div style={{ position: 'absolute', left: 130, top: 170, transform: `scale(${pop(t, 13)})` }}>
          <div style={{ width: 150, height: 150, borderRadius: 999, background: P.red, color: '#fff', fontFamily: FONT.fun, fontWeight: 700, fontSize: 104, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 0 ${P.night}` }}>0</div>
        </div>
        <div style={{ position: 'absolute', left: 30, top: -40, opacity: out(t, 13.4, 13.9) }}>
          <Pill bg={P.red} color="#fff" size={30}>dumpers · ruggers · farms</Pill>
        </div>
      </div>
      <CoinRain t={t} start={15.6} dur={2.6} density={0.6} />
    </SceneFade>
  );
}

/** 1:36–1:50. Hold longer, earn more: two Chogs' piles grow side by side (simulated season). */
export function Earn() {
  const t = useT();
  const left = CHOGS[4]!;
  const right = CHOGS[7]!;
  const grow = ease(t, 2.2, 8.5);
  const cols = [
    { c: left, tag: 'held 30+ days', value: 5000, color: P.butter, x: 520 },
    { c: right, tag: 'new Chog', value: 3772, color: P.lilac, x: 1400 },
  ];
  return (
    <SceneFade t={t} dur={14}>
      <Sky t={t} glow={P.mint} />
      <div style={{ position: 'absolute', top: 44, width: '100%' }}>
        <Title text="Hold longer, *earn more.*" t={t} at={0.3} size={124} />
      </div>
      {cols.map((col, i) => {
        const v = Math.round(col.value * grow);
        const stack = Math.round((col.value / 5000) * 9 * grow);
        const k = pop(t, 0.8 + i * 0.3, { damping: 11 });
        return (
          <div key={i} style={{ position: 'absolute', left: col.x - 260, top: 250, width: 520, textAlign: 'center', transform: `scale(${k})` }}>
            <div style={{ position: 'relative', height: 360, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
              <div style={{ position: 'absolute', left: 30, bottom: 0, display: 'flex', flexDirection: 'column-reverse' }}>
                {Array.from({ length: stack }, (_, s) => (
                  <Coin key={s} size={110} spin={0} style={{ marginTop: -82 }} />
                ))}
              </div>
              <Sticker c={col.c} size={250} label={false} tilt={i ? 4 : -4} glow={i ? 0 : 0.5 * grow} style={{ marginLeft: 150 }} />
            </div>
            <div style={{ marginTop: 26 }}>
              <Pill bg={col.color} size={36}>{col.tag}</Pill>
            </div>
            <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 120, color: '#fff', marginTop: 10, lineHeight: 1 }}>{v.toLocaleString('en-US')}</div>
            <div style={{ fontFamily: FONT.fun, fontWeight: 500, fontSize: 30, color: P.lilac }}>tokens, on average</div>
          </div>
        );
      })}
      {t > 8.5 && [0, 1, 2, 3].map((i) => <Sparkle key={i} x={300 + i * 110} y={300 + (i % 2) * 120} size={70} t={t} at={8.6 + i * 0.12} color={P.butter} />)}
      <div style={{ position: 'absolute', bottom: 34, width: '100%', textAlign: 'center', fontFamily: FONT.mono, fontSize: 24, color: '#ffffffaa' }}>
        simulated season · 248 Chog holders · same Chog Holders recipe
      </div>
    </SceneFade>
  );
}

/** 1:50–2:00. A wall of Chogs, the orb winks, the end card. */
export function End() {
  const t = useT();
  return (
    <SceneFade t={t} dur={10} fadeOut={0.6}>
      <Sky t={t} glow={P.pink} warm={1} />
      {CHOGS.map((c, i) => {
        const at = 0.1 + i * 0.12;
        const k = pop(t, at, { damping: 10 });
        const x = 960 + ((i % 6) - 2.5) * 250;
        const y = 70 + Math.floor(i / 6) * 215;
        return (
          <div key={c.token} style={{ position: 'absolute', left: x - 85, top: y + (1 - k) * -500 + Math.sin(t * 3 + i) * 5 }}>
            <Sticker c={c} size={170} label={false} tilt={((i * 7) % 9) - 4} />
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 960 - 60, top: 545, transform: `scale(${pop(t, 1.6)})` }}>
        <Orb size={120} t={t} blink={3.0} look={0} />
      </div>
      <div style={{ position: 'absolute', top: 680, width: '100%' }}>
        <Title text="Hold your Chog. *Get the drop.*" t={t} at={2.0} size={104} />
      </div>
      <div style={{ position: 'absolute', top: 830, width: '100%', display: 'flex', justifyContent: 'center', gap: 22, opacity: out(t, 3.6, 4.2), transform: `translateY(${(1 - out(t, 3.6, 4.2)) * 30}px)` }}>
        <Pill bg="#fff" size={40}>Graduation Scout × Chog</Pill>
        <Pill bg={P.butter} size={40}>
          <span style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 34 }}>graduation-scout.vercel.app</span>
        </Pill>
      </div>
      <div style={{ position: 'absolute', top: 955, width: '100%', textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: 32, color: P.lilac, opacity: out(t, 4.6, 5.2) }}>
        built for the Chogathon · vibe/vibe × Chog
      </div>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <Sparkle key={i} x={200 + i * 250} y={600 + (i % 2) * 60} size={64} t={t} at={2.2 + i * 0.15} color={i % 2 ? P.butter : '#fff'} />)}
    </SceneFade>
  );
}

function lin(t: number, a: number, b: number, from: number, to: number) {
  return from + (to - from) * clamp((t - a) / (b - a));
}
