import { useState, useMemo, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  XCircle,
  X,
  Trash2,
  CheckSquare,
  SlidersHorizontal,
  LayoutList,
  LayoutGrid,
} from 'lucide-react';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { downloadPurchaseOrderAsPdf } from '../../utils/pdfDownload';
import { toNumber } from '../../api/normalize';
import type { PurchaseOrder } from '../../types';
import { useServiceData } from '../../hooks/useServiceData';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useAuth } from '../../context/AuthContext';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ColumnCustomizer, { type ColumnDef } from '../../components/shared/ColumnCustomizer';
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

type POStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface MockPO {
  id: number;
  poNumber: string;
  rfqNumber: string;
  vendorName: string;
  vendorInitials: string;
  avatarMod: string;
  totalAmount: string;
  totalAmountNum: number;
  itemCount: number;
  status: POStatus;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
  expectedDelivery: string;
  department: string;
  createdBy: string;
}

const STATUS_CONFIG: Record<POStatus, { label: string; tone: Tone; icon: typeof FileText }> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: FileText },
  PENDING_APPROVAL: { label: 'Pending Approval', tone: 'warning', icon: Clock },
  APPROVED: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  DISPATCHED: { label: 'Dispatched', tone: 'info', icon: Truck },
  DELIVERED: { label: 'Delivered', tone: 'success', icon: Package },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: XCircle },
};

const PROGRESS_STEPS: POStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'DELIVERED'];

function mapPO(po: PurchaseOrder): MockPO {
  const vendor = po.vendor;
  const name = vendor?.name || 'Unknown';
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const amount = toNumber(po.totalAmount);
  const created = String(po.createdAt).slice(0, 10);
  return {
    id: po.id,
    poNumber: po.poNumber,
    rfqNumber: po.rfq?.rfqNumber || `RFQ-${po.rfqId}`,
    vendorName: name,
    vendorInitials: initials,
    avatarMod: String((po.vendorId % 6) + 1),
    totalAmount: amount.toLocaleString('en-IN'),
    totalAmountNum: amount,
    itemCount: po.items?.length ?? 0,
    status: (po.status as POStatus) || 'DRAFT',
    priority: 'MEDIUM',
    createdAt: created,
    expectedDelivery: created,
    department: '—',
    createdBy: '—',
  };
}

function StatusBadge({ status }: { status: POStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  const Icon = config.icon;
  return (
    <Badge tone={config.tone}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'poNumber', label: 'Purchase Order', defaultVisible: true, required: true },
  { key: 'vendorName', label: 'Vendor', defaultVisible: true },
  { key: 'totalAmount', label: 'Amount', defaultVisible: true },
  { key: 'itemCount', label: 'Items', defaultVisible: true },
  { key: 'priority', label: 'Priority', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
  { key: 'expectedDelivery', label: 'Expected Delivery', defaultVisible: true },
];

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreatePO =
    hasPermission('PO Creation', 'canCreate') ||
    hasPermission('Purchase Orders', 'canCreate') ||
    hasPermission('PO', 'canCreate');

  const { data: poResult, loading, error } = useServiceData(
    () => purchaseOrderService.list().then((r) => r.orders.map(mapPO)),
    [] as MockPO[]
  );

  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'card'>('table');
  const [statusFilter, setStatusFilter] = useState<POStatus | 'ALL'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [detailPO, setDetailPO] = useState<MockPO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockPO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedPOIds, setSelectedPOIds] = useState<number[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [pageMsg, setPageMsg] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const perPage = 8;

  // Column Customizer State
  const defaultOrder = useMemo(() => ALL_COLUMNS.map((c) => c.key), []);
  const defaultVisible = useMemo(() => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)), []);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const visibleColumns = useMemo(
    () => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys]
  );

  const summary = useMemo(
    () => ({
      total: poResult.length,
      pending: poResult.filter((p) => ['PENDING_APPROVAL', 'DRAFT'].includes(p.status)).length,
      active: poResult.filter((p) => ['APPROVED', 'DISPATCHED'].includes(p.status)).length,
      totalValue: poResult.reduce((sum, p) => sum + p.totalAmountNum, 0),
    }),
    [poResult]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return poResult.filter((p) => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PENDING_APPROVAL' && !['PENDING_APPROVAL', 'DRAFT'].includes(p.status)) return false;
        if (statusFilter === 'APPROVED' && !['APPROVED', 'DISPATCHED'].includes(p.status)) return false;
        if (statusFilter !== 'PENDING_APPROVAL' && statusFilter !== 'APPROVED' && p.status !== statusFilter) return false;
      }
      if (!query) return true;
      return [p.poNumber, p.vendorName, p.rfqNumber, p.createdBy, p.department].some((field) =>
        (field || '').toLowerCase().includes(query)
      );
    });
  }, [poResult, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const formatDate = (date?: string) =>
    date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // Batch Selection
  const isAllSelected = useMemo(() => {
    if (paginated.length === 0) return false;
    return paginated.every((p) => selectedPOIds.includes(p.id));
  }, [paginated, selectedPOIds]);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      const paginatedIds = new Set(paginated.map((p) => p.id));
      setSelectedPOIds((prev) => prev.filter((id) => !paginatedIds.has(id)));
    } else {
      const newIds = paginated.map((p) => p.id);
      setSelectedPOIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  }, [isAllSelected, paginated]);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedPOIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await purchaseOrderService.delete(deleteTarget.id);
      setPageMsg({ message: `Purchase Order ${deleteTarget.poNumber} deleted successfully.`, type: 'success' });
      setDeleteTarget(null);
      const idx = poResult.findIndex((p) => p.id === deleteTarget.id);
      if (idx !== -1) poResult.splice(idx, 1);
    } catch (err: any) {
      setPageMsg({ message: err?.message || 'Failed to delete PO', type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, poResult]);

  const handleBatchDeleteConfirm = useCallback(async () => {
    if (selectedPOIds.length === 0) return;
    setBatchDeleting(true);
    try {
      for (const id of selectedPOIds) {
        await purchaseOrderService.delete(id).catch(() => {});
        const idx = poResult.findIndex((p) => p.id === id);
        if (idx !== -1) poResult.splice(idx, 1);
      }
      setPageMsg({ message: `Successfully deleted ${selectedPOIds.length} purchase order(s).`, type: 'success' });
      setSelectedPOIds([]);
      setShowBatchDeleteModal(false);
    } catch (err: any) {
      setPageMsg({ message: err?.message || 'Failed to delete selected purchase orders', type: 'error' });
    } finally {
      setBatchDeleting(false);
    }
  }, [selectedPOIds, poResult]);

  const cardProps = (filter: POStatus | 'ALL') => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': statusFilter === filter,
    onClick: () => {
      setStatusFilter((current) => (current === filter && filter !== 'ALL' ? 'ALL' : filter));
      setCurrentPage(1);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        setStatusFilter(filter);
        setCurrentPage(1);
      }
    },
    className: cn(
      'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      statusFilter === filter && 'border-primary/40 ring-2 ring-primary/10'
    ),
  });

  return (
    <PageFrame>
      <PageLead
        title="Purchase orders"
        description="Track purchasing commitments from approval through delivery."
        actions={
          <Button
            onClick={canCreatePO ? () => navigate('/procurement/create-purchase-order') : undefined}
            disabled={!canCreatePO}
            title={!canCreatePO ? 'You do not have permission to create purchase orders.' : undefined}
          >
            <Plus /> Create PO
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <MessageStrip type="error">{error}</MessageStrip>
        </div>
      )}

      {pageMsg && (
        <div className="mb-4">
          <MessageStrip type={pageMsg.type} onClose={() => setPageMsg(null)} autoHideMs={5000}>
            {pageMsg.message}
          </MessageStrip>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard {...cardProps('ALL')} label="Total orders" value={summary.total} detail="All purchase orders" icon={ShoppingCart} />
        <MetricCard {...cardProps('PENDING_APPROVAL')} label="Pending" value={summary.pending} detail="Draft or in approval" icon={Clock} tone="warning" />
        <MetricCard {...cardProps('APPROVED')} label="Active" value={summary.active} detail="Approved or dispatched" icon={Truck} tone="success" />
        <MetricCard label="Total value" value={formatAmount(summary.totalValue, companyDefaultCurrency)} detail="Across all orders" icon={ShoppingCart} tone="violet" />
      </div>

      {selectedPOIds.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5 shadow-sm">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <CheckSquare className="size-4 text-primary" />
            <span><strong>{selectedPOIds.length}</strong> order(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedPOIds([])}>
              Cancel Selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canCreatePO}
              onClick={() => canCreatePO && setShowBatchDeleteModal(true)}
            >
              <Trash2 className="size-4" /> Delete Selected ({selectedPOIds.length})
            </Button>
          </div>
        </div>
      )}

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-10 pr-10"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search PO, vendor, RFQ, or department"
              aria-label="Search purchase orders"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2.5 sm:justify-end">
            <div className="relative">
              <Button
                ref={colBtnRef}
                variant="outline"
                size="sm"
                onClick={() => setShowColPanel((v) => !v)}
                title="Customize columns"
              >
                <SlidersHorizontal className="size-3.5" /> Columns
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
                    setColumnOrder(defaultOrder);
                    setVisibleKeys(new Set(defaultVisible));
                  }}
                  onClose={() => setShowColPanel(false)}
                  anchorRef={colBtnRef}
                />
              )}
            </div>

            <div className="flex items-center rounded-lg border border-border/70 p-0.5 bg-muted/40">
              <Button
                variant={view === 'table' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setView('table')}
                title="Table view"
              >
                <LayoutList className="size-4" />
              </Button>
              <Button
                variant={view === 'card' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setView('card')}
                title="Card view"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="flex min-h-[360px] items-center justify-center p-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            Loading purchase orders…
          </div>
        </Card>
      ) : paginated.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchase orders found"
          description={
            search || statusFilter !== 'ALL'
              ? 'Try clearing the search or status filter.'
              : 'Create your first purchase order to get started.'
          }
          action={
            search || statusFilter !== 'ALL' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : view === 'table' ? (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/55 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="w-11 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        disabled={!canCreatePO}
                        onChange={canCreatePO ? handleToggleSelectAll : undefined}
                        className="size-4 rounded border-border text-primary focus:ring-primary/40"
                      />
                    </th>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className={cn('px-4 py-3', ['totalAmount', 'itemCount'].includes(col.key) && 'text-right')}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paginated.map((order) => {
                    const isSelected = selectedPOIds.includes(order.id);
                    return (
                      <tr
                        key={order.id}
                        className={cn(
                          'transition-colors hover:bg-accent/35 cursor-pointer',
                          isSelected && 'bg-primary/[0.035]'
                        )}
                        onClick={() => setDetailPO(order)}
                      >
                        <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!canCreatePO}
                            onChange={() => canCreatePO && handleToggleSelect(order.id)}
                            className="size-4 rounded border-border text-primary focus:ring-primary/40"
                          />
                        </td>
                        {visibleColumns.map((col) => {
                          if (col.key === 'poNumber') {
                            return (
                              <td key="poNumber" className="px-4 py-3.5">
                                <div className="font-semibold text-primary">{order.poNumber}</div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">{order.rfqNumber}</div>
                              </td>
                            );
                          }
                          if (col.key === 'vendorName') {
                            return (
                              <td key="vendorName" className="px-4 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                                    {order.vendorInitials}
                                  </span>
                                  <span className="font-medium">{order.vendorName}</span>
                                </div>
                              </td>
                            );
                          }
                          if (col.key === 'totalAmount') {
                            return (
                              <td key="totalAmount" className="px-4 py-3.5 text-right font-semibold tabular-nums">
                                {formatAmount(order.totalAmountNum, companyDefaultCurrency)}
                              </td>
                            );
                          }
                          if (col.key === 'itemCount') {
                            return <td key="itemCount" className="px-4 py-3.5 text-right tabular-nums">{order.itemCount}</td>;
                          }
                          if (col.key === 'priority') {
                            return (
                              <td key="priority" className="px-4 py-3.5">
                                <Badge tone={order.priority === 'HIGH' ? 'danger' : order.priority === 'MEDIUM' ? 'warning' : 'neutral'}>
                                  {order.priority === 'HIGH' && <AlertTriangle className="size-3" />}
                                  {order.priority}
                                </Badge>
                              </td>
                            );
                          }
                          if (col.key === 'status') {
                            return <td key="status" className="px-4 py-3.5"><StatusBadge status={order.status} /></td>;
                          }
                          if (col.key === 'expectedDelivery') {
                            return (
                              <td key="expectedDelivery" className="px-4 py-3.5 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="size-3" />
                                  {formatDate(order.expectedDelivery)}
                                </span>
                              </td>
                            );
                          }
                          return <td key={col.key} className="px-4 py-3.5">-</td>;
                        })}
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDetailPO(order)}
                              title={`View ${order.poNumber}`}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => downloadPurchaseOrderAsPdf(order, formatAmount, companyDefaultCurrency)}
                              title={`Download ${order.poNumber}`}
                            >
                              <Download className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={!canCreatePO}
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => canCreatePO && setDeleteTarget(order)}
                              title={canCreatePO ? `Delete ${order.poNumber}` : 'Permission denied'}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {paginated.map((order) => (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-primary">{order.poNumber}</div>
                    <div className="mt-1 truncate text-sm font-medium">{order.vendorName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{order.rfqNumber}</div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/45 p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="mt-1 font-semibold">{formatAmount(order.totalAmountNum, companyDefaultCurrency)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Items</dt>
                    <dd className="mt-1 font-medium">{order.itemCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Delivery</dt>
                    <dd className="mt-1 font-medium">{formatDate(order.expectedDelivery)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Priority</dt>
                    <dd className="mt-1 font-medium">{order.priority}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setDetailPO(order)}>
                      <Eye /> Details
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadPurchaseOrderAsPdf(order, formatAmount, companyDefaultCurrency)}>
                      <Download /> PDF
                    </Button>
                  </div>
                  {canCreatePO && (
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteTarget(order)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paginated.map((order) => (
            <Card
              key={order.id}
              className="group cursor-pointer p-4 transition-all hover:border-primary/30 hover:shadow-md"
              onClick={() => setDetailPO(order)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-primary">{order.poNumber}</div>
                  <div className="mt-1 truncate text-sm font-medium">{order.vendorName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{order.rfqNumber}</div>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/45 p-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="mt-1 font-semibold">{formatAmount(order.totalAmountNum, companyDefaultCurrency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="mt-1 font-medium">{order.itemCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="mt-1 font-medium">{formatDate(order.expectedDelivery)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Priority</dt>
                  <dd className="mt-1 font-medium">{order.priority}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

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

      {/* Detail Dialog */}
      <Dialog open={!!detailPO} onOpenChange={(open) => { if (!open) setDetailPO(null); }}>
        {detailPO && (
          <DialogContent className="max-w-2xl">
            <DialogHeader className="pr-10">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{detailPO.poNumber}</DialogTitle>
                <StatusBadge status={detailPO.status} />
                <Badge>{detailPO.priority} priority</Badge>
              </div>
              <DialogDescription>
                {detailPO.vendorName} · {formatAmount(detailPO.totalAmountNum, companyDefaultCurrency)}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                ['RFQ reference', detailPO.rfqNumber],
                ['Vendor', detailPO.vendorName],
                ['Total amount', formatAmount(detailPO.totalAmountNum, companyDefaultCurrency)],
                ['Items', String(detailPO.itemCount)],
                ['Department', detailPO.department],
                ['Created by', detailPO.createdBy],
                ['Created', formatDate(detailPO.createdAt)],
                ['Expected delivery', formatDate(detailPO.expectedDelivery)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/65 bg-secondary/40 p-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {detailPO.status === 'CANCELLED' ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/8 p-3 text-sm text-destructive">
                <XCircle className="size-4" /> This order has been cancelled.
              </div>
            ) : (
              <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
                {PROGRESS_STEPS.map((step, index) => {
                  const done = index <= PROGRESS_STEPS.indexOf(detailPO.status);
                  return (
                    <li
                      key={step}
                      className="relative flex min-w-0 flex-col items-center text-center before:absolute before:left-[calc(50%+12px)] before:right-[calc(-50%+12px)] before:top-3 before:h-px before:bg-border last:before:hidden"
                    >
                      <span
                        className={cn(
                          'relative z-10 grid size-6 place-items-center rounded-full border bg-card text-[10px]',
                          done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                        )}
                      >
                        {done ? <CheckCircle2 className="size-3.5" /> : index + 1}
                      </span>
                      <span className="mt-2 hidden text-[9px] text-muted-foreground sm:block">{STATUS_CONFIG[step].label}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDetailPO(null)}>Close</Button>
              <Button onClick={() => downloadPurchaseOrderAsPdf(detailPO, formatAmount, companyDefaultCurrency)}>
                <Download /> Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete Single Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete purchase order?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.poNumber || 'This order'} will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" loading={deleting} onClick={handleDeleteConfirm}>Delete order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Delete Modal */}
      <Dialog open={showBatchDeleteModal} onOpenChange={(open) => { if (!open && !batchDeleting) setShowBatchDeleteModal(false); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete {selectedPOIds.length} selected order(s)?</DialogTitle>
            <DialogDescription>
              The selected {selectedPOIds.length} purchase order(s) will be permanently deleted from the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}>Cancel</Button>
            <Button variant="destructive" loading={batchDeleting} onClick={handleBatchDeleteConfirm}>Delete {selectedPOIds.length} order(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
