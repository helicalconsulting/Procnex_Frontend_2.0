import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Search,
  FileText,
  Calendar,
  Building2,
  DollarSign,
  Trash2,
  Eye,
  XCircle,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  Check,
  Filter,
  Info,
} from 'lucide-react';
import { CurrencyBadge, CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import { RecordStatusBadge } from '@/components/shared/RecordStatusBadge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Textarea } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { DataTableViewport } from '../../components/ui/data-table-viewport';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { TableSkeleton } from '@/components/shared/Skeleton';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TablePagination } from '../../components/shared/TablePagination';
import { useServiceData } from '../../hooks/useServiceData';
import {
  vendorPortalService,
  type VendorPaymentRecord,
  type RecordVendorPaymentPayload,
} from '../../services/vendorPortalService';
import { useSuccessModal } from '../../context/SuccessModalContext';
import { cn } from '../../lib/utils';
import { getVendorPath } from '../../utils/tenantResolver';

const PAYMENT_METHODS = [
  { value: 'NEFT', label: 'Bank Transfer (NEFT / RTGS)' },
  { value: 'IMPS', label: 'IMPS / Instant Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'WIRE', label: 'Wire Transfer (SWIFT)' },
  { value: 'CHEQUE', label: 'Cheque / Demand Draft' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other Channel' },
];

export default function VendorPaymentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showSuccess } = useSuccessModal();
  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);

  // Active view: 'LEDGER' (Recorded Payments) vs 'INVOICES' (Invoice-wise status)
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'INVOICES'>('LEDGER');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RECEIVED' | 'CLEARED' | 'PARTIAL'>('ALL');

  // Modal states
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedPaymentForView, setSelectedPaymentForView] = useState<VendorPaymentRecord | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<VendorPaymentRecord | null>(null);

  // Notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State for Recording Payment
  const [formData, setFormData] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    amount: string;
    paymentDate: string;
    method: string;
    referenceNumber: string;
    bankAccount: string;
    comments: string;
    status: string;
  }>({
    invoiceId: '',
    invoiceNumber: '',
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    method: 'NEFT',
    referenceNumber: '',
    bankAccount: '',
    comments: '',
    status: 'RECEIVED',
  });
  const [submitting, setSubmitting] = useState(false);

  // Load Invoices
  const {
    data: invoices,
    loading: invoicesLoading,
    forceRefresh: forceRefreshInvoices,
  } = useServiceData(
    () => vendorPortalService.listInvoices(),
    [] as VendorInvoiceMock[],
    [],
    { cacheKey: 'vendor:invoices', cacheTtlMs: 0 }
  );

  // Load Payments
  const {
    data: payments,
    loading: paymentsLoading,
    forceRefresh: forceRefreshPayments,
  } = useServiceData(
    () => vendorPortalService.listPayments(),
    [] as VendorPaymentRecord[],
    [],
    { cacheKey: 'vendor:payments', cacheTtlMs: 0 }
  );

  const refreshAll = () => {
    forceRefreshInvoices();
    forceRefreshPayments();
    queryClient.invalidateQueries({ queryKey: ['svc'] });
  };

  useEffect(() => {
    window.addEventListener('focus', refreshAll);
    return () => {
      window.removeEventListener('focus', refreshAll);
    };
  }, []);

  // Normalize and deduplicate invoices so Vendor Portal displays ONLY vendor invoice numbers and no duplicate entries
  const normalizedInvoices = useMemo(() => {
    const rawList = invoices || [];
    const isInternalPattern = (num: string) =>
      /^[A-Za-z0-9]+-INV-\d+/i.test(num) || /^COMP-INV/i.test(num) || /^[A-Za-z]{2,5}-INV-/i.test(num);

    const poGroups = new Map<string, any[]>();
    const nonPoInvoices: any[] = [];

    rawList.forEach((inv) => {
      const poKey = (inv.poNumber && inv.poNumber !== '—') ? inv.poNumber : (inv.poId && String(inv.poId) !== '—' ? String(inv.poId) : null);
      if (poKey) {
        if (!poGroups.has(poKey)) poGroups.set(poKey, []);
        poGroups.get(poKey)!.push(inv);
      } else {
        nonPoInvoices.push(inv);
      }
    });

    const result: any[] = [];

    for (const [poKey, group] of poGroups.entries()) {
      let bestVendorInvoiceNumber = '';
      const withErpRef = group.find((i) => i.erpInvoiceRef && !isInternalPattern(i.erpInvoiceRef));
      if (withErpRef) bestVendorInvoiceNumber = withErpRef.erpInvoiceRef;

      if (!bestVendorInvoiceNumber) {
        const vendorInv = group.find((i) => i.invoiceNumber && !isInternalPattern(i.invoiceNumber));
        if (vendorInv) bestVendorInvoiceNumber = vendorInv.invoiceNumber;
      }

      if (!bestVendorInvoiceNumber) {
        const anyRef = group.find((i) => i.erpInvoiceRef);
        if (anyRef) bestVendorInvoiceNumber = anyRef.erpInvoiceRef;
      }

      if (!bestVendorInvoiceNumber) {
        bestVendorInvoiceNumber = group[0].invoiceNumber;
      }

      const hasPaid = group.some((i) => ['PAID', 'COMPLETED', 'CONFIRMED', 'SETTLED'].includes(String(i.status || '').toUpperCase()));
      const hasApproved = group.some((i) => ['APPROVED', 'POSTED', 'REGISTERED'].includes(String(i.status || '').toUpperCase()));
      const hasRejected = group.some((i) => ['REJECTED', 'CANCELLED'].includes(String(i.status || '').toUpperCase()));

      let resolvedStatus = 'PENDING';
      if (hasPaid) resolvedStatus = 'PAID';
      else if (hasApproved) resolvedStatus = 'APPROVED';
      else if (hasRejected) resolvedStatus = 'REJECTED';
      else if (group.some((i) => i.status)) resolvedStatus = group.find((i) => i.status)?.status || 'PENDING';

      const primary =
        group.find((i) => ['PAID', 'COMPLETED', 'CONFIRMED'].includes(String(i.status || '').toUpperCase())) ||
        group.find((i) => ['APPROVED', 'POSTED'].includes(String(i.status || '').toUpperCase())) ||
        group[0];

      result.push({
        ...primary,
        invoiceNumber: bestVendorInvoiceNumber,
        status: resolvedStatus,
      });
    }

    nonPoInvoices.forEach((inv) => {
      const invNum = inv.erpInvoiceRef && !isInternalPattern(inv.erpInvoiceRef)
        ? inv.erpInvoiceRef
        : inv.invoiceNumber;
      result.push({
        ...inv,
        invoiceNumber: invNum,
      });
    });

    return result;
  }, [invoices]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    const invList = normalizedInvoices;
    const payList = payments || [];

    const totalInvoiced = invList.reduce((acc, inv) => acc + convert(inv.totalAmount || inv.amount || 0, (inv as any).currency || companyDefaultCurrency, displayCurrency), 0);
    const totalReceived = payList.reduce((acc, pay) => acc + convert(pay.amount || 0, (pay as any).currency || companyDefaultCurrency, displayCurrency), 0);
    const pendingBalance = Math.max(0, totalInvoiced - totalReceived);
    const fullyPaidInvoices = invList.filter((inv) => inv.status === 'PAID').length;

    return {
      totalInvoiced,
      totalReceived,
      pendingBalance,
      paymentsCount: payList.length,
      fullyPaidInvoices,
      totalInvoices: invList.length,
    };
  }, [normalizedInvoices, payments, displayCurrency, companyDefaultCurrency, convert]);

  // Invoice balance lookup map
  const invoiceStatsMap = useMemo(() => {
    const map = new Map<string, { totalAmount: number; paidAmount: number; balance: number; poNumber: string }>();
    
    normalizedInvoices.forEach((inv) => {
      const invTotal = inv.totalAmount || inv.amount || 0;
      map.set(inv.invoiceNumber, {
        totalAmount: invTotal,
        paidAmount: 0,
        balance: invTotal,
        poNumber: inv.poNumber || '—',
      });
      if (inv.id) {
        map.set(String(inv.id), {
          totalAmount: invTotal,
          paidAmount: 0,
          balance: invTotal,
          poNumber: inv.poNumber || '—',
        });
      }
    });

    // Aggregate paid amounts from payments
    (payments || []).forEach((pay) => {
      const target = pay.invoiceNumber ? map.get(pay.invoiceNumber) : (pay.invoiceId ? map.get(pay.invoiceId) : null);
      if (target) {
        target.paidAmount += pay.amount || 0;
        target.balance = Math.max(0, target.totalAmount - target.paidAmount);
      }
    });

    return map;
  }, [normalizedInvoices, payments]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (payments || []).filter((pay) => {
      const matchQuery =
        !q ||
        [
          pay.paymentNumber,
          pay.invoiceNumber,
          pay.poNumber,
          pay.referenceNumber,
          pay.method,
          pay.comments,
        ].some((f) => (f || '').toLowerCase().includes(q));

      const matchStatus =
        statusFilter === 'ALL' ||
        (pay.status || '').toUpperCase() === statusFilter;

      return matchQuery && matchStatus;
    });
  }, [payments, search, statusFilter]);

  // Filtered Invoices for Invoices tab
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return normalizedInvoices.filter((inv) => {
      return (
        !q ||
        [inv.invoiceNumber, inv.poNumber, inv.description, inv.status].some((f) =>
          (f || '').toLowerCase().includes(q)
        )
      );
    });
  }, [normalizedInvoices, search]);

  const [ledgerPage, setLedgerPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const pageSize = 8;

  const totalLedgerPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const paginatedPayments = useMemo(() => {
    const start = (ledgerPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, ledgerPage, pageSize]);

  const totalInvoicesPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const paginatedInvoices = useMemo(() => {
    const start = (invoicesPage - 1) * pageSize;
    return filteredInvoices.slice(start, start + pageSize);
  }, [filteredInvoices, invoicesPage, pageSize]);

  const amount = (val: number, fromCurrency?: string) => formatAmount(convert(val, fromCurrency || companyDefaultCurrency, displayCurrency), displayCurrency);
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Open Record Modal pre-populated with optional invoice
  const handleOpenRecordModal = (invoice?: VendorInvoiceMock) => {
    setErrorMsg(null);
    if (invoice) {
      const invStats = invoiceStatsMap.get(invoice.invoiceNumber) || {
        totalAmount: invoice.totalAmount || invoice.amount || 0,
        paidAmount: 0,
        balance: invoice.totalAmount || invoice.amount || 0,
      };
      setFormData({
        invoiceId: String(invoice.id || ''),
        invoiceNumber: invoice.invoiceNumber,
        amount: invStats.balance > 0 ? String(invStats.balance) : String(invoice.totalAmount || invoice.amount || 0),
        paymentDate: new Date().toISOString().slice(0, 10),
        method: 'NEFT',
        referenceNumber: '',
        bankAccount: '',
        comments: `Payment received for Invoice #${invoice.invoiceNumber}`,
        status: 'RECEIVED',
      });
    } else {
      // Default to first invoice with pending balance if available
      const firstPending = (invoices || []).find((inv) => {
        const stats = invoiceStatsMap.get(inv.invoiceNumber);
        return stats ? stats.balance > 0 : true;
      });

      if (firstPending) {
        const stats = invoiceStatsMap.get(firstPending.invoiceNumber);
        setFormData({
          invoiceId: String(firstPending.id || ''),
          invoiceNumber: firstPending.invoiceNumber,
          amount: stats ? String(stats.balance) : String(firstPending.totalAmount || 0),
          paymentDate: new Date().toISOString().slice(0, 10),
          method: 'NEFT',
          referenceNumber: '',
          bankAccount: '',
          comments: `Payment received for Invoice #${firstPending.invoiceNumber}`,
          status: 'RECEIVED',
        });
      } else {
        setFormData({
          invoiceId: '',
          invoiceNumber: '',
          amount: '',
          paymentDate: new Date().toISOString().slice(0, 10),
          method: 'NEFT',
          referenceNumber: '',
          bankAccount: '',
          comments: '',
          status: 'RECEIVED',
        });
      }
    }
    setIsRecordModalOpen(true);
  };

  // Handle invoice selection change in modal
  const handleInvoiceSelectChange = (selectedInvNum: string) => {
    const inv = (invoices || []).find((i) => i.invoiceNumber === selectedInvNum);
    if (inv) {
      const stats = invoiceStatsMap.get(inv.invoiceNumber);
      const remBalance = stats ? stats.balance : inv.totalAmount || inv.amount || 0;
      setFormData((prev) => ({
        ...prev,
        invoiceId: String(inv.id || ''),
        invoiceNumber: inv.invoiceNumber,
        amount: remBalance > 0 ? String(remBalance) : String(inv.totalAmount || inv.amount || 0),
        comments: `Payment received for Invoice #${inv.invoiceNumber}`,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        invoiceId: '',
        invoiceNumber: selectedInvNum,
      }));
    }
  };

  // Handle Form Submit
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const payAmount = parseFloat(formData.amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      setErrorMsg('Please enter a valid payment amount greater than 0.');
      return;
    }

    if (!formData.invoiceNumber.trim()) {
      setErrorMsg('Please select or specify the Invoice against which payment is received.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: RecordVendorPaymentPayload = {
        invoiceId: formData.invoiceId || undefined,
        invoiceNumber: formData.invoiceNumber.trim(),
        amount: payAmount,
        currency: displayCurrency,
        method: formData.method,
        referenceNumber: formData.referenceNumber.trim() || undefined,
        bankAccount: formData.bankAccount.trim() || undefined,
        paymentDate: formData.paymentDate,
        comments: formData.comments.trim() || undefined,
        status: formData.status,
      };

      const created = await vendorPortalService.recordPayment(payload);
      setIsRecordModalOpen(false);
      refreshAll();

      showSuccess({
        title: 'Payment Recorded Successfully!',
        badge: 'PAYMENT RECEIVED',
        message: `Payment of ${amount(payAmount)} against Invoice #${formData.invoiceNumber} has been verified and registered.`,
        referenceNumber: created.paymentNumber,
        details: [
          { label: 'Target Invoice', value: formData.invoiceNumber },
          { label: 'Amount Received', value: `${amount(payAmount)}` },
          { label: 'Payment Mode', value: formData.method },
          { label: 'Payment Date', value: formatDate(formData.paymentDate) },
          ...(formData.referenceNumber ? [{ label: 'UTR / Txn Ref', value: formData.referenceNumber }] : []),
          ...(formData.bankAccount ? [{ label: 'Bank Account', value: formData.bankAccount }] : []),
        ],
        primaryBtnText: 'View in Ledger',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete / Void Payment
  const handleConfirmDeletePayment = async () => {
    if (!paymentToDelete) return;
    const deletedPay = paymentToDelete;
    try {
      await vendorPortalService.deletePayment(deletedPay.id);
      setPaymentToDelete(null);
      refreshAll();

      showSuccess({
        title: 'Payment Voucher Removed',
        badge: 'PAYMENT VOIDED',
        type: 'info',
        message: `Payment entry ${deletedPay.paymentNumber} has been removed. Outstanding balance on Invoice #${deletedPay.invoiceNumber} has been restored.`,
        primaryBtnText: 'Continue',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete payment record.');
    }
  };

  return (
    <PageFrame>
      <PageLead
        title="Payments Received"
        description="Track and record payments received against submitted invoices."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />
            <Button
              onClick={() => handleOpenRecordModal()}
              className="gap-1.5 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={16} /> Record Payment Received
            </Button>
          </div>
        }
      />
      {errorMsg && (
        <div className="mb-4">
          <MessageStrip type="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </MessageStrip>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Invoiced"
          value={formatAmount(summary.totalInvoiced, displayCurrency)}
          detail={`${summary.totalInvoices} invoices submitted`}
          icon={Receipt}
          aria-pressed={true}
        />
        <MetricCard
          label="Payments Received"
          value={formatAmount(summary.totalReceived, displayCurrency)}
          detail={`${summary.paymentsCount} payments recorded`}
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard
          label="Outstanding Balance"
          value={formatAmount(summary.pendingBalance, displayCurrency)}
          detail={summary.pendingBalance === 0 ? 'All cleared' : 'Awaiting payment'}
          icon={Clock}
          tone={summary.pendingBalance > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Fully Paid Invoices"
          value={`${summary.fullyPaidInvoices} / ${summary.totalInvoices}`}
          detail={`${summary.totalInvoices - summary.fullyPaidInvoices} pending full settlement`}
          icon={Wallet}
          tone="primary"
        />
      </div>

      {/* Tabs & Filter Bar */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-secondary/70 p-1 border border-border/60">
          <button
            type="button"
            onClick={() => { setActiveTab('LEDGER'); setLedgerPage(1); }}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all',
              activeTab === 'LEDGER'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CreditCard className="size-3.5" />
            <span>Payments Ledger ({filteredPayments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('INVOICES'); setInvoicesPage(1); }}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all',
              activeTab === 'INVOICES'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Receipt className="size-3.5" />
            <span>Invoice Payment Status ({(invoices || []).length})</span>
          </button>
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-1 items-center justify-end gap-2.5 max-w-xl">
          <div className="relative w-full max-w-sm">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-10 rounded-xl pl-9 pr-9 text-xs"
              type="text"
              placeholder={activeTab === 'LEDGER' ? 'Search payment #, UTR, invoice...' : 'Search invoice, PO #...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLedgerPage(1);
                setInvoicesPage(1);
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setLedgerPage(1);
                  setInvoicesPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>

          {activeTab === 'LEDGER' && (
            <div className="flex items-center gap-1">
              {(['ALL', 'RECEIVED', 'CLEARED', 'PARTIAL'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => { setStatusFilter(st); setLedgerPage(1); }}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                    statusFilter === st
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  {st === 'ALL' ? 'All' : st === 'RECEIVED' ? 'Received' : st === 'CLEARED' ? 'Cleared' : 'Partial'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: PAYMENTS LEDGER */}
      {activeTab === 'LEDGER' && (
        <>
          {paymentsLoading ? (
            <TableSkeleton rows={5} columns={8} />
          ) : filteredPayments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payment records found"
              description={
                search || statusFilter !== 'ALL'
                  ? 'No payments match your active filters.'
                  : 'Record payments received against your invoices to maintain an accurate ledger.'
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
                    Reset Filters
                  </Button>
                ) : (
                  <Button onClick={() => handleOpenRecordModal()} className="gap-1.5">
                    <Plus size={16} /> Record First Payment
                  </Button>
                )
              }
            />
          ) : (
            <Card className="overflow-hidden border border-border/80 shadow-xs">
              <DataTableViewport label="Payments ledger" showHint={false}>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-border/70 bg-secondary/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Payment #</th>
                      <th className="px-4 py-3">Invoice & PO Ref</th>
                      <th className="px-4 py-3">Payment Date</th>
                      <th className="px-4 py-3">Payment Mode</th>
                      <th className="px-4 py-3">Transaction / UTR Ref</th>
                      <th className="px-4 py-3">Amount Received</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginatedPayments.map((pay) => (
                      <tr key={pay.id} className="transition-colors hover:bg-accent/30">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                              <CreditCard className="size-4" />
                            </span>
                            <div>
                              <div className="font-semibold text-primary">{pay.paymentNumber}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {pay.bankAccount ? `A/C: ${pay.bankAccount}` : 'Direct Receipt'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-foreground">{pay.invoiceNumber}</div>
                          {pay.poNumber && pay.poNumber !== '—' && (
                            <div className="text-[11px] text-muted-foreground">PO: {pay.poNumber}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="size-3 text-muted-foreground" />
                            {formatDate(pay.paymentDate)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className="text-[11px] font-medium bg-secondary/40">
                            {pay.method || 'NEFT'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground">
                          {pay.referenceNumber || '—'}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          + {amount(pay.amount, (pay as any).currency)} <CurrencyBadge currency={displayCurrency} size="sm" />
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                              pay.status === 'CLEARED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : pay.status === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            )}
                          >
                            <Check className="size-3" />
                            {pay.status === 'CLEARED' ? 'Cleared' : pay.status === 'PARTIAL' ? 'Partial' : 'Received'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => setSelectedPaymentForView(pay)}
                              title="View Payment Voucher Details"
                            >
                              <Eye size={15} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setPaymentToDelete(pay)}
                              title="Delete / Void Payment"
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableViewport>
              <TablePagination
                currentPage={ledgerPage}
                totalPages={totalLedgerPages}
                onPageChange={setLedgerPage}
                totalItems={filteredPayments.length}
                perPage={pageSize}
                className="border-t border-border rounded-none"
              />
            </Card>
          )}
        </>
      )}

      {/* TAB 2: INVOICE PAYMENT STATUS */}
      {activeTab === 'INVOICES' && (
        <>
          {invoicesLoading ? (
            <TableSkeleton rows={5} columns={8} />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices found"
              description="Create and submit invoices to view their payment settlement status."
              action={
                <Button onClick={() => navigate(getVendorPath('/vendor/create-invoice'))} className="gap-1.5">
                  <Plus size={16} /> Create Invoice
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden border border-border/80 shadow-xs">
              <DataTableViewport label="Invoice payment status" showHint={false}>
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-border/70 bg-secondary/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Invoice Number</th>
                      <th className="px-4 py-3">PO Reference</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Invoice Total</th>
                      <th className="px-4 py-3">Total Paid</th>
                      <th className="px-4 py-3">Balance Due</th>
                      <th className="px-4 py-3">Settlement Status</th>
                      <th className="px-4 py-3 text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginatedInvoices.map((inv) => {
                      const stats = invoiceStatsMap.get(inv.invoiceNumber) || {
                        totalAmount: inv.totalAmount || inv.amount || 0,
                        paidAmount: 0,
                        balance: inv.totalAmount || inv.amount || 0,
                      };
                      const isSettled = stats.balance <= 0 || inv.status === 'PAID';
                      const isPartial = stats.paidAmount > 0 && stats.balance > 0;

                      return (
                        <tr key={inv.id || inv.invoiceNumber} className="transition-colors hover:bg-accent/30">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                                <FileText className="size-4" />
                              </span>
                              <div>
                                <div className="font-semibold text-primary">{inv.invoiceNumber}</div>
                                <div className="text-[11px] text-muted-foreground max-w-44 truncate">
                                  {inv.description || inv.rfqNumber || 'Direct Purchase Invoice'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-medium">{inv.poNumber || '—'}</td>
                          <td className="px-4 py-3.5 text-xs text-muted-foreground">
                            {formatDate(inv.dueDate)}
                          </td>
                          <td className="px-4 py-3.5 font-semibold tabular-nums">
                            {amount(stats.totalAmount, (inv as any).currency)}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {amount(stats.paidAmount, (inv as any).currency)}
                          </td>
                          <td className="px-4 py-3.5 font-bold tabular-nums">
                            <span className={stats.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                              {amount(stats.balance, (inv as any).currency)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {isSettled ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold text-[11px] border-emerald-200">
                                <Check className="size-3 mr-1" /> Fully Paid
                              </Badge>
                            ) : isPartial ? (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-semibold text-[11px] border-amber-200">
                                Partial ({Math.round((stats.paidAmount / stats.totalAmount) * 100)}%)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground">
                                Unpaid / Awaiting
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                'gap-1 text-xs h-8 shadow-2xs',
                                isSettled
                                  ? 'opacity-60 hover:opacity-100'
                                  : 'border-primary/40 text-primary hover:bg-primary/10'
                              )}
                              onClick={() => handleOpenRecordModal(inv)}
                            >
                              <Plus size={13} /> {isSettled ? 'Add Adjustment' : 'Record Payment'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTableViewport>
              <TablePagination
                currentPage={invoicesPage}
                totalPages={totalInvoicesPages}
                onPageChange={setInvoicesPage}
                totalItems={filteredInvoices.length}
                perPage={pageSize}
                className="border-t border-border rounded-none"
              />
            </Card>
          )}
        </>
      )}

      {/* MODAL: RECORD PAYMENT RECEIVED */}
      <Dialog open={isRecordModalOpen} onOpenChange={setIsRecordModalOpen}>
        <DialogContent className="max-w-2xl sm:max-w-3xl p-0 gap-0 overflow-hidden flex flex-col">
          {/* SAP-style header bar */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border/70 bg-muted/30">
            <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary shrink-0">
              <CreditCard className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground leading-tight">Record Payment Received</h2>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">Register a received payment against an invoice</p>
            </div>
          </div>

          <form onSubmit={handleSavePayment} className="flex flex-col min-h-0">
            <div className="px-6 py-6 space-y-6 overflow-y-auto max-h-[calc(100svh-200px)]">
              {errorMsg && (
                <div className="rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive flex items-center gap-2 border border-destructive/20">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Section: Invoice Reference */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Invoice Reference</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Target Invoice <span className="text-destructive">*</span></label>
                    {formData.invoiceNumber && (
                      <span className="text-xs text-muted-foreground">
                        Outstanding: <span className="font-semibold text-foreground">{amount(invoiceStatsMap.get(formData.invoiceNumber)?.balance ?? 0)}</span>
                      </span>
                    )}
                  </div>
                  {(invoices || []).length > 0 ? (
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                      value={formData.invoiceNumber}
                      onChange={(e) => handleInvoiceSelectChange(e.target.value)}
                      required
                    >
                      <option value="">— Select Invoice —</option>
                      {(invoices || []).map((inv) => {
                        const stats = invoiceStatsMap.get(inv.invoiceNumber);
                        const bal = stats ? stats.balance : inv.totalAmount || 0;
                        return (
                          <option key={inv.id || inv.invoiceNumber} value={inv.invoiceNumber}>
                            {inv.invoiceNumber} | PO: {inv.poNumber} | Total: {amount(inv.totalAmount || 0)} | Due: {amount(bal)}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <Input
                      placeholder="Enter Invoice Number (e.g. INV-2026-001)"
                      value={formData.invoiceNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                      required
                      className="h-9"
                    />
                  )}
                </div>
              </div>

              {/* Section: Payment Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Payment Details</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  {/* Amount + Currency Selector */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Amount <span className="text-destructive">*</span></label>
                    <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
                      <div className="shrink-0 border-r border-input">
                        <CurrencySelector
                          value={displayCurrency}
                          onChange={setDisplayCurrency}
                          size="sm"
                        />
                      </div>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                        className="flex-1 min-w-0 px-3 text-sm font-semibold text-foreground bg-transparent outline-none placeholder:text-muted-foreground"
                        required
                      />
                    </div>
                  </div>
                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Payment Date <span className="text-destructive">*</span></label>
                    <Input
                      type="date"
                      value={formData.paymentDate ? String(formData.paymentDate).slice(0, 10) : ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, paymentDate: e.target.value }))}
                      className="h-10 text-sm"
                      required
                    />
                  </div>
                  {/* Method */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Payment Mode <span className="text-destructive">*</span></label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                      value={formData.method}
                      onChange={(e) => setFormData((prev) => ({ ...prev, method: e.target.value }))}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* UTR */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">UTR / Txn ID / Cheque No.</label>
                    <Input
                      placeholder="e.g. UTR19283746592"
                      value={formData.referenceNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, referenceNumber: e.target.value }))}
                      className="h-10 text-sm"
                    />
                  </div>
                  {/* Bank */}
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-foreground">
                      Receiving Bank / Account{' '}
                      <span className="text-muted-foreground font-normal text-xs">(Optional)</span>
                    </label>
                    <Input
                      placeholder="e.g. HDFC Bank - A/C No. ****4829"
                      value={formData.bankAccount}
                      onChange={(e) => setFormData((prev) => ({ ...prev, bankAccount: e.target.value }))}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Settlement Status */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Settlement Status</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'RECEIVED', label: 'Payment Received', desc: 'Credited to account' },
                    { id: 'CLEARED', label: 'Cleared in Bank', desc: 'Cheque/Txn cleared' },
                    { id: 'PARTIAL', label: 'Partial Installment', desc: 'Part of invoice value' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, status: s.id }))}
                      className={cn(
                        'flex flex-col text-left px-3.5 py-3 rounded-md border transition-all',
                        formData.status === s.id
                          ? 'border-primary/60 bg-primary/8 ring-1 ring-primary/30'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <span className={cn('font-semibold text-sm leading-snug', formData.status === s.id ? 'text-primary' : 'text-foreground')}>{s.label}</span>
                      <span className="text-xs text-muted-foreground mt-1 leading-tight">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Remarks / Notes</label>
                <Textarea
                  rows={2}
                  placeholder="Add any payment verification details or notes..."
                  value={formData.comments}
                  onChange={(e) => setFormData((prev) => ({ ...prev, comments: e.target.value }))}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            {/* SAP-style footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/70 bg-muted/20">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRecordModalOpen(false)}
                disabled={submitting}
                className="min-w-24 h-10"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2 min-w-44 h-10">
                {submitting ? (
                  <span>Recording...</span>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Save & Record Payment
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: VIEW PAYMENT DETAILS */}
      <Dialog
        open={Boolean(selectedPaymentForView)}
        onOpenChange={(open) => !open && setSelectedPaymentForView(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              <span>Payment Receipt Voucher</span>
            </DialogTitle>
            <DialogDescription>
              Recorded transaction details for payment reference {selectedPaymentForView?.paymentNumber}.
            </DialogDescription>
          </DialogHeader>

          {selectedPaymentForView && (
            <div className="space-y-4 pt-1 text-sm">
              <div className="rounded-xl bg-secondary/50 p-4 border border-border/60 space-y-2.5">
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground">Payment Voucher #</span>
                  <span className="font-mono font-bold text-primary">{selectedPaymentForView.paymentNumber}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground">Invoice Reference</span>
                  <span className="font-semibold text-foreground">{selectedPaymentForView.invoiceNumber}</span>
                </div>
                {selectedPaymentForView.poNumber && selectedPaymentForView.poNumber !== '—' && (
                  <div className="flex justify-between items-center border-b border-border/50 pb-2">
                    <span className="text-xs text-muted-foreground">Purchase Order</span>
                    <span className="font-medium">{selectedPaymentForView.poNumber}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground">Payment Date</span>
                  <span>{formatDate(selectedPaymentForView.paymentDate)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground">Payment Method</span>
                  <Badge variant="outline">{selectedPaymentForView.method}</Badge>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground">Transaction / UTR Ref</span>
                  <span className="font-mono text-xs">{selectedPaymentForView.referenceNumber || '—'}</span>
                </div>
                {selectedPaymentForView.bankAccount && (
                  <div className="flex justify-between items-center border-b border-border/50 pb-2">
                    <span className="text-xs text-muted-foreground">Bank Account</span>
                    <span>{selectedPaymentForView.bankAccount}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1">
                  <span className="text-sm font-semibold">Amount Received</span>
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {amount(selectedPaymentForView.amount)}
                  </span>
                </div>
              </div>

              {selectedPaymentForView.comments && (
                <div className="rounded-lg bg-background p-3 border border-border/60 text-xs">
                  <span className="font-semibold text-muted-foreground block mb-1">Remarks:</span>
                  <p className="text-foreground">{selectedPaymentForView.comments}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setSelectedPaymentForView(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CONFIRM DELETE PAYMENT */}
      <Dialog
        open={Boolean(paymentToDelete)}
        onOpenChange={(open) => !open && setPaymentToDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              <span>Delete Payment Entry?</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove payment voucher{' '}
              <strong>{paymentToDelete?.paymentNumber}</strong> ({amount(paymentToDelete?.amount || 0)})?
              The outstanding balance on Invoice {paymentToDelete?.invoiceNumber} will be restored.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3">
            <Button variant="outline" onClick={() => setPaymentToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeletePayment}>
              Yes, Delete Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
