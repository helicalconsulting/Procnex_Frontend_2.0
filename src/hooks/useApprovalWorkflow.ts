import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { approvalService } from '../services/approvalService';
import { hasApprovalRole, getModulePermission } from '../utils/rbac';
import type { ApprovalLevel, RequestApproval } from '../types';

export interface ApprovalWorkflowState {
  pendingApprovals: RequestApproval[];
  completedApprovals: RequestApproval[];
  approvalLevels: ApprovalLevel[];
  loading: boolean;
  error: string | null;
  canApprove: boolean;
  getPendingApprovalsForUser: () => RequestApproval[];
  getApprovalStatus: (module: string, referenceId: string) => RequestApproval[];
  approveRequest: (requestId: string, comment?: string) => Promise<void>;
  rejectRequest: (requestId: string, comment?: string) => Promise<void>;
}

export function useApprovalWorkflow(): ApprovalWorkflowState {
  const { roles } = useAuth();
  const [approvals, setApprovals] = useState<RequestApproval[]>([]);
  const [approvalLevels, setApprovalLevels] = useState<ApprovalLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, levels] = await Promise.all([
        approvalService.list(),
        approvalService.getLevels(),
      ]);
      setApprovals(list);
      setApprovalLevels(levels);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendingApprovals = approvals.filter((a) => a.status === 'PENDING');
  const completedApprovals = approvals.filter((a) => a.status !== 'PENDING');

  const getPendingApprovalsForUser = useCallback(() => {
    return pendingApprovals.filter((approval) => {
      const level = approval.level;
      if (!level) return false;
      return roles.includes(level.requiredRole);
    });
  }, [pendingApprovals, roles]);

  const getApprovalStatus = useCallback(
    (module: string, referenceId: string) => {
      return approvals.filter((a) => a.module === module && a.referenceId === referenceId);
    },
    [approvals]
  );

  const approveRequest = useCallback(
    async (requestId: string, comment?: string) => {
      await approvalService.approve(requestId, comment);
      await load();
    },
    [load]
  );

  const rejectRequest = useCallback(
    async (requestId: string, comment?: string) => {
      await approvalService.reject(requestId, comment);
      await load();
    },
    [load]
  );

  return {
    pendingApprovals,
    completedApprovals,
    approvalLevels,
    loading,
    error,
    canApprove: hasApprovalRole(roles),
    getPendingApprovalsForUser,
    getApprovalStatus,
    approveRequest,
    rejectRequest,
  };
}

export function canEdit(roles: string[], module: string): boolean {
  return roles.some((role) => {
    const permission = getModulePermission(role, module);
    return permission.canEdit === true;
  });
}
