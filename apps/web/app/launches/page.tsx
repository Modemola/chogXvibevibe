import { CountUp } from '@/components/motion';
import { PageHead } from '@/components/page-head';
import { getService } from '@/lib/server';
import { LaunchGrid } from './LaunchGrid';

export const dynamic = 'force-dynamic';

export default async function LaunchesPage() {
  const launches = await (await getService()).launches();
  const graduated = launches.filter((l) => l.graduatedAt !== null).length;
  const withDrops = launches.filter((l) => l.drops > 0).length;
  return (
    <>
      <PageHead
        kicker="Launches"
        title="Every launch, every *aftermath.*"
        lead="Launches Scout has indexed. Open a report card to see who held their graduation airdrop and who dumped it, or preview a drop in the builder."
        aside={
          <div className="glass r-xl row" style={{ gap: 0 }}>
            {(
              [
                ['Indexed', launches.length],
                ['Graduated', graduated],
                ['With Scout drop', withDrops],
              ] as const
            ).map(([l, n], i) => (
              <div key={l} className="stat" style={{ padding: '18px 24px', boxShadow: i ? 'inset 1px 0 0 var(--hair)' : undefined }}>
                <div className="n" style={{ fontSize: 34 }}>
                  <CountUp value={n} />
                </div>
                <div className="l">{l}</div>
              </div>
            ))}
          </div>
        }
      />
      {launches.length === 0 ? (
        <div className="notice">
          No launches yet. Run <code>pnpm scout simulate</code> for a demo world, or start the app with <code>SCOUT_SIMULATE=1</code>.
        </div>
      ) : (
        <LaunchGrid launches={launches} />
      )}
    </>
  );
}
