import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { motionTransition } from '@/lib/motion';

interface AnimatedTabIndicatorProps {
  layoutId: string;
  className?: string;
}

export function AnimatedTabIndicator({ layoutId, className }: AnimatedTabIndicatorProps) {
  return (
    <motion.span
      aria-hidden="true"
      layoutId={layoutId}
      className={cn('absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary', className)}
      transition={motionTransition.spring}
    />
  );
}
