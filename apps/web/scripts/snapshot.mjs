// Builds the demo database once, at build time, so a fresh server restores it in about a second
// instead of migrating and seeding for several. Used when no DATABASE_URL is set on Vercel.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { migrate, pgliteSnapshot, runAftermath, writeBatch } from '@scout/db';
import { simulateWorld } from '@scout/sources';

const out = path.resolve(import.meta.dirname, '../.snapshot/demo.tar.gz');
const blob = await pgliteSnapshot(async (db) => {
  await migrate(db);
  const world = simulateWorld();
  await writeBatch(db, world.batch);
  await runAftermath(db, { now: world.asOf });
});
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
console.log(`[scout] demo snapshot ${(blob.size / 1e6).toFixed(1)} MB → ${path.relative(process.cwd(), out)}`);
process.exit(0);
