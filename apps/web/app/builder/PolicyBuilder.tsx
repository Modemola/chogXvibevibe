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
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export default function PolicyBuilder({ launches, initialLaunch }: { launches: LaunchOption[]; initialLaunch?: string }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom('custom'));
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

  return (
    <div className="split">
      <div className="grid">
        <div className="panel grid">
          <div className="row">
            <label className="field">
              Template
              <select
                value={draft.template}
                onChange={(e) => setDraft(draftFrom(e.target.value as TemplateId))}
                aria-label="Template"
              >
                {TEMPLATE_IDS.map((t) => (
                  <option key={t} value={t}>
                    {TEMPLATES[t].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Launch
              <select value={mode} onChange={(e) => setMode(e.target.value as 'stored' | 'adhoc')} aria-label="Launch source">
                <option value="stored" disabled={!launches.length}>
                  Indexed launch
                </option>
                <option value="adhoc">Describe a launch</option>
              </select>
            </label>
            {mode === 'stored' ? (
              <label className="field">
                &nbsp;
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
                  Lane
                  <select value={adhoc.lane} onChange={(e) => setAdhoc({ ...adhoc, lane: e.target.value })}>
                    {LANES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Pair
                  <select value={adhoc.pairClass} onChange={(e) => setAdhoc({ ...adhoc, pairClass: e.target.value })}>
                    {PAIR_CLASSES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Creator
                  <input value={adhoc.creator} onChange={(e) => setAdhoc({ ...adhoc, creator: e.target.value })} placeholder="0x…" />
                </label>
              </>
            )}
            <label className="field">
              Slice (tokens)
              <input value={slice} onChange={(e) => setSlice(e.target.value.replace(/[^\d]/g, ''))} style={{ width: 130 }} aria-label="Slice" />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {TEMPLATES[draft.template].description}
          </p>
        </div>

        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Buckets</h3>
            <span className={`small ${Math.abs(weightTotal - 100) > 1e-9 ? 'neg' : 'muted'}`}>Weights total {weightTotal}% (must be 100%)</span>
          </div>
          <p className="muted small">Buckets fill in order. What one can&apos;t place under the caps spills into the next.</p>
          {draft.buckets.map((b, i) => (
            <div key={i} className="bucket-row">
              <input value={b.id} onChange={(e) => setBucket(i, { id: e.target.value })} aria-label="Bucket id" />
              <input value={b.weightPct} onChange={(e) => setBucket(i, { weightPct: e.target.value })} aria-label="Weight %" />
              <div className="grid filters" style={{ gap: 4 }}>
                <input
                  value={b.filter}
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
              <select value={b.distribution} onChange={(e) => setBucket(i, { distribution: e.target.value as BucketDraft['distribution'] })} aria-label="Split">
                <option value="">auto</option>
                <option value="score">by score</option>
                <option value="equal">equal</option>
              </select>
              <button onClick={() => setDraft((d) => ({ ...d, buckets: d.buckets.filter((_, j) => j !== i) }))} aria-label="Remove bucket" title="Remove">
                ×
              </button>
            </div>
          ))}
          <div className="row">
            <button
              onClick={() =>
                setDraft((d) => ({ ...d, buckets: [...d.buckets, { id: `bucket${d.buckets.length + 1}`, weightPct: '0', filter: '', allowlist: '', distribution: '' }] }))
              }
            >
              + Bucket
            </button>
            <button
              onClick={() =>
                setDraft((d) => ({ ...d, buckets: [...d.buckets, { id: 'community', weightPct: '0', filter: '', allowlist: ' ', distribution: 'equal' }] }))
              }
            >
              + Allowlist bucket
            </button>
          </div>
        </div>

        <div className="panel grid cols-3">
          <label className="field">
            Max per wallet (% of slice)
            <input value={draft.perWalletPct} onChange={(e) => setDraft({ ...draft, perWalletPct: e.target.value })} />
          </label>
          <label className="field">
            Max per cluster (% of slice)
            <input value={draft.perClusterPct} onChange={(e) => setDraft({ ...draft, perClusterPct: e.target.value })} />
          </label>
          <label className="field">
            Leftover goes to
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
            Exclude wallets matching (one filter per line)
            <textarea rows={2} value={draft.excludes} onChange={(e) => setDraft({ ...draft, excludes: e.target.value })} />
          </label>
        </div>

        {error && (
          <div className="notice error">
            {error.message}
            {error.issues && (
              <ul className="small" style={{ margin: '4px 0 0' }}>
                {error.issues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {preview && (
          <div className="panel" style={{ opacity: loading ? 0.6 : 1 }}>
            <div className="grid cols-3">
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
            </div>
            <div className="small muted mono" style={{ margin: '10px 0', wordBreak: 'break-all' }}>
              policy {preview.policyHash}
              <br />
              merkle {preview.merkleRoot ?? '–'}
            </div>
            {preview.warnings.map((w) => (
              <div key={w} className="notice">
                {w}
              </div>
            ))}
            <div className="scroll">
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
                  {preview.buckets.map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td className="num mono">{tokens(b.target, 0)}</td>
                      <td className="num mono">{tokens(b.allocated, 0)}</td>
                      <td className="num mono">{tokens(b.carriedOut, 0)}</td>
                      <td className="num">{b.candidates}</td>
                      <td className="num">{b.recipients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: 20 }}>Top recipients</h3>
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
                      <td className="muted">{i + 1}</td>
                      <td>
                        <Link href={`/profile/${r.wallet}`} className="mono">
                          {short(r.wallet)}
                        </Link>
                        <div>
                          {r.buckets.map((b) => (
                            <span key={b.id} className="chip">
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

      <div className="grid" style={{ position: 'sticky', top: 72 }}>
        <div className="panel grid">
          <h3>Use this policy</h3>
          <button className="primary" onClick={onExport} disabled={!preview}>
            Download recipients CSV
          </button>
          <button onClick={onClaims} disabled={!preview}>
            Download claims + proofs (ScoutDrop)
          </button>
          <button onClick={() => download('scout-policy.json', JSON.stringify(policy, null, 2), 'application/json')}>Download policy JSON</button>
          <button onClick={onSave}>Save policy (get its hash)</button>
          <button onClick={onLock} disabled={mode !== 'stored' || Boolean(selected?.locked)}>
            {selected?.locked ? 'Launch already locked' : 'Lock to this launch (creator signs)'}
          </button>
          {status && <div className="notice small" style={{ wordBreak: 'break-all' }}>{status}</div>}
        </div>
        <div className="panel small">
          <h3>Filter fields</h3>
          <p className="muted">
            Operators <code>== != &gt; &gt;= &lt; &lt;=</code>, <code>HAS</code>, <code>AND OR NOT</code>, parentheses. A bare
            boolean field means true.
          </p>
          {(Object.keys(FIELD_TYPES) as (keyof typeof FIELD_TYPES)[]).map((f) => (
            <div key={f} style={{ marginBottom: 6 }}>
              <code>{f}</code> <span className="muted">{FIELD_DOCS[f]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
