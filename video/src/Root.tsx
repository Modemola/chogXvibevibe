import { Composition } from 'remotion';
import { Film, Teaser } from './Film';
import { FPS } from './theme';

export function Root() {
  return (
    <>
      <Composition id="Film" component={Film} durationInFrames={180 * FPS} fps={FPS} width={1920} height={1080} />
      <Composition id="Teaser" component={Teaser} durationInFrames={30 * FPS} fps={FPS} width={1080} height={1920} />
    </>
  );
}
