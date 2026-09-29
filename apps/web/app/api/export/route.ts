import { NextResponse } from 'next/server';
import type { LaunchSpec } from '@/lib/service';
import { body, handle } from '@/lib/server';

/** Same body as /api/preview; returns the full allocation as CSV. */
export const POST = (req: Request) =>
  handle(async (svc) => {
    const b = await body(req);
    const csv = await svc.exportCsv({ policy: b.policy, launch: b.launch as LaunchSpec, sliceTokens: b.slice as string });
    return new NextResponse(csv, {
      headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="scout-allocation.csv"' },
    });
  });
