import { AbsoluteFill } from 'remotion';
import { Blob, CHOGS, Coin, FONT, Orb, P, Pill, SceneFade, Sky, Sparkle, Sticker, Title, clamp, ease, lerp, lin, out, pop, rng, squash, useT } from './kit';
import { Carousel } from './three';

/** 0:00–0:10. Twelve Chog stickers drop into a grid, each with a pop. "gm, Chogs." */
export function Gm() {
  const t = useT();
  const cols = 6;
  const size = 196;
  return (
    <SceneFade t={t} dur={10} fadeIn={0.01}>
      <Sky t={t} />
      <div style={{ position: 'absolute', top: 70, width: '100%' }}>
        <Title text="gm, *Chogs.*" t={t} at={6.5} size={150} />
      </div>
      {CHOGS.map((c, i) => {
        const at = 0.4 + i * 0.5;
        const k = pop(t, at, { damping: 10, stiffness: 120 });
        const [sx, sy] = squash(t, at + 0.35, 0.18);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 960 + (col - (cols - 1) / 2) * 262;
        const y = 330 + row * 300 + (1 - k) * -900;
        const bob = Math.sin(t * 2.4 + i) * 6;
        return (
          <div key={c.token} style={{ position: 'absolute', left: x - size / 2, top: y + bob, transform: `scale(${sx}, ${sy})`, transformOrigin: '50% 100%', opacity: k > 0 ? 1 : 0 }}>
            <Sticker c={c} size={size} tilt={(i % 3) * 4 - 4} />
          </div>
        );
      })}
      {CHOGS.map((_, i) => (
        <Sparkle key={i} x={960 + ((i % cols) - 2.5) * 262 + 90} y={320 + Math.floor(i / cols) * 300} size={60} t={t} at={0.75 + i * 0.5} color={i % 2 ? P.butter : '#fff'} />
      ))}
      <div style={{ position: 'absolute', bottom: 64, width: '100%', display: 'flex', justifyContent: 'center', opacity: out(t, 8, 8.5), transform: `translateY(${(1 - out(t, 8, 8.5)) * 30}px)` }}>
        <Pill bg={P.pink} color={P.ink} size={38}>the cutest holders on Monad</Pill>
      </div>
    </SceneFade>
  );
}

/** 0:10–0:24. A 3D carousel of real Chog cards. */
export function Crew() {
  const t = useT();
  const spin = t * 0.42 + ease(t, 0, 1.6) * 1.2;
  return (
    <SceneFade t={t} dur={14}>
      <Sky t={t} glow={P.pink} />
      <Carousel t={t} spin={spin} lift={-0.25} />
      <div style={{ position: 'absolute', top: 54, width: '100%' }}>
        <Title text="Meet the *crew.*" t={t} at={0.3} size={130} outAt={6.6} />
      </div>
      <div style={{ position: 'absolute', top: 54, width: '100%' }}>
        <Title text="Diamond hands, *tiny paws.*" t={t} at={7.1} size={120} accent={P.mint} />
      </div>
      <div style={{ position: 'absolute', bottom: 60, width: '100%', display: 'flex', justifyContent: 'center', gap: 22, opacity: out(t, 2, 2.6) }}>
        <Pill bg="#fff" size={34}>1,969 Chog Genesis</Pill>
        <Pill bg={P.monad} color="#fff" size={34}>living on Monad</Pill>
      </div>
    </SceneFade>
  );
}

const rp = rng(31);
const RAIN = Array.from({ length: 46 }, () => ({ x: 120 + rp() * 1680, d: rp() * 3.2, sp: 700 + rp() * 500, s: 46 + rp() * 26, w: 3 + rp() * 5 }));

/** 0:24–0:42. A token graduates; the airdrop rains; flippers and farm clones grab it and run. */
export function Problem() {
  const t = useT();
  // Crowd: chogs at slots 1, 4, 7, 10; flippers at 0, 3, 6, 9; farm clones at 2, 5, 8, 11.
  const slots = Array.from({ length: 12 }, (_, i) => ({ i, x: 150 + i * 147, kind: i % 3 === 1 ? 'chog' : i % 3 === 0 ? 'flipper' : 'farm' }));
  const crowdIn = pop(t, 2.6, { damping: 12 });
  const baseY = 790;
  const capK = pop(t, 0.3, { damping: 8 });
  const capOut = out(t, 3.2, 3.8);
  return (
    <SceneFade t={t} dur={18}>
      <Sky t={t} glow={P.butter} />
      {/* The graduating token */}
      <div style={{ position: 'absolute', left: 960 - 130, top: 300 + (1 - capK) * -600 - capOut * 700, opacity: 1 - capOut }}>
        <Coin size={260} spin={t * 3} />
        <svg width={240} height={150} viewBox="0 0 240 150" style={{ position: 'absolute', left: 10, top: -96, transform: `rotate(${Math.sin(t * 6) * 6}deg)` }}>
          <polygon points="120,10 230,50 120,90 10,50" fill={P.ink} />
          <rect x="70" y="62" width="100" height="40" rx="10" fill={P.ink} />
          <path d="M210,50 L210,110" stroke={P.butter} strokeWidth="6" />
          <circle cx="210" cy="116" r="10" fill={P.butter} />
        </svg>
      </div>
      <div style={{ position: 'absolute', top: 60, width: '100%' }}>
        <Title text="A token *graduates!*" t={t} at={0.5} size={124} outAt={6.6} />
      </div>
      <div style={{ position: 'absolute', top: 60, width: '100%' }}>
        <Title text="Flippers grab it *and run.*" t={t} at={7.0} size={118} accent={P.red} outAt={14.4} />
      </div>
      <div style={{ position: 'absolute', top: 60, width: '100%' }}>
        <Title text="Airdrops reward *speed.*" t={t} at={14.8} size={124} accent={P.red} />
      </div>

      {/* Coin rain onto the crowd */}
      {RAIN.map((c, i) => {
        const age = t - 3.4 - c.d;
        if (age < 0) return null;
        const y = -80 + age * c.sp;
        const landed = y > baseY - 140;
        if (landed) return null;
        return <Coin key={i} size={c.s} spin={age * c.w} style={{ position: 'absolute', left: c.x, top: y }} />;
      })}

      {/* The crowd */}
      {slots.map((s) => {
        const y = baseY + (1 - crowdIn) * 400;
        if (s.kind === 'chog') {
          const c = CHOGS[(s.i * 5) % CHOGS.length]!;
          const sad = out(t, 11, 11.8);
          return (
            <div key={s.i} style={{ position: 'absolute', left: s.x - 70, top: y - 150 + sad * 14 }}>
              <Sticker c={c} size={140} label={false} tilt={sad * (s.i % 2 ? 7 : -7)} />
              {t > 11 && <Coin size={34} spin={0} style={{ position: 'absolute', left: 52, top: -40, opacity: out(t, 11.2, 11.6) }} />}
            </div>
          );
        }
        if (s.kind === 'flipper') {
          const run = Math.max(0, t - 7.4 - (s.i / 3) * 0.35);
          const dx = run * run * 700;
          return (
            <div key={s.i} style={{ position: 'absolute', left: s.x - 60 + dx, top: y - 120 + Math.abs(Math.sin(run * 14)) * -20 * clamp(run * 3) }}>
              <Blob size={120} kind="flipper" t={t} />
              <div style={{ position: 'absolute', left: 30, top: -46, display: 'flex' }}>
                {[0, 1, 2].map((k) => (
                  <Coin key={k} size={38} spin={0} style={{ marginLeft: k ? -18 : 0, opacity: t > 5 ? 1 : 0 }} />
                ))}
              </div>
              {run > 0.05 && (
                <div style={{ position: 'absolute', left: -20, top: -110 }}>
                  <Pill bg={P.red} color="#fff" size={24}>SOLD in 1h</Pill>
                </div>
              )}
            </div>
          );
        }
        // Farm clone: copy-pastes itself.
        const cl = pop(t, 8.6 + (s.i % 4) * 0.2, { damping: 12 });
        return (
          <div key={s.i} style={{ position: 'absolute', left: s.x - 55, top: y - 110 }}>
            {[-1, 1].map((d) => (
              <Blob key={d} size={110 * cl} kind="farm" t={t + d} style={{ position: 'absolute', left: d * 52 * cl + 55 - 55 * cl, top: -30 * cl + 55 - 55 * cl, opacity: 0.75 * cl }} />
            ))}
            <Blob size={110} kind="farm" t={t} style={{ position: 'absolute' }} />
            <div style={{ position: 'absolute', left: 30, top: -20, display: 'flex' }}>
              <Coin size={34} spin={0} style={{ opacity: t > 5 ? 1 : 0 }} />
              <Coin size={34} spin={0} style={{ marginLeft: -16, opacity: t > 5.4 ? 1 : 0 }} />
            </div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 1100, top: 300, opacity: out(t, 9.2, 9.8) * (1 - out(t, 14, 14.4)) }}>
        <Pill bg="#8c86a6" color="#fff" size={30}>copy-paste farm wallets</Pill>
      </div>

      {/* The stat */}
      <div style={{ position: 'absolute', left: 0, width: '100%', top: 300, display: 'flex', justifyContent: 'center', opacity: out(t, 11.6, 12.2) * (1 - out(t, 14.4, 14.8)), transform: `scale(${0.85 + 0.15 * pop(t, 11.6)})` }}>
        <div style={{ background: '#fff', borderRadius: 40, padding: '30px 54px', boxShadow: `0 14px 0 ${P.night}`, textAlign: 'center' }}>
          <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 96, color: P.red, lineHeight: 1 }}>70 of 100</div>
          <div style={{ fontFamily: FONT.fun, fontWeight: 600, fontSize: 40, color: P.ink, marginTop: 10 }}>early buyers sold within an hour</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 22, color: P.grey, marginTop: 10 }}>one real vibe/vibe launch</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 260, width: '100%', display: 'flex', justifyContent: 'center', opacity: out(t, 15.6, 16.1) }}>
        <Pill bg={P.lilac} size={40}>not loyalty.</Pill>
      </div>
    </SceneFade>
  );
}

/** 0:42–0:58. Scout rolls in, links Monad and vibe/vibe through one wallet, and stamps a Chog passport. */
export function Scout() {
  const t = useT();
  const hero = CHOGS[2]!;
  const roll = ease(t, 0, 2.2);
  const orbX = lerp(-200, 960, roll);
  const islands = pop(t, 3.0, { damping: 12 });
  const beam = out(t, 4.6, 5.6);
  const phase2 = out(t, 8.8, 9.4);
  const book = pop(t, 9.4, { damping: 11 });
  const stamp = t > 11.2 ? 1 : 0;
  const [sx, sy] = squash(t, 11.2, 0.3);
  const ride = clamp((t - 6) / 2);
  return (
    <SceneFade t={t} dur={16}>
      <Sky t={t} glow={P.sky} />
      <div style={{ position: 'absolute', top: 54, width: '100%' }}>
        <Title text="Enter *Graduation Scout.*" t={t} at={0.4} size={120} accent={P.lilac} outAt={3.3} />
      </div>
      <div style={{ position: 'absolute', top: 54, width: '100%' }}>
        <Title text="Same wallet, *two chains.*" t={t} at={3.6} size={120} accent={P.mint} outAt={8.8} />
      </div>
      <div style={{ position: 'absolute', top: 54, width: '100%' }}>
        <Title text="Your Chog is your *passport.*" t={t} at={9.2} size={116} />
      </div>

      {/* Islands */}
      <div style={{ opacity: 1 - phase2 }}>
        {[
          { x: 420, label: 'Monad', sub: 'your Chog lives here', color: P.monad },
          { x: 1500, label: 'vibe/vibe', sub: 'your trades live here', color: P.pink },
        ].map((isl, i) => (
          <div key={isl.label} style={{ position: 'absolute', left: isl.x - 230, top: 560 + (1 - islands) * 500 + Math.sin(t * 1.6 + i) * 10 }}>
            <svg width={460} height={200} viewBox="0 0 460 200">
              <ellipse cx="230" cy="40" rx="225" ry="38" fill={isl.color} />
              <path d="M10,40 Q60,190 230,196 Q400,190 450,40 Z" fill="#3b2a7a" />
              <ellipse cx="230" cy="34" rx="210" ry="26" fill="#ffffff22" />
            </svg>
            <div style={{ position: 'absolute', top: 110, width: 460, textAlign: 'center', fontFamily: FONT.fun, fontWeight: 700, fontSize: 46, color: '#fff' }}>{isl.label}</div>
            <div style={{ position: 'absolute', top: 166, width: 460, textAlign: 'center', fontFamily: FONT.fun, fontWeight: 500, fontSize: 26, color: P.lilac }}>{isl.sub}</div>
          </div>
        ))}
        {/* The Chog standing on Monad, then riding the beam */}
        <div style={{ position: 'absolute', left: lerp(420, 1500, ease(ride, 0, 1)) - 90, top: 400 - Math.sin(ride * Math.PI) * 120 + (1 - islands) * 500 }}>
          <Sticker c={hero} size={180} label={false} tilt={Math.sin(t * 3) * 4} />
        </div>
        {/* Beam with the shared address */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <path d={`M 640 590 Q 960 ${470} 1280 590`} stroke={P.butter} strokeWidth={8} fill="none" strokeDasharray="22 16" strokeDashoffset={-t * 120} opacity={beam} />
        </svg>
        <div style={{ position: 'absolute', left: 960 - 200, top: 440, width: 400, display: 'flex', justifyContent: 'center', opacity: beam, transform: `scale(${0.6 + 0.4 * pop(t, 4.8)})` }}>
          <Pill bg={P.butter} size={32}>
            <span style={{ fontFamily: FONT.mono, fontWeight: 600 }}>0xYOU…</span> same address
          </Pill>
        </div>
      </div>

      {/* The orb */}
      <div style={{ position: 'absolute', left: lerp(orbX, 1460, phase2) - 90, top: phase2 > 0 ? lerp(760, 560, phase2) + Math.sin(t * 2) * 8 : t < 3 ? 470 - Math.abs(Math.sin(t * 5)) * 60 * (1 - roll) : lerp(470, 760, out(t, 3, 4)) + Math.sin(t * 2) * 8, opacity: 1 - phase2 * 0.0 }}>
        <Orb size={180} t={t} look={Math.sin(t * 1.3)} blink={2.4} />
      </div>
      {t > 4 && t < 9 && <Sparkle x={960} y={480} size={80} t={t} at={4.9} color={P.butter} />}

      {/* Passport */}
      <div style={{ position: 'absolute', left: 960 - 330, top: 300, width: 660, height: 440, opacity: phase2, transform: `scale(${0.5 + 0.5 * book}) rotate(${(1 - book) * -10}deg)` }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 34, background: P.monad, boxShadow: `0 18px 0 ${P.night}` }} />
        <div style={{ position: 'absolute', left: 22, top: 22, right: 22, bottom: 22, borderRadius: 24, background: '#fff8ee', display: 'flex', gap: 32, padding: 30 }}>
          <Sticker c={hero} size={230} label={false} />
          <div style={{ flex: 1, fontFamily: FONT.fun, color: P.ink }}>
            <div style={{ fontWeight: 700, fontSize: 40, color: P.monad }}>CHOG PASSPORT</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 22, color: P.grey, marginTop: 14 }}>HOLDER</div>
            <div style={{ fontWeight: 600, fontSize: 34 }}>Chog #{hero.token}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 22, color: P.grey, marginTop: 14 }}>CHAINS</div>
            <div style={{ fontWeight: 600, fontSize: 28 }}>Monad + vibe/vibe</div>
          </div>
        </div>
        <div style={{ position: 'absolute', right: 40, bottom: 44, opacity: stamp, transform: `rotate(-14deg) scale(${sx * (1.6 - 0.6 * clamp((t - 11.2) * 6))}, ${sy * (1.6 - 0.6 * clamp((t - 11.2) * 6))})` }}>
          <div style={{ border: `8px solid ${P.red}`, borderRadius: 18, padding: '8px 22px', fontFamily: FONT.fun, fontWeight: 700, fontSize: 40, color: P.red, background: '#fff8eecc' }}>READ ON MONAD ✓</div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 70, width: '100%', display: 'flex', justifyContent: 'center', gap: 20, opacity: out(t, 12.2, 12.8) }}>
        <Pill bg="#fff" size={36}>nothing to bridge</Pill>
        <Pill bg={P.mint} size={36}>nothing to sign on Monad</Pill>
      </div>
      {t > 11 && [0, 1, 2, 3, 4].map((i) => <Sparkle key={i} x={1080 + i * 50} y={680 - (i % 2) * 60} size={50} t={t} at={11.25 + i * 0.08} color={i % 2 ? P.butter : P.pink} />)}
    </SceneFade>
  );
}

export { lin };
