'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTour } from './tour';

interface Action {
  id: string;
  label: string;
  hint: string;
  href: string;
}

const STATIC: Action[] = [
  { id: 'tour', label: 'Start the guided tour', hint: '2 minutes, hands-free', href: '#tour' },
  { id: 'home', label: 'Home', hint: 'Overview', href: '/' },
  { id: 'builder', label: 'Policy builder', hint: 'Design an airdrop', href: '/builder' },
  { id: 'launches', label: 'Launches', hint: 'Browse & aftermath', href: '/launches' },
  { id: 'join', label: 'Join Scout', hint: 'Opt in your wallet', href: '/join' },
];

const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

/** ⌘K: jump to any wallet, launch or page. */
export function CommandPalette() {
  const router = useRouter();
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [launches, setLaunches] = useState<{ id: string; lane: string; pairClass: string; drops: number }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    setTimeout(() => input.current?.focus(), 30);
    if (!launches.length) {
      fetch('/api/launches')
        .then((r) => (r.ok ? r.json() : []))
        .then(setLaunches)
        .catch(() => {});
    }
  }, [open, launches.length]);

  const actions = useMemo<Action[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Action[] = [];
    if (isAddress(q)) out.push({ id: 'wallet', label: `Open profile ${q.trim().slice(0, 10)}…`, hint: 'Score and reasons', href: `/profile/${q.trim()}` });
    out.push(...STATIC.filter((a) => !query || a.label.toLowerCase().includes(query)));
    out.push(
      ...launches
        .filter((l) => query && l.id.toLowerCase().includes(query))
        .slice(0, 6)
        .map((l) => ({
          id: l.id,
          label: l.id,
          hint: `${l.lane}/${l.pairClass}${l.drops ? ' · aftermath' : ''}`,
          href: l.drops ? `/launches/${l.id}` : `/builder?launch=${l.id}`,
        })),
    );
    return out;
  }, [q, launches]);

  const go = useCallback(
    (a?: Action) => {
      if (!a) return;
      setOpen(false);
      if (a.href === '#tour') tour.start();
      else router.push(a.href);
    },
    [router, tour],
  );

  return (
    <>
      <button className="nav-search" onClick={() => setOpen(true)} aria-label="Search wallets and launches">
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="nav-search-label">Wallet or launch</span>
        <span className="kbd">⌘K</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="palette-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-label="Command palette"
              className="palette glass r-xl"
              initial={{ y: -20, scale: 0.96, opacity: 0, filter: 'blur(8px)' }}
              animate={{ y: 0, scale: 1, opacity: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
              exit={{ y: -10, scale: 0.98, opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={input}
                value={q}
                placeholder="Paste a wallet 0x…, or search launches and pages"
                aria-label="Search"
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, actions.length - 1));
                  else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
                  else if (e.key === 'Enter') go(actions[sel]);
                }}
              />
              <ul className="palette-list">
                {actions.map((a, i) => (
                  <li key={a.id}>
                    <button className={i === sel ? 'is-sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => go(a)}>
                      <span>{a.label}</span>
                      <span className="faint small">{a.hint}</span>
                    </button>
                  </li>
                ))}
                {!actions.length && <li className="faint small" style={{ padding: 14 }}>Nothing matches. Paste a full 0x address to open a profile.</li>}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
