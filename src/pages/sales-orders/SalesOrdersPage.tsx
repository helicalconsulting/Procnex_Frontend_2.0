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
import './SalesOrdersPage.css';

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
    itemCount: 0,
    amount: so.amount,
    orderDate: so.orderDate,
    deliveryDate: so.orderDate,
    status: statusMap[so.status] || 'DRAFT',
    region: '—',
    salesRep: '—',
  };
}

const STATUS_MAP: Record<SOStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  DRAFT:      { label: 'Draft',      cls: 'draft',    icon: <Clock size={13} /> },
  CONFIRMED:  { label: 'Confirmed',  cls: 'pending',  icon: <CheckCircle2 size={13} /> },
  PROCESSING: { label: 'Processing', cls: 'partial',  icon: <Package size={13} /> },
  SHIPPED:    { label: 'Shipped',    cls: 'shipped',  icon: <Truck size={13} /> },
  DELIVERED:  { label: 'Delivered',  cls: 'paid',     icon: <CheckCircle2 size={13} /> },
  CANCELLED:  { label: 'Cancelled',  cls: 'overdue',  icon: <XCircle size={13} /> },
  DISCARDED:  { label: 'Discarded',  cls: 'rejected', icon: <X size={13} /> },
};

// Per-status action config — what buttons to show and what they do
const ACTION_CFG: Partial<Record<SOStatus, {
  primary:   { action: ActionType; label: string; color: 'approve'; icon: React.ReactNode };
  secondary?: { action: ActionType; label: string; color: 'reject' | 'return'; icon: React.ReactNode };
}>> = {
  DRAFT: {
    primary:   { action: 'confirm', label: 'Confirm',      color: 'approve', icon: <ThumbsUp size={15} /> },
    secondary: { action: 'discard', label: 'Discard',      color: 'reject',  icon: <ThumbsDown size={15} /> },
  },
  CONFIRMED: {
    primary:   { action: 'ship',    label: 'Mark Shipped', color: 'approve', icon: <Truck size={15} /> },
    secondary: { action: 'cancel',  label: 'Cancel',       color: 'reject',  icon: <XCircle size={15} /> },
  },
  PROCESSING: {
    primary:   { action: 'ship',    label: 'Mark Shipped', color: 'approve', icon: <Truck size={15} /> },
    secondary: { action: 'cancel',  label: 'Cancel',       color: 'reject',  icon: <XCircle size={15} /> },
  },
  SHIPPED: {
    primary:   { action: 'deliver', label: 'Mark Delivered', color: 'approve', icon: <CheckCircle2 size={15} /> },
    secondary: { action: 'cancel',  label: 'Cancel',         color: 'reject',  icon: <XCircle size={15} /> },
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
  // Optimistic overlay for local actions (no API persistence)
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

  // ── KPIs (reactive) ──
  const summary = useMemo(() => ({
    totalRevenue: orders.filter(o => !['CANCELLED','DRAFT','DISCARDED'].includes(o.status)).reduce((s, o) => s + o.amount, 0),
    active:       orders.filter(o => ['CONFIRMED','PROCESSING','SHIPPED'].includes(o.status)).length,
    delivered:    orders.filter(o => o.status === 'DELIVERED').length,
    cancelled:    orders.filter(o => o.status === 'CANCELLED' || o.status === 'DISCARDED').length,
  }), [orders]);

  // ── Filtered list ──
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

  // ── Action handler ──
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
  const actionColor       = actionModal
    ? (actionModal.action === 'cancel' || actionModal.action === 'discard' ? 'reject' : 'approve')
    : 'approve';

  return (
    <div className="fin-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {loading && <div className="fin-page__loading">Loading sales orders…</div>}

      {/* ── Header ── */}
      <div className="fin-page__header">
        <div>
          <h1>Sales Orders</h1>
          <p>Manage outgoing sales orders and track delivery performance</p>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="fin-kpis">
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--primary"><TrendingUp size={20} /></div><div><span className="fin-kpi__value">{fmt(summary.totalRevenue)}</span><span className="fin-kpi__label">Total Revenue</span></div></div>
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--warning"><ShoppingBag size={20} /></div><div><span className="fin-kpi__value">{summary.active}</span><span className="fin-kpi__label">Active Orders</span></div></div>
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--success"><CheckCircle2 size={20} /></div><div><span className="fin-kpi__value">{summary.delivered}</span><span className="fin-kpi__label">Delivered</span></div></div>
        <div className="fin-kpi"><div className="fin-kpi__icon fin-kpi__icon--danger"><XCircle size={20} /></div><div><span className="fin-kpi__value">{summary.cancelled}</span><span className="fin-kpi__label">Cancelled / Discarded</span></div></div>
      </div>

      {/* ── Toolbar ── */}
      <div className="fin-toolbar">
        <div className="fin-toolbar__search">
          <Search size={16} className="fin-toolbar__search-icon" />
          <input placeholder="Search sales orders..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="fin-table-card">
        <table className="fin-table">
          <thead>
            <tr>
              <th>SO #</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Order date</th>
              <th>Delivery</th>
              <th>Region</th>
              <th>Sales rep</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(so => {
              const cfg     = STATUS_MAP[so.status];
              const actCfg  = ACTION_CFG[so.status];
              return (
                <tr key={so.id}>
                  <td><span className="fin-table__ref">{so.soNumber}</span></td>
                  <td>
                    <div className="fin-table__vendor">
                      <div className={`fin-table__avatar fin-table__avatar--${so.avatarMod}`}>{so.customerInitials}</div>
                      <span className="fin-table__vendor-name">{so.customerName}</span>
                    </div>
                  </td>
                  <td className="fin-table__center">{so.itemCount}</td>
                  <td className="fin-table__amount fin-table__amount--bold">{fmt(so.amount)}</td>
                  <td className="fin-table__date">{fmtDate(so.orderDate)}</td>
                  <td className="fin-table__date">{fmtDate(so.deliveryDate)}</td>
                  <td><span className="fin-region-badge">{so.region}</span></td>
                  <td className="fin-table__secondary">{so.salesRep}</td>
                  <td><span className={`fin-badge fin-badge--${cfg.cls}`}>{cfg.icon}{cfg.label}</span></td>
                  <td>
                    <div className="approvals-table__actions">
                      {/* View */}
                      <button
                        className="approvals-table__action-btn"
                        title="View Details"
                        onClick={() => setDetailOrder(so)}
                      >
                        <Eye size={15} />
                      </button>
                      {/* Context-aware primary action */}
                      {actCfg?.primary && (
                        <button
                          className="approvals-table__action-btn approvals-table__action-btn--approve"
                          title={actCfg.primary.label}
                          onClick={() => openAction(so, actCfg.primary.action)}
                        >
                          {actCfg.primary.icon}
                        </button>
                      )}
                      {/* Context-aware secondary action */}
                      {actCfg?.secondary && (
                        <button
                          className={`approvals-table__action-btn approvals-table__action-btn--${actCfg.secondary.color === 'reject' ? 'reject' : 'return'}`}
                          title={actCfg.secondary.label}
                          onClick={() => openAction(so, actCfg.secondary!.action)}
                        >
                          {actCfg.secondary.icon}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="fin-empty"><span>📊</span><p>No sales orders found</p></div>
        )}
      </div>

      {/* ── Action Modal ── */}
      {actionModal && (
        <div className="approvals-modal-backdrop" onClick={() => setActionModal(null)}>
          <div className="approvals-modal" onClick={e => e.stopPropagation()}>
            <div className={`approvals-modal__header approvals-modal__header--${actionColor}`}>
              <div className="approvals-modal__title">
                {actionColor === 'approve' ? <ThumbsUp size={20} /> : <ThumbsDown size={20} />}
                <span>{ACTION_TITLES[actionModal.action]}</span>
              </div>
              <button className="approvals-modal__close" onClick={() => setActionModal(null)}><X size={18} /></button>
            </div>

            <div className="approvals-modal__body">
              <div className="approvals-modal__request-summary">
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">SO #</span>
                  <span className="approvals-modal__summary-value">{actionModal.order.soNumber}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Customer</span>
                  <span className="approvals-modal__summary-value">{actionModal.order.customerName}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Amount</span>
                  <span className="approvals-modal__summary-value approvals-modal__summary-value--amount">{fmt(actionModal.order.amount)}</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Items</span>
                  <span className="approvals-modal__summary-value">{actionModal.order.itemCount} items</span>
                </div>
                <div className="approvals-modal__summary-row">
                  <span className="approvals-modal__summary-label">Delivery date</span>
                  <span className="approvals-modal__summary-value">{fmtDate(actionModal.order.deliveryDate)}</span>
                </div>
              </div>

              <div className="approvals-modal__field">
                <label className="approvals-modal__label">
                  <MessageSquare size={13} style={{ marginRight: 4 }} />
                  Comments {isCommentRequired && <span>*</span>}
                </label>
                <textarea
                  className="approvals-modal__textarea"
                  rows={4}
                  placeholder={isCommentRequired ? 'Provide a reason...' : 'Optional comments...'}
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                />
              </div>
            </div>

            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setActionModal(null)}>Cancel</button>
              <button
                className={`approvals-modal__btn approvals-modal__btn--${actionColor}`}
                disabled={isCommentRequired && !actionComment.trim()}
                onClick={handleAction}
              >
                {ACTION_TITLES[actionModal.action]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailOrder && (
        <div className="approvals-modal-backdrop" onClick={() => setDetailOrder(null)}>
          <div className="approvals-modal approvals-modal--detail" onClick={e => e.stopPropagation()}>
            <div className="approvals-modal__header">
              <div className="approvals-modal__title"><Eye size={20} /><span>Order Details</span></div>
              <button className="approvals-modal__close" onClick={() => setDetailOrder(null)}><X size={18} /></button>
            </div>

            <div className="approvals-modal__body">
              <div className="approvals-detail-grid">
                {[
                  { label: 'SO #',          value: detailOrder.soNumber },
                  { label: 'Customer',      value: detailOrder.customerName },
                  { label: 'Amount',        value: fmt(detailOrder.amount) },
                  { label: 'Items',         value: `${detailOrder.itemCount} items` },
                  { label: 'Order date',    value: fmtDate(detailOrder.orderDate) },
                  { label: 'Delivery date', value: fmtDate(detailOrder.deliveryDate) },
                  { label: 'Region',        value: detailOrder.region },
                  { label: 'Sales rep',     value: detailOrder.salesRep },
                  { label: 'Status',        value: STATUS_MAP[detailOrder.status].label },
                ].map(item => (
                  <div key={item.label} className="approvals-detail-grid__item">
                    <span className="approvals-detail-grid__label">{item.label}</span>
                    <span className="approvals-detail-grid__value">{item.value}</span>
                  </div>
                ))}
              </div>
              {detailOrder.comments && (
                <div className="approvals-detail-comments">
                  <span className="approvals-detail-comments__label"><MessageSquare size={13} /> Comments</span>
                  <p className="approvals-detail-comments__text">{detailOrder.comments}</p>
                </div>
              )}
            </div>

            <div className="approvals-modal__footer">
              <button className="approvals-modal__btn approvals-modal__btn--secondary" onClick={() => setDetailOrder(null)}>Close</button>
              {ACTION_CFG[detailOrder.status]?.primary && (
                <button
                  className="approvals-modal__btn approvals-modal__btn--approve"
                  onClick={() => { setDetailOrder(null); openAction(detailOrder, ACTION_CFG[detailOrder.status]!.primary.action); }}
                >
                  {ACTION_CFG[detailOrder.status]!.primary.icon}
                  {ACTION_CFG[detailOrder.status]!.primary.label}
                </button>
              )}
              {ACTION_CFG[detailOrder.status]?.secondary && (
                <button
                  className="approvals-modal__btn approvals-modal__btn--reject"
                  onClick={() => { setDetailOrder(null); openAction(detailOrder, ACTION_CFG[detailOrder.status]!.secondary!.action); }}
                >
                  {ACTION_CFG[detailOrder.status]!.secondary!.icon}
                  {ACTION_CFG[detailOrder.status]!.secondary!.label}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
