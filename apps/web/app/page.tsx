import Link from 'next/link';
import { getService } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const stats = await (await getService()).stats();
  const tiles: [string, number][] = [
    ['Opted-in profiles', stats.profiles],
    ['Launches indexed', stats.launches],
    ['Graduated', stats.graduated],
    ['Scout drops tracked', stats.scoutDrops],
    ['Locked policies', stats.lockedPolicies],
  ];
  return (
    <>
      <h1>Send graduation airdrops to people who stay.</h1>
      <p className="lead">
        Scout scores opted-in wallets on how they held past airdrops, what they trade, and whether they are one person with
        many wallets. Creators pick the rules, see who gets what and why, and export the list.
      </p>
      <div className="row" style={{ marginBottom: 32 }}>
        <Link href="/builder" className="btn primary">
          Build a policy
        </Link>
        <Link href="/join" className="btn">
          Opt in your wallet
        </Link>
      </div>

      <div className="grid cols-5">
        {tiles.map(([l, n]) => (
          <div key={l} className="panel stat">
            <div className="n">{n.toLocaleString('en-US')}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>

      <h2>How it works</h2>
      <div className="grid cols-2">
        <div className="panel step">
          <div className="k">01 · profiles</div>
          <h3>Wallets opt in</h3>
          <p className="muted small">Sign once. Link your alts so they count as one person; nobody can link a wallet without its owner signing too.</p>
        </div>
        <div className="panel step">
          <div className="k">02 · policy</div>
          <h3>Creators set the rules</h3>
          <p className="muted small">Start from a template or write filters like <code>dump_score &lt; 0.25 AND spark_tier &gt;= 1</code>. Caps stop any one wallet or cluster taking too much.</p>
        </div>
        <div className="panel step">
          <div className="k">03 · resolve</div>
          <h3>See who gets what, and why</h3>
          <p className="muted small">Every recipient comes with reasons that add up to their score. The creator&apos;s own wallets are always excluded.</p>
        </div>
        <div className="panel step">
          <div className="k">04 · aftermath</div>
          <h3>Holding pays next time</h3>
          <p className="muted small">After each drop Scout records who held and who dumped at 1h, 24h, 7d and 30d. That history is most of the next score.</p>
        </div>
      </div>
    </>
  );
}
