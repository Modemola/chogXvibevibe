import { describe, expect, it } from 'vitest';
import { createPgliteDb, migrate, pgliteSnapshot } from '../src/index.js';

describe('pgliteSnapshot', () => {
  it('restores the schema and rows it was built with', async () => {
    const blob = await pgliteSnapshot(async (db) => {
      await migrate(db);
      await db.exec("CREATE TABLE probe (v text); INSERT INTO probe VALUES ('kept')");
    });
    const db = await createPgliteDb(undefined, { snapshot: blob });
    expect(await db.query('SELECT v FROM probe')).toEqual([{ v: 'kept' }]);
    // Already migrated, so migrating again changes nothing.
    await migrate(db);
    expect(await db.query<{ n: number }>('SELECT count(*)::int AS n FROM probe')).toEqual([{ n: 1 }]);
    await db.close();
  }, 60_000);
});
