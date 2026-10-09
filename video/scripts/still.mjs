// Renders stills: node scripts/still.mjs <composition> <out-dir> <sec> [sec…]
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const [comp, outDir, ...secs] = process.argv.slice(2);
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const chromiumOptions = { gl: 'swangle' };
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: comp, browserExecutable, chromiumOptions });
for (const sec of secs) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(sec) * composition.fps));
  const t0 = Date.now();
  await renderStill({ composition, serveUrl, output: path.join(outDir, `${comp}-${String(sec).replace('.', '_')}.png`), frame, browserExecutable, chromiumOptions });
  console.log(`${comp} @${sec}s in ${Date.now() - t0} ms`);
}
