import { body, handle } from '@/lib/server';

/** Lock a saved policy to a launch: { message, signature } from the launch creator. */
export const POST = (req: Request) =>
  handle(async (svc) => {
    const b = await body(req);
    return svc.lockPolicy({ message: String(b.message ?? ''), signature: String(b.signature ?? '') });
  });
