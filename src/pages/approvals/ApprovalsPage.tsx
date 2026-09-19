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
  Minus,
  Wallet,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageFrame, PageLead, MetricCard, EmptyState } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import { useSearchParams } from 'react-router-dom';

// ─── Types ──────────────────────────────────────────────────

type ApprovalStatusType = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
type ModuleType = 'RFQ' | 'Purchase Order' | 'Purchase Invoice' | 'Quotation' | 'Contract';
type PriorityType = 'HIGH' | 'MEDIUM' | 'LOW';

type ApprovalRequest = ApprovalTableRow;

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  APPROVED_L1: 'L1 Approved',
  REJECTED: 'Rejected',
  RETURNED: 'Returned',
  AUTO_FORWARDED: 'Auto Forwarded',
};

const STATUS_TONES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-300',
  APPROVED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
  APPROVED_L1: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
  REJECTED: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-300',
  RETURNED: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-300',
  AUTO_FORWARDED: 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-300',
};

const MODULE_ICONS: Record<ModuleType, React.ReactNode> = {
  RFQ: <FileText size={15} />,
  'Purchase Order': <ShoppingCart size={15} />,
  'Purchase Invoice': <Wallet size={15} />,
  Quotation: <ClipboardList size={15} />,
  Contract: <FileSignature size={15} />,
};

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
      <div className="flex items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
          {req.requestedByInitials}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-foreground font-mono text-xs">{req.referenceNumber}</div>
          <div className="text-[12px] font-medium text-foreground truncate max-w-[200px]">{req.title}</div>
          <div className="text-[11px] text-muted-foreground">by {req.requestedBy} · {req.department}</div>
        </div>
      </div>
    ),
  },
  {
    key: 'module', label: 'Module', defaultVisible: true, width: '140px',
    render: (req) => (
      <Badge variant="outline" className="gap-1 font-semibold">
        {MODULE_ICONS[req.module]}{req.module}
      </Badge>
    ),
  },
  {
    key: 'amount', label: 'Amount', defaultVisible: true, width: '120px', align: 'right',
    render: (req) => <span className="font-mono font-semibold text-foreground">{req.amount}</span>,
  },
  {
    key: 'priority', label: 'Priority', defaultVisible: true, width: '100px',
    render: (req) => (
      <Badge
        variant="outline"
        className={cn(
          'font-semibold uppercase',
          req.priority === 'HIGH' && 'bg-rose-500/10 text-rose-600 border-rose-500/20',
          req.priority === 'MEDIUM' && 'bg-amber-500/10 text-amber-600 border-amber-500/20',
          req.priority === 'LOW' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
        )}
      >
        {req.priority}
      </Badge>
    ),
  },
  {
    key: 'level', label: 'Approval Level', defaultVisible: true, width: '150px',
    render: (req) => {
      const total = req.totalLevels || 1;
      const isApproved = req.status === 'APPROVED';
      const current = isApproved ? total + 1 : (req.currentLevel || 1);
      return (
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <Badge variant="secondary" className="font-semibold">
            L{isApproved ? total : Math.min(current, total)}/{total}
          </Badge>
        </div>
      );
    },
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: '170px', align: 'left',
    render: (req) => {
      let effectiveStatus = req.status;
      if (req.status === 'PENDING') {
        if (req.canAct) {
          effectiveStatus = 'PENDING';
        } else if ((req.currentLevel || 1) > 1) {
          effectiveStatus = 'APPROVED';
        }
      }
      return (
        <Badge variant="outline" className={cn('font-semibold', STATUS_TONES[effectiveStatus] || 'bg-muted/50 text-muted-foreground')}>
          {STATUS_LABELS[effectiveStatus] || effectiveStatus.replace(/_/g, ' ')}
        </Badge>
      );
    },
  },
  {
    key: 'submitted', label: 'Submitted', defaultVisible: true, width: '130px',
    render: (req, formatDateTime) => <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(req.submittedAt)}</span>,
  },
];

const CANONICAL_MODULE: Record<string, string> = {
  'Purchase Order': 'PurchaseOrders',
  'Purchase Invoice': 'AccountsPayable',
  'Quotation': 'Quotations',
  'Contract': 'Contracts',
  'RFQ': 'RFQ',
};

export default function ApprovalsPage() {
  const [searchParams] = useSearchParams();
  const initialModule = searchParams.get('module');
  const initialStatus = searchParams.get('status');

  const [moduleFilter, setModuleFilter] = useState<string>(() => {
    if (!initialModule) return 'Purchase Order';
    const m = initialModule.toLowerCase();
    if (m.includes('invoice') || m.includes('ap') || m.includes('accounts')) return 'Purchase Invoice';
    if (m.includes('po') || m.includes('purchase')) return 'Purchase Order';
    if (m.includes('quotation')) return 'Quotation';
    if (m.includes('rfq')) return 'RFQ';
    if (m.includes('contract')) return 'Contract';
    if (m.includes('all')) return 'ALL';
    return 'Purchase Order';
  });

  const [statusFilter, setStatusFilter] = useState<string>(initialStatus || 'ALL');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());

  const { data: approvals, loading, error, reload, forceRefresh } = useServiceData(
    () => approvalService.listTable({
      module: moduleFilter !== 'ALL' ? (CANONICAL_MODULE[moduleFilter] || moduleFilter) : undefined,
    }),
    [] as ApprovalTableRow[],
    [moduleFilter],
    { cacheTtlMs: 0 }
  );

  useEffect(() => {
    const refreshAll = () => forceRefresh();

    const unsubLevel = sseClient.on('approval_level_complete', refreshAll);
    const unsubChain = sseClient.on('approval_chain_complete', refreshAll);
    const unsubForwarded = sseClient.on('approval_auto_forwarded', refreshAll);
    const unsubPoStatus = sseClient.on('po_status_changed', refreshAll);
    const unsubReq = sseClient.on('approval_required', refreshAll);
    const unsubNotif = sseClient.on('notification', refreshAll);
    const unsubApprovalInit = sseClient.on('approval_initiated', refreshAll);
    const unsubPoCreated = sseClient.on('po_created', (data: any) => {
      if (data?.action === 'deleted' && (data?.poId || data?.poNumber)) {
        setDeletedIds((prev) => {
          const next = new Set(prev);
          if (data.poId) next.add(data.poId);
          if (data.poNumber) next.add(data.poNumber);
          return next;
        });
      }
      refreshAll();
    });

    const handlePoDeleted = (e: Event) => {
      const { poId, poNumber } = (e as CustomEvent).detail || {};
      if (poId || poNumber) {
        setDeletedIds((prev) => {
          const next = new Set(prev);
          if (poId) next.add(poId);
          if (poNumber) next.add(poNumber);
          return next;
        });
      }
      refreshAll();
    };

    window.addEventListener('heliflow:po-deleted', handlePoDeleted);
    window.addEventListener('heliflow:po-created', refreshAll);
    window.addEventListener('heliflow:approval-updated', refreshAll);
    window.addEventListener('heliflow:po-updated', refreshAll);
    window.addEventListener('focus', refreshAll);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('heliflow_sync');
      bc.onmessage = () => { refreshAll(); };
    } catch {}

    const pollInterval = setInterval(() => { refreshAll(); }, 5000);

    return () => {
      unsubLevel(); unsubChain(); unsubForwarded(); unsubPoStatus(); unsubReq(); unsubNotif(); unsubPoCreated(); unsubApprovalInit();
      window.removeEventListener('heliflow:po-deleted', handlePoDeleted);
      window.removeEventListener('heliflow:po-created', refreshAll);
      window.removeEventListener('heliflow:approval-updated', refreshAll);
      window.removeEventListener('heliflow:po-updated', refreshAll);
      window.removeEventListener('focus', refreshAll);
      if (bc) bc.close();
      clearInterval(pollInterval);
    };
  }, [forceRefresh]);

  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [actionSuccessData, setActionSuccessData] = useState<ActionSuccessModalData | null>(null);
  const [actionModal, setActionModal] = useState<{ request: ApprovalRequest; action: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionReturnTarget, setActionReturnTarget] = useState<'ORIGINATOR' | 'LEVEL_1' | 'VENDOR'>('ORIGINATOR');
  const [detailRequest, setDetailRequest] = useState<ApprovalRequest | null>(null);
  useBodyScrollLock(!!(actionModal || detailRequest || actionSuccessData));
  const perPage = 8;

  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);

  const visibleColumns = useMemo(
    () => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys],
  );

  const [optimisticMap, setOptimisticMap] = useState<Record<string, { status: ApprovalStatusType; currentLevel?: number }>>({});

  const moduleFiltered = useMemo(() => {
    let list = approvals
      .filter((a) => !deletedIds.has(a.id) && !deletedIds.has(a.referenceId) && !deletedIds.has(a.referenceNumber))
      .map((a) => {
        const opt = optimisticMap[a.id] || (a.referenceId ? optimisticMap[a.referenceId] : undefined) || (a.referenceNumber ? optimisticMap[a.referenceNumber] : undefined);
        if (opt) {
          const isApproved = opt.status === 'APPROVED';
          return {
            ...a,
            status: opt.status,
            currentLevel: opt.currentLevel ?? (isApproved ? (a.totalLevels || 1) : a.currentLevel),
          };
        }
        return a;
      });
    if (moduleFilter !== 'ALL') {
      const filterLower = moduleFilter.toLowerCase();
      list = list.filter((a) => {
        const modLower = (a.module || '').toLowerCase();
        return modLower === filterLower || modLower.includes(filterLower) || filterLower.includes(modLower);
      });
    }
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
  }, [approvals, optimisticMap, moduleFilter, search]);

  const getEffectiveStatus = useCallback((a: ApprovalRequest): ApprovalStatusType => {
    if (a.status === 'APPROVED') return 'APPROVED';
    if (a.status === 'REJECTED') return 'REJECTED';
    if (a.status === 'RETURNED') return 'RETURNED';

    if (a.status === 'PENDING') {
      if (a.canAct) return 'PENDING';
      if ((a.currentLevel || 1) > 1) return 'APPROVED';
      return 'PENDING';
    }
    return a.status;
  }, []);

  const { user, roles: authRoles } = useAuth();
  const isAdmin = useMemo(() => {
    if (!authRoles || authRoles.length === 0) return false;
    return authRoles.some((r) => r === 'Super Admin' || r === 'Administrator' || r.toLowerCase().includes('admin'));
  }, [authRoles]);

  const filtered = useMemo(() => {
    let list = moduleFiltered;
    if (!isAdmin) {
      list = list.filter((a) => {
        if (a.status === 'PENDING' && !a.canAct) {
          return false;
        }
        return true;
      });
    }
    if (statusFilter === 'ALL') return list;
    return list.filter((a) => getEffectiveStatus(a) === statusFilter);
  }, [moduleFiltered, statusFilter, getEffectiveStatus, isAdmin, user?.id]);

  const summary = useMemo(() => ({
    total: moduleFiltered.length,
    pending: moduleFiltered.filter((a) => getEffectiveStatus(a) === 'PENDING').length,
    approved: moduleFiltered.filter((a) => getEffectiveStatus(a) === 'APPROVED').length,
    rejected: moduleFiltered.filter((a) => getEffectiveStatus(a) === 'REJECTED').length,
  }), [moduleFiltered, getEffectiveStatus]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const handleAction = useCallback(async () => {
    if (!actionModal) return;
    const { id } = actionModal.request;
    const actionType = actionModal.action;
    const req = actionModal.request;
    const comment = actionComment.trim() || undefined;

    setActionModal(null);
    setActionComment('');

    const isFinalLevel = (req.currentLevel || 1) >= (req.totalLevels || 1);
    const newStatus: ApprovalStatusType = actionType === 'approve'
      ? (isFinalLevel ? 'APPROVED' : 'APPROVED')
      : actionType === 'reject' ? 'REJECTED' : 'RETURNED';
    const targetLevel = actionType === 'approve' ? ((req.currentLevel || 1) + 1) : req.currentLevel;

    setOptimisticMap((prev) => ({
      ...prev,
      [id]: { status: newStatus, currentLevel: targetLevel },
      ...(req.referenceId ? { [req.referenceId]: { status: newStatus, currentLevel: targetLevel } } : {}),
      ...(req.referenceNumber ? { [req.referenceNumber]: { status: newStatus, currentLevel: targetLevel } } : {}),
    }));

    const defaultMsg = actionType === 'approve'
      ? `${req.module || 'Purchase Order'} Approved`
      : actionType === 'reject'
      ? `${req.module || 'Purchase Order'} Rejected`
      : `${req.module || 'Purchase Order'} Returned for Revision`;

    setActionSuccessData({
      actionType,
      module: req.module || 'Approval Request',
      referenceNumber: req.referenceNumber,
      title: req.title,
      message: defaultMsg,
      comment,
      details: [
        { label: 'Amount', value: req.amount },
        { label: 'Requested By', value: req.requestedBy },
      ],
    });

    try {
      let res: any;
      if (actionType === 'approve') {
        res = await approvalService.approve(id, comment);
      } else if (actionType === 'reject') {
        res = await approvalService.reject(id, comment);
      } else {
        res = await approvalService.return(id, comment, actionReturnTarget as any);
      }

      if (res?.message) {
        setActionSuccessData((prev) => (prev ? { ...prev, message: res.message } : null));
      }
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
      await forceRefresh();
    } catch (err) {
      setOptimisticMap((prev) => {
        const next = { ...prev };
        delete next[id];
        if (req.referenceId) delete next[req.referenceId];
        if (req.referenceNumber) delete next[req.referenceNumber];
        return next;
      });
      setActionSuccessData(null);
      setToast({ message: err instanceof Error ? err.message : 'Action failed.', type: 'error' });
      await forceRefresh();
    }
  }, [actionModal, actionComment, actionReturnTarget, forceRefresh]);

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

  const pageTitle = moduleFilter === 'Purchase Order'
    ? 'Purchase Order Approval'
    : moduleFilter === 'Quotation'
    ? 'Quotation Approval'
    : moduleFilter === 'RFQ'
    ? 'RFQ Approval'
    : moduleFilter === 'Contract'
    ? 'Contract Approval'
    : 'All Approval Requests';

  const pageSubtitle = moduleFilter === 'Purchase Order'
    ? 'Review, approve, or reject pending purchase order requests'
    : 'Review, approve, or reject pending requests across modules';

  return (
    <PageFrame>
      {error && <MessageStrip type="error" className="mb-4">{error}</MessageStrip>}
      {toast && (
        <MessageStrip type={toast.type} onClose={() => setToast(null)} autoHideMs={4000} className="mb-4">
          {toast.message}
        </MessageStrip>
      )}

      {/* Header */}
      <PageLead
        title={pageTitle}
        description={pageSubtitle}
      />

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={CheckSquare}
          label="Total Requests"
          value={summary.total}
          tone="primary"
          className="cursor-pointer"
          onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
        />
        <MetricCard
          icon={Clock}
          label="Pending"
          value={summary.pending}
          tone="warning"
          className="cursor-pointer"
          onClick={() => { setStatusFilter('PENDING'); setCurrentPage(1); }}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Approved"
          value={summary.approved}
          tone="success"
          className="cursor-pointer"
          onClick={() => { setStatusFilter('APPROVED'); setCurrentPage(1); }}
        />
        <MetricCard
          icon={XCircle}
          label="Rejected"
          value={summary.rejected}
          tone="danger"
          className="cursor-pointer"
          onClick={() => { setStatusFilter('REJECTED'); setCurrentPage(1); }}
        />
      </div>

      {/* Toolbar */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['Purchase Order', 'Quotation', 'RFQ', 'Contract', 'ALL'].map(m => (
              <button
                key={m}
                onClick={() => { setModuleFilter(m); setCurrentPage(1); }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  moduleFilter === m
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search approval requests..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-9"
            />
          </div>
        </div>
      </Card>

      {/* Content Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={4} columns={6} />
          </div>
        ) : paginated.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {visibleColumns.map(col => <th key={col.key} className="px-5 py-3.5">{col.label}</th>)}
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginated.map(req => (
                  <tr key={req.id} className="transition-colors hover:bg-muted/30">
                    {visibleColumns.map(col => <td key={col.key} className="px-5 py-3.5">{col.render(req, formatDateTime)}</td>)}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View Details" onClick={() => setDetailRequest(req)}>
                          <Eye className="size-4" />
                        </Button>
                        {req.canAct && (
                          <>
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-emerald-600 hover:text-emerald-700" onClick={() => openAction(req, 'approve')}>
                              <ThumbsUp className="size-3.5" /> Approve
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => openAction(req, 'reject')}>
                              <ThumbsDown className="size-3.5" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CheckSquare}
            title="No approval requests"
            description={search ? 'Try adjusting your search criteria.' : 'You have no pending approval requests at this time.'}
          />
        )}

        {filtered.length > perPage && (
          <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            <span>Showing {(currentPage-1)*perPage+1}–{Math.min(currentPage*perPage, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)} className="h-8 w-8 p-0">
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                <Button
                  key={p}
                  variant={currentPage===p?'default':'outline'}
                  size="sm"
                  onClick={()=>setCurrentPage(p)}
                  className="h-8 w-8 p-0"
                >
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="sm" disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)} className="h-8 w-8 p-0">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Action Dialog */}
      <Dialog open={!!actionModal} onOpenChange={() => setActionModal(null)}>
        {actionModal && (
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {actionModal.action === 'approve' ? <ThumbsUp className="size-5 text-emerald-600" /> : <ThumbsDown className="size-5 text-destructive" />}
                {actionModal.action === 'approve' ? 'Approve Request' : actionModal.action === 'reject' ? 'Reject Request' : 'Return Request'}
              </DialogTitle>
              <DialogDescription>
                Confirm decision for request <strong>{actionModal.request.referenceNumber}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Title:</span> <strong className="text-foreground">{actionModal.request.title}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span> <strong className="text-foreground font-mono">{actionModal.request.amount}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Requested By:</span> <strong className="text-foreground">{actionModal.request.requestedBy}</strong></div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground flex items-center gap-1">
                  <MessageSquare className="size-3.5" /> Comments
                </label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                  placeholder="Optional comments or notes..."
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setActionModal(null)}>Cancel</Button>
              <Button
                variant={actionModal.action === 'reject' ? 'destructive' : 'default'}
                onClick={handleAction}
              >
                Confirm Decision
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Success Modal */}
      {actionSuccessData && (
        <ActionSuccessModal
          data={actionSuccessData}
          onClose={() => setActionSuccessData(null)}
        />
      )}
    </PageFrame>
  );
}
