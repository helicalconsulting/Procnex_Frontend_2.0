import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { useColumnPreferences, type ColumnDef } from '../../hooks/useColumnPreferences';
import {
  vendorPortalService,
  type VendorQuotationRow,
} from '../../services/vendorPortalService';
import type { QuotationBidSecurity } from '../../types';
import { rfqService } from '../../services/rfqService';
import { API_BASE } from '../../api/client';
import { authService } from '../../services/authService';
import {
  ClipboardList, Search, ChevronDown, CheckCircle2,
  Clock, XCircle, TrendingUp, FileSpreadsheet, Shield, FileText,
  Eye, X, Minus, Maximize2, Minimize2, ChevronUp, ArrowRightLeft,
  Download,
} from 'lucide-react';
import { downloadDocument } from '../../utils/download';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { CurrencyBadge, CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import '../../components/shared/ColumnCustomizer.css';
import '../../styles/vendor-portal.css';
import '../../styles/vendor-orders.css';
import '../../pages/rfq/RFQPage.css';
import '../../pages/quotations/QuotationsPage.css';

// ─── Types ────────────────────────────────────────────────────

type QuotStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'RETURNED';

interface VendorQuotation {
  id: number;
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    isSelected: boolean;
  }>;
  totalPrice: number;
  currency?: string;
  leadTimeDays: number;
  paymentTerms: string;
  paymentPlanSnapshot?: Array<{ title: string; percentage: number }> | null;
  customFieldValues?: Record<string, string | number>;
  status: QuotStatus;
  submittedAt: string;
  score?: number;
  bidSecurityRequired?: boolean;
  attachments?: Array<{
    id: string;
    originalName: string;
    publicUrl: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
  }>;
}

// ─── Column Definitions for Items Table ───────────────────────

const ITEMS_TABLE_COLUMNS: ColumnDef[] = [
  { key: 'status',       label: 'Status',         defaultVisible: true },
  { key: 'item',         label: 'Item',           defaultVisible: true },
  { key: 'qty',           label: 'Qty',            defaultVisible: true },
  { key: 'unitPrice',     label: 'Unit Price',     defaultVisible: true },
  { key: 'lineTotal',     label: 'Line Total',     defaultVisible: true },
  { key: 'leadTime',      label: 'Lead Time',      defaultVisible: true },
  { key: 'paymentTerms',  label: 'Payment Terms',  defaultVisible: true },
  { key: 'grandTotal',    label: 'Grand Total',    defaultVisible: true },
];

const ITEMS_COLUMN_HEADERS: Record<string, string> = {
  status: 'Status',
  item: 'Item',
  qty: 'Qty',
  unitPrice: 'Unit Price',
  lineTotal: 'Line Total',
  leadTime: 'Lead Time',
  paymentTerms: 'Payment Terms',
  grandTotal: 'Grand Total',
};

// ─── Mapping ──────────────────────────────────────────────────

function mapRow(q: VendorQuotationRow): VendorQuotation {
  const statusMap: Record<string, QuotStatus> = {
    SUBMITTED: 'PENDING',
    UNDER_REVIEW: 'PENDING',
    ACCEPTED: 'ACCEPTED',
    APPROVED: 'ACCEPTED',
    REJECTED: 'REJECTED',
    RETURNED: 'RETURNED',
    SHORTLISTED: 'PENDING',
  };
  const mappedStatus = statusMap[q.status] || 'PENDING';
  const selectedItemIds = q.selectedItemIds;
  // If quotation is ACCEPTED but selectedItemIds is null/empty (no explicit
  // selection was made by the approver), treat ALL items as selected.
  const isAccepted = mappedStatus === 'ACCEPTED';
  const selectedIds = new Set(
    selectedItemIds && selectedItemIds.length > 0
      ? selectedItemIds
      : isAccepted
        ? q.items.map(i => i.id)  // auto-select all for accepted quotations
        : []
  );
  return {
    id: q.id,
    rfqId: q.rfqId,
    rfqNumber: q.rfq.rfqNumber,
    rfqTitle: q.rfq.title,
    items: q.items.map((i) => ({
      id: i.id,
      name: i.itemName,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      isSelected: selectedIds.has(i.id),
    })),
    totalPrice: q.totalPrice,
    currency: q.currency,
    leadTimeDays: q.leadTimeDays ?? 0,
    paymentTerms: q.paymentTerms || '—',
    paymentPlanSnapshot: q.paymentPlanSnapshot ?? null,
    customFieldValues: q.customFieldValues ?? undefined,
    status: statusMap[q.status] || 'PENDING',
    submittedAt: q.submittedAt.slice(0, 10),
    score: q.score ?? undefined,
    bidSecurityRequired: (q.rfq as Record<string, unknown>).bidSecurityRequired === true,
    attachments: q.attachments?.map((a) => ({
      id: a.id,
      originalName: a.originalName,
      publicUrl: a.publicUrl,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      uploadedAt: a.uploadedAt,
    })) || [],
  };
}

// ─── Status helpers ───────────────────────────────────────────

const STATUS_CONFIG: Record<QuotStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending Review', cls: 'pending', icon: <Clock size={13} /> },
  ACCEPTED: { label: 'Accepted', cls: 'accepted', icon: <CheckCircle2 size={13} /> },
  REJECTED: { label: 'Rejected', cls: 'rejected', icon: <XCircle size={13} /> },
  RETURNED: { label: 'Returned', cls: 'progress', icon: <Clock size={13} /> },
};

// ─── Component ────────────────────────────────────────────────

export default function VendorQuotationsPage() {
  useAuth();
  const { data: quotations, loading, error, reload } = useServiceData(
    () => vendorPortalService.listQuotations().then((list) => list.map(mapRow)),
    [] as VendorQuotation[]
  );

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<QuotStatus | null>(null);
  const [expandedQuot, setExpandedQuot] = useState<number | null>(null);

  // ── View Quotation Modal state ──────────────────────────
  const [viewQuot, setViewQuot] = useState<VendorQuotation | null>(null);
  const [viewModalState, setViewModalState] = useState<'open' | 'expanded' | 'minimized'>('open');
  const [viewRfqData, setViewRfqData] = useState<Record<string, unknown> | null>(null);

  // ── Bid Security Docs ───────────────────────────────────
  const [bidSecurityDocs, setBidSecurityDocs] = useState<Record<string, QuotationBidSecurity | null>>({});
  const [bidSecurityLoading, setBidSecurityLoading] = useState(false);

  // Fetch bid security documents for all quotations
  useEffect(() => {
    if (quotations.length === 0) {
      setBidSecurityLoading(false);
      return;
    }
    setBidSecurityLoading(true);
    const fetchDocs = async () => {
      const results: Record<string, QuotationBidSecurity | null> = {};
      await Promise.all(
        quotations.map(async (q) => {
          try {
            const doc = await vendorPortalService.getBidSecurity(String(q.id));
            results[String(q.id)] = doc;
          } catch {
            results[String(q.id)] = null;
          }
        })
      );
      setBidSecurityDocs(prev => ({ ...prev, ...results }));
      setBidSecurityLoading(false);
    };
    fetchDocs();
  }, [quotations]);

  // ── Column preferences for items table ──
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const [showColPanel, setShowColPanel] = useState(false);
  const {
    columnOrder,
    visibleKeys,
    visibleColumns,
    handleToggle,
    handleReorder,
    handleReset,
  } = useColumnPreferences('quotation-items', ITEMS_TABLE_COLUMNS);

  const summary = useMemo(() => {
    const total = quotations.length;
    const accepted = quotations.filter((q) => q.status === 'ACCEPTED').length;
    return {
      total,
      accepted,
      pending: quotations.filter((q) => q.status === 'PENDING').length,
      rejected: quotations.filter((q) => q.status === 'REJECTED').length,
      winRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
    };
  }, [quotations]);

  const filtered = useMemo(() => {
    let list = quotations;
    if (kpiFilter) list = list.filter((q) => q.status === kpiFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (q) => q.rfqNumber.toLowerCase().includes(s) || q.rfqTitle.toLowerCase().includes(s)
      );
    }
    return list;
  }, [quotations, kpiFilter, search]);

  const { formatAmount, convert, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState<string>(companyDefaultCurrency);

  const defCur = companyDefaultCurrency;
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // Determine which items-table columns are visible (grandTotal is footer-only)
  const visibleDataCols = useMemo(
    () => visibleColumns.filter((k) => k !== 'grandTotal'),
    [visibleColumns]
  );
  const showGrandTotal = visibleColumns.includes('grandTotal');
  const dataColCount = visibleDataCols.length;

  // ── Render a single items-table cell ──
  const renderTableCell = (
    key: string,
    item: VendorQuotation['items'][0],
    quot: VendorQuotation,
  ) => {
    switch (key) {
      case 'status':
        return (
          <td key={key} className="vo-items-table__status">
            {item.isSelected ? (
              <span className="vo-item-status vo-item-status--selected" title="Selected">
                <CheckCircle2 size={14} /> Selected
              </span>
            ) : (
              <span className="vo-item-status vo-item-status--not-selected" title="Not Selected">
                <XCircle size={14} /> Not Selected
              </span>
            )}
          </td>
        );
      case 'item':
        return <td key={key} className="vo-items-table__name"><span className="vo-item-name-text">{item.name}</span></td>;
      case 'qty':
        return (
          <td key={key}>
            {item.quantity} {item.unit}
          </td>
        );
      case 'unitPrice': {
        const convertedUP = convert(item.unitPrice, quot.currency || defCur, displayCurrency);
        return <td key={key}>{formatAmount(convertedUP, displayCurrency)}</td>;
      }
      case 'lineTotal': {
        const convertedLT = convert(item.quantity * item.unitPrice, quot.currency || defCur, displayCurrency);
        return (
          <td key={key} className="vo-items-table__total">
            {formatAmount(convertedLT, displayCurrency)}
          </td>
        );
      }
      case 'leadTime':
        return <td key={key}>{quot.leadTimeDays}d</td>;
      case 'paymentTerms':
        return <td key={key}>{quot.paymentTerms}</td>;
      default:
        return <td key={key} />;
    }
  };

  // ── Open view quotation modal ────────────────────────────
  const openViewQuot = useCallback(async (quot: VendorQuotation) => {
    setViewQuot(quot);
    setViewModalState('open');
    try {
      const rfqData = await rfqService.getById(quot.rfqId);
      setViewRfqData(rfqData as Record<string, unknown>);
    } catch {
      setViewRfqData(null);
    }
  }, []);

  // ── Download Excel button handler ──
  const [downloadingExcel, setDownloadingExcel] = useState<number | null>(null);
  const downloadQuotationExcel = async (quotationId: number) => {
    setDownloadingExcel(quotationId);
    try {
      const token = authService.getToken();
      const res = await fetch(`${API_BASE}/vendors/quotations/${quotationId}/excel`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Quotation_Items_${quotationId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download Excel:', err);
    } finally {
      setDownloadingExcel(null);
    }
  };

  return (
    <div className="vendor-portal">
      <div className="vendor-portal__container">
        {error && (
          <MessageStrip type="error">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {error}
              <button type="button" className="vendor-btn vendor-btn--secondary" onClick={() => reload()}>
                Retry
              </button>
            </span>
          </MessageStrip>
        )}
        {loading && <div className="vendor-portal__loading">Loading your quotation history…</div>}

        <div className="vendor-header">
          <div className="vendor-header__content">
            <h1>My Quotations</h1>
            <p>Full history of quotations you have submitted — amounts, line items, and review status</p>
          </div>
          <div className="vendor-header__actions">
            <CurrencySelector
              value={displayCurrency}
              onChange={setDisplayCurrency}
              size="sm"
            />
          </div>
        </div>

        {/* ── KPI Tiles ── */}
        <div className="vd-tiles">
          {[
            { key: null, label: 'Submitted', value: summary.total, foot: 'Total quotations', icon: <ClipboardList size={16} />, iconCls: 'blue' },
            { key: 'ACCEPTED' as QuotStatus, label: 'Accepted', value: summary.accepted, foot: 'Approved by buyer', icon: <CheckCircle2 size={16} />, iconCls: 'green' },
            { key: 'PENDING' as QuotStatus, label: 'Under Review', value: summary.pending, foot: 'Awaiting decision', icon: <Clock size={16} />, iconCls: 'orange' },
            { key: 'REJECTED' as QuotStatus, label: 'Rejected', value: summary.rejected, foot: summary.rejected > 0 ? 'Not selected' : 'None rejected', icon: <XCircle size={16} />, iconCls: 'red' },
          ].map((tile) => (
            <button
              key={tile.label}
              type="button"
              className={`vd-tile ${kpiFilter === tile.key ? 'vd-tile--active' : ''}`}
              onClick={() => setKpiFilter(kpiFilter === tile.key ? null : tile.key)}
            >
              <div className="vd-tile__head">
                <span className="vd-tile__label">{tile.label}</span>
                <span className={`vd-tile__icon vd-tile__icon--${tile.iconCls}`}>{tile.icon}</span>
              </div>
              <span className="vd-tile__value">{tile.value}</span>
              <span className="vd-tile__foot">{tile.foot}</span>
            </button>
          ))}
        </div>

        <div className="vo-toolbar">
          <div className="vo-toolbar__search">
            <Search size={16} className="vo-toolbar__search-icon" />
            <input
              type="text"
              placeholder="Search by RFQ number or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="vo-orders">
            {filtered.map((quot) => {
              const isExpanded = expandedQuot === quot.id;
              const cfg = STATUS_CONFIG[quot.status];

              // Compute total of selected items only
              const selectedTotal = quot.items
                .filter(i => i.isSelected)
                .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
              const selectedCount = quot.items.filter(i => i.isSelected).length;
              const allSelected = selectedCount === quot.items.length;

              return (
                <div key={quot.id} className={`vrfq-card ${isExpanded ? 'vrfq-card--expanded' : ''}`}>
                  <div
                    className="vrfq-card__header"
                    onClick={() => setExpandedQuot(isExpanded ? null : quot.id)}
                  >
                    <div className="vrfq-card__left">
                      <div className="vrfq-card__number">
                        <ClipboardList size={16} style={{ color: 'var(--vendor-primary)' }} />
                        <span className="vrfq-card__rfq-id">{quot.rfqNumber}</span>
                        <span className={`vendor-badge vendor-badge--${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>
                      <span className="vrfq-card__title">
                        {quot.rfqTitle} · {quot.items.length} line items · submitted {fmtDate(quot.submittedAt)}
                      </span>
                    </div>
                    <div className="vrfq-card__right">
                      {/* Eye view button */}
                      <button
                        type="button"
                        className="vrfq-card__eye-btn"
                        onClick={(e) => { e.stopPropagation(); openViewQuot(quot); }}
                        title="View full quotation details"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--vendor-primary)', padding: '4px 6px',
                          display: 'inline-flex', alignItems: 'center',
                          borderRadius: 4, transition: 'background 0.15s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(10,110,209,0.08)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Eye size={15} />
                      </button>



                      {/* Bid Bond indicator in collapsed header */}
                      {quot.bidSecurityRequired && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 10, fontWeight: 700, color: '#107e3e',
                          background: 'rgba(16,126,62,0.08)',
                          padding: '2px 6px', borderRadius: 3,
                          whiteSpace: 'nowrap',
                        }}>
                          <Shield size={10} />
                          Bond
                        </span>
                      )}
                      <span style={{ fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {formatAmount(convert(selectedTotal, quot.currency || defCur, displayCurrency), displayCurrency)}
                        {!allSelected && selectedCount > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--vendor-text-muted, #6a6d70)' }}>
                            ({selectedCount}/{quot.items.length} items)
                          </span>
                        )}
                        <CurrencyBadge currency={displayCurrency} size="sm" />
                      </span>
                      <ChevronDown
                        size={18}
                        className={`vrfq-card__chevron ${isExpanded ? 'vrfq-card__chevron--open' : ''}`}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="vrfq-card__body">
                      {/* Items table — Status column is ALWAYS visible (hardcoded) */}
                      <div className="vrfq-items-table-wrap">
                        <div className="vrfq-items-table__toolbar">
                          {quot.status === 'ACCEPTED' && (
                            <button
                              type="button"
                              className="vrfq-excel-btn"
                              onClick={(e) => { e.stopPropagation(); downloadQuotationExcel(quot.id); }}
                              disabled={downloadingExcel === quot.id}
                              title="Download items Excel with selection status"
                            >
                              {downloadingExcel === quot.id ? (
                                <>
                                  <span className="vrfq-excel-btn__spinner" />
                                  Downloading…
                                </>
                              ) : (
                                <>
                                  <FileSpreadsheet size={15} />
                                  Download Excel
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <table className="vo-items-table">
                          <thead>
                            <tr>
                              <th>Status</th>
                              {visibleDataCols.map((key) => (
                                <th key={key}>{ITEMS_COLUMN_HEADERS[key]}</th>
                              ))}
                              {dataColCount > 0 && (
                                <th className="vo-items-table__actions-th">
                                  <div className="col-btn-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
                                    <button
                                      ref={colBtnRef}
                                      className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); setShowColPanel(v => !v); }}
                                      title="Customize table columns"
                                      aria-label="Customize table columns"
                                      aria-expanded={showColPanel}
                                    >
                                      <span /><span /><span />
                                    </button>
                                    {showColPanel && (
                                      <ColumnCustomizer
                                        columnOrder={columnOrder}
                                        visibleKeys={visibleKeys}
                                        allColumns={ITEMS_TABLE_COLUMNS}
                                        onToggle={handleToggle}
                                        onReorder={handleReorder}
                                        onReset={handleReset}
                                        onClose={() => setShowColPanel(false)}
                                        anchorRef={colBtnRef}
                                      />
                                    )}
                                  </div>
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {quot.items.map((item, idx) => (
                              <tr key={idx}>
                                {renderTableCell('status', item, quot)}
                                {visibleDataCols.map((key) => renderTableCell(key, item, quot))}
                                {dataColCount > 0 && <td className="vo-items-table__actions-td" />}
                              </tr>
                            ))}
                          </tbody>
                          {showGrandTotal && dataColCount > 0 && (
                            <tfoot>
                              <tr>
                                <td
                                  colSpan={dataColCount}
                                  className="vo-items-table__grand-label"
                                >
                                  {allSelected ? 'Total' : 'Selected items total'}
                                </td>
                                <td className="vo-items-table__grand-total">
                                  {formatAmount(convert(selectedTotal, quot.currency || defCur, displayCurrency), displayCurrency)}
                                  {!allSelected && (
                                    <span className="vo-items-table__grand-sub">
                                      {' '}of {formatAmount(convert(quot.totalPrice, quot.currency || defCur, displayCurrency), displayCurrency)}
                                    </span>
                                  )}
                                </td>
                                <td className="vo-items-table__actions-td" />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>

                      {/* ── Bid Bond Document ── */}
                      {quot.bidSecurityRequired && (
                        <div style={{
                          marginTop: 16, padding: '10px 14px',
                          background: 'rgba(10,110,209,0.04)',
                          border: '1px solid rgba(10,110,209,0.12)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <Shield size={16} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                              Bid Bond Document
                            </div>
                            {bidSecurityLoading ? (
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Loading…</span>
                            ) : bidSecurityDocs[String(quot.id)] ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <FileText size={12} style={{ color: '#0070c0', flexShrink: 0 }} />
                                <a
                                  href={bidSecurityDocs[String(quot.id)]!.publicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: 12, color: 'var(--vendor-primary)',
                                    fontWeight: 600, textDecoration: 'none',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap', maxWidth: 250, flex: 1,
                                  }}
                                >
                                  {bidSecurityDocs[String(quot.id)]!.originalName}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => downloadDocument(bidSecurityDocs[String(quot.id)]!.publicUrl, bidSecurityDocs[String(quot.id)]!.originalName)}
                                  title="Download"
                                  aria-label="Download bid bond document"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vendor-primary)', padding: '2px', display: 'inline-flex', alignItems: 'center', borderRadius: 3 }}
                                >
                                  <Download size={12} />
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                Not provided
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          !loading && (
            <div className="vendor-empty-state">
              <div className="vendor-empty-state__icon">📄</div>
              <div className="vendor-empty-state__title">No quotations yet</div>
              <div className="vendor-empty-state__text">
                Submit a quotation from <strong>My RFQs</strong> — it will appear here with full pricing history.
              </div>
            </div>
          )
        )}

      </div>

      {/* ── View Quotation Modal (same layout as admin side, no Evaluation) ── */}
      {viewQuot && (
        <ViewVendorQuotationModal
          quotation={viewQuot}
          rfqData={viewRfqData}
          bidSecurityDoc={bidSecurityDocs[String(viewQuot.id)] || null}
          onClose={() => setViewQuot(null)}
          attachments={viewQuot.attachments || []}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Vendor View Quotation Modal — mirrors admin ViewQuotationModal
// Tabs: Vendor Details / Items / Documents (no Evaluation)
// ═══════════════════════════════════════════════════════════════

type VendorViewTab = 'vendor' | 'items' | 'paymentTerms' | 'authorization' | 'documents';

// ─── File type helpers ───────────────────────────────────────

const FILE_ICON_MAP: Record<string, { icon: string; color: string }> = {
  pdf: { icon: '📄', color: '#e74c3c' },
  doc: { icon: '📝', color: '#2b5797' },
  docx: { icon: '📝', color: '#2b5797' },
  xls: { icon: '📊', color: '#217346' },
  xlsx: { icon: '📊', color: '#217346' },
  csv: { icon: '📊', color: '#217346' },
  jpg: { icon: '🖼️', color: '#e67e22' },
  jpeg: { icon: '🖼️', color: '#e67e22' },
  png: { icon: '🖼️', color: '#e67e22' },
  gif: { icon: '🖼️', color: '#e67e22' },
  webp: { icon: '🖼️', color: '#e67e22' },
  txt: { icon: '📄', color: '#6a6d70' },
};

function getFileIcon(fileName: string): { icon: string; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return FILE_ICON_MAP[ext] || { icon: '📎', color: '#6a6d70' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ViewVendorQuotationModal({
  quotation: q,
  rfqData,
  bidSecurityDoc: initialBidSecurityDoc,
  attachments,
  onClose,
}: {
  quotation: VendorQuotation;
  rfqData: Record<string, unknown> | null;
  bidSecurityDoc: QuotationBidSecurity | null;
  attachments: VendorQuotation['attachments'];
  onClose: () => void;
}) {
  const [modalState, setModalState] = useState<'open' | 'expanded' | 'minimized'>('open');
  const [activeTab, setActiveTab] = useState<VendorViewTab>('vendor');
  const [bidSecurityDoc, setBidSecurityDoc] = useState<QuotationBidSecurity | null>(initialBidSecurityDoc);
  const { formatAmount, convert, companyDefaultCurrency } = useCurrency();
  const defCur = q.currency || companyDefaultCurrency || 'KES';

  useEffect(() => {
    setBidSecurityDoc(initialBidSecurityDoc);
  }, [initialBidSecurityDoc]);

  useEffect(() => {
    if (bidSecurityDoc) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await vendorPortalService.getBidSecurity(String(q.id));
        if (!cancelled && doc) setBidSecurityDoc(doc);
      } catch {
        // Ignored
      }
    })();
    return () => { cancelled = true; };
  }, [q.id, bidSecurityDoc]);

  const isOpen = modalState === 'open';
  const isExpanded = modalState === 'expanded';
  const isMinimized = modalState === 'minimized';

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const tabs: { key: VendorViewTab; label: string; icon: string }[] = [
    { key: 'vendor', label: 'Vendor Details', icon: '🏢' },
    { key: 'paymentTerms', label: 'Payment Terms', icon: '📄' },
    { key: 'authorization', label: bidSecurityDoc ? 'Authorization' : 'Authorization', icon: '🔒' },
    { key: 'items', label: `Items (${q.items.length})`, icon: '📋' },
    { key: 'documents', label: 'Documents', icon: '📎' },
  ];

  return (
    <>
      {(isOpen || isExpanded) && (
        <div className="rfq-modal-backdrop" onClick={onClose} />
      )}

      <div
        className={[
          'rfq-modal',
          isOpen ? 'rfq-modal--open' : '',
          isExpanded ? 'rfq-modal--expanded' : '',
          isMinimized ? 'rfq-modal--minimized' : '',
        ].filter(Boolean).join(' ')}
        onClick={e => e.stopPropagation()}
      >
        <div className="rfq-modal__drag-handle" />

        {/* Header with Window Controls */}
        <div
          className="rfq-modal__header"
          onClick={isMinimized ? () => setModalState('open') : undefined}
          style={isMinimized ? { cursor: 'pointer' } : undefined}
        >
          <div className="rfq-modal__header-left">
            <span className="rfq-modal__rfq-num">Quotation</span>
            {!isMinimized && (
              <span className="dash-kpi-modal__header-title">{q.rfqTitle}</span>
            )}
            {isMinimized && (
              <span className="rfq-modal__minimized-title">{q.rfqTitle}</span>
            )}
          </div>
          <div className="rfq-modal__window-controls" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="rfq-modal__wc-btn"
              title={isMinimized ? 'Restore' : 'Minimize'}
              onClick={() => setModalState(isMinimized ? 'open' : 'minimized')}
            >
              {isMinimized ? <ChevronUp size={14} /> : <Minus size={14} />}
            </button>
            {!isMinimized && (
              <button
                type="button"
                className="rfq-modal__wc-btn"
                title={isExpanded ? 'Restore' : 'Expand'}
                onClick={() => setModalState(isExpanded ? 'open' : 'expanded')}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            <div className="rfq-modal__wc-divider" />
            <button
              type="button"
              className="rfq-modal__wc-btn rfq-modal__wc-btn--close"
              title="Close"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Tabs */}
            <div className="rfq-modal__tabs">
              {tabs.map(t => (
                <button
                  key={t.key}
                  className={`rfq-modal__tab ${activeTab === t.key ? 'rfq-modal__tab--active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  <span style={{ fontSize: 15, marginRight: 4 }}>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div className="rfq-modal__body">
              {/* ── Tab 1: Vendor Details ── */}
              {activeTab === 'vendor' && (
                <div className="rfq-modal__info-panel">
                  <div className="rfq-modal__info-grid quot-view-modal__info-grid">
                    {[
                      { label: 'RFQ Number', value: q.rfqNumber },
                      { label: 'RFQ Title', value: q.rfqTitle || '—' },
                      { label: 'Description', value: (rfqData?.description as string) || '—', fullWidth: true },
                      { label: 'Lead Time', value: `${q.leadTimeDays} days` },
                      { label: 'Submitted', value: fmtDate(q.submittedAt) },
                      { label: 'Status', value: STATUS_CONFIG[q.status]?.label || q.status },
                    ].map(row => (
                      <div
                        key={row.label}
                        className="rfq-modal__info-item"
                        style={row.fullWidth ? { gridColumn: '1 / -1' } : undefined}
                      >
                        <span className="rfq-modal__info-label">{row.label}</span>
                        <span className="rfq-modal__info-value">{row.value}</span>
                      </div>
                    ))}
                    {/* Submitted Currency */}
                    <div className="rfq-modal__info-item">
                      <span className="rfq-modal__info-label">Submitted in</span>
                      <span className="rfq-modal__info-value">
                        <CurrencyBadge currency={defCur} size="sm" />
                      </span>
                    </div>
                    {/* Total Price */}
                    <div className="rfq-modal__info-item quot-view-modal__info-item--highlight">
                      <span className="rfq-modal__info-label">Total Price</span>
                      <span className="rfq-modal__info-value">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {formatAmount(q.totalPrice, defCur)}
                          <CurrencyBadge currency={defCur} size="sm" />
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* ── Custom Field Values Section ── */}
                  {(() => {
                    const rfqDataCustomFields = (rfqData as any)?.customFields;
                    const customFields = Array.isArray(rfqDataCustomFields) ? rfqDataCustomFields : [];
                    const cfValues = q.customFieldValues || {};
                    const hasCustomFields = customFields.length > 0;
                    const hasCfValues = typeof cfValues === 'object' && !Array.isArray(cfValues) && Object.keys(cfValues).length > 0;

                    if (!hasCustomFields || !hasCfValues) return null;

                    return (
                      <div className="quot-view-modal__custom-section">
                        <div className="quot-view-modal__custom-section-header">
                          <span className="quot-view-modal__custom-badge--simple">
                            <span style={{ fontSize: 10, fontWeight: 700 }}>A</span>
                          </span>
                          <span>Additional Information</span>
                        </div>
                        <div className="rfq-modal__info-grid quot-view-modal__info-grid">
                          {customFields.filter((cf: any) => cf.active !== false).map((cf: any) => {
                            const val = cfValues[cf.id];
                            if (val == null || val === '') return null;
                            return (
                              <div key={cf.id} className="rfq-modal__info-item">
                                <span className="rfq-modal__info-label">{cf.fieldName}</span>
                                <span className="rfq-modal__info-value">{String(val)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                </div>
              )}

              {/* ── Tab 2: Payment Terms ── */}
              {activeTab === 'paymentTerms' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 14 }}>
                    <span>📄</span>
                    <span>Payment Terms</span>
                  </div>
                  {q.paymentTerms && q.paymentTerms !== '—' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Payment Term Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <FileText size={16} style={{ color: 'var(--primary-500)' }} />
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{q.paymentTerms}</span>
                      </div>

                      {/* Milestone Details */}
                      {q.paymentPlanSnapshot && q.paymentPlanSnapshot.length > 0 && (
                        <div style={{ padding: '14px 16px', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 80px',
                            gap: 8,
                            padding: '6px 0',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            borderBottom: '1px solid var(--border)',
                            marginBottom: 4,
                          }}>
                            <span>Milestone</span>
                            <span style={{ textAlign: 'right' }}>Allocation</span>
                          </div>
                          {q.paymentPlanSnapshot.map((m, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 80px',
                                gap: 8,
                                padding: '8px 0',
                                borderBottom: idx < q.paymentPlanSnapshot!.length - 1
                                  ? '1px solid var(--border)'
                                  : 'none',
                              }}
                            >
                              <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                                {m.title}
                              </span>
                              <span style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                textAlign: 'right',
                              }}>
                                {m.percentage}%
                              </span>
                            </div>
                          ))}
                          {/* Total */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 0 0',
                            borderTop: '2px solid var(--border)',
                            marginTop: 4,
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total</span>
                            <span style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: '#107e3e',
                            }}>
                              {q.paymentPlanSnapshot.reduce((sum, m) => sum + m.percentage, 0).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="quot-view-modal__empty">
                      No payment terms provided with this quotation.
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 3: Authorization Documents ── */}
              {activeTab === 'authorization' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 14 }}>
                    <span>🔒</span>
                    <span>Authorization Documents</span>
                  </div>

                  {q.bidSecurityRequired && (
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <Shield size={16} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Bid Security Required</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          <span>Type: Bid Bond</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {bidSecurityDoc ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(16,126,62,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Shield size={16} style={{ color: 'var(--success-500)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Bid Security</strong>
                            <span className={`rfq-badge rfq-badge--${bidSecurityDoc.status === 'VERIFIED' ? 'CLOSED' : bidSecurityDoc.status === 'REJECTED' ? 'CANCELLED' : 'SENT'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                              {bidSecurityDoc.status}
                            </span>
                          </div>
                          {bidSecurityDoc.bidSecurityValueType && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span><strong>Type:</strong> {bidSecurityDoc.bidSecurityValueType === 'FIXED_AMOUNT' ? 'Fixed Amount' : 'Percentage'}</span>
                              {bidSecurityDoc.bidSecurityValue != null && (
                                <span><strong>Value:</strong>{' '}
                                  {bidSecurityDoc.bidSecurityValueType === 'PERCENTAGE'
                                    ? `${Number(bidSecurityDoc.bidSecurityValue)}% of Bid Value`
                                    : `${bidSecurityDoc.bidSecurityCurrency || 'KES'} ${Number(bidSecurityDoc.bidSecurityValue).toLocaleString('en-IN')}`}
                                </span>
                              )}
                              {bidSecurityDoc.bidSecurityValidityValue != null && (
                                <span><strong>Validity:</strong> {bidSecurityDoc.bidSecurityValidityValue} {bidSecurityDoc.bidSecurityValidityUnit === 'DAYS' ? 'Days' : ''}</span>
                              )}
                              {/* Bond Details (from Bid Security section) */}
                              {bidSecurityDoc.bondNumber && <span><strong>Bond #:</strong> {bidSecurityDoc.bondNumber}</span>}
                              {bidSecurityDoc.issuer && <span><strong>Issuer:</strong> {bidSecurityDoc.issuer}</span>}
                            </div>
                          )}
                          {bidSecurityDoc.publicUrl && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <a
                                href={bidSecurityDoc.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-500)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                              >
                                <FileText size={13} />
                                {bidSecurityDoc.originalName || 'Document'} ↗
                              </a>
                              <button
                                type="button"
                                onClick={() => downloadDocument(bidSecurityDoc.publicUrl, bidSecurityDoc.originalName || 'Document')}
                                title="Download document"
                                aria-label="Download document"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', borderRadius: 4, transition: 'background 0.15s' }}
                                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,110,209,0.08)'; }}
                                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <Download size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {(bidSecurityDoc.bondNumber || bidSecurityDoc.issuer || bidSecurityDoc.publicUrl || bidSecurityDoc.bidBondValidityValue != null) && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            background: 'rgba(16,126,62,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Shield size={16} style={{ color: 'var(--success-500)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Bid Bond</strong>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              {bidSecurityDoc.bondNumber && <span><strong>Bond #:</strong> {bidSecurityDoc.bondNumber}</span>}
                              {bidSecurityDoc.issuer && <span><strong>Issuer:</strong> {bidSecurityDoc.issuer}</span>}
                              {bidSecurityDoc.bondAmount != null && (
                                <span><strong>Amount:</strong> {formatAmount(bidSecurityDoc.bondAmount, bidSecurityDoc.bondCurrency || 'KES')}</span>
                              )}
                              {bidSecurityDoc.issueDate && (
                                <span><strong>Issue Date:</strong> {new Date(bidSecurityDoc.issueDate).toLocaleDateString('en-IN')}</span>
                              )}
                              {bidSecurityDoc.expiryDate && (
                                <span><strong>Expiry:</strong> {new Date(bidSecurityDoc.expiryDate).toLocaleDateString('en-IN')}</span>
                              )}
                              {bidSecurityDoc.bidBondValidityValue != null && (
                                <span><strong>Bond Validity:</strong> {bidSecurityDoc.bidBondValidityValue} {bidSecurityDoc.bidBondValidityUnit === 'DAYS' ? 'Days' : bidSecurityDoc.bidBondValidityUnit || ''}</span>
                              )}
                            </div>
                            {bidSecurityDoc.publicUrl && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                <a
                                  href={bidSecurityDoc.publicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-500)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                                >
                                  <FileText size={13} />
                                  {bidSecurityDoc.originalName || 'Bid Bond Document'} ↗
                                </a>
                                <button
                                  type="button"
                                  onClick={() => downloadDocument(bidSecurityDoc.publicUrl, (bidSecurityDoc.originalName || 'Bid_Bond_Document'))}
                                  title="Download document"
                                  aria-label="Download document"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', borderRadius: 4, transition: 'background 0.15s' }}
                                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,110,209,0.08)'; }}
                                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                  <Download size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {bidSecurityDoc.status === 'REJECTED' && bidSecurityDoc.rejectionReason && (
                        <div style={{ padding: '8px 12px', background: 'rgba(187,0,0,0.06)', border: '1px solid rgba(187,0,0,0.15)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#bb0000' }}>
                          <strong>Rejection Reason:</strong> {bidSecurityDoc.rejectionReason}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="quot-view-modal__empty">No authorization documents submitted for this quotation.</div>
                  )}
                </div>
              )}

              {/* ── Tab 4: Items ── */}
              {activeTab === 'items' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 14 }}>
                    <span>📋</span>
                    <span>Quotation Items</span>
                    <CurrencyBadge currency={defCur} size="sm" />
                  </div>

                  <div className="quot-view-modal__items">
                    <div className="quot-view-modal__items-header">
                      <span className="quot-view-modal__items-col--sel">Status</span>
                      <span className="quot-view-modal__items-col--name">Item Name</span>
                      <span className="quot-view-modal__items-col--qty">Qty</span>
                      <span className="quot-view-modal__items-col--price">Unit Price</span>
                      <span className="quot-view-modal__items-col--total">Total</span>
                    </div>
                    {q.items.map((item, idx) => {
                      const lineTotal = item.quantity * item.unitPrice;
                      return (
                        <div
                          key={idx}
                          className={`quot-view-modal__item-row ${item.isSelected ? 'quot-view-modal__item-row--selected' : 'quot-view-modal__item-row--deselected'}`}
                        >
                          <span className="quot-view-modal__items-col--sel">
                            {item.isSelected ? (
                              <CheckCircle2 size={18} style={{ color: '#107e3e' }} />
                            ) : (
                              <XCircle size={18} style={{ color: '#bb0000' }} />
                            )}
                          </span>
                          <span className="quot-view-modal__items-col--name">
                            <span className="quot-view-modal__item-name">{item.name}</span>
                            <span className="quot-view-modal__item-unit">{item.unit}</span>
                          </span>
                          <span className="quot-view-modal__items-col--qty">{item.quantity}</span>
                          <span className="quot-view-modal__items-col--price">
                            {formatAmount(convert(item.unitPrice, q.currency || defCur, defCur), defCur)}
                          </span>
                          <span className="quot-view-modal__items-col--total">
                            {formatAmount(convert(lineTotal, q.currency || defCur, defCur), defCur)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="quot-view-modal__items-summary">
                      <span className="quot-view-modal__items-summary-label">
                        {q.items.filter(i => i.isSelected).length} of {q.items.length} items selected
                      </span>
                      <span className="quot-view-modal__items-summary-total">
                        Total: {formatAmount(convert(
                          q.items.filter(i => i.isSelected).reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
                          q.currency || defCur,
                          defCur
                        ), defCur)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 5: Documents (Attachments) ── */}
              {activeTab === 'documents' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 14 }}>
                    <span>📎</span>
                    <span>Attachments</span>
                    {attachments && attachments.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 4 }}>
                        — {attachments.length} file(s)
                      </span>
                    )}
                  </div>

                  {attachments && attachments.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {attachments.map((att, idx) => {
                        const fileIcon = getFileIcon(att.originalName);
                        return (
                          <div
                            key={att.id || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 14px',
                              background: 'var(--surface-card)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              textDecoration: 'none',
                              cursor: 'default',
                            }}
                          >
                            <a
                              href={att.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                flex: 1,
                                textDecoration: 'none',
                                color: 'inherit',
                              }}
                            >
                              <span style={{ fontSize: 22, lineHeight: 1 }}>{fileIcon.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {att.originalName}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {formatFileSize(att.fileSize)}
                                  </span>
                                  {att.uploadedAt && (
                                    <>
                                      <span style={{ fontSize: 10, color: 'var(--text-placeholder)' }}>•</span>
                                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                        {new Date(att.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--primary-500)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                                flexShrink: 0,
                              }}>
                                Open ↗
                              </span>
                            </a>
                            <button
                              type="button"
                              onClick={() => downloadDocument(att.publicUrl, att.originalName)}
                              title="Download document"
                              aria-label="Download document"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)', padding: '6px', display: 'inline-flex', alignItems: 'center', borderRadius: 4, transition: 'background 0.15s', flexShrink: 0 }}
                              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,110,209,0.08)'; }}
                              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              <Download size={15} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="quot-view-modal__empty">
                      No attachments uploaded with this quotation.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </>
  );
}
