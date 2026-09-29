'use client';

import { buildMessage, normalizeAddress } from '@scout/core';
import Link from 'next/link';
import { useState } from 'react';
import { api, connect, currentAccount, sign } from '@/lib/wallet';

type Nonce = { nonce: string; issuedAt: number };

export default function JoinFlow() {
  const [account, setAccount] = useState<`0x${string}`>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [joined, setJoined] = useState<string>();

  // Link flow state: the alt signs first, then the user switches to the primary.
  const [primaryInput, setPrimaryInput] = useState('');
  const [pendingLink, setPendingLink] = useState<{ message: string; altSig: `0x${string}`; primary: string; alt: string }>();
  const [linked, setLinked] = useState<{ primary: string; alt: string }>();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onConnect = () => run(async () => setAccount(await connect()));

  const onOptIn = () =>
    run(async () => {
      const wallet = account ?? (await connect());
      const env = await api<Nonce>('/api/auth/nonce', { method: 'POST' });
      const message = buildMessage({ kind: 'opt_in', wallet: normalizeAddress(wallet) }, env);
      const signature = await sign(message, wallet);
      const res = await api<{ wallet: string; created: boolean }>('/api/profiles', { body: { message, signature } });
      setJoined(res.wallet);
    });

  const onAltSign = () =>
    run(async () => {
      const alt = normalizeAddress(account ?? (await connect()));
      let primary;
      try {
        primary = normalizeAddress(primaryInput.trim());
      } catch {
        throw new Error('Enter the primary wallet address');
      }
      if (primary === alt) throw new Error('The primary and the alt must be different wallets');
      const env = await api<Nonce>('/api/auth/nonce', { method: 'POST' });
      const message = buildMessage({ kind: 'link', primary, alt }, env);
      const altSig = await sign(message, alt);
      setPendingLink({ message, altSig, primary, alt });
    });

  const onPrimarySign = () =>
    run(async () => {
      if (!pendingLink) return;
      const now = await currentAccount();
      if (now !== pendingLink.primary) {
        throw new Error(`Switch your wallet to the primary account ${pendingLink.primary} first (currently ${now ?? 'none'}).`);
      }
      const primarySignature = await sign(pendingLink.message, now);
      await api('/api/links', { body: { message: pendingLink.message, signature: pendingLink.altSig, primarySignature } });
      setLinked({ primary: pendingLink.primary, alt: pendingLink.alt });
      setPendingLink(undefined);
    });

  return (
    <div className="grid cols-2">
      <div className="panel">
        <h3>1 · Opt in</h3>
        <p className="muted small">Your wallet signs a plain-text message saying you want to be scored for graduation airdrops.</p>
        {account && (
          <p className="small">
            Connected: <span className="mono">{account}</span>
          </p>
        )}
        <div className="row">
          {!account && (
            <button onClick={onConnect} disabled={busy}>
              Connect wallet
            </button>
          )}
          <button className="primary" onClick={onOptIn} disabled={busy}>
            Sign and opt in
          </button>
        </div>
        {joined && (
          <div className="notice ok">
            You&apos;re in. <Link href={`/profile/${joined}`}>See your score and why</Link>.
          </div>
        )}
      </div>

      <div className="panel">
        <h3>2 · Link an alt (optional)</h3>
        <p className="muted small">
          Linked wallets are scored as one person and share one cap, and they don&apos;t get a sybil penalty for being
          connected. Both wallets must sign, so nobody can attach a wallet to yours.
        </p>
        {!pendingLink ? (
          <>
            <label className="field">
              Primary wallet
              <input value={primaryInput} onChange={(e) => setPrimaryInput(e.target.value)} placeholder="0x…" />
            </label>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={onAltSign} disabled={busy}>
                Sign with the alt (connected wallet)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="notice">
              Alt signed. Now switch your wallet to the primary account <span className="mono">{pendingLink.primary}</span> and
              sign the same message.
            </div>
            <div className="row">
              <button className="primary" onClick={onPrimarySign} disabled={busy}>
                Sign with the primary
              </button>
              <button onClick={() => setPendingLink(undefined)} disabled={busy}>
                Cancel
              </button>
            </div>
          </>
        )}
        {linked && (
          <div className="notice ok">
            Linked <span className="mono">{linked.alt}</span> to{' '}
            <Link href={`/profile/${linked.primary}`} className="mono">
              {linked.primary}
            </Link>
            .
          </div>
        )}
      </div>

      {error && <div className="notice error" style={{ gridColumn: '1 / -1' }}>{error}</div>}
    </div>
  );
}
