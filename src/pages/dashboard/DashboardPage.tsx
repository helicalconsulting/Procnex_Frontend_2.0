import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useDashboardWidgets } from '../../hooks/useDashboardWidgets';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { WIDGET_REGISTRY, type WidgetDefinition } from './widgets';
import {
  CalendarDays,
  Sparkles,
  X,
  GripVertical,
  LayoutGrid,
  BarChart3,
  Clock,
  FileText,
  History,
  Users,
  IndianRupee,
  Zap,
  Check,
} from 'lucide-react';
import './DashboardPage.css';

// ─── Icon mapping for widget gallery ────────────────────────

const WIDGET_ICONS: Record<string, typeof BarChart3> = {
  BarChart3,
  Clock,
  FileText,
  History,
  Users,
  IndianRupee,
  Zap,
};

// ─── Category labels ────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  kpis: 'KPIs & Metrics',
  data: 'Data Views',
  actions: 'Actions & Shortcuts',
};

const CATEGORY_ORDER = ['kpis', 'data', 'actions'] as const;

interface WidgetDragState {
  widgetId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

function reorderWidgetIds(
  order: string[],
  draggedId: string,
  targetId: string
): string[] {
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}  // ─── Component ──────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const {
    activeWidgets,
    availableWidgets,
    toggleWidget,
    removeWidget,
    reorderWidgets,
    isWidgetActive,
    isGalleryOpen,
    openGallery,
    closeGallery,
  } = useDashboardWidgets();

  useBodyScrollLock(isGalleryOpen);

  // Escape key closes gallery
  useEffect(() => {
    if (!isGalleryOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeGallery(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGalleryOpen, closeGallery]);

  const [dragState, setDragState] = useState<WidgetDragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);
  const ghostContentRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Group available widgets by category
  const groupedWidgets = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    widgets: availableWidgets.filter((w) => w.category === cat),
  })).filter((g) => g.widgets.length > 0);

  // Resolve active widget definitions in order
  const activeWidgetDefs = activeWidgets
    .map((id) => WIDGET_REGISTRY.find((w) => w.id === id))
    .filter(Boolean) as WidgetDefinition[];

  const hasWidgets = activeWidgetDefs.length > 0;

  const draggedId = dragState?.widgetId ?? null;

  const cleanupDragListeners = useCallback(() => {
    if (dragListenersRef.current) {
      document.removeEventListener('pointermove', dragListenersRef.current.move);
      document.removeEventListener('pointerup', dragListenersRef.current.up);
      document.removeEventListener('pointercancel', dragListenersRef.current.up);
      dragListenersRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupDragListeners();
      document.body.classList.remove('dash-is-dragging');
    };
  }, [cleanupDragListeners]);

  const findWidgetIdAtPoint = useCallback(
    (clientX: number, clientY: number, excludeId?: string) => {
      const el = document.elementFromPoint(clientX, clientY);
      const wrapper = el?.closest('[data-widget-id]') as HTMLElement | null;
      const id = wrapper?.dataset.widgetId ?? null;
      if (!id || id === excludeId) return null;
      return id;
    },
    []
  );

  const finishWidgetDrag = useCallback(
    (clientX: number, clientY: number, sourceId: string, fallbackTarget: string | null) => {
      const targetId =
        findWidgetIdAtPoint(clientX, clientY, sourceId) ?? fallbackTarget;

      if (targetId && targetId !== sourceId) {
        reorderWidgets(reorderWidgetIds(activeWidgets, sourceId, targetId));
      }

      cleanupDragListeners();
      setDragState(null);
      setDropTargetId(null);
      document.body.classList.remove('dash-is-dragging');
      if (ghostContentRef.current) ghostContentRef.current.innerHTML = '';
    },
    [activeWidgets, cleanupDragListeners, findWidgetIdAtPoint, reorderWidgets]
  );

  const startWidgetDrag = useCallback(
    (e: ReactPointerEvent, widgetId: string, widgetName: string) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const wrapper = (e.currentTarget as HTMLElement).closest(
        '[data-widget-id]'
      ) as HTMLElement | null;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      const initial: WidgetDragState = {
        widgetId,
        name: widgetName,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        offsetX,
        offsetY,
      };

      setDragState(initial);
      setDropTargetId(null);
      document.body.classList.add('dash-is-dragging');

      let latestTarget: string | null = null;

      const onMove = (ev: PointerEvent) => {
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                x: ev.clientX - prev.offsetX,
                y: ev.clientY - prev.offsetY,
              }
            : null
        );

        const overId = findWidgetIdAtPoint(ev.clientX, ev.clientY, widgetId);
        latestTarget = overId;
        setDropTargetId(overId);
      };

      const onUp = (ev: PointerEvent) => {
        finishWidgetDrag(ev.clientX, ev.clientY, widgetId, latestTarget);
      };

      dragListenersRef.current = { move: onMove, up: onUp };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [findWidgetIdAtPoint, finishWidgetDrag]
  );

  const cancelWidgetDrag = useCallback(() => {
    cleanupDragListeners();
    setDragState(null);
    setDropTargetId(null);
    document.body.classList.remove('dash-is-dragging');
    if (ghostContentRef.current) ghostContentRef.current.innerHTML = '';
  }, [cleanupDragListeners]);

  useEffect(() => {
    if (!dragState) return;

    const frame = requestAnimationFrame(() => {
      const wrapper = document.querySelector(
        `[data-widget-id="${dragState.widgetId}"]`
      ) as HTMLElement | null;
      if (!wrapper || !ghostContentRef.current) return;

      const clone = wrapper.cloneNode(true) as HTMLElement;
      clone.classList.add('dash-drag-ghost__clone');
      clone.querySelector('.dash-widget__remove')?.remove();
      clone
        .querySelectorAll('.dash-widget__drag-bar')
        .forEach((bar) => bar.classList.add('dash-widget__drag-bar--ghost'));

      ghostContentRef.current.innerHTML = '';
      ghostContentRef.current.appendChild(clone);
    });

    return () => cancelAnimationFrame(frame);
  }, [dragState?.widgetId]);

  return (
    <div className="dashboard">
      {/* ── SAP Fiori Enterprise Header ─────────────────────── */}
      <header className="dash-header">
        <div className="dash-header__text">
          <h1>Procurement Overview</h1>
          <p>
            {user?.fullName ? `${user.fullName} · ` : ''}Real-time purchasing metrics, requisition tracking & operational workflows
          </p>
        </div>
        <div className="dash-header__actions">
          <div className="dash-header__date">
            <CalendarDays size={15} />
            {today}
          </div>
          <button
            className="dash-customize-btn"
            onClick={openGallery}
            id="customize-dashboard-btn"
          >
            <Sparkles size={16} />
            <span>Customize</span>
            {hasWidgets && (
              <span className="dash-customize-btn__badge">{activeWidgets.length}</span>
            )}
          </button>
        </div>
      </header>

      {hasWidgets && (
        <div className="dash-hero">
          <div className="dash-hero__glow dash-hero__glow--1" />
          <div className="dash-hero__glow dash-hero__glow--2" />
          <div className="dash-hero__content">
            <span className="dash-hero__stat">
              <strong>{activeWidgets.length}</strong> active widgets
            </span>
            <span className="dash-hero__divider" />
            <span className="dash-hero__stat">
              <strong>{availableWidgets.length}</strong> available for your role
            </span>
            <span className="dash-hero__divider" />
            <span className="dash-hero__hint">
              <GripVertical size={14} aria-hidden />
              Drag top bar to reorder widgets
            </span>
          </div>
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────── */}
      {!hasWidgets && (
        <div className="dash-empty">
          <div className="dash-empty__visual">
            {/* Animated rings */}
            <div className="dash-empty__ring dash-empty__ring--1" />
            <div className="dash-empty__ring dash-empty__ring--2" />
            <div className="dash-empty__ring dash-empty__ring--3" />
            <div className="dash-empty__icon">
              <LayoutGrid size={48} />
            </div>
          </div>
          <h2 className="dash-empty__title">Your Dashboard, Your Way</h2>
          <p className="dash-empty__subtitle">
            Add widgets to build your personalized command center.
            Choose exactly the data that matters to your role.
          </p>
          <button
            className="dash-empty__cta"
            onClick={openGallery}
            id="empty-open-gallery-btn"
          >
            <Sparkles size={18} />
            Open Widget Gallery
          </button>

          {/* Floating particles */}
          <div className="dash-empty__particles">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`dash-empty__particle dash-empty__particle--${i + 1}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── Widget Grid ────────────────────────────────────── */}
      {hasWidgets && (
        <div
          className={`dash-widget-grid${draggedId ? ' dash-widget-grid--dragging' : ''}`}
        >
          {activeWidgetDefs.map((widget, index) => {
            const WidgetComponent = widget.component;
            const isFullWidth = widget.fullWidth;
            const isDragging = draggedId === widget.id;
            const isDropTarget = dropTargetId === widget.id;

            return (
              <div
                key={widget.id}
                data-widget-id={widget.id}
                className={[
                  'dash-widget-wrapper',
                  isFullWidth ? 'dash-widget-wrapper--full' : '',
                  isDragging ? 'dash-widget-wrapper--dragging' : '',
                  isDropTarget ? 'dash-widget-wrapper--drop-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ animationDelay: `${index * 0.06}s` }}
              >
                <div
                  className="dash-widget__drag-bar"
                  onPointerDown={(e) =>
                    startWidgetDrag(e, widget.id, widget.name)
                  }
                  title={`Drag ${widget.name} to reorder`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Drag ${widget.name} to reorder`}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelWidgetDrag();
                  }}
                >
                  <GripVertical size={16} className="dash-widget__drag-bar-icon" />
                  <span className="dash-widget__drag-bar-hint">Drag to reorder</span>
                </div>

                <button
                  type="button"
                  className="dash-widget__remove"
                  onClick={() => removeWidget(widget.id)}
                  title={`Remove ${widget.name}`}
                  aria-label={`Remove ${widget.name}`}
                >
                  <X size={14} />
                </button>

                {/* The widget itself */}
                <div className={`dash-widget-content ${isFullWidth ? '' : 'dash-card'}`}>
                  <WidgetComponent />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dragState &&
        createPortal(
          <div
            className="dash-drag-ghost"
            style={{
              left: dragState.x,
              top: dragState.y,
              width: dragState.width,
            }}
            aria-hidden
          >
            <div ref={ghostContentRef} className="dash-drag-ghost__content" />
          </div>,
          document.body
        )}

      {/* ── Widget Gallery Drawer ──────────────────────────── */}
      <div
        className={`gallery-backdrop ${isGalleryOpen ? 'gallery-backdrop--visible' : ''}`}
        onClick={closeGallery}
      />
      <aside
        className={`gallery ${isGalleryOpen ? 'gallery--open' : ''}`}
        id="widget-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-gallery-title"
      >
        <div className="gallery__header">
          <div className="gallery__header-text">
            <Sparkles size={20} />
            <div>
              <h2 id="widget-gallery-title">Widget Gallery</h2>
              <p>Toggle widgets on or off</p>
            </div>
          </div>
          <button
            className="gallery__close"
            onClick={closeGallery}
            aria-label="Close gallery"
          >
            <X size={20} />
          </button>
        </div>

        <div className="gallery__body">
          {groupedWidgets.map((group) => (
            <div key={group.category} className="gallery__section">
              <h3 className="gallery__section-title">{group.label}</h3>
              <div className="gallery__cards">
                {group.widgets.map((widget, idx) => {
                  const isActive = isWidgetActive(widget.id);
                  const IconComponent = WIDGET_ICONS[widget.icon] || BarChart3;

                  return (
                    <button
                      key={widget.id}
                      className={`gallery-card ${isActive ? 'gallery-card--active' : ''}`}
                      onClick={() => toggleWidget(widget.id)}
                      style={{
                        animationDelay: `${idx * 0.05}s`,
                        '--widget-accent': widget.accentColor,
                      } as React.CSSProperties}
                    >
                      <div className="gallery-card__top">
                        <div
                          className="gallery-card__icon"
                          style={{
                            background: `${widget.accentColor}15`,
                            color: widget.accentColor,
                          }}
                        >
                          <IconComponent size={20} />
                        </div>
                        <div className={`gallery-card__toggle ${isActive ? 'gallery-card__toggle--on' : ''}`}>
                          <div className="gallery-card__toggle-knob">
                            {isActive && <Check size={10} />}
                          </div>
                        </div>
                      </div>
                      <div className="gallery-card__info">
                        <span className="gallery-card__name">{widget.name}</span>
                        <span className="gallery-card__desc">{widget.description}</span>
                      </div>
                      {widget.fullWidth && (
                        <span className="gallery-card__badge">Full Width</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="gallery__footer">
          <span className="gallery__footer-count">
            {activeWidgets.length} of {availableWidgets.length} widgets active
          </span>
          <button className="gallery__footer-btn" onClick={closeGallery}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
