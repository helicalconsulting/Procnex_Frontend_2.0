import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
  CheckSquare,
  SlidersHorizontal,
} from 'lucide-react';
import { purchaseRequisitionService, type PurchaseRequisition } from '../../services/purchaseRequisitionService';
import { sseClient } from '../../services/sseClient';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
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

type ListPurchaseRequisition = PurchaseRequisition & { isStandalone?: boolean };
type StatusFilter = 'DRAFT_PENDING' | 'APPROVED' | 'REJECTED' | null;

const releasedStatuses = ['APPROVED', 'COMPLETED', 'SENT_TO_VENDOR', 'PO_CREATED'];

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved & Released',
    COMPLETED: 'Approved & Released',
    REJECTED: 'Rejected',
    CANCELLED: 'Rejected',
    RETURNED: 'Returned for Revision',
    SENT_TO_VENDOR: 'Sent to Vendor',
    PO_CREATED: 'PO Created',
  };
  return labels[status] || status.replace(/_/g, ' ');
}

function getStatusTone(status: string): 'neutral' | 'warning' | 'success' | 'danger' | 'info' {
  if (status === 'DRAFT') return 'neutral';
  if (status === 'PENDING_APPROVAL') return 'warning';
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'danger';
  if (status === 'SENT_TO_VENDOR') return 'info';
  return 'success';
}

function formatDate(value?: string): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isStandaloneDocument(requisition: ListPurchaseRequisition): boolean {
  const rfqId = (requisition.rfqId || '').toLowerCase();
  return Boolean(
    requisition.isStandalone ||
    !requisition.rfqId ||
    rfqId.startsWith('direct-po') ||
    rfqId.startsWith('rfq-direct') ||
    rfqId === 'direct-po-master-id' ||
    rfqId.includes('direct')
  );
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'poNumber', label: 'PO / PR Number', defaultVisible: true, required: true },
  { key: 'vendorName', label: 'Vendor', defaultVisible: true },
  { key: 'poDate', label: 'PO Date', defaultVisible: true },
  { key: 'currency', label: 'Currency', defaultVisible: true },
  { key: 'grandTotal', label: 'Grand Total', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
];

export default function PurchaseRequisitionsListPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreatePO = hasPermission('PO Creation', 'canCreate');
  const { formatAmount, companyDefaultCurrency } = useCurrency();

  const [requisitions, setRequisitions] = useState<ListPurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListPurchaseRequisition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedPrIds, setSelectedPrIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);

  // Column Customizer State
  const defaultOrder = useMemo(() => ALL_COLUMNS.map((c) => c.key), []);
  const defaultVisible = useMemo(() => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)), []);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const fetchRequisitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await purchaseRequisitionService.list();
      setRequisitions(list);
    } catch (err: any) {
      setError(err?.message || 'Failed to load purchase requisitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequisitions();

    const unsubStatus = sseClient.on('po_status_changed', () => {
      fetchRequisitions();
    });
    const unsubCreated = sseClient.on('po_created', () => {
      fetchRequisitions();
    });

    return () => {
      unsubStatus();
      unsubCreated();
    };
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id || deleteTarget.rfqId;
    const deletedPoNumber = deleteTarget.poNumber;
    setDeleting(true);
    try {
      await purchaseRequisitionService.delete(targetId);
      setRequisitions((prev) => prev.filter((r) => r.id !== deleteTarget.id && r.rfqId !== deleteTarget.rfqId));
      setToast({ message: `Document ${deleteTarget.poNumber || ''} was deleted successfully.`, type: 'success' });
      setDeleteTarget(null);

      window.dispatchEvent(new CustomEvent('heliflow:po-deleted', {
        detail: { poId: targetId, poNumber: deletedPoNumber },
      }));
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to delete document', type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((r) => {
      if (statusFilter === 'DRAFT_PENDING') {
        if (r.status !== 'DRAFT' && r.status !== 'PENDING_APPROVAL') return false;
      } else if (statusFilter === 'APPROVED') {
        if (!releasedStatuses.includes(r.status)) return false;
      } else if (statusFilter === 'REJECTED') {
        if (!['REJECTED', 'CANCELLED'].includes(r.status)) return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (r.poNumber || '').toLowerCase().includes(term) ||
        (r.vendorName || '').toLowerCase().includes(term) ||
        (r.status || '').toLowerCase().includes(term) ||
        (r.currency || '').toLowerCase().includes(term)
      );
    });
  }, [requisitions, searchTerm, statusFilter]);

  // Batch Selection
  const isAllSelected = useMemo(() => {
    if (filteredRequisitions.length === 0) return false;
    return filteredRequisitions.every((p) => selectedPrIds.includes(String(p.id || p.rfqId)));
  }, [filteredRequisitions, selectedPrIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const pageIds = new Set(filteredRequisitions.map((p) => String(p.id || p.rfqId)));
      setSelectedPrIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = filteredRequisitions.map((p) => String(p.id || p.rfqId));
      setSelectedPrIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedPrIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBatchDeleteConfirm = async () => {
    if (selectedPrIds.length === 0) return;
    setBatchDeleting(true);
    try {
      for (const id of selectedPrIds) {
        await purchaseRequisitionService.delete(id).catch(() => {});
      }
      setToast({ message: `Successfully deleted ${selectedPrIds.length} purchase document(s).`, type: 'success' });
      setSelectedPrIds([]);
      setShowBatchDeleteModal(false);
      await fetchRequisitions();
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to delete selected items.', type: 'error' });
    } finally {
      setBatchDeleting(false);
    }
  };

  // Metrics
  const draftAndPendingCount = useMemo(
    () => requisitions.filter((r) => r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL').length,
    [requisitions]
  );
  const activeCount = useMemo(
    () => requisitions.filter((r) => releasedStatuses.includes(r.status)).length,
    [requisitions]
  );
  const totalValue = useMemo(
    () => requisitions.reduce((acc, r) => acc + (Number(r.grandTotal) || 0), 0),
    [requisitions]
  );

  const visibleColumns = useMemo(
    () => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys]
  );

  const openDocument = (requisition: ListPurchaseRequisition, mode: 'view' | 'edit') => {
    if (isStandaloneDocument(requisition)) {
      const documentId = requisition.id || requisition.rfqId;
      navigate(`/procurement/create-purchase-order?id=${encodeURIComponent(documentId)}${mode === 'view' ? '&mode=view' : ''}`);
      return;
    }
    navigate(`/procurement/purchase-requisition/${encodeURIComponent(requisition.rfqId)}?mode=${mode}`, {
      state: { readOnly: mode === 'view' },
    });
  };

  if (loading) {
    return (
      <PageFrame>
        <div className="flex min-h-[52vh] items-center justify-center gap-3 text-sm text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          Loading purchase orders…
        </div>
      </PageFrame>
    );
  }

  if (error) {
    return (
      <PageFrame>
        <EmptyState
          icon={AlertTriangle}
          title="Purchase orders could not be loaded"
          description={error}
          action={<Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>}
        />
      </PageFrame>
    );
  }

  const metricClass = 'cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/55';

  return (
    <PageFrame>
      {toast && (
        <div className="mb-5">
          <MessageStrip type={toast.type} compact autoHideMs={5000} onClose={() => setToast(null)}>
            {toast.message}
          </MessageStrip>
        </div>
      )}

      <PageLead
        title="Purchase orders"
        description="Create, review and release purchase documents from one clear workspace."
        actions={
          <Button
            onClick={canCreatePO ? () => navigate('/procurement/create-purchase-order') : undefined}
            disabled={!canCreatePO}
            title={!canCreatePO ? 'You do not have permission to create Purchase Orders.' : 'Create new Purchase Order'}
          >
            <Plus /> New purchase order
          </Button>
        }
      />

      {requisitions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            role="button"
            tabIndex={0}
            aria-pressed={statusFilter === null}
            className={cn(metricClass, statusFilter === null && 'border-primary/40 bg-primary/[0.035]')}
            onClick={() => setStatusFilter(null)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setStatusFilter(null); }}
            icon={FileText}
            label="Total documents"
            value={requisitions.length}
            detail="Across every approval state"
          />
          <MetricCard
            role="button"
            tabIndex={0}
            aria-pressed={statusFilter === 'DRAFT_PENDING'}
            className={cn(metricClass, statusFilter === 'DRAFT_PENDING' && 'border-amber-500/40 bg-amber-500/[0.035]')}
            onClick={() => setStatusFilter((current) => current === 'DRAFT_PENDING' ? null : 'DRAFT_PENDING')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') setStatusFilter((current) => current === 'DRAFT_PENDING' ? null : 'DRAFT_PENDING');
            }}
            icon={Clock3}
            label="Needs attention"
            value={draftAndPendingCount}
            detail="Draft and pending approval"
            tone="warning"
          />
          <MetricCard
            role="button"
            tabIndex={0}
            aria-pressed={statusFilter === 'APPROVED'}
            className={cn(metricClass, statusFilter === 'APPROVED' && 'border-emerald-500/40 bg-emerald-500/[0.035]')}
            onClick={() => setStatusFilter((current) => current === 'APPROVED' ? null : 'APPROVED')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') setStatusFilter((current) => current === 'APPROVED' ? null : 'APPROVED');
            }}
            icon={CheckCircle2}
            label="Approved & released"
            value={activeCount}
            detail="Ready or sent to a vendor"
            tone="success"
          />
          <MetricCard
            icon={ShoppingCart}
            label="Total volume"
            value={formatAmount(totalValue, requisitions[0]?.currency || companyDefaultCurrency)}
            detail="Value across listed documents"
            tone="violet"
          />
        </div>
      )}

      {selectedPrIds.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5 shadow-sm">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <CheckSquare className="size-4 text-primary" />
            <span><strong>{selectedPrIds.length}</strong> document(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedPrIds([])}>
              Cancel Selection
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canCreatePO}
              onClick={() => canCreatePO && setShowBatchDeleteModal(true)}
              title={!canCreatePO ? 'You do not have permission to delete Purchase Orders.' : undefined}
            >
              <Trash2 className="size-4" /> Delete Selected ({selectedPrIds.length})
            </Button>
          </div>
        </div>
      )}

      {requisitions.length === 0 ? (
        <EmptyState
          className="mt-5"
          icon={FileText}
          title="No purchase orders yet"
          description="Create a direct purchase order or award an approved quotation to start your order history."
          action={<Button onClick={() => navigate('/procurement/create-purchase-order')}><Plus /> Create purchase order</Button>}
        />
      ) : (
        <Card className="mt-5 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10 pr-10"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search number, vendor, status or currency"
                aria-label="Search purchase orders"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
                {filteredRequisitions.length} of {requisitions.length} documents
              </p>
            </div>
          </div>

          {filteredRequisitions.length === 0 ? (
            <EmptyState
              className="m-4 min-h-64 border-0 shadow-none"
              icon={Search}
              title="No matching documents"
              description="Try a different search or clear the active status filter."
              action={
                <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter(null); }}>
                  <X /> Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/35 text-left text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
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
                          className={cn('px-4 py-3', col.key === 'grandTotal' && 'text-right')}
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-center">
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
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequisitions.map((requisition) => {
                      const idStr = String(requisition.id || requisition.rfqId);
                      const isSelected = selectedPrIds.includes(idStr);

                      return (
                        <tr
                          key={idStr}
                          className={cn(
                            'group cursor-pointer border-b border-border/55 transition-colors last:border-0 hover:bg-accent/35',
                            isSelected && 'bg-primary/[0.035]'
                          )}
                          onClick={() => openDocument(requisition, 'view')}
                        >
                          <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!canCreatePO}
                              onChange={() => canCreatePO && handleToggleSelect(idStr)}
                              className="size-4 rounded border-border text-primary focus:ring-primary/40"
                            />
                          </td>

                          {visibleColumns.map((col) => {
                            if (col.key === 'poNumber') {
                              return (
                                <td key="poNumber" className="px-4 py-4 font-semibold text-primary">
                                  {requisition.poNumber || 'Number pending'}
                                </td>
                              );
                            }
                            if (col.key === 'vendorName') {
                              return (
                                <td key="vendorName" className="max-w-[240px] truncate px-4 py-4 font-medium">
                                  {requisition.vendorName || 'Vendor not assigned'}
                                </td>
                              );
                            }
                            if (col.key === 'poDate') {
                              return <td key="poDate" className="px-4 py-4 text-muted-foreground">{formatDate(requisition.poDate)}</td>;
                            }
                            if (col.key === 'currency') {
                              return <td key="currency" className="px-4 py-4 text-muted-foreground">{requisition.currency || companyDefaultCurrency}</td>;
                            }
                            if (col.key === 'grandTotal') {
                              return (
                                <td key="grandTotal" className="px-4 py-4 text-right font-semibold tabular-nums">
                                  {formatAmount(requisition.grandTotal || 0, requisition.currency || companyDefaultCurrency)}
                                </td>
                              );
                            }
                            if (col.key === 'status') {
                              return (
                                <td key="status" className="px-4 py-4">
                                  <Badge tone={getStatusTone(requisition.status)}>
                                    {getStatusLabel(requisition.status)}
                                  </Badge>
                                </td>
                              );
                            }
                            return <td key={col.key} className="px-4 py-4">-</td>;
                          })}

                          <td className="px-5 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openDocument(requisition, 'view')}
                                title="View purchase order"
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={!canCreatePO}
                                onClick={() => canCreatePO && openDocument(requisition, 'edit')}
                                title={canCreatePO ? 'Edit purchase order' : 'Permission denied'}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={!canCreatePO}
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => canCreatePO && setDeleteTarget(requisition)}
                                title={canCreatePO ? 'Delete purchase order' : 'Permission denied'}
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

              <div className="divide-y divide-border/65 lg:hidden">
                {filteredRequisitions.map((requisition) => (
                  <article key={requisition.id || requisition.rfqId} className="p-4 sm:p-5">
                    <button type="button" className="w-full text-left" onClick={() => openDocument(requisition, 'view')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-primary">{requisition.poNumber || 'Number pending'}</p>
                          <p className="mt-1 truncate text-sm font-medium">{requisition.vendorName || 'Vendor not assigned'}</p>
                        </div>
                        <Badge tone={getStatusTone(requisition.status)} className="shrink-0">{getStatusLabel(requisition.status)}</Badge>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div><dt className="text-muted-foreground">PO date</dt><dd className="mt-1 font-medium">{formatDate(requisition.poDate)}</dd></div>
                        <div><dt className="text-muted-foreground">Grand total</dt><dd className="mt-1 font-semibold tabular-nums">{formatAmount(requisition.grandTotal || 0, requisition.currency || companyDefaultCurrency)}</dd></div>
                      </dl>
                    </button>
                    <div className="mt-4 flex gap-2 border-t border-border/60 pt-3">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openDocument(requisition, 'view')}><Eye /> View</Button>
                      <Button variant="outline" size="sm" className="flex-1" disabled={!canCreatePO} onClick={() => canCreatePO && openDocument(requisition, 'edit')}><Pencil /> Edit</Button>
                      <Button variant="ghost" size="icon-sm" disabled={!canCreatePO} className="text-destructive hover:bg-destructive/10" onClick={() => canCreatePO && setDeleteTarget(requisition)}><Trash2 /></Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Delete Single Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete purchase order?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.poNumber || deleteTarget?.vendorName || 'This document'} will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Any workflow history linked only to this purchase order may no longer be available.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" loading={deleting} onClick={handleDeleteConfirm}>Delete document</Button>
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
            <DialogTitle>Delete {selectedPrIds.length} selected document(s)?</DialogTitle>
            <DialogDescription>
              The selected {selectedPrIds.length} purchase document(s) will be permanently deleted from the database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            This batch operation is permanent and cannot be reversed.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}>Cancel</Button>
            <Button variant="destructive" loading={batchDeleting} onClick={handleBatchDeleteConfirm}>Delete {selectedPrIds.length} document(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
