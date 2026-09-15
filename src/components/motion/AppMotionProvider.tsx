import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { motionTransition } from '../../lib/motion';

export function AppMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={motionTransition.standard}>
      {children}
    </MotionConfig>
  );
}
