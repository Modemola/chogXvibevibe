import type { LaunchSpec } from '@/lib/service';
import { body, handle } from '@/lib/server';

/** { policy, launch: {launchId} | {lane, pairClass, creator}, slice (whole tokens), topN? } */
export const POST = (req: Request) =>
  handle(async (svc) => {
    const b = await body(req);
    return svc.preview({
      policy: b.policy,
      launch: b.launch as LaunchSpec,
      sliceTokens: b.slice as string,
      topN: typeof b.topN === 'number' ? Math.min(Math.max(1, b.topN), 1_000) : 50,
    });
  });
