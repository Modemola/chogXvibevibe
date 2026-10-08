import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Grain } from './components/Backdrop';
import { useFonts } from './components/Fonts';
import { Headline, Kicker } from './components/Type';
import { Aftermath } from './scenes/Aftermath';
import { Builder } from './scenes/Builder';
import { Close } from './scenes/Close';
import { Idea } from './scenes/Idea';
import { OnChain } from './scenes/OnChain';
import { Open } from './scenes/Open';
import { Problem } from './scenes/Problem';
import { Score } from './scenes/Score';
import { Sybil } from './scenes/Sybil';
import { C, F, ramp, s, softInOut } from './theme';

const SCENES: { from: number; to: number; C: () => React.ReactNode }[] = [
  { from: 0, to: 15, C: Open },
  { from: 15, to: 40, C: Problem },
  { from: 40, to: 65, C: Idea },
  { from: 65, to: 95, C: Score },
  { from: 95, to: 115, C: Sybil },
  { from: 115, to: 135, C: Builder },
  { from: 135, to: 155, C: OnChain },
  { from: 155, to: 170, C: Aftermath },
  { from: 170, to: 180, C: Close },
];

function Scenes() {
  useFonts();
  return (
    <>
      {SCENES.map(({ from, to, C: Scene }) => (
        <Sequence key={from} from={s(from)} durationInFrames={s(to - from)}>
          <Scene />
        </Sequence>
      ))}
      <Grain />
    </>
  );
}

/** The 3:00 film, 1920×1080 at 60 fps. */
export function Film() {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Scenes />
      <Audio src={staticFile('score.wav')} volume={0.8} />
    </AbsoluteFill>
  );
}

/** The first 30 seconds as a teaser, ending on a title card. Rendered 16:9 (Teaser) or 9:16 (TeaserVertical). */
export function Teaser() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 60;
  const u = height > width ? width / 1080 : height / 1080;
  const end = ramp(t, 27.4, 28.3, softInOut);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Scenes />
      <AbsoluteFill style={{ background: C.bg, opacity: end, justifyContent: 'center', alignItems: 'center', gap: 34 * u }}>
        <Headline text="Graduation *Scout*" t={t} at={27.7} size={150 * u} align="center" stagger={0.12} />
        <div style={{ opacity: ramp(t, 28.3, 29), fontFamily: F.sans, fontWeight: 300, fontSize: 44 * u, color: C.body, textAlign: 'center', padding: `0 ${80 * u}px` }}>
          Airdrops for the ones who stay.
        </div>
        <div style={{ opacity: ramp(t, 28.5, 29.1) }}>
          <Kicker size={34 * u} color={C.ink} style={{ letterSpacing: '0.06em', textTransform: 'none' }}>
            vibevibe-gules.vercel.app
          </Kicker>
        </div>
      </AbsoluteFill>
      <Audio src={staticFile('score.wav')} volume={(f) => 0.8 * interpolate(f / 60, [28.9, 30], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  );
}
