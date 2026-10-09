import { handle } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Pulls new vibe/vibe activity from the chain. Rate-limited server side: at most one real sync a minute. */
export const POST = () => handle((svc) => svc.syncLive({ budgetMs: 20_000 }));
