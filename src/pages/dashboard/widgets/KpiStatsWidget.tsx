import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  ShoppingCart,
  Users,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { useCurrency } from '../../../components/shared/CurrencyMaster';
import type { DashboardPipelineItem, DashboardRecentRfq, KpiItem } from '../../../types/viewModels';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Badge } from '../../../components/ui/badge';
import { WidgetLoading } from './WidgetShell';

interface DashboardOverview {
  rfqs: { total: number; draft: number; sent: number; pendingApproval: number };
  quotations: { active: number };
  purchaseOrders: { total: number };
  vendors: { total: number; pendingApproval: number };
}

interface SpendOverview {
  monthlyTrend: Array<{ month: string; value: number }>;
  categories: Array<{ label: string; amount: number; percent: number }>;
}

interface TopVendor {
  name: string;
  initials: string;
  pos: number;
  score: number;
  quality: number;
  delivery: number;
  avatarMod: string;
}

interface DetailRow {
  label: string;
  value: string;
  helper?: string;
  link?: string;
}

const KPI_ICONS: Record<string, typeof FileText> = {
  rfq: FileText,
  approvals: Clock,
  pos: ShoppingCart,
  vendors: Users,
  spend: TrendingUp,
  lead: Timer,
  quotes: FileText,
  tasks: Timer,
};

const KPI_TONES: Record<string, { icon: string; glow: string }> = {
  rfq: { icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-300', glow: 'hover:border-blue-500/25' },
  approvals: { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-300', glow: 'hover:border-amber-500/25' },
  pos: { icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-300', glow: 'hover:border-violet-500/25' },
  vendors: { icon: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300', glow: 'hover:border-cyan-500/25' },
  spend: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', glow: 'hover:border-emerald-500/25' },
  lead: { icon: 'bg-pink-500/10 text-pink-600 dark:text-pink-300', glow: 'hover:border-pink-500/25' },
  quotes: { icon: 'bg-sky-500/10 text-sky-600 dark:text-sky-300', glow: 'hover:border-sky-500/25' },
  tasks: { icon: 'bg-orange-500/10 text-orange-600 dark:text-orange-300', glow: 'hover:border-orange-500/25' },
};

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'neutral' }) {
  if (direction === 'up') return <TrendingUp size={14} />;
  if (direction === 'down') return <TrendingDown size={14} />;
  return <Minus size={14} />;
}

function getKpiKey(kpi: KpiItem) {
  return kpi.id === 'quotes' ? 'quotes' : kpi.modifier || kpi.id;
}

function getKpiDescription(kpi: KpiItem) {
  const key = getKpiKey(kpi);
  const descriptions: Record<string, string> = {
    rfq: 'Current RFQ activity, draft work, and recent procurement requests.',
    approvals: 'RFQs waiting for evaluation or approval action.',
    pos: 'Purchase order volume visible in the dashboard overview.',
    vendors: 'Vendor base health, including active and pending vendor records.',
    spend: 'Quotation and spend movement from current dashboard reports.',
    lead: 'Task and timing signals for follow-up work.',
    quotes: 'Active quotation activity connected to recent RFQs.',
  };
  return descriptions[key] || 'Dashboard metric details and related activity.';
}

function buildSummaryRows(kpi: KpiItem, overview: DashboardOverview | null): DetailRow[] {
  const key = getKpiKey(kpi);
  const base = [
    { label: 'Current Value', value: kpi.value },
    { label: 'Signal', value: kpi.trend || 'No trend available' },
  ];

  if (!overview) return base;

  const details: Record<string, DetailRow[]> = {
    rfq: [
      { label: 'Total RFQs', value: String(overview.rfqs.total) },
      { label: 'Draft RFQs', value: String(overview.rfqs.draft) },
      { label: 'Sent RFQs', value: String(overview.rfqs.sent) },
    ],
    approvals: [
      { label: 'Pending Evaluation', value: String(overview.rfqs.pendingApproval) },
      { label: 'Draft RFQs', value: String(overview.rfqs.draft), helper: 'May need completion before sending' },
      { label: 'Sent RFQs', value: String(overview.rfqs.sent), helper: 'Already with vendors' },
    ],
    pos: [
      { label: 'Purchase Orders', value: String(overview.purchaseOrders.total) },
      { label: 'Open RFQs', value: String(overview.rfqs.total), helper: 'Potential PO source' },
      { label: 'Active Quotations', value: String(overview.quotations.active) },
    ],
    vendors: [
      { label: 'Active Vendors', value: String(overview.vendors.total) },
      { label: 'Pending Approval', value: String(overview.vendors.pendingApproval) },
      { label: 'Vendor Coverage', value: overview.vendors.total > 0 ? 'Available' : 'No vendors yet' },
    ],
    spend: [
      { label: 'Active Quotations', value: String(overview.quotations.active) },
      { label: 'Open RFQs', value: String(overview.rfqs.total) },
      { label: 'Purchase Orders', value: String(overview.purchaseOrders.total) },
    ],
    quotes: [
      { label: 'Active Quotations', value: String(overview.quotations.active) },
      { label: 'Pending Evaluation', value: String(overview.rfqs.pendingApproval) },
      { label: 'Open RFQs', value: String(overview.rfqs.total) },
    ],
    lead: [
      { label: 'My Tasks', value: kpi.value },
      { label: 'Pending Evaluation', value: String(overview.rfqs.pendingApproval) },
      { label: 'Pending Vendors', value: String(overview.vendors.pendingApproval) },
    ],
  };

  return details[key] || base;
}

function buildBreakdownRows(
  kpi: KpiItem,
  pipeline: DashboardPipelineItem[],
  spend: SpendOverview | null,
  topVendors: TopVendor[],
  myTasks: { tasks: Array<{ type: string; count: number; label: string; link: string }>; taskCount: number },
  formatMoney: (n: number) => string
): DetailRow[] {
  const key = getKpiKey(kpi);

  if (key === 'lead') {
    return myTasks.tasks.length
      ? myTasks.tasks.map((t) => ({
          label: t.label,
          value: String(t.count),
          helper: `${t.count} pending`,
          link: t.link,
        }))
      : [{ label: 'My Tasks', value: 'No pending tasks', helper: 'Everything looks good!' }];
  }

  if (key === 'vendors') {
    return topVendors.length
      ? topVendors.map((vendor) => ({
          label: vendor.name,
          value: `${vendor.score}% overall`,
          helper: `Quality: ${vendor.quality}% · Delivery: ${vendor.delivery}% · ${vendor.pos} orders`,
        }))
      : [{ label: 'Top Vendors', value: 'No vendor details available' }];
  }

  if (key === 'spend' || key === 'quotes') {
    const categories = spend?.categories || [];
    return categories.length
      ? categories.map((cat) => ({
          label: cat.label,
          value: formatMoney(cat.amount),
          helper: `${cat.percent}% of tracked spend`,
        }))
      : [{ label: 'Spend Breakdown', value: 'No spend data available' }];
  }

  if (pipeline.length) {
    return pipeline.map((stage) => ({
      label: stage.label,
      value: String(stage.count),
      helper: stage.status,
    }));
  }

  return [{ label: 'Breakdown', value: 'No breakdown available' }];
}

function getRelatedRfqs(kpi: KpiItem, recentRfqs: DashboardRecentRfq[]) {
  const key = getKpiKey(kpi);
  if (key === 'approvals') {
    return recentRfqs.filter((rfq) => rfq.status === 'IN_PROGRESS' || rfq.quotations > 0);
  }
  if (key === 'quotes') {
    return recentRfqs.filter((rfq) => rfq.quotations > 0);
  }
  if (key === 'rfq' || key === 'spend' || key === 'lead' || key === 'pos') {
    return recentRfqs;
  }
  return [];
}

export default function KpiStatsWidget() {
  const navigate = useNavigate();
  const [selectedKpi, setSelectedKpi] = useState<KpiItem | null>(null);

  const { data: kpis, loading, error } = useServiceData(
    () => dashboardService.getKpis(),
    [] as KpiItem[],
    [],
    { cacheKey: 'dashboard-kpis' }
  );
  const { data: overview } = useServiceData(
    () => dashboardService.getOverview(),
    null as DashboardOverview | null,
    [],
    { cacheKey: 'dashboard-kpi-overview' }
  );
  const { data: pipeline } = useServiceData(
    () => dashboardService.getPipeline(),
    [] as DashboardPipelineItem[],
    [],
    { cacheKey: 'dashboard-kpi-pipeline' }
  );
  const { data: recentRfqs } = useServiceData(
    () => dashboardService.getRecentRfqs(),
    [] as DashboardRecentRfq[],
    [],
    { cacheKey: 'dashboard-kpi-recent-rfqs' }
  );
  const { data: spend } = useServiceData(
    () => dashboardService.getSpendOverview(),
    null as SpendOverview | null,
    [],
    { cacheKey: 'dashboard-kpi-spend' }
  );
  const { data: topVendors } = useServiceData(
    () => dashboardService.getTopVendors(),
    [] as TopVendor[],
    [],
    { cacheKey: 'dashboard-kpi-top-vendors' }
  );

  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const formatMoney = useCallback(
    (n: number) => formatAmount(n, companyDefaultCurrency),
    [formatAmount, companyDefaultCurrency]
  );

  const { data: myTasks } = useServiceData(
    () => dashboardService.getMyTasks(),
    { tasks: [], taskCount: 0 },
    [],
    { cacheKey: 'dashboard-kpi-my-tasks' }
  );

  const selectedIcon = useMemo(() => {
    if (!selectedKpi) return FileText;
    return KPI_ICONS[selectedKpi.modifier] || KPI_ICONS[selectedKpi.id] || FileText;
  }, [selectedKpi]);

  const summaryRows = useMemo(
    () => (selectedKpi ? buildSummaryRows(selectedKpi, overview) : []),
    [overview, selectedKpi]
  );

  const breakdownRows = useMemo(
    () => (selectedKpi ? buildBreakdownRows(selectedKpi, pipeline, spend, topVendors, myTasks, formatMoney) : []),
    [pipeline, selectedKpi, spend, topVendors, myTasks, formatMoney]
  );

  const relatedRfqs = useMemo(
    () => (selectedKpi ? getRelatedRfqs(selectedKpi, recentRfqs) : []),
    [recentRfqs, selectedKpi]
  );

  const openKpi = (kpi: KpiItem) => {
    setSelectedKpi(kpi);
  };

  const closeModal = () => setSelectedKpi(null);

  const handleTaskClick = useCallback((link: string) => {
    navigate(link);
    closeModal();
  }, [navigate]);

  if (error) {
    return <MessageStrip type="error">{error}</MessageStrip>;
  }

  if (loading) {
    return <WidgetLoading>Loading KPIs…</WidgetLoading>;
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = KPI_ICONS[kpi.modifier] || KPI_ICONS[kpi.id] || FileText;
          const tone = KPI_TONES[getKpiKey(kpi)] || KPI_TONES.rfq;
          return (
            <button
              key={kpi.id}
              type="button"
              className={`group flex min-h-[112px] items-start gap-3 rounded-2xl border border-border/80 bg-card p-4 text-left shadow-sm outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring ${tone.glow}`}
              onClick={() => openKpi(kpi)}
              aria-label={`Open ${kpi.label} details`}
            >
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
                <Icon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{kpi.label}</span>
                <span className="mt-1.5 block text-2xl font-semibold leading-none tracking-[-0.035em] tabular-nums text-foreground">{kpi.value}</span>
                {kpi.trend && (
                  <span className={`mt-2 flex items-center gap-1 text-[10px] font-medium ${kpi.direction === 'down' ? 'text-rose-600 dark:text-rose-300' : kpi.direction === 'up' ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                    <TrendIcon direction={kpi.direction} /> {kpi.trend}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selectedKpi} onOpenChange={(open) => !open && closeModal()}>
        {selectedKpi && (
          <DialogContent className="max-h-[min(90vh,860px)] max-w-4xl gap-0 overflow-hidden p-0">
            <div className="border-b border-border bg-muted/35 px-5 py-5 pr-14 sm:px-7">
              <div className="flex items-start gap-4">
                <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${KPI_TONES[getKpiKey(selectedKpi)]?.icon || KPI_TONES.rfq.icon}`}>
                  {(() => { const Icon = selectedIcon; return <Icon size={21} />; })()}
                </div>
                <DialogHeader className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">KPI details</span>
                  <DialogTitle className="text-xl">{selectedKpi.label}</DialogTitle>
                  <DialogDescription>{getKpiDescription(selectedKpi)}</DialogDescription>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge tone="primary"><BarChart3 size={11} /> Value {selectedKpi.value}</Badge>
                    {selectedKpi.trend && <Badge tone={selectedKpi.direction === 'down' ? 'danger' : selectedKpi.direction === 'up' ? 'success' : 'neutral'}><TrendIcon direction={selectedKpi.direction} /> {selectedKpi.trend}</Badge>}
                  </div>
                </DialogHeader>
              </div>
            </div>

            <div className="grid gap-7 overflow-y-auto p-5 sm:p-7">
              {summaryRows.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><BarChart3 size={14} /> Overview</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {summaryRows.map((row) => (
                      <div key={row.label} className="rounded-xl border border-border/80 bg-card p-4">
                        <span className="block text-[11px] font-medium text-muted-foreground">{row.label}</span>
                        <span className="mt-1 block text-lg font-semibold tabular-nums text-foreground">{row.value}</span>
                        {row.helper && <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{row.helper}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {breakdownRows.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><BarChart3 size={14} /> Breakdown</h3>
                  <div className="overflow-hidden rounded-xl border border-border/80">
                    {breakdownRows.slice(0, 6).map((row) => (
                      <button key={`${row.label}-${row.value}`} type="button" disabled={!row.link} onClick={() => row.link && handleTaskClick(row.link)} className="flex min-h-14 w-full items-center justify-between gap-4 border-b border-border/70 px-4 py-2.5 text-left last:border-b-0 enabled:outline-none enabled:transition-colors enabled:hover:bg-muted/50 enabled:focus-visible:ring-2 enabled:focus-visible:ring-inset enabled:focus-visible:ring-ring disabled:cursor-default">
                        <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-foreground">{row.label}</span>{row.helper && <span className="block truncate text-[11px] text-muted-foreground">{row.helper}</span>}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{row.value}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {relatedRfqs.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><CalendarDays size={14} /> Recent related activity</h3>
                  <div className="overflow-hidden rounded-xl border border-border/80">
                    {relatedRfqs.slice(0, 5).map((rfq) => (
                      <div key={rfq.id} className="flex min-h-16 items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0">
                        <div className="min-w-0"><span className="block truncate text-[13px] font-semibold text-foreground">{rfq.rfqNumber} · {rfq.title}</span><span className="block truncate text-[11px] text-muted-foreground">{rfq.creator} · {new Date(rfq.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
                        <div className="shrink-0 text-right"><Badge tone="neutral">{rfq.status}</Badge><span className="mt-1 block text-[10px] text-muted-foreground">{rfq.quotations} quotes</span></div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
