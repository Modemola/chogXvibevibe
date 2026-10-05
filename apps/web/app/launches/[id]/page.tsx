import Link from 'next/link';
import { RetentionCurve, SoldSpark } from '@/components/charts';
import { CountUp, Item, Reveal, Stagger, Tilt } from '@/components/motion';
import { OnchainBadge } from '@/components/onchain';
import { PageHead } from '@/components/page-head';
import { date, pct, short, tokens } from '@/lib/format';
import { onchainDrop } from '@/lib/onchain';
import { getService } from '@/lib/server';
import { ApiError } from '@/lib/service';
import { StackBar } from './StackBar';

export const dynamic = 'force-dynamic';

const WINDOW_LABEL = { h1: '1 hour', h24: '24 hours', d7: '7 days', d30: '30 days' } as const;
const SHORT = { h1: '1h', h24: '24h', d7: '7d', d30: '30d' } as const;

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
      <PageHead
        kicker={
          <>
            <Link href="/launches" className="link">
              Launches
            </Link>
            &nbsp;/ Aftermath
          </>
        }
        title={`*${launch.id}*`}
        lead={
          <>
            {launch.lane}/{launch.pairClass} launch by{' '}
            <Link href={`/profile/${launch.creator}`} className="mono link">
              {short(launch.creator)}
            </Link>
            {launch.graduatedAt ? `, graduated ${date(launch.graduatedAt)}` : ', not graduated'}.{' '}
            {a.recipients.length
              ? `${a.recipients.length} wallets received ${tokens(a.totalAmount, 0)} tokens through Scout. Here is what they did with them.`
              : onchainDrop?.launchId === launch.id
                ? 'Its Scout drop was paid out on-chain; the aftermath fills in once the drop is indexed.'
                : 'No Scout drop recorded for this launch.'}
          </>
        }
      />

      {onchainDrop?.launchId === launch.id && <OnchainBadge drop={onchainDrop} />}

      {a.recipients.length > 0 && (
        <>
          <Stagger className="grid cols-4">
            {a.windows.map((w) => (
              <Item key={w.window}>
                <Tilt className="h100" max={6}>
                  <div className="glass pad r-xl h100 window-card">
                    <h3>After {WINDOW_LABEL[w.window]}</h3>
                    {w.measured > 0 ? (
                      <>
                        <div className="stat" style={{ margin: '14px 0 18px' }}>
                          <div className="n">
                            <CountUp value={Math.round(w.retained * 1000) / 10} decimals={1} suffix="%" />
                          </div>
                          <div className="l">still held · {w.measured} wallets</div>
                        </div>
                        <StackBar w={w} />
                        <div className="legend tiny">
                          <span>
                            <i className="seg-held" /> Held <b>{w.held}</b>
                          </span>
                          <span>
                            <i className="seg-trimmed" /> Trimmed <b>{w.trimmed}</b>
                          </span>
                          <span>
                            <i className="seg-mostly" /> Mostly sold <b>{w.mostlySold}</b>
                          </span>
                          <span>
                            <i className="seg-dumped" /> Dumped <b>{w.dumped}</b>
                          </span>
                        </div>
                        {w.measured < a.recipients.length && (
                          <div className="faint tiny" style={{ marginTop: 10 }}>
                            {a.recipients.length - w.measured} not measured (drop transfer not indexed)
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="pending">
                        <span className="live-dot" style={{ background: 'var(--gold)' }} /> pending
                      </div>
                    )}
                  </div>
                </Tilt>
              </Item>
            ))}
          </Stagger>

          <Reveal>
            <div className="glass pad r-xl" style={{ marginTop: 20 }}>
              <div className="row between">
                <div>
                  <div className="kicker">Retention</div>
                  <h3 className="display" style={{ marginTop: 10 }}>
                    Share of the drop still held
                  </h3>
                </div>
                <span className="faint small">amount-weighted, measured from transfers</span>
              </div>
              <RetentionCurve points={a.windows.map((w) => ({ label: SHORT[w.window], value: w.measured ? w.retained : null }))} />
            </div>
          </Reveal>

          <Reveal>
            <h2 className="display" style={{ fontSize: 40, margin: '56px 0 16px' }}>
              Recipients
            </h2>
            <div className="glass pad r-xl scroll">
              <table>
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th className="num">Received</th>
                    <th className="num">Sold by 1h</th>
                    <th className="num">24h</th>
                    <th className="num">7d</th>
                    <th className="num">30d</th>
                    <th>Shape</th>
                  </tr>
                </thead>
                <tbody>
                  {a.recipients.map((r) => (
                    <tr key={r.wallet}>
                      <td>
                        <Link href={`/profile/${r.wallet}`} className="mono link">
                          {short(r.wallet)}
                        </Link>
                      </td>
                      <td className="num mono">{tokens(r.amount, 0)}</td>
                      {(['h1', 'h24', 'd7', 'd30'] as const).map((w) => {
                        const v = r.sold[w];
                        return (
                          <td key={w} className={`num mono ${v === undefined ? 'faint' : v >= 9_000 ? 'neg' : v < 1_000 ? 'pos' : ''}`}>
                            {v === undefined ? '–' : pct(v / 10_000, 0)}
                          </td>
                        );
                      })}
                      <td>
                        <SoldSpark sold={r.sold} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint small" style={{ marginTop: 16, maxWidth: 820 }}>
              Sold = balance right after the drop minus the lowest balance up to the end of each window, capped at the amount
              received. Moving tokens to a linked wallet or a known staking contract is not selling. Buying back later does not undo
              a sale. These results feed each wallet&apos;s next Scout score.
            </p>
          </Reveal>
        </>
      )}
    </>
  );
}
