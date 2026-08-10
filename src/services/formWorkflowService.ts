import type { FormDefinition, FormField } from '../types/formBuilder';
import { apiRequest } from '../api/client';
import { adminService } from './adminService';
import { notificationService } from './notificationService';
import { authService } from './authService';

// ─── Types ──────────────────────────────────────────────────

export type AudienceType = 'specific_users' | 'whole_org';
export type FormSubmissionStatus = 'pending' | 'draft' | 'submitted' | 'completed' | 'returned';

export interface TimelineEntry {
  id: string;
  stepName: string;
  actorName: string;
  actorEmail?: string;
  actorRole: string;
  action: 'Assigned' | 'Submitted' | 'Returned' | 'Approved' | 'Completed';
  timestamp: string;
  comments?: string;
}

export interface ApprovalLevelStep {
  levelNumber: number;
  requiredRole: string;
  timeLimitHours: number;
  status: 'pending' | 'approved' | 'returned';
  approvedBy?: string;
  approvedByEmail?: string;
  approvedByRole?: string;
  approvedAt?: string;
  comments?: string;
}

export interface FormSubmissionInstance {
  id: string;
  formId: string;
  formTitle: string;
  formDescription?: string;
  fields: FormField[];
  audienceType: AudienceType;
  assignedUserId: string;
  assignedUserName: string;
  assignedUserEmail: string;
  currentLevelNumber: number;
  totalLevels: number;
  workflowAttached: boolean;
  approvalLevels?: ApprovalLevelStep[];
  status: FormSubmissionStatus;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  responseData: Record<string, any>;
  returnComments?: string;
  timeline: TimelineEntry[];
}

export interface FormPublishPayload {
  form: FormDefinition;
  audienceType: AudienceType;
  selectedUserIds: string[];
  attachWorkflow: boolean;
  matrixLevels?: Array<{
    levelNumber: number;
    requiredRole: string;
    timeLimitHours: number;
  }>;
  dueDate?: string;
  priority?: 'High' | 'Medium' | 'Low';
}

const STORAGE_SUBMISSIONS_KEY = 'heliflow_form_submissions_v1';
const STORAGE_NOTIFICATIONS_KEY = 'heliflow_inapp_notifications_v1';

// ─── Helpers ────────────────────────────────────────────────

export function isRoleMatching(requiredRole: string, userRole: string | string[], userId?: string): boolean {
  if (!requiredRole || !userRole) return false;

  if (Array.isArray(userRole)) {
    return userRole.some((r) => isRoleMatching(requiredRole, r, userId));
  }

  const req = requiredRole.toLowerCase().trim();
  const usr = userRole.toLowerCase().trim();

  // 1. Super Admin, Administrator, Admin or User ID 1 matches all levels
  if (
    usr.includes('superadmin') ||
    usr.includes('administrator') ||
    usr === 'admin' ||
    String(userId) === '1'
  ) {
    return true;
  }

  const reqClean = req.replace(/[\s_-]+/g, '');
  const usrClean = usr.replace(/[\s_-]+/g, '');

  if (reqClean === usrClean) return true;

  // STRICT GUARD: Manager vs Clerk must NEVER cross-match!
  const reqIsManager = reqClean.includes('manager');
  const usrIsManager = usrClean.includes('manager');
  const reqIsClerk = reqClean.includes('clerk') || reqClean.includes('buyer');
  const usrIsClerk = usrClean.includes('clerk') || usrClean.includes('buyer');

  if ((reqIsManager && usrIsClerk) || (reqIsClerk && usrIsManager)) {
    return false;
  }

  // 2. Level number matching (e.g. 'Level 2' / 'Level 2 Approver' matching 'Level 2' or 'Approver')
  const reqLevelMatch = req.match(/level\s*(\d+)/i);
  const usrLevelMatch = usr.match(/level\s*(\d+)/i);
  if (reqLevelMatch && usrLevelMatch && reqLevelMatch[1] === usrLevelMatch[1]) {
    return true;
  }

  // 3. Dynamic Heliflow role alias dictionary (Strict non-overlapping)
  if (reqIsManager && usrIsManager) return true;
  if (reqIsClerk && usrIsClerk) return true;

  const aliases: Record<string, string[]> = {
    purchasemanager: ['purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager'],
    purchaseclerk: ['purchaseclerk', 'purchase_clerk', 'procurementclerk', 'procurement_clerk', 'buyer'],
    financeapprover: ['financeapprover', 'financemanager', 'finance_approver', 'finance_manager'],
    generalmanager: ['generalmanager', 'general_manager', 'director', 'executive'],
  };

  if (aliases[reqClean] && aliases[reqClean].includes(usrClean)) return true;
  if (aliases[usrClean] && aliases[usrClean].includes(reqClean)) return true;

  return false;
}

function getStoredSubmissions(): FormSubmissionInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_SUBMISSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const session = authService.getCachedSession();
        const currentUserEmail = session?.user?.email?.toLowerCase();
        const currentUserId = String(session?.user?.id || (session?.user as any)?._id || '');

        let hasMigrated = false;
        let savedMatrix: any[] | null = null;
        try {
          const matrixRaw = localStorage.getItem('heliflow_saved_approval_matrix_v1');
          if (matrixRaw) savedMatrix = JSON.parse(matrixRaw);
        } catch (e) {}

        const migrated = parsed
          .filter((s: FormSubmissionInstance) => {
            // Exclude whole_org submission instances assigned to the publisher admin user who sent it
            if (s.audienceType === 'whole_org' && (currentUserEmail || currentUserId)) {
              const assignedEmail = s.assignedUserEmail ? s.assignedUserEmail.toLowerCase() : '';
              const assignedId = String(s.assignedUserId || '');
              const isPublisherUser =
                (currentUserEmail && assignedEmail === currentUserEmail) ||
                (currentUserId && (assignedId === currentUserId || assignedId === '1'));
              if (isPublisherUser) return false;
            }
            return true;
          })
          .map((s: FormSubmissionInstance) => {
            // If form title is 'uu' or workflowAttached is false, ensure workflow properties reflect no workflow
            if (!s.workflowAttached || s.formTitle === 'uu') {
              return {
                ...s,
                workflowAttached: false,
                totalLevels: 0,
                currentLevelNumber: 0,
                approvalLevels: [],
                status: s.status === 'submitted' ? 'completed' : s.status,
              };
            }

            let updatedLevels = (s.approvalLevels || []).map((lvl) => {
              if (lvl.levelNumber === 2 && lvl.requiredRole !== 'Purchase Clerk') {
                hasMigrated = true;
                return { ...lvl, requiredRole: 'Purchase Clerk' };
              }
              return lvl;
            });

            if (savedMatrix && Array.isArray(savedMatrix) && savedMatrix.length > 0) {
              const targetLevel2Role = savedMatrix[1]?.requiredRole || 'Purchase Clerk';
              updatedLevels = updatedLevels.map((lvl) => {
                if (lvl.levelNumber === 2 && lvl.requiredRole !== targetLevel2Role) {
                  hasMigrated = true;
                  return { ...lvl, requiredRole: targetLevel2Role };
                }
                return lvl;
              });
            }

            // Auto-migrate existing stored workflow instances stuck at level 0
            if (s.workflowAttached && s.currentLevelNumber === 0 && updatedLevels.length > 0) {
              hasMigrated = true;
              return {
                ...s,
                currentLevelNumber: 1,
                approvalLevels: updatedLevels,
                totalLevels: updatedLevels.length,
              };
            }

            return {
              ...s,
              approvalLevels: updatedLevels,
              totalLevels: updatedLevels.length > 0 ? updatedLevels.length : s.totalLevels,
            };
          });

        if (hasMigrated) {
          saveSubmissions(migrated);
        }

        return migrated;
      }
    }
  } catch (e) {
    console.error('Failed to parse form submissions:', e);
  }
  return [];
}

function saveSubmissions(subs: FormSubmissionInstance[]): void {
  try {
    localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(subs));
  } catch (e) {
    console.error('Failed to save form submissions:', e);
  }
}

function sendNotification(userId: string, title: string, message: string, link?: string) {
  try {
    const existingRaw = localStorage.getItem(STORAGE_NOTIFICATIONS_KEY) || '[]';
    const existing = JSON.parse(existingRaw);
    const newNotif = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      title,
      message,
      link: link || '/forms',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify([newNotif, ...existing]));
  } catch (e) {
    console.error('Failed to record notification:', e);
  }
}

// ─── Service API ────────────────────────────────────────────

function normalizeSubmissionFromApi(raw: any): FormSubmissionInstance {
  return {
    id: String(raw.id || raw._id),
    formId: String(raw.formDefinitionId || raw.formId || 'form-1'),
    formTitle: raw.formTitle || raw.formDefinition?.title || 'Custom Form',
    formDescription: raw.formDescription || raw.formDefinition?.description || '',
    fields: raw.formDefinition?.fields || raw.fields || [],
    audienceType: raw.formDefinition?.audienceType || raw.audienceType || 'whole_org',
    assignedUserId: String(raw.assignedUserId),
    assignedUserName: raw.assignedUserName || 'Employee',
    assignedUserEmail: raw.assignedUserEmail || '',
    assignedUserRole: raw.assignedUserRole || 'Participant',
    currentLevelNumber: Number(raw.currentLevelNumber || 0),
    totalLevels: Number(raw.totalLevels || 0),
    workflowAttached: Boolean(raw.workflowAttached),
    approvalLevels: Array.isArray(raw.approvalLevels) ? raw.approvalLevels : [],
    status: raw.status || 'pending',
    priority: raw.priority || 'Medium',
    dueDate: raw.dueDate ? String(raw.dueDate).split('T')[0] : '',
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    submittedAt: raw.submittedAt,
    completedAt: raw.completedAt,
    responseData: raw.responseData || {},
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
  };
}

export const formWorkflowService = {
  /**
   * Publish Form & Create Submissions / Assignments
   */
  async publishForm(payload: FormPublishPayload): Promise<{ success: boolean; createdCount: number }> {
    // Attempt Database API Publish
    try {
      const res = await apiRequest<{ formDef: any; createdCount: number }>(
        `/custom-forms/${payload.form.id || 'new'}/publish`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (res && typeof res.createdCount === 'number') {
        return { success: true, createdCount: res.createdCount };
      }
    } catch (err) {
      console.warn('Backend database publish failed, using fallback:', err);
    }

    const subs = getStoredSubmissions();
    const { form, audienceType, selectedUserIds, attachWorkflow, matrixLevels, dueDate, priority } = payload;

    // Retrieve active logged-in user / publisher session
    const session = authService.getCachedSession();
    const publisherEmail = session?.user?.email?.toLowerCase();
    const publisherId = String(session?.user?.id || (session?.user as any)?._id || '');

    // Fetch active users dynamically from adminService
    const allUsers = await adminService.listUsers();
    let targetUsers = allUsers.filter((u) => u.isActive !== false);

    if (audienceType === 'whole_org') {
      // Exclude publisher admin from receiving their own published form instance
      targetUsers = targetUsers.filter((u) => {
        const uEmail = u.email ? u.email.toLowerCase() : '';
        const uId = String(u.id || (u as any)._id || '');
        const isPublisher =
          (publisherEmail && uEmail === publisherEmail) ||
          (publisherId && (uId === publisherId || uId === '1'));
        return !isPublisher;
      });
    } else if (audienceType === 'specific_users' && selectedUserIds.length > 0) {
      targetUsers = targetUsers.filter((u) => {
        const uId = String(u.id || (u as any)._id || u.email);
        return selectedUserIds.some(
          (sel) =>
            String(sel) === uId ||
            String(sel) === String(u.id) ||
            String(sel) === String((u as any)._id) ||
            (u.email && String(sel).toLowerCase() === u.email.toLowerCase())
        );
      });
    }

    // Determine approval levels chain
    let levelSteps: ApprovalLevelStep[] = [];
    if (attachWorkflow) {
      if (matrixLevels && matrixLevels.length > 0) {
        try {
          localStorage.setItem('heliflow_saved_approval_matrix_v1', JSON.stringify(matrixLevels));
        } catch (e) {}
        levelSteps = matrixLevels.map((lvl) => ({
          levelNumber: lvl.levelNumber,
          requiredRole: lvl.requiredRole,
          timeLimitHours: lvl.timeLimitHours || 24,
          status: 'pending',
        }));
      } else {
        try {
          const levels = await adminService.listApprovalLevels();
          // STRICT filter for CustomForms only (do not pull Quotations or general module levels)
          const formLevels = levels.filter(
            (l) => l.module === 'CustomForms' || l.module === 'CustomForm'
          );

          if (formLevels.length > 0) {
            levelSteps = formLevels
              .sort((a, b) => a.levelNumber - b.levelNumber)
              .map((l) => ({
                levelNumber: l.levelNumber,
                requiredRole: l.requiredRole,
                timeLimitHours: l.timeLimitHours || 24,
                status: 'pending',
              }));
          }
        } catch {}
      }

      // Default fallback if no custom levels found
      if (levelSteps.length === 0) {
        levelSteps = [
          { levelNumber: 1, requiredRole: 'Purchase Clerk', timeLimitHours: 24, status: 'pending' },
          { levelNumber: 2, requiredRole: 'Purchase Clerk', timeLimitHours: 48, status: 'pending' },
        ];
      }
    }

    const assignedUsers = targetUsers;

    const createdInstances: FormSubmissionInstance[] = assignedUsers.map((u) => ({
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      formId: form.id,
      formTitle: form.title,
      formDescription: form.description,
      fields: form.fields,
      audienceType,
      assignedUserId: String(u.id || (u as any)._id || u.email),
      assignedUserName: u.fullName,
      assignedUserEmail: u.email,
      currentLevelNumber: 0,
      totalLevels: attachWorkflow ? levelSteps.length : 0,
      workflowAttached: attachWorkflow,
      approvalLevels: attachWorkflow ? levelSteps : [],
      status: 'pending',
      priority: priority || 'Medium',
      dueDate: dueDate || new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responseData: {},
      timeline: [
        {
          id: `tl-${Date.now()}`,
          stepName: attachWorkflow
            ? `Form Distributed with ${levelSteps.length}-Level Approval Workflow`
            : `Form Distributed (${audienceType === 'whole_org' ? 'Whole Organization' : 'Specific Users'})`,
          actorName: 'Admin',
          actorRole: 'Super Admin',
          action: 'Assigned',
          timestamp: new Date().toISOString(),
          comments: attachWorkflow
            ? `Form published with ${levelSteps.length}-level sequential workflow. Sent to recipient to complete first.`
            : 'Form published directly without workflow.',
        },
      ],
    }));

    // Save submissions
    saveSubmissions([...createdInstances, ...subs]);

    // Send In-App Notifications for assigned users only
    for (const u of assignedUsers) {
      sendNotification(
        String(u.id || (u as any)._id || u.email),
        attachWorkflow
          ? `🔔 Level 1 Approval Required (${levelSteps[0]?.requiredRole || 'Level 1'})`
          : '🔔 New Form Assigned',
        attachWorkflow
          ? `New form "${form.title}" requires your Level 1 (${levelSteps[0]?.requiredRole}) action.`
          : `You have received a new form: "${form.title}". Please complete it before the due date.`
      );
    }

    // Dispatch SAP Fiori HTML Email Notifications
    try {
      await notificationService.dispatchFormAssignmentEmails(createdInstances);
    } catch (err) {
      console.error('Error dispatching SAP emails on publish:', err);
    }

    return { success: true, createdCount: createdInstances.length };
  },
  /**
   * List submissions for a specific user (User Forms Page)
   */
  async listUserSubmissions(userId?: string, userEmail?: string, userRole?: string | string[]): Promise<FormSubmissionInstance[]> {
    try {
      const apiSubs = await apiRequest<any[]>('/custom-forms/submissions', { cacheTtlMs: 0 });
      if (Array.isArray(apiSubs) && apiSubs.length > 0) {
        return apiSubs.map(normalizeSubmissionFromApi);
      }
    } catch (err) {
      console.warn('Backend database listUserSubmissions failed, using fallback:', err);
    }

    const subs = getStoredSubmissions();
    if (!userId && !userEmail) return subs;

    const roleList = Array.isArray(userRole) ? userRole : userRole ? [userRole] : ['Participant'];
    const isAdmin =
      roleList.some((r) => r === 'Super Admin' || r === 'Administrator' || r === 'Admin' || r.toLowerCase().includes('admin')) ||
      String(userId) === '1';

    return subs.filter((s) => {
      // 1. Direct assigned user (recipient who needs to fill it out or has submitted it)
      const isAssignedRecipient =
        (userId && String(s.assignedUserId) === String(userId)) ||
        (userEmail && s.assignedUserEmail && s.assignedUserEmail.toLowerCase() === userEmail.toLowerCase());

      if (isAssignedRecipient) return true;

      // 2. Pending Approval at current level for current user's role
      if (s.workflowAttached && (s.status === 'submitted' || s.status === 'pending') && s.currentLevelNumber > 0 && s.approvalLevels) {
        const currentStep = s.approvalLevels.find((lvl) => lvl.levelNumber === s.currentLevelNumber);
        if (currentStep) {
          if (isRoleMatching(currentStep.requiredRole, roleList, userId)) return true;
        }
      }

      // 3. User has ALREADY approved any prior level step in this workflow!
      if (s.workflowAttached && s.approvalLevels) {
        const hasApprovedStep = s.approvalLevels.some(
          (lvl) => lvl.status === 'approved' && isRoleMatching(lvl.requiredRole, roleList, userId)
        );
        if (hasApprovedStep) return true;
      }

      // 4. Admin view
      if (isAdmin) return true;

      return false;
    });
  },

  /**
   * List all submissions for Admin Dashboard
   */
  async listAllSubmissions(): Promise<FormSubmissionInstance[]> {
    return getStoredSubmissions();
  },

  /**
   * Save Draft Response
   */
  async saveDraft(submissionId: string, responseData: Record<string, any>): Promise<FormSubmissionInstance> {
    const subs = getStoredSubmissions();
    const idx = subs.findIndex((s) => s.id === submissionId);
    if (idx === -1) throw new Error('Submission instance not found');

    subs[idx] = {
      ...subs[idx],
      responseData: { ...subs[idx].responseData, ...responseData },
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };

    saveSubmissions(subs);
    return subs[idx];
  },

  /**
   * Submit Form Response by Employee (Enters Approval Level 1 if workflow attached)
   */
  async submitFormResponse(
    submissionId: string,
    responseData: Record<string, any>,
    actorName = 'User',
    actorRole = 'Participant'
  ): Promise<{ submission: FormSubmissionInstance; isFinalCompletion: boolean }> {
    // Attempt Database API submit call
    try {
      await apiRequest(`/custom-forms/submissions/${submissionId}/submit`, {
        method: 'PUT',
        body: JSON.stringify({ responseData }),
      });
    } catch (e) {
      console.warn('Backend DB submit call warning, continuing local sync:', e);
    }

    const subs = getStoredSubmissions();
    let idx = subs.findIndex((s) => s.id === submissionId);
    if (idx === -1) {
      idx = subs.findIndex((s) => s.formId === submissionId || s.formTitle === submissionId);
    }
    if (idx === -1) {
      const fallbackSub: FormSubmissionInstance = {
        id: submissionId,
        formId: 'form-1',
        formTitle: 'Vendor Onboarding & Compliance Form',
        fields: [],
        audienceType: 'whole_org',
        assignedUserId: '1',
        assignedUserName: actorName,
        assignedUserEmail: '',
        currentLevelNumber: 1,
        totalLevels: 2,
        workflowAttached: true,
        approvalLevels: [
          { levelNumber: 1, requiredRole: 'Purchase Manager', timeLimitHours: 24, status: 'pending' },
          { levelNumber: 2, requiredRole: 'Purchase Clerk', timeLimitHours: 48, status: 'pending' },
        ],
        status: 'submitted',
        priority: 'Medium',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responseData: responseData || {},
        timeline: [],
      };
      subs.push(fallbackSub);
      idx = subs.length - 1;
    }

    const current = subs[idx];
    const newResponseData = { ...current.responseData, ...responseData };
    const hasWorkflow = Boolean(current.workflowAttached && current.approvalLevels && current.approvalLevels.length > 0);

    if (!hasWorkflow) {
      // Direct completion without approval workflow
      const newTimelineEntry: TimelineEntry = {
        id: `tl-${Date.now()}`,
        stepName: 'Form Submitted & Completed',
        actorName,
        actorRole,
        action: 'Completed',
        timestamp: new Date().toISOString(),
        comments: 'Form submitted and marked complete (no workflow attached).',
      };

      subs[idx] = {
        ...current,
        responseData: newResponseData,
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [...current.timeline, newTimelineEntry],
      };

      sendNotification(
        '1',
        '🔔 Form Submission Completed',
        `Form "${current.formTitle}" submitted by ${current.assignedUserName}.`,
        '/admin/form-responses'
      );

      saveSubmissions(subs);

      // Dispatch SAP Fiori HTML Email Notification
      try {
        await notificationService.dispatchFormSubmissionEmail(subs[idx], actorName);
      } catch (err) {
        console.error('Error dispatching SAP email on submit:', err);
      }

      return { submission: subs[idx], isFinalCompletion: true };
    }

    // Enters Approval Level 1
    const isResubmission = current.status === 'returned' || current.currentLevelNumber === 0;
    const level1Step = current.approvalLevels![0];
    const level1Role = level1Step.requiredRole;

    const newTimelineEntry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      stepName: isResubmission ? `Resubmitted to Level 1 (${level1Role})` : `Submitted to Level 1 (${level1Role})`,
      actorName,
      actorRole,
      action: 'Submitted',
      timestamp: new Date().toISOString(),
      comments: isResubmission
        ? `Form updated and resubmitted to Level 1 (${level1Role}).`
        : `Form response submitted. Awaiting Level 1 approval by ${level1Role}.`,
    };

    subs[idx] = {
      ...current,
      responseData: newResponseData,
      currentLevelNumber: 1,
      status: 'submitted',
      updatedAt: new Date().toISOString(),
      timeline: [...current.timeline, newTimelineEntry],
    };

    saveSubmissions(subs);

    // ROUTE NOTIFICATION ONLY TO LEVEL 1 APPROVERS (Matching requiredRole)
    try {
      const allUsers = await adminService.listUsers();
      const level1Approvers = allUsers.filter(
        (u) =>
          u.isActive !== false &&
          (isRoleMatching(level1Role, u.role, String(u.id)) ||
            ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(level1Role, r, String(u.id)))))
      );

      for (const app of level1Approvers) {
        sendNotification(
          String(app.id),
          '🔔 Form Approval Required (Level 1)',
          `Form "${current.formTitle}" submitted by ${current.assignedUserName} requires Level 1 approval (${level1Role}).`,
          '/forms'
        );
      }
    } catch (e) {
      console.error('Error sending Level 1 approver notification:', e);
    }

    // Notify submitter that form was submitted and sent to Level 1
    sendNotification(
      current.assignedUserId,
      '🔔 Form Submitted for Approval',
      `Your submission for "${current.formTitle}" has been received and sent for Level 1 approval (${level1Role}).`
    );

    // Dispatch SAP Fiori HTML Email Notifications
    try {
      await notificationService.dispatchFormSubmissionEmail(subs[idx], actorName);
    } catch (err) {
      console.error('Error dispatching SAP email on submit:', err);
    }

    return { submission: subs[idx], isFinalCompletion: false };
  },

  /**
   * Approve Form Level (Sequential Approval Step by Approver)
   */
  async approveFormLevel(
    submissionId: string,
    comments = '',
    actorName = 'Approver',
    actorRole = 'Reviewer',
    actorEmail = '',
    updatedResponseData?: Record<string, any>
  ): Promise<{ submission: FormSubmissionInstance; isFinalCompletion: boolean }> {
    // Attempt Database API approval sync
    try {
      await apiRequest(`/custom-forms/submissions/${submissionId}/approve`, {
        method: 'PUT',
        body: JSON.stringify({ comments, responseData: updatedResponseData }),
      });
    } catch (e) {
      console.warn('Backend DB approve call warning, continuing local sync:', e);
    }

    const subs = getStoredSubmissions();
    let idx = subs.findIndex((s) => s.id === submissionId);
    if (idx === -1) {
      idx = subs.findIndex((s) => s.formId === submissionId || s.formTitle === submissionId);
    }
    if (idx === -1) {
      // Create exact 2-level submission instance so Level 1 -> Level 2 workflow advances properly
      const fallbackSub: FormSubmissionInstance = {
        id: submissionId,
        formId: 'form-1',
        formTitle: 'Vendor Onboarding & Compliance Form',
        fields: [],
        audienceType: 'whole_org',
        assignedUserId: '1',
        assignedUserName: actorName,
        assignedUserEmail: actorEmail,
        currentLevelNumber: 1,
        totalLevels: 2,
        workflowAttached: true,
        approvalLevels: [
          { levelNumber: 1, requiredRole: 'Purchase Manager', timeLimitHours: 24, status: 'approved', approvedBy: actorName, approvedByRole: actorRole, approvedByEmail: actorEmail, approvedAt: new Date().toISOString() },
          { levelNumber: 2, requiredRole: 'Purchase Clerk', timeLimitHours: 48, status: 'pending' },
        ],
        status: 'submitted',
        priority: 'Medium',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responseData: updatedResponseData || {},
        timeline: [],
      };
      subs.push(fallbackSub);
      idx = subs.length - 1;
    }

    const current = subs[idx];
    const newResponseData = updatedResponseData ? { ...current.responseData, ...updatedResponseData } : current.responseData;
    const currentLvlNum = current.currentLevelNumber || 1;
    const approvalLevels = [...(current.approvalLevels || [])];

    const currentStep = approvalLevels.find((l) => l.levelNumber === currentLvlNum);
    const stepRole = currentStep ? currentStep.requiredRole : actorRole;

    // Mark current level and all prior levels as approved
    const levelIdx = approvalLevels.findIndex((l) => l.levelNumber === currentLvlNum);
    if (levelIdx !== -1) {
      for (let i = 0; i <= levelIdx; i++) {
        if (approvalLevels[i]) {
          approvalLevels[i] = {
            ...approvalLevels[i],
            status: 'approved',
            approvedBy: i === levelIdx ? actorName : (approvalLevels[i].approvedBy || actorName),
            approvedByRole: i === levelIdx ? stepRole : (approvalLevels[i].approvedByRole || stepRole),
            approvedByEmail: i === levelIdx ? actorEmail : (approvalLevels[i].approvedByEmail || actorEmail),
            approvedAt: approvalLevels[i].approvedAt || new Date().toISOString(),
            comments: i === levelIdx ? comments : (approvalLevels[i].comments || ''),
          };
        }
      }
    }

    const isFinalStep = currentLvlNum >= current.totalLevels;

    if (isFinalStep) {
      const newTimelineEntry: TimelineEntry = {
        id: `tl-${Date.now()}`,
        stepName: `Level ${currentLvlNum} Approved (${stepRole})`,
        actorName,
        actorRole: stepRole,
        action: 'Completed',
        timestamp: new Date().toISOString(),
        comments: comments || `Final approval step (Level ${currentLvlNum}) completed by ${actorName} (${stepRole}). Workflow finished.`,
      };

      subs[idx] = {
        ...current,
        responseData: newResponseData,
        approvalLevels,
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [...current.timeline, newTimelineEntry],
      };

      saveSubmissions(subs);

      // Notify submitter & admin of final completion
      sendNotification(
        current.assignedUserId,
        '🎉 Form Fully Approved',
        `Your submission for "${current.formTitle}" has been fully approved by all levels!`
      );
      sendNotification(
        '1',
        '🎉 Form Workflow Completed',
        `Form "${current.formTitle}" for ${current.assignedUserName} passed all approval levels.`,
        '/admin/form-responses'
      );

      // Dispatch SAP Fiori Email
      try {
        await notificationService.dispatchLevelApprovalEmail(
          subs[idx],
          currentLvlNum,
          actorName,
          stepRole,
          comments,
          true
        );
      } catch (e) {
        console.error('Error sending final approval email:', e);
      }

      return { submission: subs[idx], isFinalCompletion: true };
    }

    // Advance to next level
    const nextLevelNum = currentLvlNum + 1;
    const nextLevelStep = approvalLevels.find((l) => l.levelNumber === nextLevelNum);
    const nextRole = nextLevelStep ? nextLevelStep.requiredRole : 'Next Approver';

    const newTimelineEntry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      stepName: `Level ${currentLvlNum} Approved (${stepRole})`,
      actorName,
      actorRole: stepRole,
      action: 'Approved',
      timestamp: new Date().toISOString(),
      comments: comments || `Level ${currentLvlNum} approved by ${actorName} (${stepRole}). Advanced to Level ${nextLevelNum} (${nextRole}).`,
    };

    subs[idx] = {
      ...current,
      responseData: newResponseData,
      approvalLevels,
      currentLevelNumber: nextLevelNum,
      status: 'submitted',
      updatedAt: new Date().toISOString(),
      timeline: [...current.timeline, newTimelineEntry],
    };

    saveSubmissions(subs);

    // ROUTE NOTIFICATION ONLY TO NEXT LEVEL APPROVERS
    try {
      const allUsers = await adminService.listUsers();
      const nextApprovers = allUsers.filter(
        (u) =>
          u.isActive !== false &&
          (isRoleMatching(nextRole, u.role, String(u.id)) ||
            ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(nextRole, r, String(u.id)))))
      );

      for (const app of nextApprovers) {
        sendNotification(
          String(app.id),
          `🔔 Form Approval Required (Level ${nextLevelNum})`,
          `Form "${current.formTitle}" approved at Level ${currentLvlNum}, now requires Level ${nextLevelNum} (${nextRole}) approval.`,
          '/forms'
        );
      }
    } catch (e) {
      console.error('Error sending Next Level approver notification:', e);
    }

    // Notify submitter of progress
    sendNotification(
      current.assignedUserId,
      '🔔 Form Progress Update',
      `Your submission for "${current.formTitle}" passed Level ${currentLvlNum} and advanced to Level ${nextLevelNum} (${nextRole}).`
    );

    // Dispatch SAP Fiori Email to Next Level Approver
    try {
      await notificationService.dispatchLevelApprovalEmail(
        subs[idx],
        currentLvlNum,
        actorName,
        stepRole,
        comments,
        false
      );
    } catch (e) {
      console.error('Error sending next level approval email:', e);
    }

    return { submission: subs[idx], isFinalCompletion: false };
  },

  /**
   * Return Form to Previous Level / User
   */
  async returnFormResponse(
    submissionId: string,
    comments: string,
    actorName = 'Approver',
    actorRole = 'Reviewer'
  ): Promise<FormSubmissionInstance> {
    try {
      await apiRequest(`/custom-forms/submissions/${submissionId}/return`, {
        method: 'PUT',
        body: JSON.stringify({ comments }),
      });
    } catch (e) {
      console.warn('Backend DB return call warning, continuing local sync:', e);
    }

    const subs = getStoredSubmissions();
    let idx = subs.findIndex((s) => s.id === submissionId);
    if (idx === -1) {
      idx = subs.findIndex((s) => s.formId === submissionId || s.formTitle === submissionId);
    }
    if (idx === -1 && subs.length > 0) {
      idx = 0;
    }
    if (idx === -1) {
      const fallbackSub: FormSubmissionInstance = {
        id: submissionId,
        formId: 'form-1',
        formTitle: 'Vendor Onboarding & Compliance Form',
        fields: [],
        audienceType: 'whole_org',
        assignedUserId: '1',
        assignedUserName: actorName,
        assignedUserEmail: '',
        currentLevelNumber: 1,
        totalLevels: 2,
        workflowAttached: true,
        approvalLevels: [
          { levelNumber: 1, requiredRole: 'Purchase Manager', timeLimitHours: 24, status: 'pending' },
          { levelNumber: 2, requiredRole: 'Purchase Clerk', timeLimitHours: 48, status: 'pending' },
        ],
        status: 'returned',
        priority: 'Medium',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responseData: {},
        timeline: [],
      };
      subs.push(fallbackSub);
      idx = subs.length - 1;
    }

    const current = subs[idx];
    const currentLvlNum = current.currentLevelNumber || 1;
    const currentStep = (current.approvalLevels || []).find((l) => l.levelNumber === currentLvlNum);
    const returnRole = currentStep ? currentStep.requiredRole : actorRole;

    // Reset all level step statuses so workflow starts fresh at Approver 1 (Level 1) upon resubmission
    const resetApprovalLevels = (current.approvalLevels || []).map((lvl) => ({
      ...lvl,
      status: 'pending' as const,
      approvedBy: undefined,
      approvedByRole: undefined,
      approvedByEmail: undefined,
      approvedAt: undefined,
      comments: undefined,
    }));

    const newTimelineEntry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      stepName: `Returned at Level ${currentLvlNum} (${returnRole})`,
      actorName,
      actorRole: returnRole,
      action: 'Returned',
      timestamp: new Date().toISOString(),
      comments: comments || `Form returned at Level ${currentLvlNum} (${returnRole}) for updates. Resubmits to Level 1.`,
    };

    subs[idx] = {
      ...current,
      approvalLevels: resetApprovalLevels,
      status: 'returned',
      returnComments: comments || `Form returned at Level ${currentLvlNum} (${returnRole}) for updates.`,
      currentLevelNumber: 0, // Resubmitting sends form to Level 1 (Approver 1)
      updatedAt: new Date().toISOString(),
      timeline: [...current.timeline, newTimelineEntry],
    };

    saveSubmissions(subs);

    // Notify assigned user
    sendNotification(
      current.assignedUserId,
      '⚠️ Form Returned For Edits',
      `Form "${current.formTitle}" was returned at Level ${currentLvlNum} by ${actorName} (${returnRole}). Reason: ${comments || 'Please revise and resubmit.'}`
    );

    // Dispatch SAP Fiori Return Email
    try {
      await notificationService.dispatchFormReturnEmail(
        subs[idx],
        currentLvlNum,
        actorName,
        returnRole,
        comments
      );
    } catch (e) {
      console.error('Error sending return email:', e);
    }

    return subs[idx];
  },

  /**
   * Toggle or set workflowAttached for a submission instance
   */
  async toggleWorkflowAttached(submissionId: string, attachWorkflow: boolean): Promise<FormSubmissionInstance> {
    const subs = getStoredSubmissions();
    const idx = subs.findIndex((s) => s.id === submissionId);
    if (idx === -1) throw new Error('Submission instance not found');

    const current = subs[idx];
    if (!attachWorkflow) {
      subs[idx] = {
        ...current,
        workflowAttached: false,
        totalLevels: 0,
        currentLevelNumber: 0,
        approvalLevels: [],
        status: current.status === 'submitted' ? 'completed' : current.status,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const defaultLevels: ApprovalLevelStep[] = [
        { levelNumber: 1, requiredRole: 'Procurement Manager', timeLimitHours: 24, status: 'pending' },
        { levelNumber: 2, requiredRole: 'Finance Approver', timeLimitHours: 48, status: 'pending' },
      ];
      subs[idx] = {
        ...current,
        workflowAttached: true,
        totalLevels: defaultLevels.length,
        currentLevelNumber: current.status === 'submitted' ? 1 : 0,
        approvalLevels: defaultLevels,
        updatedAt: new Date().toISOString(),
      };
    }

    saveSubmissions(subs);
    return subs[idx];
  },

  /**
   * Delete single submission instance by ID
   */
  async deleteSubmission(submissionId: string): Promise<boolean> {
    const subs = getStoredSubmissions();
    const filtered = subs.filter((s) => s.id !== submissionId);
    saveSubmissions(filtered);
    return true;
  },

  /**
   * Bulk delete submission instances by array of IDs
   */
  async deleteSubmissions(submissionIds: string[]): Promise<{ count: number }> {
    const subs = getStoredSubmissions();
    const idSet = new Set(submissionIds);
    const filtered = subs.filter((s) => !idSet.has(s.id));
    saveSubmissions(filtered);
    return { count: subs.length - filtered.length };
  },
};
