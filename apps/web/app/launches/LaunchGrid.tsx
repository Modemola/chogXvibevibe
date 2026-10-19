'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EASE, Tilt } from '@/components/motion';
import { date, short } from '@/lib/format';

export interface LaunchRow {
  id: string;
  creator: string;
  lane: string;
  pairClass: string;
  createdAt: number;
  graduatedAt: number | null;
  lockedPolicy: string | null;
  drops: number;
}

const LANE_HUE: Record<string, string> = {
  meme: '#e9b8c4',
  art: '#e3d7bf',
  utility: '#c9d8e6',
  rwa: '#bfe3d3',
  vibecoded: '#d6d0ea',
};

const FILTERS = [
  ['all', 'All'],
  ['drops', 'With Scout drop'],
  ['graduated', 'Graduated'],
  ['stock', 'Stock pairs'],
  ['substance', 'Utility · RWA · Vibecoded'],
] as const;

export function LaunchGrid({ launches }: { launches: LaunchRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const shown = useMemo(
    () =>
      launches.filter((l) =>
        filter === 'all'
          ? true
          : filter === 'drops'
            ? l.drops > 0
            : filter === 'graduated'
              ? l.graduatedAt !== null
              : filter === 'stock'
                ? l.pairClass === 'stock'
                : ['utility', 'rwa', 'vibecoded'].includes(l.lane),
      ),
    [launches, filter],
  );
  return (
    <>
      <div className="seg-ctl filter-bar" role="tablist" aria-label="Filter launches">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={`seg-btn ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(k)}>
            {filter === k && <motion.span layoutId="filter-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span>{label}</span>
          </button>
        ))}
        <span className="faint small" style={{ alignSelf: 'center', padding: '0 10px' }}>
          {shown.length} launches
        </span>
      </div>
      <motion.div layout className="grid cols-3 launch-grid">
        <AnimatePresence mode="popLayout">
          {shown.map((l, i) => (
            <motion.div
              key={l.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.6, ease: EASE, delay: Math.min(i, 12) * 0.03 }}
            >
              <Tilt className="h100" max={7}>
                <article className="glass pad r-xl launch-card" style={{ ['--lane' as string]: LANE_HUE[l.lane] ?? '#d6dbe1' }}>
                  <div className="launch-orb" aria-hidden />
                  <div className="row between">
                    <span className="mono" style={{ fontSize: 15 }}>
                      {l.id}
                    </span>
                    {l.graduatedAt ? <span className="chip good">graduated</span> : <span className="chip">bonding</span>}
                  </div>
                  <div className="row" style={{ marginTop: 14 }}>
                    <span className="chip lane-chip">{l.lane}</span>
                    <span className={`chip ${l.pairClass === 'stock' ? 'gold' : ''}`}>{l.pairClass} pair</span>
                    {l.lockedPolicy && <span className="chip violet">policy locked</span>}
                  </div>
                  <dl className="kv small" style={{ marginTop: 18 }}>
                    <dt>Creator</dt>
                    <dd>
                      <Link href={`/profile/${l.creator}`} className="mono link">
                        {short(l.creator)}
                      </Link>
                    </dd>
                    <dt>Created</dt>
                    <dd className="muted">{date(l.createdAt)}</dd>
                    <dt>Scout drop</dt>
                    <dd>{l.drops ? `${l.drops} wallets` : <span className="faint">none</span>}</dd>
                  </dl>
                  <div className="row" style={{ marginTop: 'auto', paddingTop: 18 }}>
                    {l.drops > 0 && (
                      <Link href={`/launches/${encodeURIComponent(l.id)}`} className="btn sm">
                        Aftermath <span className="arrow">→</span>
                      </Link>
                    )}
                    <Link href={`/builder?launch=${encodeURIComponent(l.id)}`} className="btn sm">
                      Preview drop
                    </Link>
                  </div>
                </article>
              </Tilt>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
