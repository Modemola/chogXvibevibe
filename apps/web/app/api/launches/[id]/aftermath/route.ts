import { handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((svc) => svc.aftermath(id));
}
