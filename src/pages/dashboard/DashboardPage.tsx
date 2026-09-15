import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useDashboardWidgets } from '../../hooks/useDashboardWidgets';
import { WIDGET_REGISTRY, type WidgetDefinition } from './widgets';
import HeaderCalendarPopover from '../../components/layout/HeaderCalendarPopover';
import {
  CalendarDays,
  Sparkles,
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
  ChevronDown,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import { motionTransition } from '../../lib/motion';

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
}

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

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [dragState, setDragState] = useState<WidgetDragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);

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

      const initial: WidgetDragState = {
        widgetId,
        name: widgetName,
      };

      setDragState(initial);
      setDropTargetId(null);

      let latestTarget: string | null = null;

      const onMove = (ev: PointerEvent) => {
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
  }, [cleanupDragListeners]);

  const moveWidgetWithKeyboard = useCallback((widgetId: string, direction: -1 | 1) => {
    const currentIndex = activeWidgets.indexOf(widgetId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeWidgets.length) return;
    reorderWidgets(reorderWidgetIds(activeWidgets, widgetId, activeWidgets[targetIndex]));
  }, [activeWidgets, reorderWidgets]);

  return (
    <div className="w-full">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Command center</span>
          <h1 className="mt-2 text-2xl font-semibold leading-[1.15] tracking-[-0.035em] text-foreground">Procurement overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {user?.fullName ? `${user.fullName} · ` : ''}Purchasing metrics, requisition progress, and priority workflows in one view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button variant="outline" className={cn('max-w-full', isCalendarOpen && 'border-primary/40 bg-primary/5')} onClick={() => setIsCalendarOpen(!isCalendarOpen)} aria-expanded={isCalendarOpen}>
              <CalendarDays size={16} />
              <span className="hidden max-w-52 truncate sm:inline">{today}</span>
              <ChevronDown size={14} className={cn('transition-transform', isCalendarOpen && 'rotate-180')} />
            </Button>
            {isCalendarOpen && <HeaderCalendarPopover onClose={() => setIsCalendarOpen(false)} />}
          </div>
          <Button onClick={openGallery} id="customize-dashboard-btn">
            <Sparkles size={16} /> Customize
            {hasWidgets && <Badge className="min-h-5 border-white/20 bg-white/15 px-1.5 text-primary-foreground" tone="primary">{activeWidgets.length}</Badge>}
          </Button>
        </div>
      </header>

      {hasWidgets && (
        <Card variant="glass" className="mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span><strong className="font-semibold tabular-nums text-foreground">{activeWidgets.length}</strong> active widgets</span>
            <span><strong className="font-semibold tabular-nums text-foreground">{availableWidgets.length}</strong> available for your role</span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><GripVertical size={14} /> Use each widget handle or arrow keys to reorder</span>
        </Card>
      )}

      {!hasWidgets && (
        <EmptyState className="mt-6" icon={LayoutGrid} title="Build your dashboard" description="Add the widgets that match your role and the work you need to follow." action={<Button onClick={openGallery} id="empty-open-gallery-btn"><Sparkles size={17} /> Open widget gallery</Button>} />
      )}

      {hasWidgets && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <AnimatePresence initial={false} mode="popLayout">
          {activeWidgetDefs.map((widget) => {
            const WidgetComponent = widget.component;
            const isDragging = draggedId === widget.id;
            const isDropTarget = dropTargetId === widget.id;

            return (
              <motion.div
                key={widget.id}
                data-widget-id={widget.id}
                className={cn(
                  'group/widget relative min-w-0',
                  widget.fullWidth && 'lg:col-span-2',
                )}
                layout="position"
                initial={{ opacity: 0, scale: 0.98, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -6 }}
                transition={motionTransition.softSpring}
              >
              <Card
                className={cn(
                  'h-full min-w-0 overflow-hidden transition-[opacity,border-color,box-shadow] duration-200',
                  isDragging && 'opacity-45',
                  isDropTarget && 'border-primary/60 ring-4 ring-primary/10',
                )}
              >
                <div className="flex h-11 items-center justify-between border-b border-border/70 bg-muted/30 px-2">
                  <button
                    type="button"
                    className="inline-flex size-10 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                    onPointerDown={(event) => startWidgetDrag(event, widget.id, widget.name)}
                    title={`Reorder ${widget.name}`}
                    aria-label={`Reorder ${widget.name}. Use arrow keys to move.`}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveWidgetWithKeyboard(widget.id, -1); }
                      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveWidgetWithKeyboard(widget.id, 1); }
                      if (event.key === 'Escape') cancelWidgetDrag();
                    }}
                  >
                    <GripVertical size={17} />
                  </button>
                  <span className="min-w-0 truncate px-2 text-[11px] font-medium text-muted-foreground">{widget.name}</span>
                  <button type="button" className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive" onClick={() => removeWidget(widget.id)} title={`Remove ${widget.name}`} aria-label={`Remove ${widget.name}`}>
                    <span aria-hidden="true" className="text-xl font-light leading-none">×</span>
                  </button>
                </div>
                <div className={cn('min-w-0', widget.id === 'kpi-stats' && 'p-3 sm:p-4')}><WidgetComponent /></div>
              </Card>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={isGalleryOpen} onOpenChange={(open) => open ? openGallery() : closeGallery()}>
        <DialogContent id="widget-gallery" className="max-h-[min(90vh,900px)] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <div className="border-b border-border bg-muted/35 px-5 py-5 pr-14 sm:px-7">
            <DialogHeader>
              <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary"><Sparkles size={14} /> Personalize</span>
              <DialogTitle className="text-xl">Widget gallery</DialogTitle>
              <DialogDescription>Choose the information and shortcuts that belong on your dashboard.</DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid min-h-0 gap-7 overflow-y-auto p-5 sm:p-7">
            {groupedWidgets.map((group) => (
              <section key={group.category}>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.label}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.widgets.map((widget) => {
                    const isActive = isWidgetActive(widget.id);
                    const IconComponent = WIDGET_ICONS[widget.icon] || BarChart3;
                    return (
                      <button key={widget.id} type="button" aria-pressed={isActive} className={cn('flex min-h-[126px] flex-col rounded-2xl border p-4 text-left outline-none transition-[border-color,background-color,box-shadow] hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring', isActive ? 'border-primary/35 bg-primary/[0.045] shadow-sm' : 'border-border/80 bg-card')} onClick={() => toggleWidget(widget.id)}>
                        <div className="flex w-full items-start justify-between gap-3">
                          <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${widget.accentColor}15`, color: widget.accentColor }}><IconComponent size={19} /></span>
                          <span className={cn('flex h-6 w-11 items-center rounded-full p-0.5 transition-colors', isActive ? 'justify-end bg-primary' : 'justify-start bg-muted ring-1 ring-border')}><span className={cn('flex size-5 items-center justify-center rounded-full bg-white shadow-sm', isActive && 'text-primary')}>{isActive && <Check size={11} strokeWidth={3} />}</span></span>
                        </div>
                        <span className="mt-3 text-[13px] font-semibold text-foreground">{widget.name}</span>
                        <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{widget.description}</span>
                        {widget.fullWidth && <Badge className="mt-2 w-fit" tone="neutral">Full width</Badge>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border bg-muted/35 px-5 py-4 sm:px-7">
            <span className="text-xs text-muted-foreground"><strong className="font-semibold tabular-nums text-foreground">{activeWidgets.length}</strong> of {availableWidgets.length} active</span>
            <Button onClick={closeGallery}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
