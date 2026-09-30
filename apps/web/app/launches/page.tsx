import Link from 'next/link';
import { date, short } from '@/lib/format';
import { getService } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function LaunchesPage() {
  const launches = await (await getService()).launches();
  return (
    <>
      <h1>Launches</h1>
      <p className="lead">Launches Scout has indexed. Open one in the builder to preview its graduation airdrop.</p>
      {launches.length === 0 ? (
        <div className="notice">
          No launches yet. Run <code>pnpm scout simulate</code> for a demo world, or start the app with{' '}
          <code>SCOUT_SIMULATE=1</code>.
        </div>
      ) : (
        <div className="panel scroll">
          <table>
            <thead>
              <tr>
                <th>Launch</th>
                <th>Lane</th>
                <th>Pair</th>
                <th>Creator</th>
                <th>Created</th>
                <th>Graduated</th>
                <th>Policy</th>
                <th className="num">Scout drop</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {launches.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.id}</td>
                  <td>{l.lane}</td>
                  <td>{l.pairClass}</td>
                  <td>
                    <Link href={`/profile/${l.creator}`} className="mono">
                      {short(l.creator)}
                    </Link>
                  </td>
                  <td>{date(l.createdAt)}</td>
                  <td>{l.graduatedAt ? date(l.graduatedAt) : <span className="muted">–</span>}</td>
                  <td>{l.lockedPolicy ? <span className="chip good mono">{l.lockedPolicy.slice(0, 10)}</span> : <span className="muted">–</span>}</td>
                  <td className="num">
                    {l.drops ? <Link href={`/launches/${encodeURIComponent(l.id)}`}>{l.drops} · Aftermath</Link> : <span className="muted">–</span>}
                  </td>
                  <td>
                    <Link href={`/builder?launch=${encodeURIComponent(l.id)}`}>Preview</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
