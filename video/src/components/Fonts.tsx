import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

const FACES = [
  '400 64px "Instrument Serif"',
  'italic 400 64px "Instrument Serif"',
  '300 32px "Inter Tight Variable"',
  '500 32px "Inter Tight Variable"',
  '600 32px "Inter Tight Variable"',
  '400 32px "JetBrains Mono Variable"',
  '600 32px "JetBrains Mono Variable"',
];

/** Holds the render until every face the film uses has loaded, so no frame falls back. */
export function useFonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all(FACES.map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
}
