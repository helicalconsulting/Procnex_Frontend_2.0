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
  Clock, XCircle, FileSpreadsheet, Shield, FileText,
  Eye, Download, Tag, RotateCcw, AlertTriangle,
  Minus, Maximize2, Minimize2, ChevronUp, X,
  Building, Paperclip, ExternalLink,
} from 'lucide-react';
import { downloadDocument } from '../../utils/download';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { CurrencyBadge, CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import '../../components/shared/ColumnCustomizer.css';
import '../../styles/vendor-portal.css';
import '../../styles/vendor-orders.css';
import '../../pages/rfq/RFQPage.css';
import '../../pages/quotations/QuotationsPage.css';

// ─── Types ────────────────────────────────────────────────────

type QuotStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'RETURNED';

interface VendorQuotation {
  id: number | string;
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  versionNumber?: number;
  qNo?: string;
  vendorQuotationNumber?: string;
  returnReason?: string | null;
  items: Array<{
    id: number | string;
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
    versionNumber: q.versionNumber,
    qNo: q.qNo,
    vendorQuotationNumber: q.vendorQuotationNumber,
    returnReason: q.returnReason,
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

const STATUS_CONFIG: Record<QuotStatus, { label: string; tone: 'warning' | 'success' | 'neutral' | 'danger'; icon: React.ReactNode }> = {
  PENDING: { label: 'Under Review', tone: 'warning', icon: <Clock size={13} /> },
  ACCEPTED: { label: 'Accepted', tone: 'success', icon: <CheckCircle2 size={13} /> },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: <XCircle size={13} /> },
  RETURNED: { label: 'Returned', tone: 'danger', icon: <RotateCcw size={13} /> },
};

function StatusBadge({ status }: { status: QuotStatus | string }) {
  const cfg = STATUS_CONFIG[status as QuotStatus] || { label: status, tone: 'neutral', icon: null };
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
      cfg.tone === 'success' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      cfg.tone === 'warning' && "bg-amber-500/10 text-amber-600 border-amber-500/20",
      cfg.tone === 'danger' && "bg-rose-500/10 text-rose-600 border-rose-500/20",
      cfg.tone === 'neutral' && "bg-muted text-muted-foreground border-border"
    )}>
      {cfg.icon}
      <span>{cfg.label}</span>
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function VendorQuotationsPage() {
  useAuth();
  const { data: quotations, loading, error, reload } = useServiceData(
    () => vendorPortalService.listQuotations().then((list) => list.map(mapRow)),
    [] as VendorQuotation[]
  );

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<QuotStatus | null>(null);
  const [expandedQuot, setExpandedQuot] = useState<string | number | null>(null);

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
    const pending = quotations.filter((q) => q.status === 'PENDING').length;
    const returned = quotations.filter((q) => q.status === 'RETURNED').length;
    const rejected = quotations.filter((q) => q.status === 'REJECTED').length;
    return {
      total,
      accepted,
      pending,
      returned,
      rejected,
      winRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
    };
  }, [quotations]);

  const filtered = useMemo(() => {
    let list = quotations;
    if (kpiFilter) list = list.filter((q) => q.status === kpiFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (q) => q.rfqNumber.toLowerCase().includes(s) || q.rfqTitle.toLowerCase().includes(s) || (q.vendorQuotationNumber && q.vendorQuotationNumber.toLowerCase().includes(s))
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
          <td key={key} className="p-3">
            {item.isSelected ? (
              <Badge tone="success" className="gap-1 text-xs">
                <CheckCircle2 size={12} /> Selected
              </Badge>
            ) : (
              <Badge tone="neutral" className="gap-1 text-xs text-muted-foreground">
                <XCircle size={12} /> Not Selected
              </Badge>
            )}
          </td>
        );
      case 'item':
        return <td key={key} className="p-3 font-medium text-foreground">{item.name}</td>;
      case 'qty':
        return (
          <td key={key} className="p-3 text-foreground tabular-nums">
            {item.quantity} {item.unit}
          </td>
        );
      case 'unitPrice': {
        const convertedUP = convert(item.unitPrice, quot.currency || defCur, displayCurrency);
        return <td key={key} className="p-3 tabular-nums text-foreground">{formatAmount(convertedUP, displayCurrency)}</td>;
      }
      case 'lineTotal': {
        const convertedLT = convert(item.quantity * item.unitPrice, quot.currency || defCur, displayCurrency);
        return (
          <td key={key} className="p-3 tabular-nums font-semibold text-foreground">
            {formatAmount(convertedLT, displayCurrency)}
          </td>
        );
      }
      case 'leadTime':
        return <td key={key} className="p-3 text-muted-foreground">{quot.leadTimeDays}d</td>;
      case 'paymentTerms':
        return <td key={key} className="p-3 text-muted-foreground">{quot.paymentTerms}</td>;
      default:
        return <td key={key} className="p-3" />;
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
  const [downloadingExcel, setDownloadingExcel] = useState<string | number | null>(null);
  const downloadQuotationExcel = async (quotationId: string | number) => {
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
    <PageFrame>
      {error && <MessageStrip type="error">{error}</MessageStrip>}

      {/* ── Page Lead Header ────────────────────────── */}
      <PageLead
        title="My Quotations"
        description="Full history of quotations you have submitted — amounts, line items, and review status"
        actions={
          <CurrencySelector
            value={displayCurrency}
            onChange={setDisplayCurrency}
            size="sm"
          />
        }
      />

      {/* ── KPI Metric Cards ────────────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { icon: ClipboardList, tone: 'primary' as const, value: summary.total, label: 'Total Submitted', detail: 'All time', filter: null as QuotStatus | null },
          { icon: Clock, tone: 'warning' as const, value: summary.pending, label: 'Under Review', detail: 'Awaiting decision', filter: 'PENDING' as QuotStatus },
          { icon: RotateCcw, tone: 'danger' as const, value: summary.returned, label: 'Returned', detail: 'Resubmission needed', filter: 'RETURNED' as QuotStatus },
          { icon: CheckCircle2, tone: 'success' as const, value: summary.accepted, label: 'Accepted', detail: 'Approved by buyer', filter: 'ACCEPTED' as QuotStatus },
          { icon: XCircle, tone: 'danger' as const, value: summary.rejected, label: 'Rejected', detail: summary.rejected > 0 ? 'Not selected' : 'None rejected', filter: 'REJECTED' as QuotStatus },
        ].map((c) => {
          const isActive = c.filter === null ? !kpiFilter : kpiFilter === c.filter;
          return (
            <MetricCard
              key={c.label}
              icon={c.icon}
              tone={c.tone}
              value={c.value}
              label={c.label}
              detail={c.detail}
              className={cn(
                'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                isActive &&
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
              )}
              onClick={() => setKpiFilter(isActive ? null : c.filter)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKpiFilter(isActive ? null : c.filter); } }}
            />
          );
        })}
      </div>

      {/* ── Search Toolbar ──────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search by RFQ number, title, or reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Quotation List Cards ────────────────────── */}
      {loading ? (
        <Card className="p-4">
          <TableSkeleton rows={4} columns={6} />
        </Card>
      ) : filtered.length > 0 ? (
        <div className="flex flex-col gap-3.5">
          {filtered.map((quot) => {
            const isExpanded = String(expandedQuot) === String(quot.id);
            const statusCfg = STATUS_CONFIG[quot.status] || { label: quot.status || 'Submitted', tone: 'neutral' as const, icon: null };

            // Compute total of selected items only
            const selectedTotal = quot.items
              .filter(i => i.isSelected)
              .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
            const selectedCount = quot.items.filter(i => i.isSelected).length;
            const allSelected = selectedCount === quot.items.length;

            return (
              <Card
                id={`vquot-card-${quot.id}`}
                key={quot.id}
                className={cn(
                  'overflow-hidden transition-all duration-200 border-border/80 hover:border-primary/30',
                  isExpanded && 'ring-1 ring-primary/20 shadow-md'
                )}
              >
                {/* Header */}
                <div
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-accent/25 transition-colors"
                  onClick={() => setExpandedQuot(isExpanded ? null : quot.id)}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClipboardList size={16} className="text-primary shrink-0" />
                      <span className="font-semibold text-foreground text-base">{quot.rfqNumber}</span>
                      {(quot.qNo || quot.versionNumber) && (
                        <Badge tone="neutral" className="text-xs">
                          {(quot.versionNumber && quot.versionNumber > 1) ? `Q${quot.versionNumber}` : (quot.qNo || `Q${quot.versionNumber}`)}
                        </Badge>
                      )}
                      <Badge tone={statusCfg.tone}>
                        <span className="size-1.5 rounded-full bg-current" />
                        {statusCfg.label}
                      </Badge>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                        <Tag size={11} />
                        Ref: {quot.vendorQuotationNumber || `QTN-${String(quot.id).slice(-6).toUpperCase()}`}
                      </span>
                      {quot.bidSecurityRequired && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <Shield size={11} />
                          Bond
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground truncate">
                      {quot.rfqTitle} <span className="text-muted-foreground/50">·</span> {quot.items.length} {quot.items.length === 1 ? 'line item' : 'line items'} <span className="text-muted-foreground/50">·</span> Submitted {fmtDate(quot.submittedAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="text-right">
                      <div className="text-base font-bold text-foreground flex items-center gap-1.5 tabular-nums justify-end">
                        {formatAmount(convert(selectedTotal, quot.currency || defCur, displayCurrency), displayCurrency)}
                        <CurrencyBadge currency={displayCurrency} size="sm" />
                      </div>
                      {!allSelected && selectedCount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          ({selectedCount}/{quot.items.length} items)
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewQuot(quot)}
                    >
                      <Eye size={14} /> View Quote
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setExpandedQuot(isExpanded ? null : quot.id)}
                      aria-label="Toggle quotation details"
                    >
                      <ChevronDown className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {/* Expanded Body */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-card p-4 flex flex-col gap-4 text-sm">
                    {quot.returnReason && (
                      <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive font-medium flex items-start gap-2">
                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                        <div>
                          <strong>Returned Reason:</strong> {quot.returnReason}
                        </div>
                      </div>
                    )}

                    {/* Items table */}
                    <div className="rounded-xl border border-border/70 overflow-hidden">
                      <div className="bg-muted/40 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border/70 flex items-center justify-between">
                        <span>Line Items & Pricing</span>
                        <div className="flex items-center gap-2">
                          {quot.status === 'ACCEPTED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              onClick={() => downloadQuotationExcel(quot.id)}
                              disabled={downloadingExcel === quot.id}
                            >
                              <FileSpreadsheet size={13} />
                              {downloadingExcel === quot.id ? 'Downloading…' : 'Download Excel'}
                            </Button>
                          )}
                          <div className="col-btn-wrap relative inline-flex">
                            <button
                              ref={colBtnRef}
                              className={cn('col-btn', showColPanel && 'col-btn--active')}
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
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-border/60 bg-muted/20 text-left text-xs font-semibold text-muted-foreground">
                              <th className="p-3">Status</th>
                              {visibleDataCols.map((key) => (
                                <th key={key} className="p-3">{ITEMS_COLUMN_HEADERS[key]}</th>
                              ))}
                              {dataColCount > 0 && <th className="p-3 w-10" />}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {quot.items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-accent/20 transition-colors">
                                {renderTableCell('status', item, quot)}
                                {visibleDataCols.map((key) => renderTableCell(key, item, quot))}
                                {dataColCount > 0 && <td className="p-3" />}
                              </tr>
                            ))}
                          </tbody>
                          {showGrandTotal && dataColCount > 0 && (
                            <tfoot>
                              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                                <td colSpan={dataColCount} className="p-3 text-right text-muted-foreground">
                                  {allSelected ? 'Total:' : 'Selected Items Total:'}
                                </td>
                                <td className="p-3 text-foreground font-bold tabular-nums">
                                  {formatAmount(convert(selectedTotal, quot.currency || defCur, displayCurrency), displayCurrency)}
                                  {!allSelected && (
                                    <span className="text-xs text-muted-foreground font-normal">
                                      {' '}of {formatAmount(convert(quot.totalPrice, quot.currency || defCur, displayCurrency), displayCurrency)}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3" />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>

                    {/* Bid Bond Document Card */}
                    {quot.bidSecurityRequired && (
                      <div className="p-3.5 rounded-xl bg-primary/[0.04] border border-primary/15 flex items-center gap-3">
                        <Shield size={16} className="text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground mb-0.5">
                            Bid Bond Document
                          </div>
                          {bidSecurityLoading ? (
                            <span className="text-xs text-muted-foreground">Loading…</span>
                          ) : bidSecurityDocs[String(quot.id)] ? (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <FileText size={13} className="text-primary shrink-0" />
                              <a
                                href={bidSecurityDocs[String(quot.id)]!.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary hover:underline truncate max-w-xs"
                              >
                                {bidSecurityDocs[String(quot.id)]!.originalName}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-6 w-6"
                                onClick={() => downloadDocument(bidSecurityDocs[String(quot.id)]!.publicUrl, bidSecurityDocs[String(quot.id)]!.originalName)}
                                title="Download document"
                              >
                                <Download size={13} />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not provided</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No Quotations Found"
          description={search ? "Try adjusting your search criteria." : "Submit a quotation from My RFQs — it will appear here with full pricing history and status."}
          action={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button> : undefined}
        />
      )}

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
    </PageFrame>
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

  const tabs: { key: VendorViewTab; label: string; icon: React.ReactNode }[] = [
    { key: 'vendor', label: 'Vendor Details', icon: <Building className="size-4" /> },
    { key: 'paymentTerms', label: 'Payment Terms', icon: <FileText className="size-4" /> },
    { key: 'authorization', label: 'Authorization', icon: <Shield className="size-4" /> },
    { key: 'items', label: `Items (${q.items.length})`, icon: <ClipboardList className="size-4" /> },
    { key: 'documents', label: 'Documents', icon: <Paperclip className="size-4" /> },
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
            <div className="flex items-center gap-1 px-6 border-b border-border/60 bg-muted/20 overflow-x-auto">
              {tabs.map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === t.key
                      ? 'border-primary text-primary bg-background/50'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                  }`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div className="rfq-modal__body">
              {/* ── Tab 1: Vendor Details ── */}
              {activeTab === 'vendor' && (
                <div className="p-6 space-y-6">
                  {/* Clean 2-column key-value layout (no cards) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">RFQ Number</div>
                      <div className="text-sm font-semibold text-foreground">{q.rfqNumber}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">RFQ Title</div>
                      <div className="text-sm font-semibold text-foreground">{q.rfqTitle || '—'}</div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Description</div>
                      <div className="text-sm text-foreground/90 whitespace-pre-line">{(rfqData?.description as string) || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Lead Time</div>
                      <div className="text-sm font-semibold text-foreground">{q.leadTimeDays} days</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Submitted Date</div>
                      <div className="text-sm font-semibold text-foreground">{fmtDate(q.submittedAt)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                      <div className="text-sm">
                        <StatusBadge status={q.status} />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Submitted In</div>
                      <div className="text-sm">
                        <CurrencyBadge currency={defCur} size="sm" />
                      </div>
                    </div>
                  </div>

                  {/* Highlighted Total Price Banner */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-primary/[0.04] border border-primary/15">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Price</div>
                      <div className="text-2xl font-bold text-foreground mt-0.5">
                        {formatAmount(q.totalPrice, defCur)}
                      </div>
                    </div>
                    <CurrencyBadge currency={defCur} size="md" />
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
                      <div className="pt-4 border-t border-border/60">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Additional Information</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                          {customFields.filter((cf: any) => cf.active !== false).map((cf: any) => {
                            const val = cfValues[cf.id];
                            if (val == null || val === '') return null;
                            return (
                              <div key={cf.id}>
                                <div className="text-xs font-medium text-muted-foreground mb-0.5">{cf.fieldName}</div>
                                <div className="text-sm font-medium text-foreground">{String(val)}</div>
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
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileText className="size-4 text-primary" />
                    <span>Payment Terms & Schedule</span>
                  </div>
                  {q.paymentTerms && q.paymentTerms !== '—' ? (
                    <div className="space-y-4">
                      {/* Payment Term Name */}
                      <div className="flex items-center gap-3 p-3.5 rounded-lg bg-muted/30 border border-border/60">
                        <FileText className="size-4 text-primary shrink-0" />
                        <span className="text-sm font-semibold text-foreground">{q.paymentTerms}</span>
                      </div>

                      {/* Milestone Details */}
                      {q.paymentPlanSnapshot && q.paymentPlanSnapshot.length > 0 && (
                        <div className="rounded-lg border border-border/60 overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border/60">
                              <tr>
                                <th className="py-2.5 px-4">Milestone</th>
                                <th className="py-2.5 px-4 text-right">Allocation</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60 text-sm">
                              {q.paymentPlanSnapshot.map((m, idx) => (
                                <tr key={idx} className="hover:bg-muted/20">
                                  <td className="py-3 px-4 text-foreground">{m.title}</td>
                                  <td className="py-3 px-4 text-right font-semibold text-foreground">{m.percentage}%</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-muted/30 border-t border-border/60 font-semibold text-sm">
                              <tr>
                                <td className="py-3 px-4 text-foreground">Total</td>
                                <td className="py-3 px-4 text-right text-emerald-600 font-bold">
                                  {q.paymentPlanSnapshot.reduce((sum, m) => sum + m.percentage, 0).toFixed(1)}%
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-xs text-muted-foreground">
                      No payment terms provided with this quotation.
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 3: Authorization Documents ── */}
              {activeTab === 'authorization' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Shield className="size-4 text-primary" />
                    <span>Authorization & Compliance Documents</span>
                  </div>

                  {q.bidSecurityRequired && (
                    <div className="flex items-center gap-3 p-3.5 rounded-lg bg-muted/30 border border-border/60">
                      <Shield className="size-4 text-primary shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">Bid Security Required</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Type: Bid Bond</div>
                      </div>
                    </div>
                  )}

                  {bidSecurityDoc ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-card border border-border/60 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Shield className="size-4 text-emerald-600" />
                            <span className="text-sm font-semibold text-foreground">Bid Security</span>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                            {bidSecurityDoc.status}
                          </span>
                        </div>

                        {bidSecurityDoc.bidSecurityValueType && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
                            <div><strong className="text-foreground">Type:</strong> {bidSecurityDoc.bidSecurityValueType === 'FIXED_AMOUNT' ? 'Fixed Amount' : 'Percentage'}</div>
                            {bidSecurityDoc.bidSecurityValue != null && (
                              <div><strong className="text-foreground">Value:</strong>{' '}
                                {bidSecurityDoc.bidSecurityValueType === 'PERCENTAGE'
                                  ? `${Number(bidSecurityDoc.bidSecurityValue)}% of Bid Value`
                                  : `${bidSecurityDoc.bidSecurityCurrency || 'KES'} ${Number(bidSecurityDoc.bidSecurityValue).toLocaleString('en-IN')}`}
                              </div>
                            )}
                            {bidSecurityDoc.bidSecurityValidityValue != null && (
                              <div><strong className="text-foreground">Validity:</strong> {bidSecurityDoc.bidSecurityValidityValue} {bidSecurityDoc.bidSecurityValidityUnit === 'DAYS' ? 'Days' : ''}</div>
                            )}
                            {bidSecurityDoc.bondNumber && <div><strong className="text-foreground">Bond #:</strong> {bidSecurityDoc.bondNumber}</div>}
                            {bidSecurityDoc.issuer && <div><strong className="text-foreground">Issuer:</strong> {bidSecurityDoc.issuer}</div>}
                          </div>
                        )}

                        {bidSecurityDoc.publicUrl && (
                          <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                            <a
                              href={bidSecurityDoc.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5"
                            >
                              <FileText className="size-3.5" />
                              {bidSecurityDoc.originalName || 'Document'} <ExternalLink className="size-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => downloadDocument(bidSecurityDoc.publicUrl, bidSecurityDoc.originalName || 'Document')}
                              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                            >
                              <Download className="size-3.5" /> Download
                            </button>
                          </div>
                        )}
                      </div>

                      {bidSecurityDoc.status === 'REJECTED' && bidSecurityDoc.rejectionReason && (
                        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                          <strong>Rejection Reason:</strong> {bidSecurityDoc.rejectionReason}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-xs text-muted-foreground">
                      No authorization documents submitted for this quotation.
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 4: Items ── */}
              {activeTab === 'items' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <ClipboardList className="size-4 text-primary" />
                      <span>Quotation Items</span>
                    </div>
                    <CurrencyBadge currency={defCur} size="sm" />
                  </div>

                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border/60">
                          <tr>
                            <th className="py-2.5 px-3 w-12 text-center">Status</th>
                            <th className="py-2.5 px-4">Item Name</th>
                            <th className="py-2.5 px-4 text-right">Qty</th>
                            <th className="py-2.5 px-4 text-right">Unit Price</th>
                            <th className="py-2.5 px-4 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 text-sm">
                          {q.items.map((item, idx) => {
                            const lineTotal = item.quantity * item.unitPrice;
                            return (
                              <tr key={idx} className={`hover:bg-muted/20 ${!item.isSelected ? 'opacity-60 bg-muted/10' : ''}`}>
                                <td className="py-3 px-3 text-center">
                                  {item.isSelected ? (
                                    <CheckCircle2 className="size-4 text-emerald-600 inline-block" />
                                  ) : (
                                    <XCircle className="size-4 text-destructive inline-block" />
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-medium text-foreground">{item.name}</div>
                                  {item.unit && <div className="text-xs text-muted-foreground">{item.unit}</div>}
                                </td>
                                <td className="py-3 px-4 text-right text-foreground">{item.quantity}</td>
                                <td className="py-3 px-4 text-right text-foreground">
                                  {formatAmount(convert(item.unitPrice, q.currency || defCur, defCur), defCur)}
                                </td>
                                <td className="py-3 px-4 text-right font-semibold text-foreground">
                                  {formatAmount(convert(lineTotal, q.currency || defCur, defCur), defCur)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between p-3.5 bg-muted/30 border-t border-border/60 text-xs font-semibold">
                      <span className="text-muted-foreground">
                        {q.items.filter(i => i.isSelected).length} of {q.items.length} items selected
                      </span>
                      <span className="text-foreground text-sm font-bold">
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
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Paperclip className="size-4 text-primary" />
                    <span>Attachments</span>
                    {attachments && attachments.length > 0 && (
                      <span className="text-xs text-muted-foreground font-normal">
                        ({attachments.length} files)
                      </span>
                    )}
                  </div>

                  {attachments && attachments.length > 0 ? (
                    <div className="space-y-2">
                      {attachments.map((att, idx) => (
                        <div
                          key={att.id || idx}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg bg-card border border-border/60 hover:bg-muted/20 transition-colors"
                        >
                          <a
                            href={att.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 flex-1 min-w-0 group"
                          >
                            <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                              <FileText className="size-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                {att.originalName}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span>{formatFileSize(att.fileSize)}</span>
                                {att.uploadedAt && (
                                  <>
                                    <span>•</span>
                                    <span>{new Date(att.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-primary flex items-center gap-1 shrink-0">
                              Open <ExternalLink className="size-3" />
                            </span>
                          </a>
                          <button
                            type="button"
                            onClick={() => downloadDocument(att.publicUrl, att.originalName)}
                            title="Download document"
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          >
                            <Download className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-xs text-muted-foreground">
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
