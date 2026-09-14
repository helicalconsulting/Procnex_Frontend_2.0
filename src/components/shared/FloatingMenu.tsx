import { useRef, useState, useLayoutEffect, useEffect, useCallback, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'bottom-start' | 'bottom-end' | 'bottom' | 'top-start' | 'top-end' | 'top';

export interface FloatingMenuOptions {
  placement?: Placement;
  offset?: number;
  viewportPadding?: number;
  preventFlip?: boolean;
}

export interface FloatingMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  closeOnOutsideClick?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
  role?: string;
  zIndex?: number;
  animation?: 'fade' | 'slide' | 'none';
  width?: string | number;
  minWidth?: string | number;
  placement?: Placement;
  offset?: number;
  preventFlip?: boolean;
  options?: FloatingMenuOptions;
}

function parsePlacement(p: Placement) {
  const parts = p.split('-');
  return { side: parts[0] as 'bottom' | 'top', align: parts[1] as 'start' | 'end' | undefined };
}

export default function FloatingMenu({
  open, onClose, anchorRef, children,
  className = 'floating-menu', style: extraStyle,
  closeOnOutsideClick = true, closeOnEscape = true,
  ariaLabel, role = 'dialog', zIndex,
  animation = 'slide', width, minWidth,
  placement: directPlacement, offset: directOffset, preventFlip: directPreventFlip, options,
}: FloatingMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const posKeyRef = useRef('');

  const effectivePlacement: Placement = options?.placement ?? directPlacement ?? 'bottom-start';
  const effectiveOffset: number = options?.offset ?? directOffset ?? 4;
  const preventFlip: boolean = options?.preventFlip ?? directPreventFlip ?? false;
  const { side, align } = parsePlacement(effectivePlacement);

  const [pos, setPos] = useState<{ top: number; left: number; maxHeight?: number } | null>(null);
  const ready = pos !== null;

  // ── Positioning logic ──────────────────────────────────
  const updatePosition = useCallback(() => {
    if (!open) return;

    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const ar = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth || 0;
    const ph = panel.offsetHeight || 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = options?.viewportPadding ?? 8;

    const spaceBelow = vh - ar.bottom;
    const spaceAbove = ar.top;

    let chosenSide: 'bottom' | 'top' = side;
    if (!preventFlip) {
      if (side === 'bottom' && spaceBelow < 140 && spaceAbove > spaceBelow) {
        chosenSide = 'top';
      } else if (side === 'top' && spaceAbove < 140 && spaceBelow > spaceAbove) {
        chosenSide = 'bottom';
      }
    }

    let top: number;
    let computedMaxHeight: number | undefined = undefined;

    if (chosenSide === 'bottom') {
      top = ar.bottom + effectiveOffset;
      const avail = vh - top - pad;
      if (ph > avail || avail < 280) {
        computedMaxHeight = Math.max(100, avail);
      }
    } else {
      top = ar.top - ph - effectiveOffset;
      if (top < pad) {
        top = pad;
        computedMaxHeight = Math.max(100, ar.top - effectiveOffset - pad);
      }
    }

    let left: number;
    if (align === 'end') left = ar.right - pw;
    else if (align === undefined) left = ar.left + ar.width / 2 - pw / 2;
    else left = ar.left;
    left = Math.max(pad, Math.min(left, vw - pw - pad));

    const key = `${Math.round(top)}_${Math.round(left)}_${computedMaxHeight ? Math.round(computedMaxHeight) : 'auto'}`;
    if (key !== posKeyRef.current) {
      posKeyRef.current = key;
      setPos({ top, left, maxHeight: computedMaxHeight });
    }
  }, [open, anchorRef, effectiveOffset, preventFlip, side, align, options?.viewportPadding]);

  // ── SYNCHRONOUS positioning before browser paint ────────
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      posKeyRef.current = '';
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  // ── Recompute on scroll / resize ─────────────────────────
  useEffect(() => {
    if (!open) return;
    let raf: number;

    const onScroll = (e: Event) => {
      // Ignore scroll events coming from inside the dropdown panel itself!
      if (panelRef.current && panelRef.current.contains(e.target as Node)) {
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updatePosition();
      });
    };

    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updatePosition();
      });
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  // ── Close on outside click ───────────────────────────────
  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t) && anchorRef.current && !anchorRef.current.contains(t)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, closeOnOutsideClick, anchorRef]);

  // ── Close on Escape ──────────────────────────────────────
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, closeOnEscape]);

  if (!open) return null;

  // ── Build styles ─────────────────────────────────────────
  const s: React.CSSProperties = {
    position: 'fixed',
    zIndex: zIndex ?? 999999,
    maxHeight: '80vh',
    opacity: ready ? 1 : 0,
    pointerEvents: ready ? 'auto' : 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    background: 'var(--surface-card)',
  };

  if (width !== undefined) s.width = typeof width === 'number' ? `${width}px` : width;
  if (minWidth !== undefined) s.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;

  if (pos) {
    s.top = pos.top;
    s.left = pos.left;
    if (pos.maxHeight !== undefined) {
      s.maxHeight = `${pos.maxHeight}px`;
      s.overflowY = 'auto';
    }
  }

  if (animation !== 'none' && ready) {
    s.animation = `fi 0.15s cubic-bezier(0.32, 0.72, 0, 1)`;
    s.transformOrigin = side === 'top' ? 'bottom' : 'top';
  }

  if (extraStyle) Object.assign(s, extraStyle);

  return createPortal(
    <div ref={panelRef} className={className} style={s} role={role} aria-label={ariaLabel}
      onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

// ─── Keyframes ─────────────────────────────────────────────
let injected = false;
function injectKF() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const st = document.createElement('style');
  st.textContent = `@keyframes fi{from{opacity:0;transform:translateY(-4px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`;
  document.head.appendChild(st);
}
injectKF();

