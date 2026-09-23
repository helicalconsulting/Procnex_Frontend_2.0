import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, Calendar, CheckCircle2, ChevronDown, Clock, Download, FileText,
  IndianRupee, MapPin, Package, Receipt, Search, Truck, XCircle,
} from 'lucide-react';
import { CurrencyBadge, CurrencySelector, useCurrency } from '@/components/shared/CurrencyMaster';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CollapsibleContent } from '@/components/ui/collapsible-content';
import { DataTableViewport } from '@/components/ui/data-table-viewport';
import { EmptyState, MetricCard, PageFrame, PageLead } from '@/components/ui/product';
import { useServiceData } from '@/hooks/useServiceData';
import { cn } from '@/lib/utils';
import type { VendorOrderMock } from '@/mocks/vendorPortal.mock';
import { vendorPortalService } from '@/services/vendorPortalService';
import { downloadPurchaseOrderAsPdf } from '@/utils/pdfDownload';

type OrderStatus = 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'APPROVED' | 'ISSUED' | 'SENT' | 'COMPLETED' | 'PENDING' | 'REJECTED';
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_CONFIG: Record<string, { label: string; tone: Tone; icon: typeof Truck }> = {
  CONFIRMED: { label: 'Confirmed', tone: 'primary', icon: CheckCircle2 },
  APPROVED: { label: 'Approved', tone: 'primary', icon: CheckCircle2 },
  ISSUED: { label: 'Issued', tone: 'info', icon: FileText },
  SENT: { label: 'Sent', tone: 'info', icon: Truck },
  PROCESSING: { label: 'Processing', tone: 'warning', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', tone: 'warning', icon: Clock },
  SHIPPED: { label: 'Shipped', tone: 'info', icon: Truck },
  DELIVERED: { label: 'Delivered', tone: 'success', icon: CheckCircle2 },
  COMPLETED: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: XCircle },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: XCircle },
  PENDING: { label: 'Pending', tone: 'neutral', icon: Clock },
};

const DEFAULT_STATUS_CONFIG = { label: 'Order', tone: 'neutral' as Tone, icon: Package };
const STEPS = ['Confirmed', 'Processing', 'Shipped', 'Delivered'];
const STATUS_INDEX: Record<string, number> = {
  CONFIRMED: 0,
  APPROVED: 0,
  ISSUED: 0,
  SENT: 0,
  PROCESSING: 1,
  IN_PROGRESS: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  COMPLETED: 3,
  CANCELLED: -1,
  REJECTED: -1,
};

function StatusBadge({ status }: { status?: string }) {
  const normalized = (status || '').toUpperCase().trim();
  const config = STATUS_CONFIG[normalized] || {
    label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Order',
    tone: 'neutral' as Tone,
    icon: Package,
  };
  const Icon = config.icon || Package;
  return <Badge tone={config.tone}><Icon className="size-3" />{config.label}</Badge>;
}

export default function VendorOrdersPage() {
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  const { data: orders, loading, error } = useServiceData(
    () => vendorPortalService.listOrders(), [] as VendorOrderMock[],
  );
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const summary = useMemo(() => ({
    total: orders.length,
    active: orders.filter((order) => ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'ISSUED', 'SENT', 'APPROVED', 'IN_PROGRESS'].includes((order.status || '').toUpperCase())).length,
    delivered: orders.filter((order) => ['DELIVERED', 'COMPLETED'].includes((order.status || '').toUpperCase())).length,
    cancelled: orders.filter((order) => ['CANCELLED', 'REJECTED'].includes((order.status || '').toUpperCase())).length,
  }), [orders]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) => [order.poNumber, order.rfqNumber, order.buyerName, ...order.items.map((item) => item.name)].some((field) => field.toLowerCase().includes(query)));
  }, [orders, search]);
  const amount = (value: number) => formatAmount(value, displayCurrency);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <PageFrame>
      <PageLead title="My Orders" description="Track fulfilment milestones and purchase-order details." actions={<CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />} />
      {error && <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">{error}</Card>}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Total orders" value={summary.total} detail="All time" icon={Package} aria-pressed={true} />
        <MetricCard label="Active orders" value={summary.active} detail="In progress" icon={Truck} tone="warning" />
        <MetricCard label="Delivered" value={summary.delivered} detail="Completed" icon={CheckCircle2} tone="success" />
        <MetricCard label="Cancelled" value={summary.cancelled} detail="All time" icon={XCircle} tone="danger" />
      </div>
      <Card className="mb-4 p-3 sm:p-4">
        <div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search PO, RFQ, buyer, or item" aria-label="Search orders" /></div>
      </Card>

      {loading ? (
        <Card className="grid min-h-64 place-items-center text-sm text-muted-foreground">Loading orders…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="No orders found" description={search ? 'Try another search term.' : 'Issued purchase orders will appear here.'} action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button> : undefined} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((order) => {
            const expanded = expandedOrder === order.id;
            const currentStep = STATUS_INDEX[order.status];
            return (
              <Card key={order.id} className={cn('overflow-hidden transition-shadow', expanded && 'shadow-md')}>
                <button type="button" className="flex w-full flex-col gap-3 p-4 text-left outline-none transition hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:flex-row sm:items-center sm:justify-between sm:p-5" onClick={() => setExpandedOrder(expanded ? null : order.id)} aria-expanded={expanded}>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2"><FileText className="size-4 text-primary" /><span className="font-semibold text-primary">{order.poNumber}</span><Badge>{order.rfqNumber}</Badge></span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{order.buyerCompany}</span><span>{order.items.length} item{order.items.length === 1 ? '' : 's'}</span><span className="flex items-center gap-1"><Calendar className="size-3" />{formatDate(order.orderDate)}</span></span>
                  </span>
                  <span className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end"><span className="font-semibold tabular-nums">{amount(order.totalAmount)}</span><StatusBadge status={order.status} /><ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} /></span>
                </button>

                <CollapsibleContent open={expanded} className="border-t border-border/65 bg-secondary/20 p-4 sm:p-5">
                    {order.status === 'CANCELLED' ? (
                      <div className="mb-5 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/8 p-3 text-sm font-medium text-destructive"><AlertCircle className="size-4" />This order was cancelled.</div>
                    ) : (
                      <ol className="mb-6 grid grid-cols-4 gap-1" aria-label="Order progress">
                        {STEPS.map((step, index) => {
                          const done = index <= currentStep;
                          return <li key={step} className="relative flex min-w-0 flex-col items-center text-center before:absolute before:left-[calc(50%+16px)] before:right-[calc(-50%+16px)] before:top-3 before:h-px before:bg-border last:before:hidden"><span className={cn('relative z-10 grid size-6 place-items-center rounded-full border bg-card', done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{done ? <CheckCircle2 className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span><span className={cn('mt-2 truncate text-[11px] font-medium sm:text-xs', done ? 'text-foreground' : 'text-muted-foreground')}>{step}</span></li>;
                        })}
                      </ol>
                    )}

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,.75fr)]">
                      <Card className="overflow-hidden border-border/60 shadow-none">
                        <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">Order items</div>
                        <DataTableViewport label={`Items in ${order.poNumber}`}>
                          <table className="w-full min-w-[560px] text-left text-xs">
                            <thead className="bg-secondary/45 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground"><tr><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5 text-right">Quantity</th><th className="px-4 py-2.5 text-right">Unit price</th><th className="px-4 py-2.5 text-right">Total</th></tr></thead>
                            <tbody className="divide-y divide-border/55">{order.items.map((item, index) => <tr key={`${item.name}-${index}`}><td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3 text-right">{item.quantity} {item.unit}</td><td className="px-4 py-3 text-right tabular-nums">{amount(item.unitPrice)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{amount(item.quantity * item.unitPrice)}</td></tr>)}</tbody>
                            <tfoot className="border-t border-border bg-secondary/45"><tr><td colSpan={3} className="px-4 py-3 text-right font-semibold">Grand total</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{amount(order.totalAmount)} <CurrencyBadge currency={displayCurrency} size="sm" /></td></tr></tfoot>
                          </table>
                        </DataTableViewport>
                      </Card>

                      <Card className="border-border/60 p-4 shadow-none">
                        <h3 className="text-sm font-semibold">Shipping & payment</h3>
                        <dl className="mt-4 grid gap-4">
                          {[
                            { icon: MapPin, label: 'Delivery address', value: order.shippingAddress },
                            { icon: Calendar, label: 'Expected delivery', value: formatDate(order.expectedDelivery) },
                            ...(order.deliveredDate ? [{ icon: CheckCircle2, label: 'Delivered on', value: formatDate(order.deliveredDate) }] : []),
                            { icon: IndianRupee, label: 'Payment terms', value: order.paymentTerms },
                            ...(order.trackingId ? [{ icon: Truck, label: 'Tracking ID', value: order.trackingId }] : []),
                          ].map((item) => <div key={item.label} className="flex items-start gap-2.5"><item.icon className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{item.label}</dt><dd className="mt-1 text-xs font-medium leading-relaxed">{item.value}</dd></div></div>)}
                        </dl>
                      </Card>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                      <Button size="sm" onClick={() => downloadPurchaseOrderAsPdf(order, formatAmount, displayCurrency)}><Download />Download PO</Button>
                      {order.status === 'DELIVERED' && <Link to="/vendor/invoices" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Receipt className="size-4" />View invoices</Link>}
                    </div>
                </CollapsibleContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
