import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  X,
  Maximize2,
  Minimize2,
  ChevronUp,
  BarChart3,
  ListChecks,
  CalendarDays,
  Building2,
} from 'lucide-react';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import { useServiceData } from '../../../hooks/useServiceData';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { dashboardService } from '../../../services/dashboardService';
import { useCurrency } from '../../../components/shared/CurrencyMaster';
import type { DashboardPipelineItem, DashboardRecentRfq, KpiItem } from '../../../types/viewModels';
import '../../rfq/RFQPage.css';

type ModalState = 'open' | 'expanded' | 'minimized';
type DetailTab = 'summary' | 'breakdown' | 'related';

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
  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const [modalState, setModalState] = useState<ModalState>('open');

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

  const isOpen = !!selectedKpi && modalState === 'open';
  const isExpanded = !!selectedKpi && modalState === 'expanded';
  const isMinimized = !!selectedKpi && modalState === 'minimized';

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

  useEffect(() => {
    if (!selectedKpi) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedKpi(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedKpi]);

  useBodyScrollLock(!!(selectedKpi && !isMinimized));

  const openKpi = (kpi: KpiItem) => {
    setSelectedKpi(kpi);
    setActiveTab('summary');
    setModalState('open');
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
    return <div className="dash-kpis dash-kpis--loading">Loading KPIs…</div>;
  }

  return (
    <>
      <div className="dash-kpis">
        {kpis.map((kpi) => {
          const Icon = KPI_ICONS[kpi.modifier] || KPI_ICONS[kpi.id] || FileText;
          return (
            <button
              key={kpi.id}
              type="button"
              className={`dash-kpi dash-kpi--${kpi.modifier}`}
              onClick={() => openKpi(kpi)}
              aria-label={`Open ${kpi.label} details`}
            >
              <div className="dash-kpi__icon">
                <Icon size={20} />
              </div>
              <div className="dash-kpi__body">
                <span className="dash-kpi__label">{kpi.label}</span>
                <span className="dash-kpi__value">{kpi.value}</span>
                {kpi.trend && (
                  <span className={`dash-kpi__trend dash-kpi__trend--${kpi.direction}`}>
                    <TrendIcon direction={kpi.direction} />
                    {kpi.trend}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedKpi && createPortal(
        <>
          {(isOpen || isExpanded) && (
            <div
              className={`rfq-modal-backdrop ${isExpanded ? 'rfq-modal-backdrop--expanded' : ''}`}
              onClick={closeModal}
            />
          )}

          <div
            className={[
              'rfq-modal',
              'dash-kpi-modal',
              isOpen ? 'rfq-modal--open' : '',
              isExpanded ? 'rfq-modal--expanded' : '',
              isMinimized ? 'rfq-modal--minimized' : '',
            ].filter(Boolean).join(' ')}
            style={isExpanded ? {
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
              onClick={isMinimized ? () => setModalState('open') : undefined}
              style={isMinimized ? { cursor: 'pointer' } : undefined}
            >
              <div className="rfq-modal__header-left">
                <span className="rfq-modal__rfq-num">KPI</span>
                {!isMinimized && (
                  <span className="dash-kpi-modal__header-title">{selectedKpi.label}</span>
                )}
                {isMinimized && (
                  <span className="rfq-modal__minimized-title">{selectedKpi.label}</span>
                )}
              </div>

              <div className="rfq-modal__window-controls" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="rfq-modal__wc-btn"
                  title={isMinimized ? 'Restore' : 'Minimize'}
                  onClick={() => setModalState(isMinimized ? 'open' : 'minimized')}
                >
                  {isMinimized ? <ChevronUp size={14} /> : <Minus size={14} />}
                </button>
                {!isMinimized && (
                  <button
                    type="button"
                    className="rfq-modal__wc-btn"
                    title={isExpanded ? 'Restore' : 'Expand'}
                    onClick={() => setModalState(isExpanded ? 'open' : 'expanded')}
                  >
                    {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                )}
                <div className="rfq-modal__wc-divider" />
                <button
                  type="button"
                  className="rfq-modal__wc-btn rfq-modal__wc-btn--close"
                  title="Close"
                  onClick={closeModal}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                <div className="rfq-modal__hero dash-kpi-modal__hero">
                  <div className={`dash-kpi-modal__hero-icon dash-kpi-modal__hero-icon--${selectedKpi.modifier}`}>
                    {(() => {
                      const Icon = selectedIcon;
                      return <Icon size={22} />;
                    })()}
                  </div>
                  <div className="dash-kpi-modal__hero-copy">
                    <h2 className="rfq-modal__title">{selectedKpi.label}</h2>
                    <p className="rfq-modal__description">{getKpiDescription(selectedKpi)}</p>
                    <div className="rfq-modal__hero-chips">
                      <span className="rfq-modal__dept-chip">
                        <BarChart3 size={10} /> Value {selectedKpi.value}
                      </span>
                      {selectedKpi.trend && (
                        <span className="rfq-modal__dept-chip">
                          <TrendIcon direction={selectedKpi.direction} /> {selectedKpi.trend}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rfq-modal__tabs">
                  {([
                    ['summary', 'Summary', BarChart3, summaryRows.length],
                    ['breakdown', 'Breakdown', ListChecks, breakdownRows.length],
                    ['related', 'Related', CalendarDays, relatedRfqs.length],
                  ] as const).map(([tab, label, Icon, count]) => (
                    <button
                      key={tab}
                      type="button"
                      className={`rfq-modal__tab ${activeTab === tab ? 'rfq-modal__tab--active' : ''}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      <Icon size={13} />
                      {label}
                      <span className="rfq-modal__tab-count">{count}</span>
                    </button>
                  ))}
                </div>

                <div className="rfq-modal__body">
                  {activeTab === 'summary' && (
                    <div className="rfq-modal__info-panel">
                      <div className="rfq-modal__info-grid dash-kpi-modal__info-grid">
                        {summaryRows.map((row) => (
                          <div key={row.label} className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">
                              <BarChart3 size={12} /> {row.label}
                            </span>
                            <span className="rfq-modal__info-value">{row.value}</span>
                            {row.helper && <span className="dash-kpi-modal__helper">{row.helper}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'breakdown' && (
                    <div className="rfq-modal__quotations-panel">
                      {breakdownRows.map((row) => (
                        <div
                          key={`${row.label}-${row.value}`}
                          className={`rfq-modal__quotation-row ${row.link ? 'dash-kpi-modal__task-row' : ''}`}
                          onClick={row.link ? () => handleTaskClick(row.link!) : undefined}
                          role={row.link ? 'button' : undefined}
                          tabIndex={row.link ? 0 : undefined}
                          onKeyDown={row.link ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTaskClick(row.link!); } } : undefined}
                        >
                          <div className="rfq-modal__quotation-info">
                            <span className="rfq-modal__vendor-name">{row.label}</span>
                            {row.helper && <span className="rfq-modal__quotation-meta">{row.helper}</span>}
                          </div>
                          <div className="rfq-modal__quotation-right">
                            <span className="rfq-modal__quotation-price">{row.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'related' && (
                    <div className="rfq-modal__quotations-panel">
                      {relatedRfqs.length > 0 ? relatedRfqs.map((rfq) => (
                        <div key={rfq.id} className="rfq-modal__quotation-row">
                          <div className="rfq-modal__quotation-info">
                            <span className="rfq-modal__vendor-name">{rfq.rfqNumber} · {rfq.title}</span>
                            <span className="rfq-modal__quotation-meta">
                              {rfq.creator} · {new Date(rfq.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <div className="rfq-modal__quotation-right">
                            <span className="rfq-modal__quotation-status">{rfq.status}</span>
                            <span className="rfq-modal__quotation-meta">{rfq.quotations} quotes</span>
                          </div>
                        </div>
                      )) : (
                        <div className="rfq-modal__no-vendors">
                          <Building2 size={22} />
                          <p>No related records available for this KPI yet.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
