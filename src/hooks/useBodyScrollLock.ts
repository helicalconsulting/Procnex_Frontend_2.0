import { useEffect } from 'react';

/**
 * Module-level counter so multiple hooks can coordinate.
 * Only the first lock saves & sets overflow; only the last
 * unlock restores it.
 */
let lockCount = 0;
let savedOverflow = '';

/**
 * Prevents body scrolling while a modal is open.
 *
 * Usage:
 *   useBodyScrollLock(isModalOpen);
 *
 * When `isModalOpen` is true, `document.body.style.overflow` is set to 'hidden'
 * and restored to its previous value when false or on unmount.
 *
 * Multiple hooks can be active simultaneously — they coordinate
 * via a module-level counter so they never trample each other.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (active) {
      lockCount++;
      if (lockCount === 1) {
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
    }

    return () => {
      if (active) {
        lockCount--;
        if (lockCount === 0) {
          document.body.style.overflow = savedOverflow;
        }
      }
    };
  }, [active]);
}
