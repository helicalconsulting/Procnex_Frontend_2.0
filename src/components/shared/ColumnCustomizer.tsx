import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { GripVertical, Columns3, RotateCcw, X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { createPortal } from 'react-dom';

// ─── Types ────────────────────────────────────────────────────

export interface ColDescriptor {
  key: string;
  label: string;
  required?: boolean;
}

export interface ColumnCustomizerProps {
  columnOrder: string[];
  visibleKeys: Set<string>;
  allColumns: ColDescriptor[];
  onToggle: (key: string) => void;
  onReorder: (newOrder: string[]) => void;
  onReset: () => void;
  onClose: () => void;
  /** @deprecated No longer needed — modal is screen-centered */
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
}

// ─── Component ────────────────────────────────────────────────

export default function ColumnCustomizer({
  columnOrder, visibleKeys, allColumns, onToggle, onReorder, onReset, onClose,
}: ColumnCustomizerProps) {
  const listRef  = useRef<HTMLUListElement>(null);

  // ── Pointer-based drag state ──────────────────────────────
  const dragState = useRef<{
    fromIdx: number;
    ghostEl: HTMLElement;
    itemHeight: number;
    listTop: number;
    pointerOffsetY: number;
  } | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [insertBefore, setInsertBefore]  = useState<number | null>(null);

  useBodyScrollLock(true);

  // Cleanup ghost element on unmount
  useEffect(() => {
    return () => {
      if (dragState.current?.ghostEl) {
        dragState.current.ghostEl.remove();
      }
    };
  }, []);

  const colMap = useMemo(() => {
    const m: Record<string, ColDescriptor> = {};
    allColumns.forEach((c) => { m[c.key] = c; });
    return m;
  }, [allColumns]);

  // ── Start drag on grip mousedown ──────────────────────────
  const handleGripMouseDown = useCallback((e: React.MouseEvent, fromIdx: number) => {
    e.preventDefault();
    e.stopPropagation();

    const listEl = listRef.current;
    if (!listEl) return;

    const rowEls = listEl.querySelectorAll<HTMLLIElement>('.col-panel__item');
    const sourceEl = rowEls[fromIdx];
    if (!sourceEl) return;

    const rect = sourceEl.getBoundingClientRect();
    const ghost = sourceEl.cloneNode(true) as HTMLElement;
    ghost.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background: var(--surface-card);
      border: 1.5px solid var(--primary-500);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(10,110,209,0.18);
      opacity: 0.95;
      z-index: 9999;
      pointer-events: none;
      transition: none;
    `;
    document.body.appendChild(ghost);

    const listRect = listEl.getBoundingClientRect();
    dragState.current = {
      fromIdx,
      ghostEl: ghost,
      itemHeight: rect.height,
      listTop: listRect.top,
      pointerOffsetY: e.clientY - rect.top,
    };

    setDraggingIdx(fromIdx);
    setInsertBefore(null);

    const onMove = (me: MouseEvent) => {
      if (!dragState.current) return;
      const { ghostEl, itemHeight, listTop, pointerOffsetY, fromIdx: fi } = dragState.current;

      ghostEl.style.top = `${me.clientY - pointerOffsetY}px`;

      const relY = me.clientY - listTop;
      let slot = Math.round(relY / itemHeight);
      slot = Math.max(0, Math.min(slot, columnOrder.length));
      if (slot === fi || slot === fi + 1) slot = fi;
      setInsertBefore(slot === fi ? null : slot);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (dragState.current) {
        dragState.current.ghostEl.remove();
        const { fromIdx: fi } = dragState.current;

        setInsertBefore((slot) => {
          if (slot !== null && slot !== fi && slot !== fi + 1) {
            const newOrder = [...columnOrder];
            const [moved] = newOrder.splice(fi, 1);
            const adjustedSlot = slot > fi ? slot - 1 : slot;
            newOrder.splice(adjustedSlot, 0, moved);
            onReorder(newOrder);
          }
          return null;
        });

        dragState.current = null;
        setDraggingIdx(null);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [columnOrder, onReorder]);

  const visibleCount = columnOrder.filter((k) => visibleKeys.has(k)).length;

  return createPortal(
    <div className="col-modal-backdrop" onClick={onClose}>
      <div className="col-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="col-modal__header">
          <div className="col-modal__header-left">
            <Columns3 size={15} />
            <span>Columns</span>
            <span className="col-modal__count">{visibleCount} shown</span>
          </div>
          <div className="col-modal__header-right">
            <button className="col-modal__reset" onClick={onReset} title="Reset to default">
              <RotateCcw size={13} /> Reset
            </button>
            <button className="col-modal__close" onClick={onClose}><X size={14} /></button>
          </div>
        </div>

        {/* ── Hint ── */}
        <p className="col-modal__hint">
          <GripVertical size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
          Drag grip to reorder &nbsp;·&nbsp; Click checkbox to show/hide
        </p>

        {/* ── Column list ── */}
        <ul className="col-modal__list" ref={listRef}>
          {columnOrder.map((key, idx) => {
            const col = colMap[key];
            if (!col) return null;
            const visible = visibleKeys.has(key);
            const required = !!col.required;
            const isDragging = draggingIdx === idx;
            const isTarget = insertBefore === idx;

            return (
              <li
                key={key}
                className={[
                  'col-modal__item',
                  isDragging ? 'col-modal__item--dragging' : '',
                  isTarget   ? 'col-modal__item--target'   : '',
                ].filter(Boolean).join(' ')}
              >
                {isTarget && <div className="col-modal__drop-line" />}

                <span
                  className="col-modal__grip"
                  aria-hidden
                  onMouseDown={(e) => handleGripMouseDown(e, idx)}
                  title="Drag to reorder"
                >
                  <GripVertical size={14} />
                </span>

                <button
                  className={[
                    'col-modal__toggle',
                    visible  ? 'col-modal__toggle--on'       : '',
                    required ? 'col-modal__toggle--required' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => { if (!required) onToggle(key); }}
                  aria-label={`${visible ? 'Hide' : 'Show'} ${col.label} column`}
                  aria-pressed={visible}
                  tabIndex={required ? -1 : 0}
                >
                  {visible && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>

                <span className={`col-modal__label ${!visible ? 'col-modal__label--muted' : ''}`}>
                  {col.label}
                </span>

                {required && <span className="col-modal__required-badge">required</span>}
              </li>
            );
          })}

          {insertBefore === columnOrder.length && (
            <li className="col-modal__drop-line-wrap">
              <div className="col-modal__drop-line" />
            </li>
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
