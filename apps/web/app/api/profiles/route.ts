import { body, handle } from '@/lib/server';

/** Opt in: { message, signature } from the wallet opting in. */
export const POST = (req: Request) =>
  handle(async (svc) => {
    const b = await body(req);
    return svc.optIn({ message: String(b.message ?? ''), signature: String(b.signature ?? '') });
  });
