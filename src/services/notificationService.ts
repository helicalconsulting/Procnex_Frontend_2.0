import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { pickList } from '../api/normalize';
import { mapNotificationToRow, MOCK_NOTIFICATIONS } from '../api/mappers';
import { NOTIFICATIONS_PAGE_MOCK } from '../mocks/notificationsPage.mock';
import type { NotificationRow } from '../types/viewModels';
import type { Notification } from '../types';
import { isRoleMatching, type FormSubmissionInstance } from './formWorkflowService';
import { adminService } from './adminService';
import { companySettingsService } from './companySettingsService';

// ─── Helper to fetch dynamic Company Name with fallback to 'Procnex' ─────────
let cachedCompanyName = '';
async function getEffectiveCompanyName(): Promise<string> {
  if (cachedCompanyName) return cachedCompanyName;
  try {
    const profile = await companySettingsService.getCompanyProfile();
    if (profile && profile.companyName && profile.companyName.trim()) {
      cachedCompanyName = profile.companyName.trim();
      return cachedCompanyName;
    }
  } catch {
    // ignore fetch errors
  }
  return 'Procnex';
}

// ─── Direct SMTP System Email Dispatcher ───────────────────────────────────────

export async function sendSystemEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:3000/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });
    const data = await res.json();
    if (data && data.success) {
      console.log(`[System Email Dispatched] To: ${to} | Subject: ${subject}`);
      return true;
    }
  } catch (err) {
    console.error('[System Email Error]:', err);
  }
  return false;
}

export function buildSystemEmailHtml(params: {
  recipientName: string;
  headline: string;
  messageText: string;
  formTitle: string;
  workflowAttached: boolean;
  totalLevels: number;
  currentLevelInfo?: string;
  priority?: string;
  dueDate?: string;
  comments?: string;
  actionUrl?: string;
  actionButtonText?: string;
  companyName?: string;
}): string {
  const cName = (params.companyName && params.companyName.trim()) || 'Procnex';
  const {
    recipientName,
    headline,
    messageText,
    formTitle,
    workflowAttached,
    totalLevels,
    currentLevelInfo,
    priority = 'Medium',
    dueDate,
    comments,
    actionUrl = 'http://localhost:5173/forms',
    actionButtonText = `Open ${cName} Portal`,
  } = params;

  const priorityColor = priority === 'High' ? '#dc2626' : priority === 'Low' ? '#107e3e' : '#d97706';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #1d2d3e; }
    .email-card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #d9e2ec; overflow: hidden; box-shadow: 0 4px 12px rgba(10, 110, 209, 0.08); }
    .email-header { background: linear-gradient(135deg, #0a6ed1 0%, #0854a0 100%); padding: 24px; color: #ffffff; text-align: left; }
    .email-brand { font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.9; }
    .email-title { font-size: 21px; font-weight: 700; margin: 6px 0 0 0; line-height: 1.2; }
    .email-body { padding: 28px 24px; }
    .greeting { font-size: 16px; font-weight: 600; color: #1d2d3e; margin-bottom: 12px; }
    .message { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
    .meta-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
    .meta-row:last-child { border-bottom: none; }
    .meta-label { color: #64748b; font-weight: 600; }
    .meta-value { color: #0f172a; font-weight: 700; }
    .callout-box { background: rgba(220, 38, 38, 0.06); border-left: 4px solid #dc2626; padding: 12px 16px; margin-bottom: 20px; border-radius: 0 4px 4px 0; font-size: 14px; color: #991b1b; }
    .cta-btn { display: inline-block; background: #0a6ed1; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 6px rgba(10, 110, 209, 0.25); margin-top: 10px; }
    .email-footer { background: #f1f5f9; padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #64748b; }
  </style>
</head>
<body>
  <div class="email-card">
    <div class="email-header">
      <div class="email-brand">${cName.toUpperCase()} ENTERPRISE NOTIFICATION SERVICE</div>
      <div class="email-title">${headline}</div>
    </div>
    <div class="email-body">
      <div class="greeting">Hello ${recipientName},</div>
      <div class="message">${messageText}</div>

      <div class="meta-box">
        <div class="meta-row"><span class="meta-label">Form Title</span><span class="meta-value">${formTitle}</span></div>
        <div class="meta-row"><span class="meta-label">Workflow Mode</span><span class="meta-value">${workflowAttached ? `Approval Workflow (${totalLevels} Levels)` : 'Direct Submission (No Workflow)'}</span></div>
        ${currentLevelInfo ? `<div class="meta-row"><span class="meta-label">Level / Status</span><span class="meta-value">${currentLevelInfo}</span></div>` : ''}
        <div class="meta-row"><span class="meta-label">Priority</span><span class="meta-value" style="color: ${priorityColor};">${priority}</span></div>
        ${dueDate ? `<div class="meta-row"><span class="meta-label">Due Date</span><span class="meta-value">${dueDate}</span></div>` : ''}
      </div>

      ${comments ? `<div class="callout-box"><strong>Comments / Return Reason:</strong> "${comments}"</div>` : ''}

      <div style="text-align: center;">
        <a href="${actionUrl}" class="cta-btn">${actionButtonText}</a>
      </div>
    </div>
    <div class="email-footer">
      This is an automated system notification from ${cName} Portal.<br>
      © ${new Date().getFullYear()} ${cName}. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;
}

// ─── Workflow Email Handlers ──────────────────────────────────────────────────

export async function dispatchFormAssignmentEmails(submissionList: FormSubmissionInstance[]): Promise<number> {
  if (!submissionList || submissionList.length === 0) return 0;
  const cName = await getEffectiveCompanyName();

  for (const sub of submissionList) {
    const isWorkflow = Boolean(sub.workflowAttached && sub.totalLevels > 0);
    const headline = isWorkflow
      ? `📋 New Form Assigned (Approval Workflow Active)`
      : `📋 New Direct Form Assigned`;

    const messageText = isWorkflow
      ? `You have been assigned the form <strong>"${sub.formTitle}"</strong>. Upon your submission, it will undergo a ${sub.totalLevels}-level approval workflow.`
      : `You have been assigned the form <strong>"${sub.formTitle}"</strong>. Please fill out the form and submit your response directly.`;

    const html = buildSystemEmailHtml({
      recipientName: sub.assignedUserName,
      headline,
      messageText,
      formTitle: sub.formTitle,
      workflowAttached: isWorkflow,
      totalLevels: sub.totalLevels,
      priority: sub.priority,
      dueDate: sub.dueDate,
      actionUrl: 'http://localhost:5173/forms',
      actionButtonText: 'Fill Form Response',
      companyName: cName,
    });

    sendSystemEmail(sub.assignedUserEmail, `[${cName} Notification] ${headline}: ${sub.formTitle}`, html).catch(() => {});
  }
  return submissionList.length;
}

export async function dispatchFormSubmissionEmail(sub: FormSubmissionInstance, actorName: string): Promise<number> {
  const isWorkflow = Boolean(sub.workflowAttached && sub.totalLevels > 0);
  const cName = await getEffectiveCompanyName();

  if (!isWorkflow) {
    const html = buildSystemEmailHtml({
      recipientName: 'Administrator',
      headline: `✅ Direct Form Submission Received`,
      messageText: `Employee <strong>${sub.assignedUserName}</strong> (${sub.assignedUserEmail}) has directly submitted response for <strong>"${sub.formTitle}"</strong>.`,
      formTitle: sub.formTitle,
      workflowAttached: false,
      totalLevels: 0,
      currentLevelInfo: 'Direct Submission (Completed)',
      priority: sub.priority,
      actionUrl: 'http://localhost:5173/admin/form-responses',
      actionButtonText: 'View Response in Admin Dashboard',
      companyName: cName,
    });

    sendSystemEmail('admin@procnex.com', `[${cName} Notification] Direct Submission Received: ${sub.formTitle} (${sub.assignedUserName})`, html).catch(() => {});
    return 1;
  } else {
    const level1Step = sub.approvalLevels ? sub.approvalLevels[0] : null;
    const level1Role = level1Step ? level1Step.requiredRole : 'Procurement Manager';

    const allUsers = await adminService.listUsers();
    const level1Approvers = allUsers.filter(
      (u) =>
        u.isActive !== false &&
        (isRoleMatching(level1Role, u.role, String(u.id)) ||
          ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(level1Role, r, String(u.id)))))
    );

    for (const app of level1Approvers) {
      const html = buildSystemEmailHtml({
        recipientName: app.fullName,
        headline: `🔔 Level 1 Approval Required`,
        messageText: `Form response for <strong>"${sub.formTitle}"</strong> submitted by <strong>${sub.assignedUserName}</strong> requires your <strong>Level 1 (${level1Role})</strong> review and approval.`,
        formTitle: sub.formTitle,
        workflowAttached: true,
        totalLevels: sub.totalLevels,
        currentLevelInfo: `Level 1 of ${sub.totalLevels} (${level1Role})`,
        priority: sub.priority,
        dueDate: sub.dueDate,
        actionUrl: 'http://localhost:5173/forms',
        actionButtonText: 'Review & Approve Request',
        companyName: cName,
      });

      sendSystemEmail(app.email, `[${cName} Notification] 🔔 Level 1 Approval Required (${level1Role}): ${sub.formTitle}`, html).catch(() => {});
    }
    return level1Approvers.length;
  }
}

export async function dispatchLevelApprovalEmail(
  sub: FormSubmissionInstance,
  approvedLevelNum: number,
  actorName: string,
  actorRole: string,
  comments = ''
): Promise<number> {
  const isFinal = approvedLevelNum >= sub.totalLevels;
  const cName = await getEffectiveCompanyName();

  if (isFinal) {
    const htmlSubmitter = buildSystemEmailHtml({
      recipientName: sub.assignedUserName,
      headline: `🎉 Form Workflow Fully Approved & Completed`,
      messageText: `Congratulations! Your form submission for <strong>"${sub.formTitle}"</strong> has passed all ${sub.totalLevels} approval levels and is officially complete!`,
      formTitle: sub.formTitle,
      workflowAttached: true,
      totalLevels: sub.totalLevels,
      currentLevelInfo: `Fully Approved (${sub.totalLevels} of ${sub.totalLevels})`,
      priority: sub.priority,
      comments: comments || `Final Level ${approvedLevelNum} approved by ${actorName} (${actorRole}).`,
      actionUrl: 'http://localhost:5173/forms',
      actionButtonText: 'View Approved Response',
      companyName: cName,
    });

    sendSystemEmail(sub.assignedUserEmail, `[${cName} Notification] 🎉 Form Fully Approved: ${sub.formTitle}`, htmlSubmitter).catch(() => {});
    return 1;
  } else {
    const nextLevelNum = approvedLevelNum + 1;
    const nextStep = sub.approvalLevels?.find((l) => l.levelNumber === nextLevelNum);
    const nextRole = nextStep ? nextStep.requiredRole : `Level ${nextLevelNum} Approver`;

    const allUsers = await adminService.listUsers();
    const nextApprovers = allUsers.filter(
      (u) =>
        u.isActive !== false &&
        (isRoleMatching(nextRole, u.role, String(u.id)) ||
          ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(nextRole, r, String(u.id)))))
    );

    for (const app of nextApprovers) {
      const html = buildSystemEmailHtml({
        recipientName: app.fullName,
        headline: `🔔 Level ${nextLevelNum} Approval Required`,
        messageText: `Form <strong>"${sub.formTitle}"</strong> (submitted by ${sub.assignedUserName}) has passed Level ${approvedLevelNum} and now requires your <strong>Level ${nextLevelNum} (${nextRole})</strong> approval.`,
        formTitle: sub.formTitle,
        workflowAttached: true,
        totalLevels: sub.totalLevels,
        currentLevelInfo: `Level ${nextLevelNum} of ${sub.totalLevels} (${nextRole})`,
        priority: sub.priority,
        dueDate: sub.dueDate,
        comments,
        actionUrl: 'http://localhost:5173/forms',
        actionButtonText: `Review Level ${nextLevelNum} Request`,
        companyName: cName,
      });

      sendSystemEmail(app.email, `[${cName} Notification] 🔔 Level ${nextLevelNum} Approval Required (${nextRole}): ${sub.formTitle}`, html).catch(() => {});
    }
    return nextApprovers.length;
  }
}

export async function dispatchFormReturnEmail(
  sub: FormSubmissionInstance,
  actorName: string,
  actorRole: string,
  comments = ''
): Promise<number> {
  const cName = await getEffectiveCompanyName();
  const html = buildSystemEmailHtml({
    recipientName: sub.assignedUserName,
    headline: `⚠️ Form Response Returned for Revision`,
    messageText: `Your submission for <strong>"${sub.formTitle}"</strong> was returned by <strong>${actorName} (${actorRole})</strong>. Please review the comments, update your form entries, and resubmit.`,
    formTitle: sub.formTitle,
    workflowAttached: true,
    totalLevels: sub.totalLevels,
    currentLevelInfo: `Returned at Level ${sub.currentLevelNumber}`,
    priority: sub.priority,
    comments: comments || 'Please revise your inputs and resubmit.',
    actionUrl: 'http://localhost:5173/forms',
    actionButtonText: 'Revise & Resubmit Form',
    companyName: cName,
  });

  sendSystemEmail(sub.assignedUserEmail, `[${cName} Notification] ⚠️ Action Required: Form "${sub.formTitle}" Returned for Revision`, html).catch(() => {});
  return 1;
}

// ─── Standard Notification Service Export ─────────────────────────────────────

async function mockList(): Promise<NotificationRow[]> {
  await new Promise((r) => setTimeout(r, 200));
  return NOTIFICATIONS_PAGE_MOCK;
}

async function apiList(): Promise<NotificationRow[]> {
  const data = await apiRequest<{ notifications: Notification[] }>('/notifications?limit=100');
  const list = pickList<Notification>(data, ['notifications']);
  return list.map((n) => mapNotificationToRow(n as Notification & Record<string, unknown>));
}

async function mockListTyped(): Promise<Notification[]> {
  return MOCK_NOTIFICATIONS;
}

async function apiListTyped(): Promise<Notification[]> {
  const data = await apiRequest<{ notifications: Notification[] }>('/notifications?limit=100');
  return pickList<Notification>(data, ['notifications']);
}

async function markRead(id: string): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
}

async function markAllRead(): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest('/notifications/read-all', { method: 'PUT' });
}

async function deleteAll(): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest('/notifications', { method: 'DELETE' });
}

async function mockUnreadCount(): Promise<number> {
  return MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length;
}

async function apiUnreadCount(): Promise<number> {
  const data = await apiRequest<{ unreadCount: number }>('/notifications/unread-count');
  return data.unreadCount ?? 0;
}

export const notificationService = {
  list: USE_MOCK ? mockList : apiList,
  listTyped: USE_MOCK ? mockListTyped : apiListTyped,
  unreadCount: USE_MOCK ? mockUnreadCount : apiUnreadCount,
  markRead,
  markAllRead,
  deleteAll,
  sendEmail: sendSystemEmail,
  dispatchFormAssignmentEmails,
  dispatchFormSubmissionEmail,
  dispatchLevelApprovalEmail,
  dispatchFormReturnEmail,
};
