import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * Runs the production build against a throwaway PGlite database seeded with
 * the simulated world. Build first: `pnpm deps && pnpm build`.
 */
const dataDir = path.join(os.tmpdir(), `scout-e2e-${process.pid}`);
const port = 3200;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `next start -p ${port}`,
    url: `http://localhost:${port}/api/stats`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { SCOUT_PGLITE_DIR: dataDir, SCOUT_SIMULATE: '1' },
  },
});
