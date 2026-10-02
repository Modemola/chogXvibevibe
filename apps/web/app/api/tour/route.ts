import { handle } from '@/lib/server';

export const dynamic = 'force-dynamic';

export const GET = () => handle((svc) => svc.tourTargets());
