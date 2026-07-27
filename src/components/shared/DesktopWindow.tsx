import { useState, useRef, useEffect, useCallback, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { Minus, Square, X, Maximize, Minimize2 } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import './DesktopWindow.css';

// ─── Types ──────────────────────────────────────────────────

interface DesktopWindowProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Default width in px */
  defaultWidth?: number;
  /** Default height in px */
  defaultHeight?: number;
  /** Minimum width in px */
  minWidth?: number;
  /** Minimum height in px */
  minHeight?: number;
  /** Reference to restore focus to on close */
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  /** Show unsaved changes confirmation before closing */
  hasUnsavedChanges?: boolean;
  confirmMessage?: string;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

// ─── Focusable selector ─────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ─── Component ──────────────────────────────────────────────

export default function DesktopWindow({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  defaultWidth = 760,
  defaultHeight = 560,
  minWidth = 480,
  minHeight = 320,
  restoreFocusRef,
  hasUnsavedChanges = false,
  minimized = false,
  onMinimize,
  onRestore,
}: DesktopWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);

  // ── Window position & size ──
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: defaultWidth, h: defaultHeight });
  const [maximized, setMaximized] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Store the pre-maximize size/pos for restore
  const preMaxPosRef = useRef({ x: 0, y: 0 });
  const preMaxSizeRef = useRef({ w: defaultWidth, h: defaultHeight });

  // ── Drag state ──
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ sx: 0, sy: 0, px: 0, py: 0 });

  // ── Resize state ──
  const [resizing, setResizing] = useState<{
    edge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  } | null>(null);
  const resizeRef = useRef({
    sx: 0, sy: 0, px: 0, py: 0, pw: 0, ph: 0,
  });

  // ── Animation on open ──
  useEffect(() => {
    if (open && !minimized) {
      setAnimating(true);
      const id = setTimeout(() => setAnimating(false), 300);
      return () => clearTimeout(id);
    }
  }, [open, minimized]);

  // ── Center on mount ──
  useEffect(() => {
    if (!open) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setPos({
      x: Math.max(16, cx - defaultWidth / 2),
      y: Math.max(16, cy - defaultHeight / 2),
    });
    setSize({ w: defaultWidth, h: defaultHeight });
  }, [open, defaultWidth, defaultHeight]);

  // ── Focus element inside body on open (preventing focus on top bar header buttons) ──
  useEffect(() => {
    if (!open || minimized) return;
    const id = setTimeout(() => {
      const el = windowRef.current;
      if (!el) return;
      const bodyEl = el.querySelector<HTMLElement>('.dw-body');
      const firstInBody = bodyEl?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstInBody) {
        firstInBody.focus();
      }
    }, 50);
    return () => clearTimeout(id);
  }, [open, minimized]);

  // ── Focus trap ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      if (e.key === 'Tab') {
        const el = windowRef.current;
        if (!el) return;
        const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasUnsavedChanges],
  );

  // ── Close with confirmation ──
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Discard them?');
      if (!confirmed) return;
    }
    onClose();
    // Restore focus to the trigger button
    setTimeout(() => {
      restoreFocusRef?.current?.focus();
    }, 50);
  }, [hasUnsavedChanges, onClose, restoreFocusRef]);

  // ── Maximize / Restore ──
  const toggleMaximize = useCallback(() => {
    if (maximized) {
      // Restore
      setPos(preMaxPosRef.current);
      setSize(preMaxSizeRef.current);
      setMaximized(false);
    } else {
      // Save current
      preMaxPosRef.current = pos;
      preMaxSizeRef.current = size;
      const margin = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.05);
      setPos({ x: margin, y: margin });
      setSize({
        w: window.innerWidth - margin * 2,
        h: window.innerHeight - margin * 2,
      });
      setMaximized(true);
    }
  }, [maximized, pos, size]);

  // ── Drag handlers ──
  const handleTitleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (maximized) return;
      e.preventDefault();
      setDragging(true);
      dragRef.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    },
    [maximized, pos],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragRef.current.px + (e.clientX - dragRef.current.sx))),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.py + (e.clientY - dragRef.current.sy))),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  // ── Resize handlers ──
  const handleResizeStart = useCallback(
    (edge: ResizeEdge) => (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing({ edge });
      resizeRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        px: pos.x,
        py: pos.y,
        pw: size.w,
        ph: size.h,
      };
    },
    [pos, size],
  );

  useEffect(() => {
    if (!resizing) return;
    const edge = resizing.edge;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeRef.current.sx;
      const dy = e.clientY - resizeRef.current.sy;

      let newX = resizeRef.current.px;
      let newY = resizeRef.current.py;
      let newW = resizeRef.current.pw;
      let newH = resizeRef.current.ph;

      // East (right edge)
      if (edge.includes('e')) {
        newW = Math.max(minWidth, resizeRef.current.pw + dx);
      }
      // West (left edge)
      if (edge.includes('w')) {
        const proposedW = resizeRef.current.pw - dx;
        if (proposedW >= minWidth) {
          newW = proposedW;
          newX = resizeRef.current.px + dx;
        } else {
          newW = minWidth;
          newX = resizeRef.current.px + resizeRef.current.pw - minWidth;
        }
      }
      // South (bottom edge)
      if (edge.includes('s')) {
        newH = Math.max(minHeight, resizeRef.current.ph + dy);
      }
      // North (top edge)
      if (edge.includes('n')) {
        const proposedH = resizeRef.current.ph - dy;
        if (proposedH >= minHeight) {
          newH = proposedH;
          newY = resizeRef.current.py + dy;
        } else {
          newH = minHeight;
          newY = resizeRef.current.py + resizeRef.current.ph - minHeight;
        }
      }

      setPos({ x: newX, y: newY });
      setSize({ w: newW, h: newH });
    };
    const handleUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizing, minWidth, minHeight]);

  useBodyScrollLock(!!(open && !minimized));

  if (!open) return null;

  const isAnimating = animating || (open && !minimized);

  // ── Minimized bar ──
  if (minimized) {
    return (
      <div className="dw-minimized-bar dw-minimized-bar--visible" onClick={onRestore} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onRestore?.(); }}>
        <div className="dw-minimized-bar__left">
          {icon && <span className="dw-minimized-bar__icon">{icon}</span>}
          <span className="dw-minimized-bar__label">{title}</span>
        </div>
        <div className="dw-minimized-bar__actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="dw-minimized-bar__btn"
            onClick={onRestore}
            title="Restore"
            aria-label="Restore"
          >
            <Maximize size={12} />
          </button>
          <button
            type="button"
            className="dw-minimized-bar__btn dw-minimized-bar__btn--close"
            onClick={handleClose}
            title="Close"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="dw-backdrop" />

      {/* Window */}
      <div
        className={`dw-window ${maximized ? 'dw-window--maximized' : ''} ${isAnimating ? 'dw-window--open' : ''}`}
        ref={windowRef}
        onKeyDown={handleKeyDown}
        style={{
          left: maximized ? 0 : pos.x,
          top: maximized ? 0 : pos.y,
          width: maximized ? '100%' : size.w,
          height: maximized ? '100%' : size.h,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Title Bar */}
        <div
          className={`dw-titlebar ${dragging || resizing ? 'dw-titlebar--dragging' : ''}`}
          ref={titleBarRef}
          onMouseDown={handleTitleMouseDown}
        >
          <div className="dw-titlebar__left">
            {icon && <span className="dw-titlebar__icon">{icon}</span>}
            <span className="dw-titlebar__title">{title}</span>
          </div>
          <div className="dw-titlebar__right">
            {onMinimize && (
              <button
                type="button"
                className="dw-titlebar__btn dw-titlebar__btn--minimize"
                onClick={(e) => { e.stopPropagation(); onMinimize(); }}
                title="Minimize"
                aria-label="Minimize"
              >
                <Minus size={14} />
              </button>
            )}
            <button
              type="button"
              className="dw-titlebar__btn dw-titlebar__btn--maximize"
              onClick={(e) => { e.stopPropagation(); toggleMaximize(); }}
              title={maximized ? 'Restore' : 'Maximize'}
              aria-label={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <Minimize2 size={14} /> : <Square size={12} />}
            </button>
            <button
              type="button"
              className="dw-titlebar__btn dw-titlebar__btn--close"
              onClick={(e) => { e.stopPropagation(); handleClose(); }}
              title="Close"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="dw-body">{children}</div>

        {/* Footer */}
        {footer && <div className="dw-footer">{footer}</div>}

        {/* Resize handles (only when not maximized) */}
        {!maximized && (
          <>
            <div className="dw-resize-handle dw-resize-handle--n" onMouseDown={handleResizeStart('n')} />
            <div className="dw-resize-handle dw-resize-handle--s" onMouseDown={handleResizeStart('s')} />
            <div className="dw-resize-handle dw-resize-handle--e" onMouseDown={handleResizeStart('e')} />
            <div className="dw-resize-handle dw-resize-handle--w" onMouseDown={handleResizeStart('w')} />
            <div className="dw-resize-handle dw-resize-handle--ne" onMouseDown={handleResizeStart('ne')} />
            <div className="dw-resize-handle dw-resize-handle--nw" onMouseDown={handleResizeStart('nw')} />
            <div className="dw-resize-handle dw-resize-handle--se" onMouseDown={handleResizeStart('se')} />
            <div className="dw-resize-handle dw-resize-handle--sw" onMouseDown={handleResizeStart('sw')} />
          </>
        )}
      </div>
    </>
  );
}

// ─── Type helper ────────────────────────────────────────────

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
