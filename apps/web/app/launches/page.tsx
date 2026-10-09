import { CountUp } from '@/components/motion';
import { PageHead } from '@/components/page-head';
import { getService } from '@/lib/server';
import { LaunchGrid } from './LaunchGrid';
import { LiveGrid, LiveSync } from './LiveGrid';

export const dynamic = 'force-dynamic';

export default async function LaunchesPage() {
  const svc = await getService();
  const [launches, live, stats] = await Promise.all([svc.launches(), svc.liveLaunches(200), svc.stats()]);
  const [{ n: liveGraduated = 0 } = {}] = await svc.liveGraduatedCount();
  const graduated = launches.filter((l) => l.graduatedAt !== null).length;
  const withDrops = launches.filter((l) => l.drops > 0).length;
  return (
    <>
      <PageHead
        kicker="Launches"
        title="Every launch, every *aftermath.*"
        lead="Real vibe/vibe launches, read straight from Robinhood Chain testnet, and the simulated world Scout is evaluated on. Open a launch to see what Scout makes of its buyers."
        aside={
          <div className="glass r-xl row" style={{ gap: 0 }}>
            {(
              [
                ['Live launches', stats.liveLaunches],
                ['Live graduated', liveGraduated],
                ['Simulated', launches.length],
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
      <section style={{ marginBottom: 72 }}>
        <div className="row between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="kicker">
              <span className="live-dot" /> Live on vibe/vibe · Robinhood Chain testnet
            </div>
            <p className="muted small" style={{ margin: '8px 0 0', maxWidth: 640 }}>
              Read from vibe/vibe&apos;s public on-chain events: every launch since $SCOUT, every buy and sell, every graduation.
            </p>
          </div>
          <LiveSync />
        </div>
        {live.length ? <LiveGrid launches={live} /> : <div className="notice">Live launches appear here once the first sync has run.</div>}
      </section>

      <div className="kicker" style={{ marginBottom: 6 }}>
        Simulated world
      </div>
      <p className="muted small" style={{ margin: '0 0 18px', maxWidth: 640 }}>
        A seeded world of {launches.length} launches with {withDrops} Scout drops, where every behaviour Scout has to tell apart is known.
        {graduated ? ` ${graduated} graduated.` : ''}
      </p>
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
