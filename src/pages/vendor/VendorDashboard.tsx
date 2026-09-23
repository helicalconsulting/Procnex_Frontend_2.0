import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  GripVertical,
  LayoutGrid,
  Package,
  Receipt,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import HeaderCalendarPopover from '../../components/layout/HeaderCalendarPopover';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService, type VendorQuotationRow, type VendorWidgetPref } from '../../services/vendorPortalService';
import type { VendorOrderMock, VendorInvoiceMock } from '../../mocks/vendorPortal.mock';
import type { RFQ } from '../../types';
import { getVendorPath } from '../../utils/tenantResolver';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/product';
import { AnimatedNumber } from '../../components/ui/animated-number';
import { WidgetHeader, WidgetBody } from '../dashboard/widgets/WidgetShell';
import { cn } from '../../lib/utils';
import { motionTransition } from '../../lib/motion';

function timeLeft(dateStr: string | null | undefined): { label: string; urgent: boolean } {
  if (!dateStr) return { label: '—', urgent: false };
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return { label: 'Overdue', urgent: true };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return { label: `${hours}h left`, urgent: true };
  const days = Math.ceil(diff / 86_400_000);
  return { label: `${days}d left`, urgent: days <= 2 };
}

function relativeTime(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

type WidgetCategory = 'kpis' | 'data' | 'actions';
type KpiType = 'rfqs' | 'quotes' | 'orders' | 'invoices' | 'revenue';

interface VendorWidgetDefinition {
  id: string;
  name: string;
  description: string;
  icon: typeof BarChart3;
  accentColor: string;
  fullWidth?: boolean;
  category: WidgetCategory;
}

const VENDOR_WIDGETS: VendorWidgetDefinition[] = [
  { id: 'kpis', name: 'Business snapshot', description: 'RFQs, quotations, orders, invoices, and revenue at a glance.', icon: BarChart3, accentColor: '#0a6ed1', fullWidth: true, category: 'kpis' },
  { id: 'deadlines', name: 'Upcoming deadlines', description: 'RFQ closing dates sorted by urgency.', icon: Clock, accentColor: '#d97706', category: 'data' },
  { id: 'activity', name: 'Recent activity', description: 'Latest notifications and account events.', icon: FileText, accentColor: '#0284c7', category: 'data' },
  { id: 'quicknav', name: 'Quick actions', description: 'Shortcuts to common vendor workflows.', icon: Zap, accentColor: '#8b5cf6', category: 'actions' },
  { id: 'alerts', name: 'Action alerts', description: 'Urgent items that need attention.', icon: AlertTriangle, accentColor: '#ea580c', fullWidth: true, category: 'data' },
  { id: 'recent-quotations', name: 'Recent quotations', description: 'Latest submitted quotations and outcomes.', icon: CheckCircle2, accentColor: '#059669', category: 'data' },
];

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

export default function VendorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [activeWidgets, setActiveWidgets] = useState<string[]>([]);
  const [isGalleryOpen, setGalleryOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedKpiType, setSelectedKpiType] = useState<KpiType | null>(null);

  const [dragState, setDragState] = useState<WidgetDragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragListenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: rfqs } = useServiceData(() => vendorPortalService.listRfqs(), [] as RFQ[]);
  const { data: quotations } = useServiceData(() => vendorPortalService.listQuotations(), [] as VendorQuotationRow[]);
  const { data: orders } = useServiceData(() => vendorPortalService.listOrders(), [] as VendorOrderMock[]);
  const { data: invoices } = useServiceData(() => vendorPortalService.listInvoices(), [] as VendorInvoiceMock[]);
  const { data: notifData } = useServiceData(
    () => vendorPortalService.listNotifications(),
    { notifications: [], unreadCount: 0 } as { notifications: { type: string; title: string; message: string | null; createdAt: string }[]; unreadCount: number },
  );
  const { data: widgetPrefs } = useServiceData(() => vendorPortalService.getWidgetPreferences(), [] as VendorWidgetPref[]);

  useEffect(() => {
    const active = (widgetPrefs ?? [])
      .filter((preference) => preference.isActive)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((preference) => preference.widgetId);
    if (active.length > 0) {
      setActiveWidgets(active);
    } else {
      setActiveWidgets(VENDOR_WIDGETS.map((w) => w.id));
    }
  }, [widgetPrefs]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  const syncWidgets = useCallback((ids: string[]) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void vendorPortalService.saveWidgetPreferences(VENDOR_WIDGETS.map((widget) => ({
        widgetId: widget.id,
        isActive: ids.includes(widget.id),
        sortOrder: ids.includes(widget.id) ? ids.indexOf(widget.id) : 0,
      }))).catch((error) => console.warn('[VendorDashboard] Failed to save widget preferences:', error));
    }, 500);
  }, []);

  const reorderWidgets = useCallback((newOrder: string[]) => {
    setActiveWidgets(newOrder);
    syncWidgets(newOrder);
  }, [syncWidgets]);

  const toggleWidget = useCallback((widgetId: string) => {
    setActiveWidgets((current) => {
      const next = current.includes(widgetId)
        ? current.filter((id) => id !== widgetId)
        : [...current, widgetId];
      syncWidgets(next);
      return next;
    });
  }, [syncWidgets]);

  const removeWidget = useCallback((widgetId: string) => {
    setActiveWidgets((current) => {
      const next = current.filter((id) => id !== widgetId);
      syncWidgets(next);
      return next;
    });
  }, [syncWidgets]);

  const isWidgetActive = useCallback((widgetId: string) => {
    return activeWidgets.includes(widgetId);
  }, [activeWidgets]);

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

  const kpis = useMemo(() => {
    const openRfqs = rfqs.filter((rfq) => !('hasSubmittedQuotation' in rfq && (rfq as RFQ & { hasSubmittedQuotation?: boolean }).hasSubmittedQuotation)).length;
    const acceptedQuotations = quotations.filter((quote) => ['ACCEPTED', 'APPROVED'].includes(quote.status)).length;
    const activeOrders = orders.filter((order) => !['DELIVERED', 'CANCELLED'].includes(order.status)).length;
    const shippedOrders = orders.filter((order) => order.status === 'SHIPPED').length;
    const pendingInvoices = invoices.filter((invoice) => ['PENDING', 'APPROVED'].includes(invoice.status)).length;
    const overdueInvoices = invoices.filter((invoice) => invoice.status === 'OVERDUE').length;
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'PAID');
    const paidTotal = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || invoice.amount || 0), 0);
    return {
      openRfqs,
      totalQuotations: quotations.length,
      acceptedQuotations,
      activeOrders,
      shippedOrders,
      pendingInvoices,
      overdueInvoices,
      paidCount: paidInvoices.length,
      revenue: formatAmount(paidTotal, companyDefaultCurrency),
    };
  }, [companyDefaultCurrency, formatAmount, invoices, orders, quotations, rfqs]);

  const deadlines = useMemo(() => rfqs
    .filter((rfq) => rfq.closingDate)
    .map((rfq) => ({ rfqNumber: rfq.rfqNumber, title: rfq.title, ...timeLeft(rfq.closingDate ?? null) }))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent))
    .slice(0, 5), [rfqs]);

  const recentActivity = useMemo(() => (notifData?.notifications ?? []).slice(0, 5).map((notification) => ({
    text: `${notification.title}${notification.message ? ` — ${notification.message}` : ''}`,
    time: relativeTime(notification.createdAt),
  })), [notifData]);

  const urgentCount = deadlines.filter((deadline) => deadline.urgent).length;
  const alertText = [
    urgentCount ? `${urgentCount} RFQ ${urgentCount === 1 ? 'deadline is' : 'deadlines are'} due soon` : null,
    kpis.overdueInvoices ? `${kpis.overdueInvoices} ${kpis.overdueInvoices === 1 ? 'invoice is' : 'invoices are'} overdue` : null,
  ].filter(Boolean).join(' · ');

  const activeWidgetDefs = activeWidgets
    .map((id) => VENDOR_WIDGETS.find((widget) => widget.id === id))
    .filter((widget): widget is VendorWidgetDefinition => !!widget);

  const hasWidgets = activeWidgetDefs.length > 0;
  const draggedId = dragState?.widgetId ?? null;

  const groupedWidgets = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    widgets: VENDOR_WIDGETS.filter((w) => w.category === cat),
  })).filter((g) => g.widgets.length > 0);

  const kpiRows = useMemo(() => {
    if (!selectedKpiType) return [];
    if (selectedKpiType === 'rfqs') return [
      { label: 'Open RFQs', value: String(kpis.openRfqs), helper: 'Awaiting your response' },
      { label: 'Total RFQs', value: String(rfqs.length), helper: 'All requests' },
      { label: 'Active deadlines', value: String(deadlines.length), helper: 'Closing soon' },
    ];
    if (selectedKpiType === 'quotes') return [
      { label: 'Submitted', value: String(kpis.totalQuotations), helper: 'All quotations' },
      { label: 'Accepted', value: String(kpis.acceptedQuotations), helper: 'Won bids' },
      { label: 'Win rate', value: kpis.totalQuotations ? `${Math.round((kpis.acceptedQuotations / kpis.totalQuotations) * 100)}%` : '—', helper: 'Accepted / submitted' },
    ];
    if (selectedKpiType === 'orders') return [
      { label: 'Active orders', value: String(kpis.activeOrders), helper: 'In progress' },
      { label: 'Dispatched', value: String(kpis.shippedOrders), helper: 'On the way' },
      { label: 'Total orders', value: String(orders.length), helper: 'All orders' },
    ];
    if (selectedKpiType === 'invoices') return [
      { label: 'Pending', value: String(kpis.pendingInvoices), helper: 'Awaiting payment' },
      { label: 'Overdue', value: String(kpis.overdueInvoices), helper: 'Past due' },
      { label: 'Total invoices', value: String(invoices.length), helper: 'All invoices' },
    ];
    return [
      { label: 'Revenue YTD', value: kpis.revenue, helper: 'Paid invoices' },
      { label: 'Paid invoices', value: String(kpis.paidCount), helper: 'Completed payments' },
    ];
  }, [deadlines.length, invoices.length, kpis, orders.length, rfqs.length, selectedKpiType]);

  const renderWidget = (id: string) => {
    if (id === 'kpis') {
      const items: Array<{ type: KpiType; label: string; value: string | number; icon: typeof BarChart3; tone: string }> = [
        { type: 'rfqs', label: 'Open RFQs', value: kpis.openRfqs, icon: FileText, tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
        { type: 'quotes', label: 'Quotations', value: kpis.totalQuotations, icon: Clock, tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
        { type: 'orders', label: 'Active orders', value: kpis.activeOrders, icon: Package, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
        { type: 'invoices', label: 'Pending invoices', value: kpis.pendingInvoices, icon: Receipt, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
        { type: 'quotes', label: 'Accepted quotes', value: kpis.acceptedQuotations, icon: CheckCircle2, tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300' },
        { type: 'revenue', label: 'Revenue YTD', value: kpis.revenue, icon: TrendingUp, tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' },
      ];
      return (
        <>
          <WidgetHeader icon={<BarChart3 size={16} />} title="Business snapshot" subtitle="Real-time performance metrics" />
          <WidgetBody className="p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.type}-${item.label}`}
                    type="button"
                    className={cn(
                      'group flex min-h-[78px] items-center gap-3 rounded-2xl border border-border/80 bg-card px-3.5 py-3 text-left shadow-sm outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-400/70 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.45),0_0_14px_rgba(59,130,246,0.28)] focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                    onClick={() => setSelectedKpiType(item.type)}
                    aria-label={`Open ${item.label} details`}
                  >
                    <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', item.tone)}>
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-2xl font-semibold leading-none tracking-[-0.035em] tabular-nums text-foreground">
                        {typeof item.value === 'number' ? <AnimatedNumber value={item.value} /> : item.value}
                      </span>
                      <span className="mt-1 block truncate text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </WidgetBody>
        </>
      );
    }

    if (id === 'deadlines') return (
      <>
        <WidgetHeader icon={<Clock size={16} />} title="Upcoming deadlines" subtitle="RFQ closing dates sorted by urgency" href={getVendorPath('/vendor/rfqs')} />
        <WidgetBody className="p-0">
          <div className="divide-y divide-border/60">
            {deadlines.length ? deadlines.map((deadline) => (
              <div key={deadline.rfqNumber} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className={cn('size-2 shrink-0 rounded-full', deadline.urgent ? 'bg-destructive shadow-[0_0_0_4px_rgba(220,38,38,.09)]' : 'bg-emerald-500')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-primary">{deadline.rfqNumber}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{deadline.title}</div>
                </div>
                <Badge tone={deadline.urgent ? 'danger' : 'neutral'}><Clock size={11} />{deadline.label}</Badge>
              </div>
            )) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No upcoming deadlines</div>}
          </div>
        </WidgetBody>
      </>
    );

    if (id === 'activity') return (
      <>
        <WidgetHeader icon={<FileText size={16} />} title="Recent activity" subtitle="Latest account notifications" />
        <WidgetBody>
          <div className="grid gap-1">
            {recentActivity.length ? recentActivity.map((activity, index) => (
              <div key={`${activity.time}-${index}`} className="relative flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                {index < recentActivity.length - 1 && <span aria-hidden="true" className="absolute bottom-[-7px] left-[21px] top-9 w-px bg-border" />}
                <div className="relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
                  <FileText size={14} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <p className="line-clamp-2 text-sm leading-5 text-foreground">{activity.text}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{activity.time}</p>
                </div>
              </div>
            )) : <div className="py-8 text-center text-sm text-muted-foreground">No recent activity</div>}
          </div>
        </WidgetBody>
      </>
    );

    if (id === 'quicknav') {
      const actions = [
        { label: 'Submit quotation', description: 'Respond to open RFQs', icon: FileText, path: getVendorPath('/vendor/rfqs'), accent: '#0a6ed1' },
        { label: 'Track orders', description: 'View fulfillment status', icon: Package, path: getVendorPath('/vendor/orders'), accent: '#8b5cf6' },
        { label: 'Manage invoices', description: 'Upload and track invoices', icon: Receipt, path: getVendorPath('/procurement/grns'), accent: '#059669' },
        { label: 'My contracts', description: 'Review active agreements', icon: CheckCircle2, path: getVendorPath('/vendor/contracts'), accent: '#0891b2' },
        { label: 'Company profile', description: 'Documents and compliance', icon: Building2, path: getVendorPath('/vendor/profile'), accent: '#ea580c' },
      ];
      return (
        <>
          <WidgetHeader icon={<Zap size={16} />} title="Quick actions" subtitle="Shortcuts to common vendor workflows" />
          <WidgetBody>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.path}
                    type="button"
                    className="group flex min-h-14 items-center gap-3 rounded-xl border border-border/80 bg-card p-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate(action.path)}
                  >
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-black/5"
                      style={{ background: `${action.accent}15`, color: action.accent }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground group-hover:text-primary">
                        {action.label}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {action.description}
                      </span>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </WidgetBody>
        </>
      );
    }

    if (id === 'recent-quotations') return (
      <>
        <WidgetHeader icon={<CheckCircle2 size={16} />} title="Recent quotations" subtitle="Latest submitted bids and outcomes" href={getVendorPath('/vendor/quotations')} />
        <WidgetBody className="p-0">
          <div className="divide-y divide-border/60">
            {quotations.length ? [...quotations].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, 5).map((quote) => {
              const accepted = ['ACCEPTED', 'APPROVED'].includes(quote.status);
              const rejected = quote.status === 'REJECTED';
              return (
                <button key={quote.id} onClick={() => navigate(getVendorPath('/vendor/quotations'))} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-primary">{quote.rfq?.rfqNumber || `#${quote.id}`}</span><Badge tone={accepted ? 'success' : rejected ? 'danger' : 'warning'}>{quote.status.replaceAll('_', ' ')}</Badge></div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{quote.rfq?.title || 'Quotation'} · {relativeTime(quote.submittedAt)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatAmount(Number(quote.totalPrice), quote.currency || companyDefaultCurrency)}</span>
                </button>
              );
            }) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No quotations yet</div>}
          </div>
        </WidgetBody>
      </>
    );

    if (id === 'alerts') return (
      <>
        <WidgetHeader icon={<AlertTriangle size={16} />} title="Action alerts" subtitle="Urgent notifications requiring your response" />
        <WidgetBody>
          <div className={cn('flex items-start gap-3 rounded-xl border p-4', alertText ? 'border-amber-500/25 bg-amber-500/[0.075]' : 'border-emerald-500/20 bg-emerald-500/[0.06]')}>
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', alertText ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300')}>
              {alertText ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{alertText ? 'Action required' : 'You’re all caught up'}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alertText || 'There are no urgent RFQ deadlines or overdue invoices.'}</p>
            </div>
          </div>
        </WidgetBody>
      </>
    );

    return null;
  };

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="w-full">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="mt-2 text-2xl font-semibold leading-[1.15] tracking-[-0.035em] text-foreground">Vendor overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {user?.fullName ? `${user.fullName} · ` : ''}A live view of opportunities, orders, invoices, and account activity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              className={cn('max-w-full', isCalendarOpen && 'border-primary/40 bg-primary/5')}
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              aria-expanded={isCalendarOpen}
            >
              <CalendarDays size={16} />
              <span className="hidden max-w-52 truncate sm:inline">{today}</span>
              <ChevronDown size={14} className={cn('transition-transform', isCalendarOpen && 'rotate-180')} />
            </Button>
            {isCalendarOpen && <HeaderCalendarPopover onClose={() => setIsCalendarOpen(false)} />}
          </div>
          <Button onClick={() => setGalleryOpen(true)} id="customize-vendor-dashboard-btn">
            <Sparkles size={16} /> Customize
            {hasWidgets && (
              <Badge className="min-h-5 border-white/20 bg-white/15 px-1.5 text-primary-foreground" tone="primary">
                {activeWidgets.length}
              </Badge>
            )}
          </Button>
        </div>
      </header>

      {hasWidgets && (
        <Card variant="glass" className="mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span><strong className="font-semibold tabular-nums text-foreground">{activeWidgets.length}</strong> active widgets</span>
            <span><strong className="font-semibold tabular-nums text-foreground">{VENDOR_WIDGETS.length}</strong> available for your role</span>
          </div>
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><GripVertical size={14} /> Use each widget handle or arrow keys to reorder</span>
        </Card>
      )}

      {!hasWidgets && (
        <EmptyState
          size="lg"
          className="mt-6"
          icon={LayoutGrid}
          title="Build your vendor workspace"
          description="Add the widgets that match your role and the work you need to follow."
          action={<Button onClick={() => setGalleryOpen(true)} id="empty-open-gallery-btn"><Sparkles size={17} /> Open widget gallery</Button>}
        />
      )}

      {hasWidgets && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <AnimatePresence initial={false} mode="popLayout">
            {activeWidgetDefs.map((widget) => {
              const isDragging = draggedId === widget.id;
              const isDropTarget = dropTargetId === widget.id;

              return (
                <motion.div
                  key={widget.id}
                  data-widget-id={widget.id}
                  className={cn(
                    'group/widget relative min-w-0',
                    widget.fullWidth && 'lg:col-span-2'
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
                      isDropTarget && 'border-primary/60 ring-4 ring-primary/10'
                    )}
                  >
                    <div className="flex h-10 items-center justify-between border-b border-border/70 bg-muted/30 px-3 py-1.5">
                      <button
                        type="button"
                        className="inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        onPointerDown={(event) => startWidgetDrag(event, widget.id, widget.name)}
                        title={`Reorder ${widget.name}`}
                        aria-label={`Reorder ${widget.name}. Use arrow keys to move.`}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveWidgetWithKeyboard(widget.id, -1); }
                          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveWidgetWithKeyboard(widget.id, 1); }
                          if (event.key === 'Escape') cancelWidgetDrag();
                        }}
                      >
                        <GripVertical size={16} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive"
                        onClick={() => removeWidget(widget.id)}
                        title={`Remove ${widget.name}`}
                        aria-label={`Remove ${widget.name}`}
                      >
                        <X size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                    <div className="min-w-0">{renderWidget(widget.id)}</div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={isGalleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent id="vendor-widget-gallery" className="h-[min(85vh,800px)] max-h-[min(85vh,800px)] max-w-4xl flex flex-col gap-0 overflow-hidden p-0 bg-card border-border shadow-2xl">
          <div className="shrink-0 border-b border-border bg-card px-5 py-5 pr-14 sm:px-7">
            <DialogHeader>
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary"><Sparkles size={14} /> Personalize</span>
              <DialogTitle className="text-xl">Widget gallery</DialogTitle>
              <DialogDescription>Choose the information and shortcuts that belong on your dashboard.</DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7 flex flex-col gap-7">
            {groupedWidgets.map((group) => (
              <section key={group.category}>
                <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.label}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.widgets.map((widget) => {
                    const isActive = isWidgetActive(widget.id);
                    const IconComponent = widget.icon;
                    return (
                      <button
                        key={widget.id}
                        type="button"
                        aria-pressed={isActive}
                        className={cn('flex min-h-[126px] flex-col rounded-2xl border p-4 text-left outline-none transition-[border-color,background-color,box-shadow] hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring', isActive ? 'border-primary/35 bg-primary/[0.045] shadow-sm' : 'border-border/80 bg-card')}
                        onClick={() => toggleWidget(widget.id)}
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${widget.accentColor}15`, color: widget.accentColor }}>
                            <IconComponent size={19} />
                          </span>
                          <span className={cn('flex h-6 w-11 items-center rounded-full p-0.5 transition-colors', isActive ? 'justify-end bg-primary' : 'justify-start bg-muted ring-1 ring-border')}>
                            <span className={cn('flex size-5 items-center justify-center rounded-full bg-white shadow-sm', isActive && 'text-primary')}>
                              {isActive && <Check size={11} strokeWidth={3} />}
                            </span>
                          </span>
                        </div>
                        <span className="mt-3 text-[14px] font-semibold text-foreground">{widget.name}</span>
                        <span className="mt-1 line-clamp-2 text-[12px] leading-4 text-muted-foreground">{widget.description}</span>
                        {widget.fullWidth && <Badge className="mt-2 w-fit" tone="neutral">Full width</Badge>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="shrink-0 flex items-center justify-between gap-4 border-t border-border bg-card px-5 py-4 sm:px-7">
            <span className="text-xs text-muted-foreground"><strong className="font-semibold tabular-nums text-foreground">{activeWidgets.length}</strong> of {VENDOR_WIDGETS.length} active</span>
            <Button onClick={() => setGalleryOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedKpiType} onOpenChange={(open) => { if (!open) setSelectedKpiType(null); }}>
        {selectedKpiType && (
          <DialogContent className="max-w-2xl">
            <DialogHeader className="pr-10">
              <div className="mb-1 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"><BarChart3 size={20} /></div>
              <DialogTitle>{selectedKpiType === 'rfqs' ? 'Open RFQs' : selectedKpiType === 'quotes' ? 'Quotation performance' : selectedKpiType === 'orders' ? 'Active orders' : selectedKpiType === 'invoices' ? 'Invoice status' : 'Revenue YTD'}</DialogTitle>
              <DialogDescription>Current metrics calculated from your vendor activity.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-3">
              {kpiRows.map((row) => (
                <Card key={row.label} variant="soft" className="p-4">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{row.label}</div>
                  <div className="mt-2 break-words text-2xl font-semibold tracking-[-0.04em] text-foreground">{row.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.helper}</div>
                </Card>
              ))}
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">Recent related activity</h3>
              <div className="mt-3 space-y-2">
                {(selectedKpiType === 'orders' ? deadlines.map((deadline) => ({ title: `${deadline.rfqNumber} · ${deadline.title}`, meta: deadline.label })) : recentActivity.map((activity) => ({ title: activity.text, meta: activity.time }))).slice(0, 4).map((item) => (
                  <div key={`${item.title}-${item.meta}`} className="flex items-start justify-between gap-4 rounded-lg bg-card px-3 py-2.5 text-sm">
                    <span className="min-w-0 line-clamp-2 text-foreground">{item.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.meta}</span>
                  </div>
                ))}
                {(selectedKpiType === 'orders' ? deadlines : recentActivity).length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No recent activity</p>}
              </div>
            </div>
            <DialogFooter><Button onClick={() => setSelectedKpiType(null)}>Done</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
