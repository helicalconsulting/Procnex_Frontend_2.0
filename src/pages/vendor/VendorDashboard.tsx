import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { vendorPortalService, type VendorQuotationRow, type VendorWidgetPref } from '../../services/vendorPortalService';
import type { VendorOrderMock, VendorInvoiceMock } from '../../mocks/vendorPortal.mock';
import type { RFQ } from '../../types';
import {
  FileText,
  CheckCircle2,
  Package,
  DollarSign,
  Receipt,
  Clock,
  ArrowRight,
  AlertTriangle,
  TrendingUp,
  CalendarDays,
  Sparkles,
  X,
  GripVertical,
  LayoutGrid,
  Check,
  BarChart3,
  Zap,
  Building2,
  Minus,
  Maximize2,
  Minimize2,
  ChevronUp,
  ListChecks,
} from 'lucide-react';
import HeaderCalendarPopover from '../../components/layout/HeaderCalendarPopover';
import '../../styles/vendor-portal.css';
import '../dashboard/DashboardPage.css';
import '../rfq/RFQPage.css';
import './VendorDashboard.css';

// ─────────────────────────────────────────────────────────────
//  Helpers (unchanged from original VendorDashboard)
// ─────────────────────────────────────────────────────────────

function timeLeft(dateStr: string | null | undefined): { label: string; urgent: boolean } {
  if (!dateStr) return { label: '—', urgent: false };
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return { label: 'Overdue', urgent: true };
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return { label: `${hours}h left`, urgent: true };
  const days = Math.ceil(diff / 86400000);
  return { label: `${days}d left`, urgent: days <= 2 };
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#107e3e';
  if (score >= 60) return '#e9730c';
  if (score >= 40) return '#d97706';
  return '#bb0000';
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'rgba(16,126,62,0.1)';
  if (score >= 60) return 'rgba(233,115,12,0.1)';
  if (score >= 40) return 'rgba(217,119,6,0.1)';
  return 'rgba(187,0,0,0.08)';
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────
//  Widget definitions
// ─────────────────────────────────────────────────────────────

interface WidgetDef {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  fullWidth?: boolean;
  category: 'kpis' | 'data' | 'actions';
}

const VENDOR_WIDGETS: WidgetDef[] = [
  {
    id: 'kpis',
    name: 'KPI Overview',
    description: 'Open RFQs, quotations, orders, invoices and revenue at a glance.',
    icon: <BarChart3 size={20} />,
    accentColor: '#059669',
    fullWidth: true,
    category: 'kpis',
  },
  {
    id: 'deadlines',
    name: 'Upcoming Deadlines',
    description: 'RFQ closing dates sorted by urgency.',
    icon: <Clock size={20} />,
    accentColor: '#e9730c',
    category: 'data',
  },
  {
    id: 'activity',
    name: 'Recent Activity',
    description: 'Latest notifications and events from your account.',
    icon: <FileText size={20} />,
    accentColor: '#0a6ed1',
    category: 'data',
  },

  {
    id: 'quicknav',
    name: 'Quick Navigation',
    description: 'One-click shortcuts to submit quotations, track orders and more.',
    icon: <Zap size={20} />,
    accentColor: '#8b5cf6',
    category: 'actions',
  },
  {
    id: 'alerts',
    name: 'Action Alerts',
    description: 'Urgent items that need your immediate attention.',
    icon: <AlertTriangle size={20} />,
    accentColor: '#e9730c',
    fullWidth: true,
    category: 'data',
  },
  {
    id: 'recent-quotations',
    name: 'Recent Quotations',
    description: 'Latest submitted quotations with auto-calculated scores.',
    icon: <CheckCircle2 size={20} />,
    accentColor: '#059669',
    category: 'data',
  },
];



// ─────────────────────────────────────────────────────────────
//  Drag helpers
// ─────────────────────────────────────────────────────────────

interface DragState {
  widgetId: string;
  x: number; y: number;
  width: number; height: number;
  offsetX: number; offsetY: number;
}

function reorder(order: string[], from: string, to: string): string[] {
  const fi = order.indexOf(from);
  const ti = order.indexOf(to);
  if (fi === -1 || ti === -1 || fi === ti) return order;
  const next = [...order];
  const [item] = next.splice(fi, 1);
  next.splice(ti, 0, item);
  return next;
}

// ─────────────────────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────────────────────

export default function VendorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState<string>(companyDefaultCurrency);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDisplayCurrency(companyDefaultCurrency); }, [companyDefaultCurrency]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isCalendarOpen]);

  // ── Backend data (UNCHANGED logic from original) ─────────
  const { data: rfqs } = useServiceData(
    () => vendorPortalService.listRfqs(),
    [] as RFQ[],
  );
  const { data: quotations } = useServiceData(
    () => vendorPortalService.listQuotations(),
    [] as VendorQuotationRow[],
  );
  const { data: orders } = useServiceData(
    () => vendorPortalService.listOrders(),
    [] as VendorOrderMock[],
  );
  const { data: invoices } = useServiceData(
    () => vendorPortalService.listInvoices(),
    [] as VendorInvoiceMock[],
  );
  const { data: notifData } = useServiceData(
    () => vendorPortalService.listNotifications(),
    { notifications: [] as { type: string; title: string; message: string | null; createdAt: string }[], unreadCount: 0 } as { notifications: { type: string; title: string; message: string | null; createdAt: string }[]; unreadCount: number },
  );

  // ── Derived data (UNCHANGED logic from original) ─────────
  const kpis = useMemo(() => {
    const openRfqs = rfqs.filter(
      (r) => !('hasSubmittedQuotation' in r && (r as RFQ & { hasSubmittedQuotation?: boolean }).hasSubmittedQuotation)
    ).length;
    const totalQuotations = quotations.length;
    const acceptedQuotations = quotations.filter(
      (q) => q.status === 'ACCEPTED' || q.status === 'APPROVED'
    ).length;
    const activeOrders = orders.filter(
      (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
    ).length;
    const shippedOrders = orders.filter((o) => o.status === 'SHIPPED').length;
    const pendingInvoices = invoices.filter(
      (inv) => inv.status === 'PENDING' || inv.status === 'APPROVED'
    ).length;
    const overdueInvoices = invoices.filter((inv) => inv.status === 'OVERDUE').length;
    const paidTotal = invoices
      .filter((inv) => inv.status === 'PAID')
      .reduce((sum, inv) => sum + Number(inv.totalAmount || inv.amount || 0), 0);
    const revenueLabel = formatAmount(paidTotal, displayCurrency).replace(/^[^\d-]+/, '');
    const paidCount = invoices.filter((inv) => inv.status === 'PAID').length;
    return { openRfqs, totalQuotations, acceptedQuotations, activeOrders, shippedOrders, pendingInvoices, overdueInvoices, revenueLabel, paidCount };
  }, [rfqs, quotations, orders, invoices]);

  const deadlines = useMemo(() => {
    return rfqs
      .filter((r) => r.closingDate)
      .map((r) => ({ rfqNumber: r.rfqNumber, title: r.title, ...timeLeft(r.closingDate ?? null) }))
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return 0;
      })
      .slice(0, 5);
  }, [rfqs]);

  const recentActivity = useMemo(() => {
    const iconMap: Record<string, { cls: string }> = {
      RFQ_INVITED: { cls: 'blue' },
      QUOTATION_SUBMITTED: { cls: 'green' },
      QUOTATION_APPROVED: { cls: 'green' },
      QUOTATION_STATUS_CHANGED: { cls: 'green' },
      QUOTATION_REJECTED: { cls: 'orange' },
      PO_APPROVED: { cls: 'purple' },
      INVOICE_APPROVED: { cls: 'green' },
      INVOICE_REJECTED: { cls: 'orange' },
    };
    return (notifData?.notifications ?? []).slice(0, 5).map((n) => {
      const mapping = iconMap[n.type] || { cls: 'blue' };
      return {
        cls: mapping.cls,
        text: n.title + (n.message ? ` — ${n.message}` : ''),
        time: relativeTime(n.createdAt),
      };
    });
  }, [notifData]);

  const metrics = useMemo(() => {
    const total = quotations.length;
    const accepted = quotations.filter((q) => q.status === 'ACCEPTED' || q.status === 'APPROVED').length;
    const winRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
    const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
    const onTimeCount = deliveredOrders.filter((o) => {
      if (!o.deliveredDate || !o.expectedDelivery) return false;
      return new Date(o.deliveredDate) <= new Date(o.expectedDelivery);
    }).length;
    const onTimeRate = deliveredOrders.length > 0 ? Math.round((onTimeCount / deliveredOrders.length) * 100) : 0;
    const responseTimes = quotations
      .map((q) => {
        const submitted = new Date(q.submittedAt).getTime();
        const rfq = rfqs.find((r) => r.id === q.rfqId);
        const invited = rfq?.createdAt ? new Date(rfq.createdAt).getTime() : 0;
        if (!invited) return null;
        return (submitted - invited) / 86400000;
      })
      .filter((d): d is number => d !== null && d >= 0);
    const avgResponseDays = responseTimes.length > 0
      ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)
      : '—';
    return [
      { label: 'Quotation Win Rate', value: `${winRate}%`, pct: winRate, color: '#0a6ed1' },
      { label: 'On-Time Delivery', value: deliveredOrders.length > 0 ? `${onTimeRate}%` : '—', pct: onTimeRate, color: '#107e3e' },
      { label: 'Avg Response Time', value: avgResponseDays !== '—' ? `${avgResponseDays} days` : '—', pct: avgResponseDays !== '—' ? Math.min(100, Math.max(10, 100 - Number(avgResponseDays) * 15)) : 0, color: '#e9730c' },
    ];
  }, [quotations, orders, rfqs]);

  const alerts = useMemo(() => {
    const urgentRfqs = deadlines.filter((d) => d.urgent).length;
    const overdueInv = invoices.filter((inv) => inv.status === 'OVERDUE').length;
    const parts: string[] = [];
    if (urgentRfqs > 0) parts.push(`${urgentRfqs} RFQ deadline${urgentRfqs > 1 ? 's' : ''} within 24 hours`);
    if (overdueInv > 0) parts.push(`${overdueInv} invoice${overdueInv > 1 ? 's' : ''} overdue`);
    return parts.length > 0 ? parts.join('. ') + '.' : null;
  }, [deadlines, invoices]);

  // ── Widget state (all off by default, persisted in DB only) ─
  const [activeWidgets, setActiveWidgets] = useState<string[]>([]);
  const [isGalleryOpen, setGalleryOpen] = useState(false);

  const openGallery = () => setGalleryOpen(true);
  const closeGallery = () => setGalleryOpen(false);

  // ── KPI Modal state ──
  type KpiModalState = 'open' | 'expanded' | 'minimized';
  type KpiType = 'rfqs' | 'quotes' | 'orders' | 'invoices' | 'revenue';

  const [selectedKpiType, setSelectedKpiType] = useState<KpiType | null>(null);
  const [kpiModalState, setKpiModalState] = useState<KpiModalState>('open');

  const openKpiModal = (type: KpiType) => {
    setSelectedKpiType(type);
    setKpiModalState('open');
  };

  const closeKpiModal = () => setSelectedKpiType(null);

  const isKpiMinimized = !!selectedKpiType && kpiModalState === 'minimized';

  // Escape key for KPI modal
  useEffect(() => {
    if (!selectedKpiType) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeKpiModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKpiType]);

  useBodyScrollLock(!!(selectedKpiType && !isKpiMinimized));

  // Fetch widget preferences from backend on mount
  const { data: widgetPrefs } = useServiceData(
    () => vendorPortalService.getWidgetPreferences(),
    [] as VendorWidgetPref[],
  );

  // Apply backend preferences once loaded — order by sortOrder
  // New vendors (no saved prefs) start with an empty dashboard so they
  // must open the Widget Gallery and deliberately toggle what they want.
  useEffect(() => {
    if (!widgetPrefs || widgetPrefs.length === 0) {
      setActiveWidgets([]);
    } else {
      const active = widgetPrefs
        .filter((p) => p.isActive)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((p) => p.widgetId);
      setActiveWidgets(active);
    }
  }, [widgetPrefs]);

  // Debounced save to backend (avoids rapid toggles causing multiple calls)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncWidgets = useCallback((ids: string[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      vendorPortalService.saveWidgetPreferences(
        VENDOR_WIDGETS.map((w) => ({
          widgetId: w.id,
          isActive: ids.includes(w.id),
          sortOrder: ids.includes(w.id) ? ids.indexOf(w.id) : 0,
        }))
      ).catch((err) => {
        console.warn('[VendorDashboard] Failed to save widget prefs:', err);
      });
    }, 500);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setActiveWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      syncWidgets(next);
      return next;
    });
  }, [syncWidgets]);

  const removeWidget = useCallback((id: string) => {
    setActiveWidgets((prev) => {
      const next = prev.filter((w) => w !== id);
      syncWidgets(next);
      return next;
    });
  }, [syncWidgets]);

  const reorderWidgets = useCallback((next: string[]) => {
    setActiveWidgets(next);
    syncWidgets(next);
  }, [syncWidgets]);

  const isWidgetActive = useCallback((id: string) => activeWidgets.includes(id), [activeWidgets]);

  // Widgets that currently exist in the registry
  const availableWidgets = VENDOR_WIDGETS;
  const activeWidgetDefs = activeWidgets
    .map((id) => VENDOR_WIDGETS.find((w) => w.id === id))
    .filter(Boolean) as WidgetDef[];
  const hasWidgets = activeWidgetDefs.length > 0;

  useBodyScrollLock(isGalleryOpen);

  // Escape key closes gallery
  useEffect(() => {
    if (!isGalleryOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeGallery(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGalleryOpen]);

  // ── Drag state ───────────────────────────────────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragListenersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);
  const ghostContentRef = useRef<HTMLDivElement>(null);

  const draggedId = dragState?.widgetId ?? null;

  const cleanupDrag = useCallback(() => {
    if (dragListenersRef.current) {
      document.removeEventListener('pointermove', dragListenersRef.current.move);
      document.removeEventListener('pointerup', dragListenersRef.current.up);
      document.removeEventListener('pointercancel', dragListenersRef.current.up);
      dragListenersRef.current = null;
    }
  }, []);

  useEffect(() => () => { cleanupDrag(); document.body.classList.remove('vnd-is-dragging'); }, [cleanupDrag]);

  const findWidgetAtPoint = useCallback((cx: number, cy: number, exclude?: string) => {
    const el = document.elementFromPoint(cx, cy);
    const wrapper = el?.closest('[data-vnd-widget-id]') as HTMLElement | null;
    const id = wrapper?.dataset.vndWidgetId ?? null;
    return id && id !== exclude ? id : null;
  }, []);

  const finishDrag = useCallback((cx: number, cy: number, sourceId: string, fallback: string | null) => {
    const targetId = findWidgetAtPoint(cx, cy, sourceId) ?? fallback;
    if (targetId && targetId !== sourceId) {
      reorderWidgets(reorder(activeWidgets, sourceId, targetId));
    }
    cleanupDrag();
    setDragState(null);
    setDropTargetId(null);
    document.body.classList.remove('vnd-is-dragging');
    if (ghostContentRef.current) ghostContentRef.current.innerHTML = '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWidgets, cleanupDrag, findWidgetAtPoint]);

  const startDrag = useCallback((e: ReactPointerEvent, widgetId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const wrapper = (e.currentTarget as HTMLElement).closest('[data-vnd-widget-id]') as HTMLElement | null;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    setDragState({ widgetId, x: rect.left, y: rect.top, width: rect.width, height: rect.height, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
    setDropTargetId(null);
    document.body.classList.add('vnd-is-dragging');
    let latestTarget: string | null = null;
    const onMove = (ev: PointerEvent) => {
      setDragState((prev) => prev ? { ...prev, x: ev.clientX - prev.offsetX, y: ev.clientY - prev.offsetY } : null);
      latestTarget = findWidgetAtPoint(ev.clientX, ev.clientY, widgetId);
      setDropTargetId(latestTarget);
    };
    const onUp = (ev: PointerEvent) => { finishDrag(ev.clientX, ev.clientY, widgetId, latestTarget); };
    dragListenersRef.current = { move: onMove, up: onUp };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }, [findWidgetAtPoint, finishDrag]);

  const cancelDrag = useCallback(() => {
    cleanupDrag();
    setDragState(null);
    setDropTargetId(null);
    document.body.classList.remove('vnd-is-dragging');
    if (ghostContentRef.current) ghostContentRef.current.innerHTML = '';
  }, [cleanupDrag]);

  // Build ghost clone on drag start
  useEffect(() => {
    if (!dragState) return;
    const frame = requestAnimationFrame(() => {
      const wrapper = document.querySelector(`[data-vnd-widget-id="${dragState.widgetId}"]`) as HTMLElement | null;
      if (!wrapper || !ghostContentRef.current) return;
      const clone = wrapper.cloneNode(true) as HTMLElement;
      clone.classList.add('vnd-drag-ghost__clone');
      clone.querySelector('.vnd-widget__remove')?.remove();
      clone.querySelectorAll('.vnd-widget__drag-bar').forEach((b) => b.classList.add('vnd-widget__drag-bar--ghost'));
      ghostContentRef.current.innerHTML = '';
      ghostContentRef.current.appendChild(clone);
    });
    return () => cancelAnimationFrame(frame);
  }, [dragState?.widgetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Misc ─────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const groupedWidgets = (['kpis', 'data', 'actions'] as const).map((cat) => ({
    category: cat,
    label: cat === 'kpis' ? 'KPIs & Metrics' : cat === 'data' ? 'Data Views' : 'Actions & Shortcuts',
    widgets: availableWidgets.filter((w) => w.category === cat),
  })).filter((g) => g.widgets.length > 0);

  // ── Widget renderers ──────────────────────────────────────

  function renderWidget(id: string) {
    switch (id) {

      case 'kpis':
        return (
          <div className="dash-card">
            <div className="dash-card__header">
              <span className="dash-card__title">
                <BarChart3 size={16} /> KPI Overview
              </span>
            </div>
            <div className="dash-card__body" style={{ padding: 0 }}>
              <div className="dash-kpis">
                <button className="dash-kpi dash-kpi--rfq" onClick={() => openKpiModal('rfqs')}>
                  <div className="dash-kpi__icon"><FileText size={20} /></div>
                  <div className="dash-kpi__body">
                    <span className="dash-kpi__label">OPEN RFQS</span>
                    <span className="dash-kpi__value">{kpis.openRfqs}</span>
                  </div>
                </button>

                <button className="dash-kpi dash-kpi--approvals" onClick={() => openKpiModal('quotes')}>
                  <div className="dash-kpi__icon"><Clock size={20} /></div>
                  <div className="dash-kpi__body">
                    <span className="dash-kpi__label">PENDING EVAL</span>
                    <span className="dash-kpi__value">{kpis.openRfqs > 0 ? kpis.openRfqs : 0}</span>
                  </div>
                </button>

                <button className="dash-kpi dash-kpi--pos" onClick={() => openKpiModal('orders')}>
                  <div className="dash-kpi__icon"><Package size={20} /></div>
                  <div className="dash-kpi__body">
                    <span className="dash-kpi__label">ACTIVE ORDERS</span>
                    <span className="dash-kpi__value">{kpis.activeOrders}</span>
                  </div>
                </button>

                <button className="dash-kpi dash-kpi--vendors" onClick={() => openKpiModal('invoices')}>
                  <div className="dash-kpi__icon"><Receipt size={20} /></div>
                  <div className="dash-kpi__body">
                    <span className="dash-kpi__label">PENDING INVOICES</span>
                    <span className="dash-kpi__value">{kpis.pendingInvoices}</span>
                  </div>
                </button>

                <button className="dash-kpi dash-kpi--spend" onClick={() => openKpiModal('revenue')}>
                  <div className="dash-kpi__icon"><DollarSign size={20} /></div>
                  <div className="dash-kpi__body">
                    <span className="dash-kpi__label">QUOTATIONS</span>
                    <span className="dash-kpi__value">{kpis.totalQuotations}</span>
                  </div>
                </button>

                <button className="dash-kpi dash-kpi--lead" onClick={() => openKpiModal('revenue')}>
                  <div className="dash-kpi__icon"><TrendingUp size={20} /></div>
                  <div className="dash-kpi__body">
                    <span className="dash-kpi__label">REVENUE YTD</span>
                    <span className="dash-kpi__value">{kpis.revenueLabel}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        );

      case 'deadlines':
        return (
          <div className="dash-card">
            <div className="dash-card__header">
              <span className="dash-card__title">
                <Clock size={16} /> Upcoming Deadlines
              </span>
              <button className="vnd-card__action" onClick={() => navigate('/vendor/rfqs')}>
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div className="dash-card__body">
              <div className="vnd-deadlines">
                {deadlines.length > 0 ? deadlines.map((d) => (
                  <div key={d.rfqNumber} className="vnd-deadline-row">
                    <div className={`vnd-deadline-dot ${d.urgent ? 'vnd-deadline-dot--urgent' : ''}`} />
                    <div className="vnd-deadline-info">
                      <span className="vnd-deadline-rfq">{d.rfqNumber}</span>
                      <span className="vnd-deadline-title">{d.title}</span>
                    </div>
                    <span className={`vnd-deadline-time ${d.urgent ? 'vnd-deadline-time--urgent' : ''}`}>
                      <Clock size={12} /> {d.label}
                    </span>
                  </div>
                )) : (
                  <div className="vnd-empty-state">No upcoming deadlines</div>
                )}
              </div>
            </div>
          </div>
        );

      case 'activity':
        return (
          <div className="dash-card">
            <div className="dash-card__header">
              <span className="dash-card__title">
                <FileText size={16} /> Recent Activity
              </span>
            </div>
            <div className="dash-card__body">
              <div className="vnd-timeline">
                {recentActivity.length > 0 ? recentActivity.map((a, i) => (
                  <div key={i} className="vnd-tl-item">
                    <div className={`vnd-tl__dot vnd-tl__dot--${a.cls}`}>
                      <FileText size={13} />
                    </div>
                    <div className="vnd-tl__content">
                      <div className="vnd-tl__text">{a.text}</div>
                      <div className="vnd-tl__time">{a.time}</div>
                    </div>
                  </div>
                )) : (
                  <div className="vnd-empty-state">No recent activity</div>
                )}
              </div>
            </div>
          </div>
        );

      case 'quicknav':
        return (
          <div className="dash-card">
            <div className="dash-card__header">
              <span className="dash-card__title">
                <Zap size={16} /> Quick Actions
              </span>
            </div>
            <div className="dash-card__body">
              <div className="quick-actions">
                {[
                  { id: 'submit-quote', label: 'Submit Quotation', desc: 'Respond to open RFQs', icon: FileText, path: '/vendor/rfqs', accent: '#0a6ed1' },
                  { id: 'track-orders', label: 'Track Orders', desc: 'View shipment status', icon: Package, path: '/vendor/orders', accent: '#e9730c' },
                  { id: 'manage-invoices', label: 'Manage Invoices', desc: 'Upload & track invoices', icon: Receipt, path: '/vendor/invoices', accent: '#8b5cf6' },
                  { id: 'my-contracts', label: 'My Contracts', desc: 'View & sign agreements', icon: CheckCircle2, path: '/vendor/contracts', accent: '#0891b2' },
                  { id: 'company-profile', label: 'Company Profile', desc: 'Documents & compliance', icon: Building2, path: '/vendor/profile', accent: '#059669' },
                  { id: 'notifications', label: 'Notifications', desc: 'View system alerts', icon: Zap, path: '/notifications', accent: '#ec4899' },
                ].map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      className="quick-action"
                      onClick={() => navigate(action.path)}
                    >
                      <div
                        className="quick-action__icon"
                        style={{ background: `${action.accent}15`, color: action.accent }}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="quick-action__text">
                        <span className="quick-action__label">{action.label}</span>
                        <span className="quick-action__desc">{action.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'recent-quotations':
        return (
          <div className="vnd-card">
            <div className="vnd-card__header">
              <span className="vnd-card__title">
                <CheckCircle2 size={16} /> Recent Quotations
              </span>
              <button className="vnd-card__action" onClick={() => navigate('/vendor/quotations')}>
                View All <ArrowRight size={13} />
              </button>
            </div>
            <div className="vnd-card__body" style={{ padding: 0 }}>
              {quotations.length > 0 ? (
                [...quotations]
                  .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
                  .slice(0, 5)
                  .map((q) => {
                    const statusLabel: Record<string, { label: string; cls: string }> = {
                      SUBMITTED: { label: 'Pending', cls: 'pending' },
                      UNDER_REVIEW: { label: 'Under Review', cls: 'pending' },
                      ACCEPTED: { label: 'Accepted', cls: 'accepted' },
                      APPROVED: { label: 'Approved', cls: 'accepted' },
                      REJECTED: { label: 'Rejected', cls: 'rejected' },
                      RETURNED: { label: 'Returned', cls: 'progress' },
                    };
                    const st = statusLabel[q.status] || { label: q.status, cls: 'pending' };
                    return (
                      <div
                        key={q.id}
                        className="vnd-deadline-row"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate('/vendor/quotations')}
                      >
                        <div className={`vnd-deadline-info`} style={{ flex: 1, minWidth: 0 }}>
                          <span className="vnd-deadline-rfq" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {q.rfq?.rfqNumber || `#${q.id}`}
                            <span className={`vendor-badge vendor-badge--${st.cls}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                              {st.label}
                            </span>
                          </span>
                          <span className="vnd-deadline-title">
                            {q.rfq?.title || ''} · {relativeTime(q.submittedAt)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {formatAmount(Number(q.totalPrice), q.currency || displayCurrency)}
                          </span>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="vnd-empty-state" style={{ padding: '20px 16px' }}>No quotations yet</div>
              )}
            </div>
          </div>
        );

      case 'alerts':
        if (!alerts) return null;
        return (
          <div className="vnd-alert-card">
            <AlertTriangle size={18} className="vnd-alert-icon" />
            <div>
              <span className="vnd-alert-title">Action Required</span>
              <span className="vnd-alert-text">{alerts}</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="dashboard">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-header__text">
          <h1>Vendor Portal Overview</h1>
          <p>
            {user?.fullName ? `${user.fullName} · ` : ''}Real-time RFQs, quotations, active orders &amp; financial metrics
          </p>
        </div>
        <div className="dash-header__actions">
          <div style={{ position: 'relative' }} ref={calendarRef}>
            <button
              className={`dash-header__date ${isCalendarOpen ? 'dash-header__date--active' : ''}`}
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              title="Click to open laptop calendar"
              style={{ cursor: 'pointer' }}
            >
              <CalendarDays size={15} />
              <span>{today}</span>
            </button>
            {isCalendarOpen && (
              <HeaderCalendarPopover onClose={() => setIsCalendarOpen(false)} />
            )}
          </div>
          <button className="dash-customize-btn" onClick={openGallery}>
            <Sparkles size={16} />
            <span>Customize</span>
            {hasWidgets && (
              <span className="dash-customize-btn__badge">{activeWidgets.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Hero strip ─────────────────────────────────────── */}
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

      {/* ── Empty state ────────────────────────────────────── */}
      {!hasWidgets && (
        <div className="dash-empty">
          <div className="dash-empty__visual">
            <div className="dash-empty__ring dash-empty__ring--1" />
            <div className="dash-empty__ring dash-empty__ring--2" />
            <div className="dash-empty__ring dash-empty__ring--3" />
            <div className="dash-empty__icon">
              <LayoutGrid size={48} />
            </div>
          </div>
          <h2 className="dash-empty__title">Your Portal, Your Way</h2>
          <p className="dash-empty__subtitle">
            Add widgets to build your personalized vendor command center.
            Choose exactly the data that matters to your business.
          </p>
          <button className="dash-empty__cta" onClick={openGallery}>
            <Sparkles size={18} />
            Open Widget Gallery
          </button>
          <div className="dash-empty__particles">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`dash-empty__particle dash-empty__particle--${i + 1}`} />
            ))}
          </div>
        </div>
      )}

      {/* ── Widget grid ────────────────────────────────────── */}
      {hasWidgets && (
        <div className={`dash-widget-grid${draggedId ? ' dash-widget-grid--dragging' : ''}`}>
          {activeWidgetDefs.map((widget, index) => {
            const isDragging = draggedId === widget.id;
            const isDropTarget = dropTargetId === widget.id;
            const content = renderWidget(widget.id);
            if (!content) return null;

            return (
              <div
                key={widget.id}
                data-vnd-widget-id={widget.id}
                className={[
                  'dash-widget-wrapper',
                  widget.fullWidth ? 'dash-widget-wrapper--full' : '',
                  isDragging ? 'dash-widget-wrapper--dragging' : '',
                  isDropTarget ? 'dash-widget-wrapper--drop-target' : '',
                ].filter(Boolean).join(' ')}
                style={{ animationDelay: `${index * 0.06}s` }}
              >
                {/* Drag handle */}
                <div
                  className="dash-widget__drag-bar"
                  onPointerDown={(e) => startDrag(e, widget.id)}
                  title={`Drag ${widget.name} to reorder`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Drag ${widget.name} to reorder`}
                  onKeyDown={(e) => { if (e.key === 'Escape') cancelDrag(); }}
                >
                  <GripVertical size={16} className="dash-widget__drag-bar-icon" />
                  <span className="dash-widget__drag-bar-hint">Drag to reorder</span>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  className="dash-widget__remove"
                  onClick={() => removeWidget(widget.id)}
                  title={`Remove ${widget.name}`}
                  aria-label={`Remove ${widget.name}`}
                >
                  <X size={14} />
                </button>

                {/* Widget content */}
                <div className="dash-widget-content">
                  {content}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Drag ghost ─────────────────────────────────────── */}
      {dragState && createPortal(
        <div
          className="vnd-drag-ghost"
          style={{ left: dragState.x, top: dragState.y, width: dragState.width }}
          aria-hidden
        >
          <div ref={ghostContentRef} className="vnd-drag-ghost__content" />
        </div>,
        document.body
      )}

      {/* ── KPI Modal ────────────────────────────────────────── */}
      {selectedKpiType && createPortal(
        <>
          {(kpiModalState === 'open' || kpiModalState === 'expanded') && (
            <div
              className={`rfq-modal-backdrop ${kpiModalState === 'expanded' ? 'rfq-modal-backdrop--expanded' : ''}`}
              onClick={closeKpiModal}
            />
          )}

          <div
            className={[
              'rfq-modal',
              'vnd-kpi-modal',
              kpiModalState === 'open' ? 'rfq-modal--open' : '',
              kpiModalState === 'expanded' ? 'rfq-modal--expanded' : '',
              isKpiMinimized ? 'rfq-modal--minimized' : '',
            ].filter(Boolean).join(' ')}
            style={kpiModalState === 'expanded' ? {
              position: 'fixed',
              inset: 0,
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              maxHeight: '100vh',
              borderRadius: 0,
              transform: 'none',
            } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rfq-modal__drag-handle" />

            <div
              className="rfq-modal__header"
              onClick={isKpiMinimized ? () => setKpiModalState('open') : undefined}
              style={isKpiMinimized ? { cursor: 'pointer' } : undefined}
            >
              <div className="rfq-modal__header-left">
                <span className="rfq-modal__rfq-num">KPI</span>
                {!isKpiMinimized && (
                  <span className="dash-kpi-modal__header-title">
                    {selectedKpiType === 'rfqs' ? 'Open RFQs' :
                     selectedKpiType === 'quotes' ? 'Quotations' :
                     selectedKpiType === 'orders' ? 'Active Orders' :
                     selectedKpiType === 'invoices' ? 'Pending Invoices' :
                     'Revenue (YTD)'}
                  </span>
                )}
                {isKpiMinimized && (
                  <span className="rfq-modal__minimized-title">
                    {selectedKpiType === 'rfqs' ? 'Open RFQs' :
                     selectedKpiType === 'quotes' ? 'Quotations' :
                     selectedKpiType === 'orders' ? 'Active Orders' :
                     selectedKpiType === 'invoices' ? 'Pending Invoices' :
                     'Revenue (YTD)'}
                  </span>
                )}
              </div>

              <div className="rfq-modal__window-controls" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="rfq-modal__wc-btn"
                  title={isKpiMinimized ? 'Restore' : 'Minimize'}
                  onClick={() => setKpiModalState(isKpiMinimized ? 'open' : 'minimized')}
                >
                  {isKpiMinimized ? <ChevronUp size={14} /> : <Minus size={14} />}
                </button>
                {!isKpiMinimized && (
                  <button
                    type="button"
                    className="rfq-modal__wc-btn"
                    title={kpiModalState === 'expanded' ? 'Restore' : 'Expand'}
                    onClick={() => setKpiModalState(kpiModalState === 'expanded' ? 'open' : 'expanded')}
                  >
                    {kpiModalState === 'expanded' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                )}
                <div className="rfq-modal__wc-divider" />
                <button
                  type="button"
                  className="rfq-modal__wc-btn rfq-modal__wc-btn--close"
                  title="Close"
                  onClick={closeKpiModal}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {!isKpiMinimized && (
              <>
                {/* Hero */}
                <div className="rfq-modal__hero dash-kpi-modal__hero">
                  <div className={`dash-kpi-modal__hero-icon ${{
                    rfqs: 'dash-kpi-modal__hero-icon--rfq',
                    quotes: 'dash-kpi-modal__hero-icon--vendors',
                    orders: 'dash-kpi-modal__hero-icon--pos',
                    invoices: 'dash-kpi-modal__hero-icon--lead',
                    revenue: 'dash-kpi-modal__hero-icon--spend',
                  }[selectedKpiType]}`}>
                    {selectedKpiType === 'rfqs' ? <FileText size={22} /> :
                     selectedKpiType === 'quotes' ? <CheckCircle2 size={22} /> :
                     selectedKpiType === 'orders' ? <Package size={22} /> :
                     selectedKpiType === 'invoices' ? <Receipt size={22} /> :
                     <DollarSign size={22} />}
                  </div>
                  <div className="dash-kpi-modal__hero-copy">
                    <h2 className="rfq-modal__title">
                      {selectedKpiType === 'rfqs' ? 'Open RFQs' :
                       selectedKpiType === 'quotes' ? 'Quotations' :
                       selectedKpiType === 'orders' ? 'Active Orders' :
                       selectedKpiType === 'invoices' ? 'Pending Invoices' :
                       'Revenue (YTD)'}
                    </h2>
                    <p className="rfq-modal__description">
                      {selectedKpiType === 'rfqs' ? `${kpis.openRfqs} RFQs awaiting your response. Submit quotations before deadlines.` :
                       selectedKpiType === 'quotes' ? `${kpis.totalQuotations} quotations submitted, ${kpis.acceptedQuotations} accepted.` :
                       selectedKpiType === 'orders' ? `${kpis.activeOrders} active orders, ${kpis.shippedOrders} dispatched.` :
                       selectedKpiType === 'invoices' ? `${kpis.pendingInvoices} pending invoices, ${kpis.overdueInvoices} overdue.` :
                       `${kpis.paidCount} orders paid totaling ${kpis.revenueLabel}.`}
                    </p>
                  </div>
                </div>

                {/* Body */}
                <div className="rfq-modal__body sap-kpi-modal-body">
                  {/* Summary Metrics Section */}
                  <div className="sap-kpi-section">
                    <div className="sap-kpi-section__title">
                      <BarChart3 size={13} /> Key Overview Metrics
                    </div>
                    <div className="rfq-modal__info-grid dash-kpi-modal__info-grid">
                      {(() => {
                        const rows: Array<{ label: string; value: string; helper?: string }> =
                          selectedKpiType === 'rfqs' ? [
                            { label: 'Open RFQs', value: String(kpis.openRfqs), helper: 'Pending your response' },
                            { label: 'Total RFQs', value: String(rfqs.length), helper: 'All time' },
                            { label: 'Active Deadlines', value: String(deadlines.length), helper: 'Closing soon' },
                          ] : selectedKpiType === 'quotes' ? [
                            { label: 'Total Submitted', value: String(kpis.totalQuotations), helper: 'All quotations' },
                            { label: 'Accepted', value: String(kpis.acceptedQuotations), helper: 'Won bids' },
                            { label: 'Win Rate', value: kpis.totalQuotations > 0 ? `${Math.round((kpis.acceptedQuotations / kpis.totalQuotations) * 100)}%` : '—' },
                          ] : selectedKpiType === 'orders' ? [
                            { label: 'Active Orders', value: String(kpis.activeOrders), helper: 'In progress' },
                            { label: 'Dispatched', value: String(kpis.shippedOrders), helper: 'On the way' },
                            { label: 'Total Orders', value: String(orders.length), helper: 'All orders' },
                          ] : selectedKpiType === 'invoices' ? [
                            { label: 'Pending', value: String(kpis.pendingInvoices), helper: 'Awaiting payment' },
                            { label: 'Overdue', value: String(kpis.overdueInvoices), helper: 'Past due date' },
                            { label: 'Total Invoices', value: String(invoices.length), helper: 'All invoices' },
                          ] : [
                            { label: 'Revenue (YTD)', value: kpis.revenueLabel, helper: 'Year to date' },
                            { label: 'Paid Orders', value: String(kpis.paidCount), helper: 'Completed payments' },
                          ];
                        return rows.map((row) => (
                          <div key={row.label} className="rfq-modal__info-item sap-kpi-card">
                            <span className="rfq-modal__info-label"><BarChart3 size={12} /> {row.label}</span>
                            <span className="rfq-modal__info-value">{row.value}</span>
                            {row.helper && <span className="dash-kpi-modal__helper">{row.helper}</span>}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>


                  {/* Related Activity Section */}
                  <div className="sap-kpi-section" style={{ marginTop: 18 }}>
                    <div className="sap-kpi-section__title">
                      <CalendarDays size={13} /> Recent Related Activity
                    </div>
                    <div className="rfq-modal__quotations-panel sap-kpi-panel">
                      {selectedKpiType === 'quotes' ? (
                        metrics.length > 0 ? (
                          metrics.map((m) => (
                            <div key={m.label} className="rfq-modal__quotation-row">
                              <div className="rfq-modal__quotation-info">
                                <span className="rfq-modal__vendor-name">{m.label}</span>
                              </div>
                              <div className="rfq-modal__quotation-right">
                                <span className="rfq-modal__quotation-price">{m.value}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rfq-modal__no-vendors">
                            <FileText size={22} />
                            <p>No performance data available yet.</p>
                          </div>
                        )
                      ) : selectedKpiType === 'orders' ? (
                        deadlines.length > 0 ? (
                          deadlines.map((d) => (
                            <div key={d.rfqNumber} className="rfq-modal__quotation-row">
                              <div className="rfq-modal__quotation-info">
                                <span className="rfq-modal__vendor-name">{d.rfqNumber}</span>
                                <span className="rfq-modal__quotation-meta">{d.title}</span>
                              </div>
                              <div className="rfq-modal__quotation-right">
                                <span className="rfq-modal__quotation-status">{d.label}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rfq-modal__no-vendors">
                            <FileText size={22} />
                            <p>No upcoming deadlines.</p>
                          </div>
                        )
                      ) : (
                        recentActivity.length > 0 ? (
                          recentActivity.map((a, i) => (
                            <div key={i} className="rfq-modal__quotation-row">
                              <div className="rfq-modal__quotation-info">
                                <span className="rfq-modal__vendor-name">{a.text}</span>
                                <span className="rfq-modal__quotation-meta">{a.time}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rfq-modal__no-vendors">
                            <FileText size={22} />
                            <p>No recent activity.</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}

      {/* ── Widget gallery drawer ───────────────────────────── */}
      {createPortal(
        <>
          <div
            className={`vnd-gallery-backdrop ${isGalleryOpen ? 'vnd-gallery-backdrop--visible' : ''}`}
            onClick={closeGallery}
          />
          <aside
            className={`vnd-gallery ${isGalleryOpen ? 'vnd-gallery--open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vnd-gallery-title"
          >
            <div className="vnd-gallery__header">
              <div className="vnd-gallery__header-text">
                <Sparkles size={20} />
                <div>
                  <h2 id="vnd-gallery-title">Widget Gallery</h2>
                  <p>Toggle widgets on or off</p>
                </div>
              </div>
              <button className="vnd-gallery__close" onClick={closeGallery} aria-label="Close gallery">
                <X size={20} />
              </button>
            </div>

            <div className="vnd-gallery__body">
              {groupedWidgets.map((group) => (
                <div key={group.category} className="vnd-gallery__section">
                  <h3 className="vnd-gallery__section-title">{group.label}</h3>
                  <div className="vnd-gallery__cards">
                    {group.widgets.map((widget, idx) => {
                      const active = isWidgetActive(widget.id);
                      return (
                        <button
                          key={widget.id}
                          className={`vnd-gallery-card ${active ? 'vnd-gallery-card--active' : ''}`}
                          onClick={() => toggleWidget(widget.id)}
                          style={{
                            animationDelay: `${idx * 0.05}s`,
                            '--widget-accent': widget.accentColor,
                          } as React.CSSProperties}
                        >
                          <div className="vnd-gallery-card__top">
                            <div
                              className="vnd-gallery-card__icon"
                              style={{ background: `${widget.accentColor}18`, color: widget.accentColor }}
                            >
                              {widget.icon}
                            </div>
                            <div className={`vnd-gallery-card__toggle ${active ? 'vnd-gallery-card__toggle--on' : ''}`}>
                              <div className="vnd-gallery-card__toggle-knob">
                                {active && <Check size={10} />}
                              </div>
                            </div>
                          </div>
                          <div className="vnd-gallery-card__info">
                            <span className="vnd-gallery-card__name">{widget.name}</span>
                            <span className="vnd-gallery-card__desc">{widget.description}</span>
                          </div>
                          {widget.fullWidth && (
                            <span className="vnd-gallery-card__badge">Full Width</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="vnd-gallery__footer">
              <span className="vnd-gallery__footer-count">
                {activeWidgets.length} of {availableWidgets.length} widgets active
              </span>
              <button className="vnd-gallery__footer-btn" onClick={closeGallery}>
                Done
              </button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}