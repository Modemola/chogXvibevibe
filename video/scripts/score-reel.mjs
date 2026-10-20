// Renders the kick off reel from two saved score cards (out/cards/score-*.json, written by score-card.mjs).
// Usage: node scripts/score-reel.mjs <first.json> <second.json> [out.mp4]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const [fa, fb, out = 'out/cards/score-reel.mp4'] = process.argv.slice(2);
const props = { a: JSON.parse(readFileSync(fa, 'utf8')), b: JSON.parse(readFileSync(fb, 'utf8')) };
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const chromiumOptions = { gl: 'swangle' };
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'ScoreReel', inputProps: props, browserExecutable, chromiumOptions });
await renderMedia({ composition, serveUrl, inputProps: props, codec: 'h264', crf: 20, pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '192k', outputLocation: out, browserExecutable, chromiumOptions, concurrency: 4 });
console.log(`→ ${out}`);
