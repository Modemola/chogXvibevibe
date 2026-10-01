'use client';

import { motion } from 'motion/react';

/** Every navigation fades the new page up out of a soft blur. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
      // filter must end as 'none': any filter on an ancestor stops glass from blurring the backdrop.
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
