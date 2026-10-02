import 'server-only';
import path from 'node:path';
import { type Db, migrate, openDb, runAftermath, writeBatch } from '@scout/db';
import { simulateWorld } from '@scout/sources';
import { NextResponse } from 'next/server';
import { ApiError, ScoutService, toJson } from './service';

/**
 * One service per server process. DATABASE_URL selects Postgres; otherwise
 * PGlite at SCOUT_PGLITE_DIR (default: the repo's .data/pglite, shared with
 * the `scout` CLI). SCOUT_SIMULATE=1 seeds a simulated world into an empty
 * database, for local demos only.
 *
 * On Vercel without DATABASE_URL there is no writable disk to keep PGlite on,
 * so each server instance runs an in-memory PGlite seeded with the simulated
 * world. Good enough for a demo; set DATABASE_URL to keep opt-ins and links.
 */
const g = globalThis as unknown as { scout?: Promise<{ db: Db; service: ScoutService }> };

async function init() {
  const ephemeral = Boolean(process.env.VERCEL) && !process.env.DATABASE_URL && !process.env.SCOUT_PGLITE_DIR;
  const db = await openDb({
    pgliteDir: ephemeral ? undefined : (process.env.SCOUT_PGLITE_DIR ?? path.resolve(process.cwd(), '../../.data/pglite')),
  });
  await migrate(db);
  if (process.env.SCOUT_SIMULATE === '1' || ephemeral) {
    const [row] = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM launches');
    if (row?.n === '0') {
      console.log('[scout] empty database, seeding simulated world (SCOUT_SIMULATE=1)');
      const world = simulateWorld();
      await writeBatch(db, world.batch);
      await runAftermath(db, { now: world.asOf });
    }
  }
  const fanout = process.env.SCOUT_IGNORE_HUBS_MIN_FANOUT;
  return { db, service: new ScoutService(db, { ignoreHubsMinFanout: fanout === undefined ? 20 : Number(fanout) }) };
}

export async function getService(): Promise<ScoutService> {
  g.scout ??= init().catch((e) => {
    g.scout = undefined;
    throw e;
  });
  return (await g.scout).service;
}

export function json(value: unknown, status = 200): NextResponse {
  return new NextResponse(toJson(value), { status, headers: { 'content-type': 'application/json' } });
}

/** Wraps a route: ApiError → its status, anything else → 500 without internals. */
export async function handle(fn: (svc: ScoutService) => Promise<unknown>): Promise<NextResponse> {
  try {
    const out = await fn(await getService());
    return out instanceof NextResponse ? out : json(out);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, issues: e.issues }, e.status);
    console.error(e);
    return json({ error: 'Internal error' }, 500);
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError(400, 'Expected a JSON object body');
}
