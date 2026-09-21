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
import { procurementService } from '../../services/procurementService';
import { vendorService } from '../../services/vendorService';
import { useAuth } from '../../context/AuthContext';
import { DigitalSignatureApprovalModal } from '../../components/shared/DigitalSignatureApprovalModal';
import { signatureService } from '../../services/signatureService';
import '../../components/shared/ColumnCustomizer.css';

type PaymentStatus = 'COMPLETED' | 'PENDING' | 'PROCESSING' | 'FAILED' | 'CONFIRMED' | 'CANCELLED' | 'RETRIED';
type PaymentMethod = 'NEFT' | 'RTGS' | 'IMPS' | 'Cheque' | 'UPI';
type ActionType = 'confirm' | 'cancel' | 'retry';
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface Payment {
  id: number;
  approvalId?: string;
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
  currentLevel?: number;
  totalLevels?: number;
  requiredRole?: string;
  canAct?: boolean;
  hasApprovedPriorLevel?: boolean;
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

const isRoleMatching = (requiredRole?: string, userRoles?: string[]): boolean => {
  if (!requiredRole || !userRoles || userRoles.length === 0) return false;
  const stripPrefix = (str: string) =>
    str.replace(/^level\s*\d+(\s*of\s*\d+)?\s*:\s*/i, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const reqClean = stripPrefix(requiredRole);

  const aliases: Record<string, string[]> = {
    purchasemanager: ['purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager', 'l1user', 'l1_user', 'l1', 'approver1', 'level1user', 'level1', 'procurement', 'buyer'],
    l1user: ['l1user', 'l1_user', 'l1', 'approver1', 'level1user', 'level1', 'purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager', 'procurement', 'buyer'],
    financeapprover: ['financeapprover', 'financemanager', 'finance_approver', 'finance_manager', 'finance', 'l2user', 'l2_user', 'l2', 'approver2', 'level2user', 'level2'],
    l2user: ['l2user', 'l2_user', 'l2', 'approver2', 'level2user', 'level2', 'financeapprover', 'financemanager', 'finance_approver', 'finance_manager', 'finance'],
    purchaseclerk: ['purchaseclerk', 'purchase_clerk', 'l2user', 'l2_user', 'l2', 'approver2', 'level2user', 'level2', 'financeapprover', 'financemanager', 'finance_approver', 'finance_manager', 'finance'],
  };

  return userRoles.some((r) => {
    const usrClean = stripPrefix(r);
    if (reqClean === usrClean) return true;
    if (aliases[reqClean] && aliases[reqClean].includes(usrClean)) return true;
    if (aliases[usrClean] && aliases[usrClean].includes(reqClean)) return true;
    return false;
  });
};

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

function StatusBadge({ status, currentLevel }: { status: PaymentStatus; currentLevel?: number }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  const label = status === 'PENDING' && currentLevel ? `Pending (L${currentLevel})` : config.label;
  return (
    <Badge tone={config.tone}>
      <Icon className={cn('size-3', status === 'PROCESSING' && 'animate-spin')} />
      {label}
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
  const { roles: authRoles, hasPermission } = useAuth();
  const isAdmin = useMemo(() => {
    if (!authRoles || authRoles.length === 0) return false;
    return authRoles.some((r) => r === 'Super Admin' || r === 'Administrator' || r.toLowerCase().includes('admin'));
  }, [authRoles]);

  const canApprovePayment =
    hasPermission('Payments', 'canApprove') ||
    hasPermission('Payments', 'canCreate') ||
    hasPermission('Accounts Payable', 'canApprove') ||
    isAdmin;

  const [paymentsList, setPaymentsList] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPaymentsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [rawPayments, approvalRowsPay, approvalRowsAP] = await Promise.all([
        localDataService.getPayments().catch(() => []),
        approvalService.listTable({ module: 'Payments' }).catch(() => [] as any[]),
        approvalService.listTable({ module: 'AccountsPayable' }).catch(() => [] as any[]),
      ]);

      const approvalRows = [...approvalRowsPay, ...approvalRowsAP];
      const approvalGroups = new Map<string, any[]>();
      approvalRows.forEach((a) => {
        const keys = [
          String(a.referenceId || ''),
          String(a.referenceNumber || ''),
          String(a.id || ''),
        ].filter(Boolean);

        keys.forEach((key) => {
          if (!approvalGroups.has(key)) approvalGroups.set(key, []);
          if (!approvalGroups.get(key)!.includes(a)) {
            approvalGroups.get(key)!.push(a);
          }
        });
      });

      const mapped = rawPayments.map((p) => {
        const base = mapPayment(p);
        let rows =
          approvalGroups.get(String(p.id)) ||
          approvalGroups.get(p.paymentId) ||
          approvalGroups.get(p.invoiceRef) ||
          [];

        if (rows.length === 0) {
          const matchByTitle = approvalRows.find(
            (a) =>
              (p.paymentId && (a.referenceNumber === p.paymentId || a.referenceId === p.paymentId || a.title?.includes(p.paymentId))) ||
              (p.invoiceRef && a.title?.includes(p.invoiceRef))
          );
          if (matchByTitle) {
            rows = [matchByTitle];
          }
        }

        const pendingRow = rows.find((r) => r.status === 'PENDING');
        const rejectedRow = rows.find((r) => r.status === 'REJECTED');
        const activeApp = pendingRow || rejectedRow || rows[rows.length - 1];

        const hasApprovedPriorLevel = rows.some(
          (r) => r.status === 'APPROVED' && (isAdmin || isRoleMatching(r.requiredRole, authRoles))
        );

        if (activeApp) {
          const currentLevel = activeApp.currentLevel || (activeApp.level?.levelNumber) || 1;
          const totalLevels = activeApp.totalLevels || 2;
          const reqRole = activeApp.requiredRole && activeApp.requiredRole !== 'Approver'
            ? activeApp.requiredRole
            : currentLevel === 2
            ? 'Purchase Clerk'
            : 'Purchase Manager';
          const isApproved = !pendingRow && !rejectedRow && (activeApp.status === 'APPROVED' || rows.some((r) => r.status === 'APPROVED'));
          const status = pendingRow ? 'PENDING' : rejectedRow ? 'CANCELLED' : isApproved ? 'CONFIRMED' : base.status;

          const canAct =
            status === 'PENDING' &&
            (isAdmin || isRoleMatching(reqRole, authRoles));

          return {
            ...base,
            approvalId: activeApp.id,
            status: status as PaymentStatus,
            currentLevel,
            totalLevels,
            requiredRole: reqRole,
            canAct,
            hasApprovedPriorLevel,
          };
        }

        const canAct =
          base.status === 'PENDING' &&
          (isAdmin || isRoleMatching('Purchase Manager', authRoles));

        return {
          ...base,
          currentLevel: 1,
          totalLevels: 1,
          requiredRole: 'Purchase Manager',
          canAct,
          hasApprovedPriorLevel,
        };
      });

      setPaymentsList(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [authRoles, canApprovePayment, isAdmin]);

  useEffect(() => {
    fetchPaymentsData();
    window.addEventListener('heliflow:approval-updated', fetchPaymentsData);
    return () => {
      window.removeEventListener('heliflow:approval-updated', fetchPaymentsData);
    };
  }, [fetchPaymentsData]);

  const [pendingActions, setPendingActions] = useState<Record<number, Payment>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'ALL'>('ALL');
  const [actionModal, setActionModal] = useState<{ payment: Payment; action: ActionType } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [selectedPrintVoucher, setSelectedPrintVoucher] = useState<Payment | null>(null);
  const [voucherApprovers, setVoucherApprovers] = useState<any[] | null>(null);
  const [vendorBankDetails, setVendorBankDetails] = useState<{ bankName?: string; accountNumber?: string; ifscCode?: string } | null>(null);
  const [chainModal, setChainModal] = useState<{ module: string; referenceId: string } | null>(null);

  const { formatAmount, companyDefaultCurrency } = useCurrency();

  useBodyScrollLock(!!(actionModal || detailPayment || selectedPrintVoucher || chainModal));

  useEffect(() => {
    if (!selectedPrintVoucher) {
      setVoucherApprovers(null);
      setVendorBankDetails(null);
      return;
    }
    let isMounted = true;
    vendorService.listTyped().then((vendors) => {
      if (!isMounted) return;
      const matched = vendors.find((v) => v.name.toLowerCase() === selectedPrintVoucher.vendorName.toLowerCase());
      if (matched && (matched.bankName || matched.bankAccountNumber)) {
        setVendorBankDetails({
          bankName: matched.bankName || undefined,
          accountNumber: matched.bankAccountNumber || undefined,
          ifscCode: matched.bankIfscCode || undefined,
        });
      } else {
        setVendorBankDetails(null);
      }
    }).catch(() => {
      if (isMounted) setVendorBankDetails(null);
    });
    const fetchApprovalChain = async () => {
      try {
        const pNo = selectedPrintVoucher.paymentNumber;
        const invRef = selectedPrintVoucher.invoiceRef;

        const [resPay, resAP, docSigsPayP, docSigsPayInv, docSigsAPP, docSigsAPInv, savedSigs] = await Promise.all([
          approvalService.getChain('Payments', pNo).catch(() => null),
          approvalService.getChain('AccountsPayable', invRef || pNo).catch(() => null),
          signatureService.getDocumentSignatures('Payments', pNo).catch(() => []),
          invRef ? signatureService.getDocumentSignatures('Payments', invRef).catch(() => []) : Promise.resolve([]),
          signatureService.getDocumentSignatures('AccountsPayable', pNo).catch(() => []),
          invRef ? signatureService.getDocumentSignatures('AccountsPayable', invRef).catch(() => []) : Promise.resolve([]),
          signatureService.list().catch(() => []),
        ]);
        if (!isMounted) return;

        const docSigs = [...docSigsPayP, ...docSigsPayInv, ...docSigsAPP, ...docSigsAPInv];
        const res = (resPay?.history?.length || resPay?.levels?.length) ? resPay : resAP;
        const chainItems = res?.history && res.history.length > 0 ? res.history : res?.levels || [];
        const defaultSigUrl = savedSigs.find((s) => s.isDefault)?.dataUrl || savedSigs[0]?.dataUrl;

        const currentLvl = selectedPrintVoucher.currentLevel || 1;
        const isVoucherConfirmed = ['CONFIRMED', 'COMPLETED'].includes(selectedPrintVoucher.status);

        if (chainItems && chainItems.length > 0) {
          const mapped = chainItems.map((item: any, idx: number) => {
            const levelNum = item.levelNumber || idx + 1;
            const roleName = item.requiredRole
              ? item.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              : levelNum === 1 ? 'Purchase Manager' : 'Purchase Clerk';
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
            const isApproved = item.status === 'APPROVED' || item.status === 'AUTO_FORWARDED';

            const matchSig = docSigs.find((d: any) => Number(d.levelNumber) === Number(levelNum)) || docSigs[idx];
            const signatureUrl = isApproved ? (matchSig?.dataUrl || defaultSigUrl) : undefined;

            return {
              level: `Level ${levelNum}`,
              name,
              role: roleName,
              date,
              status: isApproved ? ('APPROVED' as const) : ('PENDING' as const),
              comments,
              signatureUrl,
            };
          });
          setVoucherApprovers(mapped);
        } else {
          const sigL1 = docSigs.find((d: any) => Number(d.levelNumber) === 1)?.dataUrl || docSigs[0]?.dataUrl || (currentLvl > 1 || isVoucherConfirmed ? defaultSigUrl : undefined);
          const sigL2 = docSigs.find((d: any) => Number(d.levelNumber) === 2)?.dataUrl || docSigs[1]?.dataUrl || (isVoucherConfirmed ? defaultSigUrl : undefined);

          const isL1Approved = currentLvl > 1 || isVoucherConfirmed;
          const isL2Approved = isVoucherConfirmed;

          setVoucherApprovers([
            {
              level: 'Level 1',
              name: isL1Approved ? (selectedPrintVoucher.approvedBy !== '—' ? selectedPrintVoucher.approvedBy : 'Purchase Manager') : 'Purchase Manager',
              role: 'Purchase Manager',
              date: selectedPrintVoucher.date,
              status: isL1Approved ? ('APPROVED' as const) : ('PENDING' as const),
              comments: isL1Approved ? 'Approved & Digitally Signed' : 'Awaiting Level 1 Approval',
              signatureUrl: isL1Approved ? sigL1 : undefined,
            },
            {
              level: 'Level 2',
              name: isL2Approved ? 'Purchase Clerk' : 'Purchase Clerk',
              role: 'Purchase Clerk',
              date: selectedPrintVoucher.date,
              status: isL2Approved ? ('APPROVED' as const) : ('PENDING' as const),
              comments: isL2Approved ? 'Approved & Digitally Signed' : 'Awaiting Level 2 Approval',
              signatureUrl: isL2Approved ? sigL2 : undefined,
            },
          ]);
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

  const payments = useMemo(() => {
    const list = paymentsList.map((payment) => pendingActions[payment.id] ?? payment);
    const seen = new Set<string>();
    return list.filter((p) => {
      const key = (p.invoiceRef && p.invoiceRef !== '—')
        ? `${p.invoiceRef}_${p.amount}`
        : p.paymentNumber;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [paymentsList, pendingActions]);

  const summary = useMemo(
    () => ({
      totalPaid: payments
        .filter((payment) => ['COMPLETED', 'CONFIRMED'].includes(payment.status))
        .reduce((sum, payment) => sum + payment.amount, 0),
      pending: payments.filter(
        (payment) => payment.status === 'PENDING' && (isAdmin || payment.canAct || payment.hasApprovedPriorLevel)
      ).length,
      completed: payments.filter((payment) => ['COMPLETED', 'CONFIRMED'].includes(payment.status)).length,
      failed: payments.filter((payment) => ['FAILED', 'CANCELLED'].includes(payment.status)).length,
    }),
    [payments, isAdmin]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (payment.status === 'PENDING' && !isAdmin && !payment.canAct && !payment.hasApprovedPriorLevel) {
        return false;
      }
      return (
        (statusFilter === 'ALL' || payment.status === statusFilter) &&
        (!query ||
          [payment.paymentNumber, payment.vendorName, payment.invoiceRef].some((field) =>
            (field || '').toLowerCase().includes(query)
          ))
      );
    });
  }, [payments, search, statusFilter, isAdmin]);

  const amount = (value: number) => formatAmount(value, companyDefaultCurrency);
  const formatDate = (date: string) =>
    date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const openAction = useCallback((payment: Payment, action: ActionType) => {
    setActionModal({ payment, action });
    setActionComment('');
  }, []);

  const handleAction = useCallback(async () => {
    if (!actionModal) return;
    const target = actionModal.payment;
    const act = actionModal.action;
    const comment = actionComment.trim() || undefined;
    const status: PaymentStatus =
      act === 'confirm' ? 'CONFIRMED' : act === 'cancel' ? 'CANCELLED' : 'RETRIED';

    setPendingActions((current) => ({
      ...current,
      [target.id]: {
        ...target,
        status,
        comments: comment,
      },
    }));
    setActionModal(null);
    setActionComment('');

    let approvalIdToUse = target.approvalId;
    if (!approvalIdToUse) {
      try {
        const [rowsPay, rowsAP] = await Promise.all([
          approvalService.listTable({ module: 'Payments' }).catch(() => []),
          approvalService.listTable({ module: 'AccountsPayable' }).catch(() => []),
        ]);
        const approvalRows = [...rowsPay, ...rowsAP];
        const matched = approvalRows.find(
          (a) =>
            a.referenceId === String(target.id) ||
            a.referenceNumber === target.paymentNumber ||
            a.referenceId === target.paymentNumber ||
            (target.invoiceRef && target.invoiceRef !== '—' && (a.referenceId === target.invoiceRef || a.referenceNumber === target.invoiceRef || a.title?.includes(target.invoiceRef)))
        );
        if (matched) {
          approvalIdToUse = matched.id;
        } else {
          const created = await approvalService.resubmit('Payments', target.paymentNumber || String(target.id), 1).catch(() => null);
          if (created && (created as any).id) {
            approvalIdToUse = (created as any).id;
          }
        }
      } catch (_e) {
        // ignore
      }
    }

    if (approvalIdToUse) {
      try {
        if (act === 'confirm') {
          await approvalService.approve(approvalIdToUse, comment);
        } else if (act === 'cancel') {
          await approvalService.reject(approvalIdToUse, comment);
        } else {
          await approvalService.return(approvalIdToUse, comment);
        }
      } catch (err) {
        console.error('Payment voucher approval action failed:', err);
      }
    }
    window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
    await fetchPaymentsData();
  }, [actionComment, actionModal, fetchPaymentsData]);

  const handleSignatureConfirm = useCallback(
    async (signatureDataUrl: string, comment?: string) => {
      if (!actionModal) return;
      const target = actionModal.payment;

      const levelNum = target.currentLevel || 1;
      try {
        await signatureService.signDocument({
          module: 'Payments',
          referenceId: target.paymentNumber || String(target.id),
          signatureId: 'digital_signature',
          dataUrl: signatureDataUrl,
          levelNumber: levelNum,
          comments: comment,
        });
        if (target.invoiceRef && target.invoiceRef !== target.paymentNumber) {
          await signatureService.signDocument({
            module: 'Payments',
            referenceId: target.invoiceRef,
            signatureId: 'digital_signature',
            dataUrl: signatureDataUrl,
            levelNumber: levelNum,
            comments: comment,
          }).catch(() => {});
        }
      } catch (sigErr) {
        console.warn('Digital signature recording warning:', sigErr);
      }

      setPendingActions((current) => ({
        ...current,
        [target.id]: {
          ...target,
          status: 'CONFIRMED',
          comments: comment,
        },
      }));
      setActionModal(null);
      setActionComment('');

      let approvalIdToUse = target.approvalId;
      if (!approvalIdToUse) {
        try {
          const [rowsPay, rowsAP] = await Promise.all([
            approvalService.listTable({ module: 'Payments' }).catch(() => []),
            approvalService.listTable({ module: 'AccountsPayable' }).catch(() => []),
          ]);
          const approvalRows = [...rowsPay, ...rowsAP];
          const matched = approvalRows.find(
            (a) =>
              a.referenceId === String(target.id) ||
              a.referenceNumber === target.paymentNumber ||
              a.referenceId === target.paymentNumber ||
              (target.invoiceRef && target.invoiceRef !== '—' && (a.referenceId === target.invoiceRef || a.referenceNumber === target.invoiceRef || a.title?.includes(target.invoiceRef)))
          );
          if (matched) {
            approvalIdToUse = matched.id;
          } else {
            const created = await approvalService.resubmit('Payments', target.paymentNumber || String(target.id), 1).catch(() => null);
            if (created && (created as any).id) {
              approvalIdToUse = (created as any).id;
            }
          }
        } catch (_e) {
          // ignore
        }
      }

      if (approvalIdToUse) {
        try {
          await approvalService.approve(approvalIdToUse, comment);
        } catch (err) {
          console.error('Payment voucher digital signature approval action failed:', err);
        }
      }
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
      await fetchPaymentsData();
    },
    [actionModal, fetchPaymentsData]
  );

  const cardProps = (filter: PaymentStatus | 'ALL') => {
    const isActive = statusFilter === filter;
    return {
      role: 'button',
      tabIndex: 0,
      'aria-pressed': isActive,
      onClick: () => setStatusFilter((current) => (current === filter && filter !== 'ALL' ? 'ALL' : filter)),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') setStatusFilter(filter);
      },
      className: cn(
        'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
        isActive &&
          'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
      ),
    };
  };

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

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard {...cardProps('ALL')} label="Total paid" value={amount(summary.totalPaid)} detail="Completed payments" icon={Banknote} tone="success" />
        <MetricCard {...cardProps('PENDING')} label="Pending" value={summary.pending} detail="Awaiting confirmation" icon={Clock} tone="warning" />
        <MetricCard {...cardProps('COMPLETED')} label="Completed" value={summary.completed} detail="Confirmed transactions" icon={CheckCircle2} />
        <MetricCard {...cardProps('FAILED')} label="Failed / cancelled" value={summary.failed} detail="Needs attention" icon={XCircle} tone="danger" />
      </div>

      {/* Search & Filter Toolbar matching RFQ */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10 pr-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search payment, vendor, or invoice"
            aria-label="Search payments"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="relative flex items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
          <Button
            ref={colBtnRef}
            variant="outline"
            className="h-11 gap-2 rounded-xl px-4 border-input font-medium hover:bg-accent/50"
            onClick={() => setShowColPanel((v) => !v)}
            title="Customize columns"
          >
            <SlidersHorizontal size={16} /> Columns
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
          <Card className="hidden overflow-hidden border border-border/60 shadow-xs lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-border/75 bg-muted/45 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
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
                                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary ring-1 ring-primary/15">
                                  {payment.vendorInitials}
                                </span>
                                <span className="font-medium text-foreground">{payment.vendorName}</span>
                              </div>
                            </td>
                          );
                        }
                        if (col.key === 'invoiceRef') {
                          return (
                            <td key="invoiceRef" className="px-4 py-3.5 text-sm font-medium text-foreground">
                              {payment.invoiceRef}
                            </td>
                          );
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
                          return <td key="date" className="px-4 py-3.5 text-sm text-muted-foreground">{formatDate(payment.date)}</td>;
                        }
                        if (col.key === 'status') {
                          return <td key="status" className="px-4 py-3.5"><StatusBadge status={payment.status} currentLevel={payment.currentLevel} /></td>;
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
                                disabled={!payment.canAct}
                                onClick={() => payment.canAct && openAction(payment, 'confirm')}
                                aria-label={`Confirm ${payment.paymentNumber}`}
                                title={payment.canAct ? 'Confirm payment' : `Pending Level ${payment.currentLevel || 1} (${payment.requiredRole || 'Approver'}) approval`}
                              >
                                <ThumbsUp className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={!payment.canAct}
                                onClick={() => payment.canAct && openAction(payment, 'cancel')}
                                aria-label={`Cancel ${payment.paymentNumber}`}
                                title={payment.canAct ? 'Cancel payment' : `Pending Level ${payment.currentLevel || 1} (${payment.requiredRole || 'Approver'}) approval`}
                              >
                                <Ban className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={!payment.canAct}
                                onClick={() => payment.canAct && openAction(payment, 'retry')}
                                aria-label={`Retry ${payment.paymentNumber}`}
                                title={payment.canAct ? 'Retry payment' : 'Permission denied'}
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
      {actionModal && actionModal.action === 'confirm' ? (
        <DigitalSignatureApprovalModal
          open={!!actionModal}
          onClose={() => setActionModal(null)}
          onConfirm={handleSignatureConfirm}
          docTitle={`Payment Voucher ${actionModal.payment.paymentNumber}`}
          docDetails={[
            { label: 'Payment Voucher', value: actionModal.payment.paymentNumber },
            { label: 'Vendor Name', value: actionModal.payment.vendorName },
            { label: 'Amount', value: amount(actionModal.payment.amount) },
            { label: 'Invoice Ref', value: actionModal.payment.invoiceRef },
          ]}
        />
      ) : (
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
                  {actionModal.action === 'cancel' ? (
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
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt>
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
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailPayment} onOpenChange={(open) => { if (!open) setDetailPayment(null); }}>
        {detailPayment && (
          <DialogContent className="max-w-xl p-6 sm:p-7">
            <DialogHeader className="space-y-1 pr-8">
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                  {detailPayment.paymentNumber}
                </DialogTitle>
                <StatusBadge status={detailPayment.status} />
              </div>
              <DialogDescription className="text-sm font-medium text-muted-foreground">
                {detailPayment.vendorName} · {amount(detailPayment.amount)}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="border-t border-border/60 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Payment details
                </h4>

                <div className="divide-y divide-border/40 text-sm">
                  {/* Row 1: Invoice Reference & Amount */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Invoice Reference
                      </div>
                      <div className="mt-1 font-medium text-foreground break-words">
                        {detailPayment.invoiceRef}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Amount
                      </div>
                      <div className="mt-1 text-base font-bold text-foreground">
                        {amount(detailPayment.amount)}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Method & Date */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Method
                      </div>
                      <div className="mt-1 font-medium text-foreground">
                        {detailPayment.method}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Date
                      </div>
                      <div className="mt-1 font-medium text-foreground">
                        {formatDate(detailPayment.date)}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Approved By (Workflow state) */}
                  <div className="py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Approved By
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
                      <span className="inline-block size-2 rounded-full bg-amber-500/80" />
                      {detailPayment.approvedBy}
                    </div>
                  </div>

                  {/* Row 4: Remarks (Full Width) */}
                  <div className="py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Remarks
                    </div>
                    <div className="mt-1 font-normal text-muted-foreground break-words leading-relaxed">
                      {detailPayment.remarks || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {detailPayment.comments && (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Comments
                  </div>
                  <p className="mt-1.5 text-sm text-foreground">{detailPayment.comments}</p>
                </div>
              )}
            </div>

            <DialogFooter className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setChainModal({ module: 'Payments', referenceId: detailPayment.paymentNumber || detailPayment.invoiceRef })}
              >
                <Clock className="size-4" /> View Approval Chain
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    const target = detailPayment;
                    setDetailPayment(null);
                    setSelectedPrintVoucher(target);
                  }}
                >
                  <Printer className="size-4" /> Print Voucher
                </Button>
                <Button variant="secondary" onClick={() => setDetailPayment(null)}>
                  Close
                </Button>
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
            bankName: vendorBankDetails?.bankName,
            accountNumber: vendorBankDetails?.accountNumber,
            ifscCode: vendorBankDetails?.ifscCode,
            invoiceRef: selectedPrintVoucher.invoiceRef,
            grossAmount: selectedPrintVoucher.amount,
            tdsAmount: 0,
            netAmount: selectedPrintVoucher.amount,
            currency: companyDefaultCurrency,
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
