'use client';

import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades, lifts and un-blurs its children when they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(10px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 1, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

/** Staggers direct children of a list into view. */
export function Stagger({ children, className, gap = 0.07 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -6% 0px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export const item = {
  hidden: { opacity: 0, y: 22, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE }, transitionEnd: { filter: 'none' } },
};

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/**
 * A headline that rises word by word out of a soft blur.
 * Words wrapped in *asterisks* are set in italic iris gradient.
 */
export function Words({ text, className, delay = 0, as = 'h1' }: { text: string; className?: string; delay?: number; as?: 'h1' | 'h2' }) {
  const Tag = motion[as];
  // Split into words, remembering which fall inside a *...* span (which may cover several words).
  let inside = false;
  const words = text.split(' ').map((raw) => {
    const opens = raw.startsWith('*');
    const closes = /\*[.,!?]*$/.test(raw);
    const fancy = inside || opens;
    if (opens) inside = true;
    if (closes) inside = false;
    return { clean: raw.replace(/\*/g, ''), fancy };
  });
  return (
    <Tag className={className} aria-label={text.replace(/\*/g, '')}>
      {words.map(({ clean, fancy }, i) => (
        <span key={i} aria-hidden style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.12em', marginBottom: '-0.12em' }}>
          <motion.span
            style={{ display: 'inline-block', willChange: 'transform' }}
            initial={{ y: '105%', opacity: 0, filter: 'blur(12px)', rotate: 4 }}
            whileInView={{ y: '0%', opacity: 1, filter: 'blur(0px)', rotate: 0, transitionEnd: { filter: 'none' } }}
            viewport={{ once: true }}
            transition={{ duration: 1.1, ease: EASE, delay: delay + i * 0.07 }}
          >
            {fancy ? <em className="text-iris">{clean}</em> : clean}
          </motion.span>
          {i < words.length - 1 ? '\u00a0' : ''}
        </span>
      ))}
    </Tag>
  );
}

/** Counts up to `value` the first time it's seen. */
export function CountUp({
  value,
  decimals = 0,
  suffix = '',
  className,
  onMount = false,
  delay = 0,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  /** Start immediately instead of waiting to scroll into view (for above-the-fold numbers). */
  onMount?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const inView = onMount || seen;
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const controls = animate(0, value, { duration: 1.8, ease: EASE, delay, onUpdate: setShown });
    return () => controls.stop();
  }, [inView, value, reduce, delay]);
  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Pulls its child toward the pointer, then springs back. */
export function Magnetic({ children, strength = 0.28 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.6 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.6 });
  return (
    <motion.div
      ref={ref}
      style={{ x, y, display: 'inline-block' }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Tilts in 3D toward the pointer with a moving glare. */
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 150, damping: 20 });
  const sy = useSpring(py, { stiffness: 150, damping: 20 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  return (
    <div style={{ perspective: 1200 }} className={className}>
      <motion.div
        ref={ref}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d', height: '100%' }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = ref.current!.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          px.set(0.5);
          py.set(0.5);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Infinite horizontal ticker. Pauses on hover. */
export function Marquee({ children, speed = 40 }: { children: ReactNode; speed?: number }) {
  return (
    <div className="marquee" style={{ ['--speed' as string]: `${speed}s` }}>
      <div className="marquee-track">
        <div className="marquee-group">{children}</div>
        <div className="marquee-group" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Animated SVG path that draws itself when visible. */
export function DrawPath(props: React.SVGProps<SVGPathElement> & { delay?: number }) {
  const { delay = 0, ...rest } = props;
  return (
    <motion.path
      {...(rest as object)}
      initial={{ pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.8, ease: EASE, delay }}
    />
  );
}
