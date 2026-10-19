import { LANES, PAIR_CLASSES, TEMPLATES, TEMPLATE_IDS } from '@scout/core';
import Link from 'next/link';
import { ContribBar, Radar, ScoreRing, SoldSpark } from '@/components/charts';
import { Item, Reveal, Stagger, Tilt } from '@/components/motion';
import { PageHead } from '@/components/page-head';
import { date, pct, reasonLabel, short, signed, tokens } from '@/lib/format';
import { getService } from '@/lib/server';
import { isApiError } from '@/lib/service';

export const dynamic = 'force-dynamic';

type Search = { template?: string; lane?: string; pair?: string };

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ wallet: string }>; searchParams: Promise<Search> }) {
  const { wallet } = await params;
  const q = await searchParams;
  const svc = await getService();
  let p;
  try {
    p = await svc.profile(wallet, { template: q.template, lane: q.lane, pairClass: q.pair });
  } catch (e) {
    if (isApiError(e)) {
      return (
        <div className="glass pad r-xl" style={{ maxWidth: 560, margin: '10vh auto' }}>
          <div className="kicker">Profile</div>
          <h2 className="display" style={{ fontSize: 44, margin: '12px 0' }}>
            {/wallet/i.test(e.message) ? <>That doesn&apos;t look like a wallet.</> : <>Can&apos;t show this profile.</>}
          </h2>
          <div className="notice error">{e.message}</div>
          <Link href="/" className="btn" style={{ marginTop: 18 }}>
            Back home
          </Link>
        </div>
      );
    }
    throw e;
  }
  const weights = TEMPLATES[p.template].weights;
  const maxAbs = Math.max(0.05, ...p.reasons.map((r) => Math.abs(r.contrib)));
  const f = p.features;

  return (
    <>
      <PageHead
        kicker="Scout profile"
        title={p.optedIn ? 'A wallet, *explained.*' : 'A preview, *not yet* eligible.'}
        aside={
          <form className="seg-ctl" method="get" aria-label="Rescore">
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
            <button type="submit" className="btn sm primary">
              Rescore
            </button>
          </form>
        }
      />

      <Reveal>
        <div className="wallet-title">{p.wallet}</div>
        <div className="row">
          {p.optedIn ? (
            <span className="chip good">
              <span className="dot" /> Opted in {p.optedInAt ? date(p.optedInAt) : ''}
            </span>
          ) : (
            <span className="chip gold">
              Not opted in · <Link href="/join">join to be eligible</Link>
            </span>
          )}
          {p.linkedTo && (
            <span className="chip violet">
              Alt of <Link href={`/profile/${p.linkedTo}`}>{short(p.linkedTo)}</Link>
            </span>
          )}
          {p.alts.map((a) => (
            <span key={a} className="chip violet">
              Alt <Link href={`/profile/${a}`}>{short(a)}</Link>
            </span>
          ))}
          {p.fields.chog_holder && (
            <span className="chip good">
              <Link href="/chog">Chog holder</Link> · {p.fields.chog_count}
            </span>
          )}
          {p.cluster.size > 1 && <span className="chip">Cluster of {p.cluster.size}</span>}
          {p.cluster.sybilScore > 0 && <span className="chip bad">Sybil penalty {pct(p.cluster.sybilScore, 0)}</span>}
        </div>
      </Reveal>

      <div className="split" style={{ marginTop: 28 }}>
        <div className="stack" style={{ gap: 20 }}>
          <Reveal>
            <div className="glass pad r-xl">
              <div className="row" style={{ gap: 32, alignItems: 'center' }}>
                <ScoreRing score={p.score} label={`${p.launch.lane}/${p.launch.pairClass}`} />
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div className="kicker">Score · {TEMPLATES[p.template].name}</div>
                  <h3 className="display" style={{ margin: '12px 0 10px' }}>
                    {p.score >= 0.45 ? 'A wallet that stays.' : p.score >= 0.2 ? 'Building a record.' : p.score >= 0 ? 'Thin or mixed history.' : 'Sells fast, or isn’t alone.'}
                  </h3>
                  <p className="muted small" style={{ margin: 0 }}>
                    S = αH + βQ + γA − δD − εY. Every line below is one term of that sum; together they add up to the score.
                  </p>
                </div>
              </div>
              <div className="divider" />
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Why</th>
                      <th className="num">Contribution</th>
                      <th style={{ width: '32%' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {p.reasons.map((r, i) => (
                      <tr key={r.code}>
                        <td>
                          {reasonLabel(r.code)}
                          <div className="faint tiny">
                            <code>{r.code}</code>
                            {r.detail ? ` · ${r.detail}` : ''}
                          </div>
                        </td>
                        <td className={`num mono ${r.contrib < 0 ? 'neg' : 'pos'}`}>{signed(r.contrib)}</td>
                        <td>
                          <ContribBar value={r.contrib} max={maxAbs} delay={0.1 + i * 0.05} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="row between" style={{ margin: '24px 0 14px' }}>
              <h2 className="display" style={{ fontSize: 36 }}>
                Templates this wallet matches
              </h2>
            </div>
            <Stagger className="grid cols-5">
              {p.eligibility.map((e) => (
                <Item key={e.template}>
                  <Tilt className="h100" max={6}>
                    <div className="glass pad r-xl tmpl-card">
                      <div className="small muted">{e.name}</div>
                      <div
                        className={`score tnum ${e.score < 0 ? 'neg' : ''}`}
                        style={e.excludedBy || !e.buckets.length ? { opacity: 0.45 } : undefined}
                        title="The score only sizes a share inside a bucket the wallet qualifies for"
                      >
                        {e.score.toFixed(3)}
                      </div>
                      <div>
                        {e.excludedBy ? (
                          <span className="chip bad" title={e.excludedBy}>
                            excluded
                          </span>
                        ) : e.buckets.length ? (
                          e.buckets.map((b) => (
                            <span key={b} className="chip good">
                              {b}
                            </span>
                          ))
                        ) : (
                          <>
                            <span className="chip bad">not eligible</span>
                            <div className="tiny faint" style={{ marginTop: 8 }}>
                              Gets nothing. Needs{' '}
                              {TEMPLATES[e.template].policy.buckets
                                .map((b) => (typeof b.filter === 'string' ? b.filter : b.id))
                                .join(' or ')}
                            </div>
                          </>
                        )}
                      </div>
                      {e.excludedBy && <code className="tiny faint">{e.excludedBy}</code>}
                    </div>
                  </Tilt>
                </Item>
              ))}
            </Stagger>
          </Reveal>

          <Reveal>
            <div className="glass pad r-xl">
              <div className="row between">
                <h3>Scout airdrops received</h3>
                <span className="faint tiny mono">SOLD BY WINDOW</span>
              </div>
              {p.drops.length === 0 ? (
                <p className="muted small">None yet. Holding the first one is the fastest way up.</p>
              ) : (
                <div className="scroll" style={{ marginTop: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Launch</th>
                        <th>Received</th>
                        <th className="num">Amount</th>
                        <th className="num">1h</th>
                        <th className="num">24h</th>
                        <th className="num">7d</th>
                        <th className="num">30d</th>
                        <th>Shape</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.drops.map((d) => (
                        <tr key={d.launchId}>
                          <td>
                            <Link href={`/launches/${d.launchId}`} className="mono link">
                              {d.launchId}
                            </Link>
                          </td>
                          <td className="small muted">{date(d.receivedAt)}</td>
                          <td className="num mono">{tokens(d.amount, 0)}</td>
                          {(['h1', 'h24', 'd7', 'd30'] as const).map((w) => {
                            const v = d.sold[w];
                            return (
                              <td key={w} className={`num mono ${v === undefined ? 'faint' : v >= 9_000 ? 'neg' : v < 1_000 ? 'pos' : ''}`}>
                                {v === undefined ? 'none' : pct(v / 10_000, 0)}
                              </td>
                            );
                          })}
                          <td>
                            <SoldSpark sold={d.sold} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Reveal>
        </div>

        <div className="stack sticky" style={{ gap: 20 }}>
          <Reveal delay={0.1}>
            <div className="glass pad r-xl">
              <h3>Components</h3>
              <Radar
                values={[
                  { label: 'H', value: f.holdQuality.value },
                  { label: 'Q', value: f.marketQuality.value },
                  { label: 'A', value: Math.max(0, f.alignment.value) },
                  { label: 'D', value: f.dumpScore.value, risk: true },
                  { label: 'Y', value: f.sybil.value, risk: true },
                ]}
              />
              <dl className="kv small">
                <dt>H · hold quality</dt>
                <dd className="mono">{f.holdQuality.value.toFixed(2)} ×{weights.alpha}</dd>
                <dt>Q · market quality</dt>
                <dd className="mono">{f.marketQuality.value.toFixed(2)} ×{weights.beta}</dd>
                <dt>A · alignment</dt>
                <dd className="mono">{f.alignment.value.toFixed(2)} ×{weights.gamma}</dd>
                <dt>D · dump score</dt>
                <dd className="mono neg">{f.dumpScore.value.toFixed(2)} ×{weights.delta}</dd>
                <dt>Y · sybil</dt>
                <dd className="mono neg">{f.sybil.value.toFixed(2)} ×{weights.epsilon}</dd>
              </dl>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="glass pad r-xl">
              <h3 style={{ marginBottom: 14 }}>On record</h3>
              <dl className="kv small">
                <dt>SPARK</dt>
                <dd className="mono">
                  {tokens(p.sparkBalance, 0)} <span className="faint">· tier {p.fields.spark_tier}</span>
                </dd>
                <dt>Vibe Viber</dt>
                <dd>{p.viber ? `level ${p.viber.level}${p.fields.viber_charged ? ' · charged' : ''}` : 'none'}</dd>
                <dt>Guilds</dt>
                <dd>{p.guilds.length ? p.guilds.map((g) => g.id).join(', ') : 'none'}</dd>
                <dt>Chog Genesis</dt>
                <dd>
                  {p.chog && p.chog.tokens > 0 ? (
                    <>
                      {p.chog.tokens} on Monad
                      {p.chog.heldSince ? <span className="faint"> · seen since {date(p.chog.heldSince)}</span> : null}
                    </>
                  ) : (
                    'none'
                  )}
                </dd>
                <dt>$CHOG</dt>
                <dd className="mono">{p.chog?.chogBalance ? tokens(p.chog.chogBalance, 0) : 'none'}</dd>
                <dt>Markets traded</dt>
                <dd>
                  {p.fields.markets_traded} <span className="faint">· {p.fields.stock_pair_markets} stock-paired</span>
                </dd>
                <dt>Launches created</dt>
                <dd>{p.createdLaunches.length}</dd>
              </dl>
            </div>
          </Reveal>
          {p.cluster.edges.length > 0 && (
            <Reveal delay={0.2}>
              <div className="glass pad r-xl small">
                <h3 style={{ marginBottom: 12 }}>Wallet links</h3>
                <div className="stack" style={{ gap: 10 }}>
                  {p.cluster.edges.map((e, i) => {
                    const other = e.a === p.wallet ? e.b : e.a;
                    return (
                      <div key={i}>
                        <span className={`chip ${e.kind === 'declared' ? 'violet' : 'bad'}`}>{e.kind.replace('_', ' ')}</span>
                        <Link href={`/profile/${other}`} className="mono link">
                          {short(other)}
                        </Link>
                        <div className="faint tiny" style={{ marginTop: 4 }}>
                          {e.detail}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </>
  );
}
