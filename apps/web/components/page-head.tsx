'use client';

import type { ReactNode } from 'react';
import { EASE, Words } from './motion';
import { motion } from 'motion/react';

/** Kicker + serif headline (word reveal) + lead, used at the top of every inner page. */
export function PageHead({ kicker, title, lead, aside }: { kicker: ReactNode; title: string; lead?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="row between" style={{ alignItems: 'end', gap: 24 }}>
        <div style={{ minWidth: 0, flex: '1 1 520px' }}>
          <motion.div className="kicker" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: EASE }}>
            {kicker}
          </motion.div>
          <Words as="h1" className="display page-title" text={title} delay={0.05} />
          {lead && (
            <motion.p className="lead" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}>
              {lead}
            </motion.p>
          )}
        </div>
        {aside && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.45 }}>
            {aside}
          </motion.div>
        )}
      </div>
    </header>
  );
}
