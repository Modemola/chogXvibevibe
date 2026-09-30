import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  // Ganache runs in-process on its pure-JS fallback here; give chain tests room.
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
});
