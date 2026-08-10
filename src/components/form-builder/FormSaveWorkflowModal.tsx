import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  GitMerge,
  Check,
  X,
  Users,
  Building,
  UserCheck,
  Search,
  Calendar,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Send,
  FileText,
  Clock,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Shield,
  Layers,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { companySettingsService } from '../../services/companySettingsService';
import { useAuth } from '../../context/AuthContext';
import type { User } from '../../types';
import type { AudienceType } from '../../services/formWorkflowService';
import { MessageStrip } from '../shared/MessageStrip';
import './FormSaveWorkflowModal.css';

interface FormSaveWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAsDraft: () => void;
  onConfigureWorkflow: (audience: AudienceType, selectedUserIds: string[]) => void;
  onPublishForm: (data: {
    audienceType: AudienceType;
    selectedUserIds: string[];
    attachWorkflow: boolean;
    matrixLevels?: LocalMatrixLevel[];
    dueDate: string;
    priority: 'High' | 'Medium' | 'Low';
  }) => void;
  formTitle: string;
}

interface LocalMatrixLevel {
  id: string;
  levelNumber: number;
  requiredRole: string;
  timeLimitHours: number;
}

const SAVED_APPROVAL_MATRIX_KEY = 'heliflow_saved_approval_matrix_v1';

const getInitialMatrixLevels = (): LocalMatrixLevel[] => {
  try {
    const raw = localStorage.getItem(SAVED_APPROVAL_MATRIX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load saved approval matrix:', e);
  }
  return [
    { id: 'lvl-1', levelNumber: 1, requiredRole: 'Purchase Clerk', timeLimitHours: 24 },
    { id: 'lvl-2', levelNumber: 2, requiredRole: 'Purchase Clerk', timeLimitHours: 48 },
  ];
};

export const saveMatrixLevelsToStorage = (levels: LocalMatrixLevel[]) => {
  try {
    localStorage.setItem(SAVED_APPROVAL_MATRIX_KEY, JSON.stringify(levels));
  } catch (e) {
    console.error('Failed to save approval matrix to localStorage:', e);
  }
};

export default function FormSaveWorkflowModal({
  isOpen,
  onClose,
  onSaveAsDraft,
  onConfigureWorkflow,
  onPublishForm,
  formTitle,
}: FormSaveWorkflowModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const { user: currentUser } = useAuth();
  const [audienceType, setAudienceType] = useState<AudienceType>('specific_users');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userList, setUserList] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [attachWorkflow, setAttachWorkflow] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Approval Matrix Configuration State
  const [showMatrixEditor, setShowMatrixEditor] = useState(false);
  const [matrixLevels, setMatrixLevels] = useState<LocalMatrixLevel[]>(getInitialMatrixLevels);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [addRole, setAddRole] = useState('');
  const [addTimeLimit, setAddTimeLimit] = useState(24);
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0]
  );
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');

  // Reset state on open and load backend approval matrix
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setAttachWorkflow(false);
      setSelectedUserIds([]);
      setModalError(null);
      setShowMatrixEditor(false);

      adminService
        .listApprovalLevels()
        .then((levels) => {
          const formLevels = levels
            .filter((l) => l.module === 'CustomForms' || l.module === 'CustomForm')
            .sort((a, b) => a.levelNumber - b.levelNumber);

          if (formLevels.length > 0) {
            const backendLevels: LocalMatrixLevel[] = formLevels.map((l) => ({
              id: String(l.id || `lvl-${l.levelNumber}`),
              levelNumber: l.levelNumber,
              requiredRole: l.requiredRole,
              timeLimitHours: l.timeLimitHours ?? 24,
            }));
            setMatrixLevels(backendLevels);
            saveMatrixLevelsToStorage(backendLevels);
          } else {
            setMatrixLevels(getInitialMatrixLevels());
          }
        })
        .catch(() => {
          setMatrixLevels(getInitialMatrixLevels());
        });
    }
  }, [isOpen]);

  useEffect(() => {
    adminService.listUsers().then((users) => {
      setUserList(users);
    }).catch(() => {});

    companySettingsService
      .listPositions()
      .then((positions) => {
        const activeNames = (positions || [])
          .filter((p) => p.isActive)
          .map((p) => p.name)
          .sort();

        const finalRoles =
          activeNames.length > 0
            ? [...new Set(activeNames)]
            : ['Procurement Manager', 'Finance Manager', 'Finance Approver', 'Administrator', 'Super Admin'];

        setRoleOptions(finalRoles);
        if (finalRoles.length > 0) {
          setAddRole(finalRoles[0]);
        }
      })
      .catch(() => {
        const fallbacks = ['Procurement Manager', 'Finance Manager', 'Finance Approver', 'Administrator', 'Super Admin'];
        setRoleOptions(fallbacks);
        setAddRole(fallbacks[0]);
      });
  }, []);

  // Filter out current admin creator and Super Admins from form target assignment list
  const eligibleUsers = useMemo(() => {
    return userList.filter((u) => {
      if (!u.isActive) return false;
      if (
        currentUser &&
        (u.id === currentUser.id ||
          u.email.toLowerCase() === currentUser.email?.toLowerCase() ||
          u.role === 'Super Admin' ||
          u.role === 'Administrator' ||
          u.role === 'admin')
      ) {
        return false;
      }
      return true;
    });
  }, [userList, currentUser]);

  // Filtered users search list
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return eligibleUsers;
    const q = searchQuery.toLowerCase();
    return eligibleUsers.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q))
    );
  }, [eligibleUsers, searchQuery]);

  const handleAddLevel = () => {
    if (!addRole) return;
    const newLvl: LocalMatrixLevel = {
      id: `lvl-${Date.now()}`,
      levelNumber: matrixLevels.length + 1,
      requiredRole: addRole,
      timeLimitHours: addTimeLimit,
    };
    setMatrixLevels((prev) => {
      const next = [...prev, newLvl];
      saveMatrixLevelsToStorage(next);
      return next;
    });
  };

  const handleMoveLevel = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= matrixLevels.length) return;
    const updated = [...matrixLevels];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    updated.forEach((lvl, i) => {
      lvl.levelNumber = i + 1;
    });
    setMatrixLevels(updated);
    saveMatrixLevelsToStorage(updated);
  };

  const handleDeleteLevel = (index: number) => {
    const updated = matrixLevels.filter((_, i) => i !== index);
    updated.forEach((lvl, i) => {
      lvl.levelNumber = i + 1;
    });
    setMatrixLevels(updated);
    saveMatrixLevelsToStorage(updated);
  };

  const [savingMatrix, setSavingMatrix] = useState(false);

  const handleSaveMatrix = async () => {
    setSavingMatrix(true);
    saveMatrixLevelsToStorage(matrixLevels);
    try {
      const existing = await adminService.listApprovalLevels();
      const customLevels = existing.filter((l) => l.module === 'CustomForms' || l.module === 'CustomForm');
      for (const cl of customLevels) {
        try {
          await adminService.deleteApprovalLevel(cl.id);
        } catch (e) {}
      }
      for (const lvl of matrixLevels) {
        try {
          await adminService.createApprovalLevel({
            module: 'CustomForms',
            levelNumber: lvl.levelNumber,
            requiredRole: lvl.requiredRole,
            timeLimitHours: lvl.timeLimitHours,
          });
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error saving approval matrix:', err);
    } finally {
      setSavingMatrix(false);
    }
    setAttachWorkflow(true);
    setShowMatrixEditor(false);
  };

  if (!isOpen) return null;

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredUsers.map((u) => String(u.id));
    setSelectedUserIds((prev) => [...new Set([...prev, ...allFilteredIds])]);
  };

  const handleClearSelection = () => {
    setSelectedUserIds([]);
  };

  const handleNextStep = () => {
    if (audienceType === 'specific_users' && selectedUserIds.length === 0) {
      setModalError('Please select at least one recipient user or choose Whole Organization.');
      return;
    }
    setModalError(null);
    setStep(2);
  };

  const handlePublish = async () => {
    saveMatrixLevelsToStorage(matrixLevels);
    if (attachWorkflow && matrixLevels.length > 0) {
      try {
        const existing = await adminService.listApprovalLevels();
        const customLevels = existing.filter((l) => l.module === 'CustomForms' || l.module === 'CustomForm');
        if (customLevels.length === 0) {
          for (const lvl of matrixLevels) {
            try {
              await adminService.createApprovalLevel({
                module: 'CustomForms',
                levelNumber: lvl.levelNumber,
                requiredRole: lvl.requiredRole,
                timeLimitHours: lvl.timeLimitHours,
              });
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    onPublishForm({
      audienceType,
      selectedUserIds: audienceType === 'whole_org' ? userList.map((u) => String(u.id)) : selectedUserIds,
      attachWorkflow,
      matrixLevels,
      dueDate,
      priority,
    });
  };

  return createPortal(
    <>
      <div className="fwm-backdrop" style={{ zIndex: 99999 }} onClick={onClose}>
        <div className="fwm-modal" onClick={(e) => e.stopPropagation()}>
          {/* Top Header */}
          <div className="fwm-modal__header">
            <div className="fwm-modal__header-left">
              <div className="fwm-icon-badge">
                <GitMerge size={22} />
              </div>
              <div>
                <h2 className="fwm-modal__title">Form Distribution & Workflow</h2>
                <p className="fwm-modal__subtitle">
                  Form: <strong>{formTitle || 'Untitled Custom Form'}</strong>
                </p>
              </div>
            </div>
            <button className="fwm-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>

          {/* Wizard Steps Indicator */}
          <div className="fwm-steps-bar">
            <div className={`fwm-step-pill ${step === 1 ? 'fwm-step-pill--active' : 'fwm-step-pill--completed'}`}>
              <span className="fwm-step-num">1</span>
              <span className="fwm-step-label">Select Form Audience</span>
            </div>
            <div className="fwm-step-divider" />
            <div className={`fwm-step-pill ${step === 2 ? 'fwm-step-pill--active' : ''}`}>
              <span className="fwm-step-num">2</span>
              <span className="fwm-step-label">Attach Workflow & Distribute</span>
            </div>
          </div>

          {modalError && (
            <MessageStrip type="error" compact onClose={() => setModalError(null)} style={{ margin: '12px 24px 0' }}>
              {modalError}
            </MessageStrip>
          )}

          {/* Body Content */}
          <div className="fwm-body">
            {step === 1 ? (
              /* ── STEP 1: AUDIENCE SELECTION ── */
              <div className="fwm-step-content">
                <div className="fwm-section-title">
                  <Users size={16} />
                  <span>Who should receive this form?</span>
                </div>

                {/* Audience Type Radio Cards */}
                <div className="fwm-audience-grid">
                  <div
                    className={`fwm-audience-card ${audienceType === 'specific_users' ? 'fwm-audience-card--selected' : ''}`}
                    onClick={() => setAudienceType('specific_users')}
                  >
                    <div className="fwm-audience-card__icon">
                      <UserCheck size={22} />
                    </div>
                    <div className="fwm-audience-card__info">
                      <h4>Specific User(s)</h4>
                      <p>Assign to one or multiple specific employees or managers.</p>
                    </div>
                    <div className="fwm-audience-card__radio">
                      <div className="fwm-radio-dot" />
                    </div>
                  </div>

                  <div
                    className={`fwm-audience-card ${audienceType === 'whole_org' ? 'fwm-audience-card--selected' : ''}`}
                    onClick={() => setAudienceType('whole_org')}
                  >
                    <div className="fwm-audience-card__icon fwm-audience-card__icon--org">
                      <Building size={22} />
                    </div>
                    <div className="fwm-audience-card__info">
                      <h4>Whole Organization</h4>
                      <p>Publish to every active employee across the organization ({eligibleUsers.length} users).</p>
                    </div>
                    <div className="fwm-audience-card__radio">
                      <div className="fwm-radio-dot" />
                    </div>
                  </div>
                </div>

                {/* User Selection Box (If Specific Users Selected) */}
                {audienceType === 'specific_users' && (
                  <div className="fwm-user-picker-container">
                    <div className="fwm-user-picker__header">
                      <div className="fwm-user-search-wrap">
                        <Search size={15} className="fwm-search-icon" />
                        <input
                          type="text"
                          className="fwm-user-search-input"
                          placeholder="Search employee by name, email, department..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="fwm-user-picker__actions">
                        <button type="button" className="fwm-link-btn" onClick={handleSelectAllFiltered}>
                          Select All
                        </button>
                        <button type="button" className="fwm-link-btn fwm-link-btn--muted" onClick={handleClearSelection}>
                          Clear ({selectedUserIds.length})
                        </button>
                      </div>
                    </div>

                    {/* Selected count badge */}
                    <div className="fwm-selected-count-strip">
                      <Check size={14} />
                      <span>
                        {selectedUserIds.length} user{selectedUserIds.length !== 1 ? 's' : ''} selected for assignment
                      </span>
                    </div>

                    {/* Users list grid */}
                    <div className="fwm-user-list">
                      {filteredUsers.map((u) => {
                        const isSelected = selectedUserIds.includes(String(u.id));
                        return (
                          <div
                            key={u.id}
                            className={`fwm-user-item ${isSelected ? 'fwm-user-item--selected' : ''}`}
                            onClick={() => toggleUserSelection(String(u.id))}
                          >
                            <div className="fwm-user-item__avatar">
                              {u.fullName.split(' ').map((n) => n[0]).join('').substring(0, 2)}
                            </div>
                            <div className="fwm-user-item__info">
                              <span className="fwm-user-item__name">{u.fullName}</span>
                              <span className="fwm-user-item__email">{u.email}</span>
                            </div>
                            <div className={`fwm-checkbox ${isSelected ? 'fwm-checkbox--checked' : ''}`}>
                              {isSelected && <Check size={12} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {audienceType === 'whole_org' && (
                  <div className="fwm-org-notice">
                    <Sparkles size={18} />
                    <div>
                      <strong>Organization-Wide Distribution Mode</strong>
                      <p>
                        Upon publishing, an independent submission & workflow instance will be created for each employee.
                        Employees submit individually and progress through their approval pipeline.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── STEP 2: WORKFLOW ATTACHMENT & PUBLISH ── */
              <div className="fwm-step-content">
                <div className="fwm-section-title">
                  <GitMerge size={16} />
                  <span>Workflow & Distribution Settings</span>
                </div>

                {/* Attach Workflow Toggle Box */}
                <div className="fwm-workflow-toggle-box">
                  <div className="fwm-wf-toggle-left">
                    <div className="fwm-wf-toggle-icon">
                      <GitMerge size={20} />
                    </div>
                    <div>
                      <h4>Attach Approval Workflow</h4>
                      <p>
                        Connect Approval Levels matrix (Level 1 → Level 2 → Level 3) so form submissions progress sequentially through each level before final completion.
                      </p>
                    </div>
                  </div>
                  <label className="fwm-switch">
                    <input
                      type="checkbox"
                      checked={attachWorkflow}
                      onChange={(e) => setAttachWorkflow(e.target.checked)}
                    />
                    <span className="fwm-slider" />
                  </label>
                </div>

                {/* Options Breakdown */}
                <div className="fwm-meta-grid">
                  <div className="fwm-meta-field">
                    <label>
                      <Calendar size={14} /> Due Date
                    </label>
                    <input
                      type="date"
                      className="fwm-meta-input"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>

                  <div className="fwm-meta-field">
                    <label>
                      <Clock size={14} /> Priority Level
                    </label>
                    <select
                      className="fwm-meta-select"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                    >
                      <option value="High">🔴 High Priority</option>
                      <option value="Medium">🟡 Medium Priority</option>
                      <option value="Low">🟢 Low Priority</option>
                    </select>
                  </div>
                </div>

                <div className="fwm-summary-strip">
                  <AlertCircle size={16} />
                  <span>
                    Ready to publish to{' '}
                    <strong>
                      {audienceType === 'whole_org'
                        ? 'Whole Organization (All Active Employees)'
                        : `${selectedUserIds.length} Selected Users`}
                    </strong>
                    {attachWorkflow
                      ? ` with ${matrixLevels.length}-level sequential approval workflow attached.`
                      : ' directly (no approval levels attached).'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="fwm-footer">
            {step === 1 ? (
              <>
                <button type="button" className="fwm-btn fwm-btn--secondary" onClick={onClose}>
                  Cancel
                </button>
                <div className="fwm-footer-right">
                  <button type="button" className="fwm-btn fwm-btn--draft" onClick={onSaveAsDraft}>
                    <FileText size={15} />
                    Save as Draft
                  </button>
                  <button type="button" className="fwm-btn fwm-btn--primary" onClick={handleNextStep}>
                    Next: Workflow Options
                    <ChevronRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button type="button" className="fwm-btn fwm-btn--secondary" onClick={() => setStep(1)}>
                  <ChevronLeft size={16} />
                  Back
                </button>
                <div className="fwm-footer-right">
                  <button
                    type="button"
                    className="fwm-btn fwm-btn--configure-wf"
                    onClick={() => setShowMatrixEditor(true)}
                  >
                    <GitMerge size={15} />
                    Configure Approval Matrix {matrixLevels.length > 0 ? `(${matrixLevels.length} Levels)` : ''}
                  </button>
                  <button type="button" className="fwm-btn fwm-btn--publish" onClick={handlePublish}>
                    <Send size={15} />
                    Publish & Distribute
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Approval Matrix Configurator Modal Overlay (Portaled ON TOP of main modal) ── */}
      {showMatrixEditor && createPortal(
        <div className="fwm-backdrop fwm-backdrop--matrix" style={{ zIndex: 100010 }} onClick={() => setShowMatrixEditor(false)}>
          <div className="fwm-modal fwm-modal--matrix" style={{ zIndex: 100011, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <div className="fwm-modal__header">
              <div className="fwm-modal__header-left">
                <div className="fwm-icon-badge" style={{ background: '#8b5cf6' }}>
                  <Layers size={22} />
                </div>
                <div>
                  <h3 className="fwm-modal__title">Configure Approval Matrix</h3>
                  <p className="fwm-modal__subtitle">
                    Set up sign-off levels and time limits for form "{formTitle}"
                  </p>
                </div>
              </div>
              <button className="fwm-close-btn" onClick={() => setShowMatrixEditor(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="fwm-body">
              <div className="fwm-matrix-level-list">
                {matrixLevels.length === 0 ? (
                  <div className="fwm-matrix-empty">
                    <AlertCircle size={24} />
                    <p>No approval levels configured. Add a level below to create your approval chain.</p>
                  </div>
                ) : (
                  matrixLevels.map((lvl, index) => (
                    <div key={lvl.id} className="fwm-matrix-level-card">
                      <div className="fwm-matrix-level-num">Level {lvl.levelNumber}</div>
                      <div className="fwm-matrix-level-details">
                        <div className="fwm-matrix-role-row">
                          <Shield size={14} className="fwm-matrix-icon" />
                          <select
                            className="fwm-meta-select"
                            value={lvl.requiredRole}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMatrixLevels((prev) => {
                                const next = prev.map((item, i) => (i === index ? { ...item, requiredRole: val } : item));
                                saveMatrixLevelsToStorage(next);
                                return next;
                              });
                            }}
                          >
                            {roleOptions.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="fwm-matrix-time-row">
                          <Clock size={14} className="fwm-matrix-icon" />
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Time Limit:</label>
                          <select
                            className="fwm-meta-select"
                            style={{ width: '130px' }}
                            value={lvl.timeLimitHours}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setMatrixLevels((prev) => {
                                const next = prev.map((item, i) => (i === index ? { ...item, timeLimitHours: val } : item));
                                saveMatrixLevelsToStorage(next);
                                return next;
                              });
                            }}
                          >
                            <option value={12}>12 Hours</option>
                            <option value={24}>24 Hours (1 Day)</option>
                            <option value={48}>48 Hours (2 Days)</option>
                            <option value={72}>72 Hours (3 Days)</option>
                          </select>
                        </div>
                      </div>

                      <div className="fwm-matrix-level-actions">
                        <button
                          type="button"
                          className="fwm-matrix-btn"
                          disabled={index === 0}
                          title="Move Level Up"
                          onClick={() => handleMoveLevel(index, 'up')}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="fwm-matrix-btn"
                          disabled={index === matrixLevels.length - 1}
                          title="Move Level Down"
                          onClick={() => handleMoveLevel(index, 'down')}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="fwm-matrix-btn fwm-matrix-btn--danger"
                          title="Delete Level"
                          onClick={() => handleDeleteLevel(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add New Approval Level Control */}
              <div className="fwm-matrix-add-box">
                <h4>+ Add Approval Level</h4>
                <div className="fwm-matrix-add-row">
                  <div className="fwm-matrix-field-wrap">
                    <label>Required Role:</label>
                    <select
                      className="fwm-meta-select"
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value)}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="fwm-matrix-field-wrap">
                    <label>SLA Limit:</label>
                    <select
                      className="fwm-meta-select"
                      value={addTimeLimit}
                      onChange={(e) => setAddTimeLimit(Number(e.target.value))}
                    >
                      <option value={12}>12 Hours</option>
                      <option value={24}>24 Hours</option>
                      <option value={48}>48 Hours</option>
                      <option value={72}>72 Hours</option>
                    </select>
                  </div>

                  <button type="button" className="fwm-btn fwm-btn--primary" onClick={handleAddLevel}>
                    <Plus size={15} /> Add
                  </button>
                </div>
              </div>
            </div>

            <div className="fwm-footer">
              <button type="button" className="fwm-btn fwm-btn--secondary" onClick={() => setShowMatrixEditor(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="fwm-btn fwm-btn--primary"
                disabled={savingMatrix}
                onClick={handleSaveMatrix}
              >
                <Check size={16} /> {savingMatrix ? 'Saving Matrix...' : 'Save Matrix & Apply'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}
