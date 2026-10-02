import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Postgres drivers and the PGlite WASM build must load from node_modules at runtime.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Trace files from the whole monorepo, so workspace packages and PGlite's WASM ship with the server functions.
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  reactStrictMode: true,
};

export default config;
