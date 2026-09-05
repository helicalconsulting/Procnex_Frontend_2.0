import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseRequisitionService, type PurchaseRequisition } from '../../services/purchaseRequisitionService';
import { sseClient } from '../../services/sseClient';
import { ShoppingCart, Eye, Pencil, Trash2, Loader2, AlertTriangle, FileText, Search, X, CheckCircle, Clock, Plus, CheckSquare, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
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
    REJECTED: 'Rejected',
    CANCELLED: 'Rejected',
    RETURNED: 'Returned for Revision',
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
  const { hasPermission } = useAuth();
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRequisition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedPrIds, setSelectedPrIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
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

  useBodyScrollLock(!!deleteTarget || showBatchDeleteModal);

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

    // Real-time: when a PO status changes (approved/rejected in approvals page),
    // refresh this list so the status updates automatically
    const unsubStatus = sseClient.on('po_status_changed', () => {
      fetchRequisitions();
    });
    const unsubCreated = sseClient.on('po_created', () => {
      fetchRequisitions();
    });

    return () => {
      unsubStatus();
      unsubCreated();
    };
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id || deleteTarget.rfqId;
    const deletedPoNumber = deleteTarget.poNumber;
    setDeleting(true);
    try {
      await purchaseRequisitionService.delete(targetId);
      setRequisitions((prev) => prev.filter((r) => r.id !== deleteTarget.id && r.rfqId !== deleteTarget.rfqId));
      setToast({ message: `Document ${deleteTarget.poNumber || ''} deleted successfully.`, type: 'success' });
      setDeleteTarget(null);

      // 🔔 Instantly notify ApprovalsPage (and any other listener) without SSE
      window.dispatchEvent(new CustomEvent('heliflow:po-deleted', {
        detail: { poId: targetId, poNumber: deletedPoNumber },
      }));
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to delete document', type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // Filtered List
  const filteredRequisitions = useMemo(() => {
    return requisitions.filter((r) => {
      // Metric filter
      if (statusFilter === 'DRAFT_PENDING') {
        if (r.status !== 'DRAFT' && r.status !== 'PENDING_APPROVAL') return false;
      } else if (statusFilter === 'APPROVED') {
        if (!['APPROVED', 'COMPLETED', 'SENT_TO_VENDOR', 'PO_CREATED'].includes(r.status)) return false;
      } else if (statusFilter === 'REJECTED') {
        if (!['REJECTED', 'CANCELLED'].includes(r.status)) return false;
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

  // ── Batch selection ──
  const isAllSelected = useMemo(() => {
    if (filteredRequisitions.length === 0) return false;
    return filteredRequisitions.every(p => selectedPrIds.includes(String(p.id || p.rfqId)));
  }, [filteredRequisitions, selectedPrIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const pageIds = new Set(filteredRequisitions.map(p => String(p.id || p.rfqId)));
      setSelectedPrIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const newIds = filteredRequisitions.map(p => String(p.id || p.rfqId));
      setSelectedPrIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedPrIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchDeleteConfirm = async () => {
    if (selectedPrIds.length === 0) return;
    setBatchDeleting(true);
    try {
      for (const id of selectedPrIds) {
        await purchaseRequisitionService.delete(id).catch(() => {});
      }
      setToast({ message: `Successfully deleted ${selectedPrIds.length} PO/PR(s).`, type: 'success' });
      setSelectedPrIds([]);
      setShowBatchDeleteModal(false);
      await fetchRequisitions();
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to delete selected items.', type: 'error' });
    } finally {
      setBatchDeleting(false);
    }
  };

  // Metrics calculation
  const draftCount = requisitions.filter(r => r.status === 'DRAFT').length;
  const pendingCount = requisitions.filter(r => r.status === 'PENDING_APPROVAL').length;
  const draftAndPendingCount = draftCount + pendingCount;
  const activeCount = requisitions.filter(r => ['APPROVED', 'COMPLETED', 'SENT_TO_VENDOR', 'PO_CREATED'].includes(r.status)).length;
  const rejectedCount = requisitions.filter(r => ['REJECTED', 'CANCELLED'].includes(r.status)).length;
  const totalValue = requisitions.reduce((acc, r) => acc + (r.grandTotal || 0), 0);

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
      <div className="pr-page__header" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            PO Creation & Orders
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
            Manage purchase orders, requisitions and vendor release documents
          </p>
        </div>
        <button
          className="pr-btn pr-btn--primary"
          onClick={hasPermission('PO Creation', 'canCreate') ? () => navigate('/procurement/create-purchase-order') : undefined}
          disabled={!hasPermission('PO Creation', 'canCreate')}
          title={!hasPermission('PO Creation', 'canCreate') ? 'Admin has not allowed this action. You do not have permission to create Purchase Orders.' : 'Create new Purchase Order'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 700,
            background: hasPermission('PO Creation', 'canCreate') ? 'linear-gradient(135deg, #0a6ed1, #0856a4)' : 'var(--bg-disabled, #cbd5e1)',
            color: hasPermission('PO Creation', 'canCreate') ? '#fff' : 'var(--text-disabled, #64748b)',
            border: 'none',
            cursor: hasPermission('PO Creation', 'canCreate') ? 'pointer' : 'not-allowed',
            opacity: hasPermission('PO Creation', 'canCreate') ? 1 : 0.6,
            pointerEvents: 'auto',
            boxShadow: hasPermission('PO Creation', 'canCreate') ? '0 4px 12px rgba(10, 110, 209, 0.25)' : 'none',
          }}
        >
          <Plus size={16} /> New PO
        </button>
      </div>

      {requisitions.length > 0 && (
        <div className="pr-kpi-summary" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
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

          <div
            className={`pr-kpi-card ${statusFilter === 'REJECTED' ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter(prev => prev === 'REJECTED' ? null : 'REJECTED')}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
              <XCircle size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">REJECTED</span>
              <span className="pr-kpi-value" style={{ color: rejectedCount > 0 ? '#dc2626' : undefined }}>{rejectedCount}</span>
            </div>
          </div>

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

      {selectedPrIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-card)', border: '1px solid var(--primary-500)',
          padding: '12px 18px', borderRadius: 'var(--radius-md)', marginBottom: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)', transition: 'all 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            <CheckSquare size={18} style={{ color: 'var(--primary-500)' }} />
            <span><strong>{selectedPrIds.length}</strong> Document(s) selected</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="pr-btn pr-btn--outline"
              style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600 }}
              onClick={() => setSelectedPrIds([])}
            >
              Cancel Selection
            </button>
            <button
              type="button"
              disabled={!hasPermission('PO Creation', 'canCreate')}
              style={{
                background: hasPermission('PO Creation', 'canCreate') ? '#dc2626' : '#64748b',
                color: '#ffffff', border: 'none',
                padding: '7px 16px', fontSize: 13, fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                cursor: hasPermission('PO Creation', 'canCreate') ? 'pointer' : 'not-allowed',
                opacity: hasPermission('PO Creation', 'canCreate') ? 1 : 0.5,
                pointerEvents: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 6
              }}
              title={!hasPermission('PO Creation', 'canCreate') ? "Admin has not allowed this action. You do not have permission to delete Purchase Orders." : undefined}
              onClick={(e) => {
                if (!hasPermission('PO Creation', 'canCreate')) return;
                (e.currentTarget as HTMLElement).blur();
                setShowBatchDeleteModal(true);
              }}
            >
              <Trash2 size={14} /> Delete Selected ({selectedPrIds.length})
            </button>
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
              <col style={{ width: '44px' }} />
              {[
                ...visibleColumns.map((col) => (
                  <col key={col.key} style={{ width: COL_WIDTHS[col.key] || 'auto' }} />
                )),
                <col key="__actions" style={{ width: '135px' }} />,
              ]}
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    disabled={!hasPermission('PO Creation', 'canCreate')}
                    onChange={hasPermission('PO Creation', 'canCreate') ? handleToggleSelectAll : undefined}
                    style={{ cursor: hasPermission('PO Creation', 'canCreate') ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                    title={!hasPermission('PO Creation', 'canCreate') ? "Admin has not allowed this action. You do not have permission to select Purchase Orders." : undefined}
                  />
                </th>
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
              {filteredRequisitions.map((pr) => {
                const rfqStr = (pr.rfqId || '').toLowerCase();
                const isStandalone = Boolean(
                  (pr as any).isStandalone ||
                  !pr.rfqId ||
                  rfqStr.startsWith('direct-po') ||
                  rfqStr.startsWith('rfq-direct') ||
                  rfqStr === 'direct-po-master-id' ||
                  rfqStr.includes('direct')
                );
                const openPO = (mode: 'view' | 'edit') => {
                  if (isStandalone) {
                    navigate(`/procurement/create-purchase-order?id=${pr.id || pr.rfqId}${mode === 'view' ? '&mode=view' : ''}`);
                  } else {
                    navigate(`/procurement/purchase-requisition/${pr.rfqId}?mode=${mode}`, { state: { readOnly: mode === 'view' } });
                  }
                };
                return (
                  <tr
                    key={pr.id || pr.rfqId}
                    className={`pr-list-row pr-list-row--${(pr.status || '').toLowerCase()}`}
                    onClick={() => openPO('view')}
                  >
                    <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedPrIds.includes(String(pr.id || pr.rfqId))}
                        disabled={!hasPermission('PO Creation', 'canCreate')}
                        onChange={() => hasPermission('PO Creation', 'canCreate') && handleToggleSelect(String(pr.id || pr.rfqId))}
                        style={{ cursor: hasPermission('PO Creation', 'canCreate') ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                        title={!hasPermission('PO Creation', 'canCreate') ? "Admin has not allowed this action. You do not have permission to select Purchase Orders." : undefined}
                      />
                    </td>
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
                            openPO('view');
                          }}
                          title="View PO Document (Read-Only)"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="pr-list__view-btn"
                          disabled={!hasPermission('PO Creation', 'canCreate')}
                          style={!hasPermission('PO Creation', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          title={hasPermission('PO Creation', 'canCreate') ? "Edit PO Document" : "Admin has not allowed this action. You do not have permission to edit Purchase Orders."}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!hasPermission('PO Creation', 'canCreate')) return;
                            openPO('edit');
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="pr-list__view-btn pr-list__delete-btn"
                          disabled={!hasPermission('PO Creation', 'canCreate')}
                          style={!hasPermission('PO Creation', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          title={hasPermission('PO Creation', 'canCreate') ? "Delete PO document" : "Admin has not allowed this action. You do not have permission to delete Purchase Orders."}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!hasPermission('PO Creation', 'canCreate')) return;
                            setDeleteTarget(pr);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="pr-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="pr-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="pr-modal-header pr-modal-header--danger">
              <h3>
                <AlertTriangle size={20} />
                <span>Delete Purchase Order?</span>
              </h3>
              <button className="pr-modal-close" onClick={() => setDeleteTarget(null)} disabled={deleting} title="Close">
                <X size={16} />
              </button>
            </div>
            <div className="pr-modal-body">
              <p>
                Are you sure you want to delete PO{' '}
                <strong>{deleteTarget.poNumber || deleteTarget.rfqId}</strong>?
              </p>
              <div className="pr-modal-warning">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>This action is permanent and cannot be undone. All items and linked data will be deleted.</span>
              </div>
            </div>
            <div className="pr-modal-footer">
              <button
                className="pr-btn pr-btn--outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="pr-btn pr-btn--danger"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 size={14} className="pr-spin" /> Deleting…
                  </>
                ) : (
                  'Delete PO'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div className="pr-modal-backdrop" onClick={() => !batchDeleting && setShowBatchDeleteModal(false)}>
          <div className="pr-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="pr-modal-header pr-modal-header--danger">
              <h3>
                <AlertTriangle size={20} />
                <span>Delete {selectedPrIds.length} Selected Document(s)?</span>
              </h3>
              <button className="pr-modal-close" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting} title="Close">
                <X size={16} />
              </button>
            </div>
            <div className="pr-modal-body">
              <p>
                Are you sure you want to delete the <strong>{selectedPrIds.length} selected document(s)</strong>?
              </p>
              <div className="pr-modal-warning">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>This action is permanent and cannot be undone.</span>
              </div>
            </div>
            <div className="pr-modal-footer">
              <button
                autoFocus
                className="pr-btn pr-btn--outline"
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={batchDeleting}
              >
                Cancel
              </button>
              <button
                className="pr-btn pr-btn--danger"
                onClick={handleBatchDeleteConfirm}
                disabled={batchDeleting}
              >
                {batchDeleting ? (
                  <>
                    <Loader2 size={14} className="pr-spin" /> Deleting…
                  </>
                ) : (
                  `Delete ${selectedPrIds.length} Document(s)`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
