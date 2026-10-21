// ============================================================
// api/budgetApi.ts — Typed Budget API Client
// ============================================================
import { apiRequest } from './client';

export interface BudgetLine {
  id: string;
  budgetId: string;
  companyCode: string;
  lineCode: string;
  lineName: string;
  branchCode?: string | null;
  costCenterCode?: string | null;
  costCenterName?: string | null;
  glAccountCode?: string | null;
  glAccountName?: string | null;
  spendCategory?: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  donorName?: string | null;
  assetClass?: string | null;
  siteLocation?: string | null;
  contractId?: string | null;
  annualAmount: number;
  q1Amount: number;
  q2Amount: number;
  q3Amount: number;
  q4Amount: number;
  monthlyPhasing?: Record<string, number> | null;
  preCommittedAmount: number;
  committedAmount: number;
  actualSpentAmount: number;
  availableAmount: number;
  controlLevelOverride?: string | null;
  lineOwnerId?: string | null;
  lineOwnerName?: string | null;
  isFrozen: boolean;
  notes?: string | null;
  totalConsumed?: number;
  utilizationPercent?: number;
  isNearExhaustion?: boolean;
  isOverBudget?: boolean;
}

export interface Budget {
  id: string;
  companyCode: string;
  budgetName: string;
  budgetCode: string;
  budgetType: 'OPEX' | 'CAPEX' | 'PROJECT' | 'DONOR_GRANT' | string;
  fiscalYear: string;
  periodGranularity: 'ANNUAL' | 'SEMI_ANNUAL' | 'QUARTERLY' | 'MONTHLY' | string;
  startDate: string;
  endDate: string;
  currency: string;
  fxSource: string;
  vatTreatment: string;
  ownerId?: string | null;
  ownerName?: string | null;
  fundingSource: string;
  parentBudgetId?: string | null;
  erpReference?: string | null;
  totalAllocated: number;
  totalPreCommitted: number;
  totalCommitted: number;
  totalActualSpent: number;
  totalAvailable: number;
  controlLevel: 'HARD_STOP' | 'SOFT_WARNING' | 'ADVISORY' | 'NONE' | string;
  tolerancePercent: number;
  toleranceCap: number;
  checkPoints?: Record<string, boolean>;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'FROZEN' | 'CLOSED';
  version: string;
  createdAt: string;
  updatedAt: string;
  lines?: BudgetLine[];
  alertRules?: any[];
  revisions?: any[];
  transfers?: any[];
  _count?: { lines: number; transfers: number };
}

export interface BudgetListResponse {
  budgets: Budget[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  kpis: {
    totalAllocated: number;
    totalPreCommitted: number;
    totalCommitted: number;
    totalActualSpent: number;
    totalAvailable: number;
    activeBudgetsCount: number;
    totalBudgetsCount: number;
  };
}

export interface SpendValidationResponse {
  allowed: boolean;
  budgetLineId?: string;
  lineCode?: string;
  lineName?: string;
  budgetId?: string;
  budgetName?: string;
  budgetCurrency: string;
  requestedAmountOriginal: number;
  requestedCurrency: string;
  convertedAmount: number;
  exchangeRate: number;
  availableAmount: number;
  deficit: number;
  controlLevel: string;
  requiresExceptionApproval?: boolean;
  requiresSoftWarningOverride?: boolean;
  reason?: string;
}

export const budgetApi = {
  list: (params?: Record<string, any>) => {
    const query = new URLSearchParams(params as any).toString();
    return apiRequest<BudgetListResponse>(`/budgets${query ? `?${query}` : ''}`);
  },

  getById: (id: string) => {
    return apiRequest<Budget>(`/budgets/${id}`);
  },

  create: (data: Partial<Budget> & { lines?: any[]; submitForApproval?: boolean }) => {
    return apiRequest<{ success: boolean; budget: Budget }>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
  },

  update: (id: string, data: Partial<Budget>) => {
    return apiRequest<{ success: boolean; budget: Budget }>(`/budgets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
  },

  delete: (id: string) => {
    return apiRequest<{ success: boolean; message: string }>(`/budgets/${id}`, {
      method: 'DELETE',
    });
  },

  importLines: (id: string, lines: any[]) => {
    return apiRequest<{ success: boolean; importedCount: number }>(`/budgets/${id}/lines/import`, {
      method: 'POST',
      body: JSON.stringify({ lines }),
      headers: { 'Content-Type': 'application/json' },
    });
  },

  checkAvailability: (data: {
    documentType?: string;
    budgetLineId: string;
    amount: number;
    currency?: string;
    overrideReason?: string;
  }) => {
    return apiRequest<SpendValidationResponse>('/budgets/check-availability', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
  },

  getLedger: (id: string, params?: Record<string, any>) => {
    const query = new URLSearchParams(params as any).toString();
    return apiRequest<{ items: any[]; pagination: any }>(`/budgets/${id}/ledger${query ? `?${query}` : ''}`);
  },

  getSRMAnalytics: (id: string) => {
    return apiRequest<{
      budgetId: string;
      budgetName: string;
      totalAllocated: number;
      totalCommitted: number;
      totalActualSpent: number;
      topVendors: Array<{
        vendorId: string;
        vendorName: string;
        vendorCategory?: string;
        poCount: number;
        totalCommitted: number;
      }>;
      categoryBreakdown: Array<{
        category: string;
        amount: number;
        percentage: number;
      }>;
    }>(`/budgets/${id}/srm-analytics`);
  },

  createTransfer: (id: string, data: {
    transferType?: string;
    sourceLineId?: string | null;
    destinationLineId: string;
    amount: number;
    currency?: string;
    reason: string;
  }) => {
    return apiRequest<{ success: boolean; transfer: any }>(`/budgets/${id}/transfers`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
  },

  approveTransfer: (budgetId: string, transferId: string) => {
    return apiRequest<{ success: boolean; transfer: any }>(`/budgets/${budgetId}/transfers/${transferId}/approve`, {
      method: 'POST',
    });
  },

  setFreeze: (id: string, data: { lineId?: string | null; isFrozen: boolean; reason: string }) => {
    return apiRequest<{ success: boolean; result: any }>(`/budgets/${id}/freeze`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
  },

  getActiveLines: () => {
    return apiRequest<{
      success: boolean;
      lines: Array<BudgetLine & {
        budgetName: string;
        budgetCode: string;
        budgetCurrency: string;
        controlLevel: string;
      }>;
    }>('/budgets/active-lines');
  },
};

