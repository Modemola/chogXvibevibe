// Renders the $SCOUT token logo: node scripts/logo.mjs <out-dir>
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
const out = process.argv[2] ?? 'out/logo';
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const chromiumOptions = { gl: 'swangle' };
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
for (const [id, name] of [['Logo', 'scout-logo'], ['LogoPlain', 'scout-logo-plain']]) {
  const composition = await selectComposition({ serveUrl, id, browserExecutable, chromiumOptions });
  for (const [scale, suffix] of [[1, '1024'], [0.5, '512']]) {
    await renderStill({ composition, serveUrl, scale, output: path.join(out, `${name}-${suffix}.png`), browserExecutable, chromiumOptions });
  }
}
console.log(`logos → ${out}`);
