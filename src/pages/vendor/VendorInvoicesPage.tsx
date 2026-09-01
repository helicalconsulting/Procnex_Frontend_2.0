import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService } from '../../services/vendorPortalService';
import type { VendorInvoiceMock } from '../../mocks/vendorPortal.mock';
import {
  Receipt, Search, CheckCircle2, Clock,
  XCircle,  AlertTriangle, Calendar, FileText, Plus
} from 'lucide-react';
import { useCurrency, CurrencySelector, CurrencyBadge } from '../../components/shared/CurrencyMaster';
import '../../styles/vendor-portal.css';

// ─── Types ──────────────────────────────────────────────────

type InvStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'OVERDUE';

type VendorInvoice = VendorInvoiceMock;

const STATUS_CONFIG: Record<InvStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', cls: 'pending', icon: <Clock size={13} /> },
  APPROVED: { label: 'Approved', cls: 'approved', icon: <CheckCircle2 size={13} /> },
  PAID: { label: 'Paid', cls: 'paid', icon: <CheckCircle2 size={13} /> },
  REJECTED: { label: 'Rejected', cls: 'rejected', icon: <XCircle size={13} /> },
  OVERDUE: { label: 'Overdue', cls: 'overdue', icon: <AlertTriangle size={13} /> },
};

// ─── Component ──────────────────────────────────────────────

export default function VendorInvoicesPage() {
  useAuth();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState<string>(companyDefaultCurrency);
  useEffect(() => { setDisplayCurrency(companyDefaultCurrency); }, [companyDefaultCurrency]);
  const { data: invoices } = useServiceData(
    () => vendorPortalService.listInvoices(),
    [] as VendorInvoice[]
  );
  const [search, setSearch] = useState('');

  const summary = useMemo(() => ({
    totalAmount: invoices.reduce((s, i) => s + i.totalAmount, 0),
    paid: invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.totalAmount, 0),
    pending: invoices.filter(i => ['PENDING', 'APPROVED'].includes(i.status)).reduce((s, i) => s + i.totalAmount, 0),
    overdue: invoices.filter(i => i.status === 'OVERDUE').reduce((s, i) => s + i.totalAmount, 0),
  }), [invoices]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.invoiceNumber.toLowerCase().includes(q) || i.poNumber.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return list;
  }, [invoices, search]);


  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="vendor-portal">
      <div className="vendor-portal__container">

        {/* ── Header ────────────────────────────────── */}
        <div className="vendor-header">
          <div className="vendor-header__content">
            <h1>My Invoices 🧾</h1>
            <p>Track your invoices and payment status</p>
          </div>
          <div className="vendor-header__actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link to="/vendor/create-invoice" className="vendor-btn vendor-btn--primary" style={{ textDecoration: 'none' }}>
              <Plus size={15} /> Create & Send Invoice
            </Link>
            <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />
          </div>
        </div>

        {/* ── KPI Cards ─────────────────────────────── */}
        <div className="vendor-kpis">
          {[
            { icon: <Receipt size={24} />, value: formatAmount(summary.totalAmount, displayCurrency), label: 'Total Invoiced', sub: `${invoices.length} invoices` },
            { icon: <CheckCircle2 size={24} />, value: formatAmount(summary.paid, displayCurrency), label: 'Paid', sub: 'Received', style: { background: 'rgba(16,126,62,0.1)', color: '#107e3e' } },
            { icon: <Clock size={24} />, value: formatAmount(summary.pending, displayCurrency), label: 'Pending', sub: 'Awaiting payment', style: { background: 'rgba(233,115,12,0.1)', color: '#e9730c' } },
            { icon: <AlertTriangle size={24} />, value: formatAmount(summary.overdue, displayCurrency), label: 'Overdue', sub: 'Past due date', style: { background: 'rgba(187,0,0,0.08)', color: '#bb0000' } },
          ].map(k => (
            <div key={k.label} className="vendor-kpi-card">
              <div className="vendor-kpi-icon" style={k.style}>{k.icon}</div>
              <div>
                <div className="vendor-kpi-label">{k.label}</div>
                <div className="vendor-kpi-value" style={{ fontSize: 22 }}>{k.value}</div>
                <div className="vendor-kpi-subtext">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Search & Filters ──────────────────────── */}
        <div className="vo-toolbar">
          <div className="vo-toolbar__search">
            <Search size={16} className="vo-toolbar__search-icon" />
            <input type="text" placeholder="Search by invoice number, PO, or description..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* ── Invoice Table ─────────────────────────── */}
        {filtered.length > 0 ? (
          <div className="vendor-table-container">
            <table className="vendor-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>PO Reference</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>GST</th>
                  <th>Total</th>
                  <th>Submitted</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const cfg = STATUS_CONFIG[inv.status];
                  return (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileText size={15} style={{ color: 'var(--vendor-primary)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--vendor-primary)' }}>{inv.invoiceNumber}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{inv.rfqNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{inv.poNumber}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.description}</td>
                      <td style={{ fontWeight: 600 }}>{formatAmount(inv.amount, displayCurrency)}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatAmount(inv.gst, displayCurrency)}</td>
                      <td style={{ fontWeight: 700 }}>{formatAmount(inv.totalAmount, displayCurrency)} <CurrencyBadge currency={displayCurrency} size="sm" /></td>
                      <td className="text-secondary" style={{ fontSize: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={12} />{fmtDate(inv.submittedDate)}
                        </span>
                      </td>
                      <td className="text-secondary" style={{ fontSize: 12 }}>
                        {fmtDate(inv.dueDate)}
                        {inv.paymentDate && <div style={{ color: '#107e3e', fontWeight: 600, marginTop: 2 }}>Paid: {fmtDate(inv.paymentDate)}</div>}
                      </td>
                      <td>
                        <span className={`vendor-badge vendor-badge--${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vendor-empty-state">
            <div className="vendor-empty-state__icon">🧾</div>
            <div className="vendor-empty-state__title">No Invoices Found</div>
            <div className="vendor-empty-state__text">{search ? 'Try adjusting your search.' : 'Upload your first invoice to get started.'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
