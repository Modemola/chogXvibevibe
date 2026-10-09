// Renders a composition to MP4: node scripts/render.mjs <Film|Teaser> <out.mp4> [concurrency] [fromFrame toFrame]
// With a frame range the output is video only, for splicing a re-rendered segment into a finished film.
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const [id = 'Film', out = `out/${id}.mp4`, conc = '4', from, to] = process.argv.slice(2);
const frameRange = from !== undefined ? [Number(from), Number(to)] : undefined;
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const chromiumOptions = { gl: 'swangle' };
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id, browserExecutable, chromiumOptions });
const t0 = Date.now();
let last = 0;
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  crf: 14,
  x264Preset: 'slow',
  pixelFormat: 'yuv420p',
  audioCodec: 'aac',
  audioBitrate: '320k',
  outputLocation: out,
  browserExecutable,
  chromiumOptions,
  concurrency: Number(conc),
  frameRange,
  muted: Boolean(frameRange),
  timeoutInMilliseconds: 120_000,
  onProgress: ({ renderedFrames, encodedFrames, progress }) => {
    const now = Date.now();
    if (now - last > 30_000 || progress === 1) {
      last = now;
      const el = (now - t0) / 1000;
      console.log(`${id}: ${renderedFrames}/${composition.durationInFrames} rendered, ${encodedFrames} encoded, ${(progress * 100).toFixed(1)}% after ${Math.round(el)}s`);
    }
  },
});
console.log(`${id}: done in ${Math.round((Date.now() - t0) / 1000)}s → ${out}`);
