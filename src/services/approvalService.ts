import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { mapApprovalToTableRow, MOCK_REQUEST_APPROVALS, MOCK_APPROVAL_LEVELS } from '../api/mappers';
import { APPROVALS_PAGE_MOCK } from '../mocks/approvalsPage.mock';
import type { ApprovalTableRow } from '../types/viewModels';
import type { ApprovalLevel, RequestApproval } from '../types';

interface ListParams {
  status?: string;
  module?: string;
  search?: string;
}

async function mockListTable(): Promise<ApprovalTableRow[]> {
  await new Promise((r) => setTimeout(r, 300));
  return APPROVALS_PAGE_MOCK;
}

async function apiListTable(params?: ListParams): Promise<ApprovalTableRow[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.module) query.set('module', params.module);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  const data = await apiRequest<{ approvals: Record<string, unknown>[] }>(
    `/approvals${qs ? `?${qs}` : ''}`
  );
  return (data.approvals || []).map(mapApprovalToTableRow);
}

async function mockListTyped(): Promise<RequestApproval[]> {
  return MOCK_REQUEST_APPROVALS;
}

async function apiListTyped(): Promise<RequestApproval[]> {
  const data = await apiRequest<{ approvals: RequestApproval[] }>('/approvals');
  return data.approvals || [];
}

async function mockLevels(): Promise<ApprovalLevel[]> {
  return MOCK_APPROVAL_LEVELS;
}

async function apiLevels(): Promise<ApprovalLevel[]> {
  return apiRequest<ApprovalLevel[]>('/admin/approval-levels');
}

interface ApprovalActionResult {
  message?: string;
  nextLevel?: boolean;
}

async function approve(id: string, comment?: string): Promise<ApprovalActionResult> {
  if (USE_MOCK) {
    console.log(`Approved ${id}`, comment);
    return {};
  }
  return apiRequest<ApprovalActionResult>(`/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ comments: comment }),
  });
}

async function reject(id: string, comment?: string): Promise<ApprovalActionResult> {
  if (USE_MOCK) {
    console.log(`Rejected ${id}`, comment);
    return {};
  }
  return apiRequest<ApprovalActionResult>(`/approvals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ comments: comment }),
  });
}

async function returnRequest(id: string, comment?: string): Promise<ApprovalActionResult> {
  if (USE_MOCK) {
    console.log(`Returned ${id}`, comment);
    return {};
  }
  return apiRequest<ApprovalActionResult>(`/approvals/${id}/return`, {
    method: 'POST',
    body: JSON.stringify({ comments: comment }),
  });
}

export const approvalService = {
  listTable: USE_MOCK ? mockListTable : apiListTable,
  list: USE_MOCK ? mockListTyped : apiListTyped,
  getLevels: USE_MOCK ? mockLevels : apiLevels,
  approve,
  reject,
  return: returnRequest,
};
