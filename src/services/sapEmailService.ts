import { adminService } from './adminService';
import { isRoleMatching, type FormSubmissionInstance } from './formWorkflowService';

export interface SapEmailLog {
  id: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  bodyHtml: string;
  sentAt: string;
  formTitle: string;
  category: 'ASSIGNMENT' | 'APPROVAL_REQUEST' | 'APPROVED' | 'RETURNED' | 'DIRECT_COMPLETED';
  status: 'DELIVERED';
}

const STORAGE_KEY_SAP_EMAILS = 'heliflow_sap_emails_v1';

export function getStoredSapEmails(): SapEmailLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAP_EMAILS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to parse SAP emails:', e);
  }
  return [];
}

async function sendRealSmtpEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:3000/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });
    const data = await res.json();
    if (data && data.success) {
      console.log(`[REAL SMTP EMAIL SENT] Dispatched to ${to} (${subject})`);
      return true;
    } else {
      console.warn(`[REAL SMTP EMAIL RESP] Backend output:`, data);
    }
  } catch (err) {
    console.error(`[REAL SMTP EMAIL ERROR] Backend request failed:`, err);
  }
  return false;
}

export function saveSapEmails(emails: SapEmailLog[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SAP_EMAILS, JSON.stringify(emails));
    window.dispatchEvent(new CustomEvent('heliflow:sap-email-sent', { detail: { count: emails.length } }));
  } catch (e) {
    console.error('Failed to save SAP emails:', e);
  }
}

/**
 * Generate SAP Fiori Horizon HTML Email Template
 */
export function generateSapEmailHtml(params: {
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
}): string {
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
    actionButtonText = 'Open Heliflow Portal',
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
    .email-brand { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; opacity: 0.9; }
    .email-title { font-size: 20px; font-weight: 700; margin: 6px 0 0 0; line-height: 1.2; }
    .email-body { padding: 28px 24px; }
    .greeting { font-size: 15px; font-weight: 600; color: #1d2d3e; margin-bottom: 12px; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
    .meta-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }
    .meta-row:last-child { border-bottom: none; }
    .meta-label { color: #64748b; font-weight: 600; }
    .meta-value { color: #0f172a; font-weight: 700; }
    .callout-box { background: rgba(220, 38, 38, 0.06); border-left: 4px solid #dc2626; padding: 12px 16px; margin-bottom: 20px; border-radius: 0 4px 4px 0; font-size: 13px; color: #991b1b; }
    .cta-btn { display: inline-block; background: #0a6ed1; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; box-shadow: 0 2px 6px rgba(10, 110, 209, 0.25); margin-top: 10px; }
    .email-footer { background: #f1f5f9; padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="email-card">
    <div class="email-header">
      <div class="email-brand">Heliflow 3.0 — Enterprise Custom Form Portal</div>
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
      This is an automated SAP Enterprise notification from Heliflow Portal.<br>
      © ${new Date().getFullYear()} Heliflow Enterprise Systems. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;
}

export const sapEmailService = {
  getLogs: getStoredSapEmails,

  /**
   * Dispatch emails when form is published (Send to all target recipient users simultaneously)
   */
  async dispatchFormAssignmentEmails(submissionList: FormSubmissionInstance[]): Promise<number> {
    if (!submissionList || submissionList.length === 0) return 0;

    const currentLogs = getStoredSapEmails();
    const newLogs: SapEmailLog[] = [];

    for (const sub of submissionList) {
      const isWorkflow = Boolean(sub.workflowAttached && sub.totalLevels > 0);
      const headline = isWorkflow
        ? `📋 New Form Assigned (Approval Workflow Active)`
        : `📋 New Direct Form Assigned`;

      const messageText = isWorkflow
        ? `You have been assigned the form <strong>"${sub.formTitle}"</strong>. Upon your submission, it will undergo a ${sub.totalLevels}-level approval workflow.`
        : `You have been assigned the form <strong>"${sub.formTitle}"</strong>. Please fill out the form and submit your response directly.`;

      const html = generateSapEmailHtml({
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
      });

      newLogs.push({
        id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        recipientEmail: sub.assignedUserEmail,
        recipientName: sub.assignedUserName,
        subject: `[Heliflow SAP] ${headline}: ${sub.formTitle}`,
        bodyHtml: html,
        sentAt: new Date().toISOString(),
        formTitle: sub.formTitle,
        category: 'ASSIGNMENT',
        status: 'DELIVERED',
      });
    }

    saveSapEmails([...newLogs, ...currentLogs]);
    for (const log of newLogs) {
      sendRealSmtpEmail(log.recipientEmail, log.subject, log.bodyHtml).catch(() => {});
    }
    return newLogs.length;
  },

  /**
   * Dispatch email when employee submits form
   */
  async dispatchFormSubmissionEmail(sub: FormSubmissionInstance, actorName: string): Promise<number> {
    const currentLogs = getStoredSapEmails();
    const newLogs: SapEmailLog[] = [];
    const isWorkflow = Boolean(sub.workflowAttached && sub.totalLevels > 0);

    if (!isWorkflow) {
      // Direct Submission without workflow -> Send email to Admin
      const html = generateSapEmailHtml({
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
      });

      newLogs.push({
        id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        recipientEmail: 'admin@heliflow.com',
        recipientName: 'Administrator',
        subject: `[Heliflow SAP] Direct Submission Received: ${sub.formTitle} (${sub.assignedUserName})`,
        bodyHtml: html,
        sentAt: new Date().toISOString(),
        formTitle: sub.formTitle,
        category: 'DIRECT_COMPLETED',
        status: 'DELIVERED',
      });
    } else {
      // Workflow Attached -> Send Level 1 Approver Sequential Email
      const level1Step = sub.approvalLevels ? sub.approvalLevels[0] : null;
      const level1Role = level1Step ? level1Step.requiredRole : 'Procurement Manager';

      // Find Level 1 Approvers
      const allUsers = await adminService.listUsers();
      const level1Approvers = allUsers.filter(
        (u) =>
          u.isActive !== false &&
          (isRoleMatching(level1Role, u.role, String(u.id)) ||
            ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(level1Role, r, String(u.id)))))
      );

      for (const app of level1Approvers) {
        const html = generateSapEmailHtml({
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
        });

        newLogs.push({
          id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          recipientEmail: app.email,
          recipientName: app.fullName,
          subject: `[Heliflow SAP] 🔔 Level 1 Approval Required (${level1Role}): ${sub.formTitle}`,
          bodyHtml: html,
          sentAt: new Date().toISOString(),
          formTitle: sub.formTitle,
          category: 'APPROVAL_REQUEST',
          status: 'DELIVERED',
        });
      }
    }

    saveSapEmails([...newLogs, ...currentLogs]);
    for (const log of newLogs) {
      sendRealSmtpEmail(log.recipientEmail, log.subject, log.bodyHtml).catch(() => {});
    }
    return newLogs.length;
  },

  /**
   * Dispatch email when level is approved (Sequential Level-to-Level)
   */
  async dispatchLevelApprovalEmail(
    sub: FormSubmissionInstance,
    approvedLevelNum: number,
    actorName: string,
    actorRole: string,
    comments: string,
    isFinal: boolean
  ): Promise<number> {
    const currentLogs = getStoredSapEmails();
    const newLogs: SapEmailLog[] = [];

    if (isFinal) {
      // Final approval -> Notify Submitter
      const html = generateSapEmailHtml({
        recipientName: sub.assignedUserName,
        headline: `🎉 Form Response Fully Approved`,
        messageText: `Your form response for <strong>"${sub.formTitle}"</strong> has successfully passed all <strong>${sub.totalLevels} approval levels</strong> and is now fully completed!`,
        formTitle: sub.formTitle,
        workflowAttached: true,
        totalLevels: sub.totalLevels,
        currentLevelInfo: `Completed (Level ${approvedLevelNum} approved by ${actorName})`,
        priority: sub.priority,
        comments,
        actionUrl: 'http://localhost:5173/forms',
        actionButtonText: 'View Approved Response',
      });

      newLogs.push({
        id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        recipientEmail: sub.assignedUserEmail,
        recipientName: sub.assignedUserName,
        subject: `[Heliflow SAP] 🎉 Form Fully Approved: ${sub.formTitle}`,
        bodyHtml: html,
        sentAt: new Date().toISOString(),
        formTitle: sub.formTitle,
        category: 'APPROVED',
        status: 'DELIVERED',
      });
    } else {
      // Intermediate level -> Send Email to NEXT Level Approver ONLY (Level-to-Level)
      const nextLevelNum = approvedLevelNum + 1;
      const nextStep = sub.approvalLevels?.find((l) => l.levelNumber === nextLevelNum);
      const nextRole = nextStep ? nextStep.requiredRole : 'Next Approver';

      const allUsers = await adminService.listUsers();
      const nextApprovers = allUsers.filter(
        (u) =>
          u.isActive !== false &&
          (isRoleMatching(nextRole, u.role, String(u.id)) ||
            ((u as any).roles && (u as any).roles.some((r: string) => isRoleMatching(nextRole, r, String(u.id)))))
      );

      for (const app of nextApprovers) {
        const html = generateSapEmailHtml({
          recipientName: app.fullName,
          headline: `🔔 Level ${nextLevelNum} Approval Required`,
          messageText: `Form <strong>"${sub.formTitle}"</strong> (Submitted by ${sub.assignedUserName}) was approved at Level ${approvedLevelNum} by <strong>${actorName} (${actorRole})</strong> and now requires your <strong>Level ${nextLevelNum} (${nextRole})</strong> approval.`,
          formTitle: sub.formTitle,
          workflowAttached: true,
          totalLevels: sub.totalLevels,
          currentLevelInfo: `Level ${nextLevelNum} of ${sub.totalLevels} (${nextRole})`,
          priority: sub.priority,
          comments,
          actionUrl: 'http://localhost:5173/forms',
          actionButtonText: `Review Level ${nextLevelNum} Request`,
        });

        newLogs.push({
          id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          recipientEmail: app.email,
          recipientName: app.fullName,
          subject: `[Heliflow SAP] 🔔 Level ${nextLevelNum} Approval Required (${nextRole}): ${sub.formTitle}`,
          bodyHtml: html,
          sentAt: new Date().toISOString(),
          formTitle: sub.formTitle,
          category: 'APPROVAL_REQUEST',
          status: 'DELIVERED',
        });
      }
    }

    saveSapEmails([...newLogs, ...currentLogs]);
    for (const log of newLogs) {
      sendRealSmtpEmail(log.recipientEmail, log.subject, log.bodyHtml).catch(() => {});
    }
    return newLogs.length;
  },

  /**
   * Dispatch email when level approver returns form to submitter
   */
  async dispatchFormReturnEmail(
    sub: FormSubmissionInstance,
    returnLevelNum: number,
    actorName: string,
    actorRole: string,
    comments: string
  ): Promise<number> {
    const currentLogs = getStoredSapEmails();

    const html = generateSapEmailHtml({
      recipientName: sub.assignedUserName,
      headline: `⚠️ Form Returned For Revision`,
      messageText: `Your form response for <strong>"${sub.formTitle}"</strong> was returned at <strong>Level ${returnLevelNum} by ${actorName} (${actorRole})</strong>. Please make necessary revisions and resubmit.`,
      formTitle: sub.formTitle,
      workflowAttached: true,
      totalLevels: sub.totalLevels,
      currentLevelInfo: `Returned at Level ${returnLevelNum}`,
      priority: sub.priority,
      comments: comments || 'Please review form fields and resubmit to Level 1.',
      actionUrl: 'http://localhost:5173/forms',
      actionButtonText: 'Revise & Resubmit Form',
    });

    const newLog: SapEmailLog = {
      id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      recipientEmail: sub.assignedUserEmail,
      recipientName: sub.assignedUserName,
      subject: `[Heliflow SAP] ⚠️ Form Returned for Edits: ${sub.formTitle}`,
      bodyHtml: html,
      sentAt: new Date().toISOString(),
      formTitle: sub.formTitle,
      category: 'RETURNED',
      status: 'DELIVERED',
    };

    saveSapEmails([newLog, ...currentLogs]);
    sendRealSmtpEmail(newLog.recipientEmail, newLog.subject, newLog.bodyHtml).catch(() => {});
    return 1;
  },
};
