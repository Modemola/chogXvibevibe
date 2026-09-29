import { getService } from '@/lib/server';
import PolicyBuilder from './PolicyBuilder';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Policy builder · Graduation Scout' };

export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ launch?: string }> }) {
  const { launch } = await searchParams;
  const launches = (await (await getService()).launches()).map((l) => ({
    id: l.id,
    lane: l.lane,
    pairClass: l.pairClass,
    creator: l.creator,
    graduated: l.graduatedAt !== null,
    locked: l.lockedPolicy,
  }));
  return (
    <>
      <h1>Policy builder</h1>
      <p className="lead">
        Decide who gets the graduation slice. Every change re-resolves against all opted-in profiles, so you see the real
        list, the amounts and the reasons before anything is sent.
      </p>
      <PolicyBuilder launches={launches} initialLaunch={launch} />
    </>
  );
}
