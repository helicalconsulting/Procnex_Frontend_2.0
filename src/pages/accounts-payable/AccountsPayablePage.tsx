import React from "react";
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { invoiceService, type APInvoice as ServiceAPInvoice } from '../../services/invoiceService';
import { localDataService } from '../../services/localDataService';
import { apiRequest } from '../../api/client';
import {
  Wallet, Search, Clock, CheckCircle2, AlertTriangle,
  IndianRupee, Eye, ThumbsUp, ThumbsDown, RotateCcw,
  X, MessageSquare, ArrowRight, XCircle, Minus, Printer
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { TableSkeleton } from '../../components/shared/Skeleton';
import PrintPurchaseInvoiceModal from '../../components/invoices/PrintPurchaseInvoiceModal';
import './AccountsPayablePage.css';

// ─── Types ──────────────────────────────────────────────────

type APStatus = 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL' | 'APPROVED' | 'REJECTED' | 'RETURNED';

interface APInvoice {
  id: number;
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
  comments?: string;
}

// ─── Column Definitions ─────────────────────────────────────

interface APColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (inv: APInvoice, fmt: (n: number) => string, fmtDate: (d: string) => string) => React.ReactNode;
}

const STATUS_MAP: Record<APStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:  { label: 'Pending',  cls: 'pending',  icon: <Clock size={14} /> },
  OVERDUE:  { label: 'Overdue',  cls: 'overdue',  icon: <AlertTriangle size={14} /> },
  PAID:     { label: 'Paid',     cls: 'paid',     icon: <CheckCircle2 size={14} /> },
  PARTIAL:  { label: 'Partial',  cls: 'partial',  icon: <IndianRupee size={14} /> },
  APPROVED: { label: 'Approved', cls: 'approved', icon: <CheckCircle2 size={14} /> },
  REJECTED: { label: 'Rejected', cls: 'rejected', icon: <X size={14} /> },
  RETURNED: { label: 'Returned', cls: 'returned', icon: <RotateCcw size={14} /> },
};

const ALL_COLUMNS: APColumnDef[] = [
  {
    key: 'invoiceNumber',
    label: 'Invoice',
    defaultVisible: true,
    required: true,
    width: '160px',
    render: (inv) => <span className="fin-table__ref">{inv.invoiceNumber}</span>,
  },
  {
    key: 'vendor',
    label: 'Vendor',
    defaultVisible: true,
    required: true,
    width: '230px',
    render: (inv) => (
      <div className="fin-table__vendor">
        <div className={`fin-table__avatar fin-table__avatar--${inv.avatarMod}`}>{inv.vendorInitials}</div>
        <div>
          <span className="fin-table__vendor-name">{inv.vendorName}</span>
          <span className="fin-table__vendor-dept">{inv.department}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'poNumber',
    label: 'PO Ref',
    defaultVisible: true,
    width: '170px',
    render: (inv) => <span className="fin-table__secondary">{inv.poNumber}</span>,
  },
  {
    key: 'amount',
    label: 'Amount',
    defaultVisible: true,
    width: '140px',
    align: 'right',
    render: (inv, fmt) => <span className="fin-table__amount">{fmt(inv.amount)}</span>,
  },
  {
    key: 'paid',
    label: 'Paid',
    defaultVisible: true,
    width: '130px',
    align: 'right',
    render: (inv, fmt) => <span className="fin-table__amount fin-table__amount--success">{fmt(inv.paidAmount)}</span>,
  },
  {
    key: 'balance',
    label: 'Balance',
    defaultVisible: true,
    width: '140px',
    align: 'right',
    render: (inv, fmt) => <span className="fin-table__amount fin-table__amount--bold">{fmt(inv.amount - inv.paidAmount)}</span>,
  },
  {
    key: 'dueDate',
    label: 'Due Date',
    defaultVisible: true,
    width: '130px',
    render: (inv, _fmt, fmtDate) => <span className="fin-table__date">{fmtDate(inv.dueDate)}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    defaultVisible: true,
    width: '150px',
    render: (inv) => {
      const cfg = STATUS_MAP[inv.status];
      return <span className={`fin-badge fin-badge--${cfg.cls}`}>{cfg.icon}{cfg.label}</span>;
    },
  },
  // ── Extra columns (hidden by default — from "DB") ─────────
  {
    key: 'invoiceDate',
    label: 'Invoice Date',
    defaultVisible: false,
    width: '110px',
    render: (inv, _fmt, fmtDate) => <span className="fin-table__date">{fmtDate(inv.invoiceDate)}</span>,
  },
  {
    key: 'paymentTerms',
    label: 'Payment Terms',
    defaultVisible: false,
    width: '120px',
    render: (inv) => <span className="fin-table__secondary">{inv.paymentTerms}</span>,
  },
  {
    key: 'department',
    label: 'Department',
    defaultVisible: false,
    width: '120px',
    render: (inv) => <span className="fin-table__secondary">{inv.department}</span>,
  },
];

function mapServiceInvoice(inv: ServiceAPInvoice): APInvoice {
  const initials = inv.vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
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
  const paidAmount = status === 'PAID' ? inv.amount : status === 'PARTIAL' ? Math.floor(inv.amount / 2) : 0;
  const numId = typeof inv.id === 'number' ? inv.id : parseInt(String(inv.id).replace(/\D/g, ''), 10) || 1;
  return {
    id: numId,
    invoiceNumber: inv.invoiceNumber,
    poNumber: inv.poNumber,
    vendorName: inv.vendorName,
    vendorInitials: initials,
    avatarMod: String((numId % 6) + 1),
    amount: inv.amount,
    paidAmount,
    dueDate: inv.dueDate,
    invoiceDate: inv.submittedAt,
    status,
    paymentTerms: inv.paymentTerms || 'Net 30',
    department: inv.department || 'Finance',
  };
}

import { approvalService } from '../../services/approvalService';
import { sseClient } from '../../services/sseClient';
import type { ApprovalTableRow } from '../../types/viewModels';
import { useAuth } from '../../context/AuthContext';

interface APInvoice {
  id: string;
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

const isRoleMatching = (requiredRole?: string, userRoles?: string[]): boolean => {
  if (!requiredRole || !userRoles || userRoles.length === 0) return false;
  const stripPrefix = (str: string) => str.replace(/^level\s*\d+(\s*of\s*\d+)?\s*:\s*/i, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
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

// ─── Component ──────────────────────────────────────────────

export default function AccountsPayablePage() {
  const navigate = useNavigate();
  const { roles: authRoles, hasPermission } = useAuth();
  const canApproveAP = hasPermission('Accounts Payable', 'canApprove') || hasPermission('Create Purchase Invoice', 'canApprove') || hasPermission('Invoices', 'canApprove') || hasPermission('Accounts Payable', 'canCreate');
  const [invoicesList, setInvoicesList] = useState<APInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedVoucherBanner, setGeneratedVoucherBanner] = useState<{
    voucherNumber: string;
    invoiceNumber: string;
    vendorName: string;
    amount: number;
  } | null>(null);

  const fetchInvoicesData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch real approval records for AccountsPayable (Purchase Invoice)
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

      // Process approvalRows first
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

        const amt = typeof app.amount === 'number' ? app.amount : parseFloat(String(app.amount).replace(/[^0-9.]/g, '')) || matchingRaw?.amount || 0;
        const reqRole = app.requiredRole || 'Purchase Manager';
        const effectiveCanAct = app.status === 'PENDING' && status === 'PENDING' && (app.canAct || isRoleMatching(reqRole, authRoles));

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

      // Add any standalone raw invoices not present in approvalRows
      rawInvoices.forEach((inv, idx) => {
        const alreadyIn = merged.some(
          (m) => m.id === inv.id || m.invoiceNumber === inv.invoiceNumber
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

    // SSE Realtime events for automatic page refresh
    const unsub1 = sseClient.on('approval_level_complete', fetchInvoicesData);
    const unsub2 = sseClient.on('approval_chain_complete', fetchInvoicesData);
    const unsub3 = sseClient.on('notification', fetchInvoicesData);

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [fetchInvoicesData]);

  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<string>('ALL');
  const [detailInvoice, setDetailInvoice] = useState<APInvoice | null>(null);
  const [printInvoice, setPrintInvoice]   = useState<APInvoice | null>(null);
  const [actionModal, setActionModal]     = useState<{ invoice: APInvoice; action: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionSaving, setActionSaving]   = useState(false);
  const [chainModal, setChainModal]       = useState<{ module: string; referenceId: string } | null>(null);
  useBodyScrollLock(!!(actionModal || detailInvoice || chainModal || printInvoice));
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  useEffect(() => { setDisplayCurrency(companyDefaultCurrency); }, [companyDefaultCurrency]);

  // ── Column state ──
  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const visibleColumns = useMemo(
    () => columnOrder
      .map((k) => ALL_COLUMNS.find((c) => c.key === k)!)
      .filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys],
  );

  const handleToggleColumn = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleResetColumns = () => {
    setColumnOrder(defaultOrder);
    setVisibleKeys(new Set(defaultVisible));
  };

  // ── KPIs (reactive) ──
  const summary = useMemo(() => ({
    totalPayable:  invoicesList.reduce((s, i) => s + (i.amount - i.paidAmount), 0),
    overdue:       invoicesList.filter(i => i.status === 'OVERDUE').length,
    dueThisMonth:  invoicesList.filter(i => i.status === 'PENDING').length,
    paidThisMonth: invoicesList.filter(i => i.status === 'PAID' || i.status === 'APPROVED').length,
  }), [invoicesList]);

  // Check if logged-in user is an Admin (Super Admin / Administrator)
  const isAdmin = useMemo(() => {
    if (!authRoles || authRoles.length === 0) return false;
    return authRoles.some((r) =>
      r === 'Super Admin' || r === 'Administrator' || r.toLowerCase().includes('admin')
    );
  }, [authRoles]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = invoicesList;
    // Sequential Queue Rule: Non-admin users MUST ONLY see pending invoices if they are the designated approver for the CURRENT pending level (canAct === true)!
    if (!isAdmin) {
      list = list.filter((i) => {
        if (i.status === 'PENDING' && !i.canAct) {
          return false;
        }
        return true;
      });
    }
    if (statusFilter !== 'ALL') {
      list = list.filter(i => i.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.vendorName.toLowerCase().includes(q) ||
        i.poNumber.toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoicesList, search, statusFilter, isAdmin]);

  // ── Action handler (connects to real backend workflow) ──
  const handleAction = useCallback(async () => {
    if (!actionModal || !actionModal.invoice.approvalId) return;
    setActionSaving(true);
    try {
      const approvalId = actionModal.invoice.approvalId;
      const comment = actionComment.trim() || undefined;
      const targetInvoice = actionModal.invoice;

      if (actionModal.action === 'approve') {
        const res = await approvalService.approve(approvalId, comment);
        // Check if final approval level reached
        const isFinal = res?.nextLevel === false || targetInvoice.currentLevel >= targetInvoice.totalLevels;

        if (isFinal) {
          const voucherNum = `VOU-2026-${Math.floor(1000 + Math.random() * 9000)}`;
          // 1. Auto-generate Payment Voucher locally
          const createdVoucher = localDataService.savePayment({
            paymentId: voucherNum,
            vendor: targetInvoice.vendorName,
            invoiceRef: `Invoice: ${targetInvoice.invoiceNumber} | PO: ${targetInvoice.poNumber}`,
            amount: targetInvoice.amount,
            method: 'NEFT',
            status: 'PENDING',
            remarks: `Auto-generated from approved Purchase Invoice ${targetInvoice.invoiceNumber}`,
          });

          // 2. Submit to backend API to trigger Payments Approval Chain
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
          } catch (_e) {
            // Local fallback handled above
          }

          setGeneratedVoucherBanner({
            voucherNumber: createdVoucher.paymentId || voucherNum,
            invoiceNumber: targetInvoice.invoiceNumber,
            vendorName: targetInvoice.vendorName,
            amount: targetInvoice.amount,
          });
        }
      } else if (actionModal.action === 'reject') {
        await approvalService.reject(approvalId, comment);
      } else {
        await approvalService.return(approvalId, comment, 'ORIGINATOR');
      }

      setActionModal(null);
      setActionComment('');
      await fetchInvoicesData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionSaving(false);
    }
  }, [actionModal, actionComment, fetchInvoicesData]);

  const openAction = useCallback((invoice: APInvoice, action: 'approve' | 'reject' | 'return') => {
    setActionModal({ invoice, action });
    setActionComment('');
  }, []);

  const fmt = (n: number) => formatAmount(n, displayCurrency);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const actionColor = actionModal?.action === 'approve' ? 'approve' : actionModal?.action === 'reject' ? 'reject' : 'return';
  const actionTitle = actionModal?.action === 'approve' ? 'Approve Purchase Invoice' : actionModal?.action === 'reject' ? 'Reject Purchase Invoice' : 'Return Purchase Invoice';

  return (
    <div className="fin-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}

      {/* ── Auto-generated Payment Voucher Banner ── */}
      {generatedVoucherBanner && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.25) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              background: '#10b981',
              color: '#ffffff',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', color: '#10b981', fontSize: '15px', fontWeight: 700 }}>
                Purchase Invoice {generatedVoucherBanner.invoiceNumber} Approved!
              </h4>
              <p style={{ margin: 0, color: 'var(--text-secondary, #94a3b8)', fontSize: '13px', lineHeight: 1.4 }}>
                Payment Voucher <strong>#{generatedVoucherBanner.voucherNumber}</strong> for <strong>{generatedVoucherBanner.vendorName}</strong> ({formatAmount(generatedVoucherBanner.amount, displayCurrency)}) has been auto-generated with Bank Details & submitted for <strong>Payments Approval Workflow</strong>.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => navigate('/payments')}
              style={{
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 18px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
              }}
            >
              <span>View Payment Voucher</span>
              <ArrowRight size={15} />
            </button>
            <button
              onClick={() => setGeneratedVoucherBanner(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #64748b)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
              title="Dismiss notification"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="fin-page__header">
        <div>
          <h1>Purchase Invoice Approval</h1>
          <p>Review, approve, or reject pending purchase invoices in sequential levels</p>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="fin-kpis">
        <div
          className={`fin-kpi${statusFilter === 'ALL' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter('ALL')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--primary"><Wallet size={20} /></div>
          <div><span className="fin-kpi__value">{formatAmount(summary.totalPayable, displayCurrency)}</span><span className="fin-kpi__label">Total Payable</span></div>
        </div>
        <div
          className={`fin-kpi${statusFilter === 'OVERDUE' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--danger"><AlertTriangle size={20} /></div>
          <div><span className="fin-kpi__value">{summary.overdue}</span><span className="fin-kpi__label">Overdue</span></div>
        </div>
        <div
          className={`fin-kpi${statusFilter === 'PENDING' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'PENDING' ? 'ALL' : 'PENDING')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--warning"><Clock size={20} /></div>
          <div><span className="fin-kpi__value">{summary.dueThisMonth}</span><span className="fin-kpi__label">Pending Approval</span></div>
        </div>
        <div
          className={`fin-kpi${statusFilter === 'APPROVED' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'APPROVED' ? 'ALL' : 'APPROVED')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--success"><CheckCircle2 size={20} /></div>
          <div><span className="fin-kpi__value">{summary.paidThisMonth}</span><span className="fin-kpi__label">Approved</span></div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="fin-toolbar">
        <div className="fin-toolbar__search">
          <Search size={16} className="fin-toolbar__search-icon" />
          <input placeholder="Search invoices by number, vendor, PO..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="fin-table-card">
        {loading ? (
          <TableSkeleton rows={4} columns={6} />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
          <table className="fin-table" style={{ tableLayout: 'fixed', minWidth: '700px' }}>
            <colgroup>
              {visibleColumns.map((col) => (
                <col key={col.key} style={{ width: col.width || 'auto' }} />
              ))}
              <col style={{ width: '160px' }} />
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col.key} style={{ textAlign: col.align || 'left' }}>
                    {col.label}
                  </th>
                ))}
                {/* Actions col + 3-dot button */}
                <th>
                  <div className="fin-table__actions-header">
                    <span>Actions</span>
                    <div className="col-btn-wrap">
                      <button
                        ref={colBtnRef}
                        className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`}
                        onClick={() => setShowColPanel((v) => !v)}
                        title="Customize columns"
                        aria-label="Customize columns"
                        aria-expanded={showColPanel}
                      >
                        <span /><span /><span />
                      </button>

                      {showColPanel && (
                        <ColumnCustomizer
                          columnOrder={columnOrder}
                          visibleKeys={visibleKeys}
                          allColumns={ALL_COLUMNS}
                          onToggle={handleToggleColumn}
                          onReorder={setColumnOrder}
                          onReset={handleResetColumns}
                          onClose={() => setShowColPanel(false)}
                          anchorRef={colBtnRef}
                        />
                      )}
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                return (
                  <tr key={inv.id} className={`fin-table__row fin-table__row--${inv.status.toLowerCase()}`}>
                    {visibleColumns.map((col) => (
                      <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                        {col.render(inv, fmt, fmtDate)}
                      </td>
                    ))}
                    <td>
                      <div className="approvals-table__actions">
                        {/* View Details */}
                        <button
                          className="approvals-table__action-btn"
                          title="View Details"
                          onClick={() => setDetailInvoice(inv)}
                        >
                          <Eye size={15} />
                        </button>
                        {/* Print Purchase Invoice */}
                        <button
                          className="approvals-table__action-btn"
                          title="Print Purchase Invoice"
                          onClick={() => setPrintInvoice(inv)}
                        >
                          <Printer size={15} />
                        </button>
                        {/* Approve / Reject / Return — ONLY if status is PENDING AND canAct is true */}
                        {inv.status === 'PENDING' && inv.canAct ? (
                          <>
                            <button
                              className="approvals-table__action-btn approvals-table__action-btn--approve"
                              title={!canApproveAP ? "Admin has not allowed this action. You do not have permission to approve accounts payable invoices." : "Approve"}
                              onClick={() => canApproveAP && openAction(inv, 'approve')}
                              disabled={!canApproveAP}
                              style={!canApproveAP ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                            >
                              <ThumbsUp size={15} />
                            </button>
                            <button
                              className="approvals-table__action-btn approvals-table__action-btn--reject"
                              title={!canApproveAP ? "Admin has not allowed this action. You do not have permission to reject accounts payable invoices." : "Reject"}
                              onClick={() => canApproveAP && openAction(inv, 'reject')}
                              disabled={!canApproveAP}
                              style={!canApproveAP ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                            >
                              <ThumbsDown size={15} />
                            </button>
                            <button
                              className="approvals-table__action-btn approvals-table__action-btn--return"
                              title={!canApproveAP ? "Admin has not allowed this action. You do not have permission to return accounts payable invoices." : "Return"}
                              onClick={() => canApproveAP && openAction(inv, 'return')}
                              disabled={!canApproveAP}
                              style={!canApproveAP ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                            >
                              <RotateCcw size={15} />
                            </button>
                          </>
                        ) : inv.status === 'PENDING' ? (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '2px 6px', background: 'var(--surface-elevated, #f0f2f5)', borderRadius: 4, border: '1px solid var(--border)' }} title={`Awaiting Level ${inv.currentLevel} approval by ${inv.requiredRole}`}>
                            L{inv.currentLevel} ({inv.requiredRole})
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="fin-empty"><span>💰</span><p>No purchase invoices found</p></div>
        )}
          </>
        )}
      </div>

      {/* ── Action Modal (Approve / Reject / Return) ── */}
      {actionModal && (
        <div className="approvals-modal-backdrop" onClick={() => setActionModal(null)}>
          <div className="approvals-modal" onClick={e => e.stopPropagation()}>
            <div className={`approvals-modal__header approvals-modal__header--${actionColor}`}>
              <div className="approvals-modal__title">
                {actionModal.action === 'approve' ? <ThumbsUp size={20} /> : actionModal.action === 'reject' ? <ThumbsDown size={20} /> : <RotateCcw size={20} />}
                <span>{actionTitle}</span>
              </div>
              <button className="approvals-modal__close" onClick={() => setActionModal(null)}><X size={18} /></button>
            </div>

            <div className="approvals-modal__body">
              <div className="approvals-modal__request-summary">
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Invoice No.</span>
                  <span className="approvals-modal__summary-value">{actionModal.invoice.invoiceNumber}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Vendor</span>
                  <span className="approvals-modal__summary-value">{actionModal.invoice.vendorName}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">PO Reference</span>
                  <span className="approvals-modal__summary-value">{actionModal.invoice.poNumber}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Amount</span>
                  <span className="approvals-modal__summary-value approvals-modal__summary-value--amount">{formatAmount(actionModal.invoice.amount, displayCurrency)}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Approval Level</span>
                  <span className="approvals-modal__summary-value">Level {actionModal.invoice.currentLevel} of {actionModal.invoice.totalLevels} ({actionModal.invoice.requiredRole})</span>
                </div>
              </div>

              <div className="approvals-modal__field">
                <label className="approvals-modal__label">
                  <MessageSquare size={13} style={{ marginRight: 4 }} />
                  Comments {actionModal.action !== 'approve' && <span>*</span>}
                </label>
                <textarea
                  className="approvals-modal__textarea"
                  rows={4}
                  placeholder={actionModal.action === 'approve' ? 'Optional approval comments...' : 'Provide reason...'}
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                />
              </div>
            </div>

            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setActionModal(null)} disabled={actionSaving}>Cancel</button>
              <button
                className={`approvals-modal__btn approvals-modal__btn--${actionColor}`}
                disabled={actionSaving || (actionModal.action !== 'approve' && !actionComment.trim())}
                onClick={handleAction}
              >
                {actionSaving ? (
                  <span>Processing…</span>
                ) : (
                  <>
                    {actionModal.action === 'approve' ? <ThumbsUp size={16} /> : actionModal.action === 'reject' ? <ThumbsDown size={16} /> : <RotateCcw size={16} />}
                    <span>{actionModal.action === 'approve' ? 'Approve' : actionModal.action === 'reject' ? 'Reject' : 'Return'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailInvoice && (
        <div className="approvals-modal-backdrop" onClick={() => setDetailInvoice(null)}>
          <div className="approvals-modal approvals-modal--detail" onClick={e => e.stopPropagation()}>
            <div className="approvals-modal__header">
              <div className="approvals-modal__title"><Eye size={20} /><span>Purchase Invoice Details</span></div>
              <button className="approvals-modal__close" onClick={() => setDetailInvoice(null)}><X size={18} /></button>
            </div>

            <div className="approvals-modal__body">
              <div className="approvals-detail-grid">
                {[
                  { label: 'Invoice No.',   value: detailInvoice.invoiceNumber },
                  { label: 'PO Reference',  value: detailInvoice.poNumber },
                  { label: 'Vendor',        value: detailInvoice.vendorName },
                  { label: 'Department',    value: detailInvoice.department },
                  { label: 'Amount',        value: formatAmount(detailInvoice.amount, displayCurrency) },
                  { label: 'Approval Level', value: `Level ${detailInvoice.currentLevel} of ${detailInvoice.totalLevels} (${detailInvoice.requiredRole})` },
                  { label: 'Payment Terms', value: detailInvoice.paymentTerms },
                  { label: 'Invoice Date',  value: fmtDate(detailInvoice.invoiceDate) },
                  { label: 'Due Date',      value: fmtDate(detailInvoice.dueDate) },
                  { label: 'Status',        value: STATUS_MAP[detailInvoice.status]?.label || detailInvoice.status },
                ].map(item => (
                  <div key={item.label} className="approvals-detail-grid__item">
                    <span className="approvals-detail-grid__label">{item.label}</span>
                    <span className="approvals-detail-grid__value">{item.value}</span>
                  </div>
                ))}
              </div>
              {detailInvoice.comments && (
                <div className="approvals-detail-comments">
                  <span className="approvals-detail-comments__label"><MessageSquare size={13} /> Comments</span>
                  <p className="approvals-detail-comments__text">{detailInvoice.comments}</p>
                </div>
              )}
              <button
                className="approvals-modal__btn approvals-modal__btn--view-contract"
                onClick={() => setChainModal({ module: 'AccountsPayable', referenceId: String(detailInvoice.id || detailInvoice.invoiceNumber) })}
                style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
              >
                <Clock size={16} /> View Approval Chain
              </button>
            </div>

            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setDetailInvoice(null)}>Close</button>
              <button
                className="approvals-modal__btn"
                style={{ background: '#10b981', color: '#ffffff', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setPrintInvoice(detailInvoice)}
              >
                <Printer size={16} /> Print Purchase Invoice
              </button>
              {detailInvoice.status === 'PENDING' && detailInvoice.canAct && (
                <>
                  <button
                    className="approvals-modal__btn approvals-modal__btn--approve"
                    onClick={() => { if (!canApproveAP) return; setDetailInvoice(null); openAction(detailInvoice, 'approve'); }}
                    disabled={!canApproveAP}
                    style={!canApproveAP ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                    title={!canApproveAP ? "Admin has not allowed this action. You do not have permission to approve accounts payable invoices." : undefined}
                  >
                    <ThumbsUp size={16} /> Approve
                  </button>
                  <button
                    className="approvals-modal__btn approvals-modal__btn--reject"
                    onClick={() => { if (!canApproveAP) return; setDetailInvoice(null); openAction(detailInvoice, 'reject'); }}
                    disabled={!canApproveAP}
                    style={!canApproveAP ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                    title={!canApproveAP ? "Admin has not allowed this action. You do not have permission to reject accounts payable invoices." : undefined}
                  >
                    <ThumbsDown size={16} /> Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approval Chain Modal */}
      {chainModal && (
        <ApprovalChainView
          module={chainModal.module}
          referenceId={chainModal.referenceId}
          onClose={() => setChainModal(null)}
        />
      )}

      {/* Print Purchase Invoice Modal */}
      {printInvoice && (
        <PrintPurchaseInvoiceModal
          data={printInvoice}
          onClose={() => setPrintInvoice(null)}
        />
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Approval Chain View — Shows approval timeline for AccountsPayable
// ═══════════════════════════════════════════════════════════════

type ChainEntry = {
  levelNumber: number;
  requiredRole: string;
  status: string;
  approverName: string | null;
  comments: string | null;
  actionAt: string | null;
  deadline: string | null;
  createdAt: string;
};

function ApprovalChainView({ module, referenceId, onClose }: { module: string; referenceId: string; onClose: () => void }) {
  const [chainData, setChainData] = useState<{
    levels: ChainEntry[];
    timeline: ChainEntry[];
    history?: ChainEntry[];
    currentLevel: number;
    totalLevels: number;
    isComplete: boolean;
    isRejected: boolean;
    isReturned?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchChain = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<typeof chainData>(`/approvals/${module}/${referenceId}/chain`);
        if (!cancelled) setChainData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load approval chain');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchChain();
    return () => { cancelled = true; };
  }, [module, referenceId]);

  const formatDt = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return '#107e3e';
      case 'REJECTED': return '#bb0000';
      case 'RETURNED': return '#e9730c';
      case 'PENDING': return '#e9730c';
      case 'AUTO_FORWARDED': return '#8b5cf6';
      default: return 'var(--text-secondary)';
    }
  };

  const itemsToDisplay = chainData?.history && chainData.history.length > 0
    ? chainData.history
    : (chainData?.timeline && chainData.timeline.length > 0 ? chainData.timeline : chainData?.levels || []);

  return (
    <div className="approvals-modal-backdrop" onClick={onClose}>
      <div className="approvals-modal approvals-modal--detail" onClick={e => e.stopPropagation()}>
        <div className="approvals-modal__header">
          <div className="approvals-modal__title"><Clock size={20} /><span>Approval History & Timeline — Purchase Invoice</span></div>
          <button className="approvals-modal__close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="approvals-modal__body">
          {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>Loading approval chain…</div>}
          {error && <div style={{ textAlign: 'center', padding: 32, color: '#bb0000' }}>{error}</div>}
          {!loading && !error && (!chainData || itemsToDisplay.length === 0) && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>No approval chain data available.</div>
          )}
          {chainData && itemsToDisplay.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {chainData.isComplete && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 12, background: 'rgba(16,126,62,0.1)', color: '#107e3e', fontSize: 11, fontWeight: 700 }}>
                    <CheckCircle2 size={12} /> Chain Complete
                  </span>
                )}
                {chainData.isRejected && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 12, background: 'rgba(187,0,0,0.08)', color: '#bb0000', fontSize: 11, fontWeight: 700 }}>
                    <XCircle size={12} /> Rejected
                  </span>
                )}
                {chainData.isReturned && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 12, background: 'rgba(233,115,12,0.1)', color: '#e9730c', fontSize: 11, fontWeight: 700 }}>
                    <RotateCcw size={12} /> Returned to Originator
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {itemsToDisplay.map((level, idx) => {
                  const isLast = idx === itemsToDisplay.length - 1;
                  const isActive = level.status === 'PENDING';
                  return (
                    <div key={idx} style={{ position: 'relative', paddingLeft: 32, paddingBottom: isLast ? 0 : 24 }}>
                      {!isLast && (
                        <div style={{
                          position: 'absolute', left: 11, top: 20, bottom: 0, width: 2,
                          background: level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                            ? '#107e3e' : level.status === 'REJECTED' ? '#bb0000' : level.status === 'RETURNED' ? '#e9730c' : 'var(--border)',
                        }} />
                      )}
                      <div style={{
                        position: 'absolute', left: 4, top: 4, width: 16, height: 16,
                        borderRadius: '50%',
                        background: isActive ? '#e9730c' : level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                          ? '#107e3e' : level.status === 'REJECTED' ? '#bb0000' : level.status === 'RETURNED' ? '#e9730c' : 'var(--surface-card)',
                        border: `2px solid ${
                          isActive ? '#e9730c' : level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                            ? '#107e3e' : level.status === 'REJECTED' ? '#bb0000' : level.status === 'RETURNED' ? '#e9730c' : 'var(--border)'
                        }`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED' ? (
                          <CheckCircle2 size={10} style={{ color: '#fff' }} />
                        ) : level.status === 'REJECTED' ? (
                          <XCircle size={10} style={{ color: '#fff' }} />
                        ) : level.status === 'RETURNED' ? (
                          <RotateCcw size={10} style={{ color: '#fff' }} />
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? '#fff' : 'var(--text-secondary)' }}>{level.levelNumber}</span>
                        )}
                      </div>
                      <div style={{
                        padding: '12px 14px',
                        background: isActive ? 'rgba(233,115,12,0.06)' : level.status === 'RETURNED' ? 'rgba(233,115,12,0.04)' : 'var(--surface-elevated)',
                        border: `1px solid ${
                          isActive ? 'rgba(233,115,12,0.2)' : level.status === 'APPROVED' ? 'rgba(16,126,62,0.15)' : level.status === 'REJECTED' ? 'rgba(187,0,0,0.15)' : level.status === 'RETURNED' ? 'rgba(233,115,12,0.2)' : 'var(--border)'
                        }`,
                        borderRadius: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                            Level {level.levelNumber} — {level.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: statusColor(level.status),
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            {level.status === 'APPROVED' ? 'Approved' : level.status === 'AUTO_FORWARDED' ? 'Auto-Forwarded' : level.status === 'REJECTED' ? 'Rejected' : level.status === 'RETURNED' ? 'Returned' : 'Pending'}
                          </span>
                        </div>
                        {level.approverName && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            By: <strong>{level.approverName}</strong>
                          </div>
                        )}
                        {level.comments && (
                          <div style={{ fontSize: 12, color: 'var(--text-primary)', padding: '6px 10px', marginTop: 4, background: 'var(--surface-card)', borderRadius: 4, border: '1px solid var(--border)' }}>
                            "{level.comments}"
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                          {level.actionAt ? `Acted: ${formatDt(level.actionAt)}` : level.createdAt ? `Date: ${formatDt(level.createdAt)}` : `Deadline: ${formatDt(level.deadline)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="approvals-modal__footer">
          <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
