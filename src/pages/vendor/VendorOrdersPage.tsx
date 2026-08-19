import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService } from '../../services/vendorPortalService';
import type { VendorOrderMock } from '../../mocks/vendorPortal.mock';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  ChevronDown,
  MapPin,
  Calendar,
  IndianRupee,
  FileText,
  AlertCircle,
  Upload,
  MessageSquare,
  Download,
} from 'lucide-react';
import { useCurrency, CurrencySelector, CurrencyBadge } from '../../components/shared/CurrencyMaster';
import { downloadPurchaseOrderAsPdf } from '../../utils/pdfDownload';
import '../../styles/vendor-portal.css';
import '../../styles/vendor-orders.css';

// ─── Order Status Types ─────────────────────────────────────

type OrderStatus =
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

type VendorOrder = VendorOrderMock;

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  CONFIRMED: {
    label: 'Confirmed',
    color: '#0a6ed1',
    bg: 'rgba(10,110,209,0.08)',
    border: 'rgba(10,110,209,0.2)',
    icon: <CheckCircle2 size={14} />,
  },
  PROCESSING: {
    label: 'Processing',
    color: '#e9730c',
    bg: 'rgba(233,115,12,0.08)',
    border: 'rgba(233,115,12,0.2)',
    icon: <Clock size={14} />,
  },
  SHIPPED: {
    label: 'Shipped',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.2)',
    icon: <Truck size={14} />,
  },
  DELIVERED: {
    label: 'Delivered',
    color: '#107e3e',
    bg: 'rgba(16,126,62,0.08)',
    border: 'rgba(16,126,62,0.2)',
    icon: <CheckCircle2 size={14} />,
  },
  CANCELLED: {
    label: 'Cancelled',
    color: '#bb0000',
    bg: 'rgba(187,0,0,0.06)',
    border: 'rgba(187,0,0,0.2)',
    icon: <XCircle size={14} />,
  },
};

// ─── Component ──────────────────────────────────────────────

export default function VendorOrdersPage() {
  useAuth();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState<string>(companyDefaultCurrency);
  // Sync display currency when company default changes
  useEffect(() => { setDisplayCurrency(companyDefaultCurrency); }, [companyDefaultCurrency]);
  const { data: orderList } = useServiceData(
    () => vendorPortalService.listOrders(),
    [] as VendorOrder[]
  );
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const summary = useMemo(() => ({
    total: orderList.length,
    active: orderList.filter(o => ['CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(o.status)).length,
    delivered: orderList.filter(o => o.status === 'DELIVERED').length,
    cancelled: orderList.filter(o => o.status === 'CANCELLED').length,
  }), [orderList]);

  const filtered = useMemo(() => {
    let orders = orderList;
    if (search.trim()) {
      const q = search.toLowerCase();
      orders = orders.filter(o =>
        o.poNumber.toLowerCase().includes(q) ||
        o.rfqNumber.toLowerCase().includes(q) ||
        o.buyerName.toLowerCase().includes(q) ||
        o.items.some(item => item.name.toLowerCase().includes(q))
      );
    }
    return orders;
  }, [orderList, search]);



  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // Progress tracker steps
  const getProgressSteps = (status: OrderStatus) => {
    const steps = ['Confirmed', 'Processing', 'Shipped', 'Delivered'];
    const statusIndex: Record<OrderStatus, number> = {
      CONFIRMED: 0,
      PROCESSING: 1,
      SHIPPED: 2,
      DELIVERED: 3,
      CANCELLED: -1,
    };
    return { steps, current: statusIndex[status] };
  };

  return (
    <div className="vendor-portal">
      <div className="vendor-portal__container">

        {/* ── Header ────────────────────────────────── */}
        <div className="vendor-header">
          <div className="vendor-header__content">
            <h1>My Orders 📦</h1>
            <p>Track and manage all your purchase orders in one place.</p>
          </div>
          <div className="vendor-header__actions">
            <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />
          </div>
        </div>

        {/* ── KPI Cards ─────────────────────────────── */}
        <div className="vendor-kpis">
          <div className="vendor-kpi-card">
            <div className="vendor-kpi-icon">
              <Package size={24} />
            </div>
            <div>
              <div className="vendor-kpi-label">Total Orders</div>
              <div className="vendor-kpi-value">{summary.total}</div>
              <div className="vendor-kpi-subtext">All time</div>
            </div>
          </div>
          <div className="vendor-kpi-card">
            <div className="vendor-kpi-icon" style={{ background: 'rgba(233,115,12,0.1)', color: '#e9730c' }}>
              <Truck size={24} />
            </div>
            <div>
              <div className="vendor-kpi-label">Active Orders</div>
              <div className="vendor-kpi-value">{summary.active}</div>
              <div className="vendor-kpi-subtext">In progress</div>
            </div>
          </div>
          <div className="vendor-kpi-card">
            <div className="vendor-kpi-icon" style={{ background: 'rgba(16,126,62,0.1)', color: '#107e3e' }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div className="vendor-kpi-label">Delivered</div>
              <div className="vendor-kpi-value">{summary.delivered}</div>
              <div className="vendor-kpi-subtext">Completed</div>
            </div>
          </div>
          <div className="vendor-kpi-card">
            <div className="vendor-kpi-icon" style={{ background: 'rgba(187,0,0,0.08)', color: '#bb0000' }}>
              <XCircle size={24} />
            </div>
            <div>
              <div className="vendor-kpi-label">Cancelled</div>
              <div className="vendor-kpi-value">{summary.cancelled}</div>
              <div className="vendor-kpi-subtext">All time</div>
            </div>
          </div>
        </div>

        {/* ── Search & Filter Bar ────────────────── */}
        <div className="vo-toolbar">
          <div className="vo-toolbar__search">
            <Search size={16} className="vo-toolbar__search-icon" />
            <input
              type="text"
              placeholder="Search by PO number, RFQ, buyer or item name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Orders List ────────────────────────── */}
        {filtered.length > 0 ? (
          <div className="vo-orders">
            {filtered.map(order => {
              const statusConf = STATUS_CONFIG[order.status];
              const isExpanded = expandedOrder === order.id;
              const { steps, current } = getProgressSteps(order.status);

              return (
                <div
                  key={order.id}
                  className={`vo-order-card ${isExpanded ? 'vo-order-card--expanded' : ''}`}
                >
                  {/* Order Header */}
                  <div
                    className="vo-order-card__header"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  >
                    <div className="vo-order-card__left">
                      <div className="vo-order-card__po">
                        <FileText size={16} style={{ color: 'var(--vendor-primary)' }} />
                        <span className="vo-order-card__po-number">{order.poNumber}</span>
                        <span className="vo-order-card__rfq">{order.rfqNumber}</span>
                      </div>
                      <div className="vo-order-card__meta">
                        <span className="vo-order-card__buyer">{order.buyerCompany}</span>
                        <span className="vo-order-card__dot">·</span>
                        <span className="vo-order-card__items-count">
                          {order.items.length} item{order.items.length > 1 ? 's' : ''}
                        </span>
                        <span className="vo-order-card__dot">·</span>
                        <span className="vo-order-card__date">
                          <Calendar size={12} />
                          {formatDate(order.orderDate)}
                        </span>
                      </div>
                    </div>
                    <div className="vo-order-card__right">
                      <span className="vo-order-card__amount">{formatAmount(order.totalAmount, displayCurrency)}</span>
                      <span
                        className="vo-order-card__status"
                        style={{
                          color: statusConf.color,
                          background: statusConf.bg,
                          borderColor: statusConf.border,
                        }}
                      >
                        {statusConf.icon}
                        {statusConf.label}
                      </span>
                      <ChevronDown
                        size={18}
                        className={`vo-order-card__chevron ${isExpanded ? 'vo-order-card__chevron--open' : ''}`}
                      />
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="vo-order-card__body">
                      {/* Progress Tracker */}
                      {order.status !== 'CANCELLED' ? (
                        <div className="vo-progress">
                          {steps.map((step, i) => (
                            <div
                              key={step}
                              className={`vo-progress__step ${
                                i <= current ? 'vo-progress__step--done' : ''
                              } ${i === current ? 'vo-progress__step--current' : ''}`}
                            >
                              <div className="vo-progress__dot">
                                {i <= current ? <CheckCircle2 size={16} /> : <div className="vo-progress__dot-circle" />}
                              </div>
                              {i < steps.length - 1 && <div className="vo-progress__line" />}
                              <span className="vo-progress__label">{step}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="vo-cancelled-notice">
                          <AlertCircle size={16} />
                          <span>This order was cancelled</span>
                        </div>
                      )}

                      {/* Order Details Grid */}
                      <div className="vo-order-details">
                        <div className="vo-order-details__section">
                          <h4>Order Items</h4>
                          <table className="vo-items-table">
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="vo-items-table__name">{item.name}</td>
                                  <td>{item.quantity} {item.unit}</td>
                                  <td>{formatAmount(item.unitPrice, displayCurrency)}</td>
                                  <td className="vo-items-table__total">
                                    {formatAmount(item.quantity * item.unitPrice, displayCurrency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={3} className="vo-items-table__grand-label">Grand Total</td>
                                <td className="vo-items-table__grand-total">
                                    {formatAmount(order.totalAmount, displayCurrency)}
                                    <CurrencyBadge currency={displayCurrency} size="sm" style={{ marginLeft: 6 }} />
                                  </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div className="vo-order-details__info">
                          <h4>Shipping & Payment</h4>
                          <div className="vo-info-rows">
                            <div className="vo-info-row">
                              <MapPin size={14} />
                              <div>
                                <span className="vo-info-row__label">Delivery Address</span>
                                <span className="vo-info-row__value">{order.shippingAddress}</span>
                              </div>
                            </div>
                            <div className="vo-info-row">
                              <Calendar size={14} />
                              <div>
                                <span className="vo-info-row__label">Expected Delivery</span>
                                <span className="vo-info-row__value">{formatDate(order.expectedDelivery)}</span>
                              </div>
                            </div>
                            {order.deliveredDate && (
                              <div className="vo-info-row">
                                <CheckCircle2 size={14} />
                                <div>
                                  <span className="vo-info-row__label">Delivered On</span>
                                  <span className="vo-info-row__value vo-info-row__value--success">{formatDate(order.deliveredDate)}</span>
                                </div>
                              </div>
                            )}
                            <div className="vo-info-row">
                              <IndianRupee size={14} />
                              <div>
                                <span className="vo-info-row__label">Payment Terms</span>
                                <span className="vo-info-row__value">{order.paymentTerms}</span>
                              </div>
                            </div>
                            {order.trackingId && (
                              <div className="vo-info-row">
                                <Truck size={14} />
                                <div>
                                  <span className="vo-info-row__label">Tracking ID</span>
                                  <span className="vo-info-row__value vo-info-row__value--primary">{order.trackingId}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                        <button
                          className="vendor-btn vendor-btn--primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadPurchaseOrderAsPdf(order, formatAmount, displayCurrency);
                          }}
                        >
                          <Download size={15} /> Download PO (PDF)
                        </button>
                        {order.status === 'DELIVERED' && (
                          <Link to="/vendor/invoices" className="vendor-btn vendor-btn--primary" style={{ textDecoration: 'none' }}>
                            <Upload size={15} /> Upload Invoice
                          </Link>
                        )}
                        <button className="vendor-btn vendor-btn--secondary">
                          <MessageSquare size={15} /> Contact Buyer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="vendor-empty-state">
            <div className="vendor-empty-state__icon">📦</div>
            <div className="vendor-empty-state__title">No Orders Found</div>
            <div className="vendor-empty-state__text">
              {search
                ? 'Try adjusting your search.'
                : 'When purchase orders are issued to your company, they will appear here.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
