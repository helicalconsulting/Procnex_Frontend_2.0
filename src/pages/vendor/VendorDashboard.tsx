import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
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
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService, type VendorQuotationRow, type VendorWidgetPref } from '../../services/vendorPortalService';
import type { VendorOrderMock, VendorInvoiceMock } from '../../mocks/vendorPortal.mock';
import type { RFQ } from '../../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, PageFrame, PageLead, SectionHeader } from '@/components/ui/product';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';

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

interface WidgetDef {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  fullWidth?: boolean;
  category: WidgetCategory;
}

const VENDOR_WIDGETS: WidgetDef[] = [
  { id: 'kpis', name: 'KPI overview', description: 'RFQs, quotations, orders, invoices, and revenue at a glance.', icon: BarChart3, tone: 'bg-primary/10 text-primary', fullWidth: true, category: 'kpis' },
  { id: 'deadlines', name: 'Upcoming deadlines', description: 'RFQ closing dates sorted by urgency.', icon: Clock, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', category: 'data' },
  { id: 'activity', name: 'Recent activity', description: 'Latest notifications and account events.', icon: FileText, tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', category: 'data' },
  { id: 'quicknav', name: 'Quick actions', description: 'Shortcuts to common vendor workflows.', icon: Zap, tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', category: 'actions' },
  { id: 'alerts', name: 'Action alerts', description: 'Urgent items that need attention.', icon: AlertTriangle, tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', fullWidth: true, category: 'data' },
  { id: 'recent-quotations', name: 'Recent quotations', description: 'Latest submitted quotations and outcomes.', icon: CheckCircle2, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', category: 'data' },
];

function reorder(order: string[], from: string, to: string): string[] {
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function WidgetPanel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full overflow-hidden">
      <SectionHeader title={<span className="flex items-center gap-2"><Icon className="size-4 text-primary" />{title}</span>} action={action} />
      <div>{children}</div>
    </Card>
  );
}

export default function VendorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [activeWidgets, setActiveWidgets] = useState<string[]>([]);
  const [isGalleryOpen, setGalleryOpen] = useState(false);
  const [selectedKpiType, setSelectedKpiType] = useState<KpiType | null>(null);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
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
    setActiveWidgets(active);
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

  const updateWidgets = useCallback((updater: (current: string[]) => string[]) => {
    setActiveWidgets((current) => {
      const next = updater(current);
      syncWidgets(next);
      return next;
    });
  }, [syncWidgets]);

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
    .filter((widget): widget is WidgetDef => !!widget);

  const moveWidget = (widgetId: string, direction: -1 | 1) => {
    updateWidgets((current) => {
      const index = current.indexOf(widgetId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (draggedWidget && draggedWidget !== targetId) {
      updateWidgets((current) => reorder(current, draggedWidget, targetId));
    }
    setDraggedWidget(null);
  };

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
      const items: Array<{ type: KpiType; label: string; value: string | number; icon: LucideIcon; tone: string }> = [
        { type: 'rfqs', label: 'Open RFQs', value: kpis.openRfqs, icon: FileText, tone: 'bg-primary/10 text-primary' },
        { type: 'quotes', label: 'Quotations', value: kpis.totalQuotations, icon: Clock, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
        { type: 'orders', label: 'Active orders', value: kpis.activeOrders, icon: Package, tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
        { type: 'invoices', label: 'Pending invoices', value: kpis.pendingInvoices, icon: Receipt, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
        { type: 'quotes', label: 'Accepted quotes', value: kpis.acceptedQuotations, icon: CheckCircle2, tone: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
        { type: 'revenue', label: 'Revenue YTD', value: kpis.revenue, icon: TrendingUp, tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
      ];
      return (
        <WidgetPanel title="Business snapshot" icon={BarChart3}>
          <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button key={`${item.type}-${item.label}`} onClick={() => setSelectedKpiType(item.type)} className="flex min-h-28 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-accent/45 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 xl:flex-col xl:items-start">
                  <span className={cn('grid size-9 place-items-center rounded-xl ring-1 ring-current/10', item.tone)}><Icon size={17} /></span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{item.label}</span>
                    <span className="mt-1 block truncate text-xl font-semibold tracking-[-0.035em] text-foreground">{typeof item.value === 'number' ? <AnimatedNumber value={item.value} /> : item.value}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </WidgetPanel>
      );
    }

    if (id === 'deadlines') return (
      <WidgetPanel title="Upcoming deadlines" icon={Clock} action={<Button variant="ghost" size="sm" onClick={() => navigate('/vendor/rfqs')}>View all <ArrowRight /></Button>}>
        <div className="divide-y divide-border/60">
          {deadlines.length ? deadlines.map((deadline) => (
            <div key={deadline.rfqNumber} className="flex items-center gap-3 px-5 py-3.5">
              <span className={cn('size-2 shrink-0 rounded-full', deadline.urgent ? 'bg-destructive shadow-[0_0_0_4px_rgba(220,38,38,.09)]' : 'bg-emerald-500')} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-primary">{deadline.rfqNumber}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{deadline.title}</div>
              </div>
              <Badge tone={deadline.urgent ? 'danger' : 'neutral'}><Clock size={11} />{deadline.label}</Badge>
            </div>
          )) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No upcoming deadlines</div>}
        </div>
      </WidgetPanel>
    );

    if (id === 'activity') return (
      <WidgetPanel title="Recent activity" icon={FileText}>
        <div className="divide-y divide-border/60">
          {recentActivity.length ? recentActivity.map((activity, index) => (
            <div key={`${activity.time}-${index}`} className="flex gap-3 px-5 py-3.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300"><FileText size={14} /></span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-relaxed text-foreground">{activity.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">{activity.time}</p>
              </div>
            </div>
          )) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No recent activity</div>}
        </div>
      </WidgetPanel>
    );

    if (id === 'quicknav') {
      const actions = [
        { label: 'Submit quotation', description: 'Respond to open RFQs', icon: FileText, path: '/vendor/rfqs' },
        { label: 'Track orders', description: 'View fulfillment status', icon: Package, path: '/vendor/orders' },
        { label: 'Manage invoices', description: 'Upload and track invoices', icon: Receipt, path: '/vendor/invoices' },
        { label: 'My contracts', description: 'Review active agreements', icon: CheckCircle2, path: '/vendor/contracts' },
        { label: 'Company profile', description: 'Documents and compliance', icon: Building2, path: '/vendor/profile' },
      ];
      return (
        <WidgetPanel title="Quick actions" icon={Zap}>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button key={action.path} onClick={() => navigate(action.path)} className="group flex min-h-16 items-center gap-3 rounded-xl border border-transparent p-3 text-left transition hover:border-primary/15 hover:bg-primary/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{action.label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{action.description}</span></span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        </WidgetPanel>
      );
    }

    if (id === 'recent-quotations') return (
      <WidgetPanel title="Recent quotations" icon={CheckCircle2} action={<Button variant="ghost" size="sm" onClick={() => navigate('/vendor/quotations')}>View all <ArrowRight /></Button>}>
        <div className="divide-y divide-border/60">
          {quotations.length ? [...quotations].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()).slice(0, 5).map((quote) => {
            const accepted = ['ACCEPTED', 'APPROVED'].includes(quote.status);
            const rejected = quote.status === 'REJECTED';
            return (
              <button key={quote.id} onClick={() => navigate('/vendor/quotations')} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-primary">{quote.rfq?.rfqNumber || `#${quote.id}`}</span><Badge tone={accepted ? 'success' : rejected ? 'danger' : 'warning'}>{quote.status.replaceAll('_', ' ')}</Badge></div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{quote.rfq?.title || 'Quotation'} · {relativeTime(quote.submittedAt)}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatAmount(Number(quote.totalPrice), quote.currency || companyDefaultCurrency)}</span>
              </button>
            );
          }) : <div className="px-5 py-10 text-center text-sm text-muted-foreground">No quotations yet</div>}
        </div>
      </WidgetPanel>
    );

    if (id === 'alerts') return (
      <Card className={cn('flex items-start gap-3 p-4', alertText ? 'border-amber-500/25 bg-amber-500/[0.075]' : 'border-emerald-500/20 bg-emerald-500/[0.06]')}>
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', alertText ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300')}>
          {alertText ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        </span>
        <div><h2 className="text-sm font-semibold text-foreground">{alertText ? 'Action required' : 'You’re all caught up'}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{alertText || 'There are no urgent RFQ deadlines or overdue invoices.'}</p></div>
      </Card>
    );

    return null;
  };

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <PageFrame>
      <PageLead
        title="Vendor overview"
        description={`${user?.fullName ? `${user.fullName} · ` : ''}A live view of opportunities, orders, invoices, and account activity.`}
        actions={(
          <>
            <Badge className="min-h-10 rounded-xl px-3" tone="neutral"><CalendarDays size={14} />{today}</Badge>
            <Button variant="secondary" size="lg" onClick={() => setGalleryOpen(true)}><Sparkles /> Customize <Badge tone="primary" className="border-0 bg-primary text-primary-foreground">{activeWidgets.length}</Badge></Button>
          </>
        )}
      />

      {activeWidgetDefs.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Build your vendor workspace"
          description="Choose the information and shortcuts that matter to your team. Your layout is saved automatically."
          action={<Button onClick={() => setGalleryOpen(true)}><Sparkles /> Choose widgets</Button>}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/45 px-3.5 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span><strong className="font-semibold text-foreground">{activeWidgetDefs.length}</strong> active widgets</span>
            <span className="flex items-center gap-1.5"><GripVertical size={13} /> Drag cards or use the arrow controls to reorder</span>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {activeWidgetDefs.map((widget, index) => (
              <div
                key={widget.id}
                draggable
                onDragStart={() => setDraggedWidget(widget.id)}
                onDragEnd={() => setDraggedWidget(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, widget.id)}
                className={cn('group relative min-w-0 rounded-2xl transition duration-200', widget.fullWidth && 'xl:col-span-2', draggedWidget === widget.id && 'scale-[0.99] opacity-45', draggedWidget && draggedWidget !== widget.id && 'hover:ring-2 hover:ring-primary/20')}
              >
                <div className="absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-xl border border-border/70 bg-card/90 p-0.5 opacity-0 shadow-sm backdrop-blur-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveWidget(widget.id, -1)} aria-label={`Move ${widget.name} earlier`}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" disabled={index === activeWidgetDefs.length - 1} onClick={() => moveWidget(widget.id, 1)} aria-label={`Move ${widget.name} later`}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => updateWidgets((current) => current.filter((id) => id !== widget.id))} aria-label={`Remove ${widget.name}`}><X /></Button>
                </div>
                {renderWidget(widget.id)}
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={isGalleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="pr-10">
            <div className="mb-1 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"><Sparkles size={20} /></div>
            <DialogTitle>Customize your workspace</DialogTitle>
            <DialogDescription>Turn widgets on or off. Reorder active widgets directly on the dashboard.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[min(60vh,560px)] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {VENDOR_WIDGETS.map((widget) => {
              const Icon = widget.icon;
              const active = activeWidgets.includes(widget.id);
              return (
                <button
                  key={widget.id}
                  role="switch"
                  aria-checked={active}
                  onClick={() => updateWidgets((current) => current.includes(widget.id) ? current.filter((id) => id !== widget.id) : [...current, widget.id])}
                  className={cn('flex min-h-28 items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', active ? 'border-primary/35 bg-primary/[0.055]' : 'border-border/75 bg-card hover:border-primary/20 hover:bg-accent/35')}
                >
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-current/10', widget.tone)}><Icon size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-semibold text-foreground">{widget.name}{widget.fullWidth && <Badge>Wide</Badge>}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{widget.description}</span></span>
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-lg border', active ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-transparent')}><Check size={13} /></span>
                </button>
              );
            })}
          </div>
          <DialogFooter className="sm:justify-between"><span className="self-center text-xs text-muted-foreground">{activeWidgets.length} of {VENDOR_WIDGETS.length} active</span><Button onClick={() => setGalleryOpen(false)}>Done</Button></DialogFooter>
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
                <Card key={row.label} variant="soft" className="p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{row.label}</div><div className="mt-2 break-words text-2xl font-semibold tracking-[-0.04em] text-foreground">{row.value}</div><div className="mt-1 text-xs text-muted-foreground">{row.helper}</div></Card>
              ))}
            </div>
            <div className="rounded-xl border border-border/70 bg-secondary/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">Recent related activity</h3>
              <div className="mt-3 space-y-2">
                {(selectedKpiType === 'orders' ? deadlines.map((deadline) => ({ title: `${deadline.rfqNumber} · ${deadline.title}`, meta: deadline.label })) : recentActivity.map((activity) => ({ title: activity.text, meta: activity.time }))).slice(0, 4).map((item) => (
                  <div key={`${item.title}-${item.meta}`} className="flex items-start justify-between gap-4 rounded-lg bg-card px-3 py-2.5 text-sm"><span className="min-w-0 line-clamp-2 text-foreground">{item.title}</span><span className="shrink-0 text-xs text-muted-foreground">{item.meta}</span></div>
                ))}
                {(selectedKpiType === 'orders' ? deadlines : recentActivity).length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No recent activity</p>}
              </div>
            </div>
            <DialogFooter><Button onClick={() => setSelectedKpiType(null)}>Done</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}