import { useEffect, useRef, type RefObject } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';

/** Focus containment and restoration for the vendor's window-style dialogs. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useBodyScrollLock(active);
  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    // Restoring a minimized window must retain its original external trigger.
    if (focused && !panel?.contains(focused)) returnFocusRef.current = focused;
    panel?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab' || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    panel?.addEventListener('keydown', handler);
    return () => { panel?.removeEventListener('keydown', handler); if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus(); };
  }, [active, ref]);
}
