import { useCallback, useMemo, useState, useEffect, useRef, type KeyboardEvent } from 'react';
import {
  Ban,
  Banknote,
  CheckCircle2,
  Clock,
  Eye,
  MessageSquare,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import ColumnCustomizer, { type ColumnDef } from '../../components/shared/ColumnCustomizer';
import BankPaymentVoucherModal from '../../components/payments/BankPaymentVoucherModal';
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
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { cn } from '../../lib/utils';
import { localDataService, type Payment as ServicePayment } from '../../services/localDataService';
import { approvalService } from '../../services/approvalService';
import { useAuth } from '../../context/AuthContext';
import '../../components/shared/ColumnCustomizer.css';

type PaymentStatus = 'COMPLETED' | 'PENDING' | 'PROCESSING' | 'FAILED' | 'CONFIRMED' | 'CANCELLED' | 'RETRIED';
type PaymentMethod = 'NEFT' | 'RTGS' | 'IMPS' | 'Cheque' | 'UPI';
type ActionType = 'confirm' | 'cancel' | 'retry';
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface Payment {
  id: number;
  paymentNumber: string;
  invoiceRef: string;
  vendorName: string;
  vendorInitials: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  status: PaymentStatus;
  approvedBy: string;
  remarks: string;
  comments?: string;
}

const STATUS_CONFIG: Record<PaymentStatus, { label: string; tone: Tone; icon: typeof Clock }> = {
  COMPLETED: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  PENDING: { label: 'Pending', tone: 'warning', icon: Clock },
  PROCESSING: { label: 'Processing', tone: 'info', icon: RefreshCw },
  FAILED: { label: 'Failed', tone: 'danger', icon: XCircle },
  CONFIRMED: { label: 'Confirmed', tone: 'success', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: X },
  RETRIED: { label: 'Retried', tone: 'neutral', icon: RotateCcw },
};

const ACTIONABLE: PaymentStatus[] = ['PENDING', 'PROCESSING'];

function mapPayment(payment: ServicePayment): Payment {
  const statusMap: Record<string, PaymentStatus> = {
    COMPLETED: 'COMPLETED',
    SCHEDULED: 'PENDING',
    PENDING: 'PENDING',
    PENDING_APPROVAL: 'PENDING',
    APPROVED: 'CONFIRMED',
    PROCESSING: 'PROCESSING',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
  };
  return {
    id: payment.id,
    paymentNumber: payment.paymentId,
    invoiceRef: payment.invoiceRef,
    vendorName: payment.vendor,
    vendorInitials: payment.vendor.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase(),
    amount: payment.amount,
    method: (payment.method as PaymentMethod) || 'NEFT',
    date: payment.paidAt,
    status: statusMap[payment.status] || 'PENDING',
    approvedBy: payment.approvedBy || '—',
    remarks: payment.remarks || '',
  };
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  return (
    <Badge tone={config.tone}>
      <Icon className={cn('size-3', status === 'PROCESSING' && 'animate-spin')} />
      {config.label}
    </Badge>
  );
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'paymentNumber', label: 'Payment #', defaultVisible: true, required: true },
  { key: 'vendorName', label: 'Vendor', defaultVisible: true, required: true },
  { key: 'invoiceRef', label: 'Invoice Ref', defaultVisible: true },
  { key: 'amount', label: 'Amount', defaultVisible: true },
  { key: 'method', label: 'Method', defaultVisible: true },
  { key: 'date', label: 'Date', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
];

export default function PaymentsPage() {
  const { hasPermission } = useAuth();
  const canApprovePayment =
    hasPermission('Payments', 'canApprove') ||
    hasPermission('Payments', 'canCreate') ||
    hasPermission('Accounts Payable', 'canApprove');

  const { data: serverPayments, loading, error } = useServiceData(
    () => localDataService.getPayments().then((list) => list.map(mapPayment)),
    [] as Payment[]
  );

  const [pendingActions, setPendingActions] = useState<Record<number, Payment>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'ALL'>('ALL');
  const [actionModal, setActionModal] = useState<{ payment: Payment; action: ActionType } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [selectedPrintVoucher, setSelectedPrintVoucher] = useState<Payment | null>(null);
  const [voucherApprovers, setVoucherApprovers] = useState<any[] | null>(null);
  const [chainModal, setChainModal] = useState<{ module: string; referenceId: string } | null>(null);

  const { formatAmount, companyDefaultCurrency } = useCurrency();

  useBodyScrollLock(!!(actionModal || detailPayment || selectedPrintVoucher || chainModal));

  useEffect(() => {
    if (!selectedPrintVoucher) {
      setVoucherApprovers(null);
      return;
    }
    let isMounted = true;
    const fetchApprovalChain = async () => {
      try {
        const targetRef = selectedPrintVoucher.invoiceRef || selectedPrintVoucher.paymentNumber;
        const res = await approvalService.getChain('AccountsPayable', targetRef);
        if (!isMounted) return;

        const chainItems = res?.history && res.history.length > 0 ? res.history : res?.levels || [];
        if (chainItems && chainItems.length > 0) {
          const mapped = chainItems.map((item: any, idx: number) => {
            const roleName = item.requiredRole
              ? item.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              : `Level ${item.levelNumber || idx + 1} Approver`;
            const name =
              item.approverName ||
              (item.status === 'AUTO_FORWARDED'
                ? 'Auto-Approved (System)'
                : item.status === 'APPROVED'
                ? selectedPrintVoucher.approvedBy !== '—'
                  ? selectedPrintVoucher.approvedBy
                  : 'Authorized Approver'
                : 'Pending Approval');
            const comments =
              item.comments ||
              (item.status === 'APPROVED'
                ? 'Approved & Signed'
                : item.status === 'AUTO_FORWARDED'
                ? 'Auto-approved by system deadline'
                : 'Awaiting action');
            const date = item.actionAt ? new Date(item.actionAt).toISOString().slice(0, 10) : selectedPrintVoucher.date;
            return {
              level: `Level ${item.levelNumber || idx + 1}`,
              name,
              role: roleName,
              date,
              status: (item.status === 'APPROVED' || item.status === 'AUTO_FORWARDED' ? 'APPROVED' : 'PENDING') as
                | 'APPROVED'
                | 'PENDING',
              comments,
            };
          });
          setVoucherApprovers(mapped);
        } else {
          setVoucherApprovers(null);
        }
      } catch (_err) {
        if (isMounted) setVoucherApprovers(null);
      }
    };

    fetchApprovalChain();
    return () => {
      isMounted = false;
    };
  }, [selectedPrintVoucher]);

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

  const payments = useMemo(
    () => serverPayments.map((payment) => pendingActions[payment.id] ?? payment),
    [serverPayments, pendingActions]
  );

  const summary = useMemo(
    () => ({
      totalPaid: payments
        .filter((payment) => ['COMPLETED', 'CONFIRMED'].includes(payment.status))
        .reduce((sum, payment) => sum + payment.amount, 0),
      pending: payments.filter((payment) => payment.status === 'PENDING').length,
      completed: payments.filter((payment) => ['COMPLETED', 'CONFIRMED'].includes(payment.status)).length,
      failed: payments.filter((payment) => ['FAILED', 'CANCELLED'].includes(payment.status)).length,
    }),
    [payments]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter(
      (payment) =>
        (statusFilter === 'ALL' || payment.status === statusFilter) &&
        (!query || [payment.paymentNumber, payment.vendorName, payment.invoiceRef].some((field) => (field || '').toLowerCase().includes(query)))
    );
  }, [payments, search, statusFilter]);

  const amount = (value: number) => formatAmount(value, companyDefaultCurrency);
  const formatDate = (date: string) =>
    date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const openAction = useCallback((payment: Payment, action: ActionType) => {
    setActionModal({ payment, action });
    setActionComment('');
  }, []);

  const handleAction = useCallback(() => {
    if (!actionModal) return;
    const status: PaymentStatus =
      actionModal.action === 'confirm' ? 'CONFIRMED' : actionModal.action === 'cancel' ? 'CANCELLED' : 'RETRIED';
    setPendingActions((current) => ({
      ...current,
      [actionModal.payment.id]: {
        ...actionModal.payment,
        status,
        comments: actionComment.trim() || undefined,
      },
    }));
    setActionModal(null);
    setActionComment('');
  }, [actionComment, actionModal]);

  const cardProps = (filter: PaymentStatus | 'ALL') => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': statusFilter === filter,
    onClick: () => setStatusFilter((current) => (current === filter && filter !== 'ALL' ? 'ALL' : filter)),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') setStatusFilter(filter);
    },
    className: cn(
      'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      statusFilter === filter && 'border-primary/40 ring-2 ring-primary/10'
    ),
  });

  const actionTitle =
    actionModal?.action === 'confirm'
      ? 'Confirm payment'
      : actionModal?.action === 'cancel'
      ? 'Cancel payment'
      : 'Retry payment';
  const destructive = actionModal?.action !== 'confirm';

  return (
    <PageFrame>
      <PageLead title="Payment approvals" description="Review payment vouchers and track vendor disbursements." />
      {error && <MessageStrip type="error">{error}</MessageStrip>}

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard {...cardProps('ALL')} label="Total paid" value={amount(summary.totalPaid)} detail="Completed payments" icon={Banknote} tone="success" />
        <MetricCard {...cardProps('PENDING')} label="Pending" value={summary.pending} detail="Awaiting confirmation" icon={Clock} tone="warning" />
        <MetricCard {...cardProps('COMPLETED')} label="Completed" value={summary.completed} detail="Confirmed transactions" icon={CheckCircle2} />
        <MetricCard {...cardProps('FAILED')} label="Failed / cancelled" value={summary.failed} detail="Needs attention" icon={XCircle} tone="danger" />
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-10 pr-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search payment, vendor, or invoice"
              aria-label="Search payments"
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
        </div>
      </Card>

      {loading ? (
        <Card className="p-4">
          <TableSkeleton rows={5} columns={7} />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No payments found"
          description={
            search || statusFilter !== 'ALL'
              ? 'Try clearing the search or status filter.'
              : 'Payment vouchers will appear here when created.'
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
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/55 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className={cn('px-4 py-3', col.key === 'amount' && 'text-right')}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((payment) => (
                    <tr
                      key={payment.id}
                      className="transition-colors hover:bg-accent/35 cursor-pointer"
                      onClick={() => setDetailPayment(payment)}
                    >
                      {visibleColumns.map((col) => {
                        if (col.key === 'paymentNumber') {
                          return (
                            <td key="paymentNumber" className="px-4 py-3.5 font-semibold text-primary">
                              {payment.paymentNumber}
                            </td>
                          );
                        }
                        if (col.key === 'vendorName') {
                          return (
                            <td key="vendorName" className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                                  {payment.vendorInitials}
                                </span>
                                <span className="font-medium">{payment.vendorName}</span>
                              </div>
                            </td>
                          );
                        }
                        if (col.key === 'invoiceRef') {
                          return <td key="invoiceRef" className="px-4 py-3.5 text-xs text-muted-foreground">{payment.invoiceRef}</td>;
                        }
                        if (col.key === 'amount') {
                          return (
                            <td key="amount" className="px-4 py-3.5 text-right font-semibold tabular-nums">
                              {amount(payment.amount)}
                            </td>
                          );
                        }
                        if (col.key === 'method') {
                          return <td key="method" className="px-4 py-3.5"><Badge>{payment.method}</Badge></td>;
                        }
                        if (col.key === 'date') {
                          return <td key="date" className="px-4 py-3.5 text-xs text-muted-foreground">{formatDate(payment.date)}</td>;
                        }
                        if (col.key === 'status') {
                          return <td key="status" className="px-4 py-3.5"><StatusBadge status={payment.status} /></td>;
                        }
                        return <td key={col.key} className="px-4 py-3.5">-</td>;
                      })}
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDetailPayment(payment)}
                            aria-label={`View ${payment.paymentNumber}`}
                            title="View Details"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setSelectedPrintVoucher(payment)}
                            aria-label={`Print ${payment.paymentNumber}`}
                            title="Print Bank Voucher"
                          >
                            <Printer className="size-4" />
                          </Button>
                          {ACTIONABLE.includes(payment.status) && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                disabled={!canApprovePayment}
                                onClick={() => canApprovePayment && openAction(payment, 'confirm')}
                                aria-label={`Confirm ${payment.paymentNumber}`}
                                title={canApprovePayment ? 'Confirm payment' : 'Permission denied'}
                              >
                                <ThumbsUp className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={!canApprovePayment}
                                onClick={() => canApprovePayment && openAction(payment, 'cancel')}
                                aria-label={`Cancel ${payment.paymentNumber}`}
                                title={canApprovePayment ? 'Cancel payment' : 'Permission denied'}
                              >
                                <Ban className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={!canApprovePayment}
                                onClick={() => canApprovePayment && openAction(payment, 'retry')}
                                aria-label={`Retry ${payment.paymentNumber}`}
                                title={canApprovePayment ? 'Retry payment' : 'Permission denied'}
                              >
                                <RotateCcw className="size-4" />
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
          </Card>

          <div className="grid gap-3 lg:hidden">
            {filtered.map((payment) => (
              <Card key={payment.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-primary">{payment.paymentNumber}</div>
                    <div className="mt-1 truncate text-sm font-medium">{payment.vendorName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{payment.invoiceRef}</div>
                  </div>
                  <StatusBadge status={payment.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/45 p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="mt-1 font-semibold">{amount(payment.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Method</dt>
                    <dd className="mt-1 font-medium">{payment.method}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="mt-1 font-medium">{formatDate(payment.date)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Approved by</dt>
                    <dd className="mt-1 font-medium">{payment.approvedBy}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setDetailPayment(payment)}>
                    <Eye /> Details
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPrintVoucher(payment)}>
                    <Printer /> Print
                  </Button>
                  {ACTIONABLE.includes(payment.status) && canApprovePayment && (
                    <>
                      <Button size="sm" onClick={() => openAction(payment, 'confirm')}>
                        <ThumbsUp /> Confirm
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => openAction(payment, 'cancel')}>
                        <Ban /> Cancel
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openAction(payment, 'retry')}>
                        <RotateCcw /> Retry
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Action Dialog */}
      <Dialog open={!!actionModal} onOpenChange={(open) => { if (!open) setActionModal(null); }}>
        {actionModal && (
          <DialogContent>
            <DialogHeader className="pr-10">
              <div
                className={cn(
                  'mb-1 grid size-11 place-items-center rounded-xl',
                  destructive ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'
                )}
              >
                {actionModal.action === 'confirm' ? (
                  <ThumbsUp className="size-5" />
                ) : actionModal.action === 'cancel' ? (
                  <Ban className="size-5" />
                ) : (
                  <RotateCcw className="size-5" />
                )}
              </div>
              <DialogTitle>{actionTitle}</DialogTitle>
              <DialogDescription>Review the payment before applying this decision.</DialogDescription>
            </DialogHeader>
            <dl className="grid gap-2 rounded-xl border border-border/65 bg-secondary/40 p-4 sm:grid-cols-2">
              {[
                ['Payment', actionModal.payment.paymentNumber],
                ['Vendor', actionModal.payment.vendorName],
                ['Amount', amount(actionModal.payment.amount)],
                ['Method', actionModal.payment.method],
                ['Invoice', actionModal.payment.invoiceRef],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <label className="grid gap-2 text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5" /> Comments {destructive && <span className="text-destructive">*</span>}
              </span>
              <textarea
                className="min-h-28 resize-y rounded-xl border border-input bg-background px-3.5 py-3 text-sm font-normal outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
                value={actionComment}
                onChange={(event) => setActionComment(event.target.value)}
                placeholder={destructive ? 'Provide a reason…' : 'Optional comments…'}
              />
            </label>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setActionModal(null)}>Cancel</Button>
              <Button variant={destructive ? 'destructive' : 'default'} disabled={destructive && !actionComment.trim()} onClick={handleAction}>
                {actionTitle}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailPayment} onOpenChange={(open) => { if (!open) setDetailPayment(null); }}>
        {detailPayment && (
          <DialogContent className="max-w-2xl">
            <DialogHeader className="pr-10">
              <div className="flex items-center gap-2">
                <DialogTitle>{detailPayment.paymentNumber}</DialogTitle>
                <StatusBadge status={detailPayment.status} />
              </div>
              <DialogDescription>
                {detailPayment.vendorName} · {amount(detailPayment.amount)}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                ['Invoice reference', detailPayment.invoiceRef],
                ['Amount', amount(detailPayment.amount)],
                ['Method', detailPayment.method],
                ['Date', formatDate(detailPayment.date)],
                ['Approved by', detailPayment.approvedBy],
                ['Remarks', detailPayment.remarks || '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/65 bg-secondary/40 p-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {detailPayment.comments && (
              <div className="rounded-xl border border-border/65 p-4">
                <div className="text-xs font-semibold text-muted-foreground">Comments</div>
                <p className="mt-2 text-sm">{detailPayment.comments}</p>
              </div>
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setChainModal({ module: 'Payments', referenceId: detailPayment.paymentNumber || detailPayment.invoiceRef })}
              >
                <Clock className="size-4" /> View Approval Chain
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const target = detailPayment;
                    setDetailPayment(null);
                    setSelectedPrintVoucher(target);
                  }}
                >
                  <Printer className="size-4" /> Print Voucher
                </Button>
                <Button variant="secondary" onClick={() => setDetailPayment(null)}>Close</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Official Printable Bank Payment Voucher Modal */}
      {selectedPrintVoucher && (
        <BankPaymentVoucherModal
          data={{
            voucherNumber: selectedPrintVoucher.paymentNumber,
            voucherDate: selectedPrintVoucher.date,
            paymentMethod: selectedPrintVoucher.method,
            vendorName: selectedPrintVoucher.vendorName,
            beneficiaryName: selectedPrintVoucher.vendorName,
            bankName: 'HDFC Bank Ltd',
            accountNumber: `9180${Math.floor(10000000 + Math.random() * 90000000)}`,
            ifscCode: 'HDFC0000128',
            invoiceRef: selectedPrintVoucher.invoiceRef,
            grossAmount: selectedPrintVoucher.amount / 0.98,
            tdsAmount: (selectedPrintVoucher.amount / 0.98) * 0.02,
            netAmount: selectedPrintVoucher.amount,
            matchStatus: selectedPrintVoucher.remarks.toLowerCase().includes('discrepancy') ? 'DISCREPANCY' : 'MATCHED',
            discrepancyReason: selectedPrintVoucher.remarks,
            approvers: voucherApprovers || undefined,
          }}
          onClose={() => setSelectedPrintVoucher(null)}
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
