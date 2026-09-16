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

const workflowInputClass = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15';
const workflowSecondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted';
const workflowPrimaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';

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
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
        <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="workflow-modal-title" onClick={(e) => e.stopPropagation()}>
          {/* Top Header */}
          <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GitMerge size={22} />
              </div>
              <div>
                <h2 id="workflow-modal-title" className="text-base font-semibold text-foreground">Form Distribution & Workflow</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  Form: <strong>{formTitle || 'Untitled Custom Form'}</strong>
                </p>
              </div>
            </div>
            <button type="button" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>

          {/* Wizard Steps Indicator */}
          <div className="flex items-center border-b border-border/70 px-5 py-3 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">1</span>
              <span className="hidden sm:inline">Select Form Audience</span>
            </div>
            <div className="mx-3 h-px flex-1 bg-border" />
            <div className={`flex items-center gap-2 text-xs font-semibold ${step === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
              <span className={`flex size-7 items-center justify-center rounded-full border ${step === 2 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted'}`}>2</span>
              <span className="hidden sm:inline">Attach Workflow & Distribute</span>
            </div>
          </div>

          {modalError && (
            <MessageStrip type="error" compact onClose={() => setModalError(null)} className="mx-5 mt-3 sm:mx-6">
              {modalError}
            </MessageStrip>
          )}

          {/* Body Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {step === 1 ? (
              /* ── STEP 1: AUDIENCE SELECTION ── */
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users size={16} />
                  <span>Who should receive this form?</span>
                </div>

                {/* Audience Type Radio Cards */}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <button type="button"
                    className={`relative flex min-h-32 items-start gap-3 rounded-2xl border p-4 text-left transition ${audienceType === 'specific_users' ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/10' : 'border-border bg-background hover:border-primary/30'}`}
                    onClick={() => setAudienceType('specific_users')}
                    aria-pressed={audienceType === 'specific_users'}
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <UserCheck size={22} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Specific User(s)</h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Assign to one or multiple specific employees or managers.</p>
                    </div>
                    <span className={`absolute right-3 top-3 size-4 rounded-full border-4 ${audienceType === 'specific_users' ? 'border-primary bg-card' : 'border-border bg-card'}`} />
                  </button>

                  <button type="button"
                    className={`relative flex min-h-32 items-start gap-3 rounded-2xl border p-4 text-left transition ${audienceType === 'whole_org' ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/10' : 'border-border bg-background hover:border-primary/30'}`}
                    onClick={() => setAudienceType('whole_org')}
                    aria-pressed={audienceType === 'whole_org'}
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
                      <Building size={22} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Whole Organization</h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Publish to every active employee across the organization ({eligibleUsers.length} users).</p>
                    </div>
                    <span className={`absolute right-3 top-3 size-4 rounded-full border-4 ${audienceType === 'whole_org' ? 'border-primary bg-card' : 'border-border bg-card'}`} />
                  </button>
                </div>

                {/* User Selection Box (If Specific Users Selected) */}
                {audienceType === 'specific_users' && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
                    <div className="flex flex-col gap-3 border-b border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="relative min-w-0 flex-1">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          className="min-h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                          placeholder="Search employee by name, email, department..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" className="min-h-10 rounded-lg px-3 text-xs font-semibold text-primary transition hover:bg-primary/10" onClick={handleSelectAllFiltered}>
                          Select All
                        </button>
                        <button type="button" className="min-h-10 rounded-lg px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={handleClearSelection}>
                          Clear ({selectedUserIds.length})
                        </button>
                      </div>
                    </div>

                    {/* Selected count badge */}
                    <div className="flex items-center gap-2 border-b border-border/70 bg-emerald-500/[0.06] px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <Check size={14} />
                      <span>
                        {selectedUserIds.length} user{selectedUserIds.length !== 1 ? 's' : ''} selected for assignment
                      </span>
                    </div>

                    {/* Users list grid */}
                    <div className="grid max-h-64 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
                      {filteredUsers.map((u) => {
                        const isSelected = selectedUserIds.includes(String(u.id));
                        return (
                          <button type="button"
                            key={u.id}
                            className={`flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${isSelected ? 'border-primary bg-primary/[0.06]' : 'border-border hover:border-primary/30 hover:bg-muted/30'}`}
                            onClick={() => toggleUserSelection(String(u.id))}
                            aria-pressed={isSelected}
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                              {u.fullName.split(' ').map((n) => n[0]).join('').substring(0, 2)}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs font-semibold text-foreground">{u.fullName}</span>
                              <span className="truncate text-[12px] text-muted-foreground">{u.email}</span>
                            </div>
                            <div className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
                              {isSelected && <Check size={12} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {audienceType === 'whole_org' && (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-4 text-violet-700 dark:text-violet-300">
                    <Sparkles size={18} />
                    <div className="text-xs leading-5">
                      <strong className="text-sm">Organization-Wide Distribution Mode</strong>
                      <p className="mt-1 text-muted-foreground">
                        Upon publishing, an independent submission & workflow instance will be created for each employee.
                        Employees submit individually and progress through their approval pipeline.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── STEP 2: WORKFLOW ATTACHMENT & PUBLISH ── */
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <GitMerge size={16} />
                  <span>Workflow & Distribution Settings</span>
                </div>

                {/* Attach Workflow Toggle Box */}
                <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <GitMerge size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Attach Approval Workflow</h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Connect Approval Levels matrix (Level 1 → Level 2 → Level 3) so form submissions progress sequentially through each level before final completion.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex min-h-11 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={attachWorkflow}
                      onChange={(e) => setAttachWorkflow(e.target.checked)}
                    />
                    <span className={`relative h-7 w-12 rounded-full transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform ${attachWorkflow ? 'bg-primary after:translate-x-5' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  </label>
                </div>

                {/* Options Breakdown */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Calendar size={14} /> Due Date
                    </label>
                    <input
                      type="date"
                      className={workflowInputClass}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Clock size={14} /> Priority Level
                    </label>
                    <select
                      className={workflowInputClass}
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                    >
                      <option value="High">🔴 High Priority</option>
                      <option value="Medium">🟡 Medium Priority</option>
                      <option value="Low">🟢 Low Priority</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
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
          <div className="flex flex-col gap-2 border-t border-border/70 bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            {step === 1 ? (
              <>
                <button type="button" className={workflowSecondaryButton} onClick={onClose}>
                  Cancel
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" className={workflowSecondaryButton} onClick={onSaveAsDraft}>
                    <FileText size={15} />
                    Save as Draft
                  </button>
                  <button type="button" className={workflowPrimaryButton} onClick={handleNextStep}>
                    Next: Workflow Options
                    <ChevronRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button type="button" className={workflowSecondaryButton} onClick={() => setStep(1)}>
                  <ChevronLeft size={16} />
                  Back
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 text-sm font-semibold text-violet-700 transition hover:bg-violet-500/15 dark:text-violet-300"
                    onClick={() => setShowMatrixEditor(true)}
                  >
                    <GitMerge size={15} />
                    Configure Approval Matrix {matrixLevels.length > 0 ? `(${matrixLevels.length} Levels)` : ''}
                  </button>
                  <button type="button" className={workflowPrimaryButton} onClick={handlePublish}>
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" onClick={() => setShowMatrixEditor(false)}>
          <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="matrix-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
                  <Layers size={22} />
                </div>
                <div>
                  <h3 id="matrix-modal-title" className="text-base font-semibold text-foreground">Configure Approval Matrix</h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Set up sign-off levels and time limits for form "{formTitle}"
                  </p>
                </div>
              </div>
              <button type="button" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close approval matrix" onClick={() => setShowMatrixEditor(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-3">
                {matrixLevels.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
                    <AlertCircle size={24} />
                    <p className="mt-2 max-w-md text-sm leading-6">No approval levels configured. Add a level below to create your approval chain.</p>
                  </div>
                ) : (
                  matrixLevels.map((lvl, index) => (
                    <div key={lvl.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center">
                      <div className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">Level {lvl.levelNumber}</div>
                      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <Shield size={14} className="shrink-0 text-muted-foreground" />
                          <select
                            className={workflowInputClass}
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

                        <div className="flex items-center gap-2">
                          <Clock size={14} className="shrink-0 text-muted-foreground" />
                          <label className="sr-only">Time Limit</label>
                          <select
                            className={workflowInputClass}
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

                      <div className="flex shrink-0 items-center justify-end gap-1">
                        <button
                          type="button"
                          className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                          disabled={index === 0}
                          title="Move Level Up"
                          onClick={() => handleMoveLevel(index, 'up')}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                          disabled={index === matrixLevels.length - 1}
                          title="Move Level Down"
                          onClick={() => handleMoveLevel(index, 'down')}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
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
              <div className="mt-5 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.035] p-4">
                <h4 className="text-sm font-semibold text-foreground">Add Approval Level</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">Required Role</label>
                    <select
                      className={workflowInputClass}
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

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">SLA Limit</label>
                    <select
                      className={workflowInputClass}
                      value={addTimeLimit}
                      onChange={(e) => setAddTimeLimit(Number(e.target.value))}
                    >
                      <option value={12}>12 Hours</option>
                      <option value={24}>24 Hours</option>
                      <option value={48}>48 Hours</option>
                      <option value={72}>72 Hours</option>
                    </select>
                  </div>

                  <button type="button" className={workflowPrimaryButton} onClick={handleAddLevel}>
                    <Plus size={15} /> Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border/70 bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" className={workflowSecondaryButton} onClick={() => setShowMatrixEditor(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={workflowPrimaryButton}
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
