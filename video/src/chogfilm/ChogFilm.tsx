import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Crew, Gm, Problem, Scout } from './act1';
import { Drop, Earn, End, Hold } from './act2';
import { FPS, P, useAssets } from './kit';

/** Scene boundaries in seconds, on the soundtrack's downbeats (120 BPM, one bar = 2 s). */
export const CHOG_SCENES: { from: number; to: number; C: () => React.ReactNode }[] = [
  { from: 0, to: 10, C: Gm },
  { from: 10, to: 24, C: Crew },
  { from: 24, to: 42, C: Problem },
  { from: 42, to: 58, C: Scout },
  { from: 58, to: 76, C: Hold },
  { from: 76, to: 96, C: Drop },
  { from: 96, to: 110, C: Earn },
  { from: 110, to: 120, C: End },
];

/** "Hold Your Chog": the 2:00 Chog film (1920×1080, 30 fps). See CHOG_FILM.md. */
export function ChogFilm({ music = true }: { music?: boolean }) {
  useAssets();
  return (
    <AbsoluteFill style={{ background: P.night }}>
      {CHOG_SCENES.map(({ from, to, C }) => (
        <Sequence key={from} from={from * FPS} durationInFrames={(to - from) * FPS}>
          <C />
        </Sequence>
      ))}
      {music && <Audio src={staticFile('chog-tune.wav')} volume={0.9} />}
    </AbsoluteFill>
  );
}
