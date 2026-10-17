import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Glass, Headline, Kicker, Line } from '../components/Type';
import chogs from '../data/chog.json';
import { C, F, clamp, expoOut, lerp, ramp, softInOut, softOut, vis } from '../theme';

/** Chog Genesis art, read from the NFT's tokenURI on Monad (see scripts/chog-art.mjs). */
const CARDS = (chogs as { token: number; file: string }[]).slice(0, 5);

const RECIPE = [
  { pct: 60, label: 'Chogs who don’t dump', at: 13.4 },
  { pct: 25, label: 'Extra for 30+ day Chogs', at: 14.0 },
  { pct: 15, label: 'Proven holders', at: 14.6 },
];

function ChogCard({ c, size, u, glow = 0 }: { c: { token: number; file: string }; size: number; u: number; glow?: number }) {
  return (
    <div
      style={{
        width: size,
        padding: 14 * u,
        borderRadius: 26 * u,
        border: `1px solid ${C.stroke}`,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015) 45%), rgba(10,12,15,0.92)',
        boxShadow: `0 40px 80px -40px rgba(0,0,0,0.95), 0 0 ${60 * u * glow}px rgba(220,226,232,${0.18 * glow})`,
      }}
    >
      <Img src={staticFile(c.file)} style={{ width: size - 28 * u, height: size - 28 * u, borderRadius: 16 * u, display: 'block', objectFit: 'cover' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 * u, fontFamily: F.mono, fontSize: 19 * u, letterSpacing: '0.12em', color: C.body }}>
        <span>CHOG GENESIS</span>
        <span style={{ color: C.ink }}>#{c.token}</span>
      </div>
    </div>
  );
}

/** 1:35–1:55 (Chog edition). Real Chog Genesis cards; the same wallet on Monad and vibe/vibe; the boost; the recipe. */
export function Chog() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = Math.min(width / 1920, height / 1080);

  // Phase A: a fan of Chogs rises in. Phase B: one Chog stays as the passport. Phase C: the recipe.
  const gather = ramp(t, 6.2, 7.8, softInOut);
  const phaseC = ramp(t, 12.2, 13.2, softInOut);
  const exit = 1 - ramp(t, 19, 19.95, softInOut);
  const n = CARDS.length;
  const hero = Math.floor(n / 2);
  const card = 300 * u;

  // Phase B: the read travels from Monad to Scout.
  const link = ramp(t, 8.2, 9.4, expoOut) * (1 - phaseC);
  const boost1 = ramp(t, 9.8, 10.6, expoOut);
  const boost2 = ramp(t, 10.6, 11.4, expoOut);
  const score = lerp(0.42, 0.57, ramp(t, 9.8, 11.6, softOut));
  const leftX = width * 0.2;
  const rightX = width * 0.56;
  const midY = height * 0.56;

  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ opacity: exit }}>
        <div style={{ position: 'absolute', left: 160 * u, top: 64 * u, opacity: ramp(t, 0.2, 1.2) }}>
          <Kicker size={28 * u} color={C.ink}>vibe/vibe × Chog</Kicker>
        </div>

        {/* Phase A headline */}
        <div style={{ position: 'absolute', left: 160 * u, top: 118 * u, width: 1500 * u }}>
          <Headline text="Your Chog is your *passport.*" t={t} at={1.0} out={6.4} size={96 * u} />
        </div>
        <div style={{ position: 'absolute', left: 160 * u, top: 250 * u, opacity: 1 - ramp(t, 5.8, 6.4) }}>
          <Line t={t} at={2.4} size={36 * u}>
            Same wallet on Monad and vibe/vibe. Nothing to bridge, nothing to sign.
          </Line>
        </div>

        {/* Phase B headline */}
        <div style={{ position: 'absolute', left: 160 * u, top: 118 * u, width: 1500 * u }}>
          <Headline text="Chogs *score higher.*" t={t} at={7.0} out={12.2} size={96 * u} />
        </div>

        {/* The cards */}
        {CARDS.map((c, i) => {
          const k = ramp(t, 0.5 + i * 0.22, 2.1 + i * 0.22, expoOut);
          const off = i - (n - 1) / 2;
          const fanX = width / 2 + off * 330 * u;
          const fanY = height * 0.66 + Math.abs(off) * 26 * u;
          const isHero = i === hero;
          const x = isHero ? lerp(fanX, leftX, gather) : fanX;
          const y = isHero ? lerp(fanY, midY, gather) : fanY;
          const rot = lerp(off * 5, 0, isHero ? gather : 0);
          const op = k * (isHero ? 1 - phaseC : 1 - ramp(t, 6.0, 7.0, softInOut));
          const scale = isHero ? lerp(1, 1.12, gather) : 1;
          const bob = Math.sin(t * 1.2 + i) * 6 * u;
          if (op <= 0) return null;
          return (
            <div
              key={c.token}
              style={{
                position: 'absolute',
                left: x - card / 2,
                top: y - card / 2 + (1 - k) * 240 * u + bob,
                opacity: op,
                transform: `perspective(${1400 * u}px) rotateZ(${rot}deg) rotateY(${(1 - k) * off * -24}deg) scale(${scale})`,
              }}
            >
              <ChogCard c={c} size={card} u={u} glow={isHero ? gather : 0} />
            </div>
          );
        })}

        {/* Phase B: Monad → Scout */}
        <div style={{ position: 'absolute', left: leftX - card / 2, top: midY + 236 * u, width: card, textAlign: 'center', opacity: gather * (1 - phaseC) }}>
          <Kicker size={22 * u} style={{ justifyContent: 'center' }}>Monad mainnet</Kicker>
        </div>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: link }}>
          <line x1={leftX + card * 0.62} y1={midY} x2={rightX - 30 * u} y2={midY} stroke={C.steel} strokeWidth={1.4} strokeDasharray={`${4 * u} ${9 * u}`} />
          {[0, 1, 2].map((k) => {
            const p = ((t * 0.55 + k / 3) % 1) * link;
            return <circle key={k} cx={lerp(leftX + card * 0.62, rightX - 30 * u, p)} cy={midY} r={5 * u} fill={C.ink} opacity={Math.sin(p * Math.PI)} />;
          })}
        </svg>
        <div style={{ position: 'absolute', left: lerp(leftX + card * 0.62, rightX, 0.5) - 210 * u, top: midY - 54 * u, width: 420 * u, textAlign: 'center', opacity: link, fontFamily: F.mono, fontSize: 21 * u, letterSpacing: '0.08em', color: C.steel }}>
          balanceOf(same address)
        </div>
        <div style={{ position: 'absolute', left: rightX, top: midY - 190 * u, width: 640 * u, opacity: ramp(t, 8.6, 9.6) * (1 - phaseC), transform: `translateY(${(1 - ramp(t, 8.6, 9.6)) * 24 * u}px)` }}>
          <Glass style={{ padding: `${30 * u}px ${36 * u}px` }}>
            <Kicker size={22 * u}>Scout profile · vibe/vibe</Kicker>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 * u, margin: `${18 * u}px 0 ${12 * u}px` }}>
              <span style={{ fontFamily: F.serif, fontSize: 104 * u, lineHeight: 1, color: C.ink }}>{score.toFixed(2)}</span>
              <span style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 28 * u, color: C.body }}>score</span>
            </div>
            {[
              { k: boost1, v: '+0.10', l: 'Holds a Chog Genesis' },
              { k: boost2, v: '+0.05', l: 'Held a Chog 30+ days' },
            ].map((r) => (
              <div key={r.l} style={{ display: 'flex', gap: 22 * u, alignItems: 'baseline', padding: `${12 * u}px 0`, borderTop: `1px solid ${C.hair}`, opacity: r.k, transform: `translateX(${(1 - r.k) * 30 * u}px)` }}>
                <span style={{ fontFamily: F.mono, fontSize: 30 * u, color: C.good, minWidth: 100 * u }}>{r.v}</span>
                <span style={{ fontFamily: F.sans, fontWeight: 400, fontSize: 30 * u, color: C.ink }}>{r.l}</span>
              </div>
            ))}
          </Glass>
        </div>

        {/* Phase C: the recipe */}
        <div style={{ position: 'absolute', left: 160 * u, top: 118 * u, width: 1500 * u }}>
          <Headline text="Creators pay *Chogs first.*" t={t} at={12.6} out={19.2} size={96 * u} />
        </div>
        <div style={{ position: 'absolute', left: 160 * u, top: 270 * u, opacity: phaseC }}>
          <Kicker size={26 * u}>The Chog Holders recipe</Kicker>
        </div>
        <div style={{ position: 'absolute', left: 160 * u, top: 340 * u, width: 1600 * u, display: 'flex', flexDirection: 'column', gap: 26 * u }}>
          {RECIPE.map((r) => {
            const k = ramp(t, r.at, r.at + 1.4, expoOut);
            return (
              <div key={r.label} style={{ opacity: clamp(k * 3) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 * u }}>
                  <span style={{ fontFamily: F.sans, fontSize: 36 * u, color: C.ink }}>{r.label}</span>
                  <span style={{ fontFamily: F.serif, fontSize: 64 * u, lineHeight: 1, color: C.ink }}>{Math.round(r.pct * k)}%</span>
                </div>
                <div style={{ height: 14 * u, borderRadius: 99, background: C.hair, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct * k}%`, height: '100%', borderRadius: 99, background: C.chromeX }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 160 * u, top: 790 * u, display: 'flex', gap: 28 * u, opacity: ramp(t, 16.0, 17.0), transform: `translateY(${(1 - ramp(t, 16.0, 17.0)) * 24 * u}px)` }}>
          <Glass style={{ padding: `${24 * u}px ${34 * u}px`, display: 'flex', alignItems: 'baseline', gap: 24 * u }}>
            <span style={{ fontFamily: F.serif, fontSize: 88 * u, lineHeight: 1, color: C.bad }}>0</span>
            <span style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 32 * u, color: C.body, maxWidth: 560 * u, lineHeight: 1.3 }}>for Chogs who dump, rug or farm</span>
          </Glass>
          <div style={{ display: 'flex', gap: 14 * u, alignItems: 'center', opacity: vis(t, 16.6, 20, 0.8) }}>
            {CARDS.slice(0, 3).map((c, i) => (
              <Img key={c.token} src={staticFile(c.file)} style={{ width: 112 * u, height: 112 * u, borderRadius: 18 * u, border: `1px solid ${C.stroke}`, opacity: ramp(t, 16.8 + i * 0.15, 17.6 + i * 0.15) }} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
