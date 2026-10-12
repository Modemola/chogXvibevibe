import { Composition } from 'remotion';
import { Film, FilmChog, Teaser } from './Film';
import { Logo } from './Logo';
import { FPS } from './theme';

export function Root() {
  return (
    <>
      <Composition id="Film" component={Film} durationInFrames={180 * FPS} fps={FPS} width={1920} height={1080} />
      <Composition id="FilmChog" component={FilmChog} durationInFrames={180 * FPS} fps={FPS} width={1920} height={1080} />
      <Composition id="Teaser" component={Teaser} durationInFrames={30 * FPS} fps={FPS} width={1920} height={1080} />
      <Composition id="TeaserVertical" component={Teaser} durationInFrames={30 * FPS} fps={FPS} width={1080} height={1920} />
      <Composition id="Logo" component={Logo} durationInFrames={1} fps={FPS} width={1024} height={1024} defaultProps={{ ring: true }} />
      <Composition id="LogoPlain" component={Logo} durationInFrames={1} fps={FPS} width={1024} height={1024} defaultProps={{ ring: false }} />
    </>
  );
}
