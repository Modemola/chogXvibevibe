import { handle } from '@/lib/server';

export async function GET(_req: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  return handle((svc) => svc.getPolicy(hash));
}
