'use client';

import {
  FIELD_TYPES,
  LANES,
  PAIR_CLASSES,
  type PolicyInput,
  TEMPLATES,
  TEMPLATE_IDS,
  type TemplateId,
  buildMessage,
  normalizeAddress,
} from '@scout/core';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUCKET_COLORS, BucketDonut } from '@/components/charts';
import { EASE, Magnetic } from '@/components/motion';
import { FIELD_DOCS } from '@/lib/fields';
import { pct, reasonLabel, short, signed, tokens } from '@/lib/format';
import { api, connect, sign } from '@/lib/wallet';

interface LaunchOption {
  id: string;
  lane: string;
  pairClass: string;
  creator: string;
  graduated: boolean;
  locked: string | null;
}

interface BucketDraft {
  id: string;
  weightPct: string;
  filter: string;
  allowlist: string;
  distribution: '' | 'score' | 'equal';
}

interface Draft {
  template: TemplateId;
  buckets: BucketDraft[];
  perWalletPct: string;
  perClusterPct: string;
  excludes: string;
  fallback: string;
  minScore: string;
}

interface Preview {
  launchId: string;
  policyHash: string;
  merkleRoot: string | null;
  slice: string;
  allocated: string;
  unallocated: string;
  totalRecipients: number;
  warnings: string[];
  buckets: { id: string; target: string; allocated: string; carriedOut: string; candidates: number; recipients: number }[];
  excluded: { wallet: string; rule: string }[];
  recipients: {
    wallet: string;
    amount: string;
    score: number;
    buckets: { id: string; amount: string }[];
    reasons: { code: string; contrib: number }[];
  }[];
}

function draftFrom(template: TemplateId): Draft {
  const p = TEMPLATES[template].policy;
  return {
    template,
    buckets: p.buckets.map((b) => ({
      id: b.id,
      weightPct: String(b.weightBps / 100),
      filter: typeof b.filter === 'string' ? b.filter : '',
      allowlist: (b.allowlist ?? []).join('\n'),
      distribution: b.distribution ?? '',
    })),
    perWalletPct: String((p.caps?.perWalletBps ?? 50) / 100),
    perClusterPct: String((p.caps?.perClusterBps ?? 80) / 100),
    excludes: (p.excludes ?? []).filter((e): e is string => typeof e === 'string').join('\n'),
    fallback: p.fallbackBucket ?? '',
    minScore: p.minScore === undefined ? '' : String(p.minScore),
  };
}

function toPolicy(d: Draft): PolicyInput {
  const policy: PolicyInput = {
    version: 1,
    template: d.template,
    buckets: d.buckets.map((b) => {
      const allowlist = b.allowlist
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        id: b.id.trim(),
        weightBps: Math.round(Number(b.weightPct) * 100),
        ...(b.filter.trim() ? { filter: b.filter.trim() } : {}),
        ...(allowlist.length ? { allowlist } : {}),
        ...(b.distribution ? { distribution: b.distribution } : {}),
      };
    }),
    caps: { perWalletBps: Math.round(Number(d.perWalletPct) * 100), perClusterBps: Math.round(Number(d.perClusterPct) * 100) },
    excludes: d.excludes
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  if (d.fallback) policy.fallbackBucket = d.fallback;
  if (d.minScore.trim()) policy.minScore = Number(d.minScore);
  return policy;
}

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PolicyBuilder({
  launches,
  initialLaunch,
  initialTemplate,
}: {
  launches: LaunchOption[];
  initialLaunch?: string;
  initialTemplate?: string;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(TEMPLATE_IDS.includes(initialTemplate as TemplateId) ? (initialTemplate as TemplateId) : 'custom'),
  );
  const [mode, setMode] = useState<'stored' | 'adhoc'>(launches.length ? 'stored' : 'adhoc');
  const [launchId, setLaunchId] = useState(initialLaunch ?? launches.find((l) => l.graduated)?.id ?? launches[0]?.id ?? '');
  const [adhoc, setAdhoc] = useState({ lane: 'utility', pairClass: 'stock', creator: '' });
  const [slice, setSlice] = useState('1000000');
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<{ message: string; issues?: string[] }>();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>();
  const seq = useRef(0);

  const policy = useMemo(() => toPolicy(draft), [draft]);
  const launch = useMemo(
    () =>
      mode === 'stored'
        ? { launchId }
        : { lane: adhoc.lane, pairClass: adhoc.pairClass, creator: adhoc.creator.trim() || '0x000000000000000000000000000000000000dead' },
    [mode, launchId, adhoc],
  );
  const selected = launches.find((l) => l.id === launchId);
  const weightTotal = draft.buckets.reduce((s, b) => s + (Number(b.weightPct) || 0), 0);

  const run = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const res = await api<Preview>('/api/preview', { body: { policy, launch, slice, topN: 50 } });
      if (my !== seq.current) return;
      setPreview(res);
      setError(undefined);
    } catch (e) {
      if (my !== seq.current) return;
      setError({ message: (e as Error).message, issues: (e as { issues?: string[] }).issues });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [policy, launch, slice]);

  useEffect(() => {
    const t = setTimeout(run, 350);
    return () => clearTimeout(t);
  }, [run]);

  const setBucket = (i: number, patch: Partial<BucketDraft>) =>
    setDraft((d) => ({ ...d, buckets: d.buckets.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  const onExport = async () => {
    setStatus(undefined);
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policy, launch, slice }),
    });
    if (!res.ok) return setStatus((await res.json()).error);
    download(`scout-${preview?.launchId ?? 'allocation'}.csv`, await res.text(), 'text/csv');
  };

  const onClaims = async () => {
    setStatus(undefined);
    try {
      const data = await api<unknown>('/api/export?format=claims', { body: { policy, launch, slice } });
      download(`scout-claims-${preview?.launchId ?? 'allocation'}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const onSave = async () => {
    try {
      const { hash } = await api<{ hash: string }>('/api/policies', { body: { policy } });
      setStatus(`Saved policy ${hash}`);
      return hash;
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const onLock = async () => {
    setStatus(undefined);
    try {
      if (!selected) throw new Error('Pick a stored launch to lock a policy to');
      const hash = await onSave();
      if (!hash) return;
      const account = await connect();
      if (account !== selected.creator) {
        throw new Error(`Only the launch creator (${selected.creator}) can lock its policy. Connected: ${account}`);
      }
      const env = await api<{ nonce: string; issuedAt: number }>('/api/auth/nonce', { method: 'POST' });
      const message = buildMessage(
        { kind: 'lock_policy', creator: normalizeAddress(account), launchId: selected.id, policyHash: hash as `0x${string}` },
        env,
      );
      const signature = await sign(message, account);
      await api('/api/locks', { body: { message, signature } });
      setStatus(`Locked ${hash.slice(0, 10)}… to ${selected.id}`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const allocatedShare = preview ? Number((BigInt(preview.allocated) * 10_000n) / BigInt(preview.slice)) / 10_000 : 0;
  const [fieldQuery, setFieldQuery] = useState('');
  const [focusFilter, setFocusFilter] = useState<number>(0);
  const insertField = (f: string) =>
    setBucket(focusFilter, { filter: (draft.buckets[focusFilter]?.filter.trim() ? `${draft.buckets[focusFilter]!.filter.trim()} AND ` : '') + f });

  return (
    <div className="split builder">
      <div className="stack" style={{ gap: 18 }}>
        <motion.div className="glass pad r-xl" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.2 }}>
          <div className="builder-bar">
            <label className="field">
              <span>Template</span>
              <select value={draft.template} onChange={(e) => setDraft(draftFrom(e.target.value as TemplateId))} aria-label="Template">
                {TEMPLATE_IDS.map((t) => (
                  <option key={t} value={t}>
                    {TEMPLATES[t].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Launch</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as 'stored' | 'adhoc')} aria-label="Launch source">
                <option value="stored" disabled={!launches.length}>
                  Indexed launch
                </option>
                <option value="adhoc">Describe a launch</option>
              </select>
            </label>
            {mode === 'stored' ? (
              <label className="field grow">
                <span>&nbsp;</span>
                <select value={launchId} onChange={(e) => setLaunchId(e.target.value)} aria-label="Launch">
                  {launches.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id} · {l.lane}/{l.pairClass}
                      {l.graduated ? ' · graduated' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Lane</span>
                  <select value={adhoc.lane} onChange={(e) => setAdhoc({ ...adhoc, lane: e.target.value })}>
                    {LANES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Pair</span>
                  <select value={adhoc.pairClass} onChange={(e) => setAdhoc({ ...adhoc, pairClass: e.target.value })}>
                    {PAIR_CLASSES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="field grow">
                  <span>Creator</span>
                  <input value={adhoc.creator} onChange={(e) => setAdhoc({ ...adhoc, creator: e.target.value })} placeholder="0x…" />
                </label>
              </>
            )}
            <label className="field" style={{ width: 150 }}>
              <span>Slice (tokens)</span>
              <input value={slice} onChange={(e) => setSlice(e.target.value.replace(/[^\d]/g, ''))} aria-label="Slice" className="mono" />
            </label>
          </div>
          <p className="muted small" style={{ margin: '14px 0 0' }}>
            <span className="chip gold">{TEMPLATES[draft.template].name}</span> {TEMPLATES[draft.template].description}
          </p>
        </motion.div>

        <motion.div className="glass pad r-xl" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.3 }}>
          <div className="row between">
            <div>
              <div className="kicker">Buckets</div>
              <p className="muted small" style={{ margin: '8px 0 0' }}>
                Fill in order. What one can&apos;t place under the caps spills into the next.
              </p>
            </div>
            <span className={`chip ${Math.abs(weightTotal - 100) > 1e-9 ? 'bad' : 'good'}`}>Weights total {weightTotal}% (must be 100%)</span>
          </div>
          <div className="weight-strip" aria-hidden>
            {draft.buckets.map((b, i) => (
              <motion.span key={i} layout style={{ flexGrow: Math.max(0.0001, Number(b.weightPct) || 0), background: BUCKET_COLORS[i % BUCKET_COLORS.length] }} transition={{ duration: 0.6, ease: EASE }} />
            ))}
          </div>
          <AnimatePresence initial={false}>
            {draft.buckets.map((b, i) => (
              <motion.div
                key={i}
                className="bucket"
                style={{ ['--b' as string]: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <div className="bucket-row">
                  <span className="bucket-dot" />
                  <input value={b.id} onChange={(e) => setBucket(i, { id: e.target.value })} aria-label="Bucket id" className="mono" />
                  <div className="pct-input">
                    <input value={b.weightPct} onChange={(e) => setBucket(i, { weightPct: e.target.value })} aria-label="Weight %" className="mono" />
                    <span>%</span>
                  </div>
                  <select value={b.distribution} onChange={(e) => setBucket(i, { distribution: e.target.value as BucketDraft['distribution'] })} aria-label="Split">
                    <option value="">auto split</option>
                    <option value="score">by score</option>
                    <option value="equal">equal</option>
                  </select>
                  <button className="icon-btn" onClick={() => setDraft((d) => ({ ...d, buckets: d.buckets.filter((_, j) => j !== i) }))} aria-label="Remove bucket" title="Remove">
                    ×
                  </button>
                </div>
                <div className="filters">
                  <input
                    value={b.filter}
                    onFocus={() => setFocusFilter(i)}
                    onChange={(e) => setBucket(i, { filter: e.target.value })}
                    placeholder="filter, e.g. spark_tier >= 1 AND dump_score < 0.25"
                    className="mono"
                    aria-label="Filter"
                  />
                  {(b.allowlist || b.distribution === 'equal') && (
                    <textarea
                      rows={2}
                      value={b.allowlist}
                      onChange={(e) => setBucket(i, { allowlist: e.target.value })}
                      placeholder="allowlist: one address per line (your own community; may include wallets that haven't opted in)"
                    />
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="btn sm"
              onClick={() =>
                setDraft((d) => ({ ...d, buckets: [...d.buckets, { id: `bucket${d.buckets.length + 1}`, weightPct: '0', filter: '', allowlist: '', distribution: '' }] }))
              }
            >
              + Bucket
            </button>
            <button
              className="btn sm"
              onClick={() =>
                setDraft((d) => ({ ...d, buckets: [...d.buckets, { id: 'community', weightPct: '0', filter: '', allowlist: ' ', distribution: 'equal' }] }))
              }
            >
              + Allowlist bucket
            </button>
          </div>
        </motion.div>

        <motion.div className="glass pad r-xl grid cols-3" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.4 }}>
          <label className="field">
            <span>Max per wallet</span>
            <div className="pct-input">
              <input value={draft.perWalletPct} onChange={(e) => setDraft({ ...draft, perWalletPct: e.target.value })} className="mono" />
              <span>%</span>
            </div>
          </label>
          <label className="field">
            <span>Max per cluster</span>
            <div className="pct-input">
              <input value={draft.perClusterPct} onChange={(e) => setDraft({ ...draft, perClusterPct: e.target.value })} className="mono" />
              <span>%</span>
            </div>
          </label>
          <label className="field">
            <span>Leftover goes to</span>
            <select value={draft.fallback} onChange={(e) => setDraft({ ...draft, fallback: e.target.value })}>
              <option value="">back to the launch</option>
              {draft.buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  bucket {b.id}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Exclude wallets matching · one filter per line</span>
            <textarea rows={2} value={draft.excludes} onChange={(e) => setDraft({ ...draft, excludes: e.target.value })} />
          </label>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div className="notice error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {error.message}
              {error.issues && (
                <ul className="small" style={{ margin: '4px 0 0' }}>
                  {error.issues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {preview && (
          <div className={`glass pad r-xl preview ${loading ? 'is-loading' : ''}`}>
            <div className="preview-top">
              <BucketDonut
                segments={preview.buckets.map((b) => ({ id: b.id, value: Number(BigInt(b.allocated) / 10n ** 18n) }))}
                center={pct(allocatedShare, 0)}
                sub="allocated"
              />
              <div className="grid cols-3" style={{ flex: 1, alignContent: 'center' }}>
                <div className="stat">
                  <div className="n">{pct(allocatedShare)}</div>
                  <div className="l">of {tokens(preview.slice, 0)} allocated</div>
                </div>
                <div className="stat">
                  <div className="n">{preview.totalRecipients}</div>
                  <div className="l">recipients · {preview.excluded.length} excluded</div>
                </div>
                <div className="stat">
                  <div className="n">{tokens(preview.unallocated, 0)}</div>
                  <div className="l">returned to the launch</div>
                </div>
                <div className="tiny faint mono hashes" style={{ gridColumn: '1 / -1' }}>
                  <div>policy {preview.policyHash}</div>
                  <div>merkle {preview.merkleRoot ?? '–'}</div>
                </div>
              </div>
            </div>
            {preview.warnings.map((w) => (
              <div key={w} className="notice" style={{ marginTop: 10 }}>
                {w}
              </div>
            ))}
            <div className="scroll" style={{ marginTop: 18 }}>
              <table>
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="num">Target</th>
                    <th className="num">Allocated</th>
                    <th className="num">Spilled</th>
                    <th className="num">Candidates</th>
                    <th className="num">Recipients</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.buckets.map((b, i) => (
                    <tr key={b.id}>
                      <td>
                        <span className="dot" style={{ color: BUCKET_COLORS[i % BUCKET_COLORS.length], marginRight: 10 }} />
                        {b.id}
                      </td>
                      <td className="num mono">{tokens(b.target, 0)}</td>
                      <td className="num mono">{tokens(b.allocated, 0)}</td>
                      <td className="num mono faint">{tokens(b.carriedOut, 0)}</td>
                      <td className="num">{b.candidates}</td>
                      <td className="num">{b.recipients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="display" style={{ margin: '34px 0 10px', fontSize: 30 }}>
              Top recipients
            </h3>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Wallet</th>
                    <th className="num">Amount</th>
                    <th className="num">Score</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.recipients.map((r, i) => (
                    <tr key={r.wallet}>
                      <td className="faint mono">{String(i + 1).padStart(2, '0')}</td>
                      <td>
                        <Link href={`/profile/${r.wallet}`} className="mono link">
                          {short(r.wallet)}
                        </Link>
                        <div>
                          {r.buckets.map((b) => (
                            <span key={b.id} className="chip tiny" style={{ height: 20 }}>
                              {b.id}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num mono">{tokens(r.amount, 0)}</td>
                      <td className="num mono">{r.score.toFixed(3)}</td>
                      <td>
                        {r.reasons.slice(0, 3).map((x) => (
                          <span key={x.code} className={`chip ${x.contrib < 0 ? 'bad' : 'good'}`} title={x.code}>
                            {reasonLabel(x.code)} {signed(x.contrib)}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="stack sticky dock" style={{ gap: 18 }}>
        <motion.div className="glass pad r-xl stack" style={{ gap: 10 }} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.35 }}>
          <div className="row between">
            <h3>Use this policy</h3>
            {loading && <span className="spinner light" aria-label="Resolving" />}
          </div>
          <Magnetic strength={0.15}>
            <button className="btn primary block" onClick={onExport} disabled={!preview} style={{ width: 300, maxWidth: '100%' }}>
              Download recipients CSV
            </button>
          </Magnetic>
          <button className="btn block" onClick={onClaims} disabled={!preview}>
            Download claims + proofs (ScoutDrop)
          </button>
          <button className="btn block" onClick={() => download('scout-policy.json', JSON.stringify(policy, null, 2), 'application/json')}>
            Download policy JSON
          </button>
          <button className="btn block" onClick={onSave}>
            Save policy (get its hash)
          </button>
          <button className="btn block" onClick={onLock} disabled={mode !== 'stored' || Boolean(selected?.locked)}>
            {selected?.locked ? 'Launch already locked' : 'Lock to this launch (creator signs)'}
          </button>
          <AnimatePresence>
            {status && (
              <motion.div className="notice small" style={{ wordBreak: 'break-all' }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {status}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <motion.div className="glass pad r-xl small" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.45 }}>
          <h3>Filter fields</h3>
          <p className="faint tiny" style={{ margin: '6px 0 10px' }}>
            <code>== != &gt; &gt;= &lt; &lt;=</code>, <code>HAS</code>, <code>AND OR NOT</code>, parentheses. Click a field to add it to the
            focused filter.
          </p>
          <input value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} placeholder="Search fields" aria-label="Search fields" style={{ height: 36 }} />
          <div className="field-list">
            {(Object.keys(FIELD_TYPES) as (keyof typeof FIELD_TYPES)[])
              .filter((f) => !fieldQuery || f.includes(fieldQuery.toLowerCase()) || FIELD_DOCS[f].toLowerCase().includes(fieldQuery.toLowerCase()))
              .map((f) => (
                <button key={f} className="field-item" onClick={() => insertField(f)} title={`Add ${f} to the focused filter`}>
                  <code>{f}</code>
                  <span className="faint">{FIELD_DOCS[f]}</span>
                </button>
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
