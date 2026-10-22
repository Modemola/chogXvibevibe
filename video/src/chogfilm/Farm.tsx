import { AbsoluteFill, Audio, staticFile } from 'remotion';
import farm from '../data/farm.json';
import { Coin, FONT, Orb, P, Pill, Sky, Sparkle, Title, clamp, ease, lerp, out, pop, squash, useAssets, useT } from './kit';

const W = 1080;
const FARM = new Set(farm.farm);
const EVENTS = farm.events as { t: number; w: number[] }[];
const COLORS = ['#ffb3d9', '#b8a6ff', '#8fd3ff', '#7cf2c9', '#ffd94a', '#ffa98f', '#c8b8ff', '#a6f0ff', '#ffc2e6', '#d4ff8f', '#ffcf7a', '#9fb4ff'];

/** Grid position of wallet n (1 to 12): four columns, three rows. */
function slot(n: number) {
  const i = n - 1;
  return { x: 150 + (i % 4) * 260, y: 470 + Math.floor(i / 4) * 265 };
}

/** The last buy by wallet n at or before time t, in seconds since it happened (or Infinity). */
function sinceBuy(n: number, t: number, timeScale = 1, offset = 0) {
  let best = Infinity;
  for (const e of EVENTS) {
    const at = offset + (e.t - 2.4) / timeScale + 2.4;
    if (at <= t && e.w.includes(n)) best = Math.min(best, t - at);
  }
  return best;
}

/** A round, cute wallet with a number badge. */
function Wallet({ n, t, frozen, ring = 0, dim = 0, badge }: { n: number; t: number; frozen?: boolean; ring?: number; dim?: number; badge?: string }) {
  const tt = frozen ? 0 : t;
  const wob = Math.sin(tt * 6 + n) * 0.03;
  const size = 150;
  return (
    <div style={{ position: 'relative', width: size, height: size, opacity: 1 - dim * 0.6 }}>
      {ring > 0 && <div style={{ position: 'absolute', inset: -16, borderRadius: 999, border: `8px solid ${P.red}`, opacity: ring, boxShadow: `0 0 40px ${P.red}` }} />}
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `scale(${1 + wob}, ${1 - wob})` }}>
        <path d="M14,92 C4,92 6,60 12,44 C20,16 40,8 52,8 C70,8 88,22 90,48 C92,66 96,92 84,92 C76,92 74,84 66,84 C58,84 56,92 48,92 C40,92 38,84 30,84 C22,84 22,92 14,92Z" fill={COLORS[n - 1]} />
        <ellipse cx="38" cy="46" rx="6" ry="7" fill={P.ink} />
        <ellipse cx="64" cy="46" rx="6" ry="7" fill={P.ink} />
        <circle cx="40" cy="43" r="2" fill="#fff" />
        <circle cx="66" cy="43" r="2" fill="#fff" />
        <ellipse cx="28" cy="58" rx="6" ry="3" fill="#ff5c9a" opacity="0.45" />
        <ellipse cx="74" cy="58" rx="6" ry="3" fill="#ff5c9a" opacity="0.45" />
        <path d="M44,60 Q51,66 58,60" stroke={P.ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', left: -8, top: -8, width: 54, height: 54, borderRadius: 999, background: '#fff', color: P.ink, fontFamily: FONT.fun, fontWeight: 700, fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 5px 0 ${P.night}` }}>{badge ?? n}</div>
    </div>
  );
}

/** The grid of twelve wallets buying on the timeline (optionally replayed faster). */
function Grid({ t, timeScale = 1, offset = 0, frozenAt, ringFarm = 0, dimOthers = 0, links = 0 }: { t: number; timeScale?: number; offset?: number; frozenAt?: number; ringFarm?: number; dimOthers?: number; links?: number }) {
  const tt = frozenAt !== undefined ? Math.min(t, frozenAt) : t;
  const farmPts = [...FARM].map((n) => slot(n));
  return (
    <>
      {links > 0 && (
        <svg width={W} height={1350} style={{ position: 'absolute', inset: 0 }}>
          {farmPts.map((a, i) => {
            const b = farmPts[(i + 1) % farmPts.length]!;
            return <line key={i} x1={a.x} y1={a.y} x2={lerp(a.x, b.x, links)} y2={lerp(a.y, b.y, links)} stroke={P.red} strokeWidth={10} strokeLinecap="round" strokeDasharray="4 18" />;
          })}
        </svg>
      )}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const { x, y } = slot(n);
        const k = pop(t, 0.25 + i * 0.07, { damping: 11 });
        const since = sinceBuy(n, tt, timeScale, offset);
        const [sx, sy] = since < 1 ? squash(0, -since, 0.2) : [1, 1];
        const hop = since < 0.35 ? Math.sin((since / 0.35) * Math.PI) * 26 : 0;
        const isFarm = FARM.has(n);
        return (
          <div key={n} style={{ position: 'absolute', left: x - 75, top: y - 75 - hop, transform: `scale(${k * sx}, ${k * sy})`, transformOrigin: '50% 100%' }}>
            <Wallet n={n} t={tt} frozen={frozenAt !== undefined && t >= frozenAt} ring={isFarm ? ringFarm : 0} dim={isFarm ? 0 : dimOthers} />
            {since < 0.7 && <Coin size={46} spin={since * 12} style={{ position: 'absolute', left: 52, top: -30 - since * 90, opacity: 1 - since / 0.7 }} />}
          </div>
        );
      })}
    </>
  );
}

/** 15 s puzzle (1080×1350): three of twelve wallets are one person. */
export function FarmPuzzle() {
  useAssets();
  const t = useT();
  const freeze = 10.8;
  const ask = out(t, freeze + 0.1, freeze + 0.5);
  const countdown = Math.max(1, 3 - Math.floor(Math.max(0, t - 11.8)));
  return (
    <AbsoluteFill style={{ opacity: Math.min(clamp(t / 0.15), 1 - out(t, 14.7, 15)) }}>
      <Sky t={t < freeze ? t : freeze} glow={P.pink} warm={0.6} />
      <div style={{ position: 'absolute', top: 60, width: W }}>
        <Title text="Spot the *farm.*" t={t} at={0.1} size={120} />
      </div>
      <div style={{ position: 'absolute', top: 210, width: W, textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: 42, color: P.lilac, opacity: out(t, 0.8, 1.2) * (1 - ask) }}>
        3 of these 12 wallets are one person.
        <br />
        Watch them buy.
      </div>
      <Grid t={t} frozenAt={freeze} dimOthers={0} />
      <div style={{ position: 'absolute', top: 1110, width: W, textAlign: 'center', opacity: ask, transform: `scale(${0.8 + 0.2 * pop(t, freeze + 0.1)})` }}>
        <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 64, color: '#fff', textShadow: `0 6px 0 ${P.night}` }}>Which 3 are one person?</div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Pill bg={P.butter} size={36}>reply with 3 numbers</Pill>
          {t > 11.8 && <Pill bg="#fff" size={36}>{countdown}</Pill>}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1290, width: W, textAlign: 'center', fontFamily: FONT.mono, fontSize: 22, color: '#ffffff88', opacity: ask }}>answer tomorrow · Graduation Scout × Chog</div>
      <Audio src={staticFile('farm-puzzle.wav')} />
    </AbsoluteFill>
  );
}

/** 16 s reveal (1080×1350): the fast replay, the links, the merge into one person. */
export function FarmReveal() {
  useAssets();
  const t = useT();
  const replayStart = 1.8; // the puzzle's events, twice as fast, starting here
  const links = ease(t, 6.2, 7.0);
  const ring = out(t, 6.0, 6.6);
  const merge = ease(t, 10.0, 11.4);
  const farmPts = [...FARM].map((n) => slot(n));
  const centre = { x: W / 2, y: 720 };
  return (
    <AbsoluteFill style={{ opacity: Math.min(clamp(t / 0.15), 1 - out(t, 15.7, 16)) }}>
      <Sky t={t} glow={P.red} warm={0.5} />
      <div style={{ position: 'absolute', top: 60, width: W }}>
        <Title text="The *answer.*" t={t} at={0.1} size={120} outAt={9.6} />
      </div>
      <div style={{ position: 'absolute', top: 60, width: W }}>
        <Title text="One person. *One share.*" t={t} at={10.0} size={100} accent={P.mint} />
      </div>
      <div style={{ position: 'absolute', left: W / 2 - 55, top: 205, opacity: out(t, 0.6, 1.0) * (1 - out(t, 9.6, 10)) }}>
        <Orb size={110} t={t} look={Math.sin(t * 2.2)} blink={4.8} />
      </div>
      {/* The grid fades out as the farm merges */}
      <div style={{ opacity: 1 - merge }}>
        <Grid t={t} timeScale={2} offset={replayStart - 2.4} ringFarm={ring} dimOthers={ring} links={links} />
      </div>
      {/* Labels */}
      <div style={{ position: 'absolute', top: 1170, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: out(t, 7.0, 7.4) * (1 - merge) }}>
        <Pill bg={P.red} color="#fff" size={36}>#4, #9, #11 bought in the same second, 6 times</Pill>
        <div style={{ opacity: out(t, 7.8, 8.2) }}>
          <Pill bg="#fff" size={34}>Scout links them into one cluster</Pill>
        </div>
      </div>
      {/* The merge */}
      {merge > 0 &&
        farmPts.map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: lerp(p.x, centre.x, merge) - 75, top: lerp(p.y, centre.y, merge) - 75, opacity: 1 - clamp((merge - 0.85) / 0.15) }}>
            <Wallet n={[...FARM][i]!} t={t} ring={1} />
          </div>
        ))}
      {merge >= 0.85 && (
        <div style={{ position: 'absolute', left: centre.x - 150, top: centre.y - 170, transform: `scale(${pop(t, 11.2, { damping: 8 })})` }}>
          <div style={{ transform: 'scale(2)', transformOrigin: '50% 50%', marginLeft: 75, marginTop: 75 }}>
            <Wallet n={4} t={t} badge="×3" />
          </div>
        </div>
      )}
      {merge >= 0.85 && (
        <div style={{ position: 'absolute', top: 920, width: W, textAlign: 'center', transform: `scale(${pop(t, 11.5)})` }}>
          <Pill bg={P.butter} size={46}>1 person</Pill>
        </div>
      )}
      <div style={{ position: 'absolute', top: 1050, width: W, textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: 42, color: P.lilac, opacity: out(t, 12.0, 12.4) }}>
        Scout pays a farm one share, or none.
      </div>
      <div style={{ position: 'absolute', top: 1150, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: out(t, 13.0, 13.4) }}>
        <div style={{ fontFamily: FONT.fun, fontWeight: 700, fontSize: 46, color: '#fff' }}>Did you get it?</div>
        <Pill bg={P.butter} size={34}>
          <span style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 30 }}>graduation-scout.vercel.app</span>
        </Pill>
      </div>
      {t > 11.2 && [0, 1, 2, 3].map((i) => <Sparkle key={i} x={300 + i * 160} y={560 + (i % 2) * 260} size={60} t={t} at={11.3 + i * 0.1} color={i % 2 ? P.butter : '#fff'} />)}
      <Audio src={staticFile('farm-reveal.wav')} />
    </AbsoluteFill>
  );
}
