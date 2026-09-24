import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, Calendar, CheckCircle2, ChevronDown, Clock, Download, FileText,
  IndianRupee, MapPin, Package, Receipt, Search, Truck, XCircle,
} from 'lucide-react';
import { CurrencyBadge, CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { useServiceData } from '../../hooks/useServiceData';
import { cn } from '../../lib/utils';
import type { VendorOrderMock } from '../../mocks/vendorPortal.mock';
import { vendorPortalService } from '../../services/vendorPortalService';
import { downloadPurchaseOrderAsPdf } from '../../utils/pdfDownload';
import { getVendorPath } from '../../utils/tenantResolver';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_CONFIG: Record<string, { label: string; tone: Tone; icon: typeof Truck }> = {
  CONFIRMED: { label: 'Confirmed', tone: 'success', icon: CheckCircle2 },
  APPROVED: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
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
  return (
    <Badge tone={config.tone}>
      <span className="size-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}

export default function VendorOrdersPage() {
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  const { data: orders, loading, error } = useServiceData(
    () => vendorPortalService.listOrders(), [] as VendorOrderMock[],
  );
  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<'ACTIVE' | 'DELIVERED' | 'CANCELLED' | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const summary = useMemo(() => ({
    total: orders.length,
    active: orders.filter((order) => ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'ISSUED', 'SENT', 'APPROVED', 'IN_PROGRESS'].includes((order.status || '').toUpperCase())).length,
    delivered: orders.filter((order) => ['DELIVERED', 'COMPLETED'].includes((order.status || '').toUpperCase())).length,
    cancelled: orders.filter((order) => ['CANCELLED', 'REJECTED'].includes((order.status || '').toUpperCase())).length,
  }), [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (kpiFilter === 'ACTIVE') {
      list = list.filter((order) => ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'ISSUED', 'SENT', 'APPROVED', 'IN_PROGRESS'].includes((order.status || '').toUpperCase()));
    } else if (kpiFilter === 'DELIVERED') {
      list = list.filter((order) => ['DELIVERED', 'COMPLETED'].includes((order.status || '').toUpperCase()));
    } else if (kpiFilter === 'CANCELLED') {
      list = list.filter((order) => ['CANCELLED', 'REJECTED'].includes((order.status || '').toUpperCase()));
    }

    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((order) =>
        [order.poNumber, order.rfqNumber, order.buyerCompany || order.buyerName, ...order.items.map((item) => item.name)]
          .some((field) => (field || '').toLowerCase().includes(query))
      );
    }
    return list;
  }, [orders, kpiFilter, search]);

  const amount = (value: number) => formatAmount(value, displayCurrency);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <PageFrame>
      <PageLead
        title="My Orders"
        description="Track fulfilment milestones, delivery schedules, and purchase-order details."
      />

      {error && (
        <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* ── KPI Metric Cards ────────────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Package, tone: 'primary' as const, value: summary.total, label: 'Total Orders', detail: 'All time', filter: null },
          { icon: Truck, tone: 'warning' as const, value: summary.active, label: 'Active Orders', detail: 'In progress', filter: 'ACTIVE' as const },
          { icon: CheckCircle2, tone: 'success' as const, value: summary.delivered, label: 'Delivered', detail: 'Completed', filter: 'DELIVERED' as const },
          { icon: XCircle, tone: 'danger' as const, value: summary.cancelled, label: 'Cancelled', detail: 'All time', filter: 'CANCELLED' as const },
        ].map((c) => {
          const isActive = c.filter === null ? !kpiFilter : kpiFilter === c.filter;
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
              onClick={() => setKpiFilter(isActive ? null : c.filter)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setKpiFilter(isActive ? null : c.filter);
                }
              }}
            />
          );
        })}
      </div>

      {/* ── Search & Currency Toolbar ──────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search by PO number, RFQ number, buyer, or item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />
      </div>

      {/* ── Orders List ────────────────────────────── */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading orders…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No Orders Found"
          description={search ? "Try adjusting your search criteria." : "Issued purchase orders will appear here once created."}
          action={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((order) => {
            const isExpanded = expandedOrder === order.id;
            const currentStep = STATUS_INDEX[(order.status || '').toUpperCase()] ?? 0;
            const isCancelled = ['CANCELLED', 'REJECTED'].includes((order.status || '').toUpperCase());

            return (
              <Card
                id={`vorder-card-${order.id}`}
                key={order.id}
                className={cn(
                  'overflow-hidden transition-all duration-200 border-border/80 hover:border-primary/30 bg-card',
                  isExpanded && 'ring-1 ring-primary/20 shadow-xs'
                )}
              >
                {/* ── COLLAPSED STATE ────────────────────────── */}
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer hover:bg-accent/25 transition-colors"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-bold text-foreground text-base tracking-tight">{order.poNumber}</span>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                        {order.rfqNumber}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{order.buyerCompany || order.buyerName || 'Procnex'}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="font-medium text-muted-foreground">{formatDate(order.orderDate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-primary text-base sm:text-lg tabular-nums">
                      {amount(order.totalAmount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedOrder(isExpanded ? null : order.id);
                      }}
                      aria-label="Toggle Order details"
                      className="size-8 rounded-lg"
                    >
                      <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200', isExpanded && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {/* ── EXPANDED STATE ────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-card p-4 sm:p-5 flex flex-col gap-5 text-sm">
                    {/* 1. PO Overview & Status Tracker */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Order Status</span>
                          <StatusBadge status={order.status} />
                        </div>
                      </div>

                      {isCancelled ? (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/8 p-3 text-xs font-medium text-destructive">
                          <AlertCircle className="size-4 shrink-0" />
                          This purchase order was cancelled or rejected.
                        </div>
                      ) : (
                        <ol className="grid grid-cols-4 gap-1 py-1" aria-label="Order progress">
                          {STEPS.map((step, index) => {
                            const done = index <= currentStep;
                            return (
                              <li key={step} className="relative flex min-w-0 flex-col items-center text-center before:absolute before:left-[calc(50%+16px)] before:right-[calc(-50%+16px)] before:top-2.5 before:h-px before:bg-border last:before:hidden">
                                <span className={cn('relative z-10 grid size-5 place-items-center rounded-full border bg-card text-[10px] transition-colors', done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
                                  {done ? <CheckCircle2 className="size-3" /> : <span className="size-1 rounded-full bg-current" />}
                                </span>
                                <span className={cn('mt-1.5 truncate text-[11px] font-medium', done ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                                  {step}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>

                    {/* 2 & 3. Order Summary and Delivery & Payment */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Order Summary */}
                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Order Summary</h4>
                        <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Buyer / Company</dt>
                            <dd className="font-semibold text-foreground mt-0.5">{order.buyerCompany || order.buyerName || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">RFQ Number</dt>
                            <dd className="font-semibold text-foreground font-mono mt-0.5">{order.rfqNumber || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Order Date</dt>
                            <dd className="font-semibold text-foreground mt-0.5">{formatDate(order.orderDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Total Items</dt>
                            <dd className="font-semibold text-foreground mt-0.5">{order.items.length} line item(s)</dd>
                          </div>
                        </dl>
                      </div>

                      {/* Delivery & Payment */}
                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Delivery & Payment</h4>
                        <dl className="grid gap-2 text-xs">
                          <div className="flex items-start gap-2">
                            <MapPin className="size-3.5 text-primary shrink-0 mt-0.5" />
                            <div>
                              <dt className="text-muted-foreground text-[11px]">Delivery Address</dt>
                              <dd className="font-medium text-foreground leading-snug">{order.shippingAddress || '—'}</dd>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 pt-1">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="size-3.5 text-primary shrink-0" />
                              <div>
                                <dt className="text-muted-foreground text-[11px]">Expected Delivery</dt>
                                <dd className="font-semibold text-foreground">{formatDate(order.expectedDelivery)}</dd>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 border-l border-border/60 pl-3">
                              <IndianRupee className="size-3.5 text-primary shrink-0" />
                              <div>
                                <dt className="text-muted-foreground text-[11px]">Payment Terms</dt>
                                <dd className="font-semibold text-foreground">{order.paymentTerms || '—'}</dd>
                              </div>
                            </div>
                          </div>
                        </dl>
                      </div>
                    </div>

                    {/* 4 & 5. Items & Total */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ordered Items</h4>
                        <span className="text-xs text-muted-foreground">{order.items.length} item(s)</span>
                      </div>
                      <div className="rounded-lg border border-border/70 overflow-hidden bg-background">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground">
                              <th className="p-2.5">Item</th>
                              <th className="p-2.5 text-right">Quantity</th>
                              <th className="p-2.5 text-right">Unit Price</th>
                              <th className="p-2.5 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {order.items.map((item, idx) => (
                              <tr key={`${item.name}-${idx}`} className="hover:bg-accent/20 transition-colors">
                                <td className="p-2.5 font-medium text-foreground">{item.name}</td>
                                <td className="p-2.5 text-right tabular-nums text-foreground">{item.quantity} {item.unit}</td>
                                <td className="p-2.5 text-right tabular-nums text-muted-foreground">{amount(item.unitPrice)}</td>
                                <td className="p-2.5 text-right font-semibold tabular-nums text-foreground">{amount(item.quantity * item.unitPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t border-border/70 bg-muted/30">
                            <tr>
                              <td colSpan={3} className="p-2.5 text-right font-semibold text-foreground">Grand Total</td>
                              <td className="p-2.5 text-right font-bold text-sm tabular-nums text-primary">
                                {amount(order.totalAmount)} <CurrencyBadge currency={displayCurrency} size="sm" />
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* 6. Action Footer (Download PO & Invoices) */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                      {['DELIVERED', 'COMPLETED'].includes((order.status || '').toUpperCase()) && (
                        <Link to={getVendorPath('/vendor/invoices')} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                          <Receipt className="size-3.5" /> View Invoices
                        </Link>
                      )}
                      <Button size="sm" onClick={() => downloadPurchaseOrderAsPdf(order, formatAmount, displayCurrency)}>
                        <Download className="size-3.5" /> Download PO
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}


