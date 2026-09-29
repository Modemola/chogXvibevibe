import { body, handle } from '@/lib/server';

/** Link an alt: { message, signature (alt), primarySignature (primary) }. */
export const POST = (req: Request) =>
  handle(async (svc) => {
    const b = await body(req);
    return svc.link({
      message: String(b.message ?? ''),
      signature: String(b.signature ?? ''),
      primarySignature: String(b.primarySignature ?? ''),
    });
  });
