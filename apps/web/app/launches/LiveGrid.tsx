'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Tilt } from '@/components/motion';
import { date } from '@/lib/format';

export interface LiveRow {
  id: string;
  number: number;
  name: string;
  symbol: string;
  pairClass: string;
  taxBps: number;
  createdAt: number;
  graduatedAt: number | null;
  buyers: number;
  trades: number;
}

const PAIR: Record<string, string> = { eth: 'ETH pair', stock: 'stock pair', other: 'VIBEVIBE pair' };
const FILTERS = [
  ['all', 'All'],
  ['graduated', 'Graduated'],
  ['bonding', 'Bonding'],
] as const;

/** Pulls new chain activity in the background, then refreshes the page if anything arrived. */
export function LiveSync({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  useEffect(() => {
    let alive = true;
    fetch('/api/live/sync', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { launches?: number; trades?: number } | null) => {
        if (!alive || !r) return;
        if (r.launches || r.trades) {
          setNote(`+${r.launches ?? 0} launches, +${r.trades ?? 0} trades`);
          router.refresh();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [router]);
  return note && !quiet ? <span className="chip good">{note}</span> : null;
}

export function LiveGrid({ launches }: { launches: LiveRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const shown = useMemo(
    () => launches.filter((l) => (filter === 'all' ? true : filter === 'graduated' ? l.graduatedAt !== null : l.graduatedAt === null)).slice(0, 60),
    [launches, filter],
  );
  return (
    <>
      <div className="seg-ctl filter-bar" role="tablist" aria-label="Filter live launches">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={`seg-btn ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(k)}>
            {filter === k && <motion.span layoutId="live-filter-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="grid cols-3 launch-grid">
        {shown.map((l) => (
          <Tilt key={l.id} className="h100" max={7}>
            <Link href={`/launches/${l.id}`} className="glass pad r-xl launch-card live-card">
              <div className="launch-orb" aria-hidden />
              <div className="row between">
                <span className="mono" style={{ fontSize: 15 }}>
                  #{l.number}
                </span>
                {l.graduatedAt ? <span className="chip good">graduated</span> : <span className="chip">bonding</span>}
              </div>
              <div className="live-name">
                ${l.symbol} <span className="faint">{l.name}</span>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <span className={`chip ${l.pairClass === 'stock' ? 'gold' : ''}`}>{PAIR[l.pairClass] ?? l.pairClass}</span>
                <span className="chip">{(l.taxBps / 100).toFixed(l.taxBps % 100 ? 1 : 0)}% tax</span>
              </div>
              <dl className="kv small" style={{ marginTop: 16 }}>
                <dt>Launched</dt>
                <dd className="muted">{date(l.createdAt)}</dd>
                <dt>Buyers</dt>
                <dd>{l.buyers}</dd>
                <dt>Trades</dt>
                <dd>{l.trades}</dd>
              </dl>
              <span className="link small" style={{ marginTop: 'auto', paddingTop: 16 }}>
                Scout&apos;s read <span className="arrow">→</span>
              </span>
            </Link>
          </Tilt>
        ))}
      </div>
    </>
  );
}
