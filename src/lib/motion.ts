import type { Transition, Variants } from 'motion/react';

export const motionEase = [0.16, 1, 0.3, 1] as const;

export const motionTransition = {
  fast: { duration: 0.14, ease: motionEase },
  standard: { duration: 0.2, ease: motionEase },
  panel: { duration: 0.24, ease: motionEase },
  spring: { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 },
  softSpring: { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 },
} satisfies Record<string, Transition>;

export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: motionTransition.standard },
  exit: { opacity: 0, y: -3, transition: motionTransition.fast },
};

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: motionTransition.softSpring },
  exit: { opacity: 0, x: 10, scale: 0.985, transition: motionTransition.fast },
};

export const toastVariants: Variants = {
  initial: { opacity: 0, x: 24, scale: 0.97 },
  animate: { opacity: 1, x: 0, scale: 1, transition: motionTransition.softSpring },
  exit: { opacity: 0, x: 28, scale: 0.97, transition: motionTransition.fast },
};
