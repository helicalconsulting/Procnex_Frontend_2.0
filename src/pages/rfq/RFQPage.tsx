import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { rfqService } from '../../services/rfqService';
import { useServiceData } from '../../hooks/useServiceData';
import type { RFQTableRow } from '../../types/viewModels';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  Plus, Search, FileText, Eye, Trash2, Copy, Users, Package,
  ArrowUpDown, ChevronLeft, ChevronRight, X, CalendarDays,
  Building2, Tag, Banknote, ClipboardList, Send, ChevronDown,
  ChevronUp, Minus, Maximize2, Minimize2,
  AlertTriangle, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import type { RFQStatus } from '../../types';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import RFQDetailModal from '../../components/rfq/RFQDetailModal';
import { MessageStrip } from '../../components/shared/MessageStrip';
import '../../components/shared/ColumnCustomizer.css';
import './RFQPage.css';

// ─── Types ───────────────────────────────────────────────────

type MockRFQ = RFQTableRow;

// ─── Column definitions ───────────────────────────────────────
// These map to fields available from "DB" — user can toggle & reorder

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;        // cannot be hidden (e.g. RFQ #)
  render: (rfq: MockRFQ, formatDate: (d: string) => string, openDetail?: (rfq: MockRFQ) => void) => React.ReactNode;
  headerRender?: () => React.ReactNode;
  width?: string;
}

// Column widths — fixed so layout never breaks regardless of which are visible
// width + align per column
const COL_META: Record<string, { width: string; align?: 'left'|'center'|'right' }> = {
  rfqNumber:    { width: '130px', align: 'left'   },
  title:        { width: '220px', align: 'left'   },
  status:       { width: '120px', align: 'left'   },
  creator:      { width: '148px', align: 'left'   },
  createdAt:    { width: '108px', align: 'left'   },
  itemCount:    { width:  '68px', align: 'center' },
  vendorCount:  { width:  '80px', align: 'center' },
  quotationCount:{ width: '96px', align: 'center' },
  totalEstimate:{ width: '116px', align: 'right'  },
  priority:     { width:  '96px', align: 'left'   },
  department:   { width: '118px', align: 'left'   },
  closingDate:  { width: '108px', align: 'left'   },
  currency:     { width:  '76px', align: 'center' },
};
const COL_WIDTHS: Record<string, string> = Object.fromEntries(
  Object.entries(COL_META).map(([k, v]) => [k, v.width])
);

const ALL_COLUMNS: ColumnDef[] = [
  {
    key: 'rfqNumber',
    label: 'RFQ #',
    defaultVisible: true,
    required: true,
    render: (rfq: MockRFQ, _formatDate: (d: string) => string, openDetail?: (rfq: MockRFQ) => void) => (
      <button className="rfq-table__num-btn" onClick={() => (openDetail as any)(rfq)}>
        {rfq.rfqNumber}
      </button>
    ),
    headerRender: () => <><ArrowUpDown size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />RFQ #</>,
  },
  {
    key: 'title',
    label: 'Title',
    defaultVisible: true,
    required: true,
    render: (rfq) => (
      <div className="rfq-table__title-cell">
        <span className="rfq-table__title">{rfq.title}</span>
        <span className="rfq-table__desc">{rfq.description}</span>
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    defaultVisible: true,
    render: (rfq) => (
      <span className={`rfq-badge rfq-badge--${rfq.status}`}>
        <span className="rfq-badge__dot" />{STATUS_LABELS[rfq.status]}
      </span>
    ),
  },
  {
    key: 'creator',
    label: 'Created By',
    defaultVisible: true,
    render: (rfq) => (
      <div className="rfq-table__creator">
        <span className="rfq-table__avatar">{rfq.creatorInitials}</span>
        <span className="rfq-table__creator-name">{rfq.creator}</span>
      </div>
    ),
  },
  {
    key: 'createdAt',
    label: 'Date',
    defaultVisible: true,
    render: (rfq, formatDate) => (
      <span className="rfq-table__date">{formatDate(rfq.createdAt)}</span>
    ),
  },
  {
    key: 'itemCount',
    label: 'Items',
    defaultVisible: true,
    headerRender: () => <><Package size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Items</>,
    render: (rfq) => <span className="rfq-table__num-cell">{rfq.itemCount}</span>,
  },
  {
    key: 'vendorCount',
    label: 'Vendors',
    defaultVisible: true,
    headerRender: () => <><Users size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Vendors</>,
    render: (rfq) => (
      <span className="rfq-table__vendors-cell">
        <Users size={13} className="rfq-table__vendors-icon" />{rfq.vendorCount}
      </span>
    ),
  },
  {
    key: 'quotationCount',
    label: 'Quotes',
    defaultVisible: true,
    headerRender: () => <><FileText size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Quotes</>,
    render: (rfq) => (
      <span className={`rfq-table__quotes-cell ${rfq.quotationCount > 0 ? 'rfq-table__quotes-cell--has' : ''}`}>
        {rfq.quotationCount}
      </span>
    ),
  },
  {
    key: 'totalEstimate',
    label: 'Estimate',
    defaultVisible: true,
    render: (rfq) => <span className="rfq-table__estimate">{rfq.totalEstimate}</span>,
  },
  // ── Extra DB fields (hidden by default) ──────────────────
  {
    key: 'priority',
    label: 'Priority',
    defaultVisible: false,
    render: (rfq) => {
      const cls: Record<string, string> = { Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical' };
      return (
        <span className={`rfq-table__priority-chip rfq-table__priority-chip--${cls[rfq.priority]}`}>
          {rfq.priority}
        </span>
      );
    },
  },
  {
    key: 'department',
    label: 'Department',
    defaultVisible: false,
    render: (rfq) => <span className="rfq-table__cell-text">{rfq.department || '—'}</span>,
  },
  {
    key: 'closingDate',
    label: 'Closing Date',
    defaultVisible: false,
    render: (rfq, formatDate) => (
      <span className="rfq-table__date">{formatDate(rfq.closingDate)}</span>
    ),
  },
  {
    key: 'currency',
    label: 'Currency',
    defaultVisible: false,
    render: (rfq) => <span className="rfq-table__cell-text">{rfq.currency}</span>,
  },
  {
    key: 'rfqType',
    label: 'RFQ Type',
    defaultVisible: true,
    render: (rfq) => (
      <span className={`rfq-badge rfq-type-badge rfq-type-badge--${rfq.rfqType}`}>
        {rfq.rfqType === 'TENDER' ? 'Tender' : 'RFQ'}
      </span>
    ),
  },
];

type StatusFilter = 'ALL' | RFQStatus;

const STATUS_LABELS: Record<RFQStatus, string> = {
  DRAFT: 'Draft', SENT: 'Sent', IN_PROGRESS: 'In Progress', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

const PRIORITY_CLASS: Record<string, string> = {
  Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical',
};

// ColumnCustomizer is now imported from shared components

// ─── Main Component ───────────────────────────────────────────

export default function RFQPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: rfqList, loading, error, reload } = useServiceData(
    () => rfqService.list({ limit: 100 }),
    [] as RFQTableRow[],
    [],
    { cacheTtlMs: 0 }
  );
  const [detailRFQ, setDetailRFQ] = useState<MockRFQ | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockRFQ | null>(null);

  const anyModalOpen = !!(detailRFQ || deleteTarget);
  useBodyScrollLock(anyModalOpen);

  const stats = useMemo(() => ({
    total: rfqList.length,
    draft: rfqList.filter((r) => r.status === 'DRAFT').length,
    sent: rfqList.filter((r) => r.status === 'SENT').length,
    inProgress: rfqList.filter((r) => r.status === 'IN_PROGRESS').length,
    closed: rfqList.filter((r) => r.status === 'CLOSED').length,
    cancelled: rfqList.filter((r) => r.status === 'CANCELLED').length,
  }), [rfqList]);

  const handleKpiClick = useCallback((filter: StatusFilter | null) => {
    setStatusFilter(prev => prev === filter ? 'ALL' : (filter || 'ALL'));
    setCurrentPage(1);
  }, []);

  const handleSendRFQ = useCallback(async () => {
    if (!detailRFQ || detailRFQ.status !== 'DRAFT') return;

    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      let rfq = detailRFQ;
      if (!rfq.vendors.length) {
        const full = await rfqService.getById(rfq.id);
        if (full) {
          rfq = full;
          setDetailRFQ(full);
        }
      }
      const vendorTotal = rfq.vendors.length || rfq.vendorCount || 0;
      if (vendorTotal === 0) {
        setSendError('Add at least one vendor before sending (Create RFQ → select vendors).');
        return;
      }

      const result = await rfqService.send(rfq.id);
      setDetailRFQ({ ...rfq, status: 'SENT' });
      reload();
      if (result.emailFailures?.length) {
        setSendError(`RFQ sent, but some emails failed: ${result.emailFailures.join('; ')}`);
      } else {
        setSendSuccess(`RFQ sent to ${vendorTotal} vendor(s). Invitation emails dispatched.`);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send RFQ');
    } finally {
      setSending(false);
    }
  }, [detailRFQ, reload]);

  const requestDeleteRFQ = useCallback((rfq: MockRFQ) => {
    setDeleteError(null);
    setDeleteSuccess(null);
    setDeleteTarget(rfq);
  }, []);

  const cancelDeleteRFQ = useCallback(() => {
    if (deletingId === null) setDeleteTarget(null);
  }, [deletingId]);

  const confirmDeleteRFQ = useCallback(async () => {
    if (!deleteTarget) return;
    const rfq = deleteTarget;
    setDeletingId(rfq.id);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      await rfqService.delete(rfq.id);
      if (detailRFQ?.id === rfq.id) setDetailRFQ(null);
      setDeleteSuccess(`${rfq.rfqNumber} deleted successfully.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete RFQ');
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, detailRFQ?.id, reload]);

  // ── Auto-clear deleteSuccess/deleteError after timeout ─────
  // Using a single effect with a ref map to handle both success & error
  useEffect(() => {
    if (!deleteSuccess && !deleteError) return;
    const timer = window.setTimeout(() => {
      if (deleteSuccess) setDeleteSuccess(null);
      if (deleteError) setDeleteError(null);
    }, deleteSuccess ? 2000 : 5000);
    return () => window.clearTimeout(timer);
  }, [deleteSuccess, deleteError]);

  // ── Column state ──────────────────────────────────────────
  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const perPage = 8;

  const filtered = useMemo(() => {
    let list = rfqList;
    if (statusFilter !== 'ALL') list = list.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.rfqNumber.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.creator.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rfqList, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // Visible columns in order
  const visibleColumns = useMemo(
    () => columnOrder
      .map((k) => ALL_COLUMNS.find((c) => c.key === k)!)
      .filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys],
  );

  const openDetail = useCallback(async (rfq: MockRFQ) => {
    setDetailRFQ(rfq);
    setSendError(null);
    setSendSuccess(null);
    setDetailLoading(true);
    try {
      const full = await rfqService.getById(rfq.id);
      if (full) setDetailRFQ(full);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not load RFQ details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => setDetailRFQ(null);

  const handleToggleColumn = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleResetColumns = () => {
    setColumnOrder(defaultOrder);
    setVisibleKeys(new Set(defaultVisible));
  };

  return (
    <div className="rfq-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {deleteError && <MessageStrip type="error" onClose={() => setDeleteError(null)} autoHideMs={5000}>{deleteError}</MessageStrip>}
      {deleteSuccess && <MessageStrip type="success" onClose={() => setDeleteSuccess(null)} autoHideMs={2000}>{deleteSuccess}</MessageStrip>}
      {loading && <div className="rfq-page__loading">Loading RFQs…</div>}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="rfq-page__header">
        <div className="rfq-page__header-left">
          <h1>RFQs</h1>
          <p>Manage procurement requests</p>
        </div>
        {hasPermission('RFQ', 'canCreate') && (
          <button className="rfq-page__create-btn" onClick={() => navigate('/rfq/create')}>
            <Plus size={18} /> New RFQ
          </button>
        )}
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="rfq-summary">
        {[
          { icon: <ClipboardList size={22}/>, mod: 'total',     value: stats.total,     label: 'Total RFQs',      filter: null as StatusFilter | null },
          { icon: <FileText size={22}/>,      mod: 'draft',     value: stats.draft,     label: 'Draft',           filter: 'DRAFT' },
          { icon: <Send size={22}/>,          mod: 'sent',      value: stats.sent,      label: 'Sent',            filter: 'SENT' },
          { icon: <Clock size={22}/>,         mod: 'progress',  value: stats.inProgress, label: 'In Progress',    filter: 'IN_PROGRESS' },
          { icon: <CheckCircle2 size={22}/>,  mod: 'closed',    value: stats.closed,    label: 'Closed',          filter: 'CLOSED' },
          { icon: <XCircle size={22}/>,       mod: 'cancelled', value: stats.cancelled, label: 'Cancelled',       filter: 'CANCELLED' },
        ].map(c => {
          const isActive = c.mod === 'total' ? !statusFilter || statusFilter === 'ALL' : statusFilter === c.filter;
          return (
            <div
              key={c.mod}
              className={`rfq-summary-card ${isActive ? 'rfq-summary-card--active' : ''}`}
              onClick={() => handleKpiClick(c.filter)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleKpiClick(c.filter); } }}
            >
              <div className={`rfq-summary-card__icon rfq-summary-card__icon--${c.mod}`}>{c.icon}</div>
              <div className="rfq-summary-card__info">
                <span className="rfq-summary-card__value">{c.value}</span>
                <span className="rfq-summary-card__label">{c.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="rfq-toolbar__search">
        <Search size={16} className="rfq-toolbar__search-icon" />
        <input
          type="text"
          placeholder="Search RFQ, title, creator..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
      </div>

      {/* ── Table Card ─────────────────────────────────────── */}
      <div className="rfq-table-card">
        {paginated.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="rfq-table-wrap">
              <table className="rfq-table">
                {/* colgroup — array expression avoids whitespace text nodes which cause hydration errors */}
                <colgroup>
                  {[...visibleColumns.map((col) => (
                    <col key={col.key} style={{ width: COL_WIDTHS[col.key] || 'auto' }} />
                  )), <col key="__actions" style={{ width: '112px' }} />]}
                </colgroup>
                <thead>
                  <tr>
                    {visibleColumns.map((col) => {
                      const align = COL_META[col.key]?.align ?? 'left';
                      return (
                        <th key={col.key} style={{ textAlign: align }}>
                          {col.headerRender ? col.headerRender() : col.label}
                        </th>
                      );
                    })}
                    {/* Actions col + 3-dot button */}
                    <th className="rfq-table__actions-th">
                      <div className="rfq-table__actions-header">
                        <span>Actions</span>
                        <div className="rfq-table__col-btn-wrap">
                          <button
                            ref={colBtnRef}
                            className={`rfq-table__col-btn ${showColPanel ? 'rfq-table__col-btn--active' : ''}`}
                            onClick={() => setShowColPanel((v) => !v)}
                            title="Customize columns"
                            aria-label="Customize columns"
                            aria-expanded={showColPanel}
                          >
                            <span /><span /><span />
                          </button>

                          {/* Column Customizer Panel */}
                          {showColPanel && (
                            <ColumnCustomizer
                              columnOrder={columnOrder}
                              visibleKeys={visibleKeys}
                              allColumns={ALL_COLUMNS}
                              onToggle={handleToggleColumn}
                              onReorder={setColumnOrder}
                              onReset={handleResetColumns}
                              onClose={() => setShowColPanel(false)}
                              anchorRef={colBtnRef}
                            />
                          )}
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((rfq) => (
                    <tr key={rfq.id} onClick={() => openDetail(rfq)}>
                      {visibleColumns.map((col) => {
                        const align = COL_META[col.key]?.align ?? 'left';
                        return (
                          <td
                            key={col.key}
                            className={`rfq-td rfq-td--${col.key}`}
                            style={{ textAlign: align }}
                            onClick={col.key === 'rfqNumber' ? (e) => e.stopPropagation() : undefined}
                          >
                            {col.render(rfq, formatDate, openDetail)}
                          </td>
                        );
                      })}
                      <td className="rfq-td rfq-td--actions" onClick={(e) => e.stopPropagation()}>
                        <div className="rfq-table__actions">
                          <button className="rfq-table__action-btn" title="View" onClick={() => openDetail(rfq)}><Eye size={15} /></button>
                          <button className="rfq-table__action-btn" title="Duplicate"><Copy size={15} /></button>
                          {hasPermission('RFQ', 'canCreate') && (
                            <button
                              className="rfq-table__action-btn rfq-table__action-btn--danger"
                              title="Delete RFQ"
                              disabled={deletingId === rfq.id}
                              onClick={() => requestDeleteRFQ(rfq)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="rfq-mobile-list">
              {paginated.map((rfq) => (
                <div key={rfq.id} className="rfq-mobile-card" onClick={() => openDetail(rfq)}>
                  <div className="rfq-mobile-card__top">
                    <span className="rfq-mobile-card__num">{rfq.rfqNumber}</span>
                    <span className={`rfq-badge rfq-badge--${rfq.status}`}>
                      <span className="rfq-badge__dot" />{STATUS_LABELS[rfq.status]}
                    </span>
                  </div>
                  <div className="rfq-mobile-card__title">{rfq.title}</div>
                  <div className="rfq-mobile-card__desc">{rfq.description}</div>
                  <div className="rfq-mobile-card__meta">
                    <div className="rfq-mobile-card__meta-item">
                      <span className="rfq-mobile-card__avatar">{rfq.creatorInitials}</span>
                      <span>{rfq.creator}</span>
                    </div>
                    <div className="rfq-mobile-card__meta-item">
                      <CalendarDays size={12} /><span>{formatDate(rfq.createdAt)}</span>
                    </div>
                  </div>
                  <div className="rfq-mobile-card__footer">
                    <div className="rfq-mobile-card__chips">
                      <span className="rfq-mobile-card__chip"><Package size={11} /> {rfq.itemCount} items</span>
                      <span className="rfq-mobile-card__chip"><Users size={11} /> {rfq.vendorCount} vendors</span>
                      <span className={`rfq-mobile-card__chip ${rfq.quotationCount > 0 ? 'rfq-mobile-card__chip--quotes' : ''}`}>
                        <FileText size={11} /> {rfq.quotationCount} quotes
                      </span>
                      <span className={`rfq-mobile-card__chip rfq-mobile-card__chip--priority rfq-mobile-card__chip--${PRIORITY_CLASS[rfq.priority]}`}>
                        {rfq.priority}
                      </span>
                    </div>
                    <div className="rfq-mobile-card__footer-actions" onClick={(e) => e.stopPropagation()}>
                      <span className="rfq-mobile-card__estimate">{rfq.totalEstimate}</span>
                      {hasPermission('RFQ', 'canCreate') && (
                        <button
                          className="rfq-mobile-card__delete"
                          title="Delete RFQ"
                          disabled={deletingId === rfq.id}
                          onClick={() => requestDeleteRFQ(rfq)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <ChevronDown size={14} className="rfq-mobile-card__chevron" />
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="rfq-pagination">
              <span className="rfq-pagination__info">
                {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
              </span>
              <div className="rfq-pagination__btns">
                <button className="rfq-pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} className={`rfq-pagination__btn ${currentPage === p ? 'rfq-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="rfq-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="rfq-empty">
            <div className="rfq-empty__icon"><FileText size={48} /></div>
            <div className="rfq-empty__title">No RFQs found</div>
            <div className="rfq-empty__desc">
              {search ? 'Try adjusting your search or filters.' : 'Create your first RFQ to get started.'}
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="rfq-confirm-backdrop" onClick={cancelDeleteRFQ} role="presentation">
          <div
            className="rfq-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rfq-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rfq-confirm__icon">
              <AlertTriangle size={22} />
            </div>
            <div className="rfq-confirm__content">
              <h2 id="rfq-delete-title">Delete RFQ?</h2>
              <p>
                This will permanently delete <strong>{deleteTarget.rfqNumber}</strong> with its line items,
                vendor invites, quotations, and approval records.
              </p>
              {deleteError && <MessageStrip type="error" onClose={() => setDeleteError(null)} autoHideMs={5000}>{deleteError}</MessageStrip>}
            </div>
            <div className="rfq-confirm__actions">
              <button
                className="rfq-confirm__btn rfq-confirm__btn--secondary"
                onClick={cancelDeleteRFQ}
                disabled={deletingId === deleteTarget.id}
              >
                Cancel
              </button>
              <button
                className="rfq-confirm__btn rfq-confirm__btn--danger"
                onClick={confirmDeleteRFQ}
                disabled={deletingId === deleteTarget.id}
              >
                <Trash2 size={15} />
                {deletingId === deleteTarget.id ? 'Deleting...' : 'Delete RFQ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <RFQDetailModal
        rfq={detailRFQ}
        onClose={closeDetail}
        loading={detailLoading}
        enableSend
        onSend={handleSendRFQ}
        sending={sending}
        sendError={sendError}
        sendSuccess={sendSuccess}
        onDismissSendSuccess={() => setSendSuccess(null)}
        onDismissSendError={() => setSendError(null)}
      />

    </div>
  );
}
