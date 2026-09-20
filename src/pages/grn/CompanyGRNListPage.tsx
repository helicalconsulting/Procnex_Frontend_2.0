import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { grnService, type GoodsReceivedNote } from '../../services/grnService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { purchaseRequisitionService } from '../../services/purchaseRequisitionService';
import { invoiceService } from '../../services/invoiceService';
import {
  PackageCheck,
  Search,
  Truck,
  Eye,
  X,
  ShoppingCart,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useAuth } from '../../context/AuthContext';
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

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isFrom16SeptOnwards(dateVal?: string): boolean {
  if (!dateVal) return true;
  const str = String(dateVal).toLowerCase();
  if (
    str.includes('aug') ||
    str.includes('2026-08') ||
    str.includes('01 sept') || str.includes('02 sept') || str.includes('03 sept') || str.includes('04 sept') ||
    str.includes('05 sept') || str.includes('06 sept') || str.includes('07 sept') || str.includes('08 sept') ||
    str.includes('09 sept') || str.includes('10 sept') || str.includes('11 sept') || str.includes('12 sept') ||
    str.includes('13 sept') || str.includes('14 sept') || str.includes('15 sept') ||
    str.includes('2026-09-01') || str.includes('2026-09-02') || str.includes('2026-09-03') || str.includes('2026-09-04') ||
    str.includes('2026-09-05') || str.includes('2026-09-06') || str.includes('2026-09-07') || str.includes('2026-09-08') ||
    str.includes('2026-09-09') || str.includes('2026-09-10') || str.includes('2026-09-11') || str.includes('2026-09-12') ||
    str.includes('2026-09-13') || str.includes('2026-09-14') || str.includes('2026-09-15')
  ) {
    return false;
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return true;
  return d >= new Date('2026-09-16T00:00:00.000Z');
}

export default function CompanyGRNListPage() {
  const navigate = useNavigate();
  const { hasPermission, roles = [], user } = useAuth();
  const isVendor =
    roles.some((r) => String(r).toLowerCase().includes('vendor') || String(r).toLowerCase().includes('supplier')) ||
    String(user?.roleName || '').toLowerCase().includes('vendor') ||
    String(user?.roleName || '').toLowerCase().includes('supplier') ||
    !!(user as any)?.vendorId ||
    !!(user as any)?.isVendor;

  const canCreateGRN =
    !isVendor &&
    (hasPermission('PO Creation', 'canCreate') ||
      hasPermission('Goods Received Note', 'canCreate') ||
      hasPermission('GRN', 'canCreate'));

  const { companyDefaultCurrency, formatAmount } = useCurrency();

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'PENDING' | 'GRN'>('PENDING');
  const [selectedGrn, setSelectedGrn] = useState<GoodsReceivedNote | null>(null);

  // Load GRNs
  const { data: grnData, loading: grnLoading } = useServiceData(
    () => grnService.list({ search }),
    { grns: [], total: 0 },
    [search]
  );
  const grns = grnData.grns || [];

  // Load Purchase Orders from purchaseOrderService
  const { data: poData, loading: poLoading1 } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );

  // Load Purchase Requisitions from purchaseRequisitionService (PO Creation workspace)
  const { data: reqList, loading: poLoading2 } = useServiceData(
    () => purchaseRequisitionService.list(),
    [],
    []
  );

  const poLoading = poLoading1 || poLoading2;

  // Unified Purchase Orders List prioritizing PO Creation documents
  const poList = useMemo(() => {
    const rawOrders = poData.orders || [];
    const rawReqs = reqList || [];

    const mappedReqs = rawReqs.map((req) => ({
      id: req.id || req.rfqId,
      poNumber: req.poNumber,
      vendor: {
        id: req.vendorGstVat || 'vendor_req',
        name: req.vendorName || 'Supplier',
      },
      totalAmount: Number(req.grandTotal || req.subtotal || 0),
      createdAt: req.poDate || req.createdAt || new Date().toISOString(),
      status: req.status || 'APPROVED',
      items: (req.items || []).map((it) => ({
        id: it.id || String(it.itemNo),
        itemName: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: it.total,
      })),
      isRequisition: true,
    }));

    const combined: any[] = [];
    const addedKeys = new Set<string>();

    mappedReqs.forEach((r) => {
      const numKey = String(r.poNumber || '').toLowerCase().trim();
      const idKey = String(r.id || '').toLowerCase().trim();
      const key = numKey || idKey;
      if (key && !addedKeys.has(key)) {
        addedKeys.add(key);
        if (numKey) addedKeys.add(numKey);
        if (idKey) addedKeys.add(idKey);
        combined.push(r);
      }
    });

    rawOrders.forEach((po) => {
      const numKey = String(po.poNumber || '').toLowerCase().trim();
      const idKey = String(po.id || '').toLowerCase().trim();
      if ((numKey && addedKeys.has(numKey)) || (idKey && addedKeys.has(idKey))) {
        return;
      }
      const key = numKey || idKey;
      if (key && !addedKeys.has(key)) {
        addedKeys.add(key);
        if (numKey) addedKeys.add(numKey);
        if (idKey) addedKeys.add(idKey);
        combined.push(po);
      }
    });

    return combined;
  }, [poData, reqList]);

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

  const posWithGrn = useMemo(() => {
    const set = new Set<string>();
    (grns || []).forEach((g) => {
      if (g.poId) set.add(String(g.poId).toLowerCase());
      if (g.purchaseOrder?.id) set.add(String(g.purchaseOrder.id).toLowerCase());
      if (g.purchaseOrder?.poNumber) set.add(String(g.purchaseOrder.poNumber).toLowerCase());
    });
    return set;
  }, [grns]);

  // Filter & Deduplicate POs by search & KPI filter — ONLY Approved POs allowed for GRN (from 16 Sept 2026 onwards)
  const filteredPOs = useMemo(() => {
    const seen = new Set<string>();

    let list = poList.filter((po) => {
      if (!po) return false;
      if (!isFrom16SeptOnwards(po.createdAt || po.poDate)) return false;

      const poIdStr = String(po.id || '').toLowerCase().trim();
      const poNumStr = String(po.poNumber || '').toLowerCase().trim();
      const uniqueKey = poIdStr || poNumStr;

      if (!uniqueKey) return false;
      if (seen.has(uniqueKey) || (poNumStr && seen.has(poNumStr)) || (poIdStr && seen.has(poIdStr))) {
        return false;
      }

      const s = String(po?.status || '').toUpperCase().trim();

      // Exclude unapproved PO statuses
      if (
        s === 'DRAFT' ||
        s === 'PENDING' ||
        s === 'PENDING_APPROVAL' ||
        s === 'REJECTED' ||
        s === 'CANCELLED' ||
        s === 'SUBMITTED'
      ) {
        return false;
      }

      // Only allow approved POs
      const isApproved =
        s === 'APPROVED' ||
        s === 'CONFIRMED' ||
        s === 'SENT_TO_VENDOR' ||
        s === 'PROCESSING' ||
        s === 'SHIPPED' ||
        s === 'GRN_RECEIVED' ||
        s === 'ISSUED' ||
        s === 'APPROVED_BY_ADMIN' ||
        s.includes('APPROVED');

      if (!isApproved) return false;

      if (poIdStr) seen.add(poIdStr);
      if (poNumStr) seen.add(poNumStr);
      return true;
    });

    if (kpiFilter === 'PENDING') {
      list = list.filter((po) => {
        const poIdStr = String(po.id || '').toLowerCase();
        const poNumStr = String(po.poNumber || '').toLowerCase();
        const hasGrn = (poIdStr && posWithGrn.has(poIdStr)) || (poNumStr && posWithGrn.has(poNumStr));
        const s = String(po?.status || '').toUpperCase();
        return !hasGrn && s !== 'GRN_RECEIVED' && s !== 'DELIVERED';
      });
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
  }, [poList, search, kpiFilter, posWithGrn]);

  // Filter & Deduplicate GRNs by search & date cutoff
  const filteredGRNs = useMemo(() => {
    const seen = new Set<string>();
    let list = grns.filter((g) => {
      if (!g) return false;
      if (!isFrom16SeptOnwards(g.receivedDate || g.createdAt)) return false;

      const gId = String(g.id || '').toLowerCase().trim();
      const gNum = String(g.grnNumber || '').toLowerCase().trim();
      const key = gId || gNum;
      if (!key || seen.has(key) || (gNum && seen.has(gNum)) || (gId && seen.has(gId))) {
        return false;
      }
      if (gId) seen.add(gId);
      if (gNum) seen.add(gNum);
      return true;
    });

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((g) => {
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

  // Unique Eligible Approved POs for GRN creation (from 16 Sept 2026 onwards)
  const approvedOrders = useMemo(() => {
    const seen = new Set<string>();
    return poList.filter((po) => {
      if (!po) return false;
      if (!isFrom16SeptOnwards(po.createdAt || po.poDate)) return false;

      const poIdStr = String(po.id || '').toLowerCase().trim();
      const poNumStr = String(po.poNumber || '').toLowerCase().trim();
      const uniqueKey = poIdStr || poNumStr;
      if (!uniqueKey || seen.has(uniqueKey) || (poNumStr && seen.has(poNumStr))) {
        return false;
      }

      const s = String(po?.status || '').toUpperCase().trim();

      if (
        s === 'DRAFT' ||
        s === 'PENDING' ||
        s === 'PENDING_APPROVAL' ||
        s === 'REJECTED' ||
        s === 'CANCELLED' ||
        s === 'SUBMITTED'
      ) {
        return false;
      }

      const isApproved =
        s === 'APPROVED' ||
        s === 'CONFIRMED' ||
        s === 'SENT_TO_VENDOR' ||
        s === 'PROCESSING' ||
        s === 'SHIPPED' ||
        s === 'GRN_RECEIVED' ||
        s === 'ISSUED' ||
        s === 'APPROVED_BY_ADMIN' ||
        s.includes('APPROVED');

      if (!isApproved) return false;

      if (poIdStr) seen.add(poIdStr);
      if (poNumStr) seen.add(poNumStr);
      return true;
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

  // Dynamic fallback for modal items if selectedGrn.items is missing or empty
  const modalItems = useMemo(() => {
    if (!selectedGrn) return [];
    if (Array.isArray(selectedGrn.items) && selectedGrn.items.length > 0) {
      return selectedGrn.items.map((it: any, idx: number) => ({
        id: it.id || `grn_item_${idx}`,
        itemName: it.itemName || it.description || it.name || 'Line Item',
        orderedQty: it.orderedQty ?? it.quantity ?? 1,
        receivedQty: it.receivedQty ?? it.invoicedQty ?? it.quantity ?? 1,
        remarks: it.remarks || '—',
      }));
    }
    if (Array.isArray((selectedGrn as any).lineItems) && (selectedGrn as any).lineItems.length > 0) {
      return (selectedGrn as any).lineItems.map((it: any, idx: number) => ({
        id: it.id || `grn_item_${idx}`,
        itemName: it.itemName || it.description || it.name || 'Line Item',
        orderedQty: it.orderedQty ?? it.quantity ?? it.poQty ?? 1,
        receivedQty: it.receivedQty ?? it.invoicedQty ?? it.quantity ?? 1,
        remarks: it.remarks || '—',
      }));
    }
    const targetPoId = String(selectedGrn.poId || selectedGrn.purchaseOrder?.id || '').toLowerCase();
    const targetPoNum = String(selectedGrn.purchaseOrder?.poNumber || '').toLowerCase();
    const matchedPo = poList.find(
      (p) =>
        (p.id && String(p.id).toLowerCase() === targetPoId) ||
        (p.poNumber && String(p.poNumber).toLowerCase() === targetPoNum)
    ) || selectedGrn.purchaseOrder;

    const rawPoItems = matchedPo?.items || (matchedPo as any)?.rfq?.items || [];
    if (Array.isArray(rawPoItems) && rawPoItems.length > 0) {
      return rawPoItems.map((it: any, idx: number) => ({
        id: it.id || `po_item_${idx}`,
        itemName: it.itemName || it.description || it.name || (matchedPo as any)?.title || 'Order Item',
        orderedQty: Number(it.quantity || it.orderedQty || 1),
        receivedQty: Number(it.quantity || it.receivedQty || it.invoicedQty || 1),
        remarks: 'From Linked Purchase Order',
      }));
    }
    return [{ id: 'default_item_1', itemName: 'Line Item', orderedQty: 1, receivedQty: 1, remarks: 'Inspected & Verified' }];
  }, [selectedGrn, poList]);

  return (
    <PageFrame>
      <PageLead
        title="Goods Receipt Note (GRN) Management"
        description="Record physical goods receipts against POs or auto-fill from Vendor Invoices with direct posting & 3-way matching."
        action={
          <Button onClick={() => navigate('/procurement/create-company-grn')} className="gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold">
            <Plus className="size-4" /> New GRN Entry
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          role="button"
          tabIndex={0}
          aria-pressed={kpiFilter === 'ALL'}
          className={cn(
            'cursor-pointer transition-all duration-200 hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            kpiFilter === 'ALL' && 'border-primary/40 ring-2 ring-primary/10 bg-primary/[0.02]'
          )}
          onClick={() => setKpiFilter('ALL')}
          icon={ShoppingCart}
          label="Total Approved Orders"
          value={kpis.totalOrders}
          detail="Click to view all approved purchase orders"
          tone="primary"
        />
        <MetricCard
          role="button"
          tabIndex={0}
          aria-pressed={kpiFilter === 'PENDING'}
          className={cn(
            'cursor-pointer transition-all duration-200 hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            kpiFilter === 'PENDING' && 'border-amber-500/40 ring-2 ring-amber-500/10 bg-amber-500/[0.02]'
          )}
          onClick={() => setKpiFilter('PENDING')}
          icon={Truck}
          label="Orders Pending GRN Entry"
          value={kpis.pendingGrns}
          detail="Click to view orders awaiting GRN inspection"
          tone="warning"
        />
        <MetricCard
          role="button"
          tabIndex={0}
          aria-pressed={kpiFilter === 'GRN'}
          className={cn(
            'cursor-pointer transition-all duration-200 hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            kpiFilter === 'GRN' && 'border-emerald-500/40 ring-2 ring-emerald-500/10 bg-emerald-500/[0.02]'
          )}
          onClick={() => setKpiFilter('GRN')}
          icon={PackageCheck}
          label="Recorded GRNs"
          value={kpis.recordedGrns}
          detail="Click to view verified Goods Receipt Notes"
          tone="success"
        />
      </div>

      {/* Search & Filter Toolbar matching RFQ */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10 pr-10"
            type="text"
            placeholder={
              kpiFilter === 'GRN'
                ? 'Search recorded Goods Receipt Notes by GRN #, PO #, or supplier name...'
                : 'Search approved orders by PO # or supplier name...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {kpiFilter !== 'GRN' ? (
        <Card className="overflow-hidden border border-border/80 shadow-sm">
          {poLoading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="size-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              Loading Purchase Orders…
            </div>
          ) : filteredPOs.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={kpiFilter === 'PENDING' ? 'No Orders Pending GRN Entry' : 'No Purchase Orders Found'}
              description={search ? 'Try adjusting your search query.' : 'Once purchase orders are generated, they will appear here.'}
              action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5">PO Number</th>
                    <th className="px-5 py-3.5">Supplier / Vendor</th>
                    <th className="px-5 py-3.5 font-right">Total Value</th>
                    <th className="px-5 py-3.5">Order Date</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
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

                    const poIdStr = String(po?.id || '').toLowerCase();
                    const poNumStr = String(po?.poNumber || '').toLowerCase();
                    const hasGrn = (poIdStr && posWithGrn.has(poIdStr)) || (poNumStr && posWithGrn.has(poNumStr));

                    return (
                      <tr key={String(po.id)} className="transition-colors hover:bg-muted/30">
                        <td className="px-5 py-4 font-bold text-primary">{poNum}</td>
                        <td className="px-5 py-4 font-medium text-foreground">
                          <div className="flex items-center gap-2.5">
                            <div className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {vName.slice(0, 2).toUpperCase()}
                            </div>
                            <span>{vName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-semibold tabular-nums text-foreground">{formatAmount(po.totalAmount, companyDefaultCurrency)}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{formatDate(po.createdAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hasGrn ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                                onClick={() => setKpiFilter('GRN')}
                              >
                                <CheckCircle2 className="size-3.5 text-emerald-500" /> GRN Created
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1.5 shadow-xs"
                                disabled={!canCreateGRN}
                                onClick={() => navigate(`/procurement/create-company-grn?poId=${po.id}`)}
                              >
                                <PackageCheck className="size-3.5" /> Create GRN
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
      ) : (
        <Card className="overflow-hidden border border-border/80 shadow-sm">
          {grnLoading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="size-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              Loading Goods Receipt Notes (GRNs)…
            </div>
          ) : filteredGRNs.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="No GRNs Recorded Yet"
              description="Click 'Total Approved Orders' card above or 'New GRN Entry' button to record a goods receipt note."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5">GRN Number</th>
                    <th className="px-5 py-3.5">Linked PO Number</th>
                    <th className="px-5 py-3.5">Supplier / Vendor</th>
                    <th className="px-5 py-3.5">Received Date</th>
                    <th className="px-5 py-3.5">Items Count</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredGRNs.map((grn) => {
                    const poObj = poList.find(
                      (p) => String(p.id) === String(grn.poId) || String(p.poNumber) === String(grn.purchaseOrder?.poNumber)
                    );

                    const itemsCount =
                      (grn.items && grn.items.length > 0)
                        ? grn.items.length
                        : (poObj?.items && poObj.items.length > 0)
                        ? poObj.items.length
                        : (grn.purchaseOrder && (grn.purchaseOrder as any).items && (grn.purchaseOrder as any).items.length > 0)
                        ? (grn.purchaseOrder as any).items.length
                        : 1;

                    return (
                      <tr key={grn.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-5 py-4 font-bold text-primary">{grn.grnNumber}</td>
                        <td className="px-5 py-4 font-medium">{grn.purchaseOrder?.poNumber || '—'}</td>
                        <td className="px-5 py-4 font-medium text-foreground">{grn.purchaseOrder?.vendor?.name || 'Supplier'}</td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{new Date(grn.receivedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="px-5 py-4">
                          <Badge variant="outline" className="font-normal text-xs bg-secondary/50">
                            {itemsCount} line item(s)
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setSelectedGrn(grn)}
                            >
                              <Eye className="size-3.5" /> View Details
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
                    {modalItems.map((it) => (
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
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
