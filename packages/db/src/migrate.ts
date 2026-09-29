import type { Db } from './client.js';
import { MIGRATIONS } from './migrations/index.js';

/** Applies pending migrations in order, each in its own transaction. Returns ids applied. */
export async function migrate(db: Db): Promise<number[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         integer PRIMARY KEY,
      name       text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const done = new Set((await db.query<{ id: number }>('SELECT id FROM schema_migrations')).map((r) => Number(r.id)));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
    });
    applied.push(m.id);
  }
  return applied;
}
