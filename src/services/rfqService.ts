import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { mapApiRfqToTableRow, mapRfqFromTypes, MOCK_RFQS } from '../api/mappers';
import { RFQ_PAGE_MOCK } from '../mocks/rfqPage.mock';
import type { RFQTableRow } from '../types/viewModels';
import type { RFQ } from '../types';

interface ListParams {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateRfqPayload {
  title: string;
  description?: string;
  priority?: string;
  department?: string;
  departmentId?: string;
  closingDate?: string;
  currency?: string;
  items: Array<{
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    expectedDate?: string;
  }>;
  vendorIds?: string[];
  rfqType?: 'RFQ' | 'TENDER';
  startLevelNumber?: number;
  customFields?: Array<{
    fieldName: string;
    fieldType: 'text' | 'number' | 'date' | 'attachment';
    required: boolean;
    weightage?: number;
  }>;
  evaluationParameters?: Array<{
    parameterName: string;
    parameterType: 'system' | 'custom';
    weightage: number;
    active: boolean;
    sortOrder?: number;
  }>;
  // Bid Security
  bidSecurityRequired?: boolean;
  bidBondRequired?: boolean;
  bidSecurityType?: 'BID_BOND';
  bidSecurityValueType?: 'FIXED_AMOUNT' | 'PERCENTAGE';
  bidSecurityValue?: number;
  bidSecurityCurrency?: string;
  bidSecurityValidityValue?: number;
  bidSecurityValidityUnit?: 'DAYS';
  // Min value/validity — buyer sets these as requirements
  bidSecurityMinValue?: number;
  bidSecurityMinCurrency?: string;
  bidSecurityMinValidity?: number;
  bidBondMinValue?: number;
  bidBondMinCurrency?: string;
  bidBondMinValidity?: number;
}

async function mockList(params?: ListParams): Promise<RFQTableRow[]> {
  await new Promise((r) => setTimeout(r, 300));
  let list = [...RFQ_PAGE_MOCK];
  if (params?.status && params.status !== 'ALL') {
    list = list.filter((r) => r.status === params.status);
  }
  if (params?.search?.trim()) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.rfqNumber.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }
  return list;
}

async function apiList(params?: ListParams): Promise<RFQTableRow[]> {
  const query = new URLSearchParams();
  // Backend statuses differ from UI (e.g. IN_PROGRESS → QUOTATIONS_RECEIVED); filter client-side after map
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  query.set('limit', String(params?.limit || 100));
  const qs = query.toString();
  const data = await apiRequest<{ rfqs: Record<string, unknown>[] }>(
    `/rfqs${qs ? `?${qs}` : ''}`,
    { cacheTtlMs: 0 }
  );
  let rows = (data.rfqs || []).map(mapApiRfqToTableRow);
  if (params?.status && params.status !== 'ALL') {
    rows = rows.filter((r) => r.status === params.status);
  }
  if (params?.search?.trim()) {
    const q = params.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.rfqNumber.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }
  return rows;
}

async function mockGetById(id: string): Promise<RFQTableRow | null> {
  await new Promise((r) => setTimeout(r, 200));
  return RFQ_PAGE_MOCK.find((r) => r.id === id) || null;
}

async function apiGetById(id: string): Promise<RFQTableRow | null> {
  const rfq = await apiRequest<Record<string, unknown>>(`/rfqs/${id}`, { cacheTtlMs: 0 });
  return mapApiRfqToTableRow(rfq);
}

async function mockListTyped(): Promise<RFQ[]> {
  return MOCK_RFQS;
}

async function apiListTyped(): Promise<RFQ[]> {
  const rows = await apiList({ limit: 100 });
  return rows as unknown as RFQ[];
}

async function mockCreate(_payload: CreateRfqPayload): Promise<{ id: string }> {
  return { id: String(Date.now()) };
}

async function apiCreate(payload: CreateRfqPayload): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>('/rfqs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface SendRfqResult {
  emailFailures?: string[];
}

async function mockSend(_id: string): Promise<SendRfqResult> {
  await new Promise((r) => setTimeout(r, 200));
  return {};
}

async function apiSend(id: string): Promise<SendRfqResult> {
  const data = await apiRequest<Record<string, unknown>>(`/rfqs/${id}/send`, {
    method: 'POST',
    timeoutMs: 60000,
  });
  return {
    emailFailures: Array.isArray(data.emailFailures)
      ? (data.emailFailures as string[])
      : [],
  };
}

async function mockDelete(_id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}

async function apiUpdate(id: string, payload: Partial<CreateRfqPayload>): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/rfqs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function apiAddVendors(id: string, vendorIds: string[]): Promise<void> {
  await apiRequest(`/rfqs/${id}/vendors`, {
    method: 'POST',
    body: JSON.stringify({ vendorIds }),
  });
}

async function apiRemoveVendor(id: string, vendorId: string): Promise<void> {
  await apiRequest(`/rfqs/${id}/vendors/${vendorId}`, { method: 'DELETE' });
}

async function apiDelete(id: string, options?: { force?: boolean }): Promise<void> {
  const query = options?.force ? '?force=true' : '';
  await apiRequest(`/rfqs/${id}${query}`, { method: 'DELETE' });
}

// ─── RFQ Type System: Evaluation Parameters & Scores ───
async function apiUpdateParameters(id: string, evaluationParameters: Array<{
  id?: string;
  parameterName: string;
  parameterType?: string;
  weightage: number;
  active?: boolean;
  sortOrder?: number;
}>): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/rfqs/${id}/parameters`, {
    method: 'PUT',
    body: JSON.stringify({ evaluationParameters }),
  });
}

// Simple evaluation endpoint not implemented on backend — redirect to enterprise evaluation scores
async function apiGetEvaluation(rfqId: string): Promise<import('../types').RFQEvaluationData> {
  const scores = await apiGetEvaluationScores(rfqId);
  const raw = scores as Record<string, unknown>;
  const suppliers = (raw.suppliers as Array<Record<string, unknown>>) || [];
  return {
    rfq: raw.rfq as import('../types').RFQEvaluationData['rfq'],
    parameters: [],
    suppliers: suppliers.map((s: Record<string, unknown>) => {
      const catScores = (s.categoryScores as Array<Record<string, unknown>>) || [];
      return {
        vendorId: s.vendorId as string,
        vendorName: s.vendorName as string,
        vendorEmail: s.vendorEmail as string,
        scores: catScores.map((cs: Record<string, unknown>) => ({
          id: cs.categoryId as string,
          parameterId: cs.categoryId as string,
          parameterName: cs.categoryName as string,
          weightage: cs.weightage as number,
          score: cs.earned as number,
        })),
        calculatedScore: {
          totalScore: s.totalWeightedScore as number,
          normalizedScore: s.finalScore as number,
          breakdown: catScores.map((cs: Record<string, unknown>) => ({
            parameterId: cs.categoryId as string,
            weightedScore: cs.weightedScore as number,
          })),
        },
        isRecommended: s.isRecommended as boolean,
        rank: s.rank as number,
      };
    }),
    summary: raw.summary as import('../types').RFQEvaluationData['summary'] || { totalSuppliers: 0, recommendedVendor: null, averageScore: 0 },
  };
}

async function apiGetLatestSimpleParams(): Promise<Array<{ parameterName: string; weightage: number; sortOrder: number }> | null> {
  try {
    const data = await apiRequest<Array<{ parameterName: string; weightage: number; sortOrder: number }>>('/rfqs/latest-simple-params');
    return data;
  } catch {
    return null; // No previous Simple RFQ found
  }
}

// ─── Enterprise RFQ Evaluation API ───────────────────────────

export interface EvalCategoryDTO {
  name: string;
  weightage: number;
  enabled: boolean;
  expanded: boolean;
  sortOrder?: number;
  subParameters: Array<{
    name: string;
    source: 'predefined' | 'custom';
    enabled: boolean;
    required: boolean;
    weightage: number;
    maxScore: number;
    description?: string;
    sortOrder?: number;
  }>;
}

export interface EvalScoreDTO {
  categoryId: string;
  subParameterId: string;
  vendorId: string;
  score: number;
  remarks?: string;
}

async function apiGetEvaluationCategories(rfqId: string): Promise<EvalCategoryDTO[]> {
  return apiRequest<EvalCategoryDTO[]>(`/rfqs/${rfqId}/evaluation/categories`);
}

async function apiSaveEvaluationCategories(rfqId: string, categories: EvalCategoryDTO[]): Promise<EvalCategoryDTO[]> {
  return apiRequest<EvalCategoryDTO[]>(`/rfqs/${rfqId}/evaluation/categories`, {
    method: 'PUT',
    body: JSON.stringify({ categories }),
  });
}

async function apiGetEvaluationScores(rfqId: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/rfqs/${rfqId}/evaluation/scores`);
}

async function apiSaveWeightagePreferences(preferences: Record<string, { label: string; weightage: number }>): Promise<void> {
  // Backend expects preferences as a JSON string
  await apiRequest('/weightage', {
    method: 'PUT',
    body: JSON.stringify({ preferences: JSON.stringify(preferences) }),
  });
}

async function apiGetWeightagePreferences(): Promise<Record<string, { label: string; weightage: number }> | null> {
  try {
    const data = await apiRequest<{ preference: { preferences: string } }>('/weightage');
    // Backend returns { preference: { preferences: "{\"quality\":40,\"delivery\":30}" } }
    // We need to parse the preferences JSON string
    if (data?.preference?.preferences) {
      const parsed = JSON.parse(data.preference.preferences);
      // The preferences might be stored as simple { key: number } or { key: { label, weightage } }
      // Convert simple format to full format if needed
      if (typeof Object.values(parsed)[0] === 'number') {
        const converted: Record<string, { label: string; weightage: number }> = {};
        const labelMap: Record<string, string> = {
          price: 'Pricing',
          vendorRating: 'Quality',
          delivery: 'Delivery Time',
          compliance: 'Compliance',
        };
        for (const [key, val] of Object.entries(parsed)) {
          converted[key] = { label: labelMap[key] || key, weightage: val as number };
        }
        return converted;
      }
      return parsed as Record<string, { label: string; weightage: number }>;
    }
    return null;
  } catch {
    return null;
  }
}

export const rfqService = {
  list: USE_MOCK ? mockList : apiList,
  getById: USE_MOCK ? mockGetById : apiGetById,
  listTyped: USE_MOCK ? mockListTyped : apiListTyped,
  create: USE_MOCK ? mockCreate : apiCreate,
  update: USE_MOCK ? mockCreate : apiUpdate,
  send: USE_MOCK ? mockSend : apiSend,
  addVendors: apiAddVendors,
  removeVendor: apiRemoveVendor,
  delete: USE_MOCK ? mockDelete : apiDelete,
  updateParameters: apiUpdateParameters,
  getEvaluation: apiGetEvaluation,
  getLatestSimpleParams: apiGetLatestSimpleParams,
  saveWeightagePreferences: apiSaveWeightagePreferences,
  getWeightagePreferences: apiGetWeightagePreferences,
  // Enterprise Evaluation API (read-only — auto-scored by system)
  getEvaluationCategories: apiGetEvaluationCategories,
  saveEvaluationCategories: apiSaveEvaluationCategories,
  getEvaluationScores: apiGetEvaluationScores,
  mapFromTypes: mapRfqFromTypes,
};
