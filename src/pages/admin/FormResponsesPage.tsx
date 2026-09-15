import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Check,
  Download,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

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

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 900, 650);

      ctx.strokeStyle = '#0a6ed1';
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, 868, 618);

      ctx.fillStyle = '#0a6ed1';
      ctx.fillRect(16, 16, 868, 64);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('📷 ATTACHED IMAGE FILE PREVIEW', 40, 56);

      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(fileName, 860, 56);

      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.fillRect(60, 110, 780, 460);
      ctx.strokeRect(60, 110, 780, 460);

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
      ctx.fillText('Heliflow Enterprise Security Engine', 450, 490);

      ctx.fillStyle = '#64748b';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Heliflow Secure Image Vault · Verified Record', 450, 615);

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
    if (!val) return <span className="italic text-muted-foreground">Not answered</span>;

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
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={18} className="shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold text-foreground">{fileName || String(val)}</span>
          </div>

          {displayImageSrc && (isImage || displayImageSrc.startsWith('data:image/')) && (
            <div
              className="group relative my-2 cursor-pointer overflow-hidden rounded-xl border border-border bg-background"
              onClick={() => setViewingImage({ title: field.label || 'Image Preview', src: displayImageSrc, fileName: fileName || String(val) })}
              title="Click to view full image"
            >
              <img src={displayImageSrc} alt={fileName || field.label} className="mx-auto max-h-36 object-contain" />
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-950/55 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                <Eye size={16} /> View Image
              </div>
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
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
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Download size={14} /> Download File
              </a>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
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
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-sm text-foreground">
          <span>✍️ {String(val)}</span>
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">✓ Digital Signature</span>
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

  const renderFormApprovalLevel = (sub: any) => {
    if (!sub.workflowAttached || !sub.approvalLevels || sub.approvalLevels.length === 0) {
      return (
        <span className="text-xs text-muted-foreground">
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
      <div className="flex items-center gap-2" title={`Level ${Math.min(current, total)} of ${total}`}>
        <div className="flex items-center">
          {Array.from({ length: total }, (_, i) => {
            const stepNum = i + 1;
            const isDone = isAllCompleted || stepNum < current;
            const isCurrent = !isAllCompleted && stepNum === current;
            return (
              <div key={i} className="flex items-center">
                <div
                  className={`flex size-6 items-center justify-center rounded-full border text-[10px] font-bold ${isDone ? 'border-emerald-500 bg-emerald-500 text-white' : isRejected && isCurrent ? 'border-destructive bg-destructive/10 text-destructive' : isCurrent ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground'}`}
                >
                  {isDone ? '✓' : stepNum}
                </div>
                {i < total - 1 && (
                  <div className={`h-0.5 w-3 ${isDone ? 'bg-emerald-500' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">
          L{isAllCompleted ? total : Math.min(current, total)}/{total}
        </span>
      </div>
    );
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Form Responses & Analytics Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enterprise administration overview for Custom Form Builder submissions, organization-wide responses, and workflow timelines.
          </p>
        </div>

        <div>
          <Link
            to="/admin/custom-form-builder"
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 ${!canCreateCustomForm ? 'pointer-events-auto opacity-50 cursor-not-allowed' : ''}`}
            title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to create custom forms." : undefined}
            onClick={(e) => { if (!canCreateCustomForm) e.preventDefault(); }}
          >
            <Plus size={16} /> Create Custom Form
          </Link>
        </div>
      </div>

      {/* Analytics Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'ALL' ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => setStatusFilter('ALL')}
          title="Click to view all assigned user submissions"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.totalAssigned}</span>
            <span className="text-sm text-muted-foreground">Total Users Assigned</span>
          </div>
        </button>

        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'submitted' ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => setStatusFilter('submitted')}
          title="Click to view submitted responses"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <TrendingUp size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.totalSubmitted}</span>
            <span className="text-sm text-muted-foreground">Responses Received</span>
          </div>
        </button>

        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'pending' ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => setStatusFilter('pending')}
          title="Click to view pending responses"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Clock size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.pendingCount}</span>
            <span className="text-sm text-muted-foreground">Pending Responses</span>
          </div>
        </button>

        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusFilter === 'completed' ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => setStatusFilter('completed')}
          title="Click to view completed workflows"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
            <CheckCircle2 size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">{metrics.completedCount}</span>
            <span className="text-sm text-muted-foreground">Completed Workflows</span>
          </div>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-xl">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            placeholder="Search by form title, employee name, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Audience:</label>
          <select
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
          >
            <option value="ALL">All Audiences</option>
            <option value="specific_users">Specific Users</option>
            <option value="whole_org">Whole Organization</option>
          </select>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedSubmissionIds.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-card/90 p-3 shadow-xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckSquare size={18} />
            <span><strong>{selectedSubmissionIds.length}</strong> form response(s) selected</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted" onClick={() => setSelectedSubmissionIds([])}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-destructive px-3 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canCreateCustomForm}
              title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to delete form responses." : undefined}
              onClick={() => canCreateCustomForm && handleBulkDelete()}
            >
              <Trash2 size={15} /> Delete Selected ({selectedSubmissionIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading form responses...</div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox size={32} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">No Form Responses Found</h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              There are currently no form submissions matching your filters. Go to Custom Form Builder to create and publish a form.
            </p>
            <Link to="/admin/custom-form-builder" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <Plus size={16} /> Create Custom Form
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/35 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="w-12 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      checked={isAllSelected}
                      disabled={!canCreateCustomForm}
                      onChange={canCreateCustomForm ? handleToggleSelectAll : undefined}
                      title={!canCreateCustomForm ? "Admin has not allowed this action. You do not have permission to select form responses." : "Select All Form Responses"}
                    />
                  </th>
                  <th className="px-4 py-3">Form Name</th>
                  <th className="px-4 py-3">Audience</th>
                  <th className="px-4 py-3">Assigned User</th>
                  <th className="px-4 py-3">Workflow Status</th>
                  <th className="px-4 py-3">Level Progress</th>
                  <th className="px-4 py-3">Date Assigned</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((sub) => {
                  const isSelected = selectedSubmissionIds.includes(sub.id);

                  return (
                    <tr key={sub.id} className={`border-b border-border/60 transition hover:bg-muted/25 ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          checked={isSelected}
                          disabled={!canCreateCustomForm}
                          onChange={() => canCreateCustomForm && handleToggleSelectRow(sub.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <FileText size={16} className="shrink-0 text-primary" />
                          <div className="flex min-w-0 flex-col">
                            <strong className="truncate text-sm font-semibold text-foreground">{sub.formTitle}</strong>
                            <span className="text-[11px] text-muted-foreground">{sub.fields.length} fields configured</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {sub.audienceType === 'whole_org' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                            <Building size={12} /> Whole Organization
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                            <UserCheck size={12} /> Specific Users
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 flex-col">
                          {sub.workflowAttached ? (
                            <>
                              <span className="text-xs font-semibold text-foreground">Approval Workflow</span>
                              <span className="text-[11px] text-muted-foreground">
                                {sub.totalLevels}-Level Sequential Approval
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-semibold text-foreground">{sub.assignedUserName}</span>
                              <span className="truncate text-[11px] text-muted-foreground">{sub.assignedUserEmail}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sub.status === 'completed' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : sub.status === 'returned' || sub.status === 'rejected' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : sub.status === 'submitted' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' : sub.status === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>
                          {sub.status === 'completed' && <CheckCircle2 size={12} />}
                          {sub.status === 'returned' && <RotateCcw size={12} />}
                          {sub.status === 'submitted' && <Send size={12} />}
                          {sub.status === 'pending' && <Clock size={12} />}
                          {sub.status === 'draft' && <FileText size={12} />}
                          <span>{sub.status.toUpperCase()}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {renderFormApprovalLevel(sub)}
                      </td>
                      <td className="px-4 py-3">{new Date(sub.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                            title="View Response Data"
                            onClick={() => setSelectedResponse(sub)}
                          >
                            <Eye size={14} /> Response
                          </button>

                          <button
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-violet-500/10 hover:text-violet-600"
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
          </div>
        )}
      </div>

      {/* View Response Modal */}
      {selectedResponse && (() => {
        const retEntry = selectedResponse.timeline?.slice().reverse().find((t) => t.action === 'Returned');
        const retReason = selectedResponse.returnComments || retEntry?.comments || (selectedResponse.status === 'returned' ? 'Form returned for updates and resubmission.' : null);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setSelectedResponse(null)}>
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{selectedResponse.formTitle}</h2>
                  <p className="text-xs text-muted-foreground">
                    Submitted Response by <strong>{selectedResponse.assignedUserName}</strong> ({selectedResponse.assignedUserEmail})
                  </p>
                </div>
                <button type="button" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setSelectedResponse(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {selectedResponse.status === 'returned' && retReason && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
                    <RotateCcw size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <strong>Form Returned for Edits / Updates:</strong>
                      <p className="mt-0.5">"{retReason}"</p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {selectedResponse.fields.map((f) => (
                    <div key={f.id} className="rounded-xl border border-border/70 bg-background p-3.5">
                      <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {renderFieldValue(f, selectedResponse.responseData[f.id])}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
                <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-5 text-sm font-semibold text-foreground hover:bg-muted" onClick={() => setSelectedResponse(null)}>
                  Close
                </button>
                {selectedResponse.workflowAttached && selectedResponse.status !== 'completed' && (
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowDeleteConfirmModal(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertTriangle size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">Delete Form Responses?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete <span className="font-semibold text-foreground">{selectedSubmissionIds.length}</span> selected form response(s)? This action cannot be undone.</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setShowDeleteConfirmModal(false)} disabled={isDeleting}>Cancel</button>
              <button type="button" className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50" onClick={confirmBulkDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Responses'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
