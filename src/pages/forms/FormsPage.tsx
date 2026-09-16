import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  formWorkflowService,
  isRoleMatching,
  type FormSubmissionInstance,
} from '../../services/formWorkflowService';
import {
  ClipboardList,
  Inbox,
  FileText,
  Send,
  CheckCircle2,
  RotateCcw,
  Clock,
  Calendar,
  Eye,
  Edit3,
  X,
  Check,
  Save,
  PenTool,
  Upload,
  User,
  DollarSign,
  Info,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { adminService } from '../../services/adminService';
import type { User as UserType } from '../../types';
import './FormsPage.css';

type ActiveTab = 'pending' | 'approval_pending' | 'submitted' | 'draft' | 'completed' | 'returned';

export default function FormsPage() {
  const { user, roles, hasPermission } = useAuth();
  const canCreateFormResponse = hasPermission('Form Responses', 'canCreate') || hasPermission('Custom Form Builder', 'canCreate') || hasPermission('Form Builder', 'canCreate') || hasPermission('Forms', 'canCreate');
  const canApproveFormResponse = hasPermission('Form Responses', 'canApprove') || hasPermission('Custom Form Builder', 'canApprove') || hasPermission('Form Builder', 'canApprove') || hasPermission('Forms', 'canApprove');
  const currentUserId = String(user?.id || (user as any)?._id || '1');
  const currentUserEmail = user?.email || '';
  const currentUserName = user?.fullName || 'Current Employee';
  const userRoles = useMemo(() => {
    const combined = [...(roles || []), ...((user as any)?.roles || []), user?.role].filter(Boolean) as string[];
    return combined.length > 0 ? [...new Set(combined)] : ['Participant'];
  }, [roles, user]);

  const currentUserRole = user?.role || userRoles[0] || 'Participant';

  const [submissions, setSubmissions] = useState<FormSubmissionInstance[]>([]);
  const [userList, setUserList] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('pending');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmissionInstance | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [returnComments, setReturnComments] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);

  useEffect(() => {
    adminService.listUsers().then((users) => setUserList(users)).catch(() => {});
  }, []);

  // Lock background scroll when modal/drawer is open
  useBodyScrollLock(Boolean(selectedSubmission) || showSuccessModal || showReturnModal);

  // Load submissions
  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await formWorkflowService.listUserSubmissions(currentUserId, currentUserEmail, userRoles);
      setSubmissions(list);
    } catch (e) {
      console.error('Error loading submissions:', e);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, currentUserEmail, userRoles]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Helper to check if current user is an approver for submission's current level
  const isUserApproverForCurrentLevel = useCallback(
    (sub: FormSubmissionInstance) => {
      if (!sub.workflowAttached || !sub.approvalLevels || sub.approvalLevels.length === 0) {
        return false;
      }
      if (sub.status === 'completed' || sub.status === 'returned') return false;

      const activeLevelNum = sub.currentLevelNumber || 1;
      const currentStep = sub.approvalLevels.find((l) => l.levelNumber === activeLevelNum);

      // Step must exist and not already be approved
      if (!currentStep || currentStep.status === 'approved') return false;

      // STRICT: only match exact role for current level — no broad fallbacks
      return isRoleMatching(currentStep.requiredRole, userRoles, currentUserId);
    },
    [userRoles, currentUserId]
  );

  const hasUserApprovedAnyLevel = useCallback(
    (sub: FormSubmissionInstance) => {
      if (!sub.workflowAttached || !sub.approvalLevels) return false;
      return sub.approvalLevels.some(
        (lvl) => lvl.status === 'approved' && isRoleMatching(lvl.requiredRole, userRoles, currentUserId)
      );
    },
    [userRoles, currentUserId]
  );

  // Check if current user's role matches ANY level in this workflow form
  const isWorkflowApproverForAnyLevel = useCallback(
    (sub: FormSubmissionInstance) => {
      if (!sub.workflowAttached || !sub.approvalLevels || sub.approvalLevels.length === 0) return false;
      return sub.approvalLevels.some((lvl) => isRoleMatching(lvl.requiredRole, userRoles, currentUserId));
    },
    [userRoles, currentUserId]
  );

  // Check if current user or their role has ever returned this form at any stage
  const hasUserReturnedForm = useCallback(
    (sub: FormSubmissionInstance) => {
      if (!sub.timeline || !Array.isArray(sub.timeline)) return false;
      return sub.timeline.some(
        (t) => t.action === 'Returned' && (isRoleMatching(t.actorRole, userRoles, currentUserId) || (t.actorName && currentUserName && t.actorName.toLowerCase() === currentUserName.toLowerCase()))
      );
    },
    [userRoles, currentUserId, currentUserName]
  );

  // Categorized filtered lists (Unified Pending Actions tab - no duplication)
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      const isMine =
        (currentUserId && String(s.assignedUserId) === String(currentUserId)) ||
        (currentUserEmail && s.assignedUserEmail?.toLowerCase() === currentUserEmail.toLowerCase());

      const isApproverForCurrent = isUserApproverForCurrentLevel(s);
      const hasApprovedPrior = hasUserApprovedAnyLevel(s);
      // In workflow mode assignedUserId is always Admin/publisher — so approvers
      // must also be able to see the returned form via their role match
      const isWorkflowApprover = isWorkflowApproverForAnyLevel(s);
      const hasReturned = hasUserReturnedForm(s);

      if (activeTab === 'pending' || activeTab === 'approval_pending') {
        return (isMine && s.status === 'pending') || isApproverForCurrent;
      }
      if (activeTab === 'submitted') {
        return isMine && s.status === 'submitted' && !isApproverForCurrent;
      }
      if (activeTab === 'draft') {
        return isMine && s.status === 'draft';
      }
      if (activeTab === 'completed') {
        return s.status === 'completed' || hasApprovedPrior;
      }
      if (activeTab === 'returned') {
        // Show returned forms to:
        // 1. Status is 'returned' (returned at Level 1 to submitter) -> show to assigned user, workflow approvers, or prior approvers
        // 2. OR user/role has returned this form at any stage (e.g. Level 2 approver returned it to Level 1)
        return (s.status === 'returned' && (isMine || isWorkflowApprover || hasApprovedPrior)) || hasReturned;
      }
      return true;
    });
  }, [submissions, activeTab, currentUserId, currentUserEmail, isUserApproverForCurrentLevel, hasUserApprovedAnyLevel, isWorkflowApproverForAnyLevel, hasUserReturnedForm]);

  // Counts for each tab
  const counts = useMemo(() => {
    let pending = 0;
    let submitted = 0;
    let draft = 0;
    let completed = 0;
    let returned = 0;

    submissions.forEach((s) => {
      const isMine =
        (currentUserId && String(s.assignedUserId) === String(currentUserId)) ||
        (currentUserEmail && s.assignedUserEmail?.toLowerCase() === currentUserEmail.toLowerCase());

      const isApproverForCurrent = isUserApproverForCurrentLevel(s);
      const hasApprovedPrior = hasUserApprovedAnyLevel(s);
      const isWorkflowApprover = isWorkflowApproverForAnyLevel(s);
      const hasReturned = hasUserReturnedForm(s);

      if ((isMine && s.status === 'pending') || isApproverForCurrent) pending++;
      if (isMine && s.status === 'submitted' && !isApproverForCurrent) submitted++;
      if (isMine && s.status === 'draft') draft++;
      if (s.status === 'completed' || hasApprovedPrior) completed++;
      if ((s.status === 'returned' && (isMine || isWorkflowApprover || hasApprovedPrior)) || hasReturned) returned++;
    });

    return { pending, approvalPending: pending, submitted, draft, completed, returned };
  }, [submissions, currentUserId, currentUserEmail, isUserApproverForCurrentLevel, hasUserApprovedAnyLevel, isWorkflowApproverForAnyLevel, hasUserReturnedForm]);

  // Auto-switch to Pending My Approval tab if user has approval tasks
  useEffect(() => {
    if (counts.approvalPending > 0 && activeTab === 'pending' && counts.pending === 0) {
      setActiveTab('approval_pending');
    }
  }, [counts.approvalPending, counts.pending, activeTab]);

  // Open Form Filler Modal
  const openFormFiller = (sub: FormSubmissionInstance) => {
    setSelectedSubmission(sub);
    setFormData(sub.responseData || {});
  };

  // Field change handler
  const handleFieldChange = (fieldId: string, val: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: val }));
  };

  // Save Draft handler
  const handleSaveDraft = async () => {
    if (!selectedSubmission) return;
    try {
      await formWorkflowService.saveDraft(selectedSubmission.id, formData);
      await loadSubmissions();
      setPageMsg('Form draft saved successfully!');
    } catch (err) {
      console.error('Save draft error:', err);
      setPageMsg('Error saving form draft');
    }
  };

  // Initial Form Submit Handler (By Recipient Employee or Approver)
  const handleSubmitForm = async () => {
    if (!selectedSubmission) return;
    setSubmitting(true);
    try {
      const isApprover = isUserApproverForCurrentLevel(selectedSubmission);
      if (selectedSubmission.workflowAttached && isApprover) {
        const res = await formWorkflowService.approveFormLevel(
          selectedSubmission.id,
          returnComments || 'Form filled and approved at level 1',
          currentUserName,
          currentUserRole,
          currentUserEmail,
          formData
        );
        await loadSubmissions();
        setSelectedSubmission(null);
        if (res.isFinalCompletion) {
          setPageMsg('🎉 Final approval level completed! Form workflow is finished.');
        } else {
          setPageMsg('✅ Form response submitted and Level 1 approved! Advanced to next level.');
        }
      } else {
        await formWorkflowService.submitFormResponse(
          selectedSubmission.id,
          formData,
          currentUserName,
          currentUserRole
        );
        await loadSubmissions();
        setSelectedSubmission(null);
        setShowSuccessModal(true);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setPageMsg('Error submitting form response');
    } finally {
      setSubmitting(false);
    }
  };

  // Approver Action: Approve Level N
  const handleApproveLevel = async () => {
    if (!selectedSubmission) return;
    setSubmitting(true);
    try {
      const res = await formWorkflowService.approveFormLevel(
        selectedSubmission.id,
        returnComments || 'Approved level sign-off',
        currentUserName,
        currentUserRole,
        currentUserEmail,
        formData
      );
      await loadSubmissions();
      setSelectedSubmission(null);
      setReturnComments('');
      if (res.isFinalCompletion) {
        setPageMsg('🎉 Final approval level completed! Form workflow is finished.');
      } else {
        setPageMsg('✅ Form level approved and advanced to the next level approver!');
      }
    } catch (err) {
      console.error('Approve error:', err);
      setPageMsg('Error approving form level');
    } finally {
      setSubmitting(false);
    }
  };

  // Return Handler
  const handleReturnForm = async () => {
    if (!selectedSubmission) return;
    setSubmitting(true);
    try {
      await formWorkflowService.returnFormResponse(
        selectedSubmission.id,
        returnComments,
        currentUserName,
        currentUserRole
      );
      await loadSubmissions();
      setShowReturnModal(false);
      setSelectedSubmission(null);
      setReturnComments('');
      setPageMsg('Form returned for updates successfully.');
    } catch (err) {
      console.error('Return error:', err);
      setPageMsg('Error returning form');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fp-container">
      {pageMsg && (
        <MessageStrip
          type={inferMessageType(pageMsg)}
          onClose={() => setPageMsg(null)}
          autoHideMs={5000}
          style={{ marginBottom: 16 }}
        >
          {pageMsg}
        </MessageStrip>
      )}

      {/* Header */}
      <div className="fp-header">
        <div className="fp-header-left">
          <div className="fp-icon-badge">
            <ClipboardList size={22} />
          </div>
          <div>
            <h1 className="fp-title">Forms Workspace</h1>
            <p className="fp-subtitle">
              Fill out assigned forms and process sequential multi-level approvals step-by-step.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="fp-tabs-bar">
        <button
          className={`fp-tab-btn ${activeTab === 'pending' || activeTab === 'approval_pending' ? 'fp-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <ShieldCheck size={16} />
          <span>Pending Actions &amp; Approvals</span>
          <span className="fp-tab-badge fp-tab-badge--highlight">{counts.pending}</span>
        </button>

        <button
          className={`fp-tab-btn ${activeTab === 'submitted' ? 'fp-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('submitted')}
        >
          <Clock size={16} />
          <span>My Submitted Forms</span>
          <span className="fp-tab-badge">{counts.submitted}</span>
        </button>



        <button
          className={`fp-tab-btn ${activeTab === 'draft' ? 'fp-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('draft')}
        >
          <FileText size={16} />
          <span>Draft Forms</span>
          <span className="fp-tab-badge">{counts.draft}</span>
        </button>

        <button
          className={`fp-tab-btn ${activeTab === 'completed' ? 'fp-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <CheckCircle2 size={16} />
          <span>Completed</span>
          <span className="fp-tab-badge">{counts.completed}</span>
        </button>

        <button
          className={`fp-tab-btn ${activeTab === 'returned' ? 'fp-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('returned')}
        >
          <RotateCcw size={16} />
          <span>Returned</span>
          <span className="fp-tab-badge">{counts.returned}</span>
        </button>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="fp-loading">Loading assigned forms...</div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="fp-empty-state">
          <Info size={32} className="fp-empty-icon" />
          <h3>No forms found</h3>
          <p>You have no forms under the "{activeTab.replace('_', ' ')}" category at this time.</p>
        </div>
      ) : (
        <div className="fp-cards-grid">
          {filteredSubmissions.map((sub) => {
            const isApproverForSub = isUserApproverForCurrentLevel(sub);
            const hasApprovedPrior = hasUserApprovedAnyLevel(sub);
            const currentRoleNeeded = sub.approvalLevels?.find((l) => l.levelNumber === sub.currentLevelNumber)?.requiredRole || 'Approver';

            return (
              <div key={sub.id} className="fp-card">
                <div className="fp-card__top">
                  <span className={`fp-priority-tag fp-priority-tag--${sub.priority.toLowerCase()}`}>
                    {sub.priority} Priority
                  </span>
                  <span className={`fp-status-tag fp-status-tag--${sub.status === 'completed' ? 'completed' : sub.status === 'returned' ? 'returned' : sub.status}`}>
                    {sub.status === 'completed'
                      ? 'COMPLETED'
                      : sub.status === 'returned'
                      ? 'RETURNED'
                      : sub.status === 'draft'
                      ? 'DRAFT'
                      : sub.status === 'pending'
                      ? 'AWAITING RESPONSE'
                      : sub.workflowAttached && sub.currentLevelNumber > 0
                      ? `PENDING LEVEL ${sub.currentLevelNumber} APPROVAL`
                      : 'SUBMITTED'}
                  </span>
                </div>

                <h3 className="fp-card__title">{sub.formTitle}</h3>
                {sub.formDescription && <p className="fp-card__desc">{sub.formDescription}</p>}

                {sub.workflowAttached && (
                  <div className="fp-card__level-box" style={{ marginBottom: '12px' }}>
                    <div className="fp-card__level-badge">
                      <ShieldCheck size={14} />
                      <span>
                        {sub.status === 'completed'
                          ? 'Completed (All Levels)'
                          : `Level ${sub.currentLevelNumber || 1} of ${sub.totalLevels}: ${currentRoleNeeded}`}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        height: '5px',
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          background: 'linear-gradient(90deg, #0a6ed1, #107e3e)',
                          transition: 'width 0.3s ease',
                          width: `${
                            sub.status === 'completed'
                              ? 100
                              : (() => {
                                  const total = sub.totalLevels || 1;
                                  const approvedByStatus = (sub.approvalLevels || []).filter((l) => l.status === 'approved').length;
                                  const approvedByNum = (sub.currentLevelNumber || 1) - 1;
                                  const approvedCount = Math.max(approvedByStatus, approvedByNum);
                                  const pct = (approvedCount / total) * 100;
                                  return Math.max(5, Math.min(100, pct));
                                })()
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="fp-card__meta">
                  <div className="fp-meta-item">
                    <User size={13} />
                    {sub.workflowAttached ? (
                      <span>
                        {sub.status === 'completed'
                          ? <>All Levels <strong>Approved ✓</strong></>
                          : <>Current Approver: <strong>{currentRoleNeeded}</strong></>}
                      </span>
                    ) : (
                      <span>Assigned To: <strong>{sub.assignedUserName}</strong></span>
                    )}
                  </div>
                  <div className="fp-meta-item">
                    <Calendar size={13} />
                    <span>Due Date: <strong>{sub.dueDate}</strong></span>
                  </div>
                  <div className="fp-meta-item">
                    <Clock size={13} />
                    <span>Created: {new Date(sub.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="fp-card__footer">
                  <button className="fp-card-btn" onClick={() => openFormFiller(sub)}>
                    {isApproverForSub ? (
                      <>
                        <ShieldCheck size={15} /> Review &amp; Approve Level {sub.currentLevelNumber}
                      </>
                    ) : activeTab === 'returned' || sub.status === 'returned' ? (
                      <>
                        <RotateCcw size={15} /> View Returned Form
                      </>
                    ) : sub.status === 'completed' || sub.status === 'submitted' ? (
                      <>
                        <Eye size={15} /> View Form Response
                      </>
                    ) : (
                      <>
                        <Edit3 size={15} /> Fill Form
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Form Filler & Approver Drawer Modal ── */}
      {selectedSubmission && (() => {
        const isApproverForSub = isUserApproverForCurrentLevel(selectedSubmission);
        const isRecipientSubmitter =
          (currentUserId && String(selectedSubmission.assignedUserId) === String(currentUserId)) ||
          (currentUserEmail && selectedSubmission.assignedUserEmail?.toLowerCase() === currentUserEmail.toLowerCase());

        return (
          <div className="fp-filler-backdrop" onClick={() => setSelectedSubmission(null)}>
            <div className="fp-filler-modal" onClick={(e) => e.stopPropagation()}>
              <div className="fp-filler__header">
                <div>
                  <h2>{selectedSubmission.formTitle}</h2>
                  <p className="fp-filler__assigned-note">
                    {selectedSubmission.status === 'returned'
                      ? `⚠️ Returned at Level ${selectedSubmission.currentLevelNumber} — Pending revision`
                      : isApproverForSub
                      ? `Approver Review (Level ${selectedSubmission.currentLevelNumber} of ${selectedSubmission.totalLevels})`
                      : `Form Submission for ${selectedSubmission.assignedUserName}`}
                  </p>
                </div>
                <button className="fp-close-btn" onClick={() => setSelectedSubmission(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Returned reason banner */}
              {selectedSubmission.status === 'returned' && (() => {
                const retEntry = selectedSubmission.timeline?.slice().reverse().find((t: any) => t.action === 'Returned');
                const retReason = retEntry?.comments || 'Form returned for revision.';
                const retActor = retEntry?.actorName ? `${retEntry.actorName} (${retEntry.actorRole || 'Approver'})` : 'Approver';
                return (
                  <div style={{
                    margin: '0 0 4px',
                    padding: '12px 20px',
                    background: 'rgba(233,115,12,0.08)',
                    border: '1px solid rgba(233,115,12,0.3)',
                    borderLeft: '4px solid #e9730c',
                    borderRadius: '4px',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e9730c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                      ⚠️ Returned for Revision — by {retActor}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>{retReason}</div>
                  </div>
                );
              })()}

              <div className="fp-filler__body">

                {/* Form Fields Canvas Render */}
                {selectedSubmission.fields.map((field) => {
                  const val = formData[field.id] || '';
                  // Read-only when: completed, OR the viewer is not the assigned user (approver viewing returned form)
                  const isAssignedUser =
                    (currentUserId && String(selectedSubmission.assignedUserId) === String(currentUserId)) ||
                    (currentUserEmail && selectedSubmission.assignedUserEmail?.toLowerCase() === currentUserEmail.toLowerCase());
                  const isReadOnly =
                    selectedSubmission.status === 'completed' ||
                    (selectedSubmission.status === 'returned' && !isAssignedUser) ||
                    field.readOnly;

                  return (
                    <div key={field.id} className={`fp-field-group fp-field-group--${field.width || 'full'}`}>
                      {field.type === 'heading' ? (
                        <h3 className="fp-field-heading">{field.content || field.label}</h3>
                      ) : field.type === 'paragraph' ? (
                        <p className="fp-field-paragraph">{field.content}</p>
                      ) : field.type === 'divider' ? (
                        <hr className="fp-field-divider" />
                      ) : (
                        <>
                          <label className="fp-field-label">
                            {field.label} {field.required && <span className="fp-required">*</span>}
                          </label>

                          {field.type === 'textarea' ? (
                            <textarea
                              className="fp-field-input fp-field-textarea"
                              placeholder={field.placeholder}
                              value={val}
                              disabled={isReadOnly}
                              onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            />
                          ) : field.type === 'dropdown' ? (
                            <select
                              className="fp-field-select"
                              value={val}
                              disabled={isReadOnly}
                              onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            >
                              <option value="">Select option...</option>
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === 'radio' ? (
                            <div className="fp-radio-group">
                              {field.options?.map((opt) => (
                                <label key={opt} className="fp-radio-item">
                                  <input
                                    type="radio"
                                    name={field.id}
                                    value={opt}
                                    checked={val === opt}
                                    disabled={isReadOnly}
                                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                          ) : field.type === 'checkbox' ? (
                            <label className="fp-checkbox-item">
                              <input
                                type="checkbox"
                                checked={Boolean(val)}
                                disabled={isReadOnly}
                                onChange={(e) => handleFieldChange(field.id, e.target.checked)}
                              />
                              <span>{field.placeholder || field.label}</span>
                            </label>
                          ) : field.type === 'signature' ? (
                            <div className="fp-signature-box">
                              <PenTool size={18} />
                              <input
                                type="text"
                                className="fp-field-input"
                                placeholder="Type Full Name for Digital Signature..."
                                value={val}
                                disabled={isReadOnly}
                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                              />
                            </div>
                          ) : field.type === 'currency' ? (
                            <div className="fp-currency-wrap">
                              <DollarSign size={16} className="fp-curr-icon" />
                              <input
                                type="number"
                                className="fp-field-input fp-field-input--currency"
                                placeholder={field.placeholder || '0.00'}
                                value={val}
                                disabled={isReadOnly}
                                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                              />
                            </div>
                          ) : field.type === 'file' ? (
                            <div className="fp-file-upload-box">
                              <Upload size={18} />
                              <span>
                                {typeof val === 'object' && val?.fileName
                                  ? `Uploaded File: ${val.fileName}`
                                  : val
                                  ? `Uploaded File: ${String(val)}`
                                  : 'Choose Image / PDF / Doc attachment to upload'}
                              </span>
                              {!isReadOnly && (
                                <input
                                  type="file"
                                  accept="image/*,application/pdf,.doc,.docx,.xlsx,.txt"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (evt) => {
                                        const dataUrl = evt.target?.result as string;
                                        handleFieldChange(field.id, {
                                          fileName: file.name,
                                          fileType: file.type,
                                          fileSize: file.size,
                                          fileDataUrl: dataUrl,
                                        });
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              )}
                            </div>
                          ) : field.type === 'user_picker' ? (
                            <select
                              className="fp-field-select"
                              value={val}
                              disabled={isReadOnly}
                              onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            >
                              <option value="">Select Employee / User...</option>
                              {userList.map((u) => (
                                <option key={u.id} value={u.fullName}>{u.fullName} ({u.email})</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
                              className="fp-field-input"
                              placeholder={field.placeholder}
                              value={val}
                              disabled={isReadOnly}
                              onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            />
                          )}
                          {field.helpText && <span className="fp-field-help">{field.helpText}</span>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer Buttons */}
              <div className="fp-filler__footer">
                <button className="fp-btn fp-btn--secondary" onClick={() => setSelectedSubmission(null)}>
                  Close
                </button>

                {selectedSubmission.status !== 'completed' && (
                  <div className="fp-filler__footer-right">
                    {/* Return Form button only visible in approval workflow when workflow is attached */}
                    {selectedSubmission.workflowAttached && isApproverForSub && (
                      <button
                        className="fp-btn fp-btn--return"
                        disabled={submitting || !canApproveFormResponse}
                        style={!canApproveFormResponse ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                        title={!canApproveFormResponse ? "Admin has not allowed this action. You do not have permission to return form responses." : undefined}
                        onClick={() => setShowReturnModal(true)}
                      >
                        <RotateCcw size={15} /> Return Form
                      </button>
                    )}

                    {/* Save Draft if filling out */}
                    {(selectedSubmission.status === 'pending' || selectedSubmission.status === 'draft' || selectedSubmission.status === 'returned') && (
                      <button
                        className="fp-btn fp-btn--draft"
                        disabled={submitting || !canCreateFormResponse}
                        style={!canCreateFormResponse ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                        title={!canCreateFormResponse ? "Admin has not allowed this action. You do not have permission to save form responses." : undefined}
                        onClick={handleSaveDraft}
                      >
                        <Save size={15} /> Save Draft
                      </button>
                    )}

                    {/* Submit / Approve button */}
                    {isApproverForSub ? (
                      <button
                        className="fp-btn fp-btn--submit"
                        disabled={submitting || !canApproveFormResponse}
                        style={!canApproveFormResponse ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                        title={!canApproveFormResponse ? "Admin has not allowed this action. You do not have permission to approve form responses." : undefined}
                        onClick={handleApproveLevel}
                      >
                        <Check size={16} />
                        {submitting
                          ? 'Processing...'
                          : (selectedSubmission.currentLevelNumber || 1) >= selectedSubmission.totalLevels
                          ? 'Submit & Finalize Approval'
                          : `Submit & Approve Level ${selectedSubmission.currentLevelNumber || 1}`}
                      </button>
                    ) : (
                      <button
                        className="fp-btn fp-btn--submit"
                        disabled={submitting || !canCreateFormResponse}
                        style={!canCreateFormResponse ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                        title={!canCreateFormResponse ? "Admin has not allowed this action. You do not have permission to submit form responses." : undefined}
                        onClick={handleSubmitForm}
                      >
                        <Send size={16} />
                        {submitting ? 'Submitting...' : 'Submit Form'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Success Screen Modal ── */}
      {showSuccessModal && (
        <div className="fp-success-backdrop" onClick={() => setShowSuccessModal(false)}>
          <div className="fp-success-card" onClick={(e) => e.stopPropagation()}>
            <div className="fp-success-icon-wrap">
              <Zap size={36} />
            </div>
            <h2>✅ Thank You!</h2>
            <p className="fp-success-title">Thank you for your response.</p>
            <p className="fp-success-msg">
              Your form response has been submitted successfully and routed to Level 1 approval.
            </p>
            <button className="fp-btn fp-btn--submit" onClick={() => setShowSuccessModal(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Return Form Comments Modal ── */}
      {showReturnModal && (
        <div className="fp-success-backdrop" onClick={() => setShowReturnModal(false)}>
          <div className="fp-return-card" onClick={(e) => e.stopPropagation()}>
            <h3>Return Form For Edits</h3>
            <p>Please enter the reason for returning this form response:</p>
            <textarea
              className="fp-field-input fp-field-textarea"
              placeholder="Provide clear instructions on what needs revision..."
              value={returnComments}
              onChange={(e) => setReturnComments(e.target.value)}
            />
            <div className="fp-return-actions">
              <button className="fp-btn fp-btn--secondary" onClick={() => setShowReturnModal(false)}>
                Cancel
              </button>
              <button className="fp-btn fp-btn--return" onClick={handleReturnForm} disabled={submitting}>
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
