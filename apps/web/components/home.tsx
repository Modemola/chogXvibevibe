'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { short } from '@/lib/format';
import { Dust } from './dust';
import { Scramble } from './scramble';
import { CountUp, DrawPath, EASE, Item, Magnetic, Reveal, Stagger, Tilt, Words } from './motion';
import { Hero3D } from './three/Hero3D';

/* ------------------------------------------------------------------------------------------------
 * Hero
 * --------------------------------------------------------------------------------------------- */

export interface HomeStats {
  profiles: number;
  launches: number;
  graduated: number;
  scoutDrops: number;
  lockedPolicies: number;
}

export interface Highlight {
  launchId: string;
  wallet: string;
  window: string;
  soldBps: number;
}

const WINDOW_WORD: Record<string, string> = { h1: '1h', h24: '24h', d7: '7d', d30: '30d' };

function decodeLines(items: Highlight[]): string[] {
  const lines = items.slice(0, 8).map((h) => {
    const held = h.soldBps < 1_000;
    const verdict = held ? `held ${Math.round(100 - h.soldBps / 100)}%` : `dumped ${Math.round(h.soldBps / 100)}%`;
    return `${short(h.wallet)}  →  ${verdict} · ${WINDOW_WORD[h.window] ?? h.window}`;
  });
  return lines.length ? lines : ['0x7f3a…c41e  →  held 98% · 30d', '0x1d32…6e54  →  dumped 94% · 1h'];
}

export function Hero({ highlights }: { highlights: Highlight[] }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const lift = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const lines = decodeLines(highlights);
  return (
    <section ref={ref} className="hero">
      <div className="tessellation" />
      <div className="hero-visual">
        <Hero3D />
      </div>
      <Dust count={80} />
      <motion.div className="hero-copy" style={{ opacity: fade, y: lift }}>
        <motion.div className="chip hero-chip" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}>
          <span className="live-dot" /> Graduation airdrops · vibe/vibe · Robinhood Chain
        </motion.div>
        <Words as="h1" className="display hero-title" text="Airdrops for the ones who *stay.*" delay={0.2} />
        <motion.p className="lead hero-lead" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: EASE, delay: 0.8 }}>
          Scout reads every opted-in wallet: what it held, what it dumped, and whether it&apos;s one person behind many. Creators set
          the rules, see who gets what and why, and every drop teaches the next.
        </motion.p>
        <motion.div className="decode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 1.1 }}>
          <span className="faint mono tiny decode-label">LIVE READ</span>
          <Scramble lines={lines} className="mono decode-line" />
        </motion.div>
        <motion.div className="row hero-ctas" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: EASE, delay: 1.2 }}>
          <Magnetic>
            <Link href="/builder" className="btn primary lg">
              Build a policy <span className="arrow">→</span>
            </Link>
          </Magnetic>
          <Magnetic>
            <Link href="/join" className="btn lg">
              Opt in your wallet
            </Link>
          </Magnetic>
        </motion.div>
      </motion.div>
      <div className="hero-floor" aria-hidden />
    </section>
  );
}

/** Full-bleed hairline band of live numbers. */
export function StatsBand({ stats }: { stats: HomeStats }) {
  const tiles: [string, number, string][] = [
    ['Opted-in profiles', stats.profiles, ''],
    ['Launches indexed', stats.launches, ''],
    ['Graduated', stats.graduated, ''],
    ['Scout drops tracked', stats.scoutDrops, ''],
    ['Of the slice to farms', 0, '%'],
  ];
  return (
    <div className="stats-band">
      <div className="wrap stats-band-grid">
        {tiles.map(([l, n, suffix], i) => (
          <motion.div key={l} className="stat" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 1.3 + i * 0.08 }}>
            <div className="n chrome">
              <CountUp value={n} suffix={suffix} onMount delay={1.4} />
            </div>
            <div className="l">{l}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Problem + pillars
 * --------------------------------------------------------------------------------------------- */

const PILLARS = [
  {
    k: '01',
    title: 'Explainable, to the decimal',
    body: 'Every score breaks into reasons that add up to it. Creators see exactly why a wallet made the list, and wallets see what would move them.',
    glyph: 'explain',
  },
  {
    k: '02',
    title: 'One person, one allocation',
    body: 'Shared funders and copy-paste trading reveal wallet farms. Declared alts share a cap without a penalty; the creator’s own cluster never qualifies.',
    glyph: 'sybil',
  },
  {
    k: '03',
    title: 'Drops with a memory',
    body: 'Scout watches every airdrop at 1h, 24h, 7d and 30d. Holding raises your next score; dumping follows you. Behaviour compounds.',
    glyph: 'memory',
  },
] as const;

function Glyph({ kind }: { kind: (typeof PILLARS)[number]['glyph'] }) {
  if (kind === 'explain')
    return (
      <svg viewBox="0 0 120 80" className="glyph">
        {[0.82, 0.55, 0.38, -0.3].map((v, i) => (
          <motion.rect
            key={i}
            x={v >= 0 ? 60 : 60 + v * 56}
            y={10 + i * 16}
            height={8}
            rx={4}
            fill={v >= 0 ? 'url(#g-pos)' : 'url(#g-neg)'}
            initial={{ width: 0 }}
            whileInView={{ width: Math.abs(v) * 56 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: EASE, delay: 0.2 + i * 0.12 }}
          />
        ))}
        <line x1="60" x2="60" y1="4" y2="76" stroke="rgba(255,255,255,.25)" />
        <defs>
          <linearGradient id="g-pos" x1="0" x2="1">
            <stop offset="0" stopColor="#d6dbe1" />
            <stop offset="1" stopColor="#eef1f4" />
          </linearGradient>
          <linearGradient id="g-neg" x1="1" x2="0">
            <stop offset="0" stopColor="#c76a7c" />
            <stop offset="1" stopColor="#f08a9c" />
          </linearGradient>
        </defs>
      </svg>
    );
  if (kind === 'sybil')
    return (
      <svg viewBox="0 0 120 80" className="glyph">
        {[
          [20, 20],
          [34, 56],
          [52, 30],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="#8fe3c0" />
        ))}
        {[
          [84, 22],
          [100, 34],
          [92, 52],
          [76, 46],
          [104, 60],
        ].map(([x, y], i, all) => (
          <g key={i}>
            {i > 0 && <DrawPath d={`M${all[0]![0]} ${all[0]![1]} L${x} ${y}`} stroke="rgba(240,138,156,.6)" strokeWidth="1" delay={0.3 + i * 0.1} />}
            <circle cx={x} cy={y} r="4" fill="#f08a9c" />
          </g>
        ))}
        <circle cx="90" cy="42" r="26" fill="none" stroke="rgba(240,138,156,.35)" strokeDasharray="3 4" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 80" className="glyph">
      <DrawPath d="M6 20 C 30 18, 40 22, 60 26 S 96 30, 114 32" stroke="#8fe3c0" strokeWidth="2" fill="none" />
      <DrawPath d="M6 20 C 18 60, 30 66, 60 68 S 100 70, 114 70" stroke="#f08a9c" strokeWidth="2" fill="none" delay={0.3} />
      {[6, 42, 78, 114].map((x, i) => (
        <line key={i} x1={x} x2={x} y1="8" y2="76" stroke="rgba(255,255,255,.08)" />
      ))}
    </svg>
  );
}

export function Pillars() {
  return (
    <section className="section">
      <Reveal>
        <div className="kicker">The problem</div>
      </Reveal>
      <Words
        as="h2"
        className="display problem-title"
        text="Most graduation airdrops land in wallets that *sell within the hour.*"
      />
      <Reveal delay={0.2}>
        <p className="lead">
          vibe/vibe lets creators airdrop part of the supply at graduation to curate a community. Sent blind, it goes to bots, farms
          and the creator&apos;s friends, and the chart pays for it. Scout makes the send honest.
        </p>
      </Reveal>
      <Stagger className="bento cols-3 pillars">
        {PILLARS.map((p) => (
          <Item key={p.k} className="pillar">
            <span className="mono tiny faint">{p.k}</span>
            <Glyph kind={p.glyph} />
            <h3 className="display">{p.title}</h3>
            <p className="muted small">{p.body}</p>
          </Item>
        ))}
      </Stagger>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The formula
 * --------------------------------------------------------------------------------------------- */

const TERMS = [
  { sym: 'H', w: 'α', name: 'Hold quality', sign: '+', body: 'How much of past airdrops and graduated positions the wallet kept, weighted toward recent behaviour.' },
  { sym: 'Q', w: 'β', name: 'Market quality', sign: '+', body: 'Trades utility, RWA and vibe-coded launches, and fits this launch’s lane and stock pair.' },
  { sym: 'A', w: 'γ', name: 'Alignment', sign: '+', body: 'SPARK tier, a charged Vibe Viber, guild standing and products shipped. A flagged rug subtracts.' },
  { sym: 'D', w: 'δ', name: 'Dump score', sign: '−', body: 'How fast past drops were sold, the first hour weighing most. One sin fades; a habit doesn’t.' },
  { sym: 'Y', w: 'ε', name: 'Sybil penalty', sign: '−', body: 'Part of an undeclared cluster of wallets that share a funder or trade identically.' },
];

export function Formula() {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <section className="section formula">
      <Reveal>
        <div className="kicker">The score</div>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="formula-line display" onMouseLeave={() => setHover(null)}>
          <span className="faint">S =</span>
          {TERMS.map((t, i) => (
            <span key={t.sym} className={`term ${hover === null || hover === i ? '' : 'dim'}`} onMouseEnter={() => setHover(i)}>
              {i > 0 && <span className="faint op">{t.sign}</span>}
              {i === 0 && t.sign === '−' && <span className="faint op">−</span>}
              <span className="w">{t.w}</span>
              <span className={t.sign === '+' ? 'text-iris' : 'neg-glow'}>{t.sym}</span>
            </span>
          ))}
        </div>
      </Reveal>
      <Stagger className="bento cols-5 terms" gap={0.06}>
        {TERMS.map((t, i) => (
          <Item key={t.sym} className={`term-card ${hover === i ? 'is-hot' : ''}`}>
            <div onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className={`term-sym display ${t.sign === '+' ? 'text-iris' : 'neg-glow'}`}>{t.sym}</div>
              <h3>{t.name}</h3>
              <p className="muted small">{t.body}</p>
            </div>
          </Item>
        ))}
      </Stagger>
      <Reveal delay={0.2}>
        <p className="muted small" style={{ marginTop: 18 }}>
          Weights are published per template, every component is in the reasons, and the config is versioned and hashed into every
          allocation. No black box.
        </p>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Proof: the simulated evaluation
 * --------------------------------------------------------------------------------------------- */

const PERSONAS = [
  ['Builders', 0.501, 12.0],
  ['Diamond hands', 0.474, 40.9],
  ['Stock-pair traders', 0.393, 17.7],
  ['Whales', 0.34, 6.2],
  ['Newcomers', 0.25, 12.7],
  ['Trenchers', 0.221, 8.0],
  ['Serial dumpers', -0.137, 2.5],
  ['Ruggers', -0.226, 0],
  ['Sybil farms', -0.89, 0],
] as const;

export function Proof() {
  return (
    <section className="section">
      <div className="split proof">
        <div>
          <Reveal>
            <div className="kicker">Proof</div>
          </Reveal>
          <Words as="h2" className="display" text="Farms get *nothing.* Holders get most." />
          <Reveal delay={0.15}>
            <p className="lead">
              Before real data, Scout was tested against a simulated vibe/vibe world: 450 wallets with known behaviour, 80 launches,
              997 airdrops measured from raw transfers, and four sybil farms built three different ways.
            </p>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="grid cols-2" style={{ marginTop: 28 }}>
              <div className="glass pad r-xl stat">
                <div className="n text-iris">
                  <CountUp value={0} suffix="%" />
                </div>
                <div className="l">of the slice to any sybil farm</div>
              </div>
              <div className="glass pad r-xl stat">
                <div className="n">
                  <CountUp value={0} />
                  <span className="faint"> / 336</span>
                </div>
                <div className="l">honest wallets wrongly flagged</div>
              </div>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div className="glass pad r-xl">
            <div className="row between tiny faint mono" style={{ marginBottom: 14 }}>
              <span>MEAN SCORE BY PERSONA</span>
              <span>SHARE OF AIRDROP</span>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              {PERSONAS.map(([name, score, share], i) => (
                <div key={name} className="persona-row">
                  <span className="small">{name}</span>
                  <div className="persona-axis">
                    <motion.span
                      className={score < 0 ? 'neg' : 'pos'}
                      style={{ [score < 0 ? 'right' : 'left']: '50%' }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.min(Math.abs(score), 1) * 50}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.3, ease: EASE, delay: 0.1 + i * 0.06 }}
                    />
                  </div>
                  <span className={`mono small tnum ${share === 0 ? 'neg' : ''}`} style={{ textAlign: 'right' }}>
                    {share.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="tiny faint" style={{ marginTop: 16 }}>
              Simulated world, seed 42, Custom template. Reproduce with <code>pnpm scout evaluate</code>.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Featured aftermath + final CTA
 * --------------------------------------------------------------------------------------------- */

export interface FeaturedAftermath {
  launch: { id: string; lane: string; pairClass: string };
  recipients: number;
  windows: { window: string; measured: number; retained: number; held: number; trimmed: number; mostlySold: number; dumped: number }[];
}

export function Featured({ data }: { data?: FeaturedAftermath }) {
  if (!data) return null;
  const label: Record<string, string> = { h1: '1 hour', h24: '24 hours', d7: '7 days', d30: '30 days' };
  return (
    <section className="section">
      <div className="row between" style={{ alignItems: 'end' }}>
        <div>
          <Reveal>
            <div className="kicker">Aftermath, live</div>
          </Reveal>
          <Words as="h2" className="display" text="Every drop gets a *public* report card." />
        </div>
        <Reveal delay={0.2}>
          <Link href={`/launches/${data.launch.id}`} className="btn">
            Open {data.launch.id} <span className="arrow">→</span>
          </Link>
        </Reveal>
      </div>
      <Stagger className="grid cols-4 section-grid" gap={0.08}>
        {data.windows.map((w) => (
          <Item key={w.window}>
            <Tilt className="h100">
              <div className="glass pad r-xl h100">
                <div className="small muted">After {label[w.window]}</div>
                {w.measured ? (
                  <>
                    <div className="stat" style={{ margin: '10px 0 16px' }}>
                      <div className="n">
                        <CountUp value={Math.round(w.retained * 1000) / 10} decimals={1} suffix="%" />
                      </div>
                      <div className="l">still held · {w.measured} wallets</div>
                    </div>
                    <div className="stackbar">
                      {(
                        [
                          ['held', 'seg-held'],
                          ['trimmed', 'seg-trimmed'],
                          ['mostlySold', 'seg-mostly'],
                          ['dumped', 'seg-dumped'],
                        ] as const
                      ).map(([k, c], i) =>
                        w[k] ? (
                          <motion.span
                            key={k}
                            className={c}
                            initial={{ flexGrow: 0.001 }}
                            whileInView={{ flexGrow: w[k] }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.2, ease: EASE, delay: 0.2 + i * 0.06 }}
                          />
                        ) : null,
                      )}
                    </div>
                  </>
                ) : (
                  <div className="faint" style={{ marginTop: 14 }}>
                    pending
                  </div>
                )}
              </div>
            </Tilt>
          </Item>
        ))}
      </Stagger>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="section">
      <Reveal>
        <div className="glass r-xl final-cta">
          <div className="tessellation" />
          <div className="final-glow" aria-hidden />
          <div className="kicker">For creators and holders</div>
          <Words as="h2" className="display" text="Curate a *community,* not a dump." />
          <p className="lead" style={{ marginInline: 'auto' }}>
            Design a policy in minutes, verify it on-chain with ScoutDrop, and watch the aftermath prove it worked.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 30 }}>
            <Magnetic>
              <Link href="/builder" className="btn primary lg">
                Open the builder <span className="arrow">→</span>
              </Link>
            </Magnetic>
            <Magnetic>
              <Link href="/launches" className="btn lg">
                Browse launches
              </Link>
            </Magnetic>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
