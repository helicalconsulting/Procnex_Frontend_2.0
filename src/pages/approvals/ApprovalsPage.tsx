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
  User,
  Layers,
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
    key: 'request', label: 'Request', defaultVisible: true, required: true, width: '290px',
    render: (req) => (
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/15">
          {req.requestedByInitials}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-foreground font-mono text-sm tracking-tight">{req.referenceNumber}</div>
          <div className="text-sm font-medium text-foreground truncate max-w-[220px]">{req.title}</div>
          <div className="text-xs text-muted-foreground">by {req.requestedBy} · {req.department}</div>
        </div>
      </div>
    ),
  },
  {
    key: 'module', label: 'Module', defaultVisible: true, width: '170px',
    render: (req) => (
      <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-semibold shadow-2xs">
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
    if (m.includes('all')) return 'All';
    return 'Purchase Order';
  });

  const [statusFilter, setStatusFilter] = useState<string>(initialStatus || 'ALL');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());

  const { data: approvals, loading, error, reload, forceRefresh } = useServiceData(
    () => approvalService.listTable({
      module: (moduleFilter !== 'ALL' && moduleFilter !== 'All') ? (CANONICAL_MODULE[moduleFilter] || moduleFilter) : undefined,
    }),
    [] as ApprovalTableRow[],
    [moduleFilter]
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

  const [search, setSearch] = useState(() => searchParams.get('search') || '');

  useEffect(() => {
    const s = searchParams.get('search');
    if (s !== null) setSearch(s);
  }, [searchParams]);

  useEffect(() => {
    const mod = searchParams.get('module');
    if (mod) {
      const m = mod.toLowerCase();
      if (m.includes('invoice') || m.includes('ap') || m.includes('accounts')) setModuleFilter('Purchase Invoice');
      else if (m.includes('rfq')) setModuleFilter('RFQ');
      else if (m.includes('quotation')) setModuleFilter('Quotation');
      else if (m.includes('contract')) setModuleFilter('Contract');
      else if (m.includes('po') || m.includes('purchase')) setModuleFilter('Purchase Order');
      else if (m.includes('all')) setModuleFilter('All');
    }
  }, [searchParams]);
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [actionSuccessData, setActionSuccessData] = useState<ActionSuccessModalData | null>(null);
  const [actionModal, setActionModal] = useState<{ request: ApprovalRequest; action: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionReturnTarget, setActionReturnTarget] = useState<'ORIGINATOR' | 'LEVEL_1' | 'VENDOR'>('ORIGINATOR');
  const [detailRequest, setDetailRequest] = useState<ApprovalRequest | null>(null);
  const [chainModal, setChainModal] = useState<{ module: string; referenceId: string } | null>(null);
  useBodyScrollLock(!!(actionModal || detailRequest || actionSuccessData || chainModal));
  const perPage = 8;

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
            canAct: false,
            currentLevel: opt.currentLevel ?? (isApproved ? (a.totalLevels || 1) : a.currentLevel),
          };
        }
        return a;
      });
    if (moduleFilter !== 'ALL' && moduleFilter !== 'All') {
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

  const { user, roles: authRoles } = useAuth();
  const isAdmin = useMemo(() => {
    if (!authRoles || authRoles.length === 0) return false;
    return authRoles.some((r) => r === 'Super Admin' || r === 'Administrator' || r.toLowerCase().includes('admin'));
  }, [authRoles]);

  const getEffectiveStatus = useCallback((a: ApprovalRequest): ApprovalStatusType => {
    if (a.status === 'APPROVED') return 'APPROVED';
    if (a.status === 'REJECTED') return 'REJECTED';
    if (a.status === 'RETURNED') return 'RETURNED';

    if (a.status === 'PENDING') {
      if (a.canAct) return 'PENDING';
      if ((a.currentLevel || 1) > 1 && !isAdmin) return 'APPROVED';
      return 'PENDING';
    }
    return a.status;
  }, [isAdmin]);

  const filtered = useMemo(() => {
    let list = moduleFiltered.filter((a) => {
      if (a.status === 'PENDING' && !a.canAct && !isAdmin) {
        return false;
      }
      return true;
    });
    if (statusFilter === 'ALL') return list;
    return list.filter((a) => getEffectiveStatus(a) === statusFilter);
  }, [moduleFiltered, statusFilter, getEffectiveStatus, isAdmin]);

  const summary = useMemo(() => {
    const list = moduleFiltered.filter((a) => isAdmin || a.status !== 'PENDING' || a.canAct);
    return {
      total: list.length,
      pending: list.filter((a) => getEffectiveStatus(a) === 'PENDING').length,
      approved: list.filter((a) => getEffectiveStatus(a) === 'APPROVED').length,
      rejected: list.filter((a) => getEffectiveStatus(a) === 'REJECTED').length,
    };
  }, [moduleFiltered, getEffectiveStatus, isAdmin]);

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
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: CheckSquare, tone: 'primary' as const, label: 'Total Requests', value: summary.total, detail: 'All requests', filter: 'ALL' },
          { icon: Clock, tone: 'warning' as const, label: 'Pending', value: summary.pending, detail: 'Requires action', filter: 'PENDING' },
          { icon: CheckCircle2, tone: 'success' as const, label: 'Approved', value: summary.approved, detail: 'Approved requests', filter: 'APPROVED' },
          { icon: XCircle, tone: 'danger' as const, label: 'Rejected', value: summary.rejected, detail: 'Rejected or returned', filter: 'REJECTED' },
        ].map((c) => {
          const isActive = statusFilter === c.filter;
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
              onClick={() => { setStatusFilter(c.filter); setCurrentPage(1); }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter(c.filter);
                  setCurrentPage(1);
                }
              }}
            />
          );
        })}
      </div>

      {/* Module Selector Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-muted/40 border border-border/60">
        {[
          { key: 'All', label: 'All Modules', icon: <Layers size={14} /> },
          { key: 'Purchase Order', label: 'Purchase Orders', icon: <ShoppingCart size={14} /> },
          { key: 'RFQ', label: 'RFQs', icon: <FileText size={14} /> },
          { key: 'Quotation', label: 'Quotations', icon: <ClipboardList size={14} /> },
          { key: 'Contract', label: 'Contracts', icon: <FileSignature size={14} /> },
          { key: 'Purchase Invoice', label: 'Invoices', icon: <Wallet size={14} /> },
        ].map((tab) => {
          const isSelected = moduleFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setModuleFilter(tab.key);
                setCurrentPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                isSelected
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-border/80 font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar: Search */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search approval requests..."
            aria-label="Search approval requests"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Content Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : paginated.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/75 bg-muted/45 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  {visibleColumns.map((col) => (
                    <th key={col.key} className="px-4 py-3" style={{ textAlign: col.align || 'left', width: col.width || 'auto' }}>
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
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
                            onToggle={(key) => {
                              setVisibleKeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              });
                            }}
                            onReorder={setColumnOrder}
                            onReset={() => {
                              setColumnOrder(ALL_COLUMNS.map((c) => c.key));
                              setVisibleKeys(new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)));
                            }}
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
                {paginated.map((req) => (
                  <tr key={req.id} className="cursor-pointer transition-colors hover:bg-accent/35" onClick={() => setDetailRequest(req)}>
                    {visibleColumns.map((col) => (
                      <td key={col.key} className="px-4 py-3.5" style={{ textAlign: col.align || 'left' }}>
                        {col.render(req, formatDateTime)}
                      </td>
                    ))}
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className={cn("flex items-center gap-1", req.canAct ? "justify-end" : "justify-center")}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View Details" onClick={() => setDetailRequest(req)}>
                          <Eye className="size-4 text-muted-foreground hover:text-foreground" />
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
            <span>Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)} className="h-8 w-8 p-0">
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={currentPage === p ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(p)}
                  className="h-8 w-8 p-0"
                >
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)} className="h-8 w-8 p-0">
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
                  onChange={(e) => setActionComment(e.target.value)}
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

      {/* Detail View Dialog (Payment Voucher Eye View Style) */}
      <Dialog open={!!detailRequest} onOpenChange={() => setDetailRequest(null)}>
        {detailRequest && (
          <DialogContent className="max-w-xl p-6 sm:p-7">
            <DialogHeader className="space-y-1 pr-8">
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground font-mono">
                  {detailRequest.referenceNumber}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-2.5 py-1 text-xs font-semibold uppercase tracking-wider gap-1.5",
                    STATUS_TONES[detailRequest.status] || STATUS_TONES.PENDING
                  )}
                >
                  <span className={cn(
                    "inline-block size-2 rounded-full",
                    detailRequest.status === 'APPROVED' || detailRequest.status === 'APPROVED_L1' ? "bg-emerald-500" :
                    detailRequest.status === 'REJECTED' ? "bg-rose-500" :
                    detailRequest.status === 'RETURNED' ? "bg-orange-500" :
                    "bg-amber-500/80"
                  )} />
                  {STATUS_LABELS[detailRequest.status] || detailRequest.status}
                </Badge>
              </div>
              <DialogDescription className="text-sm font-medium text-muted-foreground">
                {detailRequest.requestedBy} · <span className="font-bold text-foreground font-mono">{detailRequest.amount}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="border-t border-border/60 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {detailRequest.module.toUpperCase()} DETAILS
                </h4>

                <div className="divide-y divide-border/40 text-sm">
                  {/* Row 1: Invoice / Document Reference & Amount */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        INVOICE REFERENCE
                      </div>
                      <div className="mt-1 font-medium text-foreground font-mono break-words">
                        {detailRequest.referenceNumber}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        AMOUNT
                      </div>
                      <div className="mt-1 text-base font-bold text-foreground font-mono">
                        {detailRequest.amount}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Method / Module Category & Date */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        METHOD / MODULE
                      </div>
                      <div className="mt-1 font-medium text-foreground flex items-center gap-1.5">
                        {MODULE_ICONS[detailRequest.module as ModuleType]} {detailRequest.module}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        DATE
                      </div>
                      <div className="mt-1 font-medium text-foreground">
                        {formatDateTime(detailRequest.submittedAt)}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Approved By / Workflow Stage */}
                  <div className="py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      APPROVED BY
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
                      <span className={cn(
                        "inline-block size-2 rounded-full",
                        detailRequest.status === 'APPROVED' ? "bg-emerald-500" :
                        detailRequest.status === 'REJECTED' ? "bg-rose-500" :
                        "bg-amber-500/80"
                      )} />
                      {detailRequest.status === 'PENDING' ? (
                        <span>Pending Approval ({detailRequest.requiredRole || `Level ${detailRequest.currentLevel || 1}`})</span>
                      ) : (
                        <span>{STATUS_LABELS[detailRequest.status] || detailRequest.status} by Workflow</span>
                      )}
                    </div>
                  </div>

                  {/* Row 4: Remarks */}
                  <div className="py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      REMARKS
                    </div>
                    <div className="mt-1 font-normal text-muted-foreground break-words leading-relaxed">
                      {detailRequest.comments || detailRequest.title || '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                className="gap-2 rounded-full px-4"
                onClick={() => {
                  const req = detailRequest;
                  const refId = req.referenceId || req.referenceNumber;
                  setChainModal({ module: req.module, referenceId: refId });
                }}
              >
                <Clock className="size-4" /> View Approval Chain
              </Button>

              <div className="flex items-center gap-2">
                {detailRequest.canAct ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600 hover:text-amber-700 border-amber-500/30 hover:bg-amber-500/10 rounded-full px-3.5"
                      onClick={() => {
                        const req = detailRequest;
                        setDetailRequest(null);
                        openAction(req, 'return');
                      }}
                    >
                      <RotateCcw className="size-3.5 mr-1" /> Return
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-full px-3.5"
                      onClick={() => {
                        const req = detailRequest;
                        setDetailRequest(null);
                        openAction(req, 'reject');
                      }}
                    >
                      <ThumbsDown className="size-3.5 mr-1" /> Reject
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-4"
                      onClick={() => {
                        const req = detailRequest;
                        setDetailRequest(null);
                        openAction(req, 'approve');
                      }}
                    >
                      <ThumbsUp className="size-3.5 mr-1" /> Approve
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" className="rounded-full px-5" onClick={() => setDetailRequest(null)}>
                    Close
                  </Button>
                )}
              </div>
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

      {/* Approval Chain Modal */}
      {chainModal && (
        <ApprovalChainView
          module={chainModal.module}
          referenceId={chainModal.referenceId}
          onClose={() => setChainModal(null)}
        />
      )}
    </PageFrame>
  );
}

function ApprovalChainView({ module, referenceId, onClose }: { module: string; referenceId: string; onClose: () => void }) {
  const [chainData, setChainData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchChain = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await approvalService.getChain(module, referenceId);
        if (!cancelled) setChainData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load approval chain');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchChain();
    return () => {
      cancelled = true;
    };
  }, [module, referenceId]);

  const itemsToDisplay = chainData?.history && chainData.history.length > 0
    ? chainData.history
    : chainData?.timeline && chainData.timeline.length > 0
    ? chainData.timeline
    : chainData?.levels || [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Approval history & timeline</DialogTitle>
          <DialogDescription>{module} · {referenceId}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading approval chain…</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-destructive">{error}</div>
        ) : itemsToDisplay.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No approval history available.</div>
        ) : (
          <div className="space-y-4 py-2">
            {itemsToDisplay.map((item: any, idx: number) => (
              <div key={idx} className="flex gap-3 rounded-xl border border-border/70 bg-secondary/40 p-3.5 text-sm">
                <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {item.levelNumber || idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {item.requiredRole ? item.requiredRole.replace(/_/g, ' ') : `Level ${idx + 1}`}
                    </span>
                    <Badge tone={item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'danger' : 'warning'}>
                      {item.status}
                    </Badge>
                  </div>
                  {item.approverName && <p className="mt-1 text-xs text-muted-foreground">By: {item.approverName}</p>}
                  {item.comments && <p className="mt-1 rounded-lg bg-background p-2 text-xs italic">{item.comments}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

