'use client';

import { motion, useMotionValueEvent, useScroll } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BrandMark } from './brand';
import { CommandPalette } from './command';

const LINKS = [
  { href: '/builder', label: 'Policy builder' },
  { href: '/launches', label: 'Launches' },
  { href: '/join', label: 'Join' },
];

export function Nav() {
  const path = usePathname();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    setHidden(y > 240 && y > prev + 4);
  });
  const active = LINKS.find((l) => path === l.href || path.startsWith(`${l.href}/`))?.href;

  return (
    <motion.header
      className="nav-shell"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: hidden ? -90 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <nav className={`nav glass ${scrolled ? 'is-scrolled' : ''}`} aria-label="Main">
        <Link href="/" className="nav-brand" aria-label="Graduation Scout home">
          <BrandMark />
          <span>
            Graduation <em>Scout</em>
          </span>
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link ${active === l.href ? 'is-active' : ''}`}>
              {active === l.href && (
                <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
              )}
              <span className="nav-label">{l.label}</span>
            </Link>
          ))}
        </div>
        <CommandPalette />
      </nav>
    </motion.header>
  );
}

/** Thumb-reachable floating bar on phones. */
export function MobileNav() {
  const path = usePathname();
  const links = [{ href: '/', label: 'Home' }, ...LINKS.map((l) => ({ ...l, label: l.label.replace('Policy builder', 'Builder') }))];
  return (
    <nav className="mobile-nav glass" aria-label="Mobile">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={(l.href === '/' ? path === '/' : path.startsWith(l.href)) ? 'is-active' : ''}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
