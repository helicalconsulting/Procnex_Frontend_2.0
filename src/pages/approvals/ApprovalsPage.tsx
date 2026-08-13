import React from 'react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { approvalService } from '../../services/approvalService';
import { sseClient } from '../../services/sseClient';
import type { ApprovalTableRow } from '../../types/viewModels';
import {
  CheckSquare,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  X,
  FileText,
  ShoppingCart,
  ClipboardList,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileSignature,
  ExternalLink,
  Minus,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { apiRequest } from '../../api/client';
import './ApprovalsPage.css';

// ─── Types ──────────────────────────────────────────────────

type ApprovalStatusType = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
type ModuleType = 'RFQ' | 'Purchase Order' | 'Quotation' | 'Contract';
type PriorityType = 'HIGH' | 'MEDIUM' | 'LOW';

type ApprovalRequest = ApprovalTableRow;

const STATUS_LABELS: Record<ApprovalStatusType, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RETURNED: 'Returned',
};

const MODULE_ICONS: Record<ModuleType, React.ReactNode> = {
  RFQ: <FileText size={15} />,
  'Purchase Order': <ShoppingCart size={15} />,
  Quotation: <ClipboardList size={15} />,
  Contract: <FileSignature size={15} />,
};

const PRIORITY_CLASS: Record<PriorityType, string> = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

// ─── Column Definitions ─────────────────────────────────────

interface ApprovalColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (req: ApprovalRequest, formatDateTime: (d: string) => string) => React.ReactNode;
}

const ALL_COLUMNS: ApprovalColumnDef[] = [
  {
    key: 'request', label: 'Request', defaultVisible: true, required: true, width: '260px',
    render: (req) => (
      <div className="approvals-table__request">
        <div className={`approvals-table__avatar approvals-table__avatar--${req.avatarMod}`}>{req.requestedByInitials}</div>
        <div className="approvals-table__request-info">
          <span className="approvals-table__ref">{req.referenceNumber}</span>
          <span className="approvals-table__title">{req.title}</span>
          <span className="approvals-table__requester">by {req.requestedBy} · {req.department}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'module', label: 'Module', defaultVisible: true, width: '140px',
    render: (req) => (
      <span className={`approvals-module-badge approvals-module-badge--${req.module.toLowerCase().replace(' ', '-')}`}>
        {MODULE_ICONS[req.module]}{req.module}
      </span>
    ),
  },
  {
    key: 'amount', label: 'Amount', defaultVisible: true, width: '120px', align: 'right',
    render: (req) => <span className="approvals-table__amount">{req.amount}</span>,
  },
  {
    key: 'priority', label: 'Priority', defaultVisible: true, width: '100px',
    render: (req) => (
      <span className={`approvals-priority approvals-priority--${PRIORITY_CLASS[req.priority]}`}>
        {req.priority}
      </span>
    ),
  },
  {
    key: 'level', label: 'Approval Level', defaultVisible: true, width: '150px',
    render: (req) => {
      const total = req.totalLevels;
      const current = req.currentLevel;
      return (
        <div className="approvals-level">
          <div className="approvals-level__steps">
            {Array.from({ length: total }, (_, i) => {
              const stepNum = i + 1;
              const isDone    = stepNum < current;
              const isCurrent = stepNum === current;
              return (
                <div key={i} className="approvals-level__step">
                  <div
                    className={[
                      'approvals-level__step-circle',
                      isDone    ? 'approvals-level__step-circle--done'    : '',
                      isCurrent ? 'approvals-level__step-circle--current' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {isDone ? '✓' : stepNum}
                  </div>
                  {i < total - 1 && (
                    <div className={`approvals-level__step-connector ${isDone ? 'approvals-level__step-connector--done' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>
          <span className="approvals-level__text">L{current}/{total}</span>
        </div>
      );
    },
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: '110px',
    render: (req) => <span className={`approvals-badge approvals-badge--${req.status}`}>{STATUS_LABELS[req.status]}</span>,
  },
  {
    key: 'submitted', label: 'Submitted', defaultVisible: true, width: '130px',
    render: (req, formatDateTime) => <span className="approvals-table__date">{formatDateTime(req.submittedAt)}</span>,
  },
  // ── Extra columns (hidden by default) ──
  {
    key: 'department', label: 'Department', defaultVisible: false, width: '120px',
    render: (req) => <span className="approvals-table__date">{req.department}</span>,
  },
  {
    key: 'requiredRole', label: 'Required Role', defaultVisible: false, width: '140px',
    render: (req) => <span className="approvals-table__date">{req.requiredRole}</span>,
  },
  {
    key: 'requestedBy', label: 'Requested By', defaultVisible: false, width: '130px',
    render: (req) => <span className="approvals-table__date">{req.requestedBy}</span>,
  },
];

// ═══════════════════════════════════════════════════════════════
// Approval Chain View — Shows approval timeline for any module
// ═══════════════════════════════════════════════════════════════

type ChainEntry = {
  levelNumber: number;
  requiredRole: string;
  status: string;
  approverName: string | null;
  comments: string | null;
  actionAt: string | null;
  deadline: string | null;
  createdAt: string;
};

function ApprovalChainView({ module, referenceId, onClose }: { module: string; referenceId: string; onClose: () => void }) {
  const [chainData, setChainData] = useState<{
    levels: ChainEntry[];
    timeline: ChainEntry[];
    history?: ChainEntry[];
    currentLevel: number;
    totalLevels: number;
    isComplete: boolean;
    isRejected: boolean;
    isReturned?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchChain = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<typeof chainData>(`/approvals/${module}/${referenceId}/chain`);
        if (!cancelled) setChainData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load approval chain');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchChain();
    return () => { cancelled = true; };
  }, [module, referenceId]);

  const formatDt = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle2 size={14} style={{ color: '#107e3e' }} />;
      case 'REJECTED': return <XCircle size={14} style={{ color: '#bb0000' }} />;
      case 'RETURNED': return <RotateCcw size={14} style={{ color: '#e9730c' }} />;
      case 'PENDING': return <Clock size={14} style={{ color: '#e9730c' }} />;
      case 'AUTO_FORWARDED': return <AlertTriangle size={14} style={{ color: '#8b5cf6' }} />;
      default: return <Minus size={14} style={{ color: 'var(--text-secondary)' }} />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'Approved';
      case 'REJECTED': return 'Rejected';
      case 'RETURNED': return 'Returned for Revision';
      case 'PENDING': return 'Pending';
      case 'AUTO_FORWARDED': return 'Auto-Forwarded';
      default: return status;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return '#107e3e';
      case 'REJECTED': return '#bb0000';
      case 'RETURNED': return '#e9730c';
      case 'PENDING': return '#e9730c';
      case 'AUTO_FORWARDED': return '#8b5cf6';
      default: return 'var(--text-secondary)';
    }
  };

  const itemsToDisplay = chainData?.history && chainData.history.length > 0
    ? chainData.history
    : (chainData?.timeline && chainData.timeline.length > 0 ? chainData.timeline : chainData?.levels || []);

  return (
    <div className="approvals-modal-backdrop" onClick={onClose}>
      <div className="approvals-modal approvals-modal--detail" onClick={e => e.stopPropagation()}>
        <div className="approvals-modal__header">
          <div className="approvals-modal__title"><Clock size={20} /><span>Approval History & Timeline — {module}</span></div>
          <button className="approvals-modal__close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="approvals-modal__body">
          {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Loading approval chain…</div>}
          {error && <div style={{ textAlign: 'center', padding: 32, color: '#bb0000' }}>{error}</div>}
          {!loading && !error && (!chainData || itemsToDisplay.length === 0) && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>No approval chain data available.</div>
          )}
          {chainData && itemsToDisplay.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {chainData.isComplete && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 12, background: 'rgba(16,126,62,0.1)', color: '#107e3e', fontSize: 11, fontWeight: 700 }}>
                    <CheckCircle2 size={12} /> Chain Complete
                  </span>
                )}
                {chainData.isRejected && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 12, background: 'rgba(187,0,0,0.08)', color: '#bb0000', fontSize: 11, fontWeight: 700 }}>
                    <XCircle size={12} /> Rejected
                  </span>
                )}
                {chainData.isReturned && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 12, background: 'rgba(233,115,12,0.1)', color: '#e9730c', fontSize: 11, fontWeight: 700 }}>
                    <RotateCcw size={12} /> Returned to Originator
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {itemsToDisplay.map((level, idx) => {
                  const isLast = idx === itemsToDisplay.length - 1;
                  const isActive = level.status === 'PENDING';
                  return (
                    <div key={idx} style={{ position: 'relative', paddingLeft: 32, paddingBottom: isLast ? 0 : 24 }}>
                      {/* Timeline line */}
                      {!isLast && (
                        <div style={{
                          position: 'absolute', left: 11, top: 20, bottom: 0, width: 2,
                          background: level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                            ? '#107e3e' : level.status === 'REJECTED' ? '#bb0000' : level.status === 'RETURNED' ? '#e9730c' : 'var(--border)',
                        }} />
                      )}
                      {/* Timeline dot */}
                      <div style={{
                        position: 'absolute', left: 4, top: 4, width: 16, height: 16,
                        borderRadius: '50%',
                        background: isActive ? '#e9730c' : level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                          ? '#107e3e' : level.status === 'REJECTED' ? '#bb0000' : level.status === 'RETURNED' ? '#e9730c' : 'var(--surface-card)',
                        border: `2px solid ${
                          isActive ? '#e9730c' : level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                            ? '#107e3e' : level.status === 'REJECTED' ? '#bb0000' : level.status === 'RETURNED' ? '#e9730c' : 'var(--border)'
                        }`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED' ? (
                          <CheckCircle2 size={10} style={{ color: '#fff' }} />
                        ) : level.status === 'REJECTED' ? (
                          <XCircle size={10} style={{ color: '#fff' }} />
                        ) : level.status === 'RETURNED' ? (
                          <RotateCcw size={10} style={{ color: '#fff' }} />
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? '#fff' : 'var(--text-secondary)' }}>{level.levelNumber}</span>
                        )}
                      </div>
                      {/* Content card */}
                      <div style={{
                        padding: '12px 14px',
                        background: isActive ? 'rgba(233,115,12,0.06)' : level.status === 'RETURNED' ? 'rgba(233,115,12,0.04)' : 'var(--surface-elevated)',
                        border: `1px solid ${
                          isActive ? 'rgba(233,115,12,0.2)' : level.status === 'APPROVED' ? 'rgba(16,126,62,0.15)' : level.status === 'REJECTED' ? 'rgba(187,0,0,0.15)' : level.status === 'RETURNED' ? 'rgba(233,115,12,0.2)' : 'var(--border)'
                        }`,
                        borderRadius: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                            Level {level.levelNumber} — {level.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: statusColor(level.status),
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            {statusIcon(level.status)}
                            {statusLabel(level.status)}
                          </span>
                        </div>
                        {level.approverName && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            By: <strong>{level.approverName}</strong>
                          </div>
                        )}
                        {level.comments && (
                          <div style={{
                            fontSize: 12, color: 'var(--text-primary)',
                            padding: '6px 10px', marginTop: 4,
                            background: 'var(--surface-card)', borderRadius: 4,
                            border: '1px solid var(--border)',
                          }}>
                            "{level.comments}"
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                          {level.actionAt ? `Acted: ${formatDt(level.actionAt)}` : level.createdAt ? `Date: ${formatDt(level.createdAt)}` : `Deadline: ${formatDt(level.deadline)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="approvals-modal__footer">
          <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Canonical module name mapping for chain API endpoint ────
// ApprovalTableRow uses display names (e.g. 'Purchase Order', 'Quotation')
// but the backend expects canonical names (e.g. 'PurchaseOrders', 'Quotations')
const CANONICAL_MODULE: Record<string, string> = {
  'Purchase Order': 'PurchaseOrders',
  'Quotation': 'Quotations',
  'Contract': 'Contracts',
  'RFQ': 'RFQ',
};

// ─── Component ──────────────────────────────────────────────

export default function ApprovalsPage() {
  const { data: approvals, loading, error, reload } = useServiceData(
    () => approvalService.listTable(),
    [] as ApprovalTableRow[],
    { cacheTtlMs: 0 }
  );

  // SSE real-time refresh — listen for approval and PO creation events
  useEffect(() => {
    const unsubLevel = sseClient.on('approval_level_complete', () => reload());
    const unsubChain = sseClient.on('approval_chain_complete', () => reload());
    const unsubForwarded = sseClient.on('approval_auto_forwarded', () => reload());
    const unsubPoCreated = sseClient.on('po_created', () => reload());
    const unsubApprovalInit = sseClient.on('approval_initiated', () => reload());
    return () => {
      unsubLevel();
      unsubChain();
      unsubForwarded();
      unsubPoCreated();
      unsubApprovalInit();
    };
  }, [reload]);

  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [actionModal, setActionModal] = useState<{ request: ApprovalRequest; action: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionReturnTarget, setActionReturnTarget] = useState<'ORIGINATOR' | 'LEVEL_1' | 'VENDOR'>('ORIGINATOR');
  const [detailRequest, setDetailRequest] = useState<ApprovalRequest | null>(null);
  const [chainModal, setChainModal] = useState<{ module: string; referenceId: string } | null>(null);
  useBodyScrollLock(!!(actionModal || detailRequest || chainModal));
  const perPage = 8;

  // ── Column state ──
  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const visibleColumns = useMemo(
    () => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys],
  );
  const handleToggleColumn = (key: string) => {
    setVisibleKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const handleResetColumns = () => { setColumnOrder(defaultOrder); setVisibleKeys(new Set(defaultVisible)); };

  // Summary
  const summary = useMemo(() => ({
    total: approvals.length,
    pending: approvals.filter((a) => a.status === 'PENDING').length,
    approved: approvals.filter((a) => a.status === 'APPROVED').length,
    rejected: approvals.filter((a) => a.status === 'REJECTED').length,
  }), [approvals]);

  // Filter + search
  const filtered = useMemo(() => {
    let list = approvals;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.referenceNumber.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          a.requestedBy.toLowerCase().includes(q) ||
          a.module.toLowerCase().includes(q)
      );
    }
    return list;
  }, [approvals, search]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Action handler — close modal instantly, call API, then refresh & toast
  const handleAction = useCallback(async () => {
    if (!actionModal) return;
    const { id } = actionModal.request;
    const actionType = actionModal.action;
    const comment = actionComment.trim() || undefined;

    // Close modal instantly for immediate feedback
    setActionModal(null);
    setActionComment('');

    // Call API and refresh in background
    try {
      let message: string;
      if (actionType === 'approve') {
        const res = await approvalService.approve(id, comment);
        message = res?.message || 'Request approved successfully.';
      } else if (actionType === 'reject') {
        const res = await approvalService.reject(id, comment);
        message = res?.message || 'Request rejected.';
      } else {
        const res = await approvalService.return(id, comment, actionReturnTarget as any);
        message = res?.message || 'Request returned for revision.';
      }
      setToast({ message, type: 'success' });
      reload();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Action failed.', type: 'error' });
      reload();
    }
  }, [actionModal, actionComment, actionReturnTarget, reload]);

  const openAction = useCallback((request: ApprovalRequest, action: 'approve' | 'reject' | 'return') => {
    setActionModal({ request, action });
    setActionComment('');
    const defaultTarget = (request.module === 'Quotation' || request.module === 'Quotations') ? 'VENDOR' : 'ORIGINATOR';
    setActionReturnTarget(defaultTarget);
  }, []);

  const formatDateTime = (d: string) => {
    const date = new Date(d);
    return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const actionTitle = actionModal?.action === 'approve' ? 'Approve Request' : actionModal?.action === 'reject' ? 'Reject Request' : 'Return Request';
  const actionColor = actionModal?.action === 'approve' ? 'approve' : actionModal?.action === 'reject' ? 'reject' : 'return';

  return (
    <div className="approvals-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {toast && (
        <MessageStrip
          type={toast.type}
          onClose={() => setToast(null)}
          autoHideMs={4000}
          style={{ marginBottom: 16 }}
        >
          {toast.message}
        </MessageStrip>
      )}
      {/* Header */}
      <div className="approvals-page__header">
        <div className="approvals-page__header-left">
          <h1>Purchase Order Approval</h1>
          <p>Review, approve, or reject pending purchase order requests across modules</p>
        </div>
      </div>

      {/* Summary */}
      <div className="approvals-summary">
        {[
          { icon: <CheckSquare size={22} />, value: summary.total, label: 'Total Requests', cls: 'total' },
          { icon: <Clock size={22} />, value: summary.pending, label: 'Pending', cls: 'pending' },
          { icon: <CheckCircle2 size={22} />, value: summary.approved, label: 'Approved', cls: 'approved' },
          { icon: <XCircle size={22} />, value: summary.rejected, label: 'Rejected', cls: 'rejected' },
        ].map((c) => (
          <div key={c.cls} className="approvals-summary-card">
            <div className={`approvals-summary-card__icon approvals-summary-card__icon--${c.cls}`}>{c.icon}</div>
            <div className="approvals-summary-card__info">
              <span className="approvals-summary-card__value">{c.value}</span>
              <span className="approvals-summary-card__label">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="approvals-toolbar">
        <div className="approvals-toolbar__search">
          <Search size={16} className="approvals-toolbar__search-icon" />
          <input
            type="text"
            placeholder="Search by reference, title, requester, or module..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="approvals-table-card">
          <TableSkeleton rows={4} columns={5} />
        </div>
      ) : paginated.length > 0 ? (
        <div className="approvals-table-card">
          <div className="approvals-table-wrap">
            <table className="approvals-table" style={{ tableLayout: 'fixed', minWidth: '750px' }}>
              <colgroup>
                {visibleColumns.map((col) => (
                  <col key={col.key} style={{ width: col.width || 'auto' }} />
                ))}
                <col style={{ width: '130px' }} />
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((col) => (
                    <th key={col.key} style={{ textAlign: col.align || 'left' }}>{col.label}</th>
                  ))}
                  <th>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>Actions</span>
                      <div className="col-btn-wrap">
                        <button
                          ref={colBtnRef}
                          className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`}
                          onClick={() => setShowColPanel((v) => !v)}
                          title="Customize columns"
                          aria-label="Customize columns"
                          aria-expanded={showColPanel}
                        >
                          <span /><span /><span />
                        </button>
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
                {paginated.map((req) => (
                  <tr key={req.id} className={`approvals-row--${req.status.toLowerCase()}`}>
                    {visibleColumns.map((col) => (
                      <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                        {col.render(req, formatDateTime)}
                      </td>
                    ))}
                    <td>
                      <div className="approvals-table__actions">
                        <button className="approvals-table__action-btn" title="View Details" onClick={() => setDetailRequest(req)}>
                          <Eye size={15} />
                        </button>
                        {req.status === 'PENDING' && (req.canAct ?? true) ? (
                          <>
                            <button className="approvals-table__action-btn approvals-table__action-btn--approve" title="Approve" onClick={() => openAction(req, 'approve')}>
                              <ThumbsUp size={15} />
                            </button>
                            <button className="approvals-table__action-btn approvals-table__action-btn--reject" title="Reject" onClick={() => openAction(req, 'reject')}>
                              <ThumbsDown size={15} />
                            </button>
                            <button className="approvals-table__action-btn approvals-table__action-btn--return" title="Return" onClick={() => openAction(req, 'return')}>
                              <RotateCcw size={15} />
                            </button>
                          </>
                        ) : req.status === 'PENDING' ? (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '2px 6px', background: 'var(--surface-elevated, #f0f2f5)', borderRadius: 4, border: '1px solid var(--border)' }} title={`Awaiting Level ${req.currentLevel} approval by ${req.requiredRole}`}>
                            L{req.currentLevel} ({req.requiredRole})
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > perPage && (
            <div className="approvals-pagination">
              <span className="approvals-pagination__info">
                Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
              </span>
              <div className="approvals-pagination__btns">
                <button className="approvals-pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} className={`approvals-pagination__btn ${currentPage === p ? 'approvals-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="approvals-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="approvals-table-card">
          <div className="approvals-empty">
            <div className="approvals-empty__icon"><CheckSquare size={48} /></div>
            <div className="approvals-empty__title">No requests found</div>
            <div className="approvals-empty__desc">{search ? 'Try adjusting your search.' : 'All caught up! No approval requests at the moment.'}</div>
          </div>
        </div>
      )}

      {/* Action Modal (Approve / Reject / Return) */}
      {actionModal && (
        <div className="approvals-modal-backdrop" onClick={() => setActionModal(null)}>
          <div className="approvals-modal" onClick={(e) => e.stopPropagation()}>
            <div className={`approvals-modal__header approvals-modal__header--${actionColor}`}>
              <div className="approvals-modal__title">
                {actionModal.action === 'approve' ? <ThumbsUp size={20} /> : actionModal.action === 'reject' ? <ThumbsDown size={20} /> : <RotateCcw size={20} />}
                <span>{actionTitle}</span>
              </div>
              <button className="approvals-modal__close" onClick={() => setActionModal(null)}><X size={18} /></button>
            </div>
            <div className="approvals-modal__body">
              <div className="approvals-modal__request-summary">
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Reference</span>
                  <span className="approvals-modal__summary-value">{actionModal.request.referenceNumber}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Title</span>
                  <span className="approvals-modal__summary-value">{actionModal.request.title}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Amount</span>
                  <span className="approvals-modal__summary-value approvals-modal__summary-value--amount">{actionModal.request.amount}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Requested By</span>
                  <span className="approvals-modal__summary-value">{actionModal.request.requestedBy}</span>
                </div>
              </div>
              {actionModal.action === 'return' && (
                <div style={{ margin: '14px 0 6px', padding: 12, background: 'var(--surface-card, #f7f9fa)', border: '1px solid var(--border, #d9d9d9)', borderRadius: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #32363a)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Return Destination
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary, #32363a)' }}>
                      <input
                        type="radio"
                        name="approvalReturnTarget"
                        value="ORIGINATOR"
                        checked={actionReturnTarget === 'ORIGINATOR'}
                        onChange={() => setActionReturnTarget('ORIGINATOR')}
                        style={{ marginTop: 3, accentColor: '#0a6ed1' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color: '#e9730c' }}>Return to Originator for Revision</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary, #6a6d70)', marginTop: 2 }}>
                          Mark request as Returned & notify creator so they can revise and resubmit
                        </div>
                      </div>
                    </label>
                    {(actionModal.request.module === 'Quotation' || actionModal.request.module === 'Quotations') && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary, #32363a)' }}>
                        <input
                          type="radio"
                          name="approvalReturnTarget"
                          value="VENDOR"
                          checked={actionReturnTarget === 'VENDOR'}
                          onChange={() => setActionReturnTarget('VENDOR')}
                          style={{ marginTop: 3, accentColor: '#0a6ed1' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: '#bb0000' }}>Return to Vendor for Resubmission</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary, #6a6d70)', marginTop: 2 }}>
                            Send feedback to Vendor so they can revise and resubmit
                          </div>
                        </div>
                      </label>
                    )}
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary, #32363a)' }}>
                      <input
                        type="radio"
                        name="approvalReturnTarget"
                        value="LEVEL_1"
                        checked={actionReturnTarget === 'LEVEL_1'}
                        onChange={() => setActionReturnTarget('LEVEL_1')}
                        style={{ marginTop: 3, accentColor: '#0a6ed1' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color: '#0070c0' }}>Restart at Level 1</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary, #6a6d70)', marginTop: 2 }}>
                          Immediately restart internal approval chain at Level 1 (creates new pending Level 1 request)
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
              <div className="approvals-modal__field">
                <label className="approvals-modal__label">
                  <MessageSquare size={13} style={{ marginRight: 4 }} />
                  Comments {actionModal.action !== 'approve' && <span>*</span>}
                </label>
                <textarea
                  className="approvals-modal__textarea"
                  rows={4}
                  placeholder={actionModal.action === 'approve' ? 'Optional comments...' : 'Provide a reason...'}
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                />
              </div>
            </div>
            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setActionModal(null)}>Cancel</button>
              <button
                className={`approvals-modal__btn approvals-modal__btn--${actionColor}`}
                disabled={actionModal.action !== 'approve' && !actionComment.trim()}
                onClick={handleAction}
              >
                {actionModal.action === 'approve' ? <ThumbsUp size={16} /> : actionModal.action === 'reject' ? <ThumbsDown size={16} /> : <RotateCcw size={16} />}
                {actionModal.action === 'approve' ? 'Approve' : actionModal.action === 'reject' ? 'Reject' : 'Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailRequest && (
        <div className="approvals-modal-backdrop" onClick={() => setDetailRequest(null)}>
          <div className="approvals-modal approvals-modal--detail" onClick={(e) => e.stopPropagation()}>
            <div className="approvals-modal__header">
              <div className="approvals-modal__title"><Eye size={20} /><span>Request Details</span></div>
              <button className="approvals-modal__close" onClick={() => setDetailRequest(null)}><X size={18} /></button>
            </div>
            <div className="approvals-modal__body">
              <div className="approvals-detail-grid">
                {[
                  { label: 'Reference', value: detailRequest.referenceNumber },
                  { label: 'Module', value: detailRequest.module },
                  { label: 'Title', value: detailRequest.title },
                  { label: 'Amount', value: detailRequest.amount },
                  { label: 'Requested By', value: detailRequest.requestedBy },
                  { label: 'Department', value: detailRequest.department },
                  { label: 'Priority', value: detailRequest.priority },
                  { label: 'Status', value: STATUS_LABELS[detailRequest.status] },
                  { label: 'Approval Level', value: `Level ${detailRequest.currentLevel} of ${detailRequest.totalLevels}` },
                  { label: 'Required Role', value: detailRequest.requiredRole },
                  { label: 'Submitted', value: formatDateTime(detailRequest.submittedAt) },
                ].map((item) => (
                  <div key={item.label} className="approvals-detail-grid__item">
                    <span className="approvals-detail-grid__label">{item.label}</span>
                    <span className="approvals-detail-grid__value">{item.value}</span>
                  </div>
                ))}
              </div>
              {detailRequest.comments && (
                <div className="approvals-detail-comments">
                  <span className="approvals-detail-comments__label"><MessageSquare size={13} /> Comments</span>
                  <p className="approvals-detail-comments__text">{detailRequest.comments}</p>
                </div>
              )}
              {detailRequest.module === 'Contract' && (
                <button
                  className="approvals-modal__btn approvals-modal__btn--view-contract"
                  onClick={() => window.open(`/contracts/${detailRequest.referenceId}`, '_blank')}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <ExternalLink size={16} /> View Contract
                </button>
              )}
              <button
                className="approvals-modal__btn approvals-modal__btn--view-contract"
                onClick={() => setChainModal({ module: CANONICAL_MODULE[detailRequest.module] || detailRequest.module, referenceId: detailRequest.referenceId })}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Clock size={16} /> View Approval Chain
              </button>
            </div>
            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setDetailRequest(null)}>Close</button>
              {detailRequest.status === 'PENDING' && (
                <>
                  <button className="approvals-modal__btn approvals-modal__btn--approve" onClick={() => { setDetailRequest(null); openAction(detailRequest, 'approve'); }}>
                    <ThumbsUp size={16} /> Approve
                  </button>
                  <button className="approvals-modal__btn approvals-modal__btn--reject" onClick={() => { setDetailRequest(null); openAction(detailRequest, 'reject'); }}>
                    <ThumbsDown size={16} /> Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approval Chain Modal */}
      {chainModal && (
        <ApprovalChainView
          module={chainModal.module}
          referenceId={chainModal.referenceId}
          onClose={() => setChainModal(null)}
        />
      )}
    </div>
  );
}
