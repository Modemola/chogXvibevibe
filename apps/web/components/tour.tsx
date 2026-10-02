'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EASE } from './motion';

/**
 * Guided tour: a self-driving, narrated two-minute walk through the real app,
 * for judges and first-time visitors. Start it from the hero, from ⌘K, or by
 * opening any page with ?tour=1. Touching the scroll wheel pauses it.
 */

interface Targets {
  launchId: string | null;
  holder: string | null;
  dumper: string | null;
}

type Action = { kind: 'top' } | { kind: 'sieve' } | { kind: 'glide'; selector: string; after: number; offset?: number };

interface Step {
  id: string;
  path: string;
  title: string;
  body: string;
  dwell: number;
  action: Action;
}

function buildSteps(t: Targets): Step[] {
  const steps: Step[] = [
    {
      id: 'intro',
      path: '/',
      title: 'Scout, in two minutes.',
      body: 'Graduation airdrops on vibe/vibe tend to land with bots, farms and fast sellers. Scout decides who should get them, shows why, and remembers what they did.',
      dwell: 8000,
      action: { kind: 'top' },
    },
    {
      id: 'sieve',
      path: '/',
      title: 'How it works.',
      body: 'Wallets arrive. Farms fall away. Survivors become a Merkle tree. Then the drop remembers who held.',
      dwell: 17000,
      action: { kind: 'sieve' },
    },
  ];
  if (t.launchId) {
    steps.push({
      id: 'builder',
      path: `/builder?launch=${encodeURIComponent(t.launchId)}&template=hold_or_die`,
      title: 'Creators design the drop.',
      body: 'Pick a template or write filters. Every change re-resolves against every opted-in wallet, with amounts, caps and reasons, live.',
      dwell: 11000,
      action: { kind: 'glide', selector: '.preview', after: 3200, offset: -110 },
    });
  }
  if (t.holder) {
    steps.push({
      id: 'holder',
      path: `/profile/${t.holder}?template=hold_or_die`,
      title: 'Every score explains itself.',
      body: 'This wallet held its past airdrops. Each line is one term of the score, and together they add up to it.',
      dwell: 9500,
      action: { kind: 'glide', selector: 'table', after: 3000, offset: -220 },
    });
  }
  if (t.dumper) {
    steps.push({
      id: 'dumper',
      path: `/profile/${t.dumper}?template=hold_or_die`,
      title: 'Dumping follows you.',
      body: 'This one sold within the hour. Same formula, opposite verdict, and the reasons say exactly why.',
      dwell: 8500,
      action: { kind: 'glide', selector: 'table', after: 2800, offset: -220 },
    });
  }
  if (t.launchId) {
    steps.push({
      id: 'aftermath',
      path: `/launches/${encodeURIComponent(t.launchId)}`,
      title: 'Every drop gets a public report card.',
      body: 'At 1h, 24h, 7d and 30d Scout measures, from on-chain transfers alone, who held, trimmed or dumped. That history becomes the next score.',
      dwell: 10500,
      action: { kind: 'glide', selector: '.curve', after: 3500, offset: -260 },
    });
  }
  steps.push({
    id: 'end',
    path: '/',
    title: 'Curate a community, not a dump.',
    body: 'Opt in, design a policy, and verify the drop on-chain with ScoutDrop.',
    dwell: 0,
    action: { kind: 'glide', selector: '.final-cta', after: 600, offset: -140 },
  });
  return steps;
}

const KEY = 'scout-tour';

interface TourState {
  active: boolean;
  step: number;
  playing: boolean;
}

const TourContext = createContext<{ start: () => void }>({ start: () => {} });
export const useTour = () => useContext(TourContext);

type LenisLike = { scrollTo: (target: number, opts?: { duration?: number; easing?: (t: number) => number; immediate?: boolean }) => void };

/** Scroll the page to y over `ms`, via Lenis when it's running. */
function glide(y: number, ms: number, linear = false) {
  const target = Math.max(0, y);
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  const easing = linear ? (t: number) => t : (t: number) => 1 - Math.pow(1 - t, 3);
  if (lenis) {
    lenis.scrollTo(target, { duration: ms / 1000, easing });
    return;
  }
  const from = window.scrollY;
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    window.scrollTo(0, from + (target - from) * easing(p));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function waitFor(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el || performance.now() - t0 > timeout) resolve(el);
      else setTimeout(tick, 120);
    };
    tick();
  });
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<TourState>({ active: false, step: 0, playing: true });
  const [targets, setTargets] = useState<Targets | null>(null);
  // Elapsed time is tagged with its step, so a late frame from the previous step can't leak into the next.
  const elapsed = useRef({ step: -1, ms: 0 });
  const bar = useRef<HTMLElement>(null);
  const programmatic = useRef(0); // timestamp until which scrolls are ours, not the user's
  const ranFor = useRef<string>('');

  const steps = useMemo(() => buildSteps(targets ?? { launchId: null, holder: null, dumper: null }), [targets]);
  const step = steps[Math.min(state.step, steps.length - 1)]!;

  const save = useCallback((s: TourState) => {
    setState(s);
    try {
      if (s.active) sessionStorage.setItem(KEY, JSON.stringify(s));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: the tour still runs for this page */
    }
  }, []);

  const start = useCallback(() => {
    ranFor.current = '';
    elapsed.current = { step: -1, ms: 0 };
    save({ active: true, step: 0, playing: true });
  }, [save]);

  // Restore across navigations, or start from ?tour=1.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setState(JSON.parse(saved) as TourState);
    } catch {
      /* ignore */
    }
    if (new URLSearchParams(window.location.search).get('tour') === '1') start();
  }, [start]);

  // Load who to show once the tour is on.
  useEffect(() => {
    if (!state.active || targets) return;
    fetch('/api/tour')
      .then((r) => (r.ok ? r.json() : { launchId: null, holder: null, dumper: null }))
      .then(setTargets)
      .catch(() => setTargets({ launchId: null, holder: null, dumper: null }));
  }, [state.active, targets]);

  const go = useCallback(
    (to: number) => {
      ranFor.current = '';
      elapsed.current = { step: -1, ms: 0 };
      if (to < 0) return;
      if (to >= steps.length) return save({ ...state, active: false });
      save({ ...state, step: to, playing: true });
    },
    [save, state, steps.length],
  );

  // Navigate to the step's page, then run its camera move.
  useEffect(() => {
    if (!state.active || !targets) return;
    const want = step.path.split('?')[0]!;
    if (decodeURIComponent(pathname) !== decodeURIComponent(want)) {
      router.push(step.path);
      return;
    }
    const key = `${state.step}:${pathname}`;
    if (ranFor.current === key) return;
    ranFor.current = key;
    const a = step.action;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ours = (ms: number) => (programmatic.current = performance.now() + ms + 400);
    if (a.kind === 'top') {
      ours(1200);
      glide(0, 1200);
    } else if (a.kind === 'sieve') {
      waitFor('.sieve').then((el) => {
        if (!el) return;
        const top = (el as HTMLElement).getBoundingClientRect().top + window.scrollY;
        const end = top + (el as HTMLElement).offsetHeight - window.innerHeight;
        ours(1400);
        glide(top, 1400);
        timers.push(
          setTimeout(() => {
            const ms = step.dwell - 2600;
            ours(ms);
            glide(end, ms, true);
          }, 1500),
        );
      });
    } else {
      timers.push(
        setTimeout(() => {
          waitFor(a.selector).then((el) => {
            if (!el) return;
            const y = el.getBoundingClientRect().top + window.scrollY + (a.offset ?? 0);
            ours(1800);
            glide(y, 1800);
          });
        }, a.after),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [state.active, state.step, targets, pathname, step, router]);

  // The clock: a timeout advances the step; the progress bar is painted directly, so the app never re-renders per frame.
  useEffect(() => {
    if (!state.active || !state.playing || !targets || step.dwell === 0) return;
    if (decodeURIComponent(pathname) !== decodeURIComponent(step.path.split('?')[0]!)) return;
    const startedAt = performance.now();
    const stepNo = state.step;
    const base = elapsed.current.step === stepNo ? elapsed.current.ms : 0;
    const timer = setTimeout(() => go(state.step + 1), Math.max(0, step.dwell - base));
    let raf = 0;
    const paint = (now: number) => {
      const ms = Math.min(step.dwell, base + (now - startedAt));
      elapsed.current = { step: stepNo, ms };
      if (bar.current) bar.current.style.transform = `scaleX(${ms / step.dwell})`;
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [state.active, state.playing, state.step, targets, step, pathname, go]);

  // A human touching the page pauses the tour; keyboard controls it.
  useEffect(() => {
    if (!state.active) return;
    const userScroll = () => {
      if (performance.now() > programmatic.current && state.playing) save({ ...state, playing: false });
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape') save({ ...state, active: false });
      else if (e.key === 'ArrowRight') go(state.step + 1);
      else if (e.key === 'ArrowLeft') go(state.step - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        save({ ...state, playing: !state.playing });
      }
    };
    window.addEventListener('wheel', userScroll, { passive: true });
    window.addEventListener('touchmove', userScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', userScroll);
      window.removeEventListener('touchmove', userScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, [state, save, go]);

  const isLast = state.step >= steps.length - 1;

  return (
    <TourContext.Provider value={{ start }}>
      {children}
      <AnimatePresence>
        {state.active && (
          <motion.aside
            key="tour"
            className="tour glass"
            role="dialog"
            aria-label="Guided tour"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <div className="row between">
              <span className="kicker">
                Guided tour · {String(Math.min(state.step, steps.length - 1) + 1).padStart(2, '0')}/{String(steps.length).padStart(2, '0')}
              </span>
              <div className="row tour-controls">
                <button className="icon-btn" onClick={() => go(state.step - 1)} disabled={state.step === 0} aria-label="Previous step">
                  ‹
                </button>
                {!isLast && (
                  <button className="icon-btn" onClick={() => save({ ...state, playing: !state.playing })} aria-label={state.playing ? 'Pause tour' : 'Play tour'}>
                    {state.playing ? '❚❚' : '▶'}
                  </button>
                )}
                {!isLast && (
                  <button className="icon-btn" onClick={() => go(state.step + 1)} aria-label="Next step">
                    ›
                  </button>
                )}
                <button className="icon-btn" onClick={() => save({ ...state, active: false })} aria-label="End tour">
                  ×
                </button>
              </div>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <h3 className="display tour-title">{step.title}</h3>
                <p className="muted small tour-body">{step.body}</p>
                {!state.playing && !isLast && <p className="faint tiny">Paused. Press ▶ or space to continue.</p>}
                {isLast && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <Link href="/builder" className="btn primary sm" onClick={() => save({ ...state, active: false })}>
                      Build a policy <span className="arrow">→</span>
                    </Link>
                    <button className="btn sm" onClick={start}>
                      Replay tour
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="tour-progress" aria-hidden>
              {steps.map((s, i) => (
                <span key={s.id}>
                  <i
                    ref={i === state.step ? (bar as React.RefObject<HTMLElement>) : undefined}
                    style={{ transform: `scaleX(${i < state.step || (i === state.step && step.dwell === 0) ? 1 : 0})` }}
                  />
                </span>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </TourContext.Provider>
  );
}

/** "Watch the 2-minute tour" trigger. */
export function TourButton({ className = 'btn lg' }: { className?: string }) {
  const { start } = useTour();
  return (
    <button className={className} onClick={start}>
      <span className="tour-play" aria-hidden>
        ▶
      </span>
      Watch the 2-min tour
    </button>
  );
}
