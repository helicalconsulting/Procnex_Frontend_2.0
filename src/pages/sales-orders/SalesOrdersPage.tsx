import { useState, useMemo, useCallback, useEffect } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { localDataService, type SalesOrder as ServiceSalesOrder } from '../../services/localDataService';
import {
  TrendingUp, Search, Clock, CheckCircle2, Truck,
  XCircle, Package, ShoppingBag, Eye, ThumbsUp,
  ThumbsDown, X, MessageSquare,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
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

type SOStatus = 'DRAFT' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'DISCARDED';
type ActionType = 'confirm' | 'ship' | 'deliver' | 'cancel' | 'discard';

interface SalesOrder {
  id: number;
  soNumber: string;
  customerName: string;
  customerInitials: string;
  avatarMod: string;
  itemCount: number;
  amount: number;
  orderDate: string;
  deliveryDate: string;
  status: SOStatus;
  region: string;
  salesRep: string;
  comments?: string;
}

function mapSalesOrder(so: ServiceSalesOrder): SalesOrder {
  const initials = so.customer.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const statusMap: Record<string, SOStatus> = {
    CONFIRMED: 'CONFIRMED',
    APPROVED: 'CONFIRMED',
    PENDING_APPROVAL: 'DRAFT',
    SHIPPED: 'SHIPPED',
    DELIVERED: 'DELIVERED',
    DRAFT: 'DRAFT',
    CANCELLED: 'CANCELLED',
    REJECTED: 'DISCARDED',
    PROCESSING: 'PROCESSING',
  };
  return {
    id: so.id,
    soNumber: so.soNumber,
    customerName: so.customer,
    customerInitials: initials,
    avatarMod: String((so.id % 6) + 1),
    itemCount: so.itemCount || 4,
    amount: so.amount,
    orderDate: so.orderDate,
    deliveryDate: so.orderDate,
    status: statusMap[so.status] || 'DRAFT',
    region: so.region || 'North Region',
    salesRep: so.salesRep || 'Rahul Sharma',
  };
}

const STATUS_MAP: Record<SOStatus, { label: string; tone: string }> = {
  DRAFT:      { label: 'Draft',      tone: 'bg-muted/50 text-muted-foreground border-border/60' },
  CONFIRMED:  { label: 'Confirmed',  tone: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-300' },
  PROCESSING: { label: 'Processing', tone: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-300' },
  SHIPPED:    { label: 'Shipped',    tone: 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-300' },
  DELIVERED:  { label: 'Delivered',  tone: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300' },
  CANCELLED:  { label: 'Cancelled',  tone: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-300' },
  DISCARDED:  { label: 'Discarded',  tone: 'bg-muted/50 text-muted-foreground border-border/60' },
};

const ACTION_CFG: Partial<Record<SOStatus, {
  primary:   { action: ActionType; label: string; color: 'approve'; icon: React.ReactNode };
  secondary?: { action: ActionType; label: string; color: 'reject' | 'return'; icon: React.ReactNode };
}>> = {
  DRAFT: {
    primary:   { action: 'confirm', label: 'Confirm',      color: 'approve', icon: <ThumbsUp className="size-4" /> },
    secondary: { action: 'discard', label: 'Discard',      color: 'reject',  icon: <ThumbsDown className="size-4" /> },
  },
  CONFIRMED: {
    primary:   { action: 'ship',    label: 'Mark Shipped', color: 'approve', icon: <Truck className="size-4" /> },
    secondary: { action: 'cancel',  label: 'Cancel',       color: 'reject',  icon: <XCircle className="size-4" /> },
  },
  PROCESSING: {
    primary:   { action: 'ship',    label: 'Mark Shipped', color: 'approve', icon: <Truck className="size-4" /> },
    secondary: { action: 'cancel',  label: 'Cancel',       color: 'reject',  icon: <XCircle className="size-4" /> },
  },
  SHIPPED: {
    primary:   { action: 'deliver', label: 'Mark Delivered', color: 'approve', icon: <CheckCircle2 className="size-4" /> },
    secondary: { action: 'cancel',  label: 'Cancel',         color: 'reject',  icon: <XCircle className="size-4" /> },
  },
};

const ACTION_TITLES: Record<ActionType, string> = {
  confirm: 'Confirm Order',
  ship:    'Mark as Shipped',
  deliver: 'Mark as Delivered',
  cancel:  'Cancel Order',
  discard: 'Discard Draft',
};

const ACTION_TO_STATUS: Record<ActionType, SOStatus> = {
  confirm: 'CONFIRMED',
  ship:    'SHIPPED',
  deliver: 'DELIVERED',
  cancel:  'CANCELLED',
  discard: 'DISCARDED',
};

const COMMENT_REQUIRED: ActionType[] = ['cancel', 'discard'];

// ─── Component ──────────────────────────────────────────────

export default function SalesOrdersPage() {
  const { data: serverOrders, loading, error } = useServiceData(
    () => localDataService.getSalesOrders().then((list) => list.map(mapSalesOrder)),
    [] as SalesOrder[]
  );

  const [pendingActions, setPendingActions] = useState<Record<number, SalesOrder>>({});
  const orders = useMemo(() => {
    if (Object.keys(pendingActions).length === 0) return serverOrders;
    return serverOrders.map(o => pendingActions[o.id] ?? o);
  }, [serverOrders, pendingActions]);

  const [search, setSearch]               = useState('');
  const [actionModal, setActionModal]     = useState<{ order: SalesOrder; action: ActionType } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [detailOrder, setDetailOrder]     = useState<SalesOrder | null>(null);
  useBodyScrollLock(!!(actionModal || detailOrder));

  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  useEffect(() => { setDisplayCurrency(companyDefaultCurrency); }, [companyDefaultCurrency]);

  const summary = useMemo(() => ({
    totalRevenue: orders.filter(o => !['CANCELLED','DRAFT','DISCARDED'].includes(o.status)).reduce((s, o) => s + o.amount, 0),
    active:       orders.filter(o => ['CONFIRMED','PROCESSING','SHIPPED'].includes(o.status)).length,
    delivered:    orders.filter(o => o.status === 'DELIVERED').length,
    cancelled:    orders.filter(o => o.status === 'CANCELLED' || o.status === 'DISCARDED').length,
  }), [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.soNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.salesRep.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, search]);

  const handleAction = useCallback(() => {
    if (!actionModal) return;
    const newStatus = ACTION_TO_STATUS[actionModal.action];
    setPendingActions(prev => ({
      ...prev,
      [actionModal.order.id]: {
        ...actionModal.order,
        status: newStatus,
        comments: actionComment.trim() || undefined,
      },
    }));
    setActionModal(null);
    setActionComment('');
  }, [actionModal, actionComment]);

  const openAction = useCallback((order: SalesOrder, action: ActionType) => {
    setActionModal({ order, action });
    setActionComment('');
  }, []);

  const fmt     = (n: number) => formatAmount(n, displayCurrency);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const isCommentRequired = actionModal ? COMMENT_REQUIRED.includes(actionModal.action) : false;

  return (
    <PageFrame>
      {error && <MessageStrip type="error" className="mb-4">{error}</MessageStrip>}

      {/* Header */}
      <PageLead
        title="Sales Orders"
        description="Manage outgoing sales orders and track delivery performance"
      />

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={TrendingUp} label="Total Revenue" value={fmt(summary.totalRevenue)} tone="primary" aria-pressed={true} />
        <MetricCard icon={ShoppingBag} label="Active Orders" value={summary.active} tone="warning" />
        <MetricCard icon={CheckCircle2} label="Delivered" value={summary.delivered} tone="success" />
        <MetricCard icon={XCircle} label="Cancelled / Discarded" value={summary.cancelled} tone="danger" />
      </div>

      {/* Toolbar */}
      <Card className="mb-6 p-4">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sales orders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      {/* Content */}
      <Card className="overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3.5">SO #</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5 text-center">Items</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5">Order Date</th>
                  <th className="px-5 py-3.5">Delivery</th>
                  <th className="px-5 py-3.5">Region</th>
                  <th className="px-5 py-3.5">Sales Rep</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map(so => {
                  const cfg    = STATUS_MAP[so.status];
                  const actCfg = ACTION_CFG[so.status];
                  return (
                    <tr key={so.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-3.5 font-mono font-semibold text-foreground">{so.soNumber}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="grid size-7 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {so.customerInitials}
                          </div>
                          <span className="font-semibold text-foreground">{so.customerName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center text-muted-foreground">{so.itemCount}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-foreground">{fmt(so.amount)}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{fmtDate(so.orderDate)}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{fmtDate(so.deliveryDate)}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="text-[11px]">{so.region}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{so.salesRep}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className={cn('text-[11px]', cfg.tone)}>
                          {cfg.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View Details" onClick={() => setDetailOrder(so)}>
                            <Eye className="size-4" />
                          </Button>
                          {actCfg?.primary && (
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => openAction(so, actCfg.primary.action)}>
                              {actCfg.primary.icon} {actCfg.primary.label}
                            </Button>
                          )}
                          {actCfg?.secondary && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive gap-1" onClick={() => openAction(so, actCfg.secondary!.action)}>
                              {actCfg.secondary.icon} {actCfg.secondary.label}
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
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No sales orders found"
            description={search ? 'Try adjusting your search query.' : 'No sales orders are currently available.'}
          />
        )}
      </Card>

      {/* Action Dialog */}
      <Dialog open={!!actionModal} onOpenChange={() => setActionModal(null)}>
        {actionModal && (
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {ACTION_TITLES[actionModal.action]}
              </DialogTitle>
              <DialogDescription>
                Confirm action for Sales Order <strong>{actionModal.order.soNumber}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Customer:</span> <strong className="text-foreground">{actionModal.order.customerName}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span> <strong className="text-foreground font-mono">{fmt(actionModal.order.amount)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Delivery:</span> <strong className="text-foreground">{fmtDate(actionModal.order.deliveryDate)}</strong></div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground flex items-center gap-1">
                  <MessageSquare className="size-3.5" /> Comments {isCommentRequired && <span className="text-destructive">*</span>}
                </label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                  placeholder={isCommentRequired ? 'Provide a reason...' : 'Optional comments...'}
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setActionModal(null)}>Cancel</Button>
              <Button
                variant={actionModal.action === 'cancel' || actionModal.action === 'discard' ? 'destructive' : 'default'}
                disabled={isCommentRequired && !actionComment.trim()}
                onClick={handleAction}
              >
                {ACTION_TITLES[actionModal.action]}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        {detailOrder && (
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="size-5 text-primary" /> Sales Order Details
              </DialogTitle>
              <DialogDescription>
                Order specification and delivery summary.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">SO #</div>
                  <div className="mt-1 font-semibold font-mono text-foreground">{detailOrder.soNumber}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Customer</div>
                  <div className="mt-1 font-semibold text-foreground">{detailOrder.customerName}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Amount</div>
                  <div className="mt-1 font-semibold font-mono text-foreground">{fmt(detailOrder.amount)}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Status</div>
                  <div className="mt-1">
                    <Badge variant="outline" className={cn('text-[11px]', STATUS_MAP[detailOrder.status].tone)}>
                      {STATUS_MAP[detailOrder.status].label}
                    </Badge>
                  </div>
                </div>
              </div>

              {detailOrder.comments && (
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Comments</div>
                  <div className="mt-1 text-foreground">{detailOrder.comments}</div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setDetailOrder(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
