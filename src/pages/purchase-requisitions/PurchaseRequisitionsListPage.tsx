import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseRequisitionService, type PurchaseRequisition } from '../../services/purchaseRequisitionService';
import { ShoppingCart, Eye, Trash2, Loader2, AlertTriangle, FileText, X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { MessageStrip } from '../../components/shared/MessageStrip';
import '../purchase-requisitions/PurchaseRequisitionPage.css';

function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Completed',
    SENT_TO_VENDOR: 'Sent to Vendor',
  };
  return labels[status] || status.replace(/_/g, ' ');
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PurchaseRequisitionsListPage() {
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRequisition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  const draftCount = requisitions.filter(r => r.status === 'DRAFT').length;
  const pendingCount = requisitions.filter(r => r.status === 'PENDING_APPROVAL').length;
  const activeCount = requisitions.filter(r => ['APPROVED', 'COMPLETED', 'SENT_TO_VENDOR', 'PO_CREATED'].includes(r.status)).length;
  const totalValue = requisitions.reduce((acc, r) => acc + (r.grandTotal || 0), 0);

  return (
    <div className="pr-page">
      {toast && (
        <MessageStrip type={toast.type} compact autoHideMs={5000} onClose={() => setToast(null)}>
          {toast.message}
        </MessageStrip>
      )}

      <div className="pr-toolbar">
        <div className="pr-toolbar__title">
          <ShoppingCart size={22} />
          <span>PO Creation & Orders</span>
          {requisitions.length > 0 && (
            <span className="pr-toolbar__po-num">{requisitions.length} Document{requisitions.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {requisitions.length > 0 && (
        <div className="pr-kpi-summary">
          <div className="pr-kpi-card">
            <div className="pr-kpi-icon"><FileText size={20} /></div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">Total Documents</span>
              <span className="pr-kpi-value">{requisitions.length}</span>
            </div>
          </div>

          <div className="pr-kpi-card">
            <div className="pr-kpi-icon" style={{ background: 'rgba(233,115,12,0.1)', color: '#e9730c' }}><ShoppingCart size={20} /></div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">Draft & Pending</span>
              <span className="pr-kpi-value">{draftCount + pendingCount}</span>
            </div>
          </div>

          <div className="pr-kpi-card">
            <div className="pr-kpi-icon" style={{ background: 'rgba(16,126,62,0.1)', color: '#107e3e' }}><FileText size={20} /></div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">Approved & Released</span>
              <span className="pr-kpi-value">{activeCount}</span>
            </div>
          </div>

          <div className="pr-kpi-card">
            <div className="pr-kpi-icon pr-kpi-icon--grand"><FileText size={20} /></div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">Total Volume</span>
              <span className="pr-kpi-value pr-kpi-value--grand">{formatCurrency(totalValue, requisitions[0]?.currency || 'INR')}</span>
            </div>
          </div>
        </div>
      )}

      {requisitions.length === 0 ? (
        <div className="pr-empty">
          <FileText size={48} className="pr-empty__icon" />
          <h3>No PO Creations Yet</h3>
          <p>PO Creations are created when you select "RFQ Based PO" from the award modal after quotation approval.</p>
        </div>
      ) : (
        <div className="pr-list-table-wrap">
          <table className="pr-list-table">
            <thead>
              <tr>
                <th>PO / PR Number</th>
                <th>Vendor</th>
                <th>PO Date</th>
                <th>Currency</th>
                <th className="pr-list__th--amount">Grand Total</th>
                <th>Status</th>
                <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map((pr) => (
                <tr key={pr.id || pr.rfqId} className="pr-list-row" onClick={() => pr.rfqId && navigate(`/procurement/purchase-requisition/${pr.rfqId}`)}>
                  <td className="pr-list__po-num">{pr.poNumber || '-'}</td>
                  <td className="pr-list__vendor">{pr.vendorName || '-'}</td>
                  <td>{pr.poDate ? formatDate(pr.poDate) : '-'}</td>
                  <td>{pr.currency || '-'}</td>
                  <td className="pr-list__total">{formatCurrency(pr.grandTotal, pr.currency)}</td>
                  <td>
                    <span className={`pr-badge pr-badge--${pr.status}`}>
                      {getStatusLabel(pr.status)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        className="pr-list__view-btn"
                        onClick={(e) => { e.stopPropagation(); pr.rfqId && navigate(`/procurement/purchase-requisition/${pr.rfqId}`); }}
                        title="View / Edit"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="pr-list__view-btn pr-list__delete-btn"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(pr); }}
                        title="Delete document"
                      >
                        <Trash2 size={16} />
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
                    This action will permanently remove the PO record from the SAP system and cannot be undone.
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
