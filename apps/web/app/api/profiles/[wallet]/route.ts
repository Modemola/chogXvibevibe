import type { NextRequest } from 'next/server';
import { handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await ctx.params;
  const q = req.nextUrl.searchParams;
  return handle((svc) =>
    svc.profile(wallet, {
      template: q.get('template') ?? undefined,
      lane: q.get('lane') ?? undefined,
      pairClass: q.get('pair') ?? undefined,
    }),
  );
}
