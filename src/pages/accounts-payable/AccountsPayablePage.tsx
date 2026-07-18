import React from "react";
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { invoiceService, type APInvoice as ServiceAPInvoice } from '../../services/invoiceService';
import {
  Wallet, Search, Clock, CheckCircle2, AlertTriangle,
  IndianRupee, Eye, ThumbsUp, ThumbsDown, RotateCcw,
  X, MessageSquare,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
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
  PENDING:  { label: 'Pending',  cls: 'pending',  icon: <Clock size={13} /> },
  OVERDUE:  { label: 'Overdue',  cls: 'overdue',  icon: <AlertTriangle size={13} /> },
  PAID:     { label: 'Paid',     cls: 'paid',     icon: <CheckCircle2 size={13} /> },
  PARTIAL:  { label: 'Partial',  cls: 'partial',  icon: <IndianRupee size={13} /> },
  APPROVED: { label: 'Approved', cls: 'approved', icon: <CheckCircle2 size={13} /> },
  REJECTED: { label: 'Rejected', cls: 'rejected', icon: <X size={13} /> },
  RETURNED: { label: 'Returned', cls: 'returned', icon: <RotateCcw size={13} /> },
};

const ALL_COLUMNS: APColumnDef[] = [
  {
    key: 'invoiceNumber',
    label: 'Invoice',
    defaultVisible: true,
    required: true,
    width: '140px',
    render: (inv) => <span className="fin-table__ref">{inv.invoiceNumber}</span>,
  },
  {
    key: 'vendor',
    label: 'Vendor',
    defaultVisible: true,
    required: true,
    width: '200px',
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
    width: '130px',
    render: (inv) => <span className="fin-table__secondary">{inv.poNumber}</span>,
  },
  {
    key: 'amount',
    label: 'Amount',
    defaultVisible: true,
    width: '120px',
    align: 'right',
    render: (inv, fmt) => <span className="fin-table__amount">{fmt(inv.amount)}</span>,
  },
  {
    key: 'paid',
    label: 'Paid',
    defaultVisible: true,
    width: '110px',
    align: 'right',
    render: (inv, fmt) => <span className="fin-table__amount fin-table__amount--success">{fmt(inv.paidAmount)}</span>,
  },
  {
    key: 'balance',
    label: 'Balance',
    defaultVisible: true,
    width: '110px',
    align: 'right',
    render: (inv, fmt) => <span className="fin-table__amount fin-table__amount--bold">{fmt(inv.amount - inv.paidAmount)}</span>,
  },
  {
    key: 'dueDate',
    label: 'Due Date',
    defaultVisible: true,
    width: '110px',
    render: (inv, _fmt, fmtDate) => <span className="fin-table__date">{fmtDate(inv.dueDate)}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    defaultVisible: true,
    width: '110px',
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
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    poNumber: inv.poNumber,
    vendorName: inv.vendorName,
    vendorInitials: initials,
    avatarMod: String((inv.id % 6) + 1),
    amount: inv.amount,
    paidAmount,
    dueDate: inv.dueDate,
    invoiceDate: inv.submittedAt,
    status,
    paymentTerms: 'Net 30',
    department: '—',
  };
}

const ACTIONABLE: APStatus[] = ['PENDING', 'OVERDUE'];

// ─── Component ──────────────────────────────────────────────

export default function AccountsPayablePage() {
  const { data: serverInvoices, loading, error } = useServiceData(
    () => invoiceService.list().then((list) => list.map(mapServiceInvoice)),
    [] as APInvoice[]
  );
  // Optimistic overlay for local actions (no API persistence)
  const [pendingActions, setPendingActions] = useState<Record<number, APInvoice>>({});
  const invoices = useMemo(() => {
    if (Object.keys(pendingActions).length === 0) return serverInvoices;
    return serverInvoices.map(inv => pendingActions[inv.id] ?? inv);
  }, [serverInvoices, pendingActions]);
  const [search, setSearch]               = useState('');
  const [detailInvoice, setDetailInvoice] = useState<APInvoice | null>(null);
  const [actionModal, setActionModal]     = useState<{ invoice: APInvoice; action: 'approve' | 'reject' | 'return' } | null>(null);
  const [actionComment, setActionComment] = useState('');
  useBodyScrollLock(!!(actionModal || detailInvoice));
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
    totalPayable:  invoices.reduce((s, i) => s + (i.amount - i.paidAmount), 0),
    overdue:       invoices.filter(i => i.status === 'OVERDUE').length,
    dueThisMonth:  invoices.filter(i => i.status === 'PENDING').length,
    paidThisMonth: invoices.filter(i => i.status === 'PAID' || i.status === 'APPROVED').length,
  }), [invoices]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = invoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.vendorName.toLowerCase().includes(q) ||
        i.poNumber.toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, search]);

  // ── Action handler ──
  const handleAction = useCallback(() => {
    if (!actionModal) return;
    const newStatus: APStatus =
      actionModal.action === 'approve' ? 'APPROVED' :
      actionModal.action === 'reject'  ? 'REJECTED' : 'RETURNED';
    setPendingActions(prev => ({
      ...prev,
      [actionModal.invoice.id]: {
        ...actionModal.invoice,
        status: newStatus,
        comments: actionComment.trim() || undefined,
      },
    }));
    setActionModal(null);
    setActionComment('');
  }, [actionModal, actionComment]);

  const openAction = useCallback((invoice: APInvoice, action: 'approve' | 'reject' | 'return') => {
    setActionModal({ invoice, action });
    setActionComment('');
  }, []);

  const fmt = (n: number) => formatAmount(n, displayCurrency);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const actionColor = actionModal?.action === 'approve' ? 'approve' : actionModal?.action === 'reject' ? 'reject' : 'return';
  const actionTitle = actionModal?.action === 'approve' ? 'Approve Invoice' : actionModal?.action === 'reject' ? 'Reject Invoice' : 'Return Invoice';

  return (
    <div className="fin-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {loading && <div className="fin-page__loading">Loading invoices…</div>}

      {/* ── Header ── */}
      <div className="fin-page__header">
        <div>
          <h1>Accounts Payable</h1>
          <p>Track outstanding invoices and manage vendor payments</p>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="fin-kpis">
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--primary"><Wallet size={20} /></div><div>                  <span className="fin-kpi__value">{formatAmount(summary.totalPayable, displayCurrency)}</span><span className="fin-kpi__label">Total Payable</span></div></div>
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--danger"><AlertTriangle size={20} /></div><div><span className="fin-kpi__value">{summary.overdue}</span><span className="fin-kpi__label">Overdue</span></div></div>
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--warning"><Clock size={20} /></div><div><span className="fin-kpi__value">{summary.dueThisMonth}</span><span className="fin-kpi__label">Due This Month</span></div></div>
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--success"><CheckCircle2 size={20} /></div><div><span className="fin-kpi__value">{summary.paidThisMonth}</span><span className="fin-kpi__label">Paid / Approved</span></div></div>
      </div>

      {/* ── Toolbar ── */}
      <div className="fin-toolbar">
        <div className="fin-toolbar__search">
          <Search size={16} className="fin-toolbar__search-icon" />
          <input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
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
              <col style={{ width: '120px' }} />
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
                const actionable = ACTIONABLE.includes(inv.status);
                return (
                  <tr key={inv.id}>
                    {visibleColumns.map((col) => (
                      <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                        {col.render(inv, fmt, fmtDate)}
                      </td>
                    ))}
                    <td>
                      <div className="approvals-table__actions">
                        {/* View */}
                        <button
                          className="approvals-table__action-btn"
                          title="View Details"
                          onClick={() => setDetailInvoice(inv)}
                        >
                          <Eye size={15} />
                        </button>
                        {/* Approve / Reject / Return — only for actionable statuses */}
                        {actionable && (
                          <>
                            <button
                              className="approvals-table__action-btn approvals-table__action-btn--approve"
                              title="Approve"
                              onClick={() => openAction(inv, 'approve')}
                            >
                              <ThumbsUp size={15} />
                            </button>
                            <button
                              className="approvals-table__action-btn approvals-table__action-btn--reject"
                              title="Reject"
                              onClick={() => openAction(inv, 'reject')}
                            >
                              <ThumbsDown size={15} />
                            </button>
                            <button
                              className="approvals-table__action-btn approvals-table__action-btn--return"
                              title="Return"
                              onClick={() => openAction(inv, 'return')}
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
          <div className="fin-empty"><span>💰</span><p>No invoices found</p></div>
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
                  <span className="approvals-modal__summary-label">Invoice</span>
                  <span className="approvals-modal__summary-value">{actionModal.invoice.invoiceNumber}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Vendor</span>
                  <span className="approvals-modal__summary-value">{actionModal.invoice.vendorName}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Amount</span>
                  <span className="approvals-modal__summary-value approvals-modal__summary-value--amount">{formatAmount(actionModal.invoice.amount, displayCurrency)}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Balance Due</span>
                  <span className="approvals-modal__summary-value approvals-modal__summary-value--amount">
                    {formatAmount(actionModal.invoice.amount - actionModal.invoice.paidAmount, displayCurrency)}
                  </span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Due Date</span>
                  <span className="approvals-modal__summary-value">{fmtDate(actionModal.invoice.dueDate)}</span>
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
                  placeholder={actionModal.action === 'approve' ? 'Optional comments...' : 'Provide a reason...'}
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                />
              </div>
            </div>

            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setActionModal(null)}>Cancel</button>
              <button
                className={`approvals-modal__btn approvals-modal__btn--${actionColor}`}
                disabled={actionModal.action !== 'approve' && !actionComment.trim()}
                onClick={handleAction}
              >
                {actionModal.action === 'approve' ? <ThumbsUp size={16} /> : actionModal.action === 'reject' ? <ThumbsDown size={16} /> : <RotateCcw size={16} />}
                {actionModal.action === 'approve' ? 'Approve' : actionModal.action === 'reject' ? 'Reject' : 'Return'}
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
              <div className="approvals-modal__title"><Eye size={20} /><span>Invoice Details</span></div>
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
                  { label: 'Paid',          value: formatAmount(detailInvoice.paidAmount, displayCurrency) },
                  { label: 'Balance',       value: formatAmount(detailInvoice.amount - detailInvoice.paidAmount, displayCurrency) },
                  { label: 'Payment Terms', value: detailInvoice.paymentTerms },
                  { label: 'Invoice Date',  value: fmtDate(detailInvoice.invoiceDate) },
                  { label: 'Due Date',      value: fmtDate(detailInvoice.dueDate) },
                  { label: 'Status',        value: STATUS_MAP[detailInvoice.status].label },
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
            </div>

            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setDetailInvoice(null)}>Close</button>
              {ACTIONABLE.includes(detailInvoice.status) && (
                <>
                  <button
                    className="approvals-modal__btn approvals-modal__btn--approve"
                    onClick={() => { setDetailInvoice(null); openAction(detailInvoice, 'approve'); }}
                  >
                    <ThumbsUp size={16} /> Approve
                  </button>
                  <button
                    className="approvals-modal__btn approvals-modal__btn--reject"
                    onClick={() => { setDetailInvoice(null); openAction(detailInvoice, 'reject'); }}
                  >
                    <ThumbsDown size={16} /> Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
