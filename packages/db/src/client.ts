import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

/**
 * The only database surface the rest of Scout uses. Two adapters: node-postgres
 * for real deployments, PGlite (Postgres compiled to WASM, in-process) for tests
 * and zero-setup local runs. Same SQL on both.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs one or more statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  const fromClient = (client: pg.PoolClient): Db => ({
    query: async (sql, params) => (await client.query(sql, params)).rows,
    exec: async (sql) => {
      await client.query(sql);
    },
    transaction: (fn) => fn(fromClient(client)),
    close: async () => {},
  });
  return {
    query: async (sql, params) => (await pool.query(sql, params)).rows,
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(fromClient(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

type PgliteLike = Pick<PGlite, 'query' | 'exec'>;

/**
 * PGlite on disk (`dataDir`) or in memory. `snapshot` restores an in-memory
 * database from a `pgliteSnapshot` dump, which boots several times faster than
 * creating and migrating a fresh one.
 */
export async function createPgliteDb(dataDir?: string, opts: { snapshot?: Blob } = {}): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  return wrapPglite(opts.snapshot ? await PGlite.create({ loadDataDir: opts.snapshot }) : await PGlite.create(dataDir));
}

function wrapPglite(db: PGlite): Db {
  const wrap = (conn: PgliteLike, inTx: boolean): Db => ({
    query: async (sql, params) => (await conn.query(sql, params)).rows as never,
    exec: async (sql) => {
      await conn.exec(sql);
    },
    transaction: (fn) => (inTx ? fn(wrap(conn, true)) : db.transaction((tx) => fn(wrap(tx, true)))),
    close: async () => {
      if (!inTx) await db.close();
    },
  });
  return wrap(db, false);
}

/** Builds an in-memory database with `fill` and returns it as a gzipped data-dir dump. */
export async function pgliteSnapshot(fill: (db: Db) => Promise<void>): Promise<Blob> {
  const pglite = await PGlite.create();
  const db = wrapPglite(pglite);
  await fill(db);
  const blob = await pglite.dumpDataDir('gzip');
  await pglite.close();
  return blob;
}

/** DATABASE_URL → Postgres; otherwise PGlite at `pgliteDir` (or in memory). */
export async function openDb(opts: { url?: string; pgliteDir?: string } = {}): Promise<Db> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) return createPgDb(url);
  return createPgliteDb(opts.pgliteDir);
}
