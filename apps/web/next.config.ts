import type { NextConfig } from 'next';

const config: NextConfig = {
  // Postgres drivers and the PGlite WASM build must load from node_modules at runtime.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  reactStrictMode: true,
};

export default config;
