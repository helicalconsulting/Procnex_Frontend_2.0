import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { invoiceService, type APInvoice as ServiceAPInvoice } from '../../services/invoiceService';
import { localDataService } from '../../services/localDataService';
import { approvalService } from '../../services/approvalService';
import { sseClient } from '../../services/sseClient';
import { apiRequest } from '../../api/client';
import type { ApprovalTableRow } from '../../types/viewModels';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import ColumnCustomizer, { type ColumnDef } from '../../components/shared/ColumnCustomizer';
import PrintPurchaseInvoiceModal from '../../components/invoices/PrintPurchaseInvoiceModal';
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
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  IndianRupee,
  MessageSquare,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  Wallet,
  X,
} from 'lucide-react';
import '../../components/shared/ColumnCustomizer.css';

type APStatus = 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL' | 'APPROVED' | 'REJECTED' | 'RETURNED';
type ActionType = 'approve' | 'reject' | 'return';
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface APInvoice {
  id: string | number;
  approvalId?: string;
  invoiceNumber: string;
  poNumber: string;
  vendorName: string;
  vendorInitials: string;
  avatarMod: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  invoiceDate: string;
  status: APStatus;
  paymentTerms: string;
  department: string;
  currentLevel: number;
  totalLevels: number;
  requiredRole: string;
  canAct: boolean;
  comments?: string;
}

const STATUS_CONFIG: Record<APStatus, { label: string; tone: Tone; icon: typeof Clock }> = {
  PENDING: { label: 'Pending', tone: 'warning', icon: Clock },
  OVERDUE: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
  PAID: { label: 'Paid', tone: 'success', icon: CheckCircle2 },
  PARTIAL: { label: 'Partial', tone: 'info', icon: IndianRupee },
  APPROVED: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: X },
  RETURNED: { label: 'Returned', tone: 'neutral', icon: RotateCcw },
};

function StatusBadge({ status }: { status: APStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  return (
    <Badge tone={config.tone}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}

const isRoleMatching = (requiredRole?: string, userRoles?: string[]): boolean => {
  if (!requiredRole || !userRoles || userRoles.length === 0) return false;
  const stripPrefix = (str: string) =>
    str.replace(/^level\s*\d+(\s*of\s*\d+)?\s*:\s*/i, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const reqClean = stripPrefix(requiredRole);

  const aliases: Record<string, string[]> = {
    purchasemanager: ['purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager', 'l1user', 'l1_user', 'l1', 'approver1', 'level1user', 'level1', 'procurement', 'buyer'],
    l1user: ['l1user', 'l1_user', 'l1', 'approver1', 'level1user', 'level1', 'purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager', 'procurement', 'purchaseclerk', 'buyer'],
    financeapprover: ['financeapprover', 'financemanager', 'finance_approver', 'finance_manager', 'finance', 'l2user', 'l2_user', 'l2', 'approver2', 'level2user', 'level2'],
    l2user: ['l2user', 'l2_user', 'l2', 'approver2', 'level2user', 'level2', 'financeapprover', 'financemanager', 'finance_approver', 'finance_manager', 'finance'],
  };

  return userRoles.some((r) => {
    const usrClean = stripPrefix(r);
    if (reqClean === usrClean) return true;
    if (aliases[reqClean] && aliases[reqClean].includes(usrClean)) return true;
    if (aliases[usrClean] && aliases[usrClean].includes(reqClean)) return true;
    return false;
  });
};

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'invoiceNumber', label: 'Invoice', defaultVisible: true, required: true },
  { key: 'vendorName', label: 'Vendor', defaultVisible: true, required: true },
  { key: 'poNumber', label: 'PO Ref', defaultVisible: true },
  { key: 'amount', label: 'Amount', defaultVisible: true },
  { key: 'paidAmount', label: 'Paid', defaultVisible: true },
  { key: 'balance', label: 'Balance', defaultVisible: true },
  { key: 'dueDate', label: 'Due Date', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
];

export default function AccountsPayablePage() {
  const navigate = useNavigate();
  const { roles: authRoles, hasPermission } = useAuth();
  const canApproveAP =
    hasPermission('Accounts Payable', 'canApprove') ||
    hasPermission('Create Purchase Invoice', 'canApprove') ||
    hasPermission('Invoices', 'canApprove') ||
    hasPermission('Accounts Payable', 'canCreate');

  const [invoicesList, setInvoicesList] = useState<APInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<APStatus | 'ALL'>('ALL');
  const [detailInvoice, setDetailInvoice] = useState<APInvoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<APInvoice | null>(null);
  const [actionModal, setActionModal] = useState<{ invoice: APInvoice; action: ActionType } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const [generatedVoucherBanner, setGeneratedVoucherBanner] = useState<{
    voucherNumber: string;
    invoiceNumber: string;
    vendorName: string;
    amount: number;
  } | null>(null);

  const { formatAmount, companyDefaultCurrency } = useCurrency();

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

  const fetchInvoicesData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [approvalRows, rawInvoices] = await Promise.all([
        approvalService.listTable({ module: 'AccountsPayable' }).catch(() => [] as ApprovalTableRow[]),
        invoiceService.list().catch(() => [] as ServiceAPInvoice[]),
      ]);

      const approvalMap = new Map<string, ApprovalTableRow>();
      approvalRows.forEach((a) => {
        if (a.referenceId) approvalMap.set(a.referenceId, a);
        if (a.referenceNumber) approvalMap.set(a.referenceNumber, a);
      });

      const merged: APInvoice[] = [];

      approvalRows.forEach((app, idx) => {
        const matchingRaw = rawInvoices.find(
          (inv) => inv.id === app.referenceId || inv.invoiceNumber === app.referenceNumber
        );

        const invNo = app.referenceNumber || matchingRaw?.invoiceNumber || `INV-${app.id.slice(-6)}`;
        const vName = matchingRaw?.vendorName || app.requestedBy || 'Vendor';
        const initials = vName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'VN';

        const statusMap: Record<string, APStatus> = {
          PENDING_APPROVAL: 'PENDING',
          PENDING: 'PENDING',
          APPROVED: 'APPROVED',
          PAID: 'PAID',
          PARTIAL: 'PARTIAL',
          OVERDUE: 'OVERDUE',
          REJECTED: 'REJECTED',
          RETURNED: 'RETURNED',
          AUTO_FORWARDED: 'PENDING',
        };

        const rawDocStatus = matchingRaw?.status ? statusMap[matchingRaw.status] : undefined;
        let status: APStatus = statusMap[app.status] || 'PENDING';
        if (rawDocStatus && ['APPROVED', 'PAID', 'REJECTED', 'RETURNED'].includes(rawDocStatus)) {
          status = rawDocStatus;
        }

        const amt =
          typeof app.amount === 'number'
            ? app.amount
            : parseFloat(String(app.amount).replace(/[^0-9.]/g, '')) || matchingRaw?.amount || 0;
        const reqRole = app.requiredRole || 'Purchase Manager';
        const effectiveCanAct =
          app.status === 'PENDING' && status === 'PENDING' && (app.canAct || isRoleMatching(reqRole, authRoles));

        merged.push({
          id: matchingRaw?.id || app.referenceId || app.id,
          approvalId: app.id,
          invoiceNumber: invNo,
          poNumber: matchingRaw?.poNumber || (app.title ? app.title.split('(PO: ')[1]?.replace(')', '') : '') || '—',
          vendorName: vName,
          vendorInitials: initials,
          avatarMod: String((idx % 6) + 1),
          amount: amt,
          paidAmount: status === 'PAID' ? amt : 0,
          dueDate: matchingRaw?.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          invoiceDate: app.submittedAt || matchingRaw?.submittedAt || new Date().toISOString(),
          status,
          paymentTerms: matchingRaw?.paymentTerms || 'Net 30',
          department: app.department || matchingRaw?.department || 'Finance',
          currentLevel: app.currentLevel || 1,
          totalLevels: app.totalLevels || 1,
          requiredRole: reqRole,
          canAct: effectiveCanAct,
          comments: app.comments,
        });
      });

      rawInvoices.forEach((inv, idx) => {
        const alreadyIn = merged.some(
          (m) => String(m.id) === String(inv.id) || m.invoiceNumber === inv.invoiceNumber
        );
        if (!alreadyIn) {
          const initials = inv.vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'VN';
          const statusMap: Record<string, APStatus> = {
            PENDING_APPROVAL: 'PENDING',
            PENDING: 'PENDING',
            APPROVED: 'APPROVED',
            PAID: 'PAID',
            PARTIAL: 'PARTIAL',
            OVERDUE: 'OVERDUE',
            REJECTED: 'REJECTED',
            RETURNED: 'RETURNED',
            DRAFT: 'PENDING',
          };
          const status = statusMap[inv.status] || 'PENDING';
          const effectiveCanAct = status === 'PENDING' && isRoleMatching('Purchase Manager', authRoles);

          merged.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            poNumber: inv.poNumber || '—',
            vendorName: inv.vendorName,
            vendorInitials: initials,
            avatarMod: String(((idx + merged.length) % 6) + 1),
            amount: inv.amount,
            paidAmount: status === 'PAID' ? inv.amount : 0,
            dueDate: inv.dueDate,
            invoiceDate: inv.submittedAt || new Date().toISOString(),
            status,
            paymentTerms: inv.paymentTerms || 'Net 30',
            department: inv.department || 'Finance',
            currentLevel: 1,
            totalLevels: 1,
            requiredRole: 'Purchase Manager',
            canAct: effectiveCanAct,
          });
        }
      });

      setInvoicesList(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase invoices');
    } finally {
      setLoading(false);
    }
  }, [authRoles]);

  useEffect(() => {
    fetchInvoicesData();

    const unsub1 = sseClient.on('approval_level_complete', fetchInvoicesData);
    const unsub2 = sseClient.on('approval_chain_complete', fetchInvoicesData);
    const unsub3 = sseClient.on('notification', fetchInvoicesData);

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [fetchInvoicesData]);

  const summary = useMemo(
    () => ({
      totalPayable: invoicesList.reduce((sum, invoice) => sum + invoice.amount - invoice.paidAmount, 0),
      overdue: invoicesList.filter((invoice) => invoice.status === 'OVERDUE').length,
      pending: invoicesList.filter((invoice) => invoice.status === 'PENDING').length,
      completed: invoicesList.filter((invoice) => ['PAID', 'APPROVED'].includes(invoice.status)).length,
    }),
    [invoicesList]
  );

  const isAdmin = useMemo(() => {
    if (!authRoles || authRoles.length === 0) return false;
    return authRoles.some((r) => r === 'Super Admin' || r === 'Administrator' || r.toLowerCase().includes('admin'));
  }, [authRoles]);

  const filtered = useMemo(() => {
    let list = invoicesList;
    if (!isAdmin) {
      list = list.filter((i) => {
        if (i.status === 'PENDING' && !i.canAct) return false;
        return true;
      });
    }
    const query = search.trim().toLowerCase();
    return list.filter(
      (invoice) =>
        (statusFilter === 'ALL' || invoice.status === statusFilter) &&
        (!query || [invoice.invoiceNumber, invoice.vendorName, invoice.poNumber].some((field) => (field || '').toLowerCase().includes(query)))
    );
  }, [invoicesList, search, statusFilter, isAdmin]);

  const handleAction = useCallback(async () => {
    if (!actionModal || !actionModal.invoice.approvalId) return;
    setActionSaving(true);
    const targetInvoice = actionModal.invoice;
    const approvalId = targetInvoice.approvalId!;
    const comment = actionComment.trim() || undefined;
    const act = actionModal.action;

    // ⚡ INSTANT (0ms) Optimistic local state update
    const newStatus: APStatus = act === 'approve' ? 'APPROVED' : act === 'reject' ? 'REJECTED' : 'RETURNED';
    setInvoicesList((prev) =>
      prev.map((inv) =>
        inv.id === targetInvoice.id || inv.invoiceNumber === targetInvoice.invoiceNumber || inv.approvalId === approvalId
          ? { ...inv, status: newStatus, canAct: false }
          : inv
      )
    );
    setActionModal(null);
    setActionComment('');

    try {
      if (act === 'approve') {
        const res = await approvalService.approve(approvalId, comment);
        const isFinal = res?.nextLevel === false || targetInvoice.currentLevel >= targetInvoice.totalLevels;

        if (isFinal) {
          const voucherNum = `VOU-2026-${Math.floor(1000 + Math.random() * 9000)}`;
          const createdVoucher = localDataService.savePayment({
            paymentId: voucherNum,
            vendor: targetInvoice.vendorName,
            invoiceRef: `Invoice: ${targetInvoice.invoiceNumber} | PO: ${targetInvoice.poNumber}`,
            amount: targetInvoice.amount,
            method: 'NEFT',
            status: 'PENDING',
            remarks: `Auto-generated from approved Purchase Invoice ${targetInvoice.invoiceNumber}`,
          });

          try {
            await apiRequest('/payments', {
              method: 'POST',
              body: JSON.stringify({
                vendorName: targetInvoice.vendorName,
                invoiceRef: `Invoice: ${targetInvoice.invoiceNumber} | PO: ${targetInvoice.poNumber}`,
                amount: targetInvoice.amount,
                method: 'NEFT',
                bankName: 'HDFC Bank Ltd',
                accountNumber: `9180${Math.floor(10000000 + Math.random() * 90000000)}`,
                ifscCode: 'HDFC0000128',
                beneficiaryName: targetInvoice.vendorName,
                status: 'PENDING',
              }),
            });
          } catch (_e) {}

          setGeneratedVoucherBanner({
            voucherNumber: createdVoucher.paymentId || voucherNum,
            invoiceNumber: targetInvoice.invoiceNumber,
            vendorName: targetInvoice.vendorName,
            amount: targetInvoice.amount,
          });
        }
      } else if (act === 'reject') {
        await approvalService.reject(approvalId, comment);
      } else {
        await approvalService.return(approvalId, comment, 'ORIGINATOR');
      }

      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
      await fetchInvoicesData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      await fetchInvoicesData();
    } finally {
      setActionSaving(false);
    }
  }, [actionModal, actionComment, fetchInvoicesData]);

  const openAction = useCallback((invoice: APInvoice, action: ActionType) => {
    setActionModal({ invoice, action });
    setActionComment('');
  }, []);

  const formatDate = (date: string) =>
    date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const cardProps = (filter: APStatus | 'ALL') => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': statusFilter === filter,
    onClick: () => setStatusFilter((current) => (current === filter && filter !== 'ALL' ? 'ALL' : filter)),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') setStatusFilter(filter);
    },
    className: cn(
      'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      statusFilter === filter && 'border-primary/40 ring-2 ring-primary/10'
    ),
  });

  const actionTitle =
    actionModal?.action === 'approve'
      ? 'Approve invoice'
      : actionModal?.action === 'reject'
      ? 'Reject invoice'
      : 'Return invoice';
  const destructive = actionModal?.action !== 'approve';

  return (
    <PageFrame>
      <PageLead
        title="Invoice approvals"
        description="Review outstanding purchase invoices and keep vendor payments moving."
      />

      {error && (
        <div className="mb-4">
          <MessageStrip type="error">{error}</MessageStrip>
        </div>
      )}

      {/* Auto-generated Payment Voucher Banner */}
      {generatedVoucherBanner && (
        <div className="mb-5 flex flex-col items-start justify-between gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold">
                Purchase Invoice {generatedVoucherBanner.invoiceNumber} Approved!
              </h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Payment Voucher <strong>#{generatedVoucherBanner.voucherNumber}</strong> for <strong>{generatedVoucherBanner.vendorName}</strong> ({formatAmount(generatedVoucherBanner.amount, companyDefaultCurrency)}) has been auto-generated.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => navigate('/payments')}>
              <span>View Payment Voucher</span>
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setGeneratedVoucherBanner(null)}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard {...cardProps('ALL')} label="Total payable" value={formatAmount(summary.totalPayable, companyDefaultCurrency)} detail="Outstanding balance" icon={Wallet} />
        <MetricCard {...cardProps('OVERDUE')} label="Overdue" value={summary.overdue} detail="Past due date" icon={AlertTriangle} tone="danger" />
        <MetricCard {...cardProps('PENDING')} label="Pending" value={summary.pending} detail="Awaiting review" icon={Clock} tone="warning" />
        <MetricCard {...cardProps('APPROVED')} label="Paid / approved" value={summary.completed} detail="Completed this period" icon={CheckCircle2} tone="success" />
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-10 pr-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice, vendor, or PO"
              aria-label="Search invoices"
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
          icon={Wallet}
          title="No invoices found"
          description={
            search || statusFilter !== 'ALL'
              ? 'Try clearing the search or status filter.'
              : 'Purchase invoices will appear here when submitted.'
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
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/55 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className={cn('px-4 py-3', ['amount', 'paidAmount', 'balance'].includes(col.key) && 'text-right')}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((invoice) => (
                    <tr key={invoice.id} className="transition-colors hover:bg-accent/35 cursor-pointer" onClick={() => setDetailInvoice(invoice)}>
                      {visibleColumns.map((col) => {
                        if (col.key === 'invoiceNumber') {
                          return (
                            <td key="invoiceNumber" className="px-4 py-3.5 font-semibold text-primary">
                              {invoice.invoiceNumber}
                            </td>
                          );
                        }
                        if (col.key === 'vendorName') {
                          return (
                            <td key="vendorName" className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-[12px] font-semibold text-primary">
                                  {invoice.vendorInitials}
                                </span>
                                <div>
                                  <div className="font-medium">{invoice.vendorName}</div>
                                  <div className="text-[12px] text-muted-foreground">{invoice.department}</div>
                                </div>
                              </div>
                            </td>
                          );
                        }
                        if (col.key === 'poNumber') {
                          return <td key="poNumber" className="px-4 py-3.5 text-xs text-muted-foreground">{invoice.poNumber}</td>;
                        }
                        if (col.key === 'amount') {
                          return (
                            <td key="amount" className="px-4 py-3.5 text-right font-medium tabular-nums">
                              {formatAmount(invoice.amount, companyDefaultCurrency)}
                            </td>
                          );
                        }
                        if (col.key === 'paidAmount') {
                          return (
                            <td key="paidAmount" className="px-4 py-3.5 text-right font-medium text-emerald-600 tabular-nums">
                              {formatAmount(invoice.paidAmount, companyDefaultCurrency)}
                            </td>
                          );
                        }
                        if (col.key === 'balance') {
                          return (
                            <td key="balance" className="px-4 py-3.5 text-right font-semibold tabular-nums">
                              {formatAmount(invoice.amount - invoice.paidAmount, companyDefaultCurrency)}
                            </td>
                          );
                        }
                        if (col.key === 'dueDate') {
                          return <td key="dueDate" className="px-4 py-3.5 text-xs text-muted-foreground">{formatDate(invoice.dueDate)}</td>;
                        }
                        if (col.key === 'status') {
                          return <td key="status" className="px-4 py-3.5"><StatusBadge status={invoice.status} /></td>;
                        }
                        return <td key={col.key} className="px-4 py-3.5">-</td>;
                      })}
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDetailInvoice(invoice)}
                            aria-label={`View ${invoice.invoiceNumber}`}
                            title="View Details"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPrintInvoice(invoice)}
                            aria-label={`Print ${invoice.invoiceNumber}`}
                            title="Print Invoice"
                          >
                            <Printer className="size-4" />
                          </Button>
                          {invoice.status === 'PENDING' && invoice.canAct ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                disabled={!canApproveAP}
                                onClick={() => canApproveAP && openAction(invoice, 'approve')}
                                aria-label={`Approve ${invoice.invoiceNumber}`}
                                title={canApproveAP ? 'Approve invoice' : 'Permission denied'}
                              >
                                <ThumbsUp className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={!canApproveAP}
                                onClick={() => canApproveAP && openAction(invoice, 'reject')}
                                aria-label={`Reject ${invoice.invoiceNumber}`}
                                title={canApproveAP ? 'Reject invoice' : 'Permission denied'}
                              >
                                <ThumbsDown className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={!canApproveAP}
                                onClick={() => canApproveAP && openAction(invoice, 'return')}
                                aria-label={`Return ${invoice.invoiceNumber}`}
                                title={canApproveAP ? 'Return invoice' : 'Permission denied'}
                              >
                                <RotateCcw className="size-4" />
                              </Button>
                            </>
                          ) : invoice.status === 'PENDING' ? (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              L{invoice.currentLevel} ({invoice.requiredRole})
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {filtered.map((invoice) => (
              <Card key={invoice.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-primary">{invoice.invoiceNumber}</div>
                    <div className="mt-1 truncate text-sm font-medium">{invoice.vendorName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">PO {invoice.poNumber}</div>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/45 p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="mt-1 font-semibold">{formatAmount(invoice.amount, companyDefaultCurrency)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Balance</dt>
                    <dd className="mt-1 font-semibold">{formatAmount(invoice.amount - invoice.paidAmount, companyDefaultCurrency)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Due</dt>
                    <dd className="mt-1 font-medium">{formatDate(invoice.dueDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Terms</dt>
                    <dd className="mt-1 font-medium">{invoice.paymentTerms}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-border/60 pt-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setDetailInvoice(invoice)}>
                      <Eye /> Details
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPrintInvoice(invoice)}>
                      <Printer /> Print
                    </Button>
                  </div>
                  {invoice.status === 'PENDING' && invoice.canAct && canApproveAP && (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => openAction(invoice, 'approve')}>
                        <ThumbsUp /> Approve
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => openAction(invoice, 'reject')}>
                        <ThumbsDown />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Action Dialog */}
      <Dialog open={!!actionModal} onOpenChange={(open) => { if (!open && !actionSaving) setActionModal(null); }}>
        {actionModal && (
          <DialogContent>
            <DialogHeader>
              <div
                className={cn(
                  'mb-2 grid size-11 place-items-center rounded-xl',
                  destructive ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'
                )}
              >
                {actionModal.action === 'approve' ? (
                  <ThumbsUp className="size-5" />
                ) : actionModal.action === 'reject' ? (
                  <ThumbsDown className="size-5" />
                ) : (
                  <RotateCcw className="size-5" />
                )}
              </div>
              <DialogTitle>{actionTitle}</DialogTitle>
              <DialogDescription>Review the invoice before applying this decision.</DialogDescription>
            </DialogHeader>

            <dl className="grid gap-2 rounded-xl border border-border/65 bg-secondary/40 p-4 sm:grid-cols-2">
              {[
                ['Invoice', actionModal.invoice.invoiceNumber],
                ['Vendor', actionModal.invoice.vendorName],
                ['Amount', formatAmount(actionModal.invoice.amount, companyDefaultCurrency)],
                ['Balance', formatAmount(actionModal.invoice.amount - actionModal.invoice.paidAmount, companyDefaultCurrency)],
                ['Due date', formatDate(actionModal.invoice.dueDate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            <label className="grid gap-2 text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5" />
                Comments {destructive && <span className="text-destructive">*</span>}
              </span>
              <textarea
                className="min-h-28 resize-y rounded-xl border border-input bg-background px-3.5 py-3 text-sm font-normal outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/30"
                value={actionComment}
                onChange={(event) => setActionComment(event.target.value)}
                placeholder={destructive ? 'Provide a reason…' : 'Optional comments…'}
              />
            </label>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setActionModal(null)} disabled={actionSaving}>
                Cancel
              </Button>
              <Button
                variant={destructive ? 'destructive' : 'default'}
                loading={actionSaving}
                disabled={destructive && !actionComment.trim()}
                onClick={handleAction}
              >
                {actionTitle}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null); }}>
        {detailInvoice && (
          <DialogContent className="max-w-2xl">
            <DialogHeader className="pr-10">
              <div className="mb-1 flex items-center gap-2">
                <DialogTitle>{detailInvoice.invoiceNumber}</DialogTitle>
                <StatusBadge status={detailInvoice.status} />
              </div>
              <DialogDescription>
                {detailInvoice.vendorName} · {formatAmount(detailInvoice.amount, companyDefaultCurrency)}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                ['PO reference', detailInvoice.poNumber],
                ['Department', detailInvoice.department],
                ['Amount', formatAmount(detailInvoice.amount, companyDefaultCurrency)],
                ['Paid', formatAmount(detailInvoice.paidAmount, companyDefaultCurrency)],
                ['Balance', formatAmount(detailInvoice.amount - detailInvoice.paidAmount, companyDefaultCurrency)],
                ['Payment terms', detailInvoice.paymentTerms],
                ['Invoice date', formatDate(detailInvoice.invoiceDate)],
                ['Due date', formatDate(detailInvoice.dueDate)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/65 bg-secondary/40 p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            {detailInvoice.comments && (
              <div className="rounded-xl border border-border/65 p-4">
                <div className="text-xs font-semibold text-muted-foreground">Comments</div>
                <p className="mt-2 text-sm">{detailInvoice.comments}</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setDetailInvoice(null)}>
                Close
              </Button>
              {detailInvoice.status === 'PENDING' && detailInvoice.canAct && canApproveAP && (
                <>
                  <Button
                    onClick={() => {
                      setDetailInvoice(null);
                      openAction(detailInvoice, 'approve');
                    }}
                  >
                    <ThumbsUp /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDetailInvoice(null);
                      openAction(detailInvoice, 'reject');
                    }}
                  >
                    <ThumbsDown /> Reject
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Print Purchase Invoice Modal */}
      {printInvoice && (
        <PrintPurchaseInvoiceModal
          invoice={printInvoice}
          onClose={() => setPrintInvoice(null)}
        />
      )}
    </PageFrame>
  );
}
