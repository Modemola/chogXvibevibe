import type { NextRequest } from 'next/server';
import { handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Real vibe/vibe launches indexed from Robinhood Chain testnet, newest first. */
export const GET = (req: NextRequest) =>
  handle(async (svc) => ({ launches: await svc.liveLaunches(Number(req.nextUrl.searchParams.get('limit') ?? 120) || 120) }));
