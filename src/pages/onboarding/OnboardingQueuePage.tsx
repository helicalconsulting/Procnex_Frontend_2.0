import { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  procurementService,
  type DocumentSummary,
  type OnboardingVendor,
  type VendorDocument,
} from '../../services/procurementService';
import { sseClient } from '../../services/sseClient';
import { API_BASE } from '../../api/client';
import {
  CheckCircle2,
  XCircle,
  Filter,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  Inbox,
  X,
  FileText,
  Eye,
  Building,
  Briefcase,
  Landmark,
  FilePenLine,
  Download,
  ShieldCheck,
  Calendar,
  Check,
  List,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { downloadDocument as _downloadDocument } from '../../utils/download';
import './OnboardingQueuePage.css';

type QueueStatus = 'pending' | 'approved' | 'rejected';

interface QueueRow {
  id: number;
  name: string;
  email: string;
  submittedDate: string;
  status: QueueStatus;
  rawStatus: string;
  isSubmitted: boolean;
  documentSummary: DocumentSummary;
  documents: VendorDocument[];
  phone?: string | null;
  contactPerson?: string | null;
  website?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankBranch?: string | null;
  onboardingNotes?: string | null;
  category?: string | null;
  location?: string | null;
  rejectionReason?: string | null;
}

function mapOnboardingVendor(v: OnboardingVendor): QueueRow {
  const st = (v.status || '').toUpperCase();
  const status: QueueStatus =
    st.includes('APPROVE') ? 'approved' : st.includes('REJECT') ? 'rejected' : 'pending';
  const isSubmitted = v.isSubmitted !== undefined
    ? v.isSubmitted
    : (st === 'PENDING_APPROVAL' || st === 'DOCUMENTS_SUBMITTED' || st.includes('APPROVE') || st.includes('REJECT'));
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    submittedDate: new Date(v.submittedAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    status,
    rawStatus: v.status,
    isSubmitted,
    documentSummary: v.documentSummary || { required: 0, uploaded: 0, pending: 0, verified: 0, rejected: 0 },
    documents: v.documents || [],
    phone: v.phone ?? null,
    contactPerson: v.contactPerson ?? null,
    website: v.website ?? null,
    address: v.address ?? null,
    gstNumber: v.gstNumber ?? null,
    panNumber: v.panNumber ?? null,
    bankName: v.bankName ?? null,
    bankAccountNumber: v.bankAccountNumber ?? null,
    bankIfscCode: v.bankIfscCode ?? null,
    bankBranch: v.bankBranch ?? null,
    onboardingNotes: v.onboardingNotes ?? null,
    category: v.category ?? null,
    location: v.location ?? null,
    rejectionReason: v.rejectionReason ?? null,
  };
}

const STATUS_LABEL: Record<QueueStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function documentUrl(url: string): string {
  if (url.startsWith('http')) return url;
  return `${API_BASE.replace(/\/api$/, '')}${url}`;
}

const SIGNED_DOC_CSS = `body{font-family:Inter,'Segoe UI',Arial,sans-serif;padding:40px;line-height:1.7;color:#1a2332;max-width:800px;margin:0 auto}img{max-width:100%}h1,h2,h3{color:#0a1e3a}.signature-block{margin-top:32px;padding-top:20px;border-top:2px solid #e1e5eb}.parties{background:#f8fafc;padding:16px 20px;border-radius:8px;border:1px solid #e1e5eb;margin:16px 0}`;

function buildSignedDocHtml(docType: string, content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${docType} — Signed Agreement</title><style>${SIGNED_DOC_CSS}</style></head><body>${content}</body></html>`;
}

async function downloadDocument(docUrl: string, filename: string): Promise<void> {
  return _downloadDocument(documentUrl(docUrl), filename);
}

function downloadSignedDocument(doc: VendorDocument): void {
  const content = doc.contentSnapshot;
  if (content) {
    const fullHtml = buildSignedDocHtml(doc.documentType, content);
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.documentType.replace(/\s+/g, '_')}_Signed_Agreement.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    // Fallback: download from API URL
    downloadDocument(doc.publicUrl, doc.documentType + '_' + doc.originalName);
  }
}

export default function OnboardingQueuePage() {
  const { data: requests, loading, error, reload } = useServiceData(
    () => procurementService.getOnboardingQueue().then((list) => list.map(mapOnboardingVendor)),
    [] as QueueRow[]
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<QueueRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveTarget, setApproveTarget] = useState<QueueRow | null>(null);
  const [approveMessage, setApproveMessage] = useState('');
  const [documentTarget, setDocumentTarget] = useState<QueueRow | null>(null);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [snapshotTarget, setSnapshotTarget] = useState<QueueRow | null>(null);
  const [snapshotData, setSnapshotData] = useState<Record<string, unknown> | null>(null);
  const [signedPreviewDoc, setSignedPreviewDoc] = useState<VendorDocument | null>(null);
  useBodyScrollLock(!!(approveTarget || rejectTarget || documentTarget || snapshotTarget || signedPreviewDoc));
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Force refetch on mount — bypass React Query cache so fresh vendor list is always shown
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE listener — auto-refresh queue when vendor accepts or uploads documents
  useEffect(() => {
    // Ensure SSE client is connected (AppLayout manages connection, but this is a safety net)
    sseClient.connect();

    // Listen for generic notification and specific onboarding SSE events
    const unsub1 = sseClient.on('notification', () => reload());
    const unsub2 = sseClient.on('vendor_onboarding_accepted', () => reload());
    const unsub3 = sseClient.on('vendor_onboarding_documents_submitted', () => reload());

    // Polling fallback: every 30s as a safety net in case SSE connection drops
    const pollTimer = setInterval(() => reload(), 30_000);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      clearInterval(pollTimer);
    };
  }, [reload]);

  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    requests.forEach((r) => c[r.status]++);
    return c;
  }, [requests]);

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return requests;
    return requests.filter((r) => r.status === activeFilter);
  }, [requests, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  const handleApprove = useCallback(
    async (row: QueueRow, message?: string) => {
      setActionError(null);
      setActionSuccess(null);
      setBusyId(row.id);
      try {
        await procurementService.approveVendor(row.id, message);
        setActionSuccess(
          `${row.name} approved. Password setup email sent to ${row.email}.`
        );
        reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to approve vendor');
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  const openApproveModal = useCallback((row: QueueRow) => {
    setApproveTarget(row);
    setApproveMessage('');
    setActionError(null);
  }, []);

  const handleApproveConfirm = useCallback(async () => {
    if (!approveTarget) return;
    await handleApprove(approveTarget, approveMessage.trim() || undefined);
    setApproveTarget(null);
    setApproveMessage('');
  }, [approveTarget, approveMessage, handleApprove]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setActionError('Rejection reason must be at least 5 characters.');
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(rejectTarget.id);
    try {
      await procurementService.rejectVendor(rejectTarget.id, reason);
      setActionSuccess(`${rejectTarget.name} rejected.`);
      setRejectTarget(null);
      setRejectReason('');
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject vendor');
    } finally {
      setBusyId(null);
    }
  }, [rejectTarget, rejectReason, reload]);

  const openDocuments = useCallback(async (row: QueueRow) => {
    setDocumentTarget(row);
    setDocuments(row.documents);
    setActionError(null);
    try {
      const result = await procurementService.getVendorDocuments(row.id);
      setDocuments(result.documents || []);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load vendor documents');
    }
  }, []);

  return (
    <div className="oq-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {actionError && (
        <MessageStrip type="error" onClose={() => setActionError(null)}>
          {actionError}
        </MessageStrip>
      )}
      {actionSuccess && (
        <MessageStrip
          type="success"
          onClose={() => setActionSuccess(null)}
          autoHideMs={5000}
        >
          {actionSuccess}
        </MessageStrip>
      )}

      <header className="oq-page__header">
        <div>
          <h1>Onboarding Queue</h1>
          <p>Approve suppliers to activate their account and email them a secure password setup link.</p>
        </div>
      </header>

      <div className="oq-stats">
        <button
          type="button"
          className={`oq-stat oq-stat--pending ${activeFilter === 'pending' ? 'oq-stat--active' : ''}`}
          onClick={() => setActiveFilter('pending')}
        >
          <span className="oq-stat__icon">
            <Clock size={20} />
          </span>
          <span className="oq-stat__value">{counts.pending}</span>
          <span className="oq-stat__label">Pending</span>
        </button>
        <button
          type="button"
          className={`oq-stat oq-stat--approved ${activeFilter === 'approved' ? 'oq-stat--active' : ''}`}
          onClick={() => setActiveFilter('approved')}
        >
          <span className="oq-stat__icon">
            <CheckCircle2 size={20} />
          </span>
          <span className="oq-stat__value">{counts.approved}</span>
          <span className="oq-stat__label">Approved</span>
        </button>
        <button
          type="button"
          className={`oq-stat oq-stat--rejected ${activeFilter === 'rejected' ? 'oq-stat--active' : ''}`}
          onClick={() => setActiveFilter('rejected')}
        >
          <span className="oq-stat__icon">
            <XCircle size={20} />
          </span>
          <span className="oq-stat__value">{counts.rejected}</span>
          <span className="oq-stat__label">Rejected</span>
        </button>
      </div>

      <section className="oq-table-section">
        <div className="oq-table-section__header">
          <div className="oq-table-section__title">
            <Building2 size={18} />
            <h2>Vendor requests</h2>
          </div>
          <div className="oq-filter-pills">
            <Filter size={13} />
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`oq-filter-pill ${activeFilter === f ? 'oq-filter-pill--active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="oq-table-card">
          {loading ? (
            <div className="oq-empty">Loading onboarding queue…</div>
          ) : paginated.length === 0 ? (
            <div className="oq-empty">
              <Inbox size={40} strokeWidth={1.25} />
              <p>No {activeFilter === 'all' ? '' : activeFilter} vendors in the queue.</p>
            </div>
          ) : (
            <>
              <div className="oq-table-wrap">
                <table className="oq-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Email</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((req) => (
                      <tr key={req.id}>
                        <td className="oq-table__name">{req.name}</td>
                        <td>
                          <span className="oq-table__email">
                            <Mail size={13} />
                            {req.email}
                          </span>
                        </td>
                        <td className="oq-table__date">{req.submittedDate}</td>
                        <td>
                          <span className={`oq-status oq-status--${req.status}`}>
                            {req.status === 'pending' && !req.isSubmitted ? 'Awaiting submission' : STATUS_LABEL[req.status]}
                          </span>
                        </td>
                        <td>
                          {req.status === 'pending' ? (() => {
                            const hasDocs = req.documentSummary.uploaded + req.documentSummary.verified + req.documentSummary.rejected > 0;
                            const isAwaitingDocs = req.documentSummary.required > 0 && !hasDocs;
                            const notSubmitted = !req.isSubmitted;
                            const notSubmittedTitle = notSubmitted ? 'Vendor has not submitted onboarding form yet' : undefined;
                            return (
                            <div className="oq-table__row-actions">
                              <button
                                type="button"
                                className="oq-btn oq-btn--review"
                                onClick={() => openDocuments(req)}
                              >
                                <FileText size={15} /> Docs
                              </button>
                              <button
                                type="button"
                                className="oq-btn oq-btn--review"
                                onClick={async () => {
                                  setSnapshotTarget(req);
                                  setSnapshotLoading(true);
                                  setSnapshotData(null);
                                  try {
                                    const data = await procurementService.getVendorProfile(req.id);
                                    setSnapshotData(data);
                                  } catch {
                                    setSnapshotData(null);
                                  } finally {
                                    setSnapshotLoading(false);
                                  }
                                }}
                                title="View profile snapshot"
                              >
                                <Eye size={15} /> Profile
                              </button>
                              {notSubmitted ? (
                                <span className="oq-docs-pending-badge">
                                  <Clock size={12} /> Form in progress
                                </span>
                              ) : isAwaitingDocs ? (
                                <span className="oq-docs-pending-badge">
                                  <FileText size={12} /> Awaiting docs
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="oq-btn oq-btn--reject"
                                disabled={busyId === req.id || notSubmitted}
                                title={notSubmittedTitle}
                                onClick={() => {
                                  setActionError(null);
                                  setRejectTarget(req);
                                  setRejectReason('');
                                }}
                              >
                                <XCircle size={15} /> Reject
                              </button>
                              <button
                                type="button"
                                className="oq-btn oq-btn--approve"
                                disabled={busyId === req.id || notSubmitted}
                                title={notSubmittedTitle}
                                onClick={() => openApproveModal(req)}
                              >
                                <CheckCircle2 size={15} />
                                {busyId === req.id ? 'Working…' : 'Approve'}
                              </button>
                            </div>
                          )})() : req.status === 'approved' ? (
                            <div className="oq-table__row-actions">
                              <button
                                type="button"
                                className="oq-btn oq-btn--review"
                                onClick={() => openDocuments(req)}
                              >
                                <FileText size={15} /> Docs
                              </button>
                              <button
                                type="button"
                                className="oq-btn oq-btn--review"
                                onClick={async () => {
                                  setSnapshotTarget(req);
                                  setSnapshotLoading(true);
                                  setSnapshotData(null);
                                  try {
                                    const data = await procurementService.getVendorProfile(req.id);
                                    setSnapshotData(data);
                                  } catch {
                                    setSnapshotData(null);
                                  } finally {
                                    setSnapshotLoading(false);
                                  }
                                }}
                                title="View profile snapshot"
                              >
                                <Eye size={15} /> Profile
                              </button>
                            </div>
                          ) : req.status === 'rejected' ? (
                            <div className="oq-table__row-actions">
                              <button
                                type="button"
                                className="oq-btn oq-btn--review"
                                onClick={() => openDocuments(req)}
                              >
                                <FileText size={15} /> Docs
                              </button>
                              {req.rejectionReason && (
                                <span className="oq-rejection-pill" title={req.rejectionReason}>
                                  {req.rejectionReason.length > 35
                                    ? req.rejectionReason.slice(0, 35) + '…'
                                    : req.rejectionReason}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="oq-table__muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length > perPage && (
                <div className="oq-pagination">
                  <span className="oq-pagination__info">
                    {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of{' '}
                    {filtered.length}
                  </span>
                  <div className="oq-pagination__btns">
                    <button
                      type="button"
                      className="oq-pagination__btn"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`oq-pagination__btn ${currentPage === p ? 'oq-pagination__btn--active' : ''}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="oq-pagination__btn"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {approveTarget && (
        <div className="oq-modal-backdrop" onClick={() => setApproveTarget(null)}>
          <div className="oq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="oq-modal__header">
              <h3>Approve {approveTarget.name}</h3>
              <button
                type="button"
                className="oq-modal__close"
                onClick={() => setApproveTarget(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="oq-modal__body">
              <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Vendor will be approved and a password setup email will be sent. You can include a
                custom message that will be included in the email.
              </p>
              <label className="oq-modal__label" htmlFor="approve-message">
                Custom Message <span style={{ fontWeight: 400, fontSize: 11 }}>(optional)</span>
              </label>
              <textarea
                id="approve-message"
                className="oq-modal__textarea"
                rows={4}
                value={approveMessage}
                onChange={(e) => setApproveMessage(e.target.value)}
                placeholder="e.g. Welcome aboard! We look forward to working with you..."
              />
            </div>
            <div className="oq-modal__footer">
              <button
                type="button"
                className="oq-modal__btn oq-modal__btn--secondary"
                onClick={() => setApproveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="oq-modal__btn oq-modal__btn--primary"
                disabled={busyId === approveTarget.id}
                onClick={handleApproveConfirm}
              >
                {busyId === approveTarget.id ? 'Approving…' : 'Approve & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="oq-modal-backdrop" onClick={() => setRejectTarget(null)}>
          <div className="oq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="oq-modal__header">
              <h3>Reject {rejectTarget.name}</h3>
              <button
                type="button"
                className="oq-modal__close"
                onClick={() => setRejectTarget(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="oq-modal__body">
              <label className="oq-modal__label" htmlFor="reject-reason">
                Reason for rejection <span>*</span>
              </label>
              <textarea
                id="reject-reason"
                className="oq-modal__textarea"
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this vendor was not approved (min. 5 characters)…"
              />
            </div>
            <div className="oq-modal__footer">
              <button
                type="button"
                className="oq-modal__btn oq-modal__btn--secondary"
                onClick={() => setRejectTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="oq-modal__btn oq-modal__btn--danger"
                disabled={busyId === rejectTarget.id || rejectReason.trim().length < 5}
                onClick={handleRejectConfirm}
              >
                {busyId === rejectTarget.id ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {documentTarget && (
        <div className="oq-modal-backdrop" onClick={() => setDocumentTarget(null)}>
          <div className="oq-modal oq-modal--docs" onClick={(e) => e.stopPropagation()}>
            <div className="oq-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="oq-snapshot-header-icon">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="oq-snapshot-title">{documentTarget.name}</h3>
                  <p className="oq-snapshot-subtitle">Uploaded Documents</p>
                </div>
              </div>
              <button type="button" className="oq-modal__close" onClick={() => setDocumentTarget(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="oq-modal__body oq-doc-list">
              {documents.length === 0 ? (
                <div className="oq-empty oq-empty--small">No documents uploaded yet.</div>
              ) : (() => {
                const regularDocs = documents.filter(d => d.documentType !== 'NDA' && d.documentType !== 'MNDA');
                const signedDocs = documents.filter(d => d.documentType === 'NDA' || d.documentType === 'MNDA');
                return (<>
                  {regularDocs.length > 0 && (<>
                    <div className="oq-doc-section-header">
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>UPLOADED DOCUMENTS</span>
                      {regularDocs.length < 10 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{regularDocs.length}</span>}
                    </div>
                    {regularDocs.map((doc) => (
                      <div className="oq-doc-card" key={doc.id}>
                        <div className="oq-doc-card__main">
                          <FileText size={18} />
                          <div>
                            <strong>{doc.documentType}</strong>
                            <span>{doc.originalName}</span>
                            {doc.rejectionReason && <em>{doc.rejectionReason}</em>}
                          </div>
                        </div>
                        <div className="oq-doc-card__actions">
                          <button type="button" className="oq-icon-btn" onClick={() => window.open(documentUrl(doc.publicUrl), '_blank', 'noopener,noreferrer')} title="View document">
                            <Eye size={15} />
                          </button>
                          <button type="button" className="oq-icon-btn" onClick={() => downloadDocument(doc.publicUrl, doc.originalName)} title="Download document" aria-label="Download document">
                            <Download size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>)}
                  {signedDocs.length > 0 && (<>
                    <div className="oq-doc-section-header" style={{ marginTop: regularDocs.length > 0 ? 20 : 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#107e3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#107e3e', letterSpacing: 0.5 }}>SIGNED AGREEMENTS</span>
                      <span style={{ fontSize: 11, color: '#107e3e', opacity: 0.7 }}>{signedDocs.length}</span>
                    </div>
                    {signedDocs.map((doc) => (
                      <div className="oq-doc-card" key={doc.id}>
                        <div className="oq-doc-card__main">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#107e3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                          <div>
                            <strong>{doc.documentType}</strong>
                            <span style={{ color: '#107e3e' }}>✓ Signed</span>
                            {doc.signedBy && <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block' }}>by {doc.signedBy}</span>}
                          </div>
                        </div>
                        <div className="oq-doc-card__actions">
                          {doc.contentSnapshot ? (
                            <button type="button" className="oq-icon-btn" onClick={() => setSignedPreviewDoc(doc)} title="Preview signed agreement">
                              <Eye size={15} />
                            </button>
                          ) : (
                            <button type="button" className="oq-icon-btn" onClick={() => window.open(documentUrl(doc.publicUrl), '_blank', 'noopener,noreferrer')} title="View signed agreement">
                              <Eye size={15} />
                            </button>
                          )}
                          <button type="button" className="oq-icon-btn" onClick={() => downloadSignedDocument(doc)} title="Download signed agreement" aria-label="Download signed agreement">
                            <Download size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>)}
                </>);
              })()}
            </div>
          </div>
        </div>
      )}

      {snapshotTarget && (
        <div className="oq-modal-backdrop" onClick={() => { setSnapshotTarget(null); setSnapshotData(null); }}>
          <div className="oq-modal oq-modal--docs" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="oq-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="oq-snapshot-header-icon">
                  <Building size={22} />
                </div>
                <div>
                  <h3 className="oq-snapshot-title">{snapshotTarget.name}</h3>
                  <p className="oq-snapshot-subtitle">Onboarding Snapshot</p>
                </div>
              </div>
              <button type="button" className="oq-modal__close" onClick={() => { setSnapshotTarget(null); setSnapshotData(null); }} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="oq-modal__body" style={{ padding: 0 }}>
              {snapshotLoading ? (
                <div className="oq-snapshot-loading">Loading vendor details…</div>
              ) : snapshotData ? (
                <div className="oq-snapshot-scroll">
                  {/* ─── Company Details ─── */}
                  <div className="oq-snapshot-section">
                    <div className="oq-snapshot-section-header">
                      <div className="oq-snapshot-section-bar oq-snapshot-section-bar--company" />
                      <Briefcase size={14} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                      <span className="oq-snapshot-section-label">Company Details</span>
                    </div>
                    <div className="oq-snapshot-grid">
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Company Name</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.name || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Email</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.email || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Phone</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.phone || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Contact Person</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.contactPerson || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Category</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.category || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Location</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.location || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Website</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.website || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field oq-snapshot-field--full">
                        <div className="oq-snapshot-field-label">Address</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.address || '—')}</div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Mandatory Information — unified from Company Settings ─── */}
                  <div className="oq-snapshot-section">
                    <div className="oq-snapshot-section-header">
                      <div className="oq-snapshot-section-bar oq-snapshot-section-bar--tax" />
                      <FileText size={14} style={{ color: '#e67e22', flexShrink: 0 }} />
                      <span className="oq-snapshot-section-label">Mandatory Information</span>
                    </div>
                    <div className="oq-snapshot-grid">
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">{String(snapshotData.gstNumberLabel || 'VAT Number')}</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.gstNumber || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">{String(snapshotData.panNumberLabel || 'PIN Number')}</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.panNumber || '—')}</div>
                      </div>
                      {/* Custom mandatory fields from Company Settings */}
                      {snapshotData.mandatoryCustomFields && Array.isArray(snapshotData.mandatoryCustomFields) && snapshotData.mandatoryCustomFields.length > 0 && (
                        (snapshotData.mandatoryCustomFields as Array<{ id: string; label: string }>).map((cf) => (
                          <div key={cf.id} className="oq-snapshot-field">
                            <div className="oq-snapshot-field-label">{cf.label}</div>
                            <div className="oq-snapshot-field-value">
                              {snapshotData.customFieldValues && (snapshotData.customFieldValues as Record<string, string>)[cf.id]
                                ? String((snapshotData.customFieldValues as Record<string, string>)[cf.id])
                                : '—'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* ─── Bank Details ─── */}
                  <div className="oq-snapshot-section">
                    <div className="oq-snapshot-section-header">
                      <div className="oq-snapshot-section-bar oq-snapshot-section-bar--bank" />
                      <Landmark size={14} style={{ color: '#059669', flexShrink: 0 }} />
                      <span className="oq-snapshot-section-label">Bank Details</span>
                    </div>
                    <div className="oq-snapshot-grid">
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Bank Name</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.bankName || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Account Number</div>
                        <div className={`oq-snapshot-field-value ${snapshotData.bankAccountNumber ? '' : 'oq-snapshot-field-value--empty'}`}>
                          {snapshotData.bankAccountNumber ? (
                            <span className="oq-snapshot-field-value--masked">
                              {'\u25CF'.repeat(8)}{String(snapshotData.bankAccountNumber).slice(-4)}
                            </span>
                          ) : '—'}
                        </div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">IFSC Code</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.bankIfscCode || '—')}</div>
                      </div>
                      <div className="oq-snapshot-field">
                        <div className="oq-snapshot-field-label">Branch</div>
                        <div className="oq-snapshot-field-value">{String(snapshotData.bankBranch || '—')}</div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Additional / Custom Fields ─── */}
                  {((snapshotData.flexiFields && Array.isArray(snapshotData.flexiFields) && snapshotData.flexiFields.length > 0) ||
                    (snapshotData.flexiFieldValues && Object.keys(snapshotData.flexiFieldValues as Record<string, string>).length > 0)) && (
                    <div className="oq-snapshot-section">
                      <div className="oq-snapshot-section-header">
                        <div className="oq-snapshot-section-bar" style={{ background: '#6366f1' }} />
                        <List size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                        <span className="oq-snapshot-section-label" style={{ color: '#6366f1' }}>Additional / Custom Fields</span>
                      </div>
                      <div className="oq-snapshot-grid">
                        {snapshotData.flexiFields && Array.isArray(snapshotData.flexiFields) && snapshotData.flexiFields.length > 0 ? (
                          (snapshotData.flexiFields as Array<{ fieldKey?: string; label: string; fieldType?: string }>).map((f, idx) => {
                            const key = f.fieldKey || f.label;
                            const flexiVals = (snapshotData.flexiFieldValues as Record<string, string>) || {};
                            const val = flexiVals[key] ?? flexiVals[f.label] ?? flexiVals[f.fieldKey || ''];
                            return (
                              <div key={idx} className="oq-snapshot-field">
                                <div className="oq-snapshot-field-label">{f.label}</div>
                                <div className="oq-snapshot-field-value">{val || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not filled</span>}</div>
                              </div>
                            );
                          })
                        ) : (
                          Object.entries(snapshotData.flexiFieldValues as Record<string, string>).map(([key, val], idx) => (
                            <div key={idx} className="oq-snapshot-field">
                              <div className="oq-snapshot-field-label">{key}</div>
                              <div className="oq-snapshot-field-value">{val || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not filled</span>}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* ─── NDA/MNDA Agreement ─── */}
                  {snapshotData.ndaMndaDocument ? (() => {
                    const nda = snapshotData.ndaMndaDocument as Record<string, unknown>;
                    const docType = String(nda.documentType || '');
                    const status = String(nda.status || '');
                    const signedBy = nda.signedBy ? String(nda.signedBy) : null;
                    const signedAt = nda.signedAt ? new Date(String(nda.signedAt)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
                    const viewUrl = nda.viewUrl ? String(nda.viewUrl) : null;
                    return (
                      <div className="oq-snapshot-section">
                        <div className="oq-snapshot-section-header">
                          <div className="oq-snapshot-section-bar" style={{ background: '#107e3e' }} />
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#107e3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                          <span className="oq-snapshot-section-label" style={{ color: '#107e3e' }}>NDA/MNDA Agreement</span>
                        </div>
                        <div className="oq-snapshot-grid">
                          <div className="oq-snapshot-field">
                            <div className="oq-snapshot-field-label">Document Type</div>
                            <div className="oq-snapshot-field-value">{docType === 'MNDA' ? 'MNDA Agreement' : 'NDA Agreement'}</div>
                          </div>
                          <div className="oq-snapshot-field">
                            <div className="oq-snapshot-field-label">Status</div>
                            <div className="oq-snapshot-field-value" style={{ color: '#107e3e', fontWeight: 600 }}>✓ Signed</div>
                          </div>
                          {signedBy && (
                            <div className="oq-snapshot-field">
                              <div className="oq-snapshot-field-label">Signed By</div>
                              <div className="oq-snapshot-field-value">{signedBy}</div>
                            </div>
                          )}
                          {signedAt && (
                            <div className="oq-snapshot-field">
                              <div className="oq-snapshot-field-label">Signed On</div>
                              <div className="oq-snapshot-field-value">{signedAt}</div>
                            </div>
                          )}
                          <div className="oq-snapshot-field oq-snapshot-field--full" style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="oq-btn oq-btn--review"
                              onClick={() => {
                                const contentSnap = String(nda.contentSnapshot || '');
                                if (contentSnap) {
                                  setSignedPreviewDoc({
                                    id: String(nda.id || ''),
                                    vendorId: snapshotTarget?.id || '',
                                    documentType: docType === 'MNDA' ? 'MNDA' : 'NDA',
                                    originalName: `${docType === 'MNDA' ? 'MNDA' : 'NDA'} Signed Agreement`,
                                    fileName: '',
                                    publicUrl: viewUrl || '',
                                    mimeType: 'text/html',
                                    fileSize: 0,
                                    status: 'VERIFIED',
                                    uploadedAt: String(nda.signedAt || ''),
                                    verifiedById: null,
                                    verifiedAt: null,
                                    rejectionReason: null,
                                    contentSnapshot: contentSnap,
                                    signedBy: signedBy || 'Vendor Representative',
                                    signedAt: String(nda.signedAt || ''),
                                  });
                                } else if (viewUrl) {
                                  window.open(documentUrl(viewUrl), '_blank', 'noopener,noreferrer');
                                }
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(180deg,#0a6ed1,#095cb0)', color: '#fff', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <Eye size={15} />
                              View Signed Agreement
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })() : null}

                  {/* ─── Notes ─── */}
                  {snapshotData.onboardingNotes && String(snapshotData.onboardingNotes).trim() ? (
                    <div className="oq-snapshot-section">
                      <div className="oq-snapshot-section-header">
                        <div className="oq-snapshot-section-bar oq-snapshot-section-bar--notes" />
                        <FilePenLine size={14} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                        <span className="oq-snapshot-section-label">Notes</span>
                      </div>
                      <div className="oq-snapshot-notes-box">
                        {String(snapshotData.onboardingNotes)}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="oq-snapshot-empty">
                  <Building size={48} />
                  <p>No profile data available for this vendor.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Signed Agreement Preview Modal — Enterprise Redesign
          ═══════════════════════════════════════════════════════════ */}
      {signedPreviewDoc && createPortal(
        <div className="oq-signed-modal-backdrop" onClick={() => setSignedPreviewDoc(null)}>
          <div className="oq-signed-modal" onClick={(e) => e.stopPropagation()}>
            {/* ── Sticky Header ── */}
            <div className="oq-signed-modal__header">
              <div className="oq-signed-modal__header-left">
                <div className="oq-signed-modal__header-icon">
                  <ShieldCheck size={22} />
                </div>
                <div className="oq-signed-modal__header-info">
                  <div className="oq-signed-modal__header-top">
                    <h3 className="oq-signed-modal__title">
                      {signedPreviewDoc.documentType === 'MNDA' ? 'Mutual Non-Disclosure Agreement' : 'Non-Disclosure Agreement'}
                    </h3>
                    <span className="oq-signed-modal__status-badge">
                      <Check size={12} />
                      Signed
                    </span>
                  </div>
                  <div className="oq-signed-modal__meta">
                    <Calendar size={12} />
                    <div className="oq-signed-modal__meta-signers">
                      <span className="oq-signed-modal__meta-signer">
                        <span className="oq-signed-modal__meta-signer-party">Company</span>
                        <span>{signedPreviewDoc.companySignatoryName || 'Company Representative'}</span>
                        {signedPreviewDoc.companySignedAt && (
                          <span className="oq-signed-modal__meta-signer-date">
                            {new Date(signedPreviewDoc.companySignedAt).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        )}
                      </span>
                      <span className="oq-signed-modal__meta-sep">|</span>
                      <span className="oq-signed-modal__meta-signer">
                        <span className="oq-signed-modal__meta-signer-party">Vendor</span>
                        <span>{signedPreviewDoc.vendorSignatoryName || signedPreviewDoc.signedBy || 'Vendor Representative'}</span>
                        {(signedPreviewDoc.vendorSignedAt || signedPreviewDoc.signedAt) && (
                          <span className="oq-signed-modal__meta-signer-date">
                            {new Date(signedPreviewDoc.vendorSignedAt || signedPreviewDoc.signedAt!).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="oq-signed-modal__header-actions">
                <button
                  type="button"
                  className="oq-signed-modal__btn-download"
                  onClick={() => {
                    if (signedPreviewDoc.contentSnapshot) {
                      const fullHtml = buildSignedDocHtml(signedPreviewDoc.documentType, signedPreviewDoc.contentSnapshot);
                      const blob = new Blob([fullHtml], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${signedPreviewDoc.documentType.replace(/\s+/g, '_')}_Signed_Agreement.html`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }
                  }}
                >
                  <Download size={14} />
                  Download
                </button>
                <button
                  type="button"
                  className="oq-signed-modal__btn-close"
                  onClick={() => setSignedPreviewDoc(null)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ── Document Canvas ── */}
            <div className="oq-signed-modal__body">
              <div className="oq-signed-modal__canvas">
                <div
                  className="oq-signed-modal__content"
                  dangerouslySetInnerHTML={{ __html: signedPreviewDoc.contentSnapshot || '' }}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
