import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { rfqService } from '../../services/rfqService';
import { approvalService } from '../../services/approvalService';
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
  AlertTriangle, Clock, CheckCircle2, XCircle, ThumbsUp, ThumbsDown, Undo2, RotateCcw, MessageSquare, CheckSquare,
} from 'lucide-react';
import type { RFQStatus } from '../../types';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import RFQDetailModal from '../../components/rfq/RFQDetailModal';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
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
  rfqNumber:    { width: '210px', align: 'left'   },
  title:        { width: '220px', align: 'left'   },
  status:       { width: '190px', align: 'left'   },
  creator:      { width: '150px', align: 'left'   },
  createdAt:    { width: '110px', align: 'left'   },
  itemCount:    { width:  '70px', align: 'center' },
  vendorCount:  { width:  '85px', align: 'center' },
  quotationCount:{ width: '96px', align: 'center' },
  totalEstimate:{ width: '116px', align: 'right'  },
  priority:     { width:  '96px', align: 'left'   },
  department:   { width: '120px', align: 'left'   },
  closingDate:  { width: '110px', align: 'left'   },
  currency:     { width:  '76px', align: 'center' },
  rfqType:      { width: '100px', align: 'center' },
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
    render: (rfq) => {
      const isApprovedByMe = (rfq as any)._isApprovedByMe;
      const isReturnedByMe = (rfq as any)._isReturnedByMe;
      const isPending = rfq.status === 'PENDING_APPROVAL';
      let displayStatus: string = (rfq.status === 'SENT' || rfq.status === 'IN_PROGRESS' || rfq.status === 'ACCEPTED')
        ? 'APPROVED'
        : (isPending && isReturnedByMe)
        ? 'RETURNED'
        : (isPending && isApprovedByMe)
        ? 'APPROVED'
        : rfq.status;
      const label = (displayStatus === 'APPROVED' || displayStatus === 'SENT')
        ? 'Approved'
        : displayStatus === 'ACCEPTED'
        ? 'Accepted'
        : (STATUS_LABELS[rfq.status as RFQStatus] || displayStatus);
      return (
        <span className={`rfq-badge rfq-badge--${displayStatus}`}>
          <span className="rfq-badge__dot" />
          {label}
        </span>
      );
    },
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

type StatusFilter = 'ALL' | RFQStatus | 'DRAFT_OR_PENDING';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  SENT: 'Approved',
  IN_PROGRESS: 'Accepted',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  RETURNED: 'Returned',
};

const PRIORITY_CLASS: Record<string, string> = {
  Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical',
};

// ColumnCustomizer is now imported from shared components

// ─── Main Component ───────────────────────────────────────────

export default function RFQPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreateRFQ = hasPermission('RFQ Management', 'canCreate') || hasPermission('RFQ', 'canCreate');
  const canApproveRFQ = hasPermission('RFQ Management', 'canApprove') || hasPermission('RFQ', 'canApprove') || canCreateRFQ;
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
  const [deleteForceRequired, setDeleteForceRequired] = useState(false);

  // ── Bulk Selection & Delete State ─────────────────────────────
  const [selectedRfqIds, setSelectedRfqIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // ── Approval Action State for RFQs ─────────────────────
  const [pendingApprovalsMap, setPendingApprovalsMap] = useState<Map<string, any>>(new Map());
  const [myApprovedMap, setMyApprovedMap] = useState<Set<string>>(new Set());
  const [myReturnedMap, setMyReturnedMap] = useState<Set<string>>(new Set());
  const [approvalActionModal, setApprovalActionModal] = useState<{
    rfq: MockRFQ;
    action: 'approve' | 'reject' | 'return';
    approvalId: string;
  } | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);
  const [approvalActionMessage, setApprovalActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionReturnTarget, setActionReturnTarget] = useState<'ORIGINATOR' | 'LEVEL_1'>('ORIGINATOR');
  const [actionSuccessData, setActionSuccessData] = useState<ActionSuccessModalData | null>(null);

  const fetchPendingApprovals = useCallback(async () => {
    try {
      const [pendingRows, approvedRows, returnedRows] = await Promise.all([
        approvalService.listTable({ module: 'RFQ', status: 'PENDING' }),
        approvalService.listTable({ module: 'RFQ', status: 'APPROVED' }),
        approvalService.listTable({ module: 'RFQ', status: 'RETURNED' }),
      ]);
      const map = new Map<string, any>();
      pendingRows.forEach((r) => {
        if (r.referenceId) map.set(String(r.referenceId), r);
        if (r.referenceNumber) map.set(String(r.referenceNumber), r);
        if (r.id) map.set(String(r.id), r);
      });
      setPendingApprovalsMap(map);

      const aSet = new Set<string>();
      approvedRows.forEach((r) => {
        if (r.referenceId) aSet.add(String(r.referenceId));
        if (r.referenceNumber) aSet.add(String(r.referenceNumber));
        if (r.id) aSet.add(String(r.id));
      });
      setMyApprovedMap(aSet);

      const rSet = new Set<string>();
      returnedRows.forEach((r) => {
        if (r.referenceId) rSet.add(String(r.referenceId));
        if (r.referenceNumber) rSet.add(String(r.referenceNumber));
        if (r.id) rSet.add(String(r.id));
      });
      setMyReturnedMap(rSet);
    } catch {
      setPendingApprovalsMap(new Map());
      setMyApprovedMap(new Set());
      setMyReturnedMap(new Set());
    }
  }, []);

  useEffect(() => {
    fetchPendingApprovals();
  }, [rfqList, fetchPendingApprovals]);

  const openApprovalAction = useCallback((rfq: MockRFQ, action: 'approve' | 'reject' | 'return') => {
    const found = pendingApprovalsMap.get(String(rfq.id)) || pendingApprovalsMap.get(rfq.rfqNumber);
    const approvalId = found ? found.id : String(rfq.id);

    setApprovalActionModal({ rfq, action, approvalId });
    setApprovalComment('');
    setActionReturnTarget('ORIGINATOR');
  }, [pendingApprovalsMap]);

  const handleExecuteApprovalAction = useCallback(() => {
    if (!approvalActionModal) return;
    const { rfq, action, approvalId } = approvalActionModal;
    const comment = approvalComment.trim();

    if (action !== 'approve' && !comment) {
      setApprovalActionMessage({
        type: 'error',
        text: action === 'reject' ? 'Please enter a comment explaining the reason for rejection.' : 'Please enter a comment explaining the reason for return.',
      });
      return;
    }

    // ⚡ INSTANT 0ms Success Modal Popup!
    const modalType = action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : 'return';
    const defaultMsg = action === 'approve'
      ? `RFQ #${rfq.rfqNumber} Level approved successfully!`
      : action === 'reject'
      ? `RFQ #${rfq.rfqNumber} Rejected.`
      : `RFQ #${rfq.rfqNumber} Returned for revision.`;

    setActionSuccessData({
      actionType: modalType,
      module: 'RFQ',
      referenceNumber: rfq.rfqNumber,
      title: rfq.title,
      message: defaultMsg,
      comment: comment || undefined,
      details: [
        { label: 'Created By', value: rfq.creator },
        { label: 'Department', value: rfq.department || 'Procurement' },
      ],
    });

    setApprovalActionModal(null);
    setApprovalComment('');
    setApprovalActionLoading(false);

    // ── Background API Execution & Table Sync ──
    const apiCall = action === 'approve'
      ? approvalService.approve(approvalId, comment)
      : action === 'reject'
      ? approvalService.reject(approvalId, comment)
      : approvalService.return(approvalId, comment, actionReturnTarget);

    apiCall
      .then((res) => {
        if (res?.message) {
          setActionSuccessData((prev) => prev ? { ...prev, message: res.message } : null);
        }
        reload();
        fetchPendingApprovals();
      })
      .catch((err) => {
        setActionSuccessData(null);
        setToast({ message: err instanceof Error ? err.message : 'Action failed', type: 'error' });
      });
  }, [approvalActionModal, approvalComment, actionReturnTarget, reload, fetchPendingApprovals]);

  const anyModalOpen = !!(detailRFQ || deleteTarget || approvalActionModal || actionSuccessData);
  useBodyScrollLock(anyModalOpen);

  const stats = useMemo(() => {
    const cleanList = rfqList.filter((r) => r.title !== 'Direct PO Master' && !r.rfqNumber?.startsWith('RFQ-DIRECT'));
    return {
      total: cleanList.length,
      draft: cleanList.filter((r) => r.status === 'DRAFT').length,
      pendingApproval: cleanList.filter((r) => r.status === 'PENDING_APPROVAL').length,
      draftOrPending: cleanList.filter((r) => r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL').length,
      approved: cleanList.filter((r) => r.status === 'APPROVED' || r.status === 'SENT' || r.status === 'IN_PROGRESS' || r.status === 'ACCEPTED').length,
      rejected: cleanList.filter((r) => r.status === 'REJECTED').length,
      sent: cleanList.filter((r) => r.status === 'SENT' || r.status === 'APPROVED' || r.status === 'ACCEPTED').length,
      inProgress: 0,
      closed: cleanList.filter((r) => r.status === 'CLOSED').length,
      cancelled: cleanList.filter((r) => r.status === 'CANCELLED').length,
    };
  }, [rfqList]);

  const handleKpiClick = useCallback((filter: StatusFilter | null) => {
    setStatusFilter(prev => prev === filter ? 'ALL' : (filter || 'ALL'));
    setCurrentPage(1);
  }, []);

  const handleSendRFQ = useCallback(async () => {
    if (!detailRFQ || (detailRFQ.status !== 'DRAFT' && detailRFQ.status !== 'APPROVED')) return;

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
      const msg = err instanceof Error ? err.message : 'Failed to send RFQ';
      if (msg.includes('PENDING_APPROVAL') || msg.includes('APPROVAL_REQUIRED')) {
        setSendError(`RFQ #${rfq.rfqNumber} is currently pending internal approval. Please approve it from the Approvals page before sending to vendors.`);
      } else {
        setSendError(msg);
      }
    } finally {
      setSending(false);
    }
  }, [detailRFQ, reload]);

  const requestDeleteRFQ = useCallback((rfq: MockRFQ) => {
    setDeleteError(null);
    setDeleteSuccess(null);
    setDeleteTarget(rfq);
    setDeleteForceRequired(false);
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
    setDeleteForceRequired(false);
    try {
      await rfqService.delete(rfq.id);
      if (detailRFQ?.id === rfq.id) setDetailRFQ(null);
      setDeleteSuccess(`${rfq.rfqNumber} deleted successfully.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      const isRelatedRecordsError =
        err instanceof Error &&
        'code' in err &&
        (err as { code?: string }).code === 'RFQ_HAS_RELATED_RECORDS';
      if (isRelatedRecordsError) {
        setDeleteForceRequired(true);
      }
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete RFQ');
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, detailRFQ?.id, reload]);

  const confirmForceDeleteRFQ = useCallback(async () => {
    if (!deleteTarget) return;
    const rfq = deleteTarget;
    setDeletingId(rfq.id);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      await rfqService.delete(rfq.id, { force: true });
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
    let list = rfqList.filter((r) => r.title !== 'Direct PO Master' && !r.rfqNumber?.startsWith('RFQ-DIRECT'));
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'APPROVED') {
        list = list.filter((r) => r.status === 'APPROVED' || r.status === 'SENT' || r.status === 'IN_PROGRESS' || r.status === 'ACCEPTED');
      } else if (statusFilter === 'DRAFT_OR_PENDING') {
        list = list.filter((r) => r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL');
      } else {
        list = list.filter((r) => r.status === statusFilter);
      }
    }
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

  const isAllSelected = useMemo(() => {
    return (
      paginated.length > 0 &&
      paginated.every((rfq) => selectedRfqIds.includes(String(rfq.id)))
    );
  }, [paginated, selectedRfqIds]);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedRfqIds([]);
    } else {
      setSelectedRfqIds(paginated.map((rfq) => String(rfq.id)));
    }
  }, [isAllSelected, paginated]);

  const handleToggleSelectRow = useCallback((id: string) => {
    const strId = String(id);
    setSelectedRfqIds((prev) =>
      prev.includes(strId) ? prev.filter((x) => x !== strId) : [...prev, strId]
    );
  }, []);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedRfqIds.length === 0) return;
    setIsBulkDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      for (const id of selectedRfqIds) {
        await rfqService.delete(id, { force: true }).catch(() => {});
      }
      setDeleteSuccess(`Successfully deleted ${selectedRfqIds.length} selected RFQ(s).`);
      setSelectedRfqIds([]);
      setShowBulkDeleteModal(false);
      reload();
    } catch {
      setDeleteError('Failed to delete selected RFQs');
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedRfqIds, reload]);

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
      {approvalActionMessage && (
        <MessageStrip
          type={approvalActionMessage.type}
          onClose={() => setApprovalActionMessage(null)}
          autoHideMs={4000}
        >
          {approvalActionMessage.text}
        </MessageStrip>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="rfq-page__header">
        <div className="rfq-page__header-left">
          <h1>RFQs</h1>
          <p>Manage procurement requests</p>
        </div>
        <button
          className={`rfq-page__create-btn ${!hasPermission('RFQ', 'canCreate') ? 'rfq-page__create-btn--disabled' : ''}`}
          onClick={hasPermission('RFQ', 'canCreate') ? () => navigate('/rfq/create') : undefined}
          disabled={!hasPermission('RFQ', 'canCreate')}
          title={!hasPermission('RFQ', 'canCreate') ? 'Admin has not allowed this action. You do not have permission to create RFQs.' : 'Create new RFQ'}
          style={!hasPermission('RFQ', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
        >
          <Plus size={18} /> New RFQ
        </button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="rfq-summary">
        {[
          { icon: <ClipboardList size={22}/>, mod: 'total',     value: stats.total,           label: 'Total RFQs',      filter: null as StatusFilter | null },
          { icon: <Clock size={22}/>,         mod: 'pending',   value: stats.draftOrPending,  label: 'Pending Approval / Drafts', filter: 'DRAFT_OR_PENDING' as StatusFilter },
          { icon: <CheckCircle2 size={22}/>,  mod: 'approved',  value: stats.approved,        label: 'Approved',         filter: 'APPROVED' as StatusFilter },
          { icon: <XCircle size={22}/>,       mod: 'rejected',  value: stats.rejected,        label: 'Rejected',         filter: 'REJECTED' as StatusFilter },
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

      {/* ── Floating Bulk Action Banner ── */}
      {selectedRfqIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-card)', border: '1px solid var(--primary-500)',
          padding: '12px 18px', borderRadius: 'var(--radius-md)', marginBottom: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)', transition: 'all 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            <CheckSquare size={18} style={{ color: 'var(--primary-500)' }} />
            <span><strong>{selectedRfqIds.length}</strong> RFQ(s) selected</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="rfq-modal__btn rfq-modal__btn--secondary"
              style={{ padding: '6px 14px', fontSize: 12 }}
              onClick={() => setSelectedRfqIds([])}
            >
              Cancel Selection
            </button>
            <button
              type="button"
              disabled={!canCreateRFQ}
              style={{
                background: canCreateRFQ ? '#dc2626' : '#64748b',
                color: '#ffffff', border: 'none',
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                cursor: canCreateRFQ ? 'pointer' : 'not-allowed',
                opacity: canCreateRFQ ? 1 : 0.5,
                pointerEvents: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 6
              }}
              title={!canCreateRFQ ? "Admin has not allowed this action. You do not have permission to delete RFQs." : undefined}
              onClick={(e) => {
                if (!canCreateRFQ) return;
                (e.currentTarget as HTMLElement).blur();
                setShowBulkDeleteModal(true);
              }}
            >
              <Trash2 size={14} /> Delete Selected ({selectedRfqIds.length})
            </button>
          </div>
        </div>
      )}

      {/* ── Table Card ─────────────────────────────────────── */}
      <div className="rfq-table-card">
        {loading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : paginated.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="rfq-table-wrap">
              <table className="rfq-table">
                {/* colgroup — array expression avoids whitespace text nodes which cause hydration errors */}
                <colgroup>
                  {[
                    <col key="__select" style={{ width: '42px' }} />,
                    ...visibleColumns.map((col) => (
                      <col key={col.key} style={{ width: COL_WIDTHS[col.key] || 'auto' }} />
                    )),
                    <col key="__actions" style={{ width: '160px' }} />
                  ]}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ width: '42px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        disabled={!canCreateRFQ}
                        style={{ width: 16, height: 16, cursor: canCreateRFQ ? 'pointer' : 'not-allowed', accentColor: 'var(--primary-500)' }}
                        checked={isAllSelected}
                        onChange={canCreateRFQ ? handleToggleSelectAll : undefined}
                        title={!canCreateRFQ ? "Admin has not allowed this action. You do not have permission to select RFQs." : "Select All RFQs"}
                      />
                    </th>
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
                  {paginated.map((rfq) => {
                    const pendingApproval = pendingApprovalsMap.get(String(rfq.id)) || pendingApprovalsMap.get(rfq.rfqNumber);
                    const canAct = rfq.status === 'PENDING_APPROVAL' && !!pendingApproval && pendingApproval.canAct !== false;
                    const isApprovedByMe = (myApprovedMap.has(String(rfq.id)) || myApprovedMap.has(rfq.rfqNumber)) && !canAct;
                    const isReturnedByMe = (myReturnedMap.has(String(rfq.id)) || myReturnedMap.has(rfq.rfqNumber)) && !canAct;
                    const enrichedRfq = { ...rfq, _isApprovedByMe: isApprovedByMe, _isReturnedByMe: isReturnedByMe };
                    const isSelected = selectedRfqIds.includes(String(rfq.id));

                    return (
                      <tr key={rfq.id} className={`rfq-table__row rfq-table__row--${(rfq.status || '').toLowerCase()} ${isSelected ? 'rfq-tr--selected' : ''}`} onClick={() => openDetail(enrichedRfq as any)}>
                        <td style={{ textAlign: 'center', width: '42px' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            disabled={!canCreateRFQ}
                            style={{ width: 16, height: 16, cursor: canCreateRFQ ? 'pointer' : 'not-allowed', accentColor: 'var(--primary-500)' }}
                            checked={isSelected}
                            onChange={() => canCreateRFQ && handleToggleSelectRow(String(rfq.id))}
                            title={!canCreateRFQ ? "Admin has not allowed this action. You do not have permission to select RFQs." : undefined}
                          />
                        </td>
                        {visibleColumns.map((col) => {
                          const align = COL_META[col.key]?.align ?? 'left';
                          return (
                            <td
                              key={col.key}
                              className={`rfq-td rfq-td--${col.key}`}
                              style={{ textAlign: align }}
                              onClick={col.key === 'rfqNumber' ? (e) => e.stopPropagation() : undefined}
                            >
                              {col.render(enrichedRfq as any, formatDate, openDetail as any)}
                            </td>
                          );
                        })}
                        <td className="rfq-td rfq-td--actions" onClick={(e) => e.stopPropagation()}>
                          <div className="rfq-table__actions">
                            <button className="rfq-table__action-btn" title="View" onClick={() => openDetail(enrichedRfq as any)}><Eye size={15} /></button>
                            {canAct ? (
                              <>
                                <button
                                  className="rfq-table__action-btn rfq-table__action-btn--approve"
                                  title={!canApproveRFQ ? "Admin has not allowed this action. You do not have permission to approve RFQs." : "Approve RFQ"}
                                  onClick={() => canApproveRFQ && openApprovalAction(rfq, 'approve')}
                                  disabled={!canApproveRFQ}
                                  style={!canApproveRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                                >
                                  <ThumbsUp size={15} />
                                </button>
                                <button
                                  className="rfq-table__action-btn rfq-table__action-btn--reject"
                                  title={!canApproveRFQ ? "Admin has not allowed this action. You do not have permission to reject RFQs." : "Reject RFQ"}
                                  onClick={() => canApproveRFQ && openApprovalAction(rfq, 'reject')}
                                  disabled={!canApproveRFQ}
                                  style={!canApproveRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                                >
                                  <ThumbsDown size={15} />
                                </button>
                                <button
                                  className="rfq-table__action-btn rfq-table__action-btn--return"
                                  title={!canApproveRFQ ? "Admin has not allowed this action. You do not have permission to return RFQs." : "Return RFQ"}
                                  onClick={() => canApproveRFQ && openApprovalAction(rfq, 'return')}
                                  disabled={!canApproveRFQ}
                                  style={!canApproveRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                                >
                                  <RotateCcw size={15} />
                                </button>
                              </>
                            ) : isApprovedByMe && rfq.status === 'PENDING_APPROVAL' ? (
                              <span className="rfq-table__action-btn rfq-table__action-btn--approve" title="You approved Level 1" style={{ cursor: 'default' }}>
                                <CheckCircle2 size={15} />
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="rfq-mobile-list">
              {paginated.map((rfq) => {
                const pendingApproval = pendingApprovalsMap.get(String(rfq.id)) || pendingApprovalsMap.get(rfq.rfqNumber);
                const canAct = rfq.status === 'PENDING_APPROVAL' && !!pendingApproval && pendingApproval.canAct !== false;
                const isApprovedByMe = (myApprovedMap.has(String(rfq.id)) || myApprovedMap.has(rfq.rfqNumber)) && !canAct;
                const isReturnedByMe = (myReturnedMap.has(String(rfq.id)) || myReturnedMap.has(rfq.rfqNumber)) && !canAct;
                const enrichedRfq = { ...rfq, _isApprovedByMe: isApprovedByMe, _isReturnedByMe: isReturnedByMe };
                const displayStatus = (rfq.status === 'SENT' || rfq.status === 'IN_PROGRESS' || rfq.status === 'ACCEPTED')
                  ? 'APPROVED'
                  : (rfq.status === 'PENDING_APPROVAL' && isReturnedByMe)
                  ? 'RETURNED'
                  : (rfq.status === 'PENDING_APPROVAL' && isApprovedByMe)
                  ? 'APPROVED'
                  : rfq.status;
                const displayLabel = (displayStatus === 'APPROVED' || displayStatus === 'SENT') ? 'Approved' : displayStatus === 'ACCEPTED' ? 'Accepted' : (STATUS_LABELS[rfq.status] || displayStatus);
                return (
                  <div key={rfq.id} className="rfq-mobile-card" onClick={() => openDetail(enrichedRfq as any)}>
                  <div className="rfq-mobile-card__top">
                    <span className="rfq-mobile-card__num">{rfq.rfqNumber}</span>
                    <span className={`rfq-badge rfq-badge--${displayStatus}`}>
                      <span className="rfq-badge__dot" />{displayLabel}
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
                      {canAct ? (
                        <>
                          <button
                            className="rfq-table__action-btn rfq-table__action-btn--approve"
                            title={!canApproveRFQ ? "Admin has not allowed this action. You do not have permission to approve RFQs." : "Approve RFQ"}
                            onClick={() => canApproveRFQ && openApprovalAction(rfq, 'approve')}
                            disabled={!canApproveRFQ}
                            style={!canApproveRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          >
                            <ThumbsUp size={14} />
                          </button>
                          <button
                            className="rfq-table__action-btn rfq-table__action-btn--reject"
                            title={!canApproveRFQ ? "Admin has not allowed this action. You do not have permission to reject RFQs." : "Reject RFQ"}
                            onClick={() => canApproveRFQ && openApprovalAction(rfq, 'reject')}
                            disabled={!canApproveRFQ}
                            style={!canApproveRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          >
                            <ThumbsDown size={14} />
                          </button>
                          <button
                            className="rfq-table__action-btn rfq-table__action-btn--return"
                            title={!canApproveRFQ ? "Admin has not allowed this action. You do not have permission to return RFQs." : "Return RFQ"}
                            onClick={() => canApproveRFQ && openApprovalAction(rfq, 'return')}
                            disabled={!canApproveRFQ}
                            style={!canApproveRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          >
                            <RotateCcw size={14} />
                          </button>
                        </>
                      ) : (
                        hasPermission('RFQ', 'canCreate') && (
                          <button
                            className="rfq-mobile-card__delete"
                            title="Delete RFQ"
                            disabled={deletingId === rfq.id}
                            onClick={() => requestDeleteRFQ(rfq)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )
                      )}
                      <span className="rfq-mobile-card__estimate">{rfq.totalEstimate}</span>
                    </div>
                  </div>
                  <ChevronDown size={14} className="rfq-mobile-card__chevron" />
                </div>
              );
            })}
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
              {deleteForceRequired ? (
                <div className="rfq-confirm__warning-box">
                  <p className="rfq-confirm__warning-text">
                    {deleteError || 'Related purchase orders and/or contracts will also be deleted or disassociated.'}
                  </p>
                </div>
              ) : (
                deleteError && <MessageStrip type="error" onClose={() => setDeleteError(null)} autoHideMs={5000}>{deleteError}</MessageStrip>
              )}
            </div>
            <div className="rfq-confirm__actions">
              <button
                className="rfq-confirm__btn rfq-confirm__btn--secondary"
                onClick={cancelDeleteRFQ}
                disabled={deletingId === deleteTarget.id}
              >
                Cancel
              </button>
              {deleteForceRequired ? (
                <button
                  className="rfq-confirm__btn rfq-confirm__btn--danger rfq-confirm__btn--force"
                  onClick={confirmForceDeleteRFQ}
                  disabled={deletingId === deleteTarget.id}
                >
                  <Trash2 size={15} />
                  {deletingId === deleteTarget.id ? 'Deleting...' : 'Delete Anyway'}
                </button>
              ) : (
                <button
                  className="rfq-confirm__btn rfq-confirm__btn--danger"
                  onClick={confirmDeleteRFQ}
                  disabled={deletingId === deleteTarget.id}
                >
                  <Trash2 size={15} />
                  {deletingId === deleteTarget.id ? 'Deleting...' : 'Delete RFQ'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {approvalActionModal && (
        <div className="rfq-confirm-backdrop" onClick={() => setApprovalActionModal(null)} role="presentation">
          <div
            className="rfq-confirm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', width: 'min(500px, 100%)', gap: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: approvalActionModal.action === 'approve' ? '#16a34a' : approvalActionModal.action === 'reject' ? '#dc2626' : '#d97706' }}>
                {approvalActionModal.action === 'approve' ? <ThumbsUp size={18} /> : approvalActionModal.action === 'reject' ? <ThumbsDown size={18} /> : <RotateCcw size={18} />}
                {approvalActionModal.action === 'approve' ? 'Approve RFQ' : approvalActionModal.action === 'reject' ? 'Reject RFQ' : 'Return RFQ for Revision'}
              </h3>
              <button
                onClick={() => setApprovalActionModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ background: 'var(--surface-elevated)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-500)', marginBottom: 2 }}>
                #{approvalActionModal.rfq.rfqNumber} — {approvalActionModal.rfq.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Created by {approvalActionModal.rfq.creator} · {approvalActionModal.rfq.department || 'Procurement'}
              </div>
            </div>

            {approvalActionModal.action === 'return' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Return Destination:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="rfqActionReturnTarget"
                      value="ORIGINATOR"
                      checked={actionReturnTarget === 'ORIGINATOR'}
                      onChange={() => setActionReturnTarget('ORIGINATOR')}
                    />
                    Return to Creator / Originator for Revision
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="rfqActionReturnTarget"
                      value="LEVEL_1"
                      checked={actionReturnTarget === 'LEVEL_1'}
                      onChange={() => setActionReturnTarget('LEVEL_1')}
                    />
                    Restart Approval Chain at Level 1
                  </label>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                <MessageSquare size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Comments {approvalActionModal.action !== 'approve' && <span style={{ color: '#dc2626' }}>*</span>}:
              </label>
              <textarea
                rows={3}
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder={approvalActionModal.action === 'approve' ? 'Optional comments for approval...' : 'Reason for rejection/return...'}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
              <button
                className="rfq-confirm__btn rfq-confirm__btn--secondary"
                onClick={() => setApprovalActionModal(null)}
                disabled={approvalActionLoading}
              >
                Cancel
              </button>
              <button
                className="rfq-confirm__btn"
                style={{
                  background: approvalActionModal.action === 'approve' ? '#16a34a' : approvalActionModal.action === 'reject' ? '#dc2626' : '#d97706',
                  color: '#fff', border: 'none'
                }}
                disabled={approvalActionLoading || (approvalActionModal.action !== 'approve' && !approvalComment.trim())}
                onClick={handleExecuteApprovalAction}
              >
                {approvalActionLoading
                  ? 'Processing...'
                  : approvalActionModal.action === 'approve'
                  ? 'Confirm Approval'
                  : approvalActionModal.action === 'reject'
                  ? 'Confirm Rejection'
                  : 'Confirm Return'}
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

      {showBulkDeleteModal && (
        <div className="rfq-confirm-backdrop" onClick={() => setShowBulkDeleteModal(false)} role="presentation">
          <div className="rfq-confirm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="rfq-confirm__icon">
              <AlertTriangle size={22} />
            </div>
            <div className="rfq-confirm__content">
              <h2>Delete {selectedRfqIds.length} Selected RFQ(s)?</h2>
              <p>
                Are you sure you want to delete the <strong>{selectedRfqIds.length} selected RFQ(s)</strong>? This action will permanently remove the RFQ records from the system.
              </p>
            </div>
            <div className="rfq-confirm__actions">
              <button
                type="button"
                className="rfq-confirm__btn rfq-confirm__btn--secondary"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isBulkDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rfq-confirm__btn rfq-confirm__btn--danger"
                onClick={handleConfirmBulkDelete}
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? 'Deleting...' : 'Yes, Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Success Modal */}
      <ActionSuccessModal
        data={actionSuccessData}
        onClose={() => setActionSuccessData(null)}
      />
    </div>
  );
}
