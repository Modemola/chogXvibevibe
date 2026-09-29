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

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir);
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

/** DATABASE_URL → Postgres; otherwise PGlite at `pgliteDir` (or in memory). */
export async function openDb(opts: { url?: string; pgliteDir?: string } = {}): Promise<Db> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) return createPgDb(url);
  return createPgliteDb(opts.pgliteDir);
}
