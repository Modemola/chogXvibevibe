import { LANES, PAIR_CLASSES, TEMPLATES, TEMPLATE_IDS } from '@scout/core';
import Link from 'next/link';
import { date, pct, reasonLabel, short, signed, tokens } from '@/lib/format';
import { getService } from '@/lib/server';
import { ApiError } from '@/lib/service';

export const dynamic = 'force-dynamic';

type Search = { template?: string; lane?: string; pair?: string };

const FEATURES = [
  ['holdQuality', 'H', 'Hold quality', 'alpha'],
  ['marketQuality', 'Q', 'Market quality', 'beta'],
  ['alignment', 'A', 'Alignment', 'gamma'],
  ['dumpScore', 'D', 'Dump score', 'delta'],
  ['sybil', 'Y', 'Sybil penalty', 'epsilon'],
] as const;

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ wallet: string }>;
  searchParams: Promise<Search>;
}) {
  const { wallet } = await params;
  const q = await searchParams;
  const svc = await getService();
  let p;
  try {
    p = await svc.profile(wallet, { template: q.template, lane: q.lane, pairClass: q.pair });
  } catch (e) {
    if (e instanceof ApiError) {
      return (
        <div className="notice error">
          {e.message}. <Link href="/">Back home</Link>
        </div>
      );
    }
    throw e;
  }
  const weights = TEMPLATES[p.template].weights;
  const maxAbs = Math.max(0.05, ...p.reasons.map((r) => Math.abs(r.contrib)));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="muted small">Scout profile</div>
          <h1 className="mono" style={{ fontSize: 22, wordBreak: 'break-all' }}>
            {p.wallet}
          </h1>
          <div className="row small">
            {p.optedIn ? (
              <span className="chip good">Opted in {p.optedInAt ? date(p.optedInAt) : ''}</span>
            ) : (
              <span className="chip">
                Not opted in · <Link href="/join">join</Link> to be eligible
              </span>
            )}
            {p.linkedTo && (
              <span className="chip">
                Alt of <Link href={`/profile/${p.linkedTo}`}>{short(p.linkedTo)}</Link>
              </span>
            )}
            {p.alts.map((a) => (
              <span key={a} className="chip">
                Alt <Link href={`/profile/${a}`}>{short(a)}</Link>
              </span>
            ))}
            {p.cluster.size > 1 && <span className="chip">Cluster of {p.cluster.size}</span>}
            {p.cluster.sybilScore > 0 && <span className="chip bad">Sybil penalty {pct(p.cluster.sybilScore, 0)}</span>}
          </div>
        </div>
        <form className="row" method="get">
          <select name="template" defaultValue={p.template} aria-label="Template">
            {TEMPLATE_IDS.map((t) => (
              <option key={t} value={t}>
                {TEMPLATES[t].name}
              </option>
            ))}
          </select>
          <select name="lane" defaultValue={p.launch.lane} aria-label="Launch lane">
            {LANES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select name="pair" defaultValue={p.launch.pairClass} aria-label="Pair class">
            {PAIR_CLASSES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button type="submit">Rescore</button>
        </form>
      </div>

      <div className="split" style={{ marginTop: 20 }}>
        <div className="grid">
          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="muted small">
                  Score for a {p.launch.lane}/{p.launch.pairClass} launch · {TEMPLATES[p.template].name}
                </div>
                <div className={`score-big ${p.score < 0 ? 'neg' : ''}`}>{p.score.toFixed(3)}</div>
              </div>
              <div className="mono small muted">S = αH + βQ + γA − δD − εY</div>
            </div>
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Why</th>
                  <th className="num">Contribution</th>
                  <th style={{ width: '30%' }} />
                </tr>
              </thead>
              <tbody>
                {p.reasons.map((r) => (
                  <tr key={r.code}>
                    <td>
                      {reasonLabel(r.code)}
                      <div className="muted small">
                        <code>{r.code}</code>
                        {r.detail ? ` · ${r.detail}` : ''}
                      </div>
                    </td>
                    <td className={`num mono ${r.contrib < 0 ? 'neg' : 'pos'}`}>{signed(r.contrib)}</td>
                    <td>
                      <div className="bar">
                        <span
                          className={r.contrib < 0 ? 'neg' : ''}
                          style={{ left: 0, width: `${(Math.abs(r.contrib) / maxAbs) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel scroll">
            <h3>Templates this wallet matches</h3>
            <table>
              <thead>
                <tr>
                  <th>Template</th>
                  <th className="num">Score</th>
                  <th>Buckets</th>
                </tr>
              </thead>
              <tbody>
                {p.eligibility.map((e) => (
                  <tr key={e.template}>
                    <td>{e.name}</td>
                    <td className="num mono">{e.score.toFixed(3)}</td>
                    <td>
                      {e.excludedBy ? (
                        <span className="chip bad">
                          excluded: <code>{e.excludedBy}</code>
                        </span>
                      ) : e.buckets.length ? (
                        e.buckets.map((b) => (
                          <span key={b} className="chip good">
                            {b}
                          </span>
                        ))
                      ) : (
                        <span className="muted small">no bucket</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel scroll">
            <h3>Scout airdrops received</h3>
            {p.drops.length === 0 ? (
              <p className="muted small">None yet. Holding the first one is the fastest way up.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Launch</th>
                    <th>Received</th>
                    <th className="num">Amount</th>
                    <th className="num">Sold 1h</th>
                    <th className="num">24h</th>
                    <th className="num">7d</th>
                    <th className="num">30d</th>
                  </tr>
                </thead>
                <tbody>
                  {p.drops.map((d) => (
                    <tr key={d.launchId}>
                      <td className="mono">{d.launchId}</td>
                      <td>{date(d.receivedAt)}</td>
                      <td className="num mono">{tokens(d.amount, 0)}</td>
                      {(['h1', 'h24', 'd7', 'd30'] as const).map((w) => {
                        const v = d.sold[w];
                        return (
                          <td key={w} className={`num mono ${v === undefined ? 'muted' : v >= 5_000 ? 'neg' : ''}`}>
                            {v === undefined ? '–' : pct(v / 10_000, 0)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="grid">
          <div className="panel">
            <h3>Components</h3>
            <table>
              <tbody>
                {FEATURES.map(([key, sym, label, w]) => (
                  <tr key={key}>
                    <td>
                      <span className="mono">{sym}</span> {label}
                    </td>
                    <td className="num mono">{p.features[key].value.toFixed(2)}</td>
                    <td className="num mono muted">×{weights[w]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel small">
            <h3>On record</h3>
            <div>SPARK: {tokens(p.sparkBalance, 0)} (tier {p.fields.spark_tier})</div>
            <div>
              Viber: {p.viber ? `level ${p.viber.level}${p.fields.viber_charged ? ', charged' : ''}` : 'none'}
            </div>
            <div>Guilds: {p.guilds.length ? p.guilds.map((g) => g.id).join(', ') : 'none'}</div>
            <div>
              Markets traded: {p.fields.markets_traded} ({p.fields.stock_pair_markets} stock-paired)
            </div>
            <div>Launches created: {p.createdLaunches.length}</div>
          </div>
          {p.cluster.edges.length > 0 && (
            <div className="panel small">
              <h3>Wallet links</h3>
              {p.cluster.edges.map((e, i) => {
                const other = e.a === p.wallet ? e.b : e.a;
                return (
                  <div key={i}>
                    <span className="chip">{e.kind.replace('_', ' ')}</span>
                    <Link href={`/profile/${other}`} className="mono">
                      {short(other)}
                    </Link>
                    <div className="muted">{e.detail}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
