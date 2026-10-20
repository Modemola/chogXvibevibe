import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion';
import { FONT, Orb, P, Pill, Sky, Title, out, pop, useAssets, useT } from './kit';
import { SAMPLE_CARD, ScoreCard, type ScoreCardProps } from './ScoreCard';

export type ScoreReelProps = { a: ScoreCardProps; b: ScoreCardProps };

const INTRO = 2.5;
const CLIP = 10;
const OUTRO = 3;
export const REEL_SECONDS = INTRO + 2 * CLIP + OUTRO;

function Intro() {
  const t = useT();
  return (
    <AbsoluteFill>
      <Sky t={t} glow={P.pink} warm={0.6} />
      <div style={{ position: 'absolute', left: 540 - 70, top: 330, transform: `scale(${pop(t, 0.1)})` }}>
        <Orb size={140} t={t} look={0.3} blink={1.4} />
      </div>
      <div style={{ position: 'absolute', top: 560, width: 1080, padding: '0 60px', boxSizing: 'border-box' }}>
        <Title text="What’s your *Scout score?*" t={t} at={0.3} size={112} />
      </div>
      <div style={{ position: 'absolute', top: 860, width: 1080, display: 'flex', justifyContent: 'center', opacity: out(t, 1.0, 1.4) }}>
        <Pill bg="#fff" size={40}>two real wallets, scored live</Pill>
      </div>
    </AbsoluteFill>
  );
}

function Outro() {
  const t = useT();
  return (
    <AbsoluteFill>
      <Sky t={t + 2} glow={P.butter} warm={1} />
      <div style={{ position: 'absolute', top: 360, width: 1080, padding: '0 60px', boxSizing: 'border-box' }}>
        <Title text="Reply with your wallet." t={t} at={0.15} size={104} />
      </div>
      <div style={{ position: 'absolute', top: 640, width: 1080, textAlign: 'center', fontFamily: FONT.fun, fontWeight: 600, fontSize: 48, color: P.lilac, opacity: out(t, 0.7, 1.1) }}>
        we’ll send you yours
      </div>
      <div style={{ position: 'absolute', top: 820, width: 1080, display: 'flex', justifyContent: 'center', transform: `scale(${pop(t, 1.1)})` }}>
        <Pill bg={P.butter} size={42}>
          <span style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 38 }}>graduation-scout.vercel.app</span>
        </Pill>
      </div>
      <div style={{ position: 'absolute', bottom: 80, width: 1080, textAlign: 'center', fontFamily: FONT.mono, fontSize: 24, color: '#ffffff88' }}>Graduation Scout × Chog</div>
    </AbsoluteFill>
  );
}

/** The kick off reel (1080×1350): a title, two wallets' score clips, and the call to reply. */
export function ScoreReel({ a, b }: ScoreReelProps) {
  useAssets();
  const F = 30;
  return (
    <AbsoluteFill style={{ background: P.night }}>
      <Sequence durationInFrames={INTRO * F}>
        <Intro />
      </Sequence>
      <Sequence from={INTRO * F} durationInFrames={CLIP * F}>
        <ScoreCard {...a} music={false} />
      </Sequence>
      <Sequence from={(INTRO + CLIP) * F} durationInFrames={CLIP * F}>
        <ScoreCard {...b} music={false} />
      </Sequence>
      <Sequence from={(INTRO + 2 * CLIP) * F} durationInFrames={OUTRO * F}>
        <Outro />
      </Sequence>
      <Audio
        src={staticFile('chog-tune.wav')}
        startFrom={8 * F}
        volume={(f) => 0.9 * interpolate(f / F, [0, 0.4, REEL_SECONDS - 1.2, REEL_SECONDS], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
}

export const SAMPLE_REEL: ScoreReelProps = { a: SAMPLE_CARD, b: { ...SAMPLE_CARD, chogCount: 0, chogs: [] } };
