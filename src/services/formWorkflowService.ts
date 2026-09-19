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

export function isRoleMatching(requiredRole: string, userRole: any, userId?: string): boolean {
  if (!requiredRole || !userRole) return false;

  if (Array.isArray(userRole)) {
    return userRole.some((r) => isRoleMatching(requiredRole, r, userId));
  }

  let rawRoleStr = '';
  if (typeof userRole === 'string') {
    rawRoleStr = userRole;
  } else if (typeof userRole === 'object' && userRole !== null) {
    rawRoleStr = userRole.roleName || userRole.name || userRole.role?.roleName || userRole.role?.name || String(userRole || '');
  } else {
    rawRoleStr = String(userRole || '');
  }

  if (!rawRoleStr || typeof rawRoleStr !== 'string') return false;

  // Strip level number prefixes like "Level 2 of 2: Finance Approver" -> "Finance Approver"
  const stripPrefix = (str: string) => typeof str === 'string' ? str.replace(/^level\s*\d+(\s*of\s*\d+)?\s*:\s*/i, '').trim() : '';

  const req = stripPrefix(requiredRole).toLowerCase();
  const usr = stripPrefix(rawRoleStr).toLowerCase();

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
      targetUsers = targetUsers.filter((u: any) => {
        const uEmail = u.email ? u.email.toLowerCase().trim() : '';
        const uId = String(u.id || u._id || '');
        const fullName = (u.fullName || '').toLowerCase().trim();
        const username = (u.username || '').toLowerCase().trim();

        const isPublisher =
          (publisherEmail && uEmail === publisherEmail) ||
          (publisherId && (uId === publisherId || uId === '1'));
        if (isPublisher) return false;

        if (
          uEmail.endsWith('@procnex.com') ||
          uEmail === 'finance@procnex.com' ||
          uEmail === 'procurement@procnex.com' ||
          uEmail === 'admin@procnex.com' ||
          fullName === 'finance approver' ||
          fullName === 'procurement manager' ||
          fullName === 'system administrator' ||
          username === 'finance' ||
          username === 'procurement'
        ) {
          return false;
        }

        const rawRoles: string[] = [];
        if (Array.isArray(u.roles)) {
          u.roles.forEach((r: any) => {
            if (typeof r === 'string') rawRoles.push(r);
            else if (r && typeof r === 'object') rawRoles.push(r.roleName || r.name || r.role?.roleName || '');
          });
        }
        if (typeof u.role === 'string') rawRoles.push(u.role);
        else if (u.role && typeof u.role === 'object') rawRoles.push(u.role.roleName || u.role.name || '');
        if (u.apiRoleName && typeof u.apiRoleName === 'string') rawRoles.push(u.apiRoleName);

        const userRoles = rawRoles.map((r) => String(r).toLowerCase().trim());
        const isAdminOrSuperAdmin = userRoles.some(
          (r) =>
            r === 'super admin' ||
            r === 'administrator' ||
            r === 'admin' ||
            r === 'super-admin' ||
            r === 'super_admin' ||
            r.includes('admin')
        );
        return !isAdminOrSuperAdmin;
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

    return { submission, isFinalCompletion };
  },

  /**
   * Approve Form Level (DB)
   */
  async approveFormLevel(
    submissionId: string,
    comments = '',
    _actorName = 'Approver',
    _actorRole = 'Reviewer',
    _actorEmail = '',
    updatedResponseData?: Record<string, any>
  ): Promise<{ submission: FormSubmissionInstance; isFinalCompletion: boolean }> {
    const res = await apiRequest<any>(`/custom-forms/submissions/${submissionId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ comments, responseData: updatedResponseData }),
    });

    const submission = normalizeSubmissionFromApi(res.submission || res);
    const isFinalCompletion = Boolean(res.isFinalCompletion || submission.status === 'completed');

    return { submission, isFinalCompletion };
  },

  /**
   * Return Form to User (DB)
   */
  async returnFormResponse(
    submissionId: string,
    comments: string,
    _actorName = 'Approver',
    _actorRole = 'Reviewer'
  ): Promise<FormSubmissionInstance> {
    const res = await apiRequest<any>(`/custom-forms/submissions/${submissionId}/return`, {
      method: 'PUT',
      body: JSON.stringify({ comments }),
    });

    const submission = normalizeSubmissionFromApi(res.submission || res);
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
