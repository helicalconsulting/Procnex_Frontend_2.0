import ColumnSettingsButton from '../../components/shared/ColumnSettingsButton';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { invoiceService, type APInvoice as ServiceAPInvoice } from '../../services/invoiceService';
import { localDataService } from '../../services/localDataService';
import { approvalService } from '../../services/approvalService';
import { sseClient } from '../../services/sseClient';
import { apiRequest, invalidateApiCache, clearAllApiCache } from '../../api/client';
import type { ApprovalTableRow } from '../../types/viewModels';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import type { ColumnDef } from '../../hooks/columnPreferences';
import PrintPurchaseInvoiceModal from '../../components/invoices/PrintPurchaseInvoiceModal';
import InvoiceDocumentViewerModal from '../../components/invoices/InvoiceDocumentViewerModal';
import { DigitalSignatureApprovalModal } from '../../components/shared/DigitalSignatureApprovalModal';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
import { signatureService } from '../../services/signatureService';
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
import TablePagination from '../../components/shared/TablePagination';
import { cn } from '../../lib/utils';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  IndianRupee,
  MessageSquare,
  Paperclip,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  Wallet,
  X,
  Filter,
  Send,
  Trash2,
} from 'lucide-react';
import '../../components/shared/ColumnCustomizer.css';

type APStatus = 'DRAFT' | 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'RE_REVIEW';
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
  attachments?: any[];
  items?: any[];
  lineItems?: any[];
  purchaseOrder?: any;
  grn?: any;
  hasApprovedPriorLevel?: boolean;
  isReturned?: boolean;
  paymentVoucher?: {
    id?: string;
    paymentNumber: string;
    status: string;
    amount?: number;
  };
}

export function getInvoiceAttachments(invoice: any): any[] {
  if (!invoice) return [];
  if (invoice.attachments) {
    if (Array.isArray(invoice.attachments)) return invoice.attachments;
    if (typeof invoice.attachments === 'string') {
      try {
        const parsed = JSON.parse(invoice.attachments);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }
  const keys = [
    invoice.invoiceNumber ? `invoice_attachments_${invoice.invoiceNumber}` : null,
    invoice.poNumber ? `invoice_attachments_${invoice.poNumber}` : null,
    invoice.id ? `invoice_attachments_${invoice.id}` : null,
  ].filter(Boolean) as string[];

  for (const k of keys) {
    try {
      const saved = localStorage.getItem(k);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  return [];
}

const STATUS_CONFIG: Record<APStatus, { label: string; tone: Tone; icon: typeof Clock }> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: FileText as any },
  PENDING: { label: 'Pending', tone: 'warning', icon: Clock },
  OVERDUE: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
  PAID: { label: 'Paid', tone: 'success', icon: CheckCircle2 },
  PARTIAL: { label: 'Partial', tone: 'info', icon: IndianRupee },
  APPROVED: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: X },
  RETURNED: { label: 'Returned', tone: 'warning', icon: RotateCcw },
  RE_REVIEW: { label: 'Returned (Re-Review)', tone: 'warning', icon: RotateCcw },
};

function StatusBadge({
  status,
  currentLevel,
  hasApprovedPriorLevel,
  isReturned,
  canAct,
  requiredRole,
}: {
  status: APStatus;
  currentLevel?: number;
  hasApprovedPriorLevel?: boolean;
  isReturned?: boolean;
  canAct?: boolean;
  requiredRole?: string;
}) {
  if (status === 'PENDING') {
    if (canAct) {
      return (
        <Badge tone="warning">
          <Clock className="size-3" />
          Pending
        </Badge>
      );
    }
    if (hasApprovedPriorLevel) {
      return (
        <Badge tone="info" className="bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-300">
          <CheckCircle2 className="size-3" />
          L{Math.max(1, (currentLevel || 2) - 1)} Approved
        </Badge>
      );
    }
    if (isReturned) {
      return (
        <Badge tone="warning">
          <RotateCcw className="size-3" />
          Returned (L{currentLevel || 1})
        </Badge>
      );
    }
    if (canAct === false) {
      return (
        <Badge tone="neutral" className="bg-muted text-muted-foreground border border-border/60">
          <Clock className="size-3" />
          Pending L{currentLevel || 1}
        </Badge>
      );
    }
    return (
      <Badge tone="warning">
        <Clock className="size-3" />
        Pending
      </Badge>
    );
  }
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  return (
    <Badge tone={config.tone}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}

const L1_ROLES = [
  'purchaseclerk', 'purchase_clerk', 'procurementclerk', 'procurement_clerk',
  'purchaseofficer', 'purchase_officer', 'procurementofficer', 'procurement_officer',
  'buyer', 'l1user', 'l1_user', 'l1', 'approver1', 'approver_1', 'level1user', 'level1', 'level_1',
  'poapprover1', 'po_approver_1', 'invoiceapprover1', 'purchaseinvoiceapprover1', 'paymentapprover1', 'paymentvoucherapprover1',
  'analyst', 'analyst_user'
];

const L2_ROLES = [
  'purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager', 'procurement',
  'financeapprover', 'finance_approver', 'financemanager', 'finance_manager', 'finance',
  'accountspayable', 'accounts_payable', 'purchasehead', 'headofprocurement',
  'l2user', 'l2_user', 'l2', 'approver2', 'approver_2', 'level2user', 'level2', 'level_2',
  'poapprover2', 'invoiceapprover2', 'purchaseinvoiceapprover2', 'paymentapprover2', 'paymentvoucherapprover2',
  'developer', 'developer_user', 'dev', 'softwareengineer'
];

const L3_ROLES = [
  'generalmanager', 'general_manager', 'managingdirector', 'managing_director', 'director', 'executive',
  'ceo', 'cfo', 'coo', 'vp', 'l3user', 'l3_user', 'l3', 'approver3', 'approver_3', 'level3user', 'level3',
  'founder', 'co-founder', 'cofounder', 'owner'
];

const ADMIN_ROLES = [
  'admin', 'administrator', 'superadmin', 'super_admin', 'systemadministrator', 'system_administrator'
];

const isRoleMatching = (requiredRole?: string, userRoles?: string[]): boolean => {
  if (!requiredRole || !userRoles || userRoles.length === 0) return false;
  const stripPrefix = (str: string) =>
    str.replace(/^level\s*\d+(\s*of\s*\d+)?\s*:\s*/i, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const reqClean = stripPrefix(requiredRole);

  return userRoles.some((r) => {
    const usrClean = stripPrefix(r);
    if (reqClean === usrClean) return true;
    if (L1_ROLES.includes(reqClean) && L1_ROLES.includes(usrClean)) return true;
    if (L2_ROLES.includes(reqClean) && L2_ROLES.includes(usrClean)) return true;
    if (L3_ROLES.includes(reqClean) && L3_ROLES.includes(usrClean)) return true;
    if (ADMIN_ROLES.includes(reqClean) && ADMIN_ROLES.includes(usrClean)) return true;
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
  const { user, roles: authRoles, hasPermission } = useAuth();
  const canApproveAP =
    hasPermission('Accounts Payable', 'canApprove') ||
    hasPermission('Create Purchase Invoice', 'canApprove') ||
    hasPermission('Invoices', 'canApprove') ||
    hasPermission('Accounts Payable', 'canCreate') ||
    isRoleMatching('Purchase Clerk', authRoles) ||
    isRoleMatching('Purchase Manager', authRoles) ||
    isRoleMatching('Analyst', authRoles);

  const [invoicesList, setInvoicesList] = useState<APInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimisticMapRef = useRef<Record<string, { status: APStatus; canAct: boolean; currentLevel?: number; hasApprovedPriorLevel?: boolean; isReturned?: boolean }>>({});
  const [optimisticMap, setOptimisticMap] = useState<Record<string, { status: APStatus; canAct: boolean; currentLevel?: number; hasApprovedPriorLevel?: boolean; isReturned?: boolean }>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<APStatus | 'ALL'>('ALL');
  const [detailInvoice, setDetailInvoice] = useState<APInvoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<APInvoice | null>(null);
  const [viewerInvoice, setViewerInvoice] = useState<APInvoice | null>(null);
  const [actionModal, setActionModal] = useState<{ invoice: APInvoice; action: ActionType } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionReturnTarget, setActionReturnTarget] = useState<'ORIGINATOR' | 'LEVEL_1'>('ORIGINATOR');
  const [actionSaving, setActionSaving] = useState(false);
  const [actionSuccessData, setActionSuccessData] = useState<ActionSuccessModalData | null>(null);
  const [chainModal, setChainModal] = useState<{ module: string; referenceId: string } | null>(null);
  useBodyScrollLock(!!(actionModal || detailInvoice || printInvoice || chainModal || viewerInvoice));

  const [generatedVoucherBanner, setGeneratedVoucherBanner] = useState<{
    voucherNumber: string;
    invoiceNumber: string;
    vendorName: string;
    amount: number;
  } | null>(null);

  const { formatAmount, companyDefaultCurrency } = useCurrency();

  const isAdmin = useMemo(() => {
    return authRoles.some((r) => {
      const lower = r.toLowerCase();
      return (
        r === 'Super Admin' ||
        r === 'Administrator' ||
        lower === 'admin' ||
        lower === 'super admin' ||
        lower === 'administrator'
      );
    });
  }, [authRoles]);

  const [deleteConfirmInvoice, setDeleteConfirmInvoice] = useState<AccountsPayableInvoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteInvoice = async () => {
    if (!deleteConfirmInvoice) return;
    try {
      setIsDeleting(true);
      await invoiceService.delete(deleteConfirmInvoice.id || deleteConfirmInvoice.invoiceNumber);
      setInvoicesList((prev) =>
        prev.filter(
          (i) =>
            i.id !== deleteConfirmInvoice.id &&
            i.invoiceNumber !== deleteConfirmInvoice.invoiceNumber
        )
      );
      setDeleteConfirmInvoice(null);
      clearAllApiCache();
      window.dispatchEvent(
        new CustomEvent('heliflow:invoice-deleted', {
          detail: { id: deleteConfirmInvoice.id, invoiceNumber: deleteConfirmInvoice.invoiceNumber },
        })
      );
      try {
        const bc = new BroadcastChannel('heliflow_sync');
        bc.postMessage({ type: 'INVOICE_DELETED', source: 'AccountsPayablePage', timestamp: Date.now() });
        bc.close();
      } catch {}
    } catch (err: any) {
      alert(err?.message || 'Failed to delete invoice');
    } finally {
      setIsDeleting(false);
    }
  };

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

  const fetchInvoicesData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent && isInitialLoadRef.current) {
        setLoading(true);
      }
      if (options?.silent) {
        invalidateApiCache('/approvals');
        invalidateApiCache('/invoices');
      }
      setError(null);

      const [approvalRows, rawInvoices, rawPayments] = await Promise.all([
        approvalService.listTable({ module: 'AccountsPayable' }).catch(() => [] as ApprovalTableRow[]),
        invoiceService.list().catch(() => [] as ServiceAPInvoice[]),
        localDataService.getPayments().catch(() => [] as any[]),
      ]);

      const findPaymentForInvoice = (invNum?: string, invId?: string) => {
        if (!invNum && !invId) return undefined;
        const normNum = invNum?.trim().toLowerCase();
        const normId = invId ? String(invId) : '';
        const match = rawPayments.find((p: any) => {
          const pRef = String(p.invoiceRef || '').trim().toLowerCase();
          if (normNum && pRef === normNum) return true;
          if (normId && p.invoiceId && String(p.invoiceId) === normId) return true;
          if (normId && Array.isArray(p.invoiceIds) && p.invoiceIds.some((id: any) => String(id) === normId)) return true;
          if (Array.isArray(p.invoices) && p.invoices.some((item: any) => 
            (normNum && String(item.invoiceNumber || '').trim().toLowerCase() === normNum) ||
            (normId && item.invoiceId && String(item.invoiceId) === normId)
          )) return true;
          return false;
        });
        if (!match) return undefined;
        return {
          id: String(match.id || match._id || ''),
          paymentNumber: String(match.paymentNumber || match.paymentId || `PAY-${match.id}`),
          status: String(match.status || 'DRAFT').toUpperCase(),
          amount: Number(match.amount || 0),
        };
      };

      // Group approval rows by matching invoice
      const approvalGroups = new Map<string, ApprovalTableRow[]>();
      approvalRows.forEach((a) => {
        const matchedRaw = rawInvoices.find(
          (inv) =>
            String(inv.id) === String(a.referenceId) ||
            inv.invoiceNumber === a.referenceNumber ||
            inv.invoiceNumber === a.referenceId ||
            (a.title && a.title.includes(inv.invoiceNumber))
        );
        const key = matchedRaw ? matchedRaw.invoiceNumber : String(a.referenceNumber || a.referenceId || a.id);
        if (!approvalGroups.has(key)) approvalGroups.set(key, []);
        approvalGroups.get(key)!.push(a);
      });

      const processedRefKeys = new Set<string>();
      const merged: APInvoice[] = [];

      approvalGroups.forEach((rows, key) => {
        if (processedRefKeys.has(key)) return;
        processedRefKeys.add(key);

        const matchingRaw = rawInvoices.find(
          (inv) =>
            inv.invoiceNumber === key ||
            String(inv.id) === key ||
            rows.some((r) => r.referenceId === String(inv.id) || r.referenceNumber === inv.invoiceNumber)
        );

        if (matchingRaw) {
          processedRefKeys.add(String(matchingRaw.id));
          processedRefKeys.add(matchingRaw.invoiceNumber);
        }

        // Find active pending row if any
        const pendingRow = rows.find((r) => r.status === 'PENDING');
        const rejectedRow = rows.find((r) => r.status === 'REJECTED');
        const returnedRow = !pendingRow ? rows.find((r) => r.status === 'RETURNED') : undefined;
        const allApproved = rows.length > 0 && rows.every((r) => r.status === 'APPROVED');
        const activeApp = pendingRow || rejectedRow || returnedRow || rows[rows.length - 1];
        const hadReturn = Boolean(
          (!pendingRow && matchingRaw?.status === 'RETURNED') ||
          (!pendingRow && (activeApp as any)?.isReturned) ||
          (!pendingRow && returnedRow)
        );

        const invNo = matchingRaw?.invoiceNumber || activeApp.referenceNumber || `INV-${activeApp.id.slice(-6)}`;
        const vName = matchingRaw?.vendorName || activeApp.requestedBy || 'Vendor';
        const initials = vName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'VN';

        let rawAmt =
          typeof (activeApp as any).amountNum === 'number'
            ? (activeApp as any).amountNum
            : typeof activeApp.amount === 'number'
            ? activeApp.amount
            : parseFloat(String(activeApp.amount).replace(/[^0-9.]/g, '')) || matchingRaw?.amount || 0;
        let amt = rawAmt;
        if (amt >= 1000000 && (amt === 11800000 || (amt % 1000 === 0 && amt / 1000 <= 100000))) {
          amt = amt / 1000;
        }

        const l1Row = rows.find((r) => (r.currentLevel || (r.level as any)?.levelNumber || (r as any)?.levelNumber) === 1);
        const l1Role = l1Row?.requiredRole || (l1Row?.level as any)?.requiredRole || 'Analyst';
        const totalLevels = activeApp.totalLevels || rows.length || 1;
        const currentLevel = (pendingRow ? (pendingRow.currentLevel || (pendingRow.level as any)?.levelNumber) : (allApproved ? totalLevels : activeApp.currentLevel)) || 1;
        const reqRole = pendingRow?.requiredRole || (pendingRow?.level as any)?.requiredRole || (hadReturn ? l1Role : (activeApp.requiredRole || 'Purchase Clerk'));

        const isUserMatchingPendingStep = pendingRow
          ? isRoleMatching(reqRole, authRoles) ||
            (user?.id && pendingRow.approverId && String(pendingRow.approverId) === String(user.id)) ||
            ((user as any)?._id && pendingRow.approverId && String(pendingRow.approverId) === String((user as any)._id)) ||
            (user?.name && pendingRow.approverName && pendingRow.approverName.toLowerCase() === user.name.toLowerCase()) ||
            (user?.email && (pendingRow as any).approverEmail && (pendingRow as any).approverEmail.toLowerCase() === user.email.toLowerCase())
          : false;

        const hasApprovedPriorLevel =
          allApproved ||
          rows.some(
            (r) =>
              r.status === 'APPROVED' &&
              (
                isRoleMatching(r.requiredRole, authRoles) ||
                (user?.id && r.approverId && String(r.approverId) === String(user.id)) ||
                ((user as any)?._id && r.approverId && String(r.approverId) === String((user as any)._id)) ||
                (user?.name && r.approverName && r.approverName.toLowerCase() === user.name.toLowerCase()) ||
                (user?.email && (r as any).approverEmail && (r as any).approverEmail.toLowerCase() === user.email.toLowerCase())
              )
          ) ||
          (currentLevel > 1 && (
            isRoleMatching('Purchase Clerk', authRoles) ||
            isRoleMatching('Analyst', authRoles) ||
            isRoleMatching('L1 User', authRoles) ||
            isRoleMatching('Approver 1', authRoles)
          )) ||
          (currentLevel > 2 && (
            isRoleMatching('Purchase Manager', authRoles) ||
            isRoleMatching('Procurement Manager', authRoles) ||
            isRoleMatching('Finance Approver', authRoles) ||
            isRoleMatching('Finance Manager', authRoles) ||
            isRoleMatching('L2 User', authRoles) ||
            isRoleMatching('Developer', authRoles)
          )) ||
          (currentLevel > 3 && (
            isRoleMatching('General Manager', authRoles) ||
            isRoleMatching('L3 User', authRoles) ||
            isRoleMatching('Founder', authRoles)
          ));

        let status: APStatus;
        if (matchingRaw?.status && ['PAID', 'PARTIAL', 'OVERDUE'].includes(matchingRaw.status)) {
          status = matchingRaw.status as APStatus;
        } else if (matchingRaw?.status === 'APPROVED' || allApproved) {
          status = 'APPROVED';
        } else if (rejectedRow || matchingRaw?.status === 'REJECTED') {
          status = 'REJECTED';
        } else if (pendingRow) {
          // If currently pending: for approvers who already approved their prior level, show APPROVED!
          if (hasApprovedPriorLevel && !isUserMatchingPendingStep) {
            status = 'APPROVED';
          } else {
            status = 'PENDING';
          }
        } else if (returnedRow || matchingRaw?.status === 'RETURNED' || hadReturn) {
          status = 'RETURNED';
        } else {
          status = (matchingRaw?.status as APStatus) || 'APPROVED';
        }

        let effectiveCanAct = false;
        if (status === 'PENDING') {
          effectiveCanAct = isUserMatchingPendingStep;
        } else if (status === 'RETURNED') {
          const isL1Role = isRoleMatching('Analyst', authRoles) || isRoleMatching('Purchase Clerk', authRoles) || isRoleMatching('L1 User', authRoles) || isRoleMatching('Approver 1', authRoles);
          effectiveCanAct = isL1Role || isRoleMatching(reqRole, authRoles);
        }

        if (status === 'APPROVED' || (hasApprovedPriorLevel && !isUserMatchingPendingStep)) {
          effectiveCanAct = false;
        }

        const resolvedDept =
          activeApp.department ||
          matchingRaw?.department ||
          (matchingRaw?.purchaseOrder as any)?.department ||
          (matchingRaw?.purchaseOrder as any)?.rfq?.department ||
          (matchingRaw?.vendor as any)?.categoryRef?.department?.name ||
          (matchingRaw?.vendor as any)?.categoryRef?.name ||
          '';

        merged.push({
          id: matchingRaw?.id || activeApp.referenceId || activeApp.id,
          approvalId: pendingRow ? pendingRow.id : activeApp.id,
          invoiceNumber: invNo,
          poNumber: matchingRaw?.poNumber || (activeApp.title ? activeApp.title.split('(PO: ')[1]?.replace(')', '') : '') || '—',
          vendorName: vName,
          vendorInitials: initials,
          avatarMod: String((merged.length % 6) + 1),
          amount: amt,
          paidAmount: status === 'PAID' ? amt : 0,
          dueDate: matchingRaw?.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          invoiceDate: activeApp.submittedAt || matchingRaw?.submittedAt || new Date().toISOString(),
          status,
          paymentTerms:
            (matchingRaw?.paymentTerms && matchingRaw.paymentTerms !== 'Net 30' ? matchingRaw.paymentTerms : null) ||
            (matchingRaw?.purchaseOrder as any)?.rfq?.selectedQuotation?.paymentTerms ||
            (matchingRaw?.purchaseOrder as any)?.paymentTerms ||
            (activeApp as any)?.data?.paymentTerms ||
            matchingRaw?.paymentTerms ||
            'Net 30',
          department: resolvedDept,
          currentLevel,
          totalLevels,
          requiredRole: reqRole,
          canAct: effectiveCanAct,
          comments: activeApp.comments,
          attachments: matchingRaw?.attachments || (activeApp as any)?.attachments || (activeApp as any)?.data?.attachments,
          items: matchingRaw?.items || matchingRaw?.lineItems || (matchingRaw?.purchaseOrder as any)?.items || (matchingRaw?.purchaseOrder as any)?.rfq?.items || (activeApp as any)?.data?.items || (activeApp as any)?.items,
          lineItems: matchingRaw?.lineItems || matchingRaw?.items || (matchingRaw?.purchaseOrder as any)?.items || (matchingRaw?.purchaseOrder as any)?.rfq?.items || (activeApp as any)?.data?.lineItems || (activeApp as any)?.lineItems,
          purchaseOrder: matchingRaw?.purchaseOrder,
          grn: matchingRaw?.grn,
          hasApprovedPriorLevel,
          isReturned: hadReturn,
          paymentVoucher: findPaymentForInvoice(invNo, matchingRaw?.id || activeApp.referenceId),
        });
      });

      rawInvoices.forEach((inv, idx) => {
        const alreadyIn =
          processedRefKeys.has(String(inv.id)) ||
          processedRefKeys.has(inv.invoiceNumber) ||
          merged.some((m) => String(m.id) === String(inv.id) || m.invoiceNumber === inv.invoiceNumber);

        if (!alreadyIn) {
          const initials = inv.vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'VN';
          const statusMap: Record<string, APStatus> = {
            PENDING_APPROVAL: 'PENDING',
            POSTED: 'PENDING',
            PENDING: 'PENDING',
            APPROVED: 'APPROVED',
            PAID: 'PAID',
            PARTIAL: 'PARTIAL',
            OVERDUE: 'OVERDUE',
            REJECTED: 'REJECTED',
            RETURNED: 'RETURNED',
            DRAFT: 'DRAFT',
            REGISTERED: 'DRAFT',
          };
          const status = statusMap[inv.status] || (inv.status === 'DRAFT' ? 'DRAFT' : inv.status === 'APPROVED' ? 'APPROVED' : 'PENDING');
          const isActionable = status === 'PENDING' || status === 'RETURNED' || status === 'PENDING_APPROVAL';
          const isL1Role = isRoleMatching('Analyst', authRoles) || isRoleMatching('Purchase Clerk', authRoles) || isRoleMatching('L1 User', authRoles) || isRoleMatching('Approver 1', authRoles);
          const effectiveCanAct = isActionable && isL1Role;

          const resolvedDept =
            inv.department ||
            (inv.purchaseOrder as any)?.department ||
            (inv.purchaseOrder as any)?.rfq?.department ||
            (inv as any)?.vendor?.categoryRef?.department?.name ||
            (inv as any)?.vendor?.categoryRef?.name ||
            '';

          let invAmt = Number(inv.amount || 0);

          merged.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            poNumber: inv.poNumber || '—',
            vendorName: inv.vendorName,
            vendorInitials: initials,
            avatarMod: String(((idx + merged.length) % 6) + 1),
            amount: invAmt,
            paidAmount: status === 'PAID' ? invAmt : 0,
            dueDate: inv.dueDate,
            invoiceDate: inv.submittedAt || new Date().toISOString(),
            status,
            paymentTerms:
              (inv.paymentTerms && inv.paymentTerms !== 'Net 30' ? inv.paymentTerms : null) ||
              (inv.purchaseOrder as any)?.rfq?.selectedQuotation?.paymentTerms ||
              (inv.purchaseOrder as any)?.paymentTerms ||
              inv.paymentTerms ||
              'Net 30',
            department: resolvedDept,
            currentLevel: status === 'APPROVED' ? 2 : (isActionable ? 1 : 0),
            totalLevels: isActionable || status === 'APPROVED' ? 2 : 0,
            requiredRole: status === 'APPROVED' ? '' : (isActionable ? 'Purchase Manager' : ''),
            canAct: status === 'APPROVED' ? false : effectiveCanAct,
            comments: inv.comments,
            attachments: inv.attachments,
            items: inv.items || inv.lineItems || (inv.purchaseOrder as any)?.items || (inv.purchaseOrder as any)?.rfq?.items,
            lineItems: inv.lineItems || inv.items || (inv.purchaseOrder as any)?.items || (inv.purchaseOrder as any)?.rfq?.items,
            purchaseOrder: inv.purchaseOrder,
            grn: inv.grn,
            hasApprovedPriorLevel: false,
            paymentVoucher: findPaymentForInvoice(inv.invoiceNumber, inv.id),
          });
        }
      });

      const finalMerged = merged.map((inv) => {
        const opt =
          optimisticMapRef.current[String(inv.id)] ||
          (inv.invoiceNumber ? optimisticMapRef.current[inv.invoiceNumber] : null) ||
          (inv.approvalId ? optimisticMapRef.current[inv.approvalId] : null) ||
          optimisticMap[String(inv.id)] ||
          (inv.invoiceNumber ? optimisticMap[inv.invoiceNumber] : null);
        if (opt) {
          return {
            ...inv,
            status: opt.status,
            canAct: opt.canAct,
            hasApprovedPriorLevel: opt.hasApprovedPriorLevel !== undefined ? opt.hasApprovedPriorLevel : inv.hasApprovedPriorLevel,
            isReturned: opt.isReturned !== undefined ? opt.isReturned : inv.isReturned,
            currentLevel: opt.currentLevel !== undefined ? opt.currentLevel : inv.currentLevel,
          };
        }
        return inv;
      });

      setInvoicesList(finalMerged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase invoices');
    } finally {
      setLoading(false);
      isInitialLoadRef.current = false;
    }
  }, [authRoles, canApproveAP, isAdmin, optimisticMap]);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      setOptimisticMap({});
      optimisticMapRef.current = {};
      clearAllApiCache();
      fetchInvoicesData({ silent: true });
    }, 250);
  }, [fetchInvoicesData]);

  useEffect(() => {
    // 1. Ensure SSE connection is active
    sseClient.connect();

    // 2. Fetch fresh invoice and approval data
    fetchInvoicesData();

    // 3. Listen to all SSE events related to invoices and approval chain
    const unsubLevel = sseClient.on('approval_level_complete', debouncedRefresh);
    const unsubChain = sseClient.on('approval_chain_complete', debouncedRefresh);
    const unsubForwarded = sseClient.on('approval_auto_forwarded', debouncedRefresh);
    const unsubReq = sseClient.on('approval_required', debouncedRefresh);
    const unsubNotif = sseClient.on('notification', debouncedRefresh);
    const unsubApprovalInit = sseClient.on('approval_initiated', debouncedRefresh);
    const unsubApprovalUpdated = sseClient.on('approval_updated', debouncedRefresh);
    const unsubPoStatus = sseClient.on('po_status_changed', debouncedRefresh);
    const unsubPoUpdated = sseClient.on('po_updated', debouncedRefresh);
    const unsubPoCreated = sseClient.on('po_created', debouncedRefresh);

    // 4. In-page and cross-component custom window events
    const handleApprovalUpdated = () => {
      debouncedRefresh();
    };

    window.addEventListener('heliflow:approval-updated', handleApprovalUpdated);
    window.addEventListener('heliflow:invoice-created', debouncedRefresh);
    window.addEventListener('heliflow:invoice-deleted', debouncedRefresh);
    window.addEventListener('heliflow:dispatch-note-created', debouncedRefresh);
    window.addEventListener('heliflow:po-created', debouncedRefresh);
    window.addEventListener('heliflow:po-updated', debouncedRefresh);

    // 5. Cross-tab real-time sync via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('heliflow_sync');
      bc.onmessage = (e) => {
        if (e?.data?.source === 'AccountsPayablePage') return;
        debouncedRefresh();
      };
    } catch {}

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      unsubLevel();
      unsubChain();
      unsubForwarded();
      unsubReq();
      unsubNotif();
      unsubApprovalInit();
      unsubApprovalUpdated();
      unsubPoStatus();
      unsubPoUpdated();
      unsubPoCreated();

      window.removeEventListener('heliflow:approval-updated', handleApprovalUpdated);
      window.removeEventListener('heliflow:invoice-created', debouncedRefresh);
      window.removeEventListener('heliflow:invoice-deleted', debouncedRefresh);
      window.removeEventListener('heliflow:dispatch-note-created', debouncedRefresh);
      window.removeEventListener('heliflow:po-created', debouncedRefresh);
      window.removeEventListener('heliflow:po-updated', debouncedRefresh);

      if (bc) bc.close();
    };
  }, [fetchInvoicesData, debouncedRefresh]);

  const summary = useMemo(
    () => {
      const normalize = (val: number) => (val >= 1000000 && (val === 11800000 || (val % 1000 === 0 && val / 1000 <= 100000)) ? val / 1000 : val);
      return {
        totalPayable: invoicesList.reduce((sum, invoice) => sum + normalize(invoice.amount) - normalize(invoice.paidAmount), 0),
        overdue: invoicesList.filter((invoice) => invoice.status === 'OVERDUE').length,
        pending: invoicesList.filter((invoice) => (invoice.status === 'PENDING' || invoice.status === 'PENDING_APPROVAL' || invoice.status === 'RE_REVIEW' || (invoice.status === 'RETURNED' && invoice.canAct)) && invoice.canAct).length,
        completed: invoicesList.filter((invoice) => ['PAID', 'APPROVED'].includes(invoice.status)).length,
      };
    },
    [invoicesList]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 8;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const filtered = useMemo(() => {
    const list = invoicesList;
    const query = search.trim().toLowerCase();
    return list.filter((invoice) => {
      const matchStatus = statusFilter === 'ALL'
        ? true
        : statusFilter === 'RETURNED'
        ? ((invoice.status === 'RETURNED' || invoice.isReturned) && (invoice.canAct || isAdmin))
        : statusFilter === 'PENDING'
        ? ((invoice.status === 'PENDING' || invoice.status === 'PENDING_APPROVAL' || invoice.status === 'RE_REVIEW') && (invoice.canAct || isAdmin))
        : invoice.status === statusFilter;

      return (
        matchStatus &&
        (!query ||
          [invoice.invoiceNumber, invoice.vendorName, invoice.poNumber].some((field) =>
            (field || '').toLowerCase().includes(query)
          ))
      );
    });
  }, [invoicesList, search, statusFilter, isAdmin]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const handleAction = useCallback(async () => {
    if (!actionModal) return;
    const targetInvoice = actionModal.invoice;
    let approvalId = targetInvoice.approvalId;
    const act = actionModal.action;
    const comment = actionComment.trim() || (act === 'return' ? 'Returned for revision' : act === 'reject' ? 'Rejected by approver' : undefined);
    const returnTarget = (targetInvoice.currentLevel || 1) > 1 ? actionReturnTarget : 'ORIGINATOR';

    // ⚡ INSTANT (0ms) Optimistic local state update & Instant Success Modal Trigger
    const newStatus: APStatus =
      act === 'approve'
        ? 'APPROVED'
        : act === 'reject'
        ? 'REJECTED'
        : 'RETURNED';

    const isReturning = act === 'return';
    const optUpdate = {
      status: newStatus,
      canAct: false,
      isReturned: isReturning,
      hasApprovedPriorLevel: act === 'approve',
      currentLevel: act === 'return' && returnTarget === 'LEVEL_1' ? 1 : targetInvoice.currentLevel,
    };

    const optKeys = [String(targetInvoice.id), targetInvoice.invoiceNumber, approvalId].filter(Boolean) as string[];
    optKeys.forEach((k) => {
      optimisticMapRef.current[k] = optUpdate;
    });

    setOptimisticMap((prev) => {
      const next = { ...prev };
      optKeys.forEach((k) => { next[k] = optUpdate; });
      return next;
    });

    setInvoicesList((prev) =>
      prev.map((inv) =>
        inv.id === targetInvoice.id ||
        inv.invoiceNumber === targetInvoice.invoiceNumber ||
        (approvalId && inv.approvalId === approvalId) ||
        (inv.poNumber && targetInvoice.poNumber && inv.poNumber === targetInvoice.poNumber)
          ? {
              ...inv,
              status: newStatus,
              canAct: false,
              isReturned: isReturning,
              hasApprovedPriorLevel: act === 'approve',
              currentLevel: act === 'return' && returnTarget === 'LEVEL_1' ? 1 : inv.currentLevel,
            }
          : inv
      )
    );
    setActionModal(null);
    setActionComment('');

    setActionSuccessData({
      actionType: act === 'approve' ? 'approve' : act === 'reject' ? 'reject' : 'return',
      module: 'Purchase Invoice',
      referenceNumber: targetInvoice.invoiceNumber,
      title: `Invoice from ${targetInvoice.vendorName}`,
      message:
        act === 'approve'
          ? 'Purchase Invoice approved successfully.'
          : act === 'reject'
          ? 'Purchase Invoice rejected successfully.'
          : returnTarget === 'LEVEL_1'
          ? 'Purchase Invoice returned to Level 1 Approver successfully.'
          : 'Purchase Invoice returned to Originator/Admin for revision successfully.',
      comment: comment,
      details: [
        { label: 'Vendor', value: targetInvoice.vendorName },
        { label: 'Invoice Amount', value: formatAmount(targetInvoice.amount, companyDefaultCurrency) },
        { label: 'Due Date', value: formatDate(targetInvoice.dueDate) },
      ],
    });

    (async () => {
      try {
        try {
          const list = await approvalService.listTable({ module: 'AccountsPayable' }).catch(() => []);
          const pendingRow = list.find(
            (r: any) =>
              r.status === 'PENDING' &&
              (r.referenceId === String(targetInvoice.id) ||
                r.referenceNumber === targetInvoice.invoiceNumber ||
                r.referenceId === targetInvoice.invoiceNumber ||
                (r.title && r.title.includes(targetInvoice.invoiceNumber)))
          );
          if (pendingRow) {
            approvalId = pendingRow.id;
          }
        } catch {}

        if (approvalId) {
          if (act === 'approve') {
            const res = await approvalService.approve(approvalId, comment).catch(async (err) => {
              console.warn('approvalService.approve failed, falling back to direct status update:', err);
              return { nextLevel: false };
            });
            const isFinal =
              res?.nextLevel === false ||
              (!res?.nextLevel && Boolean(targetInvoice.totalLevels) && targetInvoice.currentLevel >= targetInvoice.totalLevels);

            if (isFinal) {
              await invoiceService.updateStatus(targetInvoice.id, 'APPROVED').catch(() => {});
              if (targetInvoice.invoiceNumber) {
                await invoiceService.updateStatus(targetInvoice.invoiceNumber, 'APPROVED').catch(() => {});
              }
              setGeneratedVoucherBanner({
                voucherNumber: targetInvoice.invoiceNumber,
                invoiceNumber: targetInvoice.invoiceNumber,
                vendorName: targetInvoice.vendorName,
                amount: targetInvoice.amount,
              });
              try {
                localDataService.savePayment({
                  paymentId: `PV-${targetInvoice.invoiceNumber.replace(/^INV-?/i, '')}`,
                  vendor: targetInvoice.vendorName,
                  invoiceRef: targetInvoice.invoiceNumber,
                  amount: targetInvoice.amount,
                  method: 'NEFT',
                  status: 'DRAFT',
                  remarks: `Auto-generated Draft Payment Voucher for approved Invoice #${targetInvoice.invoiceNumber}`,
                });
              } catch {}
            }
          } else if (act === 'reject') {
            await approvalService.reject(approvalId, comment);
            await invoiceService.updateStatus(targetInvoice.id, 'REJECTED', comment).catch(() => {});
            if (targetInvoice.invoiceNumber) {
              await invoiceService.updateStatus(targetInvoice.invoiceNumber, 'REJECTED', comment).catch(() => {});
            }
          } else {
            await approvalService.return(approvalId, comment, returnTarget);
            const statusToSet = 'RETURNED';
            await invoiceService.updateStatus(targetInvoice.id, statusToSet, comment, returnTarget).catch(() => {});
            if (targetInvoice.invoiceNumber) {
              await invoiceService.updateStatus(targetInvoice.invoiceNumber, statusToSet, comment, returnTarget).catch(() => {});
            }
          }
        } else {
          const statusToSet =
            act === 'approve'
              ? 'APPROVED'
              : act === 'reject'
              ? 'REJECTED'
              : 'RETURNED';
          await invoiceService.updateStatus(targetInvoice.id, statusToSet, comment, returnTarget).catch(() => {});
          if (targetInvoice.invoiceNumber) {
            await invoiceService.updateStatus(targetInvoice.invoiceNumber, statusToSet, comment, returnTarget).catch(() => {});
          }
        }

        invalidateApiCache('/approvals');
        invalidateApiCache('/invoices');
        invalidateApiCache('/payments');
        clearAllApiCache();
        await new Promise((resolve) => setTimeout(resolve, 250));
        window.dispatchEvent(new CustomEvent('heliflow:approval-updated', { detail: { source: 'AccountsPayablePage' } }));
        try {
          const bc = new BroadcastChannel('heliflow_sync');
          bc.postMessage({ type: 'APPROVAL_UPDATED', source: 'AccountsPayablePage', timestamp: Date.now() });
          bc.close();
        } catch {}
        debouncedRefresh();
      } catch (err: any) {
        console.error('Action failed in background:', err);
        alert(err?.message || 'Failed to complete invoice action. Please try again.');
        debouncedRefresh();
      }
    })();
  }, [actionModal, actionComment, actionReturnTarget, debouncedRefresh, companyDefaultCurrency, formatAmount]);

  const handleSignatureConfirm = useCallback(
    async (signatureDataUrl: string, comment?: string) => {
      if (!actionModal) return;
      const targetInvoice = actionModal.invoice;
      let approvalId = targetInvoice.approvalId;

      // ⚡ INSTANT 0ms Optimistic UI & Success Modal Trigger
      const optUpdate = { status: 'APPROVED' as APStatus, canAct: false, hasApprovedPriorLevel: true };
      const optKeys = [String(targetInvoice.id), targetInvoice.invoiceNumber, approvalId].filter(Boolean) as string[];
      optKeys.forEach((k) => {
        optimisticMapRef.current[k] = optUpdate;
      });

      setOptimisticMap((prev) => {
        const next = { ...prev };
        optKeys.forEach((k) => { next[k] = optUpdate; });
        return next;
      });

      setInvoicesList((prev) =>
        prev.map((inv) =>
          inv.id === targetInvoice.id || inv.invoiceNumber === targetInvoice.invoiceNumber || (approvalId && inv.approvalId === approvalId)
            ? { ...inv, status: 'APPROVED', canAct: false, hasApprovedPriorLevel: true }
            : inv
        )
      );
      setActionModal(null);
      setActionComment('');

      setActionSuccessData({
        actionType: 'approve',
        module: 'Purchase Invoice',
        referenceNumber: targetInvoice.invoiceNumber,
        title: `Invoice from ${targetInvoice.vendorName}`,
        message: 'Purchase Invoice approved successfully with digital signature.',
        comment: comment,
        details: [
          { label: 'Vendor', value: targetInvoice.vendorName },
          { label: 'Invoice Amount', value: formatAmount(targetInvoice.amount, companyDefaultCurrency) },
          { label: 'Due Date', value: formatDate(targetInvoice.dueDate) },
        ],
      });

      // Background concurrent API execution
      (async () => {
        try {
          try {
            const list = await approvalService.listTable({ module: 'AccountsPayable' }).catch(() => []);
            const pendingRow = list.find(
              (r: any) =>
                r.status === 'PENDING' &&
                (r.referenceId === String(targetInvoice.id) ||
                  r.referenceNumber === targetInvoice.invoiceNumber ||
                  r.referenceId === targetInvoice.invoiceNumber ||
                  (r.title && r.title.includes(targetInvoice.invoiceNumber)))
            );
            if (pendingRow) {
              approvalId = pendingRow.id;
            }
          } catch {}

          const refsToSign = Array.from(new Set([targetInvoice.invoiceNumber, String(targetInvoice.id)].filter(Boolean) as string[]));
          const signPromises = refsToSign.map((ref) =>
            signatureService.signDocument({
              module: 'AccountsPayable',
              referenceId: ref,
              signatureId: 'digital_signature',
              dataUrl: signatureDataUrl,
              levelNumber: targetInvoice.currentLevel || 1,
              comments: comment,
            }).catch((sigErr) => console.warn('Digital signature warning:', sigErr))
          );
          await Promise.all(signPromises);

          let approvePromise;
          if (approvalId) {
            approvePromise = approvalService.approve(approvalId, comment).then(async (res) => {
              const isFinal =
                res?.nextLevel === false ||
                (!res?.nextLevel && Boolean(targetInvoice.totalLevels) && targetInvoice.currentLevel >= targetInvoice.totalLevels);
              if (isFinal) {
                await invoiceService.updateStatus(targetInvoice.id, 'APPROVED').catch(() => {});
                if (targetInvoice.invoiceNumber) {
                  await invoiceService.updateStatus(targetInvoice.invoiceNumber, 'APPROVED').catch(() => {});
                }
                setGeneratedVoucherBanner({
                  voucherNumber: targetInvoice.invoiceNumber,
                  invoiceNumber: targetInvoice.invoiceNumber,
                  vendorName: targetInvoice.vendorName,
                  amount: targetInvoice.amount,
                });
                try {
                  localDataService.savePayment({
                    paymentId: `PV-${targetInvoice.invoiceNumber.replace(/^INV-?/i, '')}`,
                    vendor: targetInvoice.vendorName,
                    invoiceRef: targetInvoice.invoiceNumber,
                    amount: targetInvoice.amount,
                    method: 'NEFT',
                    status: 'DRAFT',
                    remarks: `Auto-generated Draft Payment Voucher for approved Invoice #${targetInvoice.invoiceNumber}`,
                  });
                } catch {}
              }
            }).catch(async (err) => {
              console.warn('approvalService.approve failed, updating invoice directly:', err);
              await invoiceService.updateStatus(targetInvoice.id, 'APPROVED').catch(() => {});
              if (targetInvoice.invoiceNumber) {
                await invoiceService.updateStatus(targetInvoice.invoiceNumber, 'APPROVED').catch(() => {});
              }
              setGeneratedVoucherBanner({
                voucherNumber: targetInvoice.invoiceNumber,
                invoiceNumber: targetInvoice.invoiceNumber,
                vendorName: targetInvoice.vendorName,
                amount: targetInvoice.amount,
              });
            });
          } else {
            approvePromise = invoiceService.updateStatus(targetInvoice.id, 'APPROVED').then(() => {
              if (targetInvoice.invoiceNumber) {
                return invoiceService.updateStatus(targetInvoice.invoiceNumber, 'APPROVED').catch(() => {});
              }
            });
          }

          await approvePromise;
          invalidateApiCache('/approvals');
          invalidateApiCache('/invoices');
          invalidateApiCache('/payments');
          clearAllApiCache();
          await new Promise((resolve) => setTimeout(resolve, 250));
          window.dispatchEvent(new CustomEvent('heliflow:approval-updated', { detail: { source: 'AccountsPayablePage' } }));
          try {
            const bc = new BroadcastChannel('heliflow_sync');
            bc.postMessage({ type: 'APPROVAL_UPDATED', source: 'AccountsPayablePage', timestamp: Date.now() });
            bc.close();
          } catch {}
          debouncedRefresh();
        } catch (err) {
          console.error('Background approval sync error:', err);
          debouncedRefresh();
        } finally {
          setActionSaving(false);
        }
      })();
    },
    [actionModal, debouncedRefresh, companyDefaultCurrency, formatAmount]
  );

  const openAction = useCallback((invoice: APInvoice, action: ActionType) => {
    setActionModal({ invoice, action });
    setActionComment('');
    setActionReturnTarget('LEVEL_1');
  }, []);

  const handleDraftSubmit = useCallback(
    async (invoice: APInvoice) => {
      try {
        setActionSaving(true);
        await invoiceService.updateStatus(invoice.id, 'PENDING_APPROVAL');
        if (invoice.invoiceNumber) {
          await invoiceService.updateStatus(invoice.invoiceNumber, 'PENDING_APPROVAL').catch(() => {});
        }
        setInvoicesList((prev) =>
          prev.map((inv) =>
            inv.id === invoice.id || inv.invoiceNumber === invoice.invoiceNumber
              ? { ...inv, status: 'PENDING', canAct: true }
              : inv
          )
        );
        window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
        debouncedRefresh();
      } catch (err) {
        console.error('Failed to submit draft invoice:', err);
      } finally {
        setActionSaving(false);
      }
    },
    [debouncedRefresh]
  );

  const formatDate = (date: string) =>
    date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const cardProps = (filter: APStatus | 'ALL') => {
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
          'card-selected border-[var(--card-glow-border)] shadow-[var(--card-glow-shadow)] bg-[var(--card-glow-bg)]'
      ),
    };
  };

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

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard {...cardProps('ALL')} label="Total payable" value={formatAmount(summary.totalPayable, companyDefaultCurrency)} detail="Outstanding balance" icon={Wallet} />
        <MetricCard {...cardProps('OVERDUE')} label="Overdue" value={summary.overdue} detail="Past due date" icon={AlertTriangle} tone="danger" />
        <MetricCard {...cardProps('PENDING')} label="Pending" value={summary.pending} detail="Awaiting review" icon={Clock} tone="warning" />
        <MetricCard {...cardProps('APPROVED')} label="Paid / approved" value={summary.completed} detail="Completed this period" icon={CheckCircle2} tone="success" />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10 pr-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoice, vendor, or PO"
            aria-label="Search invoices"
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

        <div className="flex flex-wrap items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
          {/* Status Filter Dropdown */}
          <div className="relative min-w-[190px]">
            <Filter size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-9 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              aria-label="Filter by status"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partially Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="RETURNED">Returned for Re-Review</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {(statusFilter !== 'ALL' || search) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusFilter('ALL');
                setSearch('');
                setCurrentPage(1);
              }}
              className="h-11 rounded-xl px-3.5"
            >
              Reset filters
            </Button>
          )}
        </div>
      </div>

      {loading && invoicesList.length === 0 ? (
        <Card className="p-4">
          <TableSkeleton rows={5} columns={visibleColumns.length + 1} />
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
          <Card className="hidden overflow-hidden border border-border/60 shadow-xs lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-border/75 bg-muted/45 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className={cn('px-4 py-3', ['amount', 'paidAmount', 'balance'].includes(col.key) && 'text-right')}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>Actions</span>
                        <div className="relative">
                          <ColumnSettingsButton ref={colBtnRef} open={showColPanel} onClick={() => setShowColPanel((v) => !v)} />

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
                                setColumnOrder(ALL_COLUMNS.map((c) => c.key));
                                setVisibleKeys(new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)));
                              }}
                              onClose={() => setShowColPanel(false)}
                              anchorRef={colBtnRef}
                            />
                          )}
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paginated.map((invoice) => (
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
                                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary ring-1 ring-primary/15">
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
                          const displayAmt = invoice.amount >= 1000000 && (invoice.amount === 11800000 || (invoice.amount % 1000 === 0 && invoice.amount / 1000 <= 100000))
                            ? invoice.amount / 1000
                            : invoice.amount;
                          return (
                            <td key="amount" className="px-4 py-3.5 text-right font-medium tabular-nums">
                              {formatAmount(displayAmt, companyDefaultCurrency)}
                            </td>
                          );
                        }
                        if (col.key === 'paidAmount') {
                          const displayPaid = invoice.paidAmount >= 1000000 && (invoice.paidAmount === 11800000 || (invoice.paidAmount % 1000 === 0 && invoice.paidAmount / 1000 <= 100000))
                            ? invoice.paidAmount / 1000
                            : invoice.paidAmount;
                          return (
                            <td key="paidAmount" className="px-4 py-3.5 text-right font-medium text-emerald-600 tabular-nums">
                              {formatAmount(displayPaid, companyDefaultCurrency)}
                            </td>
                          );
                        }
                        if (col.key === 'balance') {
                          const displayAmt = invoice.amount >= 1000000 && (invoice.amount === 11800000 || (invoice.amount % 1000 === 0 && invoice.amount / 1000 <= 100000))
                            ? invoice.amount / 1000
                            : invoice.amount;
                          const displayPaid = invoice.paidAmount >= 1000000 && (invoice.paidAmount === 11800000 || (invoice.paidAmount % 1000 === 0 && invoice.paidAmount / 1000 <= 100000))
                            ? invoice.paidAmount / 1000
                            : invoice.paidAmount;
                          return (
                            <td key="balance" className="px-4 py-3.5 text-right font-semibold tabular-nums">
                              {formatAmount(displayAmt - displayPaid, companyDefaultCurrency)}
                            </td>
                          );
                        }
                        if (col.key === 'dueDate') {
                          return <td key="dueDate" className="px-4 py-3.5 text-xs text-muted-foreground">{formatDate(invoice.dueDate)}</td>;
                        }
                        if (col.key === 'status') {
                          return (
                            <td key="status" className="px-4 py-3.5">
                              <StatusBadge
                                status={invoice.status}
                                currentLevel={invoice.currentLevel}
                                hasApprovedPriorLevel={invoice.hasApprovedPriorLevel}
                                isReturned={invoice.isReturned}
                                canAct={invoice.canAct}
                                requiredRole={invoice.requiredRole}
                              />
                            </td>
                          );
                        }
                        return <td key={col.key} className="px-4 py-3.5">-</td>;
                      })}
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              const normAmt = invoice.amount >= 1000000 && (invoice.amount === 11800000 || (invoice.amount % 1000 === 0 && invoice.amount / 1000 <= 100000))
                                ? invoice.amount / 1000
                                : invoice.amount;
                              setDetailInvoice({ ...invoice, amount: normAmt });
                            }}
                            aria-label={`View ${invoice.invoiceNumber}`}
                            title="View Details"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              const normAmt = invoice.amount >= 1000000 && (invoice.amount === 11800000 || (invoice.amount % 1000 === 0 && invoice.amount / 1000 <= 100000))
                                ? invoice.amount / 1000
                                : invoice.amount;
                              setPrintInvoice({ ...invoice, amount: normAmt });
                            }}
                            aria-label={`Print ${invoice.invoiceNumber}`}
                            title="Print Invoice"
                          >
                            <Printer className="size-4" />
                          </Button>
                          {['PENDING', 'RETURNED', 'RE_REVIEW', 'PENDING_APPROVAL'].includes(invoice.status) && invoice.canAct ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                onClick={() => openAction(invoice, 'approve')}
                                aria-label={`Approve ${invoice.invoiceNumber}`}
                                title="Approve invoice"
                              >
                                <ThumbsUp className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => openAction(invoice, 'reject')}
                                aria-label={`Reject ${invoice.invoiceNumber}`}
                                title="Reject invoice"
                              >
                                <ThumbsDown className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openAction(invoice, 'return')}
                                aria-label={`Return ${invoice.invoiceNumber}`}
                                title="Return invoice"
                              >
                                <RotateCcw className="size-4" />
                              </Button>
                            </>
                          ) : invoice.status === 'DRAFT' && canApproveAP ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-primary hover:bg-primary/10 hover:text-primary"
                              onClick={() => handleDraftSubmit(invoice)}
                              aria-label={`Submit ${invoice.invoiceNumber} for approval`}
                              title="Submit for Approval"
                            >
                              <Send className="size-4" />
                            </Button>
                          ) : invoice.status === 'PENDING' || (invoice.status === 'RETURNED' && !invoice.canAct) ? (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              L{invoice.currentLevel} ({invoice.requiredRole})
                            </span>
                          ) : null}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteConfirmInvoice(invoice)}
                              aria-label={`Delete ${invoice.invoiceNumber}`}
                              title="Delete Invoice"
                            >
                              <Trash2 className="size-4" />
                            </Button>
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
            {paginated.map((invoice) => (
              <Card key={invoice.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-primary">{invoice.invoiceNumber}</div>
                    <div className="mt-1 truncate text-sm font-medium">{invoice.vendorName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">PO {invoice.poNumber}</div>
                  </div>
                  <StatusBadge
                    status={invoice.status}
                    currentLevel={invoice.currentLevel}
                    hasApprovedPriorLevel={invoice.hasApprovedPriorLevel}
                    isReturned={invoice.isReturned}
                    canAct={invoice.canAct}
                    requiredRole={invoice.requiredRole}
                  />
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
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setDetailInvoice(invoice)}>
                      <Eye /> Details
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPrintInvoice(invoice)}>
                      <Printer /> Print
                    </Button>
                  </div>
                  {['PENDING', 'RETURNED', 'RE_REVIEW', 'PENDING_APPROVAL'].includes(invoice.status) && invoice.canAct && (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => openAction(invoice, 'approve')}>
                        <ThumbsUp /> Approve
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => openAction(invoice, 'reject')}>
                        <ThumbsDown /> Reject
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openAction(invoice, 'return')}>
                        <RotateCcw /> Return
                      </Button>
                    </div>
                  )}
                  {invoice.status === 'DRAFT' && canApproveAP && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="text-primary gap-1.5" onClick={() => handleDraftSubmit(invoice)}>
                        <Send className="size-3.5" /> Submit for Approval
                      </Button>
                    </div>
                  )}
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive/70 hover:text-destructive gap-1.5"
                        onClick={() => setDeleteConfirmInvoice(invoice)}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <TablePagination
            currentPage={safePage}
            totalItems={filtered.length}
            perPage={perPage}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {/* Action Dialog */}
      {actionModal && actionModal.action === 'approve' ? (
        <DigitalSignatureApprovalModal
          open={!!actionModal}
          onClose={() => setActionModal(null)}
          onConfirm={handleSignatureConfirm}
          docTitle={`Purchase Invoice ${actionModal.invoice.invoiceNumber}`}
          docDetails={[
            { label: 'Invoice Number', value: actionModal.invoice.invoiceNumber },
            { label: 'Vendor Name', value: actionModal.invoice.vendorName },
            { label: 'Amount', value: formatAmount(actionModal.invoice.amount, companyDefaultCurrency) },
            { label: 'Due Date', value: formatDate(actionModal.invoice.dueDate) },
          ]}
        />
      ) : (
        <Dialog open={!!actionModal} onOpenChange={(open) => { if (!open && !actionSaving) setActionModal(null); }}>
          {actionModal && (
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-xl',
                      actionModal.action === 'reject'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    )}
                  >
                    {actionModal.action === 'reject' ? (
                      <ThumbsDown className="size-5" />
                    ) : (
                      <RotateCcw className="size-5" />
                    )}
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold text-foreground">
                      {actionModal.action === 'reject' ? 'Reject Invoice' : 'Return Invoice'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Invoice <span className="font-semibold text-foreground">{actionModal.invoice.invoiceNumber}</span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                {/* Clean Structured Invoice Summary */}
                <div className="rounded-xl border border-border/70 bg-muted/20 dark:bg-muted/10 p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Vendor</span>
                      <span className="text-xs sm:text-sm font-semibold text-foreground truncate block">{actionModal.invoice.vendorName}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Amount</span>
                      <span className="text-xs sm:text-sm font-bold text-foreground tabular-nums">
                        {formatAmount(actionModal.invoice.amount, companyDefaultCurrency)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                    <span>Balance: <strong className="text-foreground font-semibold">{formatAmount(actionModal.invoice.amount - actionModal.invoice.paidAmount, companyDefaultCurrency)}</strong></span>
                    <span>Due: <strong className="text-foreground font-semibold">{formatDate(actionModal.invoice.dueDate)}</strong></span>
                  </div>
                </div>

                {/* Return Destination (Options for Approver 2+; for Approver 1 shows clear Originator/Admin notice) */}
                {actionModal.action === 'return' && (
                  (actionModal.invoice.currentLevel || 1) > 1 ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                        <span>Return Destination</span>
                        <span className="text-[11px] text-muted-foreground">Select recipient</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          className={cn(
                            "relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer outline-none",
                            actionReturnTarget === 'ORIGINATOR'
                              ? "border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500/30"
                              : "border-border/70 bg-card/60 hover:bg-muted/40 hover:border-border text-foreground"
                          )}
                          onClick={() => setActionReturnTarget('ORIGINATOR')}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className="text-xs font-bold">Originator / Admin</span>
                            <div className={cn(
                              "size-4 rounded-full border flex items-center justify-center shrink-0 transition-all",
                              actionReturnTarget === 'ORIGINATOR'
                                ? "border-amber-500 bg-amber-500"
                                : "border-muted-foreground/30 bg-transparent"
                            )}>
                              {actionReturnTarget === 'ORIGINATOR' && (
                                <div className="size-1.5 rounded-full bg-white" />
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            Send back to creator for revision & edits
                          </p>
                        </button>

                        <button
                          type="button"
                          className={cn(
                            "relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer outline-none",
                            actionReturnTarget === 'LEVEL_1'
                              ? "border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500/30"
                              : "border-border/70 bg-card/60 hover:bg-muted/40 hover:border-border text-foreground"
                          )}
                          onClick={() => setActionReturnTarget('LEVEL_1')}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className="text-xs font-bold">Approver 1 (Level 1)</span>
                            <div className={cn(
                              "size-4 rounded-full border flex items-center justify-center shrink-0 transition-all",
                              actionReturnTarget === 'LEVEL_1'
                                ? "border-amber-500 bg-amber-500"
                                : "border-muted-foreground/30 bg-transparent"
                            )}>
                              {actionReturnTarget === 'LEVEL_1' && (
                                <div className="size-1.5 rounded-full bg-white" />
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            Restart workflow at Level 1 Approver
                          </p>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15 p-3.5 flex items-start gap-3">
                      <RotateCcw className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-xs">
                        <div className="font-bold text-amber-900 dark:text-amber-200">
                          Return Destination: Originator / Admin
                        </div>
                        <p className="text-amber-800/90 dark:text-amber-300/80 leading-relaxed text-[11px]">
                          As Level 1 Approver, returning this invoice will send it back to the <strong>Originator / Admin</strong> for modification and revision.
                        </p>
                      </div>
                    </div>
                  )
                )}

                {/* Comments Box */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-muted-foreground" />
                    Reason for {actionModal.action === 'return' ? 'Return' : 'Rejection'} <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    className="w-full min-h-[85px] rounded-xl border border-input bg-card/60 px-3.5 py-2.5 text-xs sm:text-sm font-normal outline-none focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/20 transition-all placeholder:text-muted-foreground/60 resize-none"
                    value={actionComment}
                    onChange={(event) => setActionComment(event.target.value)}
                    placeholder={
                      actionModal.action === 'return'
                        ? actionReturnTarget === 'LEVEL_1'
                          ? 'Explain why this invoice is being sent back to Level 1...'
                          : 'Explain what changes the originator needs to make...'
                        : 'Provide a reason for rejection...'
                    }
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-row justify-end items-center gap-2.5 pt-2">
                <Button variant="outline" className="rounded-xl h-9 px-4 text-xs font-medium" onClick={() => setActionModal(null)} disabled={actionSaving}>
                  Cancel
                </Button>
                <Button
                  variant={actionModal.action === 'reject' ? 'destructive' : 'default'}
                  className={cn(
                    "rounded-xl h-9 px-5 text-xs font-semibold shadow-xs transition-all cursor-pointer",
                    actionModal.action === 'return' && "bg-amber-600 hover:bg-amber-700 text-white"
                  )}
                  loading={actionSaving}
                  disabled={actionSaving}
                  onClick={handleAction}
                >
                  {actionModal.action === 'return' ? 'Confirm Return' : 'Confirm Rejection'}
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null); }}>
        {detailInvoice && (
          <DialogContent className="max-w-xl p-6 sm:p-7">
            <DialogHeader className="space-y-1 pr-8">
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                  {detailInvoice.invoiceNumber}
                </DialogTitle>
                <StatusBadge
                  status={detailInvoice.status}
                  currentLevel={detailInvoice.currentLevel}
                  hasApprovedPriorLevel={detailInvoice.hasApprovedPriorLevel}
                  isReturned={detailInvoice.isReturned}
                  canAct={detailInvoice.canAct}
                  requiredRole={detailInvoice.requiredRole}
                />
              </div>
              <DialogDescription className="text-sm font-medium text-muted-foreground">
                {detailInvoice.vendorName} · {formatAmount(detailInvoice.amount, companyDefaultCurrency)}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="border-t border-border/60 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Invoice details
                </h4>

                <div className="divide-y divide-border/40 text-sm">
                  {/* Row 1 */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        PO Reference
                      </div>
                      <div className="mt-1 font-semibold text-foreground">
                        {detailInvoice.poNumber}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Department
                      </div>
                      <div className="mt-1 font-medium text-foreground">
                        {detailInvoice.department || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Amount
                      </div>
                      <div className="mt-1 text-base font-bold text-foreground">
                        {formatAmount(detailInvoice.amount, companyDefaultCurrency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Paid
                      </div>
                      <div className="mt-1 font-medium text-muted-foreground">
                        {formatAmount(detailInvoice.paidAmount, companyDefaultCurrency)}
                      </div>
                    </div>
                  </div>

                  {/* Row 3 */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Balance
                      </div>
                      <div className="mt-1 font-bold text-foreground">
                        {formatAmount(detailInvoice.amount - detailInvoice.paidAmount, companyDefaultCurrency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Payment Terms
                      </div>
                      <div className="mt-1 font-medium text-foreground">
                        {detailInvoice.paymentTerms}
                      </div>
                    </div>
                  </div>

                  {/* Row 4 */}
                  <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Invoice Date
                      </div>
                      <div className="mt-1 font-medium text-foreground">
                        {formatDate(detailInvoice.invoiceDate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Due Date
                      </div>
                      <div className="mt-1 font-medium text-foreground">
                        {formatDate(detailInvoice.dueDate)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {detailInvoice.comments && (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Comments
                  </div>
                  <p className="mt-1.5 text-sm text-foreground">{detailInvoice.comments}</p>
                </div>
              )}

              {/* Attached Vendor Documents / Physical Invoice PDF */}
              {(() => {
                const attList = getInvoiceAttachments(detailInvoice);
                return (
                  <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Paperclip className="size-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Attached Vendor Documents ({attList.length})
                        </span>
                      </div>
                      {attList.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => setViewerInvoice(detailInvoice)}
                        >
                          <Eye className="size-3.5" /> View All ({attList.length})
                        </Button>
                      )}
                    </div>

                    {attList.length > 0 ? (
                      <div className="space-y-2">
                        {attList.map((att: any, idx: number) => (
                          <div
                            key={att.id || idx}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs transition-colors hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="size-4 text-primary shrink-0" />
                              <span className="font-semibold text-foreground truncate">{att.name}</span>
                              {att.size && <span className="text-muted-foreground shrink-0">({att.size})</span>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="View Document"
                                onClick={() => setViewerInvoice(detailInvoice)}
                              >
                                <Eye className="size-3.5 text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="Download Document"
                                onClick={() => {
                                  if (att.dataUrl) {
                                    const link = document.createElement('a');
                                    link.href = att.dataUrl;
                                    link.download = att.name || 'invoice-document';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  } else if (att.url) {
                                    window.open(att.url, '_blank');
                                  }
                                }}
                              >
                                <Download className="size-3.5 text-muted-foreground hover:text-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="Print Document"
                                onClick={() => {
                                  setViewerInvoice(detailInvoice);
                                }}
                              >
                                <Printer className="size-3.5 text-muted-foreground hover:text-foreground" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 p-3 text-xs text-muted-foreground bg-muted/10">
                        <FileText className="size-4 text-muted-foreground/60" />
                        <span>No physical or digital documents attached by vendor</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <DialogFooter className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                className="gap-2 rounded-full px-4"
                onClick={() => {
                  const inv = detailInvoice;
                  const refId = inv.invoiceNumber || String(inv.id);
                  setChainModal({ module: 'AccountsPayable', referenceId: refId });
                }}
              >
                <Clock className="size-4" /> View Approval Chain
              </Button>

              <div className="flex items-center gap-2">
                {['PENDING', 'RETURNED', 'RE_REVIEW', 'PENDING_APPROVAL'].includes(detailInvoice.status) && detailInvoice.canAct ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600 hover:text-amber-700 border-amber-500/30 hover:bg-amber-500/10 rounded-full px-3.5"
                      onClick={() => {
                        const inv = detailInvoice;
                        setDetailInvoice(null);
                        openAction(inv, 'return');
                      }}
                    >
                      <RotateCcw className="size-3.5 mr-1" /> Return
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-full px-3.5"
                      onClick={() => {
                        const inv = detailInvoice;
                        setDetailInvoice(null);
                        openAction(inv, 'reject');
                      }}
                    >
                      <ThumbsDown className="size-3.5 mr-1" /> Reject
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-4"
                      onClick={() => {
                        const inv = detailInvoice;
                        setDetailInvoice(null);
                        openAction(inv, 'approve');
                      }}
                    >
                      <ThumbsUp className="size-3.5 mr-1" /> Approve
                    </Button>
                  </>
                ) : detailInvoice.status === 'DRAFT' && canApproveAP ? (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1.5 rounded-full px-4"
                      onClick={() => {
                        const inv = detailInvoice;
                        setDetailInvoice(null);
                        handleDraftSubmit(inv);
                      }}
                    >
                      <Send className="size-3.5 mr-1" /> Submit for Approval
                    </Button>
                    <Button variant="secondary" className="rounded-full px-5" onClick={() => setDetailInvoice(null)}>
                      Close
                    </Button>
                  </>
                ) : (
                  <>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 rounded-full px-3.5 gap-1.5"
                        onClick={() => {
                          const inv = detailInvoice;
                          setDetailInvoice(null);
                          setDeleteConfirmInvoice(inv);
                        }}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    )}
                    <Button variant="secondary" className="rounded-full px-5" onClick={() => setDetailInvoice(null)}>
                      Close
                    </Button>
                  </>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete Confirmation Modal */}
      {deleteConfirmInvoice && (
        <Dialog open={Boolean(deleteConfirmInvoice)} onOpenChange={() => setDeleteConfirmInvoice(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="size-5" /> Delete Purchase Invoice
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete invoice <strong className="text-foreground">{deleteConfirmInvoice.invoiceNumber}</strong>?
                This will permanently remove this invoice and its approval chain from the system.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button variant="outline" onClick={() => setDeleteConfirmInvoice(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteInvoice} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Document Viewer Modal */}
      <InvoiceDocumentViewerModal
        open={!!viewerInvoice}
        invoice={viewerInvoice}
        onClose={() => setViewerInvoice(null)}
      />

      {/* Print Purchase Invoice Modal */}
      {printInvoice && (
        <PrintPurchaseInvoiceModal
          data={printInvoice}
          invoice={printInvoice}
          onClose={() => setPrintInvoice(null)}
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

      {/* Success Modal */}
      {actionSuccessData && (
        <ActionSuccessModal
          data={actionSuccessData}
          onClose={() => setActionSuccessData(null)}
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

      </DialogContent>
    </Dialog>
  );
}
