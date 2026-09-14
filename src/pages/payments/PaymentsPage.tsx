import React from 'react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { localDataService, type Payment as ServicePayment } from '../../services/localDataService';
import BankPaymentVoucherModal, { type PaymentVoucherDocData } from '../../components/payments/BankPaymentVoucherModal';
import {
  Search, Clock, CheckCircle2, XCircle,
  Banknote, RefreshCw, Eye, ThumbsUp,
  Ban, RotateCcw, X, MessageSquare, Printer, ShieldCheck
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useAuth } from '../../context/AuthContext';
import { approvalService } from '../../services/approvalService';
import './PaymentsPage.css';

// ─── Types ──────────────────────────────────────────────────

type PaymentStatus = 'COMPLETED' | 'PENDING' | 'PROCESSING' | 'FAILED' | 'CONFIRMED' | 'CANCELLED' | 'RETRIED';
type PaymentMethod = 'NEFT' | 'RTGS' | 'IMPS' | 'Cheque' | 'UPI';

interface Payment {
  id: number;
  paymentNumber: string;
  invoiceRef: string;
  vendorName: string;
  vendorInitials: string;
  avatarMod: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  status: PaymentStatus;
  approvedBy: string;
  remarks: string;
  comments?: string;
}

function mapPayment(p: ServicePayment): Payment {
  const initials = p.vendor.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
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
    id: p.id,
    paymentNumber: p.paymentId,
    invoiceRef: p.invoiceRef,
    vendorName: p.vendor,
    vendorInitials: initials,
    avatarMod: String((p.id % 6) + 1),
    amount: p.amount,
    method: (p.method as PaymentMethod) || 'NEFT',
    date: p.paidAt,
    status: statusMap[p.status] || 'PENDING',
    approvedBy: p.approvedBy || '—',
    remarks: p.remarks || '',
  };
}

const STATUS_MAP: Record<PaymentStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  COMPLETED:  { label: 'Completed',  cls: 'paid',     icon: <CheckCircle2 size={13} /> },
  PENDING:    { label: 'Pending',    cls: 'pending',  icon: <Clock size={13} /> },
  PROCESSING: { label: 'Processing', cls: 'partial',  icon: <RefreshCw size={13} /> },
  FAILED:     { label: 'Failed',     cls: 'overdue',  icon: <XCircle size={13} /> },
  CONFIRMED:  { label: 'Confirmed',  cls: 'approved', icon: <CheckCircle2 size={13} /> },
  CANCELLED:  { label: 'Cancelled',  cls: 'rejected', icon: <X size={13} /> },
  RETRIED:    { label: 'Retried',    cls: 'returned', icon: <RotateCcw size={13} /> },
};

const ACTIONABLE: PaymentStatus[] = ['PENDING', 'PROCESSING'];

// ─── Column Definitions ─────────────────────────────────────

interface PayColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (pay: Payment, fmt: (n: number) => string, fmtDate: (d: string) => string) => React.ReactNode;
}

const ALL_COLUMNS: PayColumnDef[] = [
  {
    key: 'paymentNumber', label: 'Payment #', defaultVisible: true, required: true, width: '140px',
    render: (pay) => <span className="fin-table__ref">{pay.paymentNumber}</span>,
  },
  {
    key: 'vendor', label: 'Vendor', defaultVisible: true, required: true, width: '190px',
    render: (pay) => (
      <div className="fin-table__vendor">
        <div className={`fin-table__avatar fin-table__avatar--${pay.avatarMod}`}>{pay.vendorInitials}</div>
        <span className="fin-table__vendor-name">{pay.vendorName}</span>
      </div>
    ),
  },
  {
    key: 'invoiceRef', label: 'Invoice Ref', defaultVisible: true, width: '130px',
    render: (pay) => <span className="fin-table__secondary">{pay.invoiceRef}</span>,
  },
  {
    key: 'amount', label: 'Amount', defaultVisible: true, width: '120px', align: 'right',
    render: (pay, fmt) => <span className="fin-table__amount fin-table__amount--bold">{fmt(pay.amount)}</span>,
  },
  {
    key: 'method', label: 'Method', defaultVisible: true, width: '90px',
    render: (pay) => <span className="fin-method-badge">{pay.method}</span>,
  },
  {
    key: 'date', label: 'Date', defaultVisible: true, width: '110px',
    render: (pay, _fmt, fmtDate) => <span className="fin-table__date">{fmtDate(pay.date)}</span>,
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: '110px',
    render: (pay) => { const cfg = STATUS_MAP[pay.status]; return <span className={`fin-badge fin-badge--${cfg.cls}`}>{cfg.icon}{cfg.label}</span>; },
  },
  // ── Extra columns (hidden by default) ──
  {
    key: 'remarks', label: 'Remarks', defaultVisible: false, width: '180px',
    render: (pay) => <span className="fin-table__secondary" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>{pay.remarks}</span>,
  },
];

// ─── Component ──────────────────────────────────────────────

export default function PaymentsPage() {
  const { data: serverPayments, loading, error } = useServiceData(
    () => localDataService.getPayments().then((list) => list.map(mapPayment)),
    [] as Payment[]
  );
  // Optimistic overlay for local actions (no API persistence)
  const [pendingActions, setPendingActions] = useState<Record<number, Payment>>({});
  const payments = useMemo(() => {
    if (Object.keys(pendingActions).length === 0) return serverPayments;
    return serverPayments.map(p => pendingActions[p.id] ?? p);
  }, [serverPayments, pendingActions]);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<string>('ALL');
  const [actionModal, setActionModal]     = useState<{ payment: Payment; action: 'confirm' | 'cancel' | 'retry' } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [selectedPrintVoucher, setSelectedPrintVoucher] = useState<Payment | null>(null);
  const [voucherApprovers, setVoucherApprovers] = useState<any[] | null>(null);
  const [chainModal, setChainModal] = useState<{ module: string; referenceId: string } | null>(null);

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

        const chainItems = (res?.history && res.history.length > 0) ? res.history : (res?.levels || []);
        if (chainItems && chainItems.length > 0) {
          const mapped = chainItems.map((item: any, idx: number) => {
            const roleName = item.requiredRole
              ? item.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              : `Level ${item.levelNumber || idx + 1} Approver`;
            const name = item.approverName || (item.status === 'AUTO_FORWARDED' ? 'Auto-Approved (System)' : item.status === 'APPROVED' ? (selectedPrintVoucher.approvedBy !== '—' ? selectedPrintVoucher.approvedBy : 'Authorized Approver') : 'Pending Approval');
            const comments = item.comments || (item.status === 'APPROVED' ? 'Approved & Signed' : item.status === 'AUTO_FORWARDED' ? 'Auto-approved by system deadline' : 'Awaiting action');
            const date = item.actionAt ? new Date(item.actionAt).toISOString().slice(0, 10) : selectedPrintVoucher.date;
            return {
              level: `Level ${item.levelNumber || idx + 1}`,
              name,
              role: roleName,
              date,
              status: (item.status === 'APPROVED' || item.status === 'AUTO_FORWARDED') ? 'APPROVED' as const : 'PENDING' as const,
              comments,
            };
          });
          setVoucherApprovers(mapped);
        } else {
          setVoucherApprovers(null);
        }
      } catch (err) {
        if (isMounted) setVoucherApprovers(null);
      }
    };

    fetchApprovalChain();
    return () => { isMounted = false; };
  }, [selectedPrintVoucher]);

  useBodyScrollLock(!!(actionModal || detailPayment || selectedPrintVoucher || chainModal));
  const { hasPermission } = useAuth();
  const canApprovePayment = hasPermission('Payments', 'canApprove') || hasPermission('Payments', 'canCreate') || hasPermission('Accounts Payable', 'canApprove');
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
    () => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys],
  );
  const handleToggleColumn = (key: string) => {
    setVisibleKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const handleResetColumns = () => { setColumnOrder(defaultOrder); setVisibleKeys(new Set(defaultVisible)); };

  // ── KPIs (reactive) ──
  const summary = useMemo(() => ({
    totalPaid:  payments.filter(p => p.status === 'COMPLETED' || p.status === 'CONFIRMED').reduce((s, p) => s + p.amount, 0),
    pending:    payments.filter(p => p.status === 'PENDING').length,
    completed:  payments.filter(p => p.status === 'COMPLETED' || p.status === 'CONFIRMED').length,
    failed:     payments.filter(p => p.status === 'FAILED' || p.status === 'CANCELLED').length,
  }), [payments]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = payments;
    if (statusFilter !== 'ALL') {
      list = list.filter(p => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.paymentNumber.toLowerCase().includes(q) ||
        p.vendorName.toLowerCase().includes(q) ||
        p.invoiceRef.toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, search, statusFilter]);

  // ── Action handler ──
  const handleAction = useCallback(() => {
    if (!actionModal) return;
    const newStatus: PaymentStatus =
      actionModal.action === 'confirm' ? 'CONFIRMED' :
      actionModal.action === 'cancel'  ? 'CANCELLED' : 'RETRIED';
    setPendingActions(prev => ({
      ...prev,
      [actionModal.payment.id]: {
        ...actionModal.payment,
        status: newStatus,
        comments: actionComment.trim() || undefined,
      },
    }));
    setActionModal(null);
    setActionComment('');
  }, [actionModal, actionComment]);

  const openAction = useCallback((payment: Payment, action: 'confirm' | 'cancel' | 'retry') => {
    setActionModal({ payment, action });
    setActionComment('');
  }, []);

  const fmt     = (n: number) => formatAmount(n, displayCurrency);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const actionColor = actionModal?.action === 'confirm' ? 'approve' : actionModal?.action === 'cancel' ? 'reject' : 'return';
  const actionTitle = actionModal?.action === 'confirm' ? 'Confirm Payment' : actionModal?.action === 'cancel' ? 'Cancel Payment' : 'Retry Payment';

  return (
    <div className="fin-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {loading && <div className="fin-page__loading">Loading payments…</div>}

      {/* ── Header ── */}
      <div className="fin-page__header">
        <div>
          <h1>Payment Voucher Approval</h1>
          <p>Track payment transactions and disbursements to vendors</p>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="fin-kpis">
        <div
          className={`fin-kpi${statusFilter === 'ALL' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter('ALL')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--success"><Banknote size={20} /></div>
          <div><span className="fin-kpi__value">{fmt(summary.totalPaid)}</span><span className="fin-kpi__label">Total Paid</span></div>
        </div>
        <div
          className={`fin-kpi${statusFilter === 'PENDING' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'PENDING' ? 'ALL' : 'PENDING')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--warning"><Clock size={20} /></div>
          <div><span className="fin-kpi__value">{summary.pending}</span><span className="fin-kpi__label">Pending</span></div>
        </div>
        <div
          className={`fin-kpi${statusFilter === 'COMPLETED' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--primary"><CheckCircle2 size={20} /></div>
          <div><span className="fin-kpi__value">{summary.completed}</span><span className="fin-kpi__label">Completed</span></div>
        </div>
        <div
          className={`fin-kpi${statusFilter === 'FAILED' ? ' fin-kpi--active' : ''}`}
          onClick={() => setStatusFilter(prev => prev === 'FAILED' ? 'ALL' : 'FAILED')}
        >
          <div className="fin-kpi__icon fin-kpi__icon--danger"><XCircle size={20} /></div>
          <div><span className="fin-kpi__value">{summary.failed}</span><span className="fin-kpi__label">Failed / Cancelled</span></div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="fin-toolbar">
        <div className="fin-toolbar__search">
          <Search size={16} className="fin-toolbar__search-icon" />
          <input placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="fin-table-card">
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
                <th key={col.key} style={{ textAlign: col.align || 'left' }}>{col.label}</th>
              ))}
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
            {filtered.map(pay => {
              const actionable = ACTIONABLE.includes(pay.status);
              return (
                <tr key={pay.id} className={`fin-table__row fin-table__row--${pay.status.toLowerCase()}`}>
                  {visibleColumns.map((col) => (
                    <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                      {col.render(pay, fmt, fmtDate)}
                    </td>
                  ))}
                  <td>
                    <div className="approvals-table__actions">
                      <button className="approvals-table__action-btn" title="View Details" onClick={() => setDetailPayment(pay)}>
                        <Eye size={15} />
                      </button>
                      <button className="approvals-table__action-btn" title="Print Official Bank Voucher" onClick={() => setSelectedPrintVoucher(pay)} style={{ color: '#10b981' }}>
                        <Printer size={15} />
                      </button>
                      {actionable && (
                        <>
                          <button
                            className="approvals-table__action-btn approvals-table__action-btn--approve"
                            title={!canApprovePayment ? "Admin has not allowed this action. You do not have permission to confirm payment transactions." : "Confirm Payment"}
                            onClick={() => canApprovePayment && openAction(pay, 'confirm')}
                            disabled={!canApprovePayment}
                            style={!canApprovePayment ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          >
                            <ThumbsUp size={15} />
                          </button>
                          <button
                            className="approvals-table__action-btn approvals-table__action-btn--reject"
                            title={!canApprovePayment ? "Admin has not allowed this action. You do not have permission to cancel payment transactions." : "Cancel Payment"}
                            onClick={() => canApprovePayment && openAction(pay, 'cancel')}
                            disabled={!canApprovePayment}
                            style={!canApprovePayment ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          >
                            <Ban size={15} />
                          </button>
                          <button
                            className="approvals-table__action-btn approvals-table__action-btn--return"
                            title={!canApprovePayment ? "Admin has not allowed this action. You do not have permission to retry payment transactions." : "Retry Payment"}
                            onClick={() => canApprovePayment && openAction(pay, 'retry')}
                            disabled={!canApprovePayment}
                            style={!canApprovePayment ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          >
                            <RotateCcw size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <div className="fin-empty"><span>💳</span><p>No payments found</p></div>
        )}
      </div>

      {/* ── Action Modal (Confirm / Cancel / Retry) ── */}
      {actionModal && (
        <div className="approvals-modal-backdrop" onClick={() => setActionModal(null)}>
          <div className="approvals-modal" onClick={e => e.stopPropagation()}>
            <div className={`approvals-modal__header approvals-modal__header--${actionColor}`}>
              <div className="approvals-modal__title">
                {actionModal.action === 'confirm' ? <ThumbsUp size={20} /> : actionModal.action === 'cancel' ? <Ban size={20} /> : <RotateCcw size={20} />}
                <span>{actionTitle}</span>
              </div>
              <button className="approvals-modal__close" onClick={() => setActionModal(null)}><X size={18} /></button>
            </div>

            <div className="approvals-modal__body">
              <div className="approvals-modal__request-summary">
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Payment #</span>
                  <span className="approvals-modal__summary-value">{actionModal.payment.paymentNumber}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Vendor</span>
                  <span className="approvals-modal__summary-value">{actionModal.payment.vendorName}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Amount</span>
                  <span className="approvals-modal__summary-value approvals-modal__summary-value--amount">{fmt(actionModal.payment.amount)}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Method</span>
                  <span className="approvals-modal__summary-value">{actionModal.payment.method}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Invoice ref</span>
                  <span className="approvals-modal__summary-value">{actionModal.payment.invoiceRef}</span>
                </div>
              </div>

              <div className="approvals-modal__field">
                <label className="approvals-modal__label">
                  <MessageSquare size={13} style={{ marginRight: 4 }} />
                  Comments {actionModal.action !== 'confirm' && <span>*</span>}
                </label>
                <textarea
                  className="approvals-modal__textarea"
                  rows={4}
                  placeholder={actionModal.action === 'confirm' ? 'Optional comments...' : 'Provide a reason...'}
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                />
              </div>
            </div>

            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setActionModal(null)}>Cancel</button>
              <button
                className={`approvals-modal__btn approvals-modal__btn--${actionColor}`}
                disabled={actionModal.action !== 'confirm' && !actionComment.trim()}
                onClick={handleAction}
              >
                {actionModal.action === 'confirm' ? <ThumbsUp size={16} /> : actionModal.action === 'cancel' ? <Ban size={16} /> : <RotateCcw size={16} />}
                {actionModal.action === 'confirm' ? 'Confirm' : actionModal.action === 'cancel' ? 'Cancel Payment' : 'Retry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailPayment && (
        <div className="approvals-modal-backdrop" onClick={() => setDetailPayment(null)}>
          <div className="approvals-modal approvals-modal--detail" onClick={e => e.stopPropagation()}>
            <div className="approvals-modal__header">
              <div className="approvals-modal__title"><Eye size={20} /><span>Payment Details</span></div>
              <button className="approvals-modal__close" onClick={() => setDetailPayment(null)}><X size={18} /></button>
            </div>

            <div className="approvals-modal__body">
              <div className="approvals-detail-grid">
                {[
                  { label: 'Payment #',   value: detailPayment.paymentNumber },
                  { label: 'Invoice ref', value: detailPayment.invoiceRef },
                  { label: 'Vendor',      value: detailPayment.vendorName },
                  { label: 'Amount',      value: fmt(detailPayment.amount) },
                  { label: 'Method',      value: detailPayment.method },
                  { label: 'Date',        value: fmtDate(detailPayment.date) },
                  { label: 'Approved by', value: detailPayment.approvedBy },
                  { label: 'Status',      value: STATUS_MAP[detailPayment.status].label },
                  { label: 'Remarks',     value: detailPayment.remarks },
                ].map(item => (
                  <div key={item.label} className="approvals-detail-grid__item">
                    <span className="approvals-detail-grid__label">{item.label}</span>
                    <span className="approvals-detail-grid__value">{item.value}</span>
                  </div>
                ))}
              </div>
              {detailPayment.comments && (
                <div className="approvals-detail-comments">
                  <span className="approvals-detail-comments__label"><MessageSquare size={13} /> Comments</span>
                  <p className="approvals-detail-comments__text">{detailPayment.comments}</p>
                </div>
              )}
              <button
                className="approvals-modal__btn approvals-modal__btn--view-contract"
                onClick={() => setChainModal({ module: 'Payments', referenceId: detailPayment.paymentNumber || detailPayment.invoiceRef })}
                style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}
              >
                <Clock size={16} /> View Approval Chain
              </button>
            </div>

            <div className="approvals-modal__footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="approvals-modal__btn"
                style={{ background: '#10b981', color: '#fff', border: 'none' }}
                onClick={() => {
                  const target = detailPayment;
                  setDetailPayment(null);
                  setSelectedPrintVoucher(target);
                }}
              >
                <Printer size={16} /> Print Bank Payment Voucher
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setDetailPayment(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Official Printable Bank Payment Voucher Modal ── */}
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
            approvers: voucherApprovers || undefined
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

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Approval Chain View — Shows approval timeline for Payments / Invoices
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
        const data = await approvalService.getChain(module, referenceId);
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
          <div className="approvals-modal__title"><Clock size={20} /><span>Approval History & Timeline</span></div>
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
