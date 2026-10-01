'use client';

import { motion } from 'motion/react';
import { EASE } from '@/components/motion';

const SEGMENTS = [
  ['held', 'seg-held', 'Held'],
  ['trimmed', 'seg-trimmed', 'Trimmed'],
  ['mostlySold', 'seg-mostly', 'Mostly sold'],
  ['dumped', 'seg-dumped', 'Dumped'],
] as const;

export function StackBar({ w }: { w: { held: number; trimmed: number; mostlySold: number; dumped: number } }) {
  return (
    <div className="stackbar" role="img" aria-label={SEGMENTS.map(([k, , l]) => `${l} ${w[k]}`).join(', ')}>
      {SEGMENTS.map(([k, cls], i) =>
        w[k] > 0 ? (
          <motion.span
            key={k}
            className={cls}
            initial={{ flexGrow: 0.001 }}
            whileInView={{ flexGrow: w[k] }}
            viewport={{ once: true }}
            transition={{ duration: 1.3, ease: EASE, delay: 0.2 + i * 0.08 }}
          />
        ) : null,
      )}
    </div>
  );
}
