import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { contractService, type Contract } from '../../services/contractService';
import { sseClient } from '../../services/sseClient';
import { companySettingsService } from '../../services/companySettingsService';
import {
  FileText, Search, Plus, Eye, Edit3, X, ChevronLeft, ChevronRight,
  LayoutList, LayoutGrid, Calendar, DollarSign, AlertTriangle,
  Clock, CheckCircle2, XCircle, FileSignature, Trash2, Download,
  Ban, Printer, Bell, ArrowRight,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import './ContractsPage.css';

// ─── Types ──────────────────────────────────────────────────

type ContractStatus = 'DRAFT' | 'PENDING_VENDOR_SIGNATURE' | 'AWAITING_CUSTOMER_SIGNATURE' | 'AWAITING_VENDOR_SIGNATURE' | 'VENDOR_SIGNED' | 'ACCEPTED' | 'COMPLETED' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED';

interface ContractRow {
  id: string;
  contractNumber: string;
  title: string;
  vendorName: string;
  contractType: string;
  sourceRfq: string;
  contractValue: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  contractOwner: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_VENDOR_SIGNATURE: 'Pending Vendor Signature',
  AWAITING_CUSTOMER_SIGNATURE: 'Awaiting Your Signature',
  AWAITING_VENDOR_SIGNATURE: 'Pending Vendor Signature',
  VENDOR_SIGNED: 'Vendor Signed',
  ACCEPTED: 'Accepted',
  COMPLETED: 'Completed',
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring Soon',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  TERMINATED: 'Terminated',
};

function getStatusIcon(status: string) {
  switch (status) {
    case 'DRAFT': return <FileText size={12} />;
    case 'PENDING_VENDOR_SIGNATURE':
    case 'AWAITING_CUSTOMER_SIGNATURE':
    case 'AWAITING_VENDOR_SIGNATURE': return <Clock size={12} />;
    case 'VENDOR_SIGNED':
    case 'ACCEPTED':
    case 'COMPLETED':
    case 'ACTIVE': return <CheckCircle2 size={12} />;
    case 'EXPIRING_SOON': return <AlertTriangle size={12} />;
    case 'EXPIRED':
    case 'CANCELLED':
    case 'TERMINATED': return <XCircle size={12} />;
    default: return null;
  }
}

interface ContractColumnDef {
  key: string; label: string; defaultVisible: boolean; required?: boolean;
  width?: string; render: (r: ContractRow, fmtDate: (d: string) => string) => React.ReactNode;
}

// ─── Component ──────────────────────────────────────────────

export default function ContractsPage() {
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency: displayCurrency } = useCurrency();

  // ─── Contract types from Company Settings ──
  const [contractTypeLabels, setContractTypeLabels] = useState<Record<string, string>>({});

  const { data: rawResult, loading, error, reload } = useServiceData(
    () => contractService.listContracts().then(r => ({
      rawContracts: r.contracts,
      total: r.total,
    })),
    { rawContracts: [] as Contract[], total: 0 },
    [],
    { cacheKey: 'contracts:list', cacheTtlMs: 0 }
  );

  const contracts = useMemo(() => rawResult.rawContracts.map((c: Contract): ContractRow => ({
    id: c.id,
    contractNumber: c.contractNumber,
    title: c.title,
    vendorName: c.vendor?.name || 'Unknown',
    contractType: contractTypeLabels[c.contractType] || c.contractType,
    sourceRfq: c.rfq?.rfqNumber || '',
    contractValue: c.contractValue,
    currency: c.currency,
    startDate: c.effectiveDate,
    endDate: c.expirationDate,
    status: c.status as ContractStatus,
    contractOwner: c.contractOwner?.fullName || '—',
  })), [rawResult.rawContracts, contractTypeLabels]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [deleteTarget, setDeleteTarget] = useState<ContractRow | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<ContractRow | null>(null);
  const [terminating, setTerminating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [operating, setOperating] = useState<string | null>(null); // id being acted upon
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  useBodyScrollLock(!!deleteTarget || !!terminateTarget);
  const perPage = 10;

  // ── Recently signed contract banner state ──────────────────
  const [recentlySigned, setRecentlySigned] = useState<Array<{
    contractId: string;
    contractNumber: string;
    vendorName: string;
    signedBy: string;
    signedAt: string;
    contractValue: number;
    currency: string;
    rfqNumber: string | null;
    rfqTitle: string | null;
  }>>([]);

  // Subscribe to SSE for real-time contract signing alerts
  useEffect(() => {
    const unsub = sseClient.on('contract_signed', (data: unknown) => {
      const event = data as {
        contractId: string;
        contractNumber: string;
        vendorName: string;
        signedBy: string;
        signedAt: string;
        contractValue: number;
        currency: string;
        rfqNumber: string | null;
        rfqTitle: string | null;
      };

      setRecentlySigned(prev => {
        // Avoid duplicates if multiple SSE events arrive
        if (prev.some(s => s.contractId === event.contractId)) return prev;
        // Keep last 5
        return [event, ...prev].slice(0, 5);
      });

      // Auto-refresh the contract list to reflect new status
      reload();

      // Auto-dismiss after 60 seconds
      setTimeout(() => {
        setRecentlySigned(prev => prev.filter(s => s.contractId !== event.contractId));
      }, 60_000);
    });

    // Subscribe to PO creation events — refresh list so balance/status updates show
    const unsubPO = sseClient.on('po_created', () => {
      reload();
    });

    // Connect SSE client if not already connected
    sseClient.connect();

    return () => {
      unsub();
      unsubPO();
    };
  }, [reload]);

  // Dismiss all banners
  const dismissAllSigned = useCallback(() => {
    setRecentlySigned([]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const templates = await companySettingsService.listContractTemplates();
        if (templates.length > 0) {
          const labels = Object.fromEntries(templates.map(t => [t.type, t.name]));
          setContractTypeLabels(labels);
        }
      } catch { /* no company settings configured */ }
    })();
  }, []);



  // ─── Column definitions (memoized with formatAmount) ────────

  const allColumns = useMemo((): ContractColumnDef[] => [
    {
      key: 'contract', label: 'Contract', defaultVisible: true, required: true, width: '220px',
      render: (r) => (
        <div className="ctr-table__contract-info">
          <span className="ctr-table__contract-number">{r.contractNumber}</span>
          <span className="ctr-table__contract-title">{r.title}</span>
        </div>
      ),
    },
    {
      key: 'vendor', label: 'Supplier', defaultVisible: true, width: '160px',
      render: (r) => <span className="ctr-table__vendor-name">{r.vendorName}</span>,
    },
    {
      key: 'value', label: 'Contract Value', defaultVisible: true, width: '130px',
      render: (r) => <span className="ctr-table__amount">{formatAmount(r.contractValue, r.currency)}</span>,
    },
    {
      key: 'status', label: 'Status', defaultVisible: true, width: '160px',
      render: (r) => (
        <span className={`ctr-badge ctr-badge--${r.status}`}>
          {getStatusIcon(r.status)} {STATUS_LABELS[r.status]}
        </span>
      ),
    },
    {
      key: 'startDate', label: 'Start Date', defaultVisible: true, width: '120px',
      render: (r, fmtDate) => (
        <span className="ctr-table__date"><Calendar size={12} /> {fmtDate(r.startDate)}</span>
      ),
    },
    {
      key: 'endDate', label: 'End Date', defaultVisible: true, width: '120px',
      render: (r, fmtDate) => (
        <span className="ctr-table__date">
          {r.endDate ? <><Calendar size={12} /> {fmtDate(r.endDate)}</> : '—'}
        </span>
      ),
    },
    {
      key: 'contractOwner', label: 'Owner', defaultVisible: true, width: '140px',
      render: (r) => <span className="ctr-table__owner">{r.contractOwner}</span>,
    },
  ], [formatAmount]);

  // ─── Column state ──────────────────────────────────────────

  const defaultOrder = useMemo(() => allColumns.map((c) => c.key), [allColumns]);
  const defaultVisible = useMemo(
    () => new Set(allColumns.filter((c) => c.defaultVisible).map((c) => c.key)),
    [allColumns],
  );

  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const visibleColumns = useMemo(
    () => columnOrder
      .map((k) => allColumns.find((c) => c.key === k)!)
      .filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys, allColumns],
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

  // ─── Filters ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = contracts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.contractNumber.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        r.sourceRfq.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'ALL') list = list.filter(r => r.status === statusFilter);
    if (typeFilter !== 'ALL') list = list.filter(r => r.contractType === contractTypeLabels[typeFilter] || r.contractType === typeFilter);
    return list;
  }, [contracts, search, statusFilter, typeFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const summary = useMemo(() => ({
    total: contracts.length,
    vendorSigned: contracts.filter(r => ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(r.status)).length,
    pendingSignature: contracts.filter(r => ['PENDING_VENDOR_SIGNATURE', 'AWAITING_CUSTOMER_SIGNATURE', 'AWAITING_VENDOR_SIGNATURE'].includes(r.status)).length,
    totalValue: contracts.reduce((s, r) => s + r.contractValue, 0),
  }), [contracts]);

  const formatDate = useCallback((d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  []);

  // Navigate to RFQ's purchase-requisition page with contractId pre-fill
  const handleNavigateToPO = useCallback((contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (contract?.sourceRfq) {
      // Find the actual contract to get the rfqId
      const fullContract = rawResult.rawContracts.find(c => c.id === contractId);
      if (fullContract?.rfqId) {
        navigate(`/procurement/purchase-requisition/${fullContract.rfqId}?contractId=${contractId}`);
        return;
      }
    }
    // Fallback: just go to contract detail
    navigate(`/contracts/${contractId}`);
  }, [navigate, contracts, rawResult.rawContracts]);

  // Dismiss a single banner
  const dismissSignedBanner = useCallback((contractId: string) => {
    setRecentlySigned(prev => prev.filter(s => s.contractId !== contractId));
  }, []);

  // ─── Action Handlers ────────────────────────────────────────

  const handleView = useCallback((id: string) => {
    navigate(`/contracts/${id}`);
  }, [navigate]);

  const handleEdit = useCallback((id: string) => {
    navigate(`/contracts/${id}/edit`);
  }, [navigate]);

  const handleSign = useCallback((id: string) => {
    navigate(`/contracts/${id}?action=sign`);
  }, [navigate]);

  const handleCreatePO = useCallback(async (id: string) => {
    setOperating(id);
    setPageMsg(null);
    try {
      const result = await contractService.createPOFromContract(id);
      setPageMsg(`Purchase Order ${result.poNumber} created successfully.`);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to create PO');
    } finally {
      setOperating(null);
    }
  }, [reload]);

  const handleDownload = useCallback(async (r: ContractRow) => {
    try {
      setPageMsg(null);
      let contentHtml: string | null = null;
      try {
        const res = await contractService.getContract(r.id);
        if (res?.contract?.contentSnapshot) {
          contentHtml = res.contract.contentSnapshot;
        }
      } catch {
        /* fallback to formatted row HTML */
      }

      if (!contentHtml) {
        contentHtml = `
          <div style="font-family: inherit; padding: 20px;">
            <h1 style="color: #0a6ed1; border-bottom: 2px solid #0a6ed1; padding-bottom: 8px;">${r.title || r.contractNumber}</h1>
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
              <tr><td style="font-weight: 700; width: 180px; padding: 8px; border: 1px solid #ddd;">Contract Number</td><td style="padding: 8px; border: 1px solid #ddd;">${r.contractNumber}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Supplier</td><td style="padding: 8px; border: 1px solid #ddd;">${r.vendorName}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Contract Value</td><td style="padding: 8px; border: 1px solid #ddd;">${r.currency} ${r.contractValue.toLocaleString('en-IN')}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Type</td><td style="padding: 8px; border: 1px solid #ddd;">${r.contractType}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Status</td><td style="padding: 8px; border: 1px solid #ddd;">${r.status}</td></tr>
              <tr><td style="font-weight: 700; padding: 8px; border: 1px solid #ddd;">Owner</td><td style="padding: 8px; border: 1px solid #ddd;">${r.contractOwner}</td></tr>
            </table>
          </div>
        `;
      }

      await downloadContractAsPdf(
        contentHtml,
        r.contractNumber || `Contract-${r.id}`,
        r.title || r.contractNumber
      );
    } catch (err) {
      console.error('Failed to download contract PDF:', err);
      setPageMsg('Failed to download contract PDF. Please try again.');
    }
  }, []);

  const handleTerminateConfirm = useCallback(async () => {
    if (!terminateTarget) return;
    setTerminating(true);
    setPageMsg(null);
    try {
      await contractService.terminateContract(terminateTarget.id);
      setPageMsg(`Contract ${terminateTarget.contractNumber} terminated.`);
      setTerminateTarget(null);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Termination failed');
    } finally {
      setTerminating(false);
    }
  }, [terminateTarget, reload]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setPageMsg(null);
    try {
      await contractService.deleteContract(deleteTarget.id);
      setPageMsg(`Contract ${deleteTarget.contractNumber} deleted.`);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, reload]);

  const contractTypes = Object.keys(contractTypeLabels);

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="ctr-page">
      {pageMsg && (
        <MessageStrip type={inferMessageType(pageMsg)} onClose={() => setPageMsg(null)} autoHideMs={5000}>
          {pageMsg}
        </MessageStrip>
      )}
      {error && <MessageStrip type="error">{error}</MessageStrip>}

      {/* ── Recently Signed Contracts Banner ── */}
      {recentlySigned.length > 0 && (
        <div className="ctr-signed-banner-wrap">
          <div className="ctr-signed-banner-header">
            <div className="ctr-signed-banner-header__left">
              <Bell size={16} className="ctr-signed-banner-header__icon" />
              <span>Recently Signed Contracts</span>
            </div>
            <button
              className="ctr-signed-banner-header__dismiss-all"
              onClick={dismissAllSigned}
            >
              Dismiss all
            </button>
          </div>
          <div className="ctr-signed-banner-list">
            {recentlySigned.map(event => {
              const timeAgo = getTimeAgo(event.signedAt);
              return (
                <div key={event.contractId} className="ctr-signed-banner">
                  <div className="ctr-signed-banner__ribbon">
                    <span>JUST SIGNED</span>
                  </div>
                  <div className="ctr-signed-banner__content">
                    <div className="ctr-signed-banner__info">
                      <div className="ctr-signed-banner__vendor">
                        <CheckCircle2 size={18} />
                        <span>{event.vendorName}</span>
                      </div>
                      <div className="ctr-signed-banner__meta">
                        <span className="ctr-signed-banner__contract">
                          {event.contractNumber}
                        </span>
                        <span className="ctr-signed-banner__sep">·</span>
                        <span className="ctr-signed-banner__value">
                          {formatCurrency(event.contractValue, event.currency)}
                        </span>
                        {event.rfqNumber && (
                          <>
                            <span className="ctr-signed-banner__sep">·</span>
                            <span className="ctr-signed-banner__rfq">{event.rfqNumber}</span>
                          </>
                        )}
                      </div>
                      <div className="ctr-signed-banner__time">
                        <Clock size={12} />
                        <span>{timeAgo}</span>
                        <span className="ctr-signed-banner__sep">·</span>
                        <span>Signed by {event.signedBy}</span>
                      </div>
                    </div>
                    <div className="ctr-signed-banner__actions">
                      <button
                        className="ctr-signed-banner__btn ctr-signed-banner__btn--primary"
                        onClick={() => handleView(event.contractId)}
                      >
                        <Eye size={14} />
                        <span>View</span>
                      </button>
                      <button
                        className="ctr-signed-banner__btn ctr-signed-banner__btn--secondary"
                        onClick={() => handleNavigateToPO(event.contractId)}
                      >
                        <ArrowRight size={14} />
                        <span>Create PO</span>
                      </button>
                      <button
                        className="ctr-signed-banner__dismiss"
                        onClick={() => dismissSignedBanner(event.contractId)}
                        title="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="ctr-page__header">
        <div className="ctr-page__header-left">
          <h1><FileText size={24} /> Contracts</h1>
          <p>Manage contracts, track signatures, and create purchase orders</p>
        </div>
      </div>

      {/* Summary */}
      <div className="ctr-summary">
        {[
          { icon: <FileText size={22} />, val: summary.total, label: 'Total Contracts', cls: 'total' },
          { icon: <CheckCircle2 size={22} />, val: summary.vendorSigned, label: 'Vendor Signed', cls: 'active' },
          { icon: <Clock size={22} />, val: summary.pendingSignature, label: 'Pending Signature', cls: 'pending' },
          { icon: <DollarSign size={22} />, val: formatCurrency(summary.totalValue, displayCurrency), label: 'Total Value', cls: 'value' },
        ].map(c => (
          <div key={c.cls} className="ctr-summary-card">
            <div className={`ctr-summary-card__icon ctr-summary-card__icon--${c.cls}`}>{c.icon}</div>
            <div className="ctr-summary-card__info">
              <span className="ctr-summary-card__value">
                {typeof c.val === 'number' ? c.val.toLocaleString('en-IN') : c.val}
              </span>
              <span className="ctr-summary-card__label">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="ctr-toolbar">
        <div className="ctr-toolbar__search">
          <Search size={16} className="ctr-toolbar__search-icon" />
          <input
            type="text"
            placeholder="Search by contract number, title, supplier, RFQ..."
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <div className="ctr-toolbar__right">
          <select
            className="ctr-toolbar__filter-select"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
          >
            <option value="ALL">All Types</option>
            {contractTypes.map(t => (
              <option key={t} value={t}>{contractTypeLabels[t] || t}</option>
            ))}
          </select>
          <select
            className="ctr-toolbar__filter-select"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            style={{ minWidth: '160px' }}
          >
            <option value="ALL">All Statuses</option>
            {(['DRAFT', 'PENDING_VENDOR_SIGNATURE', 'VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'TERMINATED'] as const).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
            ))}
          </select>
          <div className="ctr-toolbar__view-toggle">
            <button
              className={`ctr-toolbar__view-btn ${view === 'table' ? 'ctr-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('table')}
            ><LayoutList size={16} /></button>
            <button
              className={`ctr-toolbar__view-btn ${view === 'card' ? 'ctr-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('card')}
            ><LayoutGrid size={16} /></button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="ctr-table-card">
          <TableSkeleton rows={4} columns={6} />
        </div>
      ) : paginated.length > 0 ? (
        view === 'table' ? (
          <div className="ctr-table-card">
            <div className="ctr-table-wrap">
              <table className="ctr-table" style={{ tableLayout: 'fixed', minWidth: '800px' }}>
                <colgroup>
                  {visibleColumns.map(col => <col key={col.key} style={{ width: col.width || 'auto' }} />)}
                  <col style={{ width: '200px' }} />
                </colgroup>
                <thead>
                  <tr>
                    {visibleColumns.map(col => <th key={col.key}>{col.label}</th>)}
                    <th>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>Actions</span>
                        <div className="col-btn-wrap">
                          <button
                            ref={colBtnRef}
                            className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`}
                            onClick={() => setShowColPanel(v => !v)}
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
                              allColumns={allColumns}
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
                  {paginated.map(r => (
                    <tr key={r.id} className={`ctr-table__row ctr-table__row--${(r.status || '').toLowerCase()}`} onClick={() => handleView(r.id)}>
                      {visibleColumns.map(col => <td key={col.key}>{col.render(r, formatDate)}</td>)}
                      <td onClick={e => e.stopPropagation()}>
                        <div className="ctr-table__actions">
                          {/* View — always available */}
                          <button
                            className="ctr-table__action-btn"
                            title="View contract"
                            onClick={() => handleView(r.id)}
                          ><Eye size={15} /></button>

                          {/* Edit — Draft only */}
                          {r.status === 'DRAFT' && (
                            <button
                              className="ctr-table__action-btn"
                              title="Edit contract"
                              onClick={() => handleEdit(r.id)}
                            ><Edit3 size={15} /></button>
                          )}

                          {/* Sign — DRAFT or awaiting customer signature */}
                          {(r.status === 'DRAFT' || r.status === 'AWAITING_CUSTOMER_SIGNATURE') && (
                            <button
                              className="ctr-table__action-btn"
                              title="Sign contract"
                              onClick={() => handleSign(r.id)}
                            ><FileSignature size={15} /></button>
                          )}

                          {/* Download — available for any non-draft status */}
                          {(r.status !== 'DRAFT') && (
                            <button
                              className="ctr-table__action-btn"
                              title="Download contract"
                              onClick={() => handleDownload(r)}
                            ><Download size={15} /></button>
                          )}

                          {/* Create PO — Accepted, Active, Vendor Signed, or Expiring Soon */}
                          {['ACCEPTED', 'ACTIVE', 'VENDOR_SIGNED', 'EXPIRING_SOON'].includes(r.status) && (
                            <button
                              className="ctr-table__action-btn"
                              title="Create Purchase Order"
                              onClick={() => navigate(`/contracts/${r.id}?tab=orders`)}
                            ><Plus size={15} /></button>
                          )}

                          {/* Terminate — Accepted, Active, or Expiring Soon */}
                          {['ACCEPTED', 'ACTIVE', 'EXPIRING_SOON'].includes(r.status) && (
                            <button
                              className="ctr-table__action-btn ctr-table__action-btn--danger"
                              title="Terminate contract"
                              onClick={() => setTerminateTarget(r)}
                              disabled={operating === r.id}
                            ><Ban size={15} /></button>
                          )}

                          {/* Delete — Draft only */}
                          {r.status === 'DRAFT' && (
                            <button
                              className="ctr-table__action-btn ctr-table__action-btn--danger"
                              title="Delete contract"
                              onClick={() => setDeleteTarget(r)}
                            ><Trash2 size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > perPage && (
              <div className="ctr-pagination">
                <span className="ctr-pagination__info">
                  Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                </span>
                <div className="ctr-pagination__btns">
                  <button
                    className="ctr-pagination__btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  ><ChevronLeft size={14} /></button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      className={`ctr-pagination__btn ${currentPage === p ? 'ctr-pagination__btn--active' : ''}`}
                      onClick={() => setCurrentPage(p)}
                    >{p}</button>
                  ))}
                  <button
                    className="ctr-pagination__btn"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  ><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Card View ── */
          <div className="ctr-cards">
            {paginated.map(r => (
              <div key={r.id} className="ctr-card" onClick={() => handleView(r.id)}>
                <div className="ctr-card__top">
                  <span className="ctr-card__number">{r.contractNumber}</span>
                  <span className={`ctr-badge ctr-badge--${r.status}`}>
                    {getStatusIcon(r.status)} {STATUS_LABELS[r.status]}
                  </span>
                </div>
                <div className="ctr-card__title">{r.title}</div>
                <div className="ctr-card__vendor">{r.vendorName}</div>
                <div className="ctr-card__details">
                  <div className="ctr-card__detail">
                    <span className="ctr-card__detail-label">Value</span>
                    <span className="ctr-card__detail-value">{formatAmount(r.contractValue, r.currency)}</span>
                  </div>
                  <div className="ctr-card__detail">
                    <span className="ctr-card__detail-label">Type</span>
                    <span className="ctr-card__detail-value">{r.contractType}</span>
                  </div>
                  <div className="ctr-card__detail">
                    <span className="ctr-card__detail-label">Start</span>
                    <span className="ctr-card__detail-value">{formatDate(r.startDate)}</span>
                  </div>
                </div>
                <div className="ctr-card__footer">
                  <span>{r.sourceRfq}</span>
                  <span>{r.contractOwner}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="ctr-table-card">
          <div className="ctr-empty">
            <div className="ctr-empty__icon"><FileText size={48} /></div>
            <div className="ctr-empty__title">No contracts found</div>
            <div className="ctr-empty__desc">
              {search
                ? 'Try adjusting your search or filters.'
                : 'No contracts have been created yet. Contracts are generated after RFQ finalization.'}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="ctr-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="ctr-modal" onClick={e => e.stopPropagation()}>
            <div className="ctr-modal__header">
              <span className="ctr-modal__title"><Trash2 size={20} /> Delete Contract?</span>
              <button className="ctr-modal__close" onClick={() => setDeleteTarget(null)}><X size={18} /></button>
            </div>
            <div className="ctr-modal__body">
              <p style={{ margin: 0 }}>
                Delete <strong>{deleteTarget.contractNumber}</strong> — {deleteTarget.title}?
                This action cannot be undone.
              </p>
            </div>
            <div className="ctr-modal__footer">
              <button
                className="ctr-modal__btn ctr-modal__btn--secondary"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >Cancel</button>
              <button
                className="ctr-modal__btn ctr-modal__btn--primary"
                style={{ background: '#dc2626' }}
                disabled={deleting}
                onClick={handleDeleteConfirm}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminate Confirmation Modal */}
      {terminateTarget && (
        <div className="ctr-modal-backdrop" onClick={() => !terminating && setTerminateTarget(null)}>
          <div className="ctr-modal" onClick={e => e.stopPropagation()}>
            <div className="ctr-modal__header">
              <span className="ctr-modal__title"><Ban size={20} /> Terminate Contract?</span>
              <button className="ctr-modal__close" onClick={() => setTerminateTarget(null)}><X size={18} /></button>
            </div>
            <div className="ctr-modal__body">
              <p style={{ margin: 0 }}>
                Terminate <strong>{terminateTarget.contractNumber}</strong> — {terminateTarget.title}?
                This will change the contract status to Terminated and can affect linked purchase orders.
              </p>
            </div>
            <div className="ctr-modal__footer">
              <button
                className="ctr-modal__btn ctr-modal__btn--secondary"
                disabled={terminating}
                onClick={() => setTerminateTarget(null)}
              >Cancel</button>
              <button
                className="ctr-modal__btn"
                style={{ background: '#dc2626', color: '#fff' }}
                disabled={terminating}
                onClick={handleTerminateConfirm}
              >
                {terminating ? 'Terminating…' : 'Terminate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
