import React from 'react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { downloadPurchaseOrderAsPdf } from '../../utils/pdfDownload';
import { toNumber } from '../../api/normalize';
import type { PurchaseOrder } from '../../types';
import {
  ShoppingCart, Search, Plus, Eye, Filter, Clock, CheckCircle2, XCircle,
  Truck, Package, FileText, X, ChevronLeft, ChevronRight, Download,
  LayoutList, LayoutGrid, Calendar, IndianRupee, AlertTriangle,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import './PurchaseOrdersPage.css';

// ─── Types ──────────────────────────────────────────────────

type POStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

interface MockPO {
  id: number;
  poNumber: string;
  rfqNumber: string;
  vendorName: string;
  vendorInitials: string;
  avatarMod: string;
  totalAmount: string;
  totalAmountNum: number;
  itemCount: number;
  status: POStatus;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
  expectedDelivery: string;
  department: string;
  createdBy: string;
}

function mapPO(po: PurchaseOrder): MockPO {
  const vendor = po.vendor;
  const name = vendor?.name || 'Unknown';
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const amount = toNumber(po.totalAmount);
  const created = String(po.createdAt).slice(0, 10);
  return {
    id: po.id,
    poNumber: po.poNumber,
    rfqNumber: po.rfq?.rfqNumber || `RFQ-${po.rfqId}`,
    vendorName: name,
    vendorInitials: initials,
    avatarMod: String((po.vendorId % 6) + 1),
    totalAmount: amount.toLocaleString('en-IN'),
    totalAmountNum: amount,
    itemCount: po.items?.length ?? 0,
    status: (po.status as POStatus) || 'DRAFT',
    priority: 'MEDIUM',
    createdAt: created,
    expectedDelivery: created,
    department: '—',
    createdBy: '—',
  };
}

const STATUS_LABELS: Record<POStatus, string> = {
  DRAFT: 'Draft', PENDING_APPROVAL: 'Pending Approval', APPROVED: 'Completed',
  DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

const STATUS_ICONS: Record<POStatus, React.ReactNode> = {
  DRAFT: <FileText size={12} />, PENDING_APPROVAL: <Clock size={12} />, APPROVED: <CheckCircle2 size={12} />,
  DISPATCHED: <Truck size={12} />, DELIVERED: <Package size={12} />, CANCELLED: <XCircle size={12} />,
};

// ─── Column Definitions ─────────────────────────────────────
interface POColumnDef {
  key: string; label: string; defaultVisible: boolean; required?: boolean;
  width?: string; render: (po: MockPO, fmtDate: (d: string) => string, fmtAmt?: (amt: number, c?: string) => string, curr?: string) => React.ReactNode;
}

const ALL_COLUMNS: POColumnDef[] = [
  {
    key: 'po', label: 'Purchase Order', defaultVisible: true, required: true, width: '200px',
    render: (po) => (
      <div className="po-table__po-info">
        <span className="po-table__po-number">{po.poNumber}</span>
        <span className="po-table__rfq-link">{po.rfqNumber}</span>
        <span className="po-table__meta">by {po.createdBy} · {po.department}</span>
      </div>
    ),
  },
  {
    key: 'vendor', label: 'Vendor', defaultVisible: true, width: '180px',
    render: (po) => (
      <div className="po-table__vendor">
        <div className={`po-table__avatar po-table__avatar--${po.avatarMod}`}>{po.vendorInitials}</div>
        <span className="po-table__vendor-name">{po.vendorName}</span>
      </div>
    ),
  },
  { key: 'amount', label: 'Amount', defaultVisible: true, width: '120px', render: (po, _fmtDate, fmtAmt, curr) => <span className="po-table__amount">{fmtAmt ? fmtAmt(po.totalAmountNum, curr) : po.totalAmount}</span> },
  { key: 'items', label: 'Items', defaultVisible: true, width: '70px', render: (po) => <span className="po-table__items">{po.itemCount}</span> },
  {
    key: 'priority', label: 'Priority', defaultVisible: true, width: '100px',
    render: (po) => <span className={`po-priority po-priority--${po.priority.toLowerCase()}`}>{po.priority === 'HIGH' && <AlertTriangle size={11} />}{po.priority}</span>,
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: '140px',
    render: (po) => <span className={`po-badge po-badge--${po.status}`}>{STATUS_ICONS[po.status]} {STATUS_LABELS[po.status]}</span>,
  },
  {
    key: 'delivery', label: 'Expected Delivery', defaultVisible: true, width: '140px',
    render: (po, fmtDate) => <span className="po-table__date"><Calendar size={12} /> {fmtDate(po.expectedDelivery)}</span>,
  },
  // Extra
  { key: 'department', label: 'Department', defaultVisible: false, width: '120px', render: (po) => <span className="po-table__date">{po.department}</span> },
  { key: 'createdBy', label: 'Created By', defaultVisible: false, width: '120px', render: (po) => <span className="po-table__date">{po.createdBy}</span> },
  { key: 'createdAt', label: 'Created', defaultVisible: false, width: '110px', render: (po, fmtDate) => <span className="po-table__date">{fmtDate(po.createdAt)}</span> },
];

// ─── Component ──────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const { data: poResult, loading, error } = useServiceData(
    () => purchaseOrderService.list().then((r) => r.orders.map(mapPO)),
    [] as MockPO[]
  );
  const orders = poResult;

  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'card'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [detailPO, setDetailPO] = useState<MockPO | null>(null);
  useBodyScrollLock(!!detailPO);
  const perPage = 8;
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
  const visibleColumns = useMemo(() => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)), [columnOrder, visibleKeys]);
  const handleToggleColumn = (key: string) => { setVisibleKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
  const handleResetColumns = () => { setColumnOrder(defaultOrder); setVisibleKeys(new Set(defaultVisible)); };

  const summary = useMemo(() => ({
    total: orders.length,
    pending: orders.filter(p => p.status === 'PENDING_APPROVAL' || p.status === 'DRAFT').length,
    active: orders.filter(p => p.status === 'APPROVED' || p.status === 'DISPATCHED').length,
    totalValue: formatAmount(orders.reduce((s, p) => s + p.totalAmountNum, 0), displayCurrency),
  }), [orders, displayCurrency, formatAmount]);

  const filtered = useMemo(() => {
    let list: MockPO[] = orders;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.poNumber.toLowerCase().includes(q) || p.vendorName.toLowerCase().includes(q) ||
        p.rfqNumber.toLowerCase().includes(q) || p.createdBy.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="po-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {loading && <div className="po-page__loading">Loading purchase orders…</div>}
      {/* Header */}
      <div className="po-page__header">
        <div className="po-page__header-left">
          <h1>Purchase Orders</h1>
          <p>Track, manage, and monitor all purchase orders across departments</p>
        </div>
        <button className="po-page__add-btn" onClick={() => navigate('/procurement/create-purchase-order')}>
          <Plus size={18} /> Create PO
        </button>
      </div>

      {/* Summary */}
      <div className="po-summary">
        {[
          { icon: <ShoppingCart size={22} />, val: summary.total, label: 'Total Orders', cls: 'total', filterKey: 'ALL', isFilter: true },
          { icon: <Clock size={22} />, val: summary.pending, label: 'Pending', cls: 'pending', filterKey: 'PENDING_APPROVAL', isFilter: true },
          { icon: <Truck size={22} />, val: summary.active, label: 'Active', cls: 'released', filterKey: 'APPROVED', isFilter: true },
          { icon: <IndianRupee size={22} />, val: summary.totalValue, label: 'Total Value', cls: 'value', isFilter: false },
        ].map(c => {
          const isActive = c.isFilter && statusFilter === c.filterKey;
          return (
            <div
              key={c.label}
              className={`po-summary-card ${isActive ? 'po-summary-card--active' : ''}`}
              onClick={() => {
                if (c.isFilter && c.filterKey) {
                  setStatusFilter(prev => (prev === c.filterKey ? 'ALL' : c.filterKey));
                  setCurrentPage(1);
                }
              }}
              style={{ cursor: c.isFilter ? 'pointer' : 'default' }}
            >
              <div className={`po-summary-card__icon po-summary-card__icon--${c.cls}`}>{c.icon}</div>
              <div className="po-summary-card__info">
                <span className="po-summary-card__value">{c.val}</span>
                <span className="po-summary-card__label">{c.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="po-toolbar">
        <div className="po-toolbar__search">
          <Search size={16} className="po-toolbar__search-icon" />
          <input type="text" placeholder="Search by PO number, vendor, RFQ, department..."
            value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
        </div>
        <div className="po-toolbar__right">
          <button className="po-toolbar__filter"><Filter size={14} /> Priority</button>
          <div className="po-toolbar__view-toggle">
            <button className={`po-toolbar__view-btn ${view === 'table' ? 'po-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('table')}><LayoutList size={16} /></button>
            <button className={`po-toolbar__view-btn ${view === 'card' ? 'po-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('card')}><LayoutGrid size={16} /></button>
          </div>
        </div>
      </div>

      {/* Content */}
      {paginated.length > 0 ? (
        view === 'table' ? (
          <div className="po-table-card">
            <div className="po-table-wrap">
              <table className="po-table" style={{ tableLayout: 'fixed', minWidth: '750px' }}>
                <colgroup>
                  {visibleColumns.map((col) => (<col key={col.key} style={{ width: col.width || 'auto' }} />))}
                  <col style={{ width: '80px' }} />
                </colgroup>
                <thead>
                  <tr>
                    {visibleColumns.map((col) => (<th key={col.key}>{col.label}</th>))}
                    <th>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>Actions</span>
                        <div className="col-btn-wrap">
                          <button ref={colBtnRef} className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`} onClick={() => setShowColPanel((v) => !v)} title="Customize columns" aria-label="Customize columns" aria-expanded={showColPanel}>
                            <span /><span /><span />
                          </button>
                          {showColPanel && (
                            <ColumnCustomizer columnOrder={columnOrder} visibleKeys={visibleKeys} allColumns={ALL_COLUMNS} onToggle={handleToggleColumn} onReorder={setColumnOrder} onReset={handleResetColumns} onClose={() => setShowColPanel(false)} anchorRef={colBtnRef} />
                          )}
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(po => (
                    <tr key={po.id} className={`po-table__row po-table__row--${(po.status || '').toLowerCase()}`}>
                      {visibleColumns.map((col) => (<td key={col.key}>{col.render(po, formatDate, formatAmount, displayCurrency)}</td>))}
                      <td>
                        <div className="po-table__actions">
                          <button className="po-table__action-btn" title="View Details" onClick={() => setDetailPO(po)}><Eye size={15} /></button>
                          <button className="po-table__action-btn" title="Download PDF" onClick={() => downloadPurchaseOrderAsPdf(po, formatAmount, displayCurrency)}><Download size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > perPage && (
              <div className="po-pagination">
                <span className="po-pagination__info">Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}</span>
                <div className="po-pagination__btns">
                  <button className="po-pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={14} /></button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} className={`po-pagination__btn ${currentPage === p ? 'po-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
                  ))}
                  <button className="po-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="po-cards">
            {paginated.map(po => (
              <div key={po.id} className="po-card" onClick={() => setDetailPO(po)}>
                <div className="po-card__top">
                  <div className="po-card__header-left">
                    <span className="po-card__po-number">{po.poNumber}</span>
                    <span className="po-card__rfq">{po.rfqNumber}</span>
                  </div>
                  <span className={`po-badge po-badge--${po.status}`}>{STATUS_ICONS[po.status]} {STATUS_LABELS[po.status]}</span>
                </div>
                <div className="po-card__vendor-row">
                  <div className={`po-card__avatar po-table__avatar--${po.avatarMod}`}>{po.vendorInitials}</div>
                  <div><div className="po-card__vendor-name">{po.vendorName}</div>
                    <div className="po-card__vendor-meta">{po.department} · {po.createdBy}</div></div>
                </div>
                <div className="po-card__details">
                  <div className="po-card__detail"><span className="po-card__detail-label">Amount</span><span className="po-card__detail-value">{formatAmount(po.totalAmountNum, displayCurrency)}</span></div>
                  <div className="po-card__detail"><span className="po-card__detail-label">Items</span><span className="po-card__detail-value">{po.itemCount}</span></div>
                  <div className="po-card__detail"><span className="po-card__detail-label">Delivery</span><span className="po-card__detail-value">{formatDate(po.expectedDelivery)}</span></div>
                </div>
                <div className="po-card__footer">
                  <span className={`po-priority po-priority--${po.priority.toLowerCase()}`}>{po.priority === 'HIGH' && <AlertTriangle size={11} />} {po.priority}</span>
                  <span className="po-card__created">{formatDate(po.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="po-table-card"><div className="po-empty">
          <div className="po-empty__icon"><ShoppingCart size={48} /></div>
          <div className="po-empty__title">No purchase orders found</div>
          <div className="po-empty__desc">{search ? 'Try adjusting your search.' : 'Create your first purchase order to get started.'}</div>
        </div></div>
      )}

      {/* Detail Modal */}
      {detailPO && (
        <div className="po-modal-backdrop" onClick={() => setDetailPO(null)}>
          <div className="po-modal" onClick={e => e.stopPropagation()}>
            <div className="po-modal__header">
              <div className="po-modal__title"><Eye size={20} /><span>Order Details — {detailPO.poNumber}</span></div>
              <button className="po-modal__close" onClick={() => setDetailPO(null)}><X size={18} /></button>
            </div>
            <div className="po-modal__body">
              <div className="po-modal__status-bar">
                <span className={`po-badge po-badge--${detailPO.status}`}>{STATUS_ICONS[detailPO.status]} {STATUS_LABELS[detailPO.status]}</span>
                <span className={`po-priority po-priority--${detailPO.priority.toLowerCase()}`}>{detailPO.priority} Priority</span>
              </div>
              <div className="po-modal__grid">
                {[
                  { l: 'PO Number', v: detailPO.poNumber }, { l: 'RFQ Reference', v: detailPO.rfqNumber },
                  { l: 'Vendor', v: detailPO.vendorName },                  { l: 'Total Amount', v: formatAmount(detailPO.totalAmountNum, displayCurrency) },
                  { l: 'Items', v: String(detailPO.itemCount) }, { l: 'Department', v: detailPO.department },
                  { l: 'Created By', v: detailPO.createdBy }, { l: 'Created', v: formatDate(detailPO.createdAt) },
                  { l: 'Expected Delivery', v: formatDate(detailPO.expectedDelivery) },
                ].map(i => (
                  <div key={i.l} className="po-modal__grid-item">
                    <span className="po-modal__grid-label">{i.l}</span>
                    <span className="po-modal__grid-value">{i.v}</span>
                  </div>
                ))}
              </div>
              {/* Timeline */}
              <div className="po-modal__timeline">
                <span className="po-modal__timeline-title">Order Timeline</span>
                <div className="po-modal__timeline-steps">
                  {(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'DELIVERED'] as POStatus[]).map((step, idx) => {
                    const statusOrder = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'DELIVERED'];
                    const currentIdx = detailPO.status === 'CANCELLED' ? -1 : statusOrder.indexOf(detailPO.status);
                    const stepIdx = statusOrder.indexOf(step);
                    const isDone = stepIdx <= currentIdx;
                    const isCurrent = stepIdx === currentIdx;
                    return (
                      <div key={step} className="po-modal__timeline-step">
                        <div className={`po-modal__timeline-dot ${isDone ? 'po-modal__timeline-dot--done' : ''} ${isCurrent ? 'po-modal__timeline-dot--current' : ''}`}>
                          {isDone ? <CheckCircle2 size={14} /> : <span>{idx + 1}</span>}
                        </div>
                        {idx < 4 && <div className={`po-modal__timeline-line ${isDone && !isCurrent ? 'po-modal__timeline-line--done' : ''}`} />}
                        <span className={`po-modal__timeline-label ${isDone ? 'po-modal__timeline-label--done' : ''}`}>{STATUS_LABELS[step]}</span>
                      </div>
                    );
                  })}
                </div>
                {detailPO.status === 'CANCELLED' && (
                  <div className="po-modal__cancelled-notice"><XCircle size={14} /> This order has been cancelled.</div>
                )}
              </div>
            </div>
            <div className="po-modal__footer">
              <button className="po-modal__btn po-modal__btn--primary" onClick={() => downloadPurchaseOrderAsPdf(detailPO, formatAmount, displayCurrency)}>
                <Download size={14} style={{ marginRight: 6 }} /> Download PDF
              </button>
              <button className="po-modal__btn po-modal__btn--secondary" onClick={() => setDetailPO(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
