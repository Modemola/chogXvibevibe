import type { CSSProperties, ReactNode } from 'react';
import { C, F, clamp, expoOut, ramp } from '../theme';

/** Splits "plain *italic phrase* plain" into words, remembering which are inside *…*. */
function parse(text: string) {
  const out: { word: string; em: boolean }[] = [];
  let em = false;
  for (const raw of text.split(' ')) {
    let w = raw;
    const opens = w.startsWith('*');
    if (opens) {
      em = true;
      w = w.slice(1);
    }
    const closes = w.endsWith('*');
    if (closes) w = w.slice(0, -1);
    out.push({ word: w, em });
    if (closes) em = false;
  }
  return out;
}

/**
 * Headline that rises word by word out of a soft blur. Italic words (*like this*) are set in
 * the serif italic with the chrome gradient, as on the website.
 */
export function Headline({
  text,
  t,
  at,
  size,
  stagger = 0.09,
  dur = 1.1,
  out,
  align = 'left',
  style,
  color = C.ink,
}: {
  text: string;
  t: number;
  at: number;
  size: number;
  stagger?: number;
  dur?: number;
  out?: number;
  align?: 'left' | 'center';
  style?: CSSProperties;
  color?: string;
}) {
  const words = parse(text);
  const leave = out === undefined ? 0 : ramp(t, out, out + 0.7);
  return (
    <div
      style={{
        fontFamily: F.serif,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: '-0.015em',
        color,
        textAlign: align,
        opacity: 1 - leave,
        transform: `translateY(${-leave * size * 0.12}px)`,
        filter: leave > 0 ? `blur(${leave * 8}px)` : undefined,
        ...style,
      }}
    >
      {words.map(({ word, em }, i) => {
        const k = ramp(t, at + i * stagger, at + i * stagger + dur, expoOut);
        return (
          <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
            <span
              style={{
                display: 'inline-block',
                opacity: clamp(k * 1.4),
                transform: `translateY(${(1 - k) * size * 0.32}px)`,
                filter: k < 1 ? `blur(${(1 - k) * 14}px)` : undefined,
                fontStyle: em ? 'italic' : 'normal',
                ...(em
                  ? {
                      backgroundImage: C.chromeX,
                      backgroundSize: '220% 100%',
                      backgroundPosition: `${(1 - k) * 100}% 0`,
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      paddingRight: '0.04em',
                    }
                  : {}),
              }}
            >
              {word}
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </div>
  );
}

/** Mono eyebrow label with a leading hairline, as on the website. */
export function Kicker({ children, opacity = 1, color = C.steel, size = 28, style }: { children: ReactNode; opacity?: number; color?: string; size?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.6,
        fontFamily: F.mono,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color,
        opacity,
        ...style,
      }}
    >
      <span style={{ width: size * 1.1, height: 1, background: color }} />
      {children}
    </div>
  );
}

/** Body copy that fades and lifts in. */
export function Line({ children, t, at, size = 34, color = C.body, style }: { children: ReactNode; t: number; at: number; size?: number; color?: string; style?: CSSProperties }) {
  const k = ramp(t, at, at + 1.1);
  return (
    <div
      style={{
        fontFamily: F.sans,
        fontWeight: 300,
        fontSize: size,
        lineHeight: 1.4,
        color,
        opacity: k,
        transform: `translateY(${(1 - k) * 18}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Quiet glass panel matching the website's `.glass`. */
export function Glass({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 28,
        border: `1px solid ${C.hair}`,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012) 40%), rgba(9,11,14,0.82)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 40px 80px -50px rgba(0,0,0,0.9)',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -1,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(214,219,225,0.45), transparent)',
        }}
      />
      {children}
    </div>
  );
}
