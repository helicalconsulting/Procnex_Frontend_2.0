import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { grnService, type GoodsReceivedNote } from '../../services/grnService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { invoiceService } from '../../services/invoiceService';
import {
  PackageCheck,
  Search,
  Truck,
  Receipt,
  ArrowRight,
  Eye,
  X,
  ShoppingCart,
  CheckCircle2,
} from 'lucide-react';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useAuth } from '../../context/AuthContext';
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

export default function GRNListPage() {
  const navigate = useNavigate();
  const { hasPermission, roles = [], user, permissions = {} } = useAuth();
  const isVendor =
    roles.some((r) => String(r).toLowerCase().includes('vendor') || String(r).toLowerCase().includes('supplier')) ||
    String(user?.roleName || '').toLowerCase().includes('vendor') ||
    String(user?.roleName || '').toLowerCase().includes('supplier') ||
    !!(user as any)?.vendorId ||
    !!(user as any)?.isVendor ||
    Object.keys(permissions).length === 0;

  const canCreateGRN =
    isVendor ||
    hasPermission('PO Creation', 'canCreate') ||
    hasPermission('Goods Received Note', 'canCreate') ||
    hasPermission('GRN', 'canCreate');

  const canCreateInvoice =
    isVendor ||
    hasPermission('Create Purchase Invoice', 'canCreate') ||
    hasPermission('Purchase Invoice', 'canCreate') ||
    hasPermission('Invoices', 'canCreate') ||
    hasPermission('Accounts Payable', 'canCreate');
  const { companyDefaultCurrency, formatAmount } = useCurrency();

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'PENDING' | 'GRN'>('ALL');
  const [selectedGrn, setSelectedGrn] = useState<GoodsReceivedNote | null>(null);

  // Load GRNs
  const { data: grnData, loading: grnLoading } = useServiceData(
    () => grnService.list({ search }),
    { grns: [], total: 0 },
    [search]
  );
  const grns = grnData.grns || [];

  // Load Purchase Orders
  const { data: poData, loading: poLoading } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );
  const poList = poData.orders || [];

  // Load Invoices to check if GRN / PO is already invoiced
  const { data: invoicesList } = useServiceData(
    () => invoiceService.list(),
    [],
    []
  );

  const invoicedPoNumbers = useMemo(() => {
    const set = new Set<string>();
    (invoicesList || []).forEach((inv) => {
      if (inv.poNumber) set.add(String(inv.poNumber).toLowerCase());
      if (inv.id) set.add(String(inv.id).toLowerCase());
    });
    return set;
  }, [invoicesList]);

  // Filter POs by search & KPI filter — ONLY Approved/Confirmed orders can have GRNs created
  const filteredPOs = useMemo(() => {
    let list = poList.filter((po) => {
      const s = String(po?.status || '').toUpperCase();
      return (
        s === 'APPROVED' ||
        s === 'CONFIRMED' ||
        s === 'SENT_TO_VENDOR' ||
        s === 'PROCESSING' ||
        s === 'SHIPPED' ||
        s === 'GRN_RECEIVED'
      );
    });

    if (kpiFilter === 'PENDING') {
      list = list.filter((po) => String(po?.status || '') !== 'GRN_RECEIVED' && String(po?.status || '') !== 'DELIVERED');
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((po) => {
        const poNum = String(po?.poNumber || '');
        const vName =
          typeof po?.vendor === 'object' && po?.vendor?.name
            ? String(po.vendor.name)
            : typeof po?.vendor === 'string'
            ? po.vendor
            : '';
        const statusStr = String(po?.status || '');
        return (
          poNum.toLowerCase().includes(q) ||
          vName.toLowerCase().includes(q) ||
          statusStr.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [poList, search, kpiFilter]);

  // Filter GRNs by search
  const filteredGRNs = useMemo(() => {
    if (!search.trim()) return grns;
    const q = search.toLowerCase();
    return grns.filter((g) => {
      const gNum = String(g?.grnNumber || '');
      const poNum = String(g?.purchaseOrder?.poNumber || '');
      const vName =
        typeof g?.purchaseOrder?.vendor === 'object' && g?.purchaseOrder?.vendor?.name
          ? String(g.purchaseOrder.vendor.name)
          : '';
      return (
        gNum.toLowerCase().includes(q) ||
        poNum.toLowerCase().includes(q) ||
        vName.toLowerCase().includes(q)
      );
    });
  }, [grns, search]);

  // Eligible Approved POs for GRN creation
  const approvedOrders = useMemo(() => {
    return poList.filter((po) => {
      const s = String(po?.status || '').toUpperCase();
      return (
        s === 'APPROVED' ||
        s === 'CONFIRMED' ||
        s === 'SENT_TO_VENDOR' ||
        s === 'PROCESSING' ||
        s === 'SHIPPED' ||
        s === 'GRN_RECEIVED'
      );
    });
  }, [poList]);

  // KPIs
  const kpis = useMemo(() => {
    return {
      totalOrders: approvedOrders.length,
      recordedGrns: grns.length,
      pendingGrns: Math.max(0, approvedOrders.length - grns.length),
    };
  }, [approvedOrders, grns]);

  return (
    <PageFrame>
      <PageLead
        title="My Invoices & Dispatches 📦"
        description="View all purchase orders, generate dispatch notes, and manage received delivery notes."
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          role="button"
          tabIndex={0}
          aria-pressed={kpiFilter === 'ALL'}
          className={cn(
            'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            kpiFilter === 'ALL' && 'border-primary/40 ring-2 ring-primary/10'
          )}
          onClick={() => setKpiFilter('ALL')}
          icon={ShoppingCart}
          label="Total Approved Orders"
          value={kpis.totalOrders}
          detail="Click to view all approved orders"
          tone="primary"
        />
        <MetricCard
          role="button"
          tabIndex={0}
          aria-pressed={kpiFilter === 'PENDING'}
          className={cn(
            'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            kpiFilter === 'PENDING' && 'border-amber-500/40 ring-2 ring-amber-500/10'
          )}
          onClick={() => setKpiFilter('PENDING')}
          icon={Truck}
          label="Orders Pending Dispatch"
          value={kpis.pendingGrns}
          detail="Click to view orders pending dispatch note"
          tone="warning"
        />
        <MetricCard
          role="button"
          tabIndex={0}
          aria-pressed={kpiFilter === 'GRN'}
          className={cn(
            'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            kpiFilter === 'GRN' && 'border-emerald-500/40 ring-2 ring-emerald-500/10'
          )}
          onClick={() => setKpiFilter('GRN')}
          icon={PackageCheck}
          label="Recorded Dispatches"
          value={kpis.recordedGrns}
          detail="Click to view recorded dispatch notes"
          tone="success"
        />
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-10 pr-10"
            type="text"
            placeholder={
              kpiFilter === 'GRN'
                ? 'Search across recorded dispatch notes by dispatch note number, PO number, or supplier...'
                : 'Search across all approved orders by PO number or supplier name...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
      </Card>

      {kpiFilter !== 'GRN' ? (
        <Card className="overflow-hidden">
          {poLoading ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
              Loading Purchase Orders…
            </div>
          ) : filteredPOs.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={kpiFilter === 'PENDING' ? 'No Orders Pending Dispatch Note' : 'No Purchase Orders Found'}
              description={search ? 'Try adjusting your search query.' : 'Once purchase orders are generated, they will appear here.'}
              action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/55 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">PO Number</th>
                    <th className="px-4 py-3">Supplier / Vendor</th>
                    <th className="px-4 py-3 font-right">Total Value</th>
                    <th className="px-4 py-3">Order Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredPOs.map((po) => {
                    const poNum = String(po?.poNumber || '');
                    const vName =
                      typeof po?.vendor === 'object' && po?.vendor?.name
                        ? String(po.vendor.name)
                        : typeof po?.vendor === 'string'
                        ? po.vendor
                        : 'Supplier';
                    const statusStr = String(po?.status || 'APPROVED');
                    return (
                      <tr key={String(po.id)} className="transition-colors hover:bg-accent/35">
                        <td className="px-4 py-3.5 font-bold text-primary">{poNum}</td>
                        <td className="px-4 py-3.5 font-medium">{vName}</td>
                        <td className="px-4 py-3.5 font-semibold tabular-nums">{formatAmount(po.totalAmount, companyDefaultCurrency)}</td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(po.createdAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="px-4 py-3.5">
                          <Badge tone="info">{statusStr}</Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!canCreateGRN}
                              onClick={() => canCreateGRN && navigate(`/procurement/create-grn?poId=${po.id}`)}
                              title={!canCreateGRN ? 'You do not have permission to generate dispatch notes.' : undefined}
                            >
                              <Truck className="size-3.5" /> Generate Dispatch Note
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!canCreateInvoice}
                              onClick={() => canCreateInvoice && navigate(`/procurement/create-purchase-invoice?poId=${po.id}`)}
                              title={!canCreateInvoice ? 'You do not have permission to create purchase invoices.' : undefined}
                            >
                              <Receipt className="size-3.5" /> Create Invoice
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {grnLoading ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
              Loading Dispatch Notes…
            </div>
          ) : filteredGRNs.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="No Dispatch Notes Recorded Yet"
              description="Click 'Total Approved Orders' card above to select an order and generate a dispatch note."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/55 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Dispatch Note Number</th>
                    <th className="px-4 py-3">Linked PO Number</th>
                    <th className="px-4 py-3">Supplier / Vendor</th>
                    <th className="px-4 py-3">Received Date</th>
                    <th className="px-4 py-3">Items Count</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredGRNs.map((grn) => {
                    const poNum = String(grn.purchaseOrder?.poNumber || '').toLowerCase();
                    const poId = String(grn.poId || grn.purchaseOrder?.id || '').toLowerCase();
                    const grnNum = String(grn.grnNumber || '').toLowerCase();
                    const grnId = String(grn.id || '').toLowerCase();

                    const poObj = poList.find(
                      (p) => String(p.id) === String(grn.poId) || String(p.poNumber) === String(grn.purchaseOrder?.poNumber)
                    );
                    const isPoInvoiced = poObj && (poObj.status === 'INVOICED' || poObj.status === 'CLOSED');

                    const isInvoiced =
                      isPoInvoiced ||
                      (poNum && invoicedPoNumbers.has(poNum)) ||
                      (poId && invoicedPoNumbers.has(poId)) ||
                      (grnNum && invoicedPoNumbers.has(grnNum)) ||
                      (grnId && invoicedPoNumbers.has(grnId));

                    return (
                      <tr key={grn.id} className="transition-colors hover:bg-accent/35">
                        <td className="px-4 py-3.5 font-bold text-primary">{grn.grnNumber}</td>
                        <td className="px-4 py-3.5 font-medium">{grn.purchaseOrder?.poNumber || '—'}</td>
                        <td className="px-4 py-3.5">{grn.purchaseOrder?.vendor?.name || 'Supplier'}</td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(grn.receivedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="px-4 py-3.5">{grn.items?.length || 0} line item(s)</td>
                        <td className="px-4 py-3.5">
                          {isInvoiced ? (
                            <Badge tone="success">
                              <CheckCircle2 className="size-3" /> INVOICED
                            </Badge>
                          ) : (
                            <Badge tone="info">RECEIVED</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedGrn(grn)}
                            >
                              <Eye className="size-3.5" /> View Details
                            </Button>
                            {isInvoiced ? (
                              <Button variant="outline" size="sm" disabled>
                                <CheckCircle2 className="size-3.5" /> Invoice Sent
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                disabled={!canCreateInvoice}
                                onClick={() => {
                                  if (!canCreateInvoice) return;
                                  const targetPo = grn.purchaseOrder?.poNumber || grn.poId || grn.purchaseOrder?.id;
                                  const targetGrn = grn.grnNumber || grn.id;
                                  navigate(`/procurement/create-purchase-invoice?poId=${targetPo}&grnId=${targetGrn}`);
                                }}
                                title={!canCreateInvoice ? 'You do not have permission to create purchase invoices.' : undefined}
                              >
                                <Receipt className="size-3.5" /> Create Invoice <ArrowRight className="size-3" />
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
          )}
        </Card>
      )}

      {/* Details Modal */}
      <Dialog open={!!selectedGrn} onOpenChange={(open) => { if (!open) setSelectedGrn(null); }}>
        {selectedGrn && (
          <DialogContent className="max-w-2xl">
            <DialogHeader className="pr-10">
              <DialogTitle>{selectedGrn.grnNumber}</DialogTitle>
              <DialogDescription>
                Linked PO: {selectedGrn.purchaseOrder?.poNumber} | Supplier: {selectedGrn.purchaseOrder?.vendor?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Received Items Breakdown</h4>
              <div className="overflow-hidden rounded-xl border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/70 bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Item Name</th>
                      <th className="px-3 py-2">Ordered Qty</th>
                      <th className="px-3 py-2">Received Qty</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {selectedGrn.items?.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2.5 font-medium">{it.itemName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{it.orderedQty}</td>
                        <td className="px-3 py-2.5 font-bold text-primary">{it.receivedQty}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{it.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedGrn.notes && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs">
                  <span className="font-semibold text-foreground">Notes / Remarks:</span>
                  <p className="mt-1 text-muted-foreground">{selectedGrn.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setSelectedGrn(null)}>
                Close
              </Button>
              {(() => {
                const safeStr = (v: any) => {
                  if (!v) return '';
                  if (typeof v === 'string') return v;
                  if (typeof v === 'number') return String(v);
                  if (typeof v === 'object') return v.$oid || v._id || v.id || v.poNumber || v.grnNumber || '';
                  return '';
                };

                const poNum = safeStr(selectedGrn.purchaseOrder?.poNumber).toLowerCase();
                const poId = safeStr(selectedGrn.poId || selectedGrn.purchaseOrder?.id).toLowerCase();
                const grnNum = safeStr(selectedGrn.grnNumber).toLowerCase();
                const grnId = safeStr(selectedGrn.id).toLowerCase();

                const targetSelectedPoId = safeStr(selectedGrn.poId);
                const targetSelectedPoNum = safeStr(selectedGrn.purchaseOrder?.poNumber);
                const poObj = poList.find((p) => {
                  const pId = safeStr(p.id);
                  const pNum = safeStr(p.poNumber);
                  return (pId && pId === targetSelectedPoId) || (pNum && pNum === targetSelectedPoNum);
                });
                const isPoInvoiced = poObj && (poObj.status === 'INVOICED' || poObj.status === 'CLOSED');

                const isModalGrnInvoiced =
                  isPoInvoiced ||
                  (poNum && invoicedPoNumbers.has(poNum)) ||
                  (poId && invoicedPoNumbers.has(poId)) ||
                  (grnNum && invoicedPoNumbers.has(grnNum)) ||
                  (grnId && invoicedPoNumbers.has(grnId));

                if (isModalGrnInvoiced) {
                  return (
                    <Button variant="outline" disabled>
                      <CheckCircle2 className="size-4" /> Invoice Sent for this Dispatch Note
                    </Button>
                  );
                }

                return (
                  <Button
                    onClick={() => {
                      const targetPo = selectedGrn.purchaseOrder?.poNumber || selectedGrn.poId || selectedGrn.purchaseOrder?.id;
                      const targetGrn = selectedGrn.grnNumber || selectedGrn.id;
                      setSelectedGrn(null);
                      navigate(`/procurement/create-purchase-invoice?poId=${targetPo}&grnId=${targetGrn}`);
                    }}
                  >
                    <Receipt className="size-4" /> Create Purchase Invoice
                  </Button>
                );
              })()}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
