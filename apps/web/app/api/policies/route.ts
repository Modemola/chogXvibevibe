import { body, handle } from '@/lib/server';

/** Save a policy. Content-addressed: returns its hash. */
export const POST = (req: Request) =>
  handle(async (svc) => {
    const b = await body(req);
    return svc.savePolicy(b.policy);
  });
