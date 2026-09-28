import LandingTable, { type LandingColumn } from '../../components/shared/LandingTable';
import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Package, Search, Truck, X, XCircle } from 'lucide-react';
import { CurrencySelector, useCurrency } from '@/components/shared/CurrencyMaster';
import { RecordStatusBadge } from '@/components/shared/RecordStatusBadge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '@/components/ui/product';
import { VendorOrderDetails } from '@/components/vendor/VendorOrderDetails';
import { orderState, selectOrders, type OrderFilter, type OrderSort } from '@/components/vendor/orderPresentation';
import { quoteDate } from '@/components/vendor/quotationFormatting';
import { useServiceData } from '@/hooks/useServiceData';
import { cn } from '@/lib/utils';
import type { VendorOrderMock } from '@/mocks/vendorPortal.mock';
import { vendorPortalService } from '@/services/vendorPortalService';
import { DetailSkeleton, TableSkeleton } from '@/components/shared/Skeleton';
import './vendor-order-workspace.css';

export default function VendorOrdersPage() {
  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();
  const { data: orders, loading, error } = useServiceData(() => vendorPortalService.listOrders(), [] as VendorOrderMock[]);
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const filterParam = params.get('filter');
  const filter: OrderFilter = filterParam === 'ACTIVE' || filterParam === 'RECEIVED' || filterParam === 'CANCELLED' ? filterParam : null;
  const sortParam = params.get('sort');
  const sort: OrderSort = sortParam === 'delivery' || sortParam === 'value' ? sortParam : 'newest';
  const currency = params.get('currency') || companyDefaultCurrency;
  const selectedId = params.get('order');
  const previousSelection = useRef<string | null>(null);
  const detailHeading = useRef<HTMLDivElement>(null);
  const selectedOrder = orders.find(order => String(order.id) === selectedId);
  const summary = useMemo(() => ({
    total: orders.length,
    active: orders.filter(order => orderState(order.status).active).length,
    received: orders.filter(order => orderState(order.status).received).length,
    cancelled: orders.filter(order => orderState(order.status).cancelled).length,
  }), [orders]);
  const filtered = useMemo(() => selectOrders(orders, search, filter, sort, order => convert(order.totalAmount, order.currency || companyDefaultCurrency, currency)), [orders, search, filter, sort, convert, companyDefaultCurrency, currency]);
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const parsedPage = Number(params.get('page') || 1);
  const page = Number.isFinite(parsedPage) ? Math.min(pages, Math.max(1, Math.floor(parsedPage))) : 1;
  const visibleOrders = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedIndex = filtered.findIndex(order => String(order.id) === selectedId);
  const amount = (order: VendorOrderMock) => formatAmount(convert(order.totalAmount, order.currency || companyDefaultCurrency, currency), currency);

  const updateParams = (values: Record<string, string | null>, replace = true) => setParams(current => {
    const next = new URLSearchParams(current);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    return next;
  }, { replace });
  const detailUrl = (order: VendorOrderMock) => {
    const next = new URLSearchParams(params);
    next.set('order', String(order.id));
    return `?${next.toString()}`;
  };

  useEffect(() => {
    if (loading) return;
    if (selectedId) {
      detailHeading.current?.focus();
    } else if (previousSelection.current) {
      document.getElementById(`view-order-${previousSelection.current}`)?.focus();
    }
    previousSelection.current = selectedId;
  }, [selectedId, loading]);

  return <PageFrame className="order-workspace">
    {error && <Card className="mb-4 border-destructive/25 p-4 text-sm text-destructive">{error}</Card>}
    {selectedId ? <>
      <div ref={detailHeading} tabIndex={-1} className="order-detail-focus" aria-label={selectedOrder ? `Order ${selectedOrder.poNumber}` : 'Order details'}>
        {loading ? <DetailSkeleton />
          : selectedOrder ? <VendorOrderDetails key={selectedOrder.id} order={selectedOrder} currency={currency}
            onCurrencyChange={value => updateParams({ currency: value })}
            onBack={() => updateParams({ order: null })}
            position={selectedIndex >= 0 ? `${selectedIndex + 1} of ${filtered.length} orders` : undefined}
            onPrevious={selectedIndex > 0 ? () => updateParams({ order: String(filtered[selectedIndex - 1].id) }) : undefined}
            onNext={selectedIndex >= 0 && selectedIndex < filtered.length - 1 ? () => updateParams({ order: String(filtered[selectedIndex + 1].id) }) : undefined} />
            : <EmptyState icon={Package} title="Order not available" description="This order is not in your current order list." action={<Button variant="outline" onClick={() => updateParams({ order: null })}>Back to orders</Button>} />}
      </div>
    </> : <>
      <PageLead title="My Orders" description="Track fulfilment milestones, delivery schedules, and purchase-order details." />
      <div className="order-metrics mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Package, tone: 'primary' as const, value: summary.total, label: 'Total Orders', detail: 'All time', filter: null },
          { icon: Truck, tone: 'warning' as const, value: summary.active, label: 'Active Orders', detail: 'In progress', filter: 'ACTIVE' as const },
          { icon: CheckCircle2, tone: 'success' as const, value: summary.received, label: 'Received / Completed', detail: 'Receipt recorded or delivered', filter: 'RECEIVED' as const },
          { icon: XCircle, tone: 'danger' as const, value: summary.cancelled, label: 'Cancelled', detail: 'Cancelled or rejected', filter: 'CANCELLED' as const },
        ].map(metric => <MetricCard key={metric.label} icon={metric.icon} tone={metric.tone} value={metric.value} label={metric.label} detail={metric.detail} className={cn('cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50', filter === metric.filter && 'border-primary/45 bg-primary/[0.08] dark:bg-primary/20')}
          onClick={() => updateParams({ filter: filter === metric.filter ? null : metric.filter, page: null })} role="button" tabIndex={0} aria-pressed={filter === metric.filter}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); updateParams({ filter: filter === metric.filter ? null : metric.filter, page: null }); } }} />)}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-10 pr-10" aria-label="Search orders" placeholder="Search by PO number, RFQ number, buyer, or item…" value={search} onChange={event => updateParams({ q: event.target.value, page: null })} />
          {search && <Button variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" aria-label="Clear order search" onClick={() => updateParams({ q: null, page: null })}><X className="size-4" /></Button>}
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="order-sort" className="text-xs text-muted-foreground">Sort by</label>
          <Select id="order-sort" className="h-9 w-44" value={sort} onChange={event => updateParams({ sort: event.target.value, page: null })}><option value="newest">Newest first</option><option value="delivery">Delivery date</option><option value="value">Highest value</option></Select>
          <CurrencySelector value={currency} onChange={value => updateParams({ currency: value })} size="sm" />
        </div>
      </div>
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground"><span role="status">{loading ? 'Loading orders…' : `${filtered.length} of ${orders.length} orders`}</span>{(search || filter) && <Button variant="ghost" size="sm" onClick={() => updateParams({ q: null, filter: null, page: null })}>Clear filters</Button>}</div>
      {loading ? <TableSkeleton rows={5} columnWidths={['23%', '14%', '16%', '15%', '14%', '18%']} />
        : filtered.length === 0 ? <EmptyState icon={Package} title="No orders found" description={search || filter ? 'No orders match the current search and status filter.' : 'Issued purchase orders will appear here once created.'} action={search || filter ? <Button variant="outline" size="sm" onClick={() => updateParams({ q: null, filter: null, page: null })}>Show all orders</Button> : undefined} />
          : <Card className="overflow-hidden">
            <div className="order-register-scroll" role="region" aria-label="Purchase orders" tabIndex={0}>
              <LandingTable key="vendor-orders" preferenceKey="vendor-orders" columns={VENDOR_ORDERS_COLUMNS} className="order-register w-full text-left text-sm">
                <caption className="sr-only">Compare purchase orders, delivery dates and values. View an order for full details.</caption>
                <colgroup><col style={{width:'23%'}} /><col style={{width:'14%'}} /><col style={{width:'16%'}} /><col style={{width:'15%'}} /><col style={{width:'14%'}} /><col style={{width:'18%'}} /></colgroup>
                <thead><tr className="text-xs text-muted-foreground"><th scope="col">Purchase order</th><th scope="col">Buyer / Ordered</th><th scope="col">Status</th><th scope="col">Items / Delivery</th><th scope="col" className="text-right">Order value</th><th scope="col" className="text-right">Actions</th></tr></thead>
                <tbody>{visibleOrders.map(order => <tr key={order.id}>
                  <td><Link to={detailUrl(order)} className="order-number font-bold text-base">{order.poNumber}</Link><div className="mt-1 break-words font-mono text-xs text-muted-foreground">{order.rfqNumber || 'No RFQ reference'}</div></td>
                  <td><div className="font-semibold break-words">{order.buyerCompany || order.buyerName || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{quoteDate(order.orderDate)}</div></td>
                  <td><RecordStatusBadge kind="order" status={order.status} /></td>
                  <td><div>{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</div><div className="mt-1 text-xs text-muted-foreground" title="Expected delivery">{quoteDate(order.expectedDelivery)}</div></td>
                  <td className="text-right font-bold text-lg tabular-nums whitespace-nowrap">{amount(order)}</td>
                  <td className="text-right"><Link id={`view-order-${order.id}`} aria-label={`View order ${order.poNumber}`} to={detailUrl(order)} className={buttonVariants({ variant: 'outline', size: 'sm' })}><Eye className="size-3.5" />View order</Link></td>
                </tr>)}</tbody>
              </LandingTable>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs text-muted-foreground">
              <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}><ChevronLeft className="size-4" />Previous</Button><span>Page {page} of {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => updateParams({ page: String(page + 1) })}>Next<ChevronRight className="size-4" /></Button></div>
            </div>
          </Card>}
    </>}
  </PageFrame>;
}

const VENDOR_ORDERS_COLUMNS: LandingColumn[] = [
  { key: 'order', label: 'Purchase order', defaultVisible: true, required: true },
  { key: 'buyer', label: 'Buyer / Ordered', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
  { key: 'delivery', label: 'Items / Delivery', defaultVisible: true },
  { key: 'value', label: 'Order value', defaultVisible: true },
  { key: 'actions', label: 'Actions', defaultVisible: true, pinned: 'end' },
];
