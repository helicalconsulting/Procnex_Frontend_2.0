import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { rfqService } from '../../services/rfqService';
import { approvalService } from '../../services/approvalService';
import { sseClient } from '../../services/sseClient';
import { useServiceData } from '../../hooks/useServiceData';
import type { RFQTableRow } from '../../types/viewModels';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Plus, Search, FileText, Eye, Trash2, Users, Building2,
  ArrowUpDown, ChevronLeft, ChevronRight, CalendarDays,
  ClipboardList, AlertTriangle, Clock, CheckCircle2,
  X, XCircle, ThumbsUp, ThumbsDown, RotateCcw, MessageSquare, CheckSquare,
} from 'lucide-react';
import type { RFQStatus } from '../../types';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
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
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import '../../components/shared/ColumnCustomizer.css';

// ─── Types ───────────────────────────────────────────────────

type MockRFQ = RFQTableRow;

const AVAILABLE_DEPARTMENTS = ['FINANCE', 'Human Resource', 'Information Technology', 'Purchase'];

// ─── Column definitions ───────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  render: (rfq: MockRFQ, formatDate: (d: string) => string, openDetail?: (rfq: MockRFQ) => void) => React.ReactNode;
  headerRender?: () => React.ReactNode;
  width?: string;
}

const COL_META: Record<string, { width: string; align?: 'left'|'center'|'right' }> = {
  rfqNumber:    { width: '160px', align: 'left'   },
  title:        { width: '220px', align: 'left'   },
  status:       { width: '160px', align: 'left'   },
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
      <button className="font-semibold text-primary transition-colors hover:text-primary/75 hover:underline" onClick={() => (openDetail as any)(rfq)}>
        {rfq.rfqNumber}
      </button>
    ),
    headerRender: () => <span className="inline-flex items-center gap-1"><ArrowUpDown size={12} />RFQ #</span>,
  },
  {
    key: 'title',
    label: 'Title',
    defaultVisible: true,
    required: true,
    render: (rfq) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">{rfq.title}</span>
        <span className="line-clamp-1 text-xs text-muted-foreground">{rfq.description}</span>
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    defaultVisible: true,
    render: (rfq) => {
      const isReturnedByMe = (rfq as any)._isReturnedByMe || rfq.status === 'RETURNED' || rfq.status === 'RE_REVIEW' || rfq.status === 'RETURN_FOR_RE_REVIEW';
      const isRejectedByMe = (rfq as any)._isRejectedByMe || rfq.status === 'REJECTED';
      const isApprovedByMe = (rfq as any)._isApprovedByMe;

      let displayStatus: string = isReturnedByMe
        ? 'RETURNED'
        : (isRejectedByMe || rfq.status === 'REJECTED')
        ? 'REJECTED'
        : (rfq.status === 'SENT' || rfq.status === 'IN_PROGRESS' || rfq.status === 'ACCEPTED' || rfq.status === 'APPROVED' || isApprovedByMe)
        ? 'APPROVED'
        : rfq.status;

      const label = displayStatus === 'RETURNED'
        ? 'Returned for Revision'
        : (displayStatus === 'APPROVED' || displayStatus === 'SENT')
        ? 'Approved'
        : displayStatus === 'ACCEPTED'
        ? 'Accepted'
        : displayStatus === 'REJECTED'
        ? 'Rejected'
        : (STATUS_LABELS[displayStatus as RFQStatus] || STATUS_LABELS[rfq.status as RFQStatus] || displayStatus);
      return (
        <Badge tone={statusTone(displayStatus)}>
          <span className="size-1.5 rounded-full bg-current" />
          {label}
        </Badge>
      );
    },
  },
  {
    key: 'creator',
    label: 'Created By',
    defaultVisible: true,
    render: (rfq) => (
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary ring-1 ring-primary/15">{rfq.creatorInitials}</span>
        <span className="truncate text-sm text-foreground">{rfq.creator}</span>
      </div>
    ),
  },
  {
    key: 'createdAt',
    label: 'Date',
    defaultVisible: true,
    render: (rfq, formatDate) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(rfq.createdAt)}</span>
    ),
  },
  {
    key: 'itemCount',
    label: 'Items',
    defaultVisible: true,
    render: (rfq) => <span className="tabular-nums text-foreground">{rfq.itemCount}</span>,
  },
  {
    key: 'vendorCount',
    label: 'Vendors',
    defaultVisible: true,
    render: (rfq) => (
      <span className="inline-flex items-center justify-center gap-1.5 tabular-nums text-muted-foreground">
        <Users size={13} />{rfq.vendorCount}
      </span>
    ),
  },
  {
    key: 'quotationCount',
    label: 'Quotes',
    defaultVisible: true,
    render: (rfq) => (
      <span className={cn('inline-flex min-w-7 justify-center rounded-lg px-2 py-1 text-xs font-semibold tabular-nums', rfq.quotationCount > 0 ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground')}>
        {rfq.quotationCount}
      </span>
    ),
  },
  {
    key: 'totalEstimate',
    label: 'Estimate',
    defaultVisible: true,
    render: (rfq) => <span className="whitespace-nowrap font-semibold tabular-nums text-foreground">{rfq.totalEstimate}</span>,
  },
  {
    key: 'priority',
    label: 'Priority',
    defaultVisible: false,
    render: (rfq) => (
      <Badge tone={rfq.priority === 'Critical' ? 'danger' : rfq.priority === 'High' ? 'warning' : rfq.priority === 'Low' ? 'neutral' : 'info'}>
        {rfq.priority}
      </Badge>
    ),
  },
  {
    key: 'department',
    label: 'Department',
    defaultVisible: false,
    render: (rfq) => <span className="text-sm text-muted-foreground">{rfq.department || '—'}</span>,
  },
  {
    key: 'closingDate',
    label: 'Closing Date',
    defaultVisible: false,
    render: (rfq, formatDate) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(rfq.closingDate)}</span>
    ),
  },
  {
    key: 'currency',
    label: 'Currency',
    defaultVisible: false,
    render: (rfq) => <span className="text-sm font-medium text-muted-foreground">{rfq.currency}</span>,
  },
  {
    key: 'rfqType',
    label: 'RFQ Type',
    defaultVisible: true,
    render: (rfq) => (
      <Badge tone={rfq.rfqType === 'TENDER' ? 'info' : 'primary'}>
        {rfq.rfqType === 'TENDER' ? 'Tender' : 'RFQ'}
      </Badge>
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
  RETURNED: 'Returned for Revision',
  RE_REVIEW: 'Returned for Revision',
  RETURN_FOR_RE_REVIEW: 'Returned for Revision',
};

function statusTone(status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'RETURNED' || status === 'RE_REVIEW' || status === 'RETURN_FOR_RE_REVIEW') return 'warning';
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'danger';
  if (['APPROVED', 'SENT', 'IN_PROGRESS', 'ACCEPTED'].includes(status)) return 'success';
  if (status === 'PENDING_APPROVAL') return 'warning';
  if (status === 'CLOSED') return 'info';
  return 'neutral';
}

export default function RFQPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreateRFQ = hasPermission('RFQ Management', 'canCreate') || hasPermission('RFQ', 'canCreate');
  const canApproveRFQ = hasPermission('RFQ Management', 'canApprove') || hasPermission('RFQ', 'canApprove') || canCreateRFQ;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: rfqList, loading, error, reload, forceRefresh } = useServiceData(
    () => rfqService.list({ limit: 100 }),
    [] as RFQTableRow[],
    [],
    { cacheKey: 'rfqs:list' }
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockRFQ | null>(null);
  const [deleteForceRequired, setDeleteForceRequired] = useState(false);

  // Bulk Selection & Delete State
  const [selectedRfqIds, setSelectedRfqIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Approval Action State
  const [pendingApprovalsMap, setPendingApprovalsMap] = useState<Map<string, any>>(new Map());
  const [localStatusMap, setLocalStatusMap] = useState<Map<string, RFQStatus>>(new Map());
  const [myApprovedMap, setMyApprovedMap] = useState<Set<string>>(new Set());
  const [myReturnedMap, setMyReturnedMap] = useState<Set<string>>(new Set());
  const [myRejectedMap, setMyRejectedMap] = useState<Set<string>>(new Set());
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
      const [pendingRows, approvedRows, returnedRows, rejectedRows] = await Promise.all([
        approvalService.listTable({ module: 'RFQ', status: 'PENDING' }),
        approvalService.listTable({ module: 'RFQ', status: 'APPROVED' }),
        approvalService.listTable({ module: 'RFQ', status: 'RETURNED' }),
        approvalService.listTable({ module: 'RFQ', status: 'REJECTED' }),
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
      setMyApprovedMap((prev) => {
        const next = new Set(prev);
        aSet.forEach((x) => next.add(x));
        return next;
      });

      const rSet = new Set<string>();
      returnedRows.forEach((r) => {
        if (r.referenceId) rSet.add(String(r.referenceId));
        if (r.referenceNumber) rSet.add(String(r.referenceNumber));
        if (r.id) rSet.add(String(r.id));
      });
      setMyReturnedMap((prev) => {
        const next = new Set(prev);
        rSet.forEach((x) => next.add(x));
        return next;
      });

      const rejSet = new Set<string>();
      rejectedRows.forEach((r) => {
        if (r.referenceId) rejSet.add(String(r.referenceId));
        if (r.referenceNumber) rejSet.add(String(r.referenceNumber));
        if (r.id) rejSet.add(String(r.id));
      });
      setMyRejectedMap((prev) => {
        const next = new Set(prev);
        rejSet.forEach((x) => next.add(x));
        return next;
      });
    } catch {
      setPendingApprovalsMap(new Map());
      setMyApprovedMap(new Set());
      setMyReturnedMap(new Set());
      setMyRejectedMap(new Set());
    }
  }, []);

  useEffect(() => {
    fetchPendingApprovals();

    const handleRefresh = () => {
      forceRefresh();
      fetchPendingApprovals();
    };

    const unsubLevel = sseClient.on('approval_level_complete', handleRefresh);
    const unsubChain = sseClient.on('approval_chain_complete', handleRefresh);
    const unsubNotif = sseClient.on('notification', handleRefresh);

    window.addEventListener('heliflow:approval-updated', handleRefresh);

    return () => {
      unsubLevel();
      unsubChain();
      unsubNotif();
      window.removeEventListener('heliflow:approval-updated', handleRefresh);
    };
  }, [rfqList, fetchPendingApprovals, forceRefresh]);

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

    // ⚡ INSTANT Optimistic State Updates in local maps (0ms latency!)
    const optimisticStatus: RFQStatus = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'RETURNED';
    setLocalStatusMap((prev) => {
      const next = new Map(prev);
      next.set(String(rfq.id), optimisticStatus);
      if (rfq.rfqNumber) next.set(rfq.rfqNumber, optimisticStatus);
      if (approvalId) next.set(approvalId, optimisticStatus);
      return next;
    });

    setPendingApprovalsMap((prev) => {
      const next = new Map(prev);
      next.delete(String(rfq.id));
      if (rfq.rfqNumber) next.delete(rfq.rfqNumber);
      next.delete(approvalId);
      return next;
    });

    if (action === 'approve') {
      setMyApprovedMap((prev) => {
        const next = new Set(prev);
        next.add(String(rfq.id));
        if (rfq.rfqNumber) next.add(rfq.rfqNumber);
        return next;
      });
    } else if (action === 'return') {
      setMyReturnedMap((prev) => {
        const next = new Set(prev);
        next.add(String(rfq.id));
        if (rfq.rfqNumber) next.add(rfq.rfqNumber);
        return next;
      });
    } else if (action === 'reject') {
      setMyRejectedMap((prev) => {
        const next = new Set(prev);
        next.add(String(rfq.id));
        if (rfq.rfqNumber) next.add(rfq.rfqNumber);
        return next;
      });
    }

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
        forceRefresh();
        reload();
        fetchPendingApprovals();
        window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
      })
      .catch((err) => {
        setActionSuccessData(null);
        setApprovalActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' });
      });
  }, [approvalActionModal, approvalComment, actionReturnTarget, reload, forceRefresh, fetchPendingApprovals]);

  const enrichedRfqList = useMemo(() => {
    return rfqList.map((rfq) => {
      const idStr = String(rfq.id);
      const overrideStatus = localStatusMap.get(idStr) || (rfq.rfqNumber && localStatusMap.get(rfq.rfqNumber));
      const effectiveStatus = overrideStatus || rfq.status;

      const isReturned = effectiveStatus === 'RETURNED' || effectiveStatus === 'RE_REVIEW' || effectiveStatus === 'RETURN_FOR_RE_REVIEW' || myReturnedMap.has(idStr) || (rfq.rfqNumber && myReturnedMap.has(rfq.rfqNumber));
      const isRejected = !isReturned && (effectiveStatus === 'REJECTED' || myRejectedMap.has(idStr) || (rfq.rfqNumber && myRejectedMap.has(rfq.rfqNumber)));
      const isApproved = !isReturned && !isRejected && (effectiveStatus === 'APPROVED' || effectiveStatus === 'SENT' || effectiveStatus === 'ACCEPTED' || myApprovedMap.has(idStr) || (rfq.rfqNumber && myApprovedMap.has(rfq.rfqNumber)));

      const finalStatus = isReturned ? 'RETURNED' : isRejected ? 'REJECTED' : isApproved ? 'APPROVED' : effectiveStatus;

      return {
        ...rfq,
        status: finalStatus,
        _isApprovedByMe: Boolean(isApproved && (myApprovedMap.has(idStr) || (rfq.rfqNumber && myApprovedMap.has(rfq.rfqNumber)) || rfq._isApprovedByMe)),
        _isReturnedByMe: Boolean(isReturned),
        _isRejectedByMe: Boolean(isRejected),
      };
    });
  }, [rfqList, localStatusMap, myApprovedMap, myReturnedMap, myRejectedMap]);

  const stats = useMemo(() => {
    const cleanList = enrichedRfqList.filter((r) => r.title !== 'Direct PO Master' && !r.rfqNumber?.startsWith('RFQ-DIRECT'));
    return {
      total: cleanList.length,
      draft: cleanList.filter((r) => r.status === 'DRAFT').length,
      pendingApproval: cleanList.filter((r) => r.status === 'PENDING_APPROVAL' && !r._isApprovedByMe && !r._isReturnedByMe && !r._isRejectedByMe).length,
      draftOrPending: cleanList.filter((r) => (r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL' || r.status === 'RETURNED') && !r._isApprovedByMe && !r._isRejectedByMe).length,
      approved: cleanList.filter((r) => (r.status === 'APPROVED' || r.status === 'SENT' || r.status === 'IN_PROGRESS' || r.status === 'ACCEPTED' || r._isApprovedByMe) && !r._isReturnedByMe && !r._isRejectedByMe && r.status !== 'RETURNED' && r.status !== 'REJECTED').length,
      rejected: cleanList.filter((r) => r.status === 'REJECTED' || r._isRejectedByMe).length,
    };
  }, [enrichedRfqList]);

  const handleKpiClick = useCallback((filter: StatusFilter | null) => {
    setStatusFilter(prev => prev === filter ? 'ALL' : (filter || 'ALL'));
    setCurrentPage(1);
  }, []);

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
  }, [deleteTarget, reload]);

  const confirmForceDeleteRFQ = useCallback(async () => {
    if (!deleteTarget) return;
    const rfq = deleteTarget;
    setDeletingId(rfq.id);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      await rfqService.delete(rfq.id, { force: true });
      setDeleteSuccess(`${rfq.rfqNumber} deleted successfully.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete RFQ');
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, reload]);

  useEffect(() => {
    if (!deleteSuccess && !deleteError) return;
    const timer = window.setTimeout(() => {
      if (deleteSuccess) setDeleteSuccess(null);
      if (deleteError) setDeleteError(null);
    }, deleteSuccess ? 2000 : 5000);
    return () => window.clearTimeout(timer);
  }, [deleteSuccess, deleteError]);

  // Column state
  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const perPage = 8;

  const departmentOptions = useMemo(() => {
    return AVAILABLE_DEPARTMENTS;
  }, []);

  const filtered = useMemo(() => {
    let list = enrichedRfqList.filter((r) => r.title !== 'Direct PO Master' && !r.rfqNumber?.startsWith('RFQ-DIRECT'));
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'APPROVED') {
        list = list.filter((r) => (r.status === 'APPROVED' || r.status === 'SENT' || r.status === 'IN_PROGRESS' || r.status === 'ACCEPTED' || r._isApprovedByMe) && !r._isReturnedByMe && !r._isRejectedByMe && r.status !== 'RETURNED' && r.status !== 'REJECTED');
      } else if (statusFilter === 'DRAFT_OR_PENDING') {
        list = list.filter((r) => (r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL' || r.status === 'RETURNED') && !r._isApprovedByMe);
      } else if (statusFilter === 'RETURNED') {
        list = list.filter((r) => r.status === 'RETURNED' || r._isReturnedByMe);
      } else {
        list = list.filter((r) => {
          const effective = r._isReturnedByMe ? 'RETURNED' : r._isRejectedByMe ? 'REJECTED' : r._isApprovedByMe ? 'APPROVED' : r.status;
          return effective === statusFilter;
        });
      }
    }
    if (departmentFilter !== 'ALL') {
      list = list.filter((r) => (r.department || '').toLowerCase() === departmentFilter.toLowerCase());
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.rfqNumber.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.creator.toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [enrichedRfqList, statusFilter, departmentFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

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

  const visibleColumns = useMemo(
    () => columnOrder
      .map((k) => ALL_COLUMNS.find((c) => c.key === k)!)
      .filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys],
  );

  const openDetail = useCallback((rfq: MockRFQ) => {
    navigate(`/rfq/${rfq.id}`);
  }, [navigate]);

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
    <PageFrame>
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

      <PageLead
        title="Request for quotations"
        description="Track requests, approvals, vendor participation, and quoted value from one workspace."
        actions={
          <Button
            onClick={canCreateRFQ ? () => navigate('/rfq/create') : undefined}
            disabled={!canCreateRFQ}
            title={!canCreateRFQ ? 'You do not have permission to create RFQs.' : 'Create new RFQ'}
          >
            <Plus /> New RFQ
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: ClipboardList, tone: 'primary' as const, value: stats.total, label: 'Total RFQs', detail: 'All requests', filter: null as StatusFilter | null },
          { icon: Clock, tone: 'warning' as const, value: stats.draftOrPending, label: 'Needs attention', detail: 'Pending approval or draft', filter: 'DRAFT_OR_PENDING' as StatusFilter },
          { icon: CheckCircle2, tone: 'success' as const, value: stats.approved, label: 'Approved', detail: 'Ready or in progress', filter: 'APPROVED' as StatusFilter },
          { icon: XCircle, tone: 'danger' as const, value: stats.rejected, label: 'Rejected', detail: 'Requires review', filter: 'REJECTED' as StatusFilter },
        ].map((c) => {
          const isActive = c.filter === null ? !statusFilter || statusFilter === 'ALL' : statusFilter === c.filter;
          return (
            <MetricCard
              key={c.label}
              icon={c.icon}
              tone={c.tone}
              value={c.value}
              label={c.label}
              detail={c.detail}
              className={cn(
                'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                isActive &&
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
              )}
              onClick={() => handleKpiClick(c.filter)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleKpiClick(c.filter); } }}
            />
          );
        })}
      </div>

      {/* Search & Department Filter Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search by RFQ, title, or creator"
            aria-label="Search requests for quotation"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="flex items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
          <div className="relative min-w-[210px]">
            <Building2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-9 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by department"
            >
              <option value="ALL">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Floating Bulk Action Banner */}
      {selectedRfqIds.length > 0 && (
        <Card className="mb-4 flex flex-col gap-3 border-primary/35 bg-primary/[0.045] p-3 shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <CheckSquare size={18} className="text-primary" />
            <span>{selectedRfqIds.length} {selectedRfqIds.length === 1 ? 'RFQ' : 'RFQs'} selected</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedRfqIds([])}
            >
              Clear selection
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canCreateRFQ}
              onClick={() => canCreateRFQ && setShowBulkDeleteModal(true)}
            >
              <Trash2 /> Delete selected
            </Button>
          </div>
        </Card>
      )}

      {/* Table Card */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : paginated.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1080px] border-collapse text-sm">
                <colgroup>
                  <col className="w-[42px]" />
                  {visibleColumns.map((col) => (
                    <col key={col.key} style={{ width: COL_WIDTHS[col.key] || 'auto' }} />
                  ))}
                  <col className="w-[160px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border/75 bg-muted/45 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        disabled={!canCreateRFQ}
                        className="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary/40"
                        checked={isAllSelected}
                        onChange={canCreateRFQ ? handleToggleSelectAll : undefined}
                        aria-label="Select all RFQs on this page"
                      />
                    </th>
                    {visibleColumns.map((col) => {
                      const align = COL_META[col.key]?.align ?? 'left';
                      return (
                        <th
                          key={col.key}
                          className="px-3 py-3"
                          style={{ textAlign: align }}
                        >
                          {col.headerRender ? col.headerRender() : col.label}
                        </th>
                      );
                    })}
                    <th className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span>Actions</span>
                        <div className="relative">
                          <Button
                            ref={colBtnRef}
                            variant={showColPanel ? 'secondary' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setShowColPanel((v) => !v)}
                            title="Customize columns"
                            aria-label="Customize columns"
                            aria-expanded={showColPanel}
                          >
                            <span className="flex gap-0.5"><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /></span>
                          </Button>

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
                <tbody className="divide-y divide-border/60">
                  {paginated.map((rfq) => {
                    const rfqIdStr = String(rfq.id);
                    const isSelected = selectedRfqIds.includes(rfqIdStr);
                    const isPending = rfq.status === 'PENDING_APPROVAL' && !rfq._isApprovedByMe && !rfq._isReturnedByMe && !rfq._isRejectedByMe;
                    const pendingApproval = pendingApprovalsMap.get(String(rfq.id)) || pendingApprovalsMap.get(rfq.rfqNumber);
                    const canUserActOnRFQ = isPending && Boolean(pendingApproval?.canAct) && !rfq._isApprovedByMe && !rfq._isReturnedByMe && !rfq._isRejectedByMe;

                    return (
                      <tr
                        key={rfq.id}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-accent/35',
                          isSelected && 'bg-primary/[0.035]'
                        )}
                        onClick={() => openDetail(rfq)}
                      >
                        <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            disabled={!canCreateRFQ}
                            className="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary/40"
                            checked={isSelected}
                            onChange={canCreateRFQ ? () => handleToggleSelectRow(rfqIdStr) : undefined}
                          />
                        </td>

                        {visibleColumns.map((col) => {
                          const align = COL_META[col.key]?.align ?? 'left';
                          return (
                            <td key={col.key} className="px-3 py-3.5" style={{ textAlign: align }}>
                              {col.render(rfq, formatDate, openDetail)}
                            </td>
                          );
                        })}

                        <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {canUserActOnRFQ && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                  onClick={() => openApprovalAction(rfq, 'approve')}
                                  title="Approve RFQ Level"
                                >
                                  <ThumbsUp className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
                                  onClick={() => openApprovalAction(rfq, 'return')}
                                  title="Return RFQ for Revision"
                                >
                                  <RotateCcw className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                                  onClick={() => openApprovalAction(rfq, 'reject')}
                                  title="Reject RFQ"
                                >
                                  <ThumbsDown className="size-4" />
                                </Button>
                              </>
                            )}

                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openDetail(rfq)}
                              title="View RFQ details"
                            >
                              <Eye className="size-4" />
                            </Button>

                            {canCreateRFQ && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => requestDeleteRFQ(rfq)}
                                title="Delete RFQ"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="divide-y divide-border/65 lg:hidden">
              {paginated.map((rfq) => (
                <article key={rfq.id} className="p-4 sm:p-5">
                  <button type="button" className="w-full text-left" onClick={() => openDetail(rfq)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-primary">{rfq.rfqNumber}</p>
                        <p className="mt-1 truncate text-sm font-medium">{rfq.title}</p>
                      </div>
                      <Badge tone={statusTone(rfq.status)} className="shrink-0">
                        {STATUS_LABELS[rfq.status] || rfq.status}
                      </Badge>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <div><dt className="text-muted-foreground">Created by</dt><dd className="mt-1 font-medium">{rfq.creator}</dd></div>
                      <div><dt className="text-muted-foreground">Estimate</dt><dd className="mt-1 font-semibold tabular-nums">{rfq.totalEstimate}</dd></div>
                    </dl>
                  </button>
                  <div className="mt-4 flex gap-2 border-t border-border/60 pt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openDetail(rfq)}><Eye /> View</Button>
                    {canCreateRFQ && (
                      <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => requestDeleteRFQ(rfq)}><Trash2 /></Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            className="m-4 min-h-64 border-0 shadow-none"
            icon={Search}
            title="No RFQs found"
            description="Try adjusting your search query or clear the active status filter."
            action={
              <Button variant="outline" onClick={() => { setSearch(''); setStatusFilter('ALL'); }}>
                <X /> Clear filters
              </Button>
            }
          />
        )}
      </Card>

      {/* Pagination */}
      {filtered.length > perPage && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/65 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((page) => page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <Button
                key={page}
                variant={safePage === page ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={() => setCurrentPage(page)}
                aria-label={`Page ${page}`}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage((page) => page + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deletingId) cancelDeleteRFQ(); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete RFQ #{deleteTarget?.rfqNumber}?</DialogTitle>
            <DialogDescription>
              This will remove the request for quotation.
            </DialogDescription>
          </DialogHeader>

          {deleteForceRequired ? (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>This RFQ has associated quotations or documents. Do you want to force delete it along with all related records?</span>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] p-3.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>This action is permanent and cannot be undone.</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={cancelDeleteRFQ} disabled={deletingId !== null}>Cancel</Button>
            {deleteForceRequired ? (
              <Button variant="destructive" loading={deletingId !== null} onClick={confirmForceDeleteRFQ}>
                Force Delete RFQ
              </Button>
            ) : (
              <Button variant="destructive" loading={deletingId !== null} onClick={confirmDeleteRFQ}>
                Delete RFQ
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Modal */}
      <Dialog open={showBulkDeleteModal} onOpenChange={(open) => { if (!open && !isBulkDeleting) setShowBulkDeleteModal(false); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete {selectedRfqIds.length} selected RFQ(s)?</DialogTitle>
            <DialogDescription>
              The selected {selectedRfqIds.length} RFQ(s) and their linked records will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteModal(false)} disabled={isBulkDeleting}>Cancel</Button>
            <Button variant="destructive" loading={isBulkDeleting} onClick={handleConfirmBulkDelete}>
              Delete {selectedRfqIds.length} RFQ(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Approval Dialog */}
      <Dialog open={Boolean(approvalActionModal)} onOpenChange={(open) => { if (!open && !approvalActionLoading) setApprovalActionModal(null); }}>
        {approvalActionModal && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {approvalActionModal.action === 'approve'
                  ? `Approve RFQ #${approvalActionModal.rfq.rfqNumber}`
                  : approvalActionModal.action === 'reject'
                  ? `Reject RFQ #${approvalActionModal.rfq.rfqNumber}`
                  : `Return RFQ #${approvalActionModal.rfq.rfqNumber}`}
              </DialogTitle>
              <DialogDescription>
                {approvalActionModal.action === 'approve'
                  ? 'Confirm approval for this RFQ level.'
                  : approvalActionModal.action === 'reject'
                  ? 'Specify reason for rejecting this RFQ.'
                  : 'Specify reason for returning this RFQ.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-2">
              {approvalActionModal.action === 'return' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">Return to</label>
                  <select
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                    value={actionReturnTarget}
                    onChange={(e) => setActionReturnTarget(e.target.value as any)}
                  >
                    <option value="ORIGINATOR">Originator (Creator)</option>
                    <option value="LEVEL_1">Level 1 Approver</option>
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Comments {approvalActionModal.action !== 'approve' && <span className="text-destructive">*</span>}
                </label>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder={
                    approvalActionModal.action === 'approve'
                      ? 'Optional approval comments...'
                      : 'Required comment explaining the decision...'
                  }
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setApprovalActionModal(null)} disabled={approvalActionLoading}>Cancel</Button>
              <Button
                variant={approvalActionModal.action === 'approve' ? 'default' : 'destructive'}
                loading={approvalActionLoading}
                onClick={handleExecuteApprovalAction}
              >
                Submit Decision
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Action Success Instant Modal */}
      {actionSuccessData && (
        <ActionSuccessModal
          data={actionSuccessData}
          onClose={() => setActionSuccessData(null)}
        />
      )}
    </PageFrame>
  );
}
