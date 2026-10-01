'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const HeroScene = dynamic(() => import('./HeroScene'), { ssr: false, loading: () => <OrbFallback /> });

/** A CSS-only glass orb, for no-WebGL, reduced motion, and while the 3D scene loads. */
export function OrbFallback() {
  return (
    <div className="orb-fallback" aria-hidden>
      <div className="orb-core" />
      <div className="orb-ring r1" />
      <div className="orb-ring r2" />
      <div className="orb-ring r3" />
    </div>
  );
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Hero3D() {
  const [mode, setMode] = useState<'pending' | '3d' | 'css'>('pending');
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setMode(!reduce && webglAvailable() ? '3d' : 'css');
  }, []);
  if (mode === '3d') return <HeroScene />;
  return <OrbFallback />;
}
