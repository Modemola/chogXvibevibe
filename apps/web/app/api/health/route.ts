import { databaseMode, handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Says which database the site is running on, so a deploy can be checked from the browser. */
export async function GET() {
  return handle(async (svc) => {
    const database = await databaseMode();
    const stats = await svc.stats();
    return {
      ok: true,
      database,
      persistent: database !== 'demo-memory',
      profiles: stats.profiles,
      note:
        database === 'demo-memory'
          ? 'No database URL found: opt-ins live in memory and disappear when the server restarts. Set DATABASE_URL and redeploy.'
          : undefined,
    };
  });
}
