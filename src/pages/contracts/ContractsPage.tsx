import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { contractService, type Contract } from '../../services/contractService';
import { sseClient } from '../../services/sseClient';
import { companySettingsService } from '../../services/companySettingsService';
import {
  FileText, Search, Plus, Eye, Edit3, X, ChevronLeft, ChevronRight,
  LayoutList, LayoutGrid, Calendar, DollarSign, AlertTriangle,
  Clock, CheckCircle2, XCircle, FileSignature, Trash2, Download,
  Ban, Bell, ArrowRight, CheckSquare,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
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

// ─── Types ──────────────────────────────────────────────────

type ContractStatus = 'DRAFT' | 'PENDING_VENDOR_SIGNATURE' | 'AWAITING_CUSTOMER_SIGNATURE' | 'AWAITING_VENDOR_SIGNATURE' | 'VENDOR_SIGNED' | 'ACCEPTED' | 'COMPLETED' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED';

interface ContractRow {
  id: string;
  contractNumber: string;
  title: string;
  vendorName: string;
  contractType: string;
  sourceRfq: string;
  contractValue: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  contractOwner: string;
  hasPO?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_VENDOR_SIGNATURE: 'Pending Signature',
  AWAITING_CUSTOMER_SIGNATURE: 'Awaiting Your Signature',
  AWAITING_VENDOR_SIGNATURE: 'Pending Signature',
  VENDOR_SIGNED: 'Vendor Signed',
  ACCEPTED: 'Accepted',
  COMPLETED: 'Completed',
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring Soon',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  TERMINATED: 'Terminated',
};

const STATUS_TONES: Record<string, string> = {
  DRAFT: 'bg-muted/50 text-muted-foreground border-border/60',
  PENDING_VENDOR_SIGNATURE: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-300',
  AWAITING_CUSTOMER_SIGNATURE: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-300',
  AWAITING_VENDOR_SIGNATURE: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-300',
  VENDOR_SIGNED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
  ACCEPTED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
  COMPLETED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
  EXPIRING_SOON: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-300',
  EXPIRED: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-300',
  CANCELLED: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-300',
  TERMINATED: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-300',
};

function getTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ContractColumnDef {
  key: string; label: string; defaultVisible: boolean; required?: boolean;
  width?: string; render: (r: ContractRow, fmtDate: (d: string) => string) => React.ReactNode;
}

// ─── Component ──────────────────────────────────────────────

export default function ContractsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreatePO = hasPermission('PO Creation', 'canCreate') || hasPermission('Purchase Orders', 'canCreate') || hasPermission('PO', 'canCreate');
  const canCreateContract = hasPermission('Contract Management', 'canCreate') || hasPermission('Contracts', 'canCreate');
  const { formatAmount, companyDefaultCurrency: displayCurrency } = useCurrency();

  const [contractTypeLabels, setContractTypeLabels] = useState<Record<string, string>>({});

  const { data: rawResult, loading, error, reload } = useServiceData(
    () => contractService.listContracts().then(r => ({
      rawContracts: r.contracts,
      total: r.total,
    })),
    { rawContracts: [] as Contract[], total: 0 },
    [],
    { cacheKey: 'contracts:list' }
  );

  const contracts = useMemo(() => rawResult.rawContracts.map((c: Contract): ContractRow => ({
    id: c.id,
    contractNumber: c.contractNumber,
    title: c.title,
    vendorName: c.vendor?.name || 'Unknown',
    contractType: contractTypeLabels[c.contractType] || c.contractType,
    sourceRfq: c.rfq?.rfqNumber || '',
    contractValue: c.contractValue,
    currency: c.currency,
    startDate: c.effectiveDate,
    endDate: c.expirationDate,
    status: c.status as ContractStatus,
    contractOwner: c.contractOwner?.fullName || '—',
    hasPO: ((c as any)._count?.purchaseOrders ?? 0) > 0 || ((c as any).purchaseOrders?.length ?? 0) > 0,
  })), [rawResult.rawContracts, contractTypeLabels]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [deleteTarget, setDeleteTarget] = useState<ContractRow | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<ContractRow | null>(null);
  const [terminating, setTerminating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  useBodyScrollLock(!!deleteTarget || !!terminateTarget || showBatchDeleteModal);
  const perPage = 10;

  const [recentlySigned, setRecentlySigned] = useState<Array<{
    contractId: string;
    contractNumber: string;
    vendorName: string;
    signedBy: string;
    signedAt: string;
    contractValue: number;
    currency: string;
    rfqNumber: string | null;
    rfqTitle: string | null;
  }>>([]);

  useEffect(() => {
    const unsub = sseClient.on('contract_signed', (data: unknown) => {
      const event = data as {
        contractId: string;
        contractNumber: string;
        vendorName: string;
        signedBy: string;
        signedAt: string;
        contractValue: number;
        currency: string;
        rfqNumber: string | null;
        rfqTitle: string | null;
      };

      setRecentlySigned(prev => {
        if (prev.some(s => s.contractId === event.contractId)) return prev;
        return [event, ...prev].slice(0, 5);
      });

      reload();

      setTimeout(() => {
        setRecentlySigned(prev => prev.filter(s => s.contractId !== event.contractId));
      }, 60_000);
    });

    const unsubPO = sseClient.on('po_created', () => {
      reload();
    });

    sseClient.connect();

    return () => {
      unsub();
      unsubPO();
    };
  }, [reload]);

  const dismissAllSigned = useCallback(() => {
    setRecentlySigned([]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const templates = await companySettingsService.listContractTemplates();
        if (templates.length > 0) {
          const labels = Object.fromEntries(templates.map(t => [t.type, t.name]));
          setContractTypeLabels(labels);
        }
      } catch { /* no settings */ }
    })();
  }, []);

  const allColumns = useMemo((): ContractColumnDef[] => [
    {
      key: 'contract', label: 'Contract', defaultVisible: true, required: true, width: '220px',
      render: (r) => (
        <div>
          <div className="font-semibold text-foreground font-mono text-xs">{r.contractNumber}</div>
          <div className="text-[12px] text-muted-foreground truncate max-w-[200px]">{r.title}</div>
        </div>
      ),
    },
    {
      key: 'vendor', label: 'Supplier', defaultVisible: true, width: '160px',
      render: (r) => <span className="font-medium text-foreground">{r.vendorName}</span>,
    },
    {
      key: 'value', label: 'Contract Value', defaultVisible: true, width: '130px',
      render: (r) => <span className="font-semibold text-foreground font-mono">{formatAmount(r.contractValue, r.currency)}</span>,
    },
    {
      key: 'status', label: 'Status', defaultVisible: true, width: '160px',
      render: (r) => (
        <Badge variant="outline" className={cn('gap-1 font-semibold', STATUS_TONES[r.status])}>
          {STATUS_LABELS[r.status]}
        </Badge>
      ),
    },
    {
      key: 'startDate', label: 'Start Date', defaultVisible: true, width: '120px',
      render: (r, fmtDate) => (
        <span className="text-muted-foreground whitespace-nowrap">{fmtDate(r.startDate)}</span>
      ),
    },
    {
      key: 'endDate', label: 'End Date', defaultVisible: true, width: '120px',
      render: (r, fmtDate) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {r.endDate ? fmtDate(r.endDate) : '—'}
        </span>
      ),
    },
    {
      key: 'contractOwner', label: 'Owner', defaultVisible: true, width: '140px',
      render: (r) => <span className="text-muted-foreground">{r.contractOwner}</span>,
    },
  ], [formatAmount]);

  const defaultOrder = useMemo(() => allColumns.map((c) => c.key), [allColumns]);
  const defaultVisible = useMemo(
    () => new Set(allColumns.filter((c) => c.defaultVisible).map((c) => c.key)),
    [allColumns],
  );

  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const visibleColumns = useMemo(
    () => columnOrder
      .map((k) => allColumns.find((c) => c.key === k)!)
      .filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys, allColumns],
  );

  const handleToggleColumn = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const handleResetColumns = () => {
    setColumnOrder(defaultOrder);
    setVisibleKeys(new Set(defaultVisible));
  };

  const filtered = useMemo(() => {
    let list = contracts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.contractNumber.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        r.sourceRfq.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'VENDOR_SIGNED_GROUP') {
        list = list.filter(r => ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(r.status));
      } else if (statusFilter === 'PENDING_SIGNATURE_GROUP') {
        list = list.filter(r => ['PENDING_VENDOR_SIGNATURE', 'AWAITING_CUSTOMER_SIGNATURE', 'AWAITING_VENDOR_SIGNATURE'].includes(r.status));
      } else {
        list = list.filter(r => r.status === statusFilter);
      }
    }
    if (typeFilter !== 'ALL') list = list.filter(r => r.contractType === contractTypeLabels[typeFilter] || r.contractType === typeFilter);
    return list;
  }, [contracts, search, statusFilter, typeFilter, contractTypeLabels]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const summary = useMemo(() => ({
    total: contracts.length,
    vendorSigned: contracts.filter(r => ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(r.status)).length,
    pendingSignature: contracts.filter(r => ['PENDING_VENDOR_SIGNATURE', 'AWAITING_CUSTOMER_SIGNATURE', 'AWAITING_VENDOR_SIGNATURE'].includes(r.status)).length,
    totalValue: contracts.reduce((s, r) => s + r.contractValue, 0),
  }), [contracts]);

  const formatDate = useCallback((d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  []);

  const isAllSelected = useMemo(() => {
    if (paginated.length === 0) return false;
    return paginated.every(r => selectedContractIds.includes(r.id));
  }, [paginated, selectedContractIds]);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      const paginatedIds = new Set(paginated.map(r => r.id));
      setSelectedContractIds(prev => prev.filter(id => !paginatedIds.has(id)));
    } else {
      const newIds = paginated.map(r => r.id);
      setSelectedContractIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  }, [isAllSelected, paginated]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedContractIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleBatchDeleteConfirm = useCallback(async () => {
    if (selectedContractIds.length === 0) return;
    setBatchDeleting(true);
    try {
      for (const id of selectedContractIds) {
        await contractService.deleteContract(id).catch(() => {});
      }
      setPageMsg(`Successfully deleted ${selectedContractIds.length} contract(s).`);
      setSelectedContractIds([]);
      setShowBatchDeleteModal(false);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete selected contracts');
    } finally {
      setBatchDeleting(false);
    }
  }, [selectedContractIds, reload]);

  const handleNavigateToPO = useCallback((contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (contract?.sourceRfq) {
      const fullContract = rawResult.rawContracts.find(c => c.id === contractId);
      if (fullContract?.rfqId) {
        navigate(`/procurement/purchase-requisition/${fullContract.rfqId}?contractId=${contractId}`);
        return;
      }
    }
    navigate(`/contracts/${contractId}`);
  }, [navigate, contracts, rawResult.rawContracts]);

  const dismissSignedBanner = useCallback((contractId: string) => {
    setRecentlySigned(prev => prev.filter(s => s.contractId !== contractId));
  }, []);

  const handleView = useCallback((id: string) => {
    navigate(`/contracts/${id}`);
  }, [navigate]);

  const handleEdit = useCallback((id: string) => {
    navigate(`/contracts/${id}/edit`);
  }, [navigate]);

  const handleSign = useCallback((id: string) => {
    navigate(`/contracts/${id}?action=sign`);
  }, [navigate]);

  const handleCreatePO = useCallback((id: string) => {
    handleNavigateToPO(id);
  }, [handleNavigateToPO]);

  const handleDownload = useCallback(async (r: ContractRow) => {
    try {
      setPageMsg(null);
      let contentHtml: string | null = null;
      try {
        const res = await contractService.getContract(r.id);
        if (res?.contract?.contentSnapshot) {
          contentHtml = res.contract.contentSnapshot;
        }
      } catch { /* fallback */ }

      if (!contentHtml) {
        contentHtml = `
          <div style="font-family: inherit; padding: 20px;">
            <h1 style="color: #0a6ed1; border-bottom: 2px solid #0a6ed1; padding-bottom: 8px;">${r.title || r.contractNumber}</h1>
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <tr><td style="font-weight: 700; width: 180px; padding: 8px; border: 1px solid #ddd;">Contract Number</td><td style="padding: 8px; border: 1px solid #ddd;">${r.contractNumber}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Supplier</td><td style="padding: 8px; border: 1px solid #ddd;">${r.vendorName}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Contract Value</td><td style="padding: 8px; border: 1px solid #ddd;">${r.currency} ${r.contractValue.toLocaleString('en-IN')}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Type</td><td style="padding: 8px; border: 1px solid #ddd;">${r.contractType}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Status</td><td style="padding: 8px; border: 1px solid #ddd;">${r.status}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Owner</td><td style="padding: 8px; border: 1px solid #ddd;">${r.contractOwner}</td></tr>
            </table>
          </div>
        `;
      }

      await downloadContractAsPdf(
        contentHtml,
        r.contractNumber || `Contract-${r.id}`,
        r.title || r.contractNumber
      );
    } catch (err) {
      console.error('Failed to download contract PDF:', err);
      setPageMsg('Failed to download contract PDF. Please try again.');
    }
  }, []);

  const handleTerminateConfirm = useCallback(async () => {
    if (!terminateTarget) return;
    setTerminating(true);
    setPageMsg(null);
    try {
      await contractService.terminateContract(terminateTarget.id);
      setPageMsg(`Contract ${terminateTarget.contractNumber} terminated.`);
      setTerminateTarget(null);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Termination failed');
    } finally {
      setTerminating(false);
    }
  }, [terminateTarget, reload]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setPageMsg(null);
    try {
      await contractService.deleteContract(deleteTarget.id);
      setPageMsg(`Contract ${deleteTarget.contractNumber} deleted.`);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, reload]);

  return (
    <PageFrame>
      {pageMsg && (
        <MessageStrip type={inferMessageType(pageMsg)} onClose={() => setPageMsg(null)} autoHideMs={5000} className="mb-4">
          {pageMsg}
        </MessageStrip>
      )}
      {error && <MessageStrip type="error" className="mb-4">{error}</MessageStrip>}

      {/* Recently Signed Banner */}
      {recentlySigned.length > 0 && (
        <Card className="mb-6 border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <Bell className="size-4 animate-bounce" /> Recently Signed Contracts
            </div>
            <button className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400" onClick={dismissAllSigned}>
              Dismiss all
            </button>
          </div>
          <div className="space-y-2">
            {recentlySigned.map(event => (
              <div key={event.contractId} className="flex flex-col gap-2 rounded-lg border border-emerald-500/20 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-foreground">{event.vendorName} · <span className="font-mono">{event.contractNumber}</span></div>
                    <div className="text-[12px] text-muted-foreground">Signed by {event.signedBy} · {getTimeAgo(event.signedAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => handleView(event.contractId)} className="h-8 text-xs">
                    <Eye className="mr-1.5 size-3.5" /> View
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => canCreatePO && handleNavigateToPO(event.contractId)} disabled={!canCreatePO} className="h-8 text-xs">
                    <ArrowRight className="mr-1.5 size-3.5" /> Create PO
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => dismissSignedBanner(event.contractId)} className="h-8 w-8 p-0">
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Header */}
      <PageLead
        title="Contracts"
        description="Manage contracts, track signatures, and create purchase orders"
      />

      {/* Metric Cards Grid matching RFQ */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: FileText, tone: 'primary' as const, value: summary.total, label: 'TOTAL CONTRACTS', detail: 'Across all contracts', filter: 'ALL' },
          { icon: CheckCircle2, tone: 'success' as const, value: summary.vendorSigned, label: 'VENDOR SIGNED', detail: 'Signed & active', filter: 'VENDOR_SIGNED_GROUP' },
          { icon: Clock, tone: 'warning' as const, value: summary.pendingSignature, label: 'PENDING SIGNATURE', detail: 'Awaiting signatures', filter: 'PENDING_SIGNATURE_GROUP' },
          { icon: DollarSign, tone: 'primary' as const, value: formatAmount(summary.totalValue, displayCurrency), label: 'TOTAL VALUE', detail: 'Cumulative contract value', filter: 'TOTAL_VALUE' },
        ].map((c) => {
          const isActive = c.filter === 'TOTAL_VALUE' ? false : statusFilter === c.filter;
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
              onClick={() => {
                if (c.filter !== 'TOTAL_VALUE') {
                  setStatusFilter(c.filter);
                  setCurrentPage(1);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
            />
          );
        })}
      </div>

      {/* Search & Filter Toolbar matching RFQ */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10 pr-10"
            type="text"
            placeholder="Search by contract number, title, supplier, RFQ..."
            aria-label="Search contracts"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
          {statusFilter !== 'ALL' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
              className="h-11 rounded-xl px-3.5"
            >
              <X size={14} /> Clear Filter
            </Button>
          )}

          <div className="flex items-center gap-1 rounded-xl border border-input bg-card p-1 h-11">
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('table')}
              className="h-9 w-9 p-0 rounded-lg"
              title="Table View"
            >
              <LayoutList className="size-4" />
            </Button>
            <Button
              variant={view === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('card')}
              className="h-9 w-9 p-0 rounded-lg"
              title="Card View"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Floating Bulk Action */}
      {selectedContractIds.length > 0 && !showBatchDeleteModal && (
        <Card className="mb-6 flex items-center justify-between border-primary p-4 bg-primary/5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckSquare className="size-5 text-primary" />
            <span><strong>{selectedContractIds.length}</strong> Contract(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedContractIds([])}>
              Cancel Selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canCreateContract}
              onClick={() => canCreateContract && setShowBatchDeleteModal(true)}
            >
              <Trash2 className="mr-1.5 size-4" /> Delete Selected ({selectedContractIds.length})
            </Button>
          </div>
        </Card>
      )}

      {/* Content */}
      {loading ? (
        <Card className="p-6">
          <TableSkeleton rows={4} columns={6} />
        </Card>
      ) : paginated.length > 0 ? (
        view === 'table' ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        disabled={!canCreateContract}
                        onChange={canCreateContract ? handleToggleSelectAll : undefined}
                        className="rounded border-input text-primary shadow-xs focus:ring-primary"
                      />
                    </th>
                    {visibleColumns.map(col => <th key={col.key} className="px-5 py-3.5">{col.label}</th>)}
                    <th className="px-5 py-3.5 text-right">
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
                              allColumns={allColumns}
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
                <tbody className="divide-y divide-border/50">
                  {paginated.map(r => (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => handleView(r.id)}>
                      <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedContractIds.includes(r.id)}
                          disabled={!canCreateContract}
                          onChange={() => canCreateContract && handleToggleSelect(r.id)}
                          className="rounded border-input text-primary shadow-xs focus:ring-primary"
                        />
                      </td>
                      {visibleColumns.map(col => <td key={col.key} className="px-5 py-3.5">{col.render(r, formatDate)}</td>)}
                      <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View" onClick={() => handleView(r.id)}>
                            <Eye className="size-4" />
                          </Button>
                          {r.status === 'DRAFT' && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit" onClick={() => handleEdit(r.id)}>
                              <Edit3 className="size-4" />
                            </Button>
                          )}
                          {(r.status === 'PENDING_VENDOR_SIGNATURE' || r.status === 'AWAITING_CUSTOMER_SIGNATURE') && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600" title="Sign Contract" onClick={() => handleSign(r.id)}>
                              <FileSignature className="size-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Download PDF" onClick={() => handleDownload(r)}>
                            <Download className="size-4" />
                          </Button>
                          {r.status === 'DRAFT' && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" title="Delete" onClick={() => setDeleteTarget(r)}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {paginated.map(r => (
              <Card
                key={r.id}
                className="group cursor-pointer p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                onClick={() => handleView(r.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.contractNumber}</span>
                  <Badge variant="outline" className={cn(STATUS_TONES[r.status])}>
                    {STATUS_LABELS[r.status]}
                  </Badge>
                </div>
                <div className="mt-3 text-base font-bold text-foreground group-hover:text-primary truncate">{r.vendorName}</div>
                <h3 className="mt-1 text-xs text-muted-foreground truncate">{r.title}</h3>
                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
                  <span className="text-muted-foreground">{formatDate(r.startDate)}</span>
                  <span className="font-bold text-foreground font-mono text-sm sm:text-base">{formatAmount(r.contractValue, r.currency)}</span>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <EmptyState
          icon={FileText}
          title="No contracts found"
          description={search ? 'Try adjusting your search criteria.' : 'Create your first contract to get started.'}
        />
      )}

      {/* Delete Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="size-5" /> Delete Contract
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete contract <strong>{deleteTarget.contractNumber}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" disabled={deleting} onClick={handleDeleteConfirm}>
                {deleting ? 'Deleting…' : 'Delete Contract'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
