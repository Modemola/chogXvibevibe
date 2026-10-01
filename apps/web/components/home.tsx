'use client';

import { AnimatePresence, motion, useInView, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { pct, short } from '@/lib/format';
import { CountUp, DrawPath, EASE, Item, Magnetic, Marquee, Reveal, Stagger, Tilt, Words } from './motion';
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

export function Hero({ stats }: { stats: HomeStats }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const lift = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const tiles: [string, number][] = [
    ['Opted-in profiles', stats.profiles],
    ['Launches indexed', stats.launches],
    ['Graduated', stats.graduated],
    ['Scout drops tracked', stats.scoutDrops],
  ];
  return (
    <section ref={ref} className="hero">
      <div className="hero-visual">
        <Hero3D />
      </div>
      <motion.div className="hero-copy" style={{ opacity: fade, y: lift }}>
        <motion.div
          className="chip gold hero-chip"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
        >
          <span className="live-dot" /> Built for vibe/vibe graduations on Robinhood Chain
        </motion.div>
        <Words as="h1" className="display hero-title" text="Send graduation airdrops to people who *stay.*" delay={0.15} />
        <motion.p
          className="lead"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE, delay: 0.75 }}
        >
          Scout scores opted-in wallets on how they held past airdrops, what they trade, and whether they&apos;re one person
          behind many wallets. Creators set the rules, see who gets what and why, and every drop teaches the next one.
        </motion.p>
        <motion.div
          className="row hero-ctas"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE, delay: 0.95 }}
        >
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

      <motion.div
        className="hero-stats glass r-xl"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 1.1 }}
      >
        {tiles.map(([l, n]) => (
          <div key={l} className="stat">
            <div className="n">
              <CountUp value={n} onMount delay={1.2} />
            </div>
            <div className="l">{l}</div>
          </div>
        ))}
      </motion.div>
      <div className="scroll-cue" aria-hidden>
        <span />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Live ticker of real aftermath outcomes
 * --------------------------------------------------------------------------------------------- */

const WINDOW_WORD: Record<string, string> = { h1: '1h', h24: '24h', d7: '7d', d30: '30d' };

export function Ticker({ items }: { items: { launchId: string; wallet: string; window: string; soldBps: number }[] }) {
  if (!items.length) return null;
  return (
    <div className="ticker">
      <Marquee speed={60}>
        {items.map((h, i) => {
          const held = h.soldBps < 1_000;
          return (
            <Link key={i} href={`/launches/${h.launchId}`} className={`ticker-item ${held ? 'is-held' : 'is-dumped'}`}>
              <span className="dot" />
              <span className="mono">{short(h.wallet)}</span>
              <span>{held ? `held ${pct(1 - h.soldBps / 10_000, 0)}` : `dumped ${pct(h.soldBps / 10_000, 0)}`}</span>
              <span className="faint">
                {h.launchId} · {WINDOW_WORD[h.window]}
              </span>
            </Link>
          );
        })}
      </Marquee>
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
            <stop offset="0" stopColor="#9b8cff" />
            <stop offset="1" stopColor="#63e6ff" />
          </linearGradient>
          <linearGradient id="g-neg" x1="1" x2="0">
            <stop offset="0" stopColor="#ff9a6b" />
            <stop offset="1" stopColor="#ff6f8a" />
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
          <circle key={i} cx={x} cy={y} r="4" fill="#72f0b8" />
        ))}
        {[
          [84, 22],
          [100, 34],
          [92, 52],
          [76, 46],
          [104, 60],
        ].map(([x, y], i, all) => (
          <g key={i}>
            {i > 0 && <DrawPath d={`M${all[0]![0]} ${all[0]![1]} L${x} ${y}`} stroke="rgba(255,111,138,.6)" strokeWidth="1" delay={0.3 + i * 0.1} />}
            <circle cx={x} cy={y} r="4" fill="#ff6f8a" />
          </g>
        ))}
        <circle cx="90" cy="42" r="26" fill="none" stroke="rgba(255,111,138,.35)" strokeDasharray="3 4" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 80" className="glyph">
      <DrawPath d="M6 20 C 30 18, 40 22, 60 26 S 96 30, 114 32" stroke="#72f0b8" strokeWidth="2" fill="none" />
      <DrawPath d="M6 20 C 18 60, 30 66, 60 68 S 100 70, 114 70" stroke="#ff6f8a" strokeWidth="2" fill="none" delay={0.3} />
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
      <Stagger className="grid cols-3 pillars">
        {PILLARS.map((p) => (
          <Item key={p.k}>
            <Tilt className="h100">
              <div className="glass pad r-xl pillar">
                <div className="row between">
                  <span className="kicker">{p.k}</span>
                </div>
                <Glyph kind={p.glyph} />
                <h3 className="display">{p.title}</h3>
                <p className="muted small">{p.body}</p>
              </div>
            </Tilt>
          </Item>
        ))}
      </Stagger>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Scrollytelling: how Scout works
 * --------------------------------------------------------------------------------------------- */

const STEPS = [
  {
    k: 'Profiles',
    title: 'Wallets opt in, and alts link up',
    body: 'One signature, no gas. Linking needs both wallets to sign, so nobody can drag a stranger into their cluster. Farms reveal themselves through shared funders and identical trading.',
  },
  {
    k: 'Policy',
    title: 'Creators write the rules',
    body: 'Start from a template or write filters over published fields. Buckets fill in order, caps stop any wallet or cluster from taking too much, and leftovers never go back to the creator.',
  },
  {
    k: 'Resolve',
    title: 'One deterministic list, one Merkle root',
    body: 'Same inputs, same list, byte for byte. Every recipient has reasons; the root and policy hash go on-chain in ScoutDrop, where anyone can verify a claim.',
  },
  {
    k: 'Aftermath',
    title: 'The drop remembers who stayed',
    body: 'Transfers alone tell Scout what each recipient did at 1h, 24h, 7d and 30d. Staking and moving to your own alts aren’t selling. That history is most of the next score.',
  },
];

function StageProfiles() {
  const nodes = [
    [70, 60, 'g'], [150, 40, 'g'], [230, 80, 'g'], [110, 150, 'g'], [260, 170, 'v'], [300, 120, 'v'],
    [60, 230, 'g'], [180, 220, 'g'], [330, 230, 'r'], [370, 200, 'r'], [360, 270, 'r'], [310, 290, 'r'], [390, 250, 'r'],
  ] as const;
  const color = { g: '#72f0b8', v: '#9b8cff', r: '#ff6f8a' };
  return (
    <svg viewBox="0 0 440 330" className="stage-svg">
      <DrawPath d="M260 170 L300 120" stroke="#9b8cff" strokeWidth="1.5" />
      {[[330, 230], [360, 270], [310, 290], [390, 250]].map(([x, y], i) => (
        <DrawPath key={i} d={`M370 200 L${x} ${y}`} stroke="rgba(255,111,138,.55)" strokeWidth="1" delay={0.2 + i * 0.1} />
      ))}
      <motion.circle cx="355" cy="250" r="72" fill="rgba(255,111,138,.05)" stroke="rgba(255,111,138,.4)" strokeDasharray="4 6"
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.2, ease: EASE, delay: 0.4 }} style={{ transformOrigin: '355px 250px' }} />
      {nodes.map(([x, y, c], i) => (
        <motion.g key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.05 }} style={{ transformOrigin: `${x}px ${y}px` }}>
          <circle cx={x} cy={y} r="14" fill={color[c]} opacity="0.12" />
          <circle cx={x} cy={y} r="5.5" fill={color[c]} />
        </motion.g>
      ))}
      <text x="250" y="104" className="stage-label" fill="#c9b8ff">declared alt · no penalty</text>
      <text x="300" y="322" className="stage-label" fill="#ff9db0">farm · one shared cap</text>
    </svg>
  );
}

function StagePolicy() {
  const code = "spark_tier >= 1 AND dump_score < 0.25";
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= code.length ? v : v + 1)), 38);
    return () => clearInterval(id);
  }, []);
  const buckets = [
    ['holders', 50, '#72f0b8'],
    ['spark', 30, '#f3c97a'],
    ['builders', 20, '#9b8cff'],
  ] as const;
  return (
    <div className="stage-policy">
      <div className="code">
        <span className="faint">filter </span>
        <span>{code.slice(0, n)}</span>
        <span className="caret" />
      </div>
      <div className="stack" style={{ gap: 14, marginTop: 26 }}>
        {buckets.map(([id, w, c], i) => (
          <div key={id}>
            <div className="row between small">
              <span className="mono">{id}</span>
              <span className="muted">{w}%</span>
            </div>
            <div className="bar" style={{ height: 10, marginTop: 6 }}>
              <motion.span style={{ background: c, boxShadow: `0 0 18px ${c}` }} initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 1.2, ease: EASE, delay: 0.3 + i * 0.15 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="row small muted" style={{ marginTop: 22 }}>
        <span className="chip">max 0.5% per wallet</span>
        <span className="chip">max 0.8% per cluster</span>
        <span className="chip bad">creator cluster excluded</span>
      </div>
    </div>
  );
}

function StageResolve() {
  const levels = [[220], [120, 320], [70, 170, 270, 370], [45, 95, 145, 195, 245, 295, 345, 395]];
  return (
    <svg viewBox="0 0 440 330" className="stage-svg">
      {levels.slice(0, -1).map((lvl, li) =>
        lvl.map((x, i) =>
          [levels[li + 1]![i * 2]!, levels[li + 1]![i * 2 + 1]!].map((cx, j) => (
            <DrawPath key={`${li}-${i}-${j}`} d={`M${x} ${60 + li * 80} L${cx} ${60 + (li + 1) * 80}`} stroke="rgba(201,184,255,.55)" strokeWidth="1.2" delay={0.9 - li * 0.25} />
          )),
        ),
      )}
      {levels.map((lvl, li) =>
        lvl.map((x, i) => (
          <motion.g key={`${li}-${i}`} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: EASE, delay: 1.1 - li * 0.28 + i * 0.03 }} style={{ transformOrigin: `${x}px ${60 + li * 80}px` }}>
            <rect x={x - (li === 0 ? 30 : 13)} y={52 + li * 80} width={li === 0 ? 60 : 26} height="16" rx="8" fill={li === 0 ? 'url(#root-g)' : li === 3 ? 'rgba(114,240,184,.18)' : 'rgba(155,140,255,.18)'} stroke={li === 3 ? '#72f0b8' : '#9b8cff'} strokeOpacity=".6" />
          </motion.g>
        )),
      )}
      <defs>
        <linearGradient id="root-g" x1="0" x2="1">
          <stop offset="0" stopColor="#f3c97a" />
          <stop offset="1" stopColor="#c9b8ff" />
        </linearGradient>
      </defs>
      <text x="220" y="36" textAnchor="middle" className="stage-label" fill="#ffe2b0">merkle root 0x0974…0cbb → ScoutDrop</text>
      <text x="220" y="320" textAnchor="middle" className="stage-label" fill="#9cffd3">recipients · amount · reasons</text>
    </svg>
  );
}

function StageAftermath() {
  const rows = [
    ['1 hour', [13, 3, 10, 3]],
    ['24 hours', [7, 9, 5, 8]],
    ['7 days', [6, 8, 6, 9]],
    ['30 days', [5, 9, 5, 10]],
  ] as const;
  const cls = ['seg-held', 'seg-trimmed', 'seg-mostly', 'seg-dumped'];
  return (
    <div className="stack" style={{ gap: 22, padding: '8px 4px' }}>
      {rows.map(([label, segs], r) => (
        <div key={label}>
          <div className="row between small" style={{ marginBottom: 8 }}>
            <span>After {label}</span>
            <span className="muted tnum">{Math.round((segs[0] + segs[1] * 0.7 + segs[2] * 0.3) / 29 * 100)}% still held</span>
          </div>
          <div className="stackbar" style={{ height: 14 }}>
            {segs.map((v, i) => (
              <motion.span key={i} className={cls[i]} initial={{ flexGrow: 0.001 }} animate={{ flexGrow: v }} transition={{ duration: 1.2, ease: EASE, delay: 0.15 + r * 0.15 + i * 0.05 }} />
            ))}
          </div>
        </div>
      ))}
      <div className="row tiny muted">
        <span><span className="dot seg-held" /> held</span>
        <span><span className="dot seg-trimmed" /> trimmed</span>
        <span><span className="dot seg-mostly" /> mostly sold</span>
        <span><span className="dot seg-dumped" /> dumped</span>
      </div>
    </div>
  );
}

const STAGES = [StageProfiles, StagePolicy, StageResolve, StageAftermath];

function StoryStep({ index, onActive, step }: { index: number; onActive: (i: number) => void; step: (typeof STEPS)[number] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  return (
    <div ref={ref} className={`story-step ${inView ? 'is-active' : ''}`}>
      <div className="kicker">
        0{index + 1} · {step.k}
      </div>
      <h3 className="display">{step.title}</h3>
      <p className="muted">{step.body}</p>
    </div>
  );
}

export function Story() {
  const [active, setActive] = useState(0);
  const Stage = STAGES[active]!;
  return (
    <section className="section story">
      <Reveal>
        <div className="kicker">How it works</div>
      </Reveal>
      <Words as="h2" className="display" text="From opt-in to *aftermath,* in four moves." />
      <div className="story-grid">
        <div className="story-stage-wrap">
          <div className="story-stage glass r-xl">
            <div className="story-progress">
              {STEPS.map((s, i) => (
                <span key={s.k} className={i <= active ? 'on' : ''} />
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                className="story-stage-inner"
                initial={{ opacity: 0, scale: 0.94, filter: 'blur(14px)', rotateX: 8 }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', rotateX: 0, transitionEnd: { filter: 'none' } }}
                exit={{ opacity: 0, scale: 1.04, filter: 'blur(14px)' }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <Stage />
              </motion.div>
            </AnimatePresence>
            <div className="story-caption mono tiny faint">
              0{active + 1} / 04 · {STEPS[active]!.k}
            </div>
          </div>
        </div>
        <div className="story-steps">
          {STEPS.map((s, i) => (
            <StoryStep key={s.k} index={i} step={s} onActive={setActive} />
          ))}
        </div>
      </div>
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
      <Stagger className="grid cols-5 terms" gap={0.06}>
        {TERMS.map((t, i) => (
          <Item key={t.sym}>
            <div
              className={`glass pad r-xl term-card ${hover === i ? 'is-hot' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
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
