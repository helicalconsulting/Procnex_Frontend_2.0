import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseRequisitionService, type PurchaseRequisition } from '../../services/purchaseRequisitionService';
import { ShoppingCart, Eye, Pencil, Trash2, Loader2, AlertTriangle, FileText, Search, X, CheckCircle, Clock } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ColumnCustomizer, { type ColumnDef } from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import '../purchase-requisitions/PurchaseRequisitionPage.css';

function formatCurrency(amount: number, currency: string = 'KES'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'KES',
    minimumFractionDigits: 2,
  }).format(amount);
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved & Released',
    COMPLETED: 'Approved & Released',
    SENT_TO_VENDOR: 'Sent to Vendor',
  };
  return labels[status] || status.replace(/_/g, ' ');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'poNumber', label: 'PO / PR Number', defaultVisible: true, required: true },
  { key: 'vendorName', label: 'Vendor', defaultVisible: true },
  { key: 'poDate', label: 'PO Date', defaultVisible: true },
  { key: 'currency', label: 'Currency', defaultVisible: true },
  { key: 'grandTotal', label: 'Grand Total', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
];

const COL_WIDTHS: Record<string, string> = {
  poNumber: '150px',
  vendorName: '180px',
  poDate: '120px',
  currency: '90px',
  grandTotal: '140px',
  status: '150px',
};

export default function PurchaseRequisitionsListPage() {
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRequisition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Column Customizer State
  const defaultOrder = useMemo(() => ALL_COLUMNS.map((c) => c.key), []);
  const defaultVisible = useMemo(() => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)), []);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(!!deleteTarget);

  const fetchRequisitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await purchaseRequisitionService.list();
      setRequisitions(list);
    } catch (err: any) {
      setError(err?.message || 'Failed to load purchase requisitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequisitions();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id || deleteTarget.rfqId;
    setDeleting(true);
    try {
      await purchaseRequisitionService.delete(targetId);
      setRequisitions((prev) => prev.filter((r) => r.id !== deleteTarget.id && r.rfqId !== deleteTarget.rfqId));
      setToast({ message: `Document ${deleteTarget.poNumber || ''} deleted successfully.`, type: 'success' });
      setDeleteTarget(null);
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to delete document', type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // Metrics calculation
  const draftCount = requisitions.filter(r => r.status === 'DRAFT').length;
  const pendingCount = requisitions.filter(r => r.status === 'PENDING_APPROVAL').length;
  const draftAndPendingCount = draftCount + pendingCount;
  const activeCount = requisitions.filter(r => ['APPROVED', 'COMPLETED', 'SENT_TO_VENDOR', 'PO_CREATED'].includes(r.status)).length;
  const totalValue = requisitions.reduce((acc, r) => acc + (r.grandTotal || 0), 0);

  // Filtered List
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((r) => {
      // Metric filter
      if (statusFilter === 'DRAFT_PENDING') {
        if (r.status !== 'DRAFT' && r.status !== 'PENDING_APPROVAL') return false;
      } else if (statusFilter === 'APPROVED') {
        if (!['APPROVED', 'COMPLETED', 'SENT_TO_VENDOR', 'PO_CREATED'].includes(r.status)) return false;
      }

      // Search term filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (r.poNumber || '').toLowerCase().includes(term) ||
        (r.vendorName || '').toLowerCase().includes(term) ||
        (r.status || '').toLowerCase().includes(term) ||
        (r.currency || '').toLowerCase().includes(term)
      );
    });
  }, [requisitions, searchTerm, statusFilter]);

  const visibleColumns = useMemo(
    () => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys]
  );

  const handleToggleColumn = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleResetColumns = () => {
    setColumnOrder(defaultOrder);
    setVisibleKeys(new Set(defaultVisible));
  };

  if (loading) {
    return (
      <div className="pr-page">
        <div className="pr-page__loading"><Loader2 size={32} className="pr-page__spinner" /> Loading purchase requisitions…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pr-page">
        <div className="pr-page__error">
          <AlertTriangle size={32} />
          <p>{error}</p>
          <button className="pr-btn" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pr-page">
      {toast && (
        <MessageStrip type={toast.type} compact autoHideMs={5000} onClose={() => setToast(null)}>
          {toast.message}
        </MessageStrip>
      )}
      {/* Clean Page Title Header */}
      <div className="pr-page__header" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          PO Creation & Orders
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-secondary, #64748b)' }}>
          Manage purchase orders, requisitions and vendor release documents
        </p>
      </div>

      {/* KPI Metric Summary Cards */}
      {requisitions.length > 0 && (
        <div className="pr-kpi-summary">
          {/* Card 1: Total Documents */}
          <div
            className={`pr-kpi-card ${statusFilter === null ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter(null)}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(10,110,209,0.08)', color: '#0a6ed1' }}>
              <FileText size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">TOTAL DOCUMENTS</span>
              <span className="pr-kpi-value">{requisitions.length}</span>
            </div>
          </div>

          {/* Card 2: Draft & Pending */}
          <div
            className={`pr-kpi-card ${statusFilter === 'DRAFT_PENDING' ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter(prev => prev === 'DRAFT_PENDING' ? null : 'DRAFT_PENDING')}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(233,115,12,0.1)', color: '#e9730c' }}>
              <Clock size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">DRAFT & PENDING</span>
              <span className="pr-kpi-value">{draftAndPendingCount}</span>
            </div>
          </div>

          {/* Card 3: Approved & Released */}
          <div
            className={`pr-kpi-card ${statusFilter === 'APPROVED' ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter(prev => prev === 'APPROVED' ? null : 'APPROVED')}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(16,126,62,0.1)', color: '#107e3e' }}>
              <CheckCircle size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">APPROVED & RELEASED</span>
              <span className="pr-kpi-value">{activeCount}</span>
            </div>
          </div>

          {/* Card 4: Total Volume */}
          <div className="pr-kpi-card">
            <div className="pr-kpi-icon pr-kpi-icon--grand">
              <FileText size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">TOTAL VOLUME</span>
              <span className="pr-kpi-value pr-kpi-value--grand">
                {formatCurrency(totalValue, requisitions[0]?.currency || 'KES')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Search Input Bar */}
      {requisitions.length > 0 && (
        <div className="pr-search-bar-wrap">
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-placeholder)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="pr-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search PO, vendor, status..."
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-placeholder)',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {requisitions.length === 0 ? (
        <div className="pr-empty">
          <div className="pr-empty__icon-wrapper">
            <FileText size={26} />
          </div>
          <h3>No PO Creations Yet</h3>
          <p>PO Creations are created when you select "RFQ Based PO" from the award modal after quotation approval.</p>
        </div>
      ) : filteredRequisitions.length === 0 ? (
        <div className="pr-empty">
          <div className="pr-empty__icon-wrapper">
            <Search size={26} />
          </div>
          <h3>No matching documents found</h3>
          <p>We couldn't find any documents matching your current search or filter criteria. Try clearing your filters to view all records.</p>
          <button
            className="pr-btn pr-btn--outline"
            onClick={() => { setSearchTerm(''); setStatusFilter(null); }}
            style={{ borderRadius: 20, padding: '8px 20px' }}
          >
            <X size={14} /> Clear Filters
          </button>
        </div>
      ) : (
        <div className="pr-list-table-wrap">
          <table className="pr-list-table">
            <colgroup>
              {[
                ...visibleColumns.map((col) => (
                  <col key={col.key} style={{ width: COL_WIDTHS[col.key] || 'auto' }} />
                )),
                <col key="__actions" style={{ width: '135px' }} />,
              ]}
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    style={{ textAlign: col.key === 'grandTotal' ? 'right' : 'left' }}
                  >
                    {col.label.toUpperCase()}
                  </th>
                ))}
                <th className="pr-list__th--actions" style={{ width: 135 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span>ACTIONS</span>
                    <div style={{ position: 'relative' }}>
                      <button
                        ref={colBtnRef}
                        className={`rfq-table__col-btn ${showColPanel ? 'rfq-table__col-btn--active' : ''}`}
                        onClick={() => setShowColPanel((v) => !v)}
                        title="Customize columns"
                        aria-label="Customize columns"
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
              {filteredRequisitions.map((pr) => (
                <tr
                  key={pr.id || pr.rfqId}
                  className={`pr-list-row pr-list-row--${(pr.status || '').toLowerCase()}`}
                  onClick={() => pr.rfqId && navigate(`/procurement/purchase-requisition/${pr.rfqId}?mode=view`, { state: { readOnly: true } })}
                >
                  {visibleColumns.map((col) => {
                    if (col.key === 'poNumber') {
                      return (
                        <td key="poNumber" className="pr-list__po-num">
                          <span className="pr-po-link">{pr.poNumber || '-'}</span>
                        </td>
                      );
                    }
                    if (col.key === 'vendorName') {
                      return <td key="vendorName" className="pr-list__vendor">{pr.vendorName || '-'}</td>;
                    }
                    if (col.key === 'poDate') {
                      return <td key="poDate">{pr.poDate ? formatDate(pr.poDate) : '-'}</td>;
                    }
                    if (col.key === 'currency') {
                      return <td key="currency">{pr.currency || 'KES'}</td>;
                    }
                    if (col.key === 'grandTotal') {
                      return <td key="grandTotal" className="pr-list__total">{formatCurrency(pr.grandTotal, pr.currency)}</td>;
                    }
                    if (col.key === 'status') {
                      return (
                        <td key="status">
                          <span className={`pr-badge pr-badge--${pr.status}`}>{getStatusLabel(pr.status)}</span>
                        </td>
                      );
                    }
                    return <td key={col.key}>-</td>;
                  })}
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <button
                        className="pr-list__view-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          pr.rfqId && navigate(`/procurement/purchase-requisition/${pr.rfqId}?mode=view`, { state: { readOnly: true } });
                        }}
                        title="View PO Document (Read-Only)"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        className="pr-list__view-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          pr.rfqId && navigate(`/procurement/purchase-requisition/${pr.rfqId}?mode=edit`, { state: { readOnly: false } });
                        }}
                        title="Edit PO Document"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="pr-list__view-btn pr-list__delete-btn"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(pr); }}
                        title="Delete PO document"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SAP Fiori Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="pr-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="sap-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="sap-dialog__header">
              <div className="sap-dialog__title-wrap">
                <div className="sap-dialog__icon-badge sap-dialog__icon-badge--danger">
                  <Trash2 size={18} />
                </div>
                <div className="sap-dialog__title-group">
                  <h3 className="sap-dialog__title">Delete PO Document</h3>
                  <span className="sap-dialog__subtitle">Confirmation Required</span>
                </div>
              </div>
              <button
                type="button"
                className="sap-dialog__close-btn"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="sap-dialog__body">
              <div className="sap-dialog__callout sap-dialog__callout--danger">
                <AlertTriangle size={20} className="sap-dialog__callout-icon" />
                <div className="sap-dialog__callout-content">
                  <p className="sap-dialog__message">
                    Are you sure you want to delete PO Document{' '}
                    <strong>{deleteTarget.poNumber || deleteTarget.vendorName}</strong>?
                  </p>
                  <p className="sap-dialog__submessage">
                    This action will permanently remove the PO record from the system and cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="sap-dialog__footer">
              <button
                type="button"
                className="pr-btn pr-btn--outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pr-btn sap-btn--danger"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
