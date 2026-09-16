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
  const listRef = useRef<HTMLUListElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Pointer-based drag state ──────────────────────────────
  const dragState = useRef<{
    fromIdx: number;
    ghostEl: HTMLElement;
    itemHeight: number;
    listTop: number;
    pointerOffsetY: number;
  } | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [insertBefore, setInsertBefore] = useState<number | null>(null);

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

  // Filtered keys if user searches
  const filteredOrder = useMemo(() => {
    if (!searchQuery.trim()) return columnOrder;
    const q = searchQuery.toLowerCase().trim();
    return columnOrder.filter((key) => {
      const col = colMap[key];
      return col && col.label.toLowerCase().includes(q);
    });
  }, [columnOrder, colMap, searchQuery]);

  // ── Start drag on grip mousedown ──────────────────────────
  const handleGripMouseDown = useCallback((e: React.MouseEvent, fromIdx: number) => {
    e.preventDefault();
    e.stopPropagation();

    const listEl = listRef.current;
    if (!listEl) return;

    const rowEls = listEl.querySelectorAll<HTMLLIElement>('.col-modal__item');
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
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(10,110,209,0.22);
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
  const totalCount = columnOrder.length;

  const handleSelectAll = () => {
    columnOrder.forEach((key) => {
      if (!visibleKeys.has(key)) {
        onToggle(key);
      }
    });
  };

  const handleDeselectOptional = () => {
    columnOrder.forEach((key) => {
      const col = colMap[key];
      if (col && !col.required && visibleKeys.has(key)) {
        onToggle(key);
      }
    });
  };

  return createPortal(
    <div className="col-modal-backdrop" onClick={onClose}>
      <div className="col-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="col-modal__header">
          <div className="col-modal__header-left">
            <div className="col-modal__icon-wrap">
              <Columns3 size={18} />
            </div>
            <div>
              <h3 className="col-modal__title">Customize Columns</h3>
              <p className="col-modal__subtitle">Configure table view preferences</p>
            </div>
          </div>
          <div className="col-modal__header-right">
            <span className="col-modal__count">{visibleCount} of {totalCount} shown</span>
            <button className="col-modal__close" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Toolbar: Search & Quick Actions ── */}
        <div className="col-modal__toolbar">
          <div className="col-modal__search-wrap">
            <input
              type="text"
              className="col-modal__search-input"
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="col-modal__search-clear" onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
          <div className="col-modal__actions">
            <button className="col-modal__action-btn" onClick={handleSelectAll}>
              Show All
            </button>
            <button className="col-modal__action-btn" onClick={handleDeselectOptional}>
              Hide Optional
            </button>
            <button className="col-modal__reset" onClick={onReset} title="Reset to default">
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </div>

        {/* ── Hint ── */}
        <div className="col-modal__hint">
          <GripVertical size={13} className="col-modal__hint-icon" />
          <span>Drag grip to reorder columns &nbsp;•&nbsp; Click checkbox to toggle visibility</span>
        </div>

        {/* ── Column list ── */}
        <ul className="col-modal__list" ref={listRef}>
          {filteredOrder.map((key, idx) => {
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
                  visible ? 'col-modal__item--active' : '',
                  isDragging ? 'col-modal__item--dragging' : '',
                  isTarget ? 'col-modal__item--target' : '',
                ].filter(Boolean).join(' ')}
              >
                {isTarget && <div className="col-modal__drop-line" />}

                <span
                  className="col-modal__grip"
                  aria-hidden
                  onMouseDown={(e) => handleGripMouseDown(e, idx)}
                  title="Drag to reorder"
                >
                  <GripVertical size={16} />
                </span>

                <button
                  className={[
                    'col-modal__toggle',
                    visible ? 'col-modal__toggle--on' : '',
                    required ? 'col-modal__toggle--required' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => { if (!required) onToggle(key); }}
                  aria-label={`${visible ? 'Hide' : 'Show'} ${col.label} column`}
                  aria-pressed={visible}
                  tabIndex={required ? -1 : 0}
                >
                  {visible && (
                    <svg width="12" height="10" viewBox="0 0 10 8" fill="none" aria-hidden>
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>

                <span className={`col-modal__label ${!visible ? 'col-modal__label--muted' : ''}`}>
                  {col.label}
                </span>

                {required ? (
                  <span className="col-modal__required-badge">Required</span>
                ) : (
                  <span className={`col-modal__status-badge ${visible ? 'col-modal__status-badge--visible' : ''}`}>
                    {visible ? 'Visible' : 'Hidden'}
                  </span>
                )}
              </li>
            );
          })}

          {filteredOrder.length === 0 && (
            <div className="col-modal__empty">
              No columns match &quot;{searchQuery}&quot;
            </div>
          )}

          {insertBefore === filteredOrder.length && (
            <li className="col-modal__drop-line-wrap">
              <div className="col-modal__drop-line" />
            </li>
          )}
        </ul>

        {/* ── Footer ── */}
        <div className="col-modal__footer">
          <span className="col-modal__footer-info">
            {totalCount - visibleCount} columns hidden
          </span>
          <button className="col-modal__done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
