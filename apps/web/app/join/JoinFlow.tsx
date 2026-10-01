'use client';

import { buildMessage, normalizeAddress } from '@scout/core';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { EASE, Magnetic } from '@/components/motion';
import { short } from '@/lib/format';
import { api, connect, currentAccount, sign } from '@/lib/wallet';

type Nonce = { nonce: string; issuedAt: number };

/** A little golden burst for moments worth celebrating. */
function Burst() {
  return (
    <div className="burst" aria-hidden>
      {Array.from({ length: 26 }, (_, i) => {
        const a = (i / 26) * Math.PI * 2;
        const d = 60 + (i % 3) * 26;
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, scale: 0, opacity: 0 }}
            transition={{ duration: 1.1 + (i % 4) * 0.12, ease: EASE }}
            style={{ background: i % 3 === 0 ? '#9b8cff' : i % 3 === 1 ? '#f3c97a' : '#63e6ff' }}
          />
        );
      })}
    </div>
  );
}

function Step({ n, done, active, children }: { n: number; done?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <div className={`step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}>
      <span className="step-n">{done ? '✓' : n}</span>
      <span>{children}</span>
    </div>
  );
}

export default function JoinFlow() {
  const [account, setAccount] = useState<`0x${string}`>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [joined, setJoined] = useState<string>();

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
      setAccount(wallet);
      const env = await api<Nonce>('/api/auth/nonce', { method: 'POST' });
      const message = buildMessage({ kind: 'opt_in', wallet: normalizeAddress(wallet) }, env);
      const signature = await sign(message, wallet);
      const res = await api<{ wallet: string; created: boolean }>('/api/profiles', { body: { message, signature } });
      setJoined(res.wallet);
    });

  const onAltSign = () =>
    run(async () => {
      const alt = normalizeAddress(await connect());
      setAccount(alt);
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
    <div className="grid cols-2 join-grid">
      <motion.section className="glass pad r-xl join-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}>
        <div className="join-badge">I</div>
        <h2 className="display" style={{ fontSize: 40 }}>
          Opt in
        </h2>
        <p className="muted">Your wallet signs a plain-text message saying you want to be scored for graduation airdrops. No transaction.</p>
        <div className="steps">
          <Step n={1} done={Boolean(account)} active={!account}>
            Connect a browser wallet {account && <span className="mono faint">· {short(account)}</span>}
          </Step>
          <Step n={2} done={Boolean(joined)} active={Boolean(account) && !joined}>
            Sign the opt-in message
          </Step>
          <Step n={3} done={Boolean(joined)}>
            See your score and why
          </Step>
        </div>
        <div className="row" style={{ marginTop: 'auto', paddingTop: 22 }}>
          {!account && (
            <button className="btn" onClick={onConnect} disabled={busy}>
              Connect wallet
            </button>
          )}
          <Magnetic>
            <button className="btn primary" onClick={onOptIn} disabled={busy}>
              {busy && !pendingLink ? <span className="spinner" /> : null}
              Sign and opt in
            </button>
          </Magnetic>
        </div>
        <AnimatePresence>
          {joined && (
            <motion.div className="notice ok success" initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE }}>
              <Burst />
              You&apos;re in. <Link href={`/profile/${joined}`}>See your score and why</Link>.
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <motion.section className="glass pad r-xl join-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.45 }}>
        <div className="join-badge">II</div>
        <h2 className="display" style={{ fontSize: 40 }}>
          Link an alt <span className="faint" style={{ fontSize: 20 }}>optional</span>
        </h2>
        <p className="muted">
          Linked wallets are scored as one person and share one cap, with no sybil penalty between them. Both wallets sign, so
          nobody can attach a wallet to yours.
        </p>
        <AnimatePresence mode="wait">
          {!pendingLink ? (
            <motion.div key="a" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.4, ease: EASE }}>
              <label className="field" style={{ marginTop: 8 }}>
                <span>Primary wallet</span>
                <input value={primaryInput} onChange={(e) => setPrimaryInput(e.target.value)} placeholder="0x…" aria-label="Primary wallet" />
              </label>
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" onClick={onAltSign} disabled={busy}>
                  Sign with the alt (connected wallet)
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="b" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.4, ease: EASE }}>
              <div className="notice">
                Alt signed. Now switch your wallet to the primary account <span className="mono">{pendingLink.primary}</span> and sign the
                same message.
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn primary" onClick={onPrimarySign} disabled={busy}>
                  Sign with the primary
                </button>
                <button className="btn" onClick={() => setPendingLink(undefined)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {linked && (
            <motion.div className="notice ok success" style={{ marginTop: 16 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
              <Burst />
              Linked <span className="mono">{short(linked.alt)}</span> to{' '}
              <Link href={`/profile/${linked.primary}`} className="mono">
                {short(linked.primary)}
              </Link>
              .
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <AnimatePresence>
        {error && (
          <motion.div className="notice error" style={{ gridColumn: '1 / -1' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
