import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { motionTransition } from '@/lib/motion';

interface CollapsibleContentProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleContent({ open, children, className }: CollapsibleContentProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={motionTransition.panel}
          className="overflow-hidden"
        >
          <div className={cn(className)}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
