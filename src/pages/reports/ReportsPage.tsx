import { useState, useMemo, useCallback, useEffect } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { reportsService } from '../../services/reportsService';
import type { InvoiceRecord, PaymentStatus, AgingBucket } from '../../mocks/reportsPage.mock';
import {
  FileText, FileSpreadsheet, Search,
  Clock, CheckCircle2, XCircle, AlertTriangle,
  DollarSign, Calendar, ChevronLeft, ChevronRight, Eye, X,
} from 'lucide-react';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import './ReportsPage.css';

const STATUS_CFG: Record<PaymentStatus, { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'paid' }, pending: { label: 'Pending', cls: 'pending' },
  overdue: { label: 'Overdue', cls: 'overdue' }, rejected: { label: 'Rejected', cls: 'rejected' },
};

// ─── Component ──────────────────────────────────────────────

export default function ReportsPage() {
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  useEffect(() => { setDisplayCurrency(companyDefaultCurrency); }, [companyDefaultCurrency]);
  const formatCurrency = (n: number) => formatAmount(n, displayCurrency);
  const { data: reportInvoices } = useServiceData(
    () => reportsService.list(),
    [] as InvoiceRecord[]
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [detailRecord, setDetailRecord] = useState<InvoiceRecord | null>(null);
  useBodyScrollLock(!!detailRecord);
  const perPage = 8;

  const kpis = useMemo(() => {
    const totalInvoiced = reportInvoices.reduce((s, r) => s + r.amount, 0);
    const totalPaid = reportInvoices.reduce((s, r) => s + r.paidAmount, 0);
    const totalOverdue = reportInvoices.filter(r => r.paymentStatus === 'overdue').reduce((s, r) => s + r.amount, 0);
    const pendingApproval = reportInvoices.filter(r => r.approvalStatus === 'pending').length;
    return { totalInvoiced, totalPaid, totalOverdue, pendingApproval };
  }, [reportInvoices]);

  const aging = useMemo(() => {
    const buckets: Record<AgingBucket, { count: number; amount: number }> = {
      '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 }, '90+': { count: 0, amount: 0 },
    };
    reportInvoices.filter(r => r.paymentStatus === 'overdue' || r.paymentStatus === 'pending').forEach(r => {
      buckets[r.agingBucket].count++;
      buckets[r.agingBucket].amount += r.amount;
    });
    return buckets;
  }, [reportInvoices]);

  const filtered = useMemo(() => {
    let list = reportInvoices;
    if (statusFilter !== 'all') list = list.filter(r => r.paymentStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.invoiceNo.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q) ||
        r.poNumber.toLowerCase().includes(q) || r.department.toLowerCase().includes(q)
      );
    }
    return list;
  }, [reportInvoices, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  // Export handlers
  const handleExportPDF = useCallback(() => {
    // Build a printable HTML table
    const rows = filtered.map(r =>
      `<tr><td>${r.invoiceNo}</td><td>${r.supplier}</td><td>${r.invoiceDate}</td><td>${r.dueDate}</td><td>${formatCurrency(r.amount)}</td><td>${formatCurrency(r.paidAmount)}</td><td>${STATUS_CFG[r.paymentStatus].label}</td><td>${r.approvalStatus}</td><td>${r.agingDays}d</td></tr>`
    ).join('');
    const html = `<html><head><title>Supplier Invoice Payment Report</title><style>body{font-family:Arial,sans-serif;padding:20px}h1{font-size:18px;margin-bottom:4px}p{color:#666;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5;font-weight:700}</style></head><body><h1>Supplier Invoice Payment Report</h1><p>Generated: ${new Date().toLocaleString()}</p><table><thead><tr><th>Invoice #</th><th>Supplier</th><th>Invoice Date</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Payment Status</th><th>Approval</th><th>Aging</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }, [filtered]);

  const handleExportExcel = useCallback(() => {
    const header = 'Invoice #,Supplier,Supplier Code,Invoice Date,Due Date,Amount,Paid Amount,Payment Status,Approval Status,Approved By,Payment Method,Aging Days,PO Number,Department\n';
    const rows = filtered.map(r =>
      `${r.invoiceNo},${r.supplier},${r.supplierCode},${r.invoiceDate},${r.dueDate},${r.amount},${r.paidAmount},${STATUS_CFG[r.paymentStatus].label},${r.approvalStatus},${r.approvedBy},${r.paymentMethod},${r.agingDays},${r.poNumber},${r.department}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `invoice_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }, [filtered]);

  return (
    <div className="rpt-page">
      {/* Header */}
      <div className="rpt-page__header">
        <div className="rpt-page__header-left">
          <h1>Reports</h1>
          <p>Supplier Invoice Payment Report — audit approvals, overdue aging & export</p>
        </div>
        <div className="rpt-page__header-actions">
          <button className="rpt-export-btn rpt-export-btn--pdf" onClick={handleExportPDF}>
            <FileText size={15} /> Export PDF
          </button>
          <button className="rpt-export-btn rpt-export-btn--excel" onClick={handleExportExcel}>
            <FileSpreadsheet size={15} /> Export Excel
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="rpt-kpi-row">
        {[
          { icon: <DollarSign size={22} />, label: 'Total Invoiced', value: formatCurrency(kpis.totalInvoiced), cls: 'blue' },
          { icon: <CheckCircle2 size={22} />, label: 'Total Paid', value: formatCurrency(kpis.totalPaid), cls: 'green' },
          { icon: <AlertTriangle size={22} />, label: 'Total Overdue', value: formatCurrency(kpis.totalOverdue), cls: 'red' },
          { icon: <Clock size={22} />, label: 'Pending Approval', value: String(kpis.pendingApproval), cls: 'amber' },
        ].map(k => (
          <div key={k.label} className="rpt-kpi-card">
            <div className={`rpt-kpi-card__icon rpt-kpi-card__icon--${k.cls}`}>{k.icon}</div>
            <div className="rpt-kpi-card__info">
              <span className="rpt-kpi-card__value">{k.value}</span>
              <span className="rpt-kpi-card__label">{k.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Overdue Aging Breakdown */}
      <div className="rpt-aging-section">
        <div className="rpt-aging-section__header">
          <h3><Calendar size={16} /> Overdue Aging Breakdown</h3>
        </div>
        <div className="rpt-aging-grid">
          {([
            { bucket: '0-30' as AgingBucket, label: '0–30 Days', cls: 'green' },
            { bucket: '31-60' as AgingBucket, label: '31–60 Days', cls: 'amber' },
            { bucket: '61-90' as AgingBucket, label: '61–90 Days', cls: 'orange' },
            { bucket: '90+' as AgingBucket, label: '90+ Days', cls: 'red' },
          ]).map(b => (
            <div key={b.bucket} className={`rpt-aging-card rpt-aging-card--${b.cls}`}>
              <div className="rpt-aging-card__header">
                <span className="rpt-aging-card__label">{b.label}</span>
                <span className={`rpt-aging-card__count rpt-aging-card__count--${b.cls}`}>{aging[b.bucket].count}</span>
              </div>
              <span className="rpt-aging-card__amount">{formatCurrency(aging[b.bucket].amount)}</span>
              <div className="rpt-aging-card__bar">
                <div
                  className={`rpt-aging-card__bar-fill rpt-aging-card__bar-fill--${b.cls}`}
                  style={{ width: `${kpis.totalInvoiced > 0 ? (aging[b.bucket].amount / kpis.totalInvoiced) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rpt-toolbar">
        <div className="rpt-toolbar__search">
          <Search size={16} className="rpt-toolbar__search-icon" />
          <input
            type="text" placeholder="Search by invoice, supplier, PO, or department..."
            value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <div className="rpt-toolbar__filters">
          {(['all', 'paid', 'pending', 'overdue', 'rejected'] as const).map(f => (
            <button key={f} className={`rpt-filter-pill ${statusFilter === f ? 'rpt-filter-pill--active' : ''}`}
              onClick={() => { setStatusFilter(f); setCurrentPage(1); }}>
              {f === 'all' ? 'All' : STATUS_CFG[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice Table */}
      <div className="rpt-table-card">
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th>Invoice</th><th>Supplier</th><th>Invoice Date</th><th>Due Date</th>
                <th>Amount</th><th>Paid</th><th>Payment</th><th>Approval</th>
                <th>Aging</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="rpt-table__invoice-cell">
                      <span className="rpt-table__inv-no">{r.invoiceNo}</span>
                      <span className="rpt-table__po-ref">{r.poNumber}</span>
                    </div>
                  </td>
                  <td>
                    <div className="rpt-table__supplier-cell">
                      <span className="rpt-table__supplier-name">{r.supplier}</span>
                      <span className="rpt-table__supplier-code">{r.supplierCode}</span>
                    </div>
                  </td>
                  <td className="rpt-table__date">{r.invoiceDate}</td>
                  <td className="rpt-table__date">{r.dueDate}</td>
                  <td className="rpt-table__amount">{formatCurrency(r.amount)}</td>
                  <td className="rpt-table__amount">{r.paidAmount > 0 ? formatCurrency(r.paidAmount) : '—'}</td>
                  <td>
                    <span className={`rpt-status-badge rpt-status-badge--${STATUS_CFG[r.paymentStatus].cls}`}>
                      {STATUS_CFG[r.paymentStatus].label}
                    </span>
                  </td>
                  <td>
                    <span className={`rpt-approval-badge rpt-approval-badge--${r.approvalStatus}`}>
                      {r.approvalStatus === 'approved' ? <CheckCircle2 size={11} /> :
                       r.approvalStatus === 'rejected' ? <XCircle size={11} /> : <Clock size={11} />}
                      {r.approvalStatus.charAt(0).toUpperCase() + r.approvalStatus.slice(1)}
                    </span>
                  </td>
                  <td>
                    {r.paymentStatus === 'overdue' ? (
                      <span className={`rpt-aging-badge rpt-aging-badge--${r.agingBucket === '90+' ? 'critical' : r.agingBucket === '61-90' ? 'high' : r.agingBucket === '31-60' ? 'medium' : 'low'}`}>
                        {r.agingDays}d
                      </span>
                    ) : <span className="rpt-aging-badge rpt-aging-badge--none">—</span>}
                  </td>
                  <td>
                    <button className="rpt-table__action-btn" title="View Details" onClick={() => setDetailRecord(r)}>
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > perPage && (
          <div className="rpt-pagination">
            <span className="rpt-pagination__info">
              Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
            </span>
            <div className="rpt-pagination__btns">
              <button className="rpt-pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={14} /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`rpt-pagination__btn ${currentPage === p ? 'rpt-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
              ))}
              <button className="rpt-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailRecord && (
        <div className="rpt-modal-backdrop" onClick={() => setDetailRecord(null)}>
          <div className="rpt-modal" onClick={e => e.stopPropagation()}>
            <div className="rpt-modal__header">
              <div className="rpt-modal__title"><Eye size={20} /><span>Invoice Details</span></div>
              <button className="rpt-modal__close" onClick={() => setDetailRecord(null)}><X size={18} /></button>
            </div>
            <div className="rpt-modal__body">
              <div className="rpt-modal__detail-grid">
                {[
                  { l: 'Invoice #', v: detailRecord.invoiceNo }, { l: 'PO Number', v: detailRecord.poNumber },
                  { l: 'Supplier', v: detailRecord.supplier }, { l: 'Code', v: detailRecord.supplierCode },
                  { l: 'Department', v: detailRecord.department }, { l: 'Invoice Date', v: detailRecord.invoiceDate },
                  { l: 'Due Date', v: detailRecord.dueDate }, { l: 'Amount', v: formatCurrency(detailRecord.amount) },
                  { l: 'Paid', v: detailRecord.paidAmount > 0 ? formatCurrency(detailRecord.paidAmount) : '—' },
                  { l: 'Payment Method', v: detailRecord.paymentMethod },
                  { l: 'Payment Status', v: STATUS_CFG[detailRecord.paymentStatus].label },
                  { l: 'Approval Status', v: detailRecord.approvalStatus.charAt(0).toUpperCase() + detailRecord.approvalStatus.slice(1) },
                  { l: 'Approved By', v: detailRecord.approvedBy }, { l: 'Approved Date', v: detailRecord.approvedDate },
                  { l: 'Aging', v: detailRecord.agingDays > 0 ? `${detailRecord.agingDays} days (${detailRecord.agingBucket})` : 'Current' },
                ].map(i => (
                  <div key={i.l} className="rpt-modal__detail-item">
                    <span className="rpt-modal__detail-label">{i.l}</span>
                    <span className="rpt-modal__detail-value">{i.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rpt-modal__footer">
              <button className="rpt-modal__btn rpt-modal__btn--secondary" onClick={() => setDetailRecord(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
