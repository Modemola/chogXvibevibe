import Link from 'next/link';
import { date, pct, short, tokens } from '@/lib/format';
import { getService } from '@/lib/server';
import { ApiError } from '@/lib/service';

export const dynamic = 'force-dynamic';

const WINDOW_LABEL = { h1: '1 hour', h24: '24 hours', d7: '7 days', d30: '30 days' } as const;
const SEGMENTS = [
  ['held', 'Held', 'seg-held', 'sold under 10%'],
  ['trimmed', 'Trimmed', 'seg-trimmed', 'sold 10–50%'],
  ['mostlySold', 'Mostly sold', 'seg-mostly', 'sold 50–90%'],
  ['dumped', 'Dumped', 'seg-dumped', 'sold 90% or more'],
] as const;

export default async function AftermathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let a;
  try {
    a = await (await getService()).aftermath(decodeURIComponent(id));
  } catch (e) {
    if (e instanceof ApiError) return <div className="notice error">{e.message}</div>;
    throw e;
  }
  const { launch } = a;
  return (
    <>
      <div className="muted small">
        <Link href="/launches">Launches</Link> / Aftermath
      </div>
      <h1 className="mono" style={{ fontSize: 28 }}>{launch.id}</h1>
      <p className="lead">
        {launch.lane}/{launch.pairClass} launch by{' '}
        <Link href={`/profile/${launch.creator}`} className="mono">
          {short(launch.creator)}
        </Link>
        {launch.graduatedAt ? `, graduated ${date(launch.graduatedAt)}` : ', not graduated'}.{' '}
        {a.recipients.length
          ? `${a.recipients.length} wallets received ${tokens(a.totalAmount, 0)} tokens through Scout. Here is what they did with them.`
          : 'No Scout drop recorded for this launch.'}
      </p>

      {a.recipients.length > 0 && (
        <>
          <div className="grid cols-2">
            {a.windows.map((w) => (
              <div key={w.window} className="panel">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3>After {WINDOW_LABEL[w.window]}</h3>
                  {w.measured > 0 ? (
                    <span className="stat">
                      <span className="n" style={{ fontSize: 22 }}>
                        {pct(w.retained)}
                      </span>{' '}
                      <span className="l">still held</span>
                    </span>
                  ) : (
                    <span className="muted small">pending</span>
                  )}
                </div>
                {w.measured > 0 && (
                  <>
                    <div className="stack" role="img" aria-label={SEGMENTS.map(([k, l]) => `${l} ${w[k]}`).join(', ')}>
                      {SEGMENTS.map(([k, , cls]) =>
                        w[k] > 0 ? <span key={k} className={cls} style={{ flexGrow: w[k] }} /> : null,
                      )}
                    </div>
                    <div className="row small" style={{ marginTop: 8 }}>
                      {SEGMENTS.map(([k, label, cls, hint]) => (
                        <span key={k} title={hint}>
                          <span className={`dot ${cls}`} /> {label} <b>{w[k]}</b>
                        </span>
                      ))}
                    </div>
                    {w.measured < a.recipients.length && (
                      <div className="muted small">{a.recipients.length - w.measured} recipients not measured (drop transfer not indexed)</div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <h2>Recipients</h2>
          <div className="panel scroll">
            <table>
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th className="num">Received</th>
                  <th className="num">Sold by 1h</th>
                  <th className="num">24h</th>
                  <th className="num">7d</th>
                  <th className="num">30d</th>
                </tr>
              </thead>
              <tbody>
                {a.recipients.map((r) => (
                  <tr key={r.wallet}>
                    <td>
                      <Link href={`/profile/${r.wallet}`} className="mono">
                        {short(r.wallet)}
                      </Link>
                    </td>
                    <td className="num mono">{tokens(r.amount, 0)}</td>
                    {(['h1', 'h24', 'd7', 'd30'] as const).map((w) => {
                      const v = r.sold[w];
                      return (
                        <td key={w} className={`num mono ${v === undefined ? 'muted' : v >= 9_000 ? 'neg' : v < 1_000 ? 'pos' : ''}`}>
                          {v === undefined ? '–' : pct(v / 10_000, 0)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Sold = balance right after the drop minus the lowest balance up to the end of each window, capped at the amount
            received. Moving tokens to a linked wallet or a known staking contract is not selling. Buying back later does not
            undo a sale. These results feed each wallet&apos;s next Scout score.
          </p>
        </>
      )}
    </>
  );
}
