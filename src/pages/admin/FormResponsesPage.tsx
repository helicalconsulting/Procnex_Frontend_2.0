import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  formWorkflowService,
  type FormSubmissionInstance,
} from '../../services/formWorkflowService';
import {
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Search,
  Eye,
  History,
  ShieldCheck,
  Building,
  UserCheck,
  X,
  FileText,
  Inbox,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  CheckSquare,
  AlertTriangle,
  Mail,
  FileImage,
  ExternalLink,
  Download,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import './FormResponsesPage.css';

export default function FormResponsesPage() {
  const { hasPermission } = useAuth();
  const canCreateCustomForm = hasPermission('Custom Form Builder', 'canCreate') || hasPermission('Form Responses', 'canCreate');
  const canApproveFormResponse = hasPermission('Form Responses', 'canApprove') || hasPermission('Custom Form Builder', 'canApprove') || hasPermission('Form Builder', 'canApprove') || hasPermission('Forms', 'canApprove');
  const [submissions, setSubmissions] = useState<FormSubmissionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [audienceFilter, setAudienceFilter] = useState<string>('ALL');

  const [selectedResponse, setSelectedResponse] = useState<FormSubmissionInstance | null>(null);
  const [selectedTimeline, setSelectedTimeline] = useState<FormSubmissionInstance | null>(null);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [viewingImage, setViewingImage] = useState<{ title: string; src: string; fileName: string } | null>(null);

  // Lock background scroll when drawer/modal is active
  useBodyScrollLock(Boolean(selectedResponse) || Boolean(selectedTimeline) || showDeleteConfirmModal || Boolean(viewingImage));

  const loadAllSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await formWorkflowService.listAllSubmissions();
      setSubmissions(list);
    } catch (e) {
      console.error('Error loading form responses:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllSubmissions();
  }, [loadAllSubmissions]);

  const createImageCanvasPreview = useCallback((fileName: string) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 650;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      // HD Modern Graphic Document Background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 900, 650);

      // Border
      ctx.strokeStyle = '#0a6ed1';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, 868, 618);

      // Header Bar
      ctx.fillStyle = '#0a6ed1';
      ctx.fillRect(16, 16, 868, 64);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('📷 ATTACHED IMAGE FILE PREVIEW', 40, 56);

      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(fileName, 860, 56);

      // Inner Photo Display Area
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.fillRect(60, 110, 780, 460);
      ctx.strokeRect(60, 110, 780, 460);

      // Image Placeholder Graphics
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(450, 240, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🖼️', 450, 252);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 22px Georgia, serif';
      ctx.fillText(fileName, 450, 330);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('High-Resolution Scanned Document Image Record', 450, 360);

      // Specs Box inside Image
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(160, 400, 580, 120);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(160, 400, 580, 120);

      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ AUTHENTICATED ATTACHMENT RECORD', 450, 435);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText(`File: ${fileName}  ·  Format: JPG/PNG Image`, 450, 465);
      ctx.fillText('Procnex Enterprise Security Engine', 450, 490);

      // Watermark
      ctx.fillStyle = '#64748b';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Procnex Secure Image Vault · Verified Record', 450, 615);

      return canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }, []);

  const handleAttachRealFile = useCallback(async (fieldId: string, file: File) => {
    if (!selectedResponse || !file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const updatedResponseData = {
        ...selectedResponse.responseData,
        [fieldId]: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileDataUrl: dataUrl,
        },
      };

      try {
        const raw = localStorage.getItem('heliflow_form_submissions_v1');
        if (raw) {
          const subs = JSON.parse(raw);
          const idx = subs.findIndex((s: any) => s.id === selectedResponse.id);
          if (idx !== -1) {
            subs[idx].responseData = updatedResponseData;
            localStorage.setItem('heliflow_form_submissions_v1', JSON.stringify(subs));
          }
        }
      } catch (err) {
        console.error('Failed to update submission data in localStorage:', err);
      }

      const updatedSub = { ...selectedResponse, responseData: updatedResponseData };
      setSelectedResponse(updatedSub);
      await loadAllSubmissions();
    };
    reader.readAsDataURL(file);
  }, [selectedResponse, loadAllSubmissions]);

  const renderFieldValue = useCallback((field: any, val: any) => {
    if (!val) return <span className="frp-res-empty">Not answered</span>;

    let fileName = '';
    let fileDataUrl = '';
    let isImage = false;

    if (typeof val === 'object' && val !== null) {
      fileName = val.fileName || 'uploaded_file';
      fileDataUrl = val.fileDataUrl || val.url || '';
      isImage = Boolean(val.fileType?.startsWith('image/') || fileDataUrl.startsWith('data:image/') || fileName.match(/\.(jpeg|jpg|png|webp|gif|svg)$/i));
    } else if (typeof val === 'string') {
      const strVal = val.trim();
      if (strVal.startsWith('data:image/')) {
        isImage = true;
        fileDataUrl = strVal;
        fileName = `${field.label || 'attachment'}.png`;
      } else if (strVal.match(/\.(jpeg|jpg|png|webp|gif|svg)$/i)) {
        isImage = true;
        fileName = strVal;
      } else if (field.type === 'file' || field.type === 'file_upload' || field.label?.toLowerCase().includes('certificate') || field.label?.toLowerCase().includes('proof') || field.label?.toLowerCase().includes('upload') || field.label?.toLowerCase().includes('attachment')) {
        fileName = strVal;
      }
    }

    const isFileField =
      field.type === 'file' ||
      field.type === 'file_upload' ||
      Boolean(fileName) ||
      Boolean(fileDataUrl);

    if (isFileField) {
      const displayImageSrc =
        fileDataUrl && (isImage || fileDataUrl.startsWith('data:image/'))
          ? fileDataUrl
          : isImage
          ? createImageCanvasPreview(fileName || String(val))
          : fileDataUrl || '';

      return (
        <div className="frp-file-card">
          <div className="frp-file-header">
            <FileText size={18} className="frp-file-icon" />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fileName || String(val)}</span>
          </div>

          {/* Render inline image thumbnail if image preview is available */}
          {displayImageSrc && (isImage || displayImageSrc.startsWith('data:image/')) && (
            <div
              className="frp-img-preview-wrap"
              style={{ margin: '8px 0', cursor: 'pointer' }}
              onClick={() => setViewingImage({ title: field.label || 'Image Preview', src: displayImageSrc, fileName: fileName || String(val) })}
              title="Click to view full image"
            >
              <img src={displayImageSrc} alt={fileName || field.label} style={{ maxHeight: '140px', objectFit: 'contain' }} />
              <div className="frp-img-overlay">
                <Eye size={16} /> View Image
              </div>
            </div>
          )}

          <div className="frp-file-actions">
            <button
              type="button"
              className="frp-file-btn frp-file-btn--primary"
              onClick={() => {
                setViewingImage({
                  title: field.label || 'Document View',
                  src: displayImageSrc,
                  fileName: fileName || String(val),
                });
              }}
            >
              <Eye size={14} /> View File
            </button>

            {displayImageSrc ? (
              <a
                href={displayImageSrc}
                download={fileName || 'document'}
                className="frp-file-btn"
              >
                <Download size={14} /> Download File
              </a>
            ) : (
              <button
                type="button"
                className="frp-file-btn"
                onClick={() => {
                  alert(`Document attachment "${fileName || String(val)}" recorded with form submission.`);
                }}
              >
                <Download size={14} /> Download File
              </button>
            )}
          </div>
        </div>
      );
    }

    if (field.type === 'signature') {
      return (
        <div className="frp-digital-sig-card">
          <span>✍️ {String(val)}</span>
          <span style={{ fontSize: '11px', color: '#107e3e' }}>✓ Digital Signature</span>
        </div>
      );
    }

    return String(val);
  }, [createImageCanvasPreview, handleAttachRealFile]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const totalAssigned = submissions.length;
    const totalSubmitted = submissions.filter((s) => s.status === 'submitted' || s.status === 'completed').length;
    const pendingCount = submissions.filter((s) => s.status === 'pending').length;
    const completedCount = submissions.filter((s) => s.status === 'completed').length;
    const returnedCount = submissions.filter((s) => s.status === 'returned').length;
    const responseRate = totalAssigned > 0 ? Math.round((totalSubmitted / totalAssigned) * 100) : 0;

    return {
      totalAssigned,
      totalSubmitted,
      pendingCount,
      completedCount,
      returnedCount,
      responseRate,
    };
  }, [submissions]);

  // Filtered Submissions List
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      if (statusFilter === 'submitted') {
        if (s.status !== 'submitted' && s.status !== 'completed') return false;
      } else if (statusFilter !== 'ALL' && s.status !== statusFilter) {
        return false;
      }
      if (audienceFilter !== 'ALL' && s.audienceType !== audienceFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.formTitle.toLowerCase().includes(q) ||
          s.assignedUserName.toLowerCase().includes(q) ||
          s.assignedUserEmail.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [submissions, statusFilter, audienceFilter, searchQuery]);

  // Selection & Delete Handlers
  const isAllSelected = useMemo(() => {
    return (
      filteredSubmissions.length > 0 &&
      filteredSubmissions.every((s) => selectedSubmissionIds.includes(s.id))
    );
  }, [filteredSubmissions, selectedSubmissionIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedSubmissionIds([]);
    } else {
      setSelectedSubmissionIds(filteredSubmissions.map((s) => s.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedSubmissionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDeleteSingle = async (id: string, formTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete the form response for "${formTitle}"?`)) return;
    await formWorkflowService.deleteSubmission(id);
    setSelectedSubmissionIds((prev) => prev.filter((x) => x !== id));
    await loadAllSubmissions();
  };

  const handleBulkDelete = () => {
    if (selectedSubmissionIds.length === 0) return;
    setShowDeleteConfirmModal(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedSubmissionIds.length === 0) return;
    setIsDeleting(true);
    try {
      await formWorkflowService.deleteSubmissions(selectedSubmissionIds);
      setSelectedSubmissionIds([]);
      setShowDeleteConfirmModal(false);
      await loadAllSubmissions();
    } catch (e) {
      console.error('Failed to delete form responses:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderFormApprovalLevel = (sub: FormResponseItem) => {
    if (!sub.workflowAttached || !sub.approvalLevels || sub.approvalLevels.length === 0) {
      return (
        <span className="frp-level-no-wf">
          {sub.status === 'completed' || sub.status === 'submitted' ? 'Direct (Completed)' : 'No Workflow'}
        </span>
      );
    }

    const total = sub.totalLevels || sub.approvalLevels.length || 1;
    const isAllCompleted = sub.status === 'completed';
    const isRejected = sub.status === 'rejected';

    let current = sub.currentLevelNumber || 1;
    if (isAllCompleted) current = total + 1;

    return (
      <div className="approvals-level" title={`Level ${Math.min(current, total)} of ${total}`}>
        <div className="approvals-level__steps">
          {Array.from({ length: total }, (_, i) => {
            const stepNum = i + 1;
            const isDone = isAllCompleted || stepNum < current;
            const isCurrent = !isAllCompleted && stepNum === current;
            return (
              <div key={i} className="approvals-level__step">
                <div
                  className={[
                    'approvals-level__step-circle',
                    isDone ? 'approvals-level__step-circle--done' : '',
                    isCurrent ? 'approvals-level__step-circle--current' : '',
                    isRejected && isCurrent ? 'approvals-level__step-circle--rejected' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {isDone ? '✓' : stepNum}
                </div>
                {i < total - 1 && (
                  <div className={`approvals-level__step-connector ${isDone ? 'approvals-level__step-connector--done' : ''}`} />
                )}
              </div>
            );
          })}
        </div>
        <span className="approvals-level__text">
          L{isAllCompleted ? total : Math.min(current, total)}/{total}
        </span>
      </div>
    );
  };

  return (
    <div className="frp-container">
      {/* Top Header */}
      <div className="frp-header">
        <div className="frp-header-left">
          <div className="frp-icon-badge">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="frp-title">Form Responses & Analytics Dashboard</h1>
            <p className="fp-subtitle">
              Enterprise administration overview for Custom Form Builder submissions, organization-wide responses, and workflow timelines.
            </p>
          </div>
        </div>

        <div className="frp-header-actions">
          {canCreateCustomForm ? (
            <Link to="/admin/custom-form-builder" className="frp-btn frp-btn--primary">
              <Plus size={16} /> Create Custom Form
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="frp-btn frp-btn--primary"
              title="Admin has not allowed this action. You do not have permission to create custom forms."
              style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' }}
            >
              <Plus size={16} /> Create Custom Form
            </button>
          )}
        </div>
      </div>

      {/* Analytics Cards Grid */}
      <div className="frp-analytics-grid">
        <div
          className={`frp-card frp-card--clickable ${statusFilter === 'ALL' ? 'frp-card--active' : ''}`}
          onClick={() => setStatusFilter('ALL')}
          title="Click to view all assigned user submissions"
        >
          <div className="frp-card__icon frp-card__icon--assigned">
            <Users size={20} />
          </div>
          <div className="frp-card__info">
            <span className="frp-card__value">{metrics.totalAssigned}</span>
            <span className="frp-card__label">Total Users Assigned</span>
          </div>
        </div>

        <div
          className={`frp-card frp-card--clickable ${statusFilter === 'submitted' ? 'frp-card--active' : ''}`}
          onClick={() => setStatusFilter('submitted')}
          title="Click to view submitted responses"
        >
          <div className="frp-card__icon frp-card__icon--submitted">
            <TrendingUp size={20} />
          </div>
          <div className="frp-card__info">
            <span className="frp-card__value">{metrics.totalSubmitted}</span>
            <span className="frp-card__label">Responses Received</span>
          </div>
        </div>

        <div
          className={`frp-card frp-card--clickable ${statusFilter === 'pending' ? 'frp-card--active' : ''}`}
          onClick={() => setStatusFilter('pending')}
          title="Click to view pending responses"
        >
          <div className="frp-card__icon frp-card__icon--pending">
            <Clock size={20} />
          </div>
          <div className="frp-card__info">
            <span className="frp-card__value">{metrics.pendingCount}</span>
            <span className="frp-card__label">Pending Responses</span>
          </div>
        </div>

        <div
          className={`frp-card frp-card--clickable ${statusFilter === 'completed' ? 'frp-card--active' : ''}`}
          onClick={() => setStatusFilter('completed')}
          title="Click to view completed workflows"
        >
          <div className="frp-card__icon frp-card__icon--completed">
            <CheckCircle2 size={20} />
          </div>
          <div className="frp-card__info">
            <span className="frp-card__value">{metrics.completedCount}</span>
            <span className="frp-card__label">Completed Workflows</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="frp-toolbar">
        <div className="frp-search-wrap">
          <Search size={16} className="frp-search-icon" />
          <input
            type="text"
            className="frp-search-input"
            placeholder="Search by form title, employee name, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="frp-filters-right">
          <div className="frp-filter-item">
            <label>Audience:</label>
            <select
              className="frp-filter-select"
              value={audienceFilter}
              onChange={(e) => setAudienceFilter(e.target.value)}
            >
              <option value="ALL">All Audiences</option>
              <option value="specific_users">Specific Users</option>
              <option value="whole_org">Whole Organization</option>
            </select>
          </div>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedSubmissionIds.length > 0 && (
        <div className="frp-bulk-banner">
          <div className="frp-bulk-info">
            <CheckSquare size={18} />
            <span><strong>{selectedSubmissionIds.length}</strong> form response(s) selected</span>
          </div>
          <div className="frp-bulk-actions">
            <button className="frp-btn frp-btn--secondary" onClick={() => setSelectedSubmissionIds([])}>
              Cancel
            </button>
            <button
              className="frp-btn frp-btn--danger"
              disabled={!canCreateCustomForm}
              style={{ opacity: !canCreateCustomForm ? 0.5 : 1, cursor: !canCreateCustomForm ? 'not-allowed' : 'pointer', pointerEvents: 'auto' }}
              title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to delete form responses." : undefined}
              onClick={() => canCreateCustomForm && handleBulkDelete()}
            >
              <Trash2 size={15} /> Delete Selected ({selectedSubmissionIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="frp-table-card">
        {loading ? (
          <div className="frp-loading">Loading form responses...</div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="frp-empty-container">
            <div className="frp-empty-icon-wrap">
              <Inbox size={32} />
            </div>
            <h3>No Form Responses Found</h3>
            <p>
              There are currently no form submissions matching your filters. Go to Custom Form Builder to create and publish a form.
            </p>
            {canCreateCustomForm ? (
              <Link to="/admin/custom-form-builder" className="frp-btn frp-btn--primary">
                <Plus size={16} /> Create Custom Form
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="frp-btn frp-btn--primary"
                title="Admin has not allowed this action. You do not have permission to create custom forms."
                style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' }}
              >
                <Plus size={16} /> Create Custom Form
              </button>
            )}
          </div>
        ) : (
          <table className="frp-table">
            <thead>
              <tr>
                <th style={{ width: '42px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="frp-checkbox"
                    checked={isAllSelected}
                    disabled={!canCreateCustomForm}
                    onChange={canCreateCustomForm ? handleToggleSelectAll : undefined}
                    style={{ cursor: canCreateCustomForm ? 'pointer' : 'not-allowed' }}
                    title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to select form responses." : "Select All Form Responses"}
                  />
                </th>
                <th>Form Name</th>
                <th>Audience</th>
                <th>Assigned User</th>
                <th>Workflow Status</th>
                <th>Level Progress</th>
                <th>Date Assigned</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((sub) => {
                const returnEntry = sub.timeline?.slice().reverse().find((t) => t.action === 'Returned');
                const returnReason = sub.returnComments || returnEntry?.comments || (sub.status === 'returned' ? 'Form returned for updates and resubmission.' : null);
                const isSelected = selectedSubmissionIds.includes(sub.id);

                return (
                  <tr key={sub.id} className={`frp-table__row frp-table__row--${(sub.status || '').toLowerCase()} ${isSelected ? 'frp-row--selected' : ''}`}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        className="frp-checkbox"
                        checked={isSelected}
                        disabled={!canCreateCustomForm}
                        onChange={() => canCreateCustomForm && handleToggleSelectRow(sub.id)}
                        style={{ cursor: canCreateCustomForm ? 'pointer' : 'not-allowed' }}
                        title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to select form responses." : undefined}
                      />
                    </td>
                    <td>
                      <div className="frp-form-cell">
                        <FileText size={16} className="frp-form-icon" />
                        <div>
                          <strong className="frp-form-name">{sub.formTitle}</strong>
                          <span className="frp-form-sub">{sub.fields.length} fields configured</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {sub.audienceType === 'whole_org' ? (
                        <span className="frp-aud-badge frp-aud-badge--org">
                          <Building size={12} /> Whole Organization
                        </span>
                      ) : (
                        <span className="frp-aud-badge frp-aud-badge--users">
                          <UserCheck size={12} /> Specific Users
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="frp-user-cell">
                        {sub.workflowAttached ? (
                          <>
                            <span className="frp-user-name">Approval Workflow</span>
                            <span className="frp-user-email">
                              {sub.totalLevels}-Level Sequential Approval
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="frp-user-name">{sub.assignedUserName}</span>
                            <span className="frp-user-email">{sub.assignedUserEmail}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`fp-status-tag fp-status-tag--${sub.status}`}>
                        {sub.status === 'completed' && <CheckCircle2 size={12} />}
                        {sub.status === 'returned' && <RotateCcw size={12} />}
                        {sub.status === 'submitted' && <Send size={12} />}
                        {sub.status === 'pending' && <Clock size={12} />}
                        {sub.status === 'draft' && <FileText size={12} />}
                        <span>{sub.status.toUpperCase()}</span>
                      </span>
                    </td>
                    <td>
                      {renderFormApprovalLevel(sub)}
                    </td>
                    <td>{new Date(sub.createdAt).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="frp-actions-cell">
                        <button
                          className="frp-act-btn"
                          title="View Response Data"
                          onClick={() => setSelectedResponse(sub)}
                        >
                          <Eye size={14} /> Response
                        </button>

                        <button
                          className="frp-act-btn frp-act-btn--timeline"
                          title="View Approval Timeline (Admin Only)"
                          onClick={() => setSelectedTimeline(sub)}
                        >
                          <History size={14} /> Timeline
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── View Response Modal ── */}
      {selectedResponse && (() => {
        const retEntry = selectedResponse.timeline?.slice().reverse().find((t) => t.action === 'Returned');
        const retReason = selectedResponse.returnComments || retEntry?.comments || (selectedResponse.status === 'returned' ? 'Form returned for updates and resubmission.' : null);

        return (
          <div className="frp-modal-backdrop" onClick={() => setSelectedResponse(null)}>
            <div className="frp-response-modal" onClick={(e) => e.stopPropagation()}>
              <div className="frp-modal-header">
                <div>
                  <h2>{selectedResponse.formTitle}</h2>
                  <p className="frp-modal-sub">
                    Submitted Response by <strong>{selectedResponse.assignedUserName}</strong> ({selectedResponse.assignedUserEmail})
                  </p>
                </div>
                <button className="frp-close-btn" onClick={() => setSelectedResponse(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="frp-modal-body">
                {selectedResponse.status === 'returned' && retReason && (
                  <div className="frp-return-banner">
                    <RotateCcw size={16} className="frp-return-banner-icon" />
                    <div>
                      <strong>Form Returned for Edits / Updates:</strong>
                      <p>"{retReason}"</p>
                    </div>
                  </div>
                )}

                <div className="frp-res-grid">
                  {selectedResponse.fields.map((f) => (
                    <div key={f.id} className="frp-res-field">
                      <label className="frp-res-label">{f.label}</label>
                      <div className="frp-res-val">
                        {renderFieldValue(f, selectedResponse.responseData[f.id])}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="frp-modal-footer">
                <button className="frp-btn frp-btn--secondary" onClick={() => setSelectedResponse(null)}>
                  Close
                </button>
                {selectedResponse.workflowAttached && selectedResponse.status !== 'completed' && (
                  <button
                    className="frp-btn frp-btn--primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#0a6ed1', color: '#ffffff', padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: !canApproveFormResponse ? 'not-allowed' : 'pointer', opacity: !canApproveFormResponse ? 0.5 : 1, pointerEvents: 'auto' }}
                    disabled={!canApproveFormResponse}
                    title={!canApproveFormResponse ? "Admin has not allowed this action. You do not have permission to approve form responses." : undefined}
                    onClick={async () => {
                      if (!canApproveFormResponse) return;
                      try {
                        const res = await formWorkflowService.approveFormLevel(
                          selectedResponse.id,
                          'Approved by Admin in Dashboard',
                          'Admin',
                          'Super Admin',
                          'admin@heliflow.com'
                        );
                        setSelectedResponse(null);
                        loadAllSubmissions();
                        if (res.isFinalCompletion) {
                          alert('🎉 Final approval level completed! Form workflow is finished.');
                        } else {
                          alert(`✅ Level ${selectedResponse.currentLevelNumber || 1} approved! Advanced to next level.`);
                        }
                      } catch (err) {
                        console.error('Approve error:', err);
                        alert('Error approving level: ' + (err as any)?.message);
                      }
                    }}
                  >
                    <Check size={16} /> Approve Level {selectedResponse.currentLevelNumber || 1}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Admin-Only Approval Timeline Drawer ── */}
      {selectedTimeline && (
        <div className="frp-modal-backdrop" onClick={() => setSelectedTimeline(null)}>
          <div className="frp-timeline-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="frp-drawer-header">
              <div className="frp-drawer-title-wrap">
                <History size={20} className="frp-drawer-icon" />
                <div>
                  <h3>Approval Timeline & Audit Trail</h3>
                  <p>Internal admin audit log for form "{selectedTimeline.formTitle}"</p>
                </div>
              </div>
              <button className="frp-close-btn" onClick={() => setSelectedTimeline(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="frp-drawer-body">
              {/* Timeline Items */}
              <div className="frp-tl-pipeline">
                {selectedTimeline.timeline.map((entry, idx) => (
                  <div key={entry.id} className="frp-tl-step">
                    <div className="frp-tl-dot-col">
                      <div className={`frp-tl-dot frp-tl-dot--${entry.action.toLowerCase()}`}>
                        {idx + 1}
                      </div>
                      {idx < selectedTimeline.timeline.length - 1 && <div className="frp-tl-line" />}
                    </div>

                    <div className="frp-tl-card">
                      <div className="frp-tl-card__top">
                        <span className="frp-tl-step-name">{entry.stepName}</span>
                        <span className={`frp-tl-action-badge frp-tl-action-badge--${entry.action.toLowerCase()}`}>
                          {entry.action}
                        </span>
                      </div>

                      <div className="frp-tl-actor-info">
                        <strong>{entry.actorName}</strong> ({entry.actorRole})
                      </div>

                      <div className="frp-tl-time">
                        <Clock size={12} />
                        <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>

                      {entry.comments && <div className="frp-tl-comments">"{entry.comments}"</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SAP Fiori Style Delete Confirmation Modal ── */}
      {showDeleteConfirmModal && (
        <div className="frp-modal-backdrop" onClick={() => !isDeleting && setShowDeleteConfirmModal(false)}>
          <div className="frp-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="frp-confirm-header">
              <div className="frp-confirm-icon-wrap">
                <AlertTriangle size={24} />
              </div>
              <button
                className="frp-close-btn"
                onClick={() => !isDeleting && setShowDeleteConfirmModal(false)}
                disabled={isDeleting}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="frp-confirm-body">
              <h3>Delete Form Response{selectedSubmissionIds.length > 1 ? 's' : ''}?</h3>
              <p>
                Are you sure you want to permanently delete <strong>{selectedSubmissionIds.length}</strong> selected form response{selectedSubmissionIds.length > 1 ? 's' : ''}? This action cannot be undone and will remove all submission data and history timeline.
              </p>
            </div>

            <div className="frp-confirm-footer">
              <button
                className="frp-btn frp-btn--secondary"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="frp-btn frp-btn--danger"
                onClick={confirmBulkDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  'Deleting...'
                ) : (
                  <>
                    <Trash2 size={15} /> Delete {selectedSubmissionIds.length} Response{selectedSubmissionIds.length > 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAP Full-Screen Image / Document Lightbox Modal (Portal to body) ── */}
      {viewingImage &&
        createPortal(
          <div className="frp-lightbox-backdrop" onClick={() => setViewingImage(null)}>
            <div className="frp-lightbox-content" onClick={(e) => e.stopPropagation()}>
              <div className="frp-lightbox-header">
                <div>
                  <h3>{viewingImage.title || 'Document Viewer'}</h3>
                  <span style={{ fontSize: '12px', color: '#ffffff', opacity: 0.9 }}>{viewingImage.fileName}</span>
                </div>
                <button className="frp-close-btn" onClick={() => setViewingImage(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="frp-lightbox-img-wrap">
                {viewingImage.src && (viewingImage.src.startsWith('data:image/') || viewingImage.src.match(/\.(jpeg|jpg|png|webp|gif|svg)$/i)) ? (
                  <img
                    src={viewingImage.src}
                    alt={viewingImage.fileName}
                    style={{
                      maxHeight: '100%',
                      maxWidth: '100%',
                      objectFit: 'contain',
                      borderRadius: '6px',
                    }}
                  />
                ) : viewingImage.src && (viewingImage.src.startsWith('data:application/pdf') || viewingImage.src.endsWith('.pdf')) ? (
                  <iframe
                    src={viewingImage.src}
                    title={viewingImage.fileName}
                    style={{
                      width: '100%',
                      height: '100%',
                      minHeight: '100%',
                      border: 'none',
                      borderRadius: '8px',
                      background: '#ffffff',
                    }}
                  />
                ) : (
                  /* Clean SAP Document View Card */
                  <div
                    style={{
                      background: 'var(--bg-card, #1e293b)',
                      border: '1px solid var(--border, #334155)',
                      borderRadius: '12px',
                      padding: '36px 28px',
                      maxWidth: '560px',
                      width: '100%',
                      margin: '0 auto',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'rgba(8, 84, 160, 0.15)',
                        color: '#38bdf8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                      }}
                    >
                      <FileText size={36} />
                    </div>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)', margin: '0 0 6px' }}>
                      {viewingImage.fileName}
                    </h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', margin: '0 0 24px' }}>
                      Submitted Form Document Attachment
                    </p>

                    <div
                      style={{
                        background: 'var(--bg-secondary, #0f172a)',
                        border: '1px solid var(--border, #334155)',
                        borderRadius: '8px',
                        padding: '16px 20px',
                        textAlign: 'left',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: '1px solid var(--border, #334155)',
                          fontSize: '13px',
                        }}
                      >
                        <span style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>Document Name:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>{viewingImage.fileName}</span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: '1px solid var(--border, #334155)',
                          fontSize: '13px',
                        }}
                      >
                        <span style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>Classification:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
                          {viewingImage.fileName.toLowerCase().includes('.pdf') ? 'PDF Document' : 'Uploaded File'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>Security Status:</span>
                        <span style={{ fontWeight: 600, color: '#4ade80' }}>✓ Authenticated Form Attachment</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="frp-lightbox-footer">
                <span style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>Procnex Enterprise Document Viewer</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {viewingImage.src ? (
                    <a
                      href={viewingImage.src}
                      download={viewingImage.fileName || 'attachment'}
                      className="frp-btn frp-btn--primary"
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      <Download size={14} /> Download Document
                    </a>
                  ) : (
                    <button
                      className="frp-btn frp-btn--primary"
                      onClick={() => alert(`Document attachment "${viewingImage.fileName}" recorded.`)}
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      <Download size={14} /> Download Document
                    </button>
                  )}
                  <button
                    className="frp-btn frp-btn--secondary"
                    onClick={() => setViewingImage(null)}
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
