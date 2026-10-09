import { handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Scout's read of one real launch, as counts only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((svc) => svc.liveLaunch(id));
}
