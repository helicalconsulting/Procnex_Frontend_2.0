import { useRef, useState, useEffect, useLayoutEffect, useCallback, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingMenu, type UseFloatingMenuOptions } from './useFloatingMenu';

// ─── Types ─────────────────────────────────────────────────

export interface FloatingMenuProps {
  /** Whether the menu is open */
  open: boolean;
  /** Callback to close the menu */
  onClose: () => void;
  /** Anchor element ref */
  anchorRef: RefObject<HTMLElement | null>;
  /** Menu content */
  children: ReactNode;
  /** Floating UI options */
  options?: UseFloatingMenuOptions;
  /**
   * CSS class name(s) for the floating element.
   * Default: 'floating-menu'
   */
  className?: string;
  /**
   * Additional inline styles for the floating element.
   * Applied on top of default positioning styles.
   */
  style?: React.CSSProperties;
  /**
   * Whether to close on outside click. Default: true
   */
  closeOnOutsideClick?: boolean;
  /**
   * Whether to close on Escape key. Default: true
   */
  closeOnEscape?: boolean;
  /**
   * Optional aria-label for accessibility
   */
  ariaLabel?: string;
  /**
   * Optional role attribute. Default: 'dialog'
   */
  role?: string;
  /**
   * Z-index override. Default: 9999
   */
  zIndex?: number;
  /**
   * Animation style. 'fade' | 'slide' | 'none'. Default: 'slide'
   */
  animation?: 'fade' | 'slide' | 'none';
  /**
   * Minimum width of the floating element.
   * Can be a CSS value like '240px' or a number.
   */
  minWidth?: string | number;
  /**
   * Width of the floating element.
   * If not provided, inherits from content.
   */
  width?: string | number;
}

// ─── Component ─────────────────────────────────────────────

export default function FloatingMenu({
  open,
  onClose,
  anchorRef,
  children,
  options = {},
  className = 'floating-menu',
  style: extraStyle,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  ariaLabel,
  role = 'dialog',
  zIndex,
  animation = 'slide',
  minWidth,
  width,
}: FloatingMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [refReady, setRefReady] = useState(false);

  const { refs, floatingStyles, isPositioned, placement } = useFloatingMenu<HTMLElement>(
    open,
    {
      ...options,
      autoUpdate: true,
    },
    anchorRef.current,
  );

  // Sync the external anchorRef with Floating UI's reference.
  // IMPORTANT: The reference is synced on EVERY render, NOT just when open.
  // This ensures Floating UI ALWAYS has the correct reference element
  // internally, so when open flips to true, the very first position
  // computation uses the real trigger coordinates — not {top:0, left:0}.
  //
  // Without this, useFloating computes position during the first render
  // with open=true using a null reference → returns {top:0, left:0} →
  // the portal briefly appears at (0,0) before the layout effect syncs
  // the reference and repositions it.
  //
  // refReady gates visibility: the portal stays hidden until both
  // isPositioned AND refReady are true.
  // Run when `open` changes: sync the reference (if not yet set) and flip refReady.
  // The reference is synced on EVERY layout effect run (not just when `open=true`)
  // so Floating UI always has the real trigger element internally. This prevents
  // the initial render from computing position with a null reference → {top:0, left:0}.
  useLayoutEffect(() => {
    if (anchorRef.current) {
      refs.setReference(anchorRef.current);
    }
    setRefReady(open);
  }, [open, anchorRef]);

  // Close on outside click
  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        anchorRef.current && !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    // Use mousedown for faster response
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, closeOnOutsideClick, anchorRef]);

  // Close on Escape
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, closeOnEscape]);

  // Set the floating element ref for Floating UI positioning
  // Using the callback ref setter from Floating UI to avoid bypassing internal state
  const setFloatingRef = useCallback((node: HTMLDivElement | null) => {
    refs.setFloating(node);
    (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [refs.setFloating]);

  // Build animation style — placement-aware direction
  const animationStyle: React.CSSProperties =
    animation !== 'none' && isPositioned
      ? {
          animation: `floatingMenuIn 0.18s cubic-bezier(0.32, 0.72, 0, 1)`,
          transformOrigin: placement.includes('top') ? 'bottom' : placement.includes('bottom') ? 'top' : 'center',
        }
      : {};

  // Merge styles
  const mergedStyle: React.CSSProperties = {
    ...floatingStyles,
    ...animationStyle,
    ...extraStyle,
    ...(zIndex ? { zIndex } : {}),
    ...(minWidth ? { minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth } : {}),
    ...(width ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    // Hide until both Floating UI has positioned AND the reference is synced
    // Prevents initial flash at {top:0, left:0} when Floating UI computes
    // position before the reference is available.
    visibility: isPositioned && refReady ? 'visible' : 'hidden',
    // Apply border-radius and shadow from theme variables
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    background: 'var(--surface-card)',
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={setFloatingRef}
      className={className}
      style={mergedStyle}
      role={role}
      aria-label={ariaLabel}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

// ─── Inject keyframe styles once ───────────────────────────

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatingMenuIn {
      from {
        opacity: 0;
        transform: translateY(-6px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;
  document.head.appendChild(style);
}

// Inject on module load
injectKeyframes();
