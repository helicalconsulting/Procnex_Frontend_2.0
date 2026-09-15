import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { pageTransitionVariants } from '../../lib/motion';

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="min-w-0"
      variants={pageTransitionVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
