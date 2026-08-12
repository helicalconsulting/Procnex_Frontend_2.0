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
  assignedUserRole?: string;
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

// ─── Role Matching ───────────────────────────────────────────

export function isRoleMatching(requiredRole: string, userRole: string | string[], userId?: string): boolean {
  if (!requiredRole || !userRole) return false;

  if (Array.isArray(userRole)) {
    return userRole.some((r) => isRoleMatching(requiredRole, r, userId));
  }

  // Strip level number prefixes like "Level 2 of 2: Finance Approver" -> "Finance Approver"
  const stripPrefix = (str: string) => str.replace(/^level\s*\d+(\s*of\s*\d+)?\s*:\s*/i, '').trim();

  const req = stripPrefix(requiredRole).toLowerCase();
  const usr = stripPrefix(userRole).toLowerCase();

  const reqClean = req.replace(/[\s_-]+/g, '');
  const usrClean = usr.replace(/[\s_-]+/g, '');

  if (reqClean === usrClean) return true;

  const aliases: Record<string, string[]> = {
    purchasemanager: ['purchasemanager', 'purchase_manager', 'procurementmanager', 'procurement_manager'],
    purchaseclerk: ['purchaseclerk', 'purchase_clerk', 'procurementclerk', 'procurement_clerk', 'buyer'],
    financeapprover: ['financeapprover', 'financemanager', 'finance_approver', 'finance_manager', 'finance'],
    generalmanager: ['generalmanager', 'general_manager', 'managingdirector', 'managing_director', 'director', 'executive'],
  };

  if (aliases[reqClean] && aliases[reqClean].includes(usrClean)) return true;
  if (aliases[usrClean] && aliases[usrClean].includes(reqClean)) return true;

  return false;
}

// ─── Notification Helper (backend API) ──────────────────────

async function sendNotification(userId: string, title: string, message: string, link = '/forms'): Promise<void> {
  try {
    await apiRequest('/notifications/send', {
      method: 'POST',
      body: JSON.stringify({ userId, title, message, link }),
    });
  } catch (e) {
    console.warn('[Notification] Failed to send in-app notification:', e);
  }
}

// ─── Normalize API submission ─────────────────────────────────

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
    returnComments: raw.returnComments || '',
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
  } as FormSubmissionInstance;
}

// ─── Service API ─────────────────────────────────────────────

export const formWorkflowService = {

  /**
   * Publish Form & Create Submissions — DB only
   */
  async publishForm(payload: FormPublishPayload): Promise<{ success: boolean; createdCount: number }> {
    const { form, audienceType, selectedUserIds, attachWorkflow, matrixLevels, dueDate, priority } = payload;

    // Build levelSteps (needed for notification metadata even though backend handles actual creation)
    const session = authService.getCachedSession();
    const publisherEmail = session?.user?.email?.toLowerCase();
    const publisherId = String(session?.user?.id || (session?.user as any)?._id || '');

    const allUsers = await adminService.listUsers();
    let targetUsers = allUsers.filter((u) => u.isActive !== false);

    if (audienceType === 'whole_org') {
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

    let levelSteps: ApprovalLevelStep[] = [];
    if (attachWorkflow) {
      if (matrixLevels && matrixLevels.length > 0) {
        // Priority 1: explicitly passed matrixLevels (from publish dialog)
        levelSteps = matrixLevels.map((lvl) => ({
          levelNumber: lvl.levelNumber,
          requiredRole: lvl.requiredRole,
          timeLimitHours: lvl.timeLimitHours || 24,
          status: 'pending' as const,
        }));
      } else {
        // Priority 2: admin-configured approval matrix from DB
        try {
          const levels = await adminService.listApprovalLevels();
          const formLevels = levels.filter((l) => l.module === 'CustomForms' || l.module === 'CustomForm');
          if (formLevels.length > 0) {
            levelSteps = formLevels
              .sort((a, b) => a.levelNumber - b.levelNumber)
              .map((l) => ({
                levelNumber: l.levelNumber,
                requiredRole: l.requiredRole,
                timeLimitHours: l.timeLimitHours || 24,
                status: 'pending' as const,
              }));
          }
        } catch {}
        // No hardcoded fallback — backend will error if no matrix configured
      }
    }

    // ── DB Publish ───────────────────────────────────────────
    let createdCount = 0;
    try {
      const res = await apiRequest<{ formDef: any; createdCount: number }>(
        `/custom-forms/${form.id || 'new'}/publish`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      if (res && typeof res.createdCount === 'number') {
        createdCount = res.createdCount;
        console.log(`[Form Published] DB created ${createdCount} submission(s).`);
      }
    } catch (err) {
      console.error('Backend publish failed:', err);
      throw err;
    }

    // ── In-App Notifications ─────────────────────────────────
    if (attachWorkflow && levelSteps.length > 0) {
      // Workflow mode: notify Level 1 approvers only (ONE submission flows through the chain)
      const level1Role = levelSteps[0].requiredRole;
      const level1Approvers = allUsers.filter(
        (u) =>
          u.isActive !== false &&
          (isRoleMatching(level1Role, u.role, String(u.id)) ||
            ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(level1Role, r, String(u.id)))))
      );
      for (const app of level1Approvers) {
        sendNotification(
          String(app.id),
          `🔔 Level 1 Approval Required (${level1Role})`,
          `New form "${form.title}" requires your Level 1 (${level1Role}) review and approval.`,
          '/forms'
        );
      }

      // Rich email dispatch to Level 1 approvers
      const session = authService.getCachedSession();
      const emailInstances: FormSubmissionInstance[] = [{
        id: 'temp',
        formId: form.id,
        formTitle: form.title,
        formDescription: form.description,
        fields: form.fields,
        audienceType,
        assignedUserId: String(session?.user?.id || 'admin'),
        assignedUserName: session?.user?.fullName || 'Admin',
        assignedUserEmail: session?.user?.email || '',
        currentLevelNumber: 1,
        totalLevels: levelSteps.length,
        workflowAttached: true,
        approvalLevels: levelSteps,
        status: 'submitted',
        priority: priority || 'Medium',
        dueDate: dueDate || new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responseData: {},
        timeline: [],
      }];
      try {
        await notificationService.dispatchFormAssignmentEmails(emailInstances);
      } catch (err) {
        console.error('Error dispatching workflow assignment email:', err);
      }

    } else {
      // No-workflow mode: notify each assigned user
      for (const u of targetUsers) {
        sendNotification(
          String(u.id || (u as any)._id || u.email),
          '🔔 New Form Assigned',
          `You have received a new form: "${form.title}".`
        );
      }

      const emailInstances: FormSubmissionInstance[] = targetUsers.map((u) => ({
        id: 'temp',
        formId: form.id,
        formTitle: form.title,
        formDescription: form.description,
        fields: form.fields,
        audienceType,
        assignedUserId: String(u.id || (u as any)._id || u.email),
        assignedUserName: u.fullName,
        assignedUserEmail: u.email,
        currentLevelNumber: 0,
        totalLevels: 0,
        workflowAttached: false,
        approvalLevels: [],
        status: 'pending',
        priority: priority || 'Medium',
        dueDate: dueDate || new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responseData: {},
        timeline: [],
      }));
      try {
        await notificationService.dispatchFormAssignmentEmails(emailInstances);
      } catch (err) {
        console.error('Error dispatching assignment emails:', err);
      }
    }

    return { success: true, createdCount };
  },

  /**
   * List submissions for user (DB only)
   */
  async listUserSubmissions(userId?: string, userEmail?: string, userRole?: string | string[]): Promise<FormSubmissionInstance[]> {
    const apiSubs = await apiRequest<any[]>('/custom-forms/submissions', { cacheTtlMs: 0 });
    if (!Array.isArray(apiSubs)) return [];

    const normalized = apiSubs.map(normalizeSubmissionFromApi);

    if (!userId && !userEmail) return normalized;

    const roleList = Array.isArray(userRole) ? userRole : userRole ? [userRole] : ['Participant'];
    const isAdmin =
      roleList.some((r) => r === 'Super Admin' || r === 'Administrator' || r === 'Admin' || r.toLowerCase().includes('admin')) ||
      String(userId) === '1';

    return normalized.filter((s) => {
      const isAssignedRecipient =
        (userId && String(s.assignedUserId) === String(userId)) ||
        (userEmail && s.assignedUserEmail && s.assignedUserEmail.toLowerCase() === userEmail.toLowerCase());

      if (isAssignedRecipient) return true;

      // Workflow attached forms: include if user is assigned, or is current step approver, or has approved/returned any step, or matches any approval level role
      if (s.workflowAttached) {
        const isOwnSubmission =
          (userId && String(s.assignedUserId) === String(userId)) ||
          (userEmail && s.assignedUserEmail && s.assignedUserEmail.toLowerCase() === userEmail.toLowerCase());

        if (!isOwnSubmission) {
          // Current step approver
          const currentStep = s.approvalLevels?.find((lvl) => lvl.levelNumber === s.currentLevelNumber);
          if (currentStep && isRoleMatching(currentStep.requiredRole, roleList, userId)) return true;

          // Has approved a step
          const hasApprovedStep = s.approvalLevels?.some(
            (lvl) => lvl.status === 'approved' && isRoleMatching(lvl.requiredRole, roleList, userId)
          );
          if (hasApprovedStep) return true;

          // Has returned a step in timeline
          const hasReturnedStep = s.timeline?.some(
            (t) => t.action === 'Returned' && isRoleMatching(t.actorRole, roleList, userId)
          );
          if (hasReturnedStep) return true;

          // Any level approver role in workflow
          const isWorkflowApprover = s.approvalLevels?.some(
            (lvl) => isRoleMatching(lvl.requiredRole, roleList, userId)
          );
          if (isWorkflowApprover) return true;
        }
      }

      if (isAdmin) return true;
      return false;
    });
  },

  /**
   * List all submissions for Admin Dashboard (DB only)
   */
  async listAllSubmissions(): Promise<FormSubmissionInstance[]> {
    const apiSubs = await apiRequest<any[]>('/custom-forms/submissions?adminView=true', { cacheTtlMs: 0 });
    if (!Array.isArray(apiSubs)) return [];
    return apiSubs.map(normalizeSubmissionFromApi);
  },

  /**
   * Save Draft Response (DB)
   */
  async saveDraft(submissionId: string, responseData: Record<string, any>): Promise<FormSubmissionInstance> {
    const res = await apiRequest<any>(`/custom-forms/submissions/${submissionId}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ responseData }),
    });
    return normalizeSubmissionFromApi(res);
  },

  /**
   * Submit Form Response (DB)
   */
  async submitFormResponse(
    submissionId: string,
    responseData: Record<string, any>,
    actorName = 'User',
    actorRole = 'Participant'
  ): Promise<{ submission: FormSubmissionInstance; isFinalCompletion: boolean }> {
    const res = await apiRequest<any>(`/custom-forms/submissions/${submissionId}/submit`, {
      method: 'PUT',
      body: JSON.stringify({ responseData }),
    });

    const submission = normalizeSubmissionFromApi(res.submission || res);
    const isFinalCompletion = Boolean(res.isFinalCompletion || submission.status === 'completed');

    // In-app notifications
    if (!submission.workflowAttached || isFinalCompletion) {
      sendNotification('1', '🔔 Form Submission Completed', `Form "${submission.formTitle}" submitted by ${submission.assignedUserName}.`, '/admin/form-responses');
    } else {
      const level1Role = submission.approvalLevels?.[0]?.requiredRole || 'Purchase Manager';
      try {
        const allUsers = await adminService.listUsers();
        const approvers = allUsers.filter(
          (u) =>
            u.isActive !== false &&
            (isRoleMatching(level1Role, u.role, String(u.id)) ||
              ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(level1Role, r, String(u.id)))))
        );
        for (const app of approvers) {
          sendNotification(String(app.id), '🔔 Form Approval Required (Level 1)', `Form "${submission.formTitle}" submitted by ${submission.assignedUserName} requires Level 1 approval (${level1Role}).`, '/forms');
        }
      } catch (e) {}
      sendNotification(submission.assignedUserId, '🔔 Form Submitted for Approval', `Your submission for "${submission.formTitle}" was received and sent for Level 1 approval.`);
    }

    try {
      await notificationService.dispatchFormSubmissionEmail(submission, actorName);
    } catch (err) {
      console.error('Error dispatching submit email:', err);
    }

    return { submission, isFinalCompletion };
  },

  /**
   * Approve Form Level (DB)
   */
  async approveFormLevel(
    submissionId: string,
    comments = '',
    actorName = 'Approver',
    actorRole = 'Reviewer',
    actorEmail = '',
    updatedResponseData?: Record<string, any>
  ): Promise<{ submission: FormSubmissionInstance; isFinalCompletion: boolean }> {
    const res = await apiRequest<any>(`/custom-forms/submissions/${submissionId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ comments, responseData: updatedResponseData }),
    });

    const submission = normalizeSubmissionFromApi(res.submission || res);
    const isFinalCompletion = Boolean(res.isFinalCompletion || submission.status === 'completed');
    const approvedLevel = isFinalCompletion ? submission.totalLevels : submission.currentLevelNumber - 1;
    const stepRole = actorRole;

    if (isFinalCompletion) {
      sendNotification(submission.assignedUserId, '🎉 Form Fully Approved', `Your submission for "${submission.formTitle}" has been fully approved by all levels!`);
      sendNotification('1', '🎉 Form Workflow Completed', `Form "${submission.formTitle}" for ${submission.assignedUserName} passed all approval levels.`, '/admin/form-responses');
    } else {
      const nextLevelNum = submission.currentLevelNumber;
      const nextRole = submission.approvalLevels?.find((l) => l.levelNumber === nextLevelNum)?.requiredRole || 'Approver';
      try {
        const allUsers = await adminService.listUsers();
        const nextApprovers = allUsers.filter(
          (u) =>
            u.isActive !== false &&
            (isRoleMatching(nextRole, u.role, String(u.id)) ||
              ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(nextRole, r, String(u.id)))))
        );
        for (const app of nextApprovers) {
          sendNotification(String(app.id), `🔔 Form Approval Required (Level ${nextLevelNum})`, `Form "${submission.formTitle}" approved at Level ${approvedLevel}, now requires Level ${nextLevelNum} (${nextRole}) approval.`, '/forms');
        }
      } catch (e) {}
      sendNotification(submission.assignedUserId, '🔔 Form Progress Update', `Your submission for "${submission.formTitle}" passed Level ${approvedLevel} and advanced to Level ${nextLevelNum}.`);
    }

    try {
      await notificationService.dispatchLevelApprovalEmail(submission, approvedLevel, actorName, stepRole, comments, isFinalCompletion);
    } catch (e) {
      console.error('Error sending approval email:', e);
    }

    return { submission, isFinalCompletion };
  },

  /**
   * Return Form to User (DB)
   */
  async returnFormResponse(
    submissionId: string,
    comments: string,
    actorName = 'Approver',
    actorRole = 'Reviewer'
  ): Promise<FormSubmissionInstance> {
    const res = await apiRequest<any>(`/custom-forms/submissions/${submissionId}/return`, {
      method: 'PUT',
      body: JSON.stringify({ comments }),
    });

    const submission = normalizeSubmissionFromApi(res.submission || res);

    sendNotification(submission.assignedUserId, '⚠️ Form Returned For Edits', `Form "${submission.formTitle}" was returned by ${actorName} (${actorRole}). Reason: ${comments || 'Please revise and resubmit.'}`);

    // NOTE: Rich SAP Fiori return email (submitter + approver role) is sent
    // by the backend sendFormReturnEmail() — no duplicate dispatch here.

    return submission;
  },

  /**
   * Delete single submission (DB)
   */
  async deleteSubmission(submissionId: string): Promise<boolean> {
    await apiRequest(`/custom-forms/submissions/${submissionId}`, { method: 'DELETE' });
    return true;
  },

  /**
   * Bulk delete submissions (DB)
   */
  async deleteSubmissions(submissionIds: string[]): Promise<{ count: number }> {
    await apiRequest('/custom-forms/submissions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: submissionIds }),
    });
    return { count: submissionIds.length };
  },

  /**
   * No-op — localStorage removed
   */
  clearLocalFormCache(): void {},
};
