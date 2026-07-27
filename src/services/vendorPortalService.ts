import { USE_MOCK } from '../config/mock';
import { apiRequest, API_BASE } from '../api/client';
import { authService } from './authService';
import { MOCK_RFQS, MOCK_QUOTATIONS } from '../api/mappers';
import { VENDOR_ORDERS_MOCK, VENDOR_INVOICES_MOCK, type VendorOrderMock, type VendorInvoiceMock } from '../mocks/vendorPortal.mock';
import type { RFQ } from '../types';

export interface VendorNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  metadata?: { rfqId?: string; rfqNumber?: string } | null;
  isRead: boolean;
  createdAt: string;
}

export interface SubmitQuotationPayload {
  totalPrice: number;
  leadTimeDays?: number;
  paymentTerms?: string;
  paymentPlanId?: string;
  currency?: string;
  items: Array<{
    rfqItemId: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  // Simple RFQ custom field values (fieldId → value)
  customFieldValues?: Record<string, string | number>;
  // Bid Security fields (vendor fills)
  bidSecurityValueType?: string;
  bidSecurityValue?: number;
  bidSecurityCurrency?: string;
  bidSecurityValidityValue?: number;
  bidSecurityValidityUnit?: string;
  // Bid Bond fields (vendor fills)
  bidBondNumber?: string;
  bidBondIssuer?: string;
  bidBondAmount?: number;
  bidBondCurrency?: string;
  bidBondIssueDate?: string;
  bidBondExpiryDate?: string;
}

export interface PaymentPlanMilestone {
  id: string;
  paymentPlanId: string;
  title: string;
  percentage: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentPlan {
  id: string;
  vendorId: string;
  name: string;
  milestones: PaymentPlanMilestone[];
  createdAt: string;
  updatedAt: string;
}

type VendorRequestOptions = RequestInit & {
  cacheTtlMs?: number;
  timeoutMs?: number;
};

async function vendorFetch<T>(path: string, options?: VendorRequestOptions): Promise<T> {
  return apiRequest<T>(`/vendors${path}`, options);
}

async function mockVendorRfqs(): Promise<RFQ[]> {
  return MOCK_RFQS.filter((r) => r.status === 'SENT' || r.status === 'IN_PROGRESS');
}

type VendorRfqApiRow = RFQ & {
  inviteStatus?: string;
  hasSubmittedQuotation?: boolean;
};

async function apiVendorRfqs(): Promise<VendorRfqApiRow[]> {
  const data = await vendorFetch<{ rfqs: VendorRfqApiRow[] }>('/rfqs', { cacheTtlMs: 0 });
  return data.rfqs || [];
}

async function mockVendorQuotations(): Promise<VendorQuotationRow[]> {
  return MOCK_QUOTATIONS.map((q) => ({
    id: q.id,
    rfqId: q.rfqId,
    totalPrice: q.totalPrice,
    leadTimeDays: q.leadTimeDays ?? null,
    paymentTerms: q.paymentTerms ?? null,
    score: q.score ?? null,
    status: q.status,
    submittedAt: q.submittedAt,
    rfq: {
      id: q.rfqId,
      rfqNumber: `RFQ-${q.rfqId}`,
      title: `RFQ ${q.rfqId}`,
      status: 'SENT',
    },
    items: (q.items || []).map((i) => ({
      id: i.id,
      rfqItemId: i.rfqItemId,
      itemName: `Item ${i.rfqItemId}`,
      quantity: 1,
      unit: 'Pcs',
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    })),
  }));
}

export interface VendorQuotationRow {
  id: string;
  rfqId: string;
  totalPrice: number;
  currency?: string;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  paymentPlanSnapshot?: Array<{ title: string; percentage: number }> | null;
  customFieldValues?: Record<string, string | number> | null;
  score: number | null;
  status: string;
  submittedAt: string;
  selectedItemIds?: string[] | null;
  rfq: { id: string; rfqNumber: string; title: string; status: string; closingDate?: string | null };
  items: Array<{
    id: string;
    rfqItemId: string;
    itemName: string;
    description?: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  attachments?: Array<{
    id: string;
    originalName: string;
    publicUrl: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
  }>;
}

async function apiVendorQuotations(): Promise<VendorQuotationRow[]> {
  const data = await vendorFetch<{ quotations: VendorQuotationRow[] }>('/quotations', { cacheTtlMs: 0 });
  return data.quotations || [];
}

async function mockNotifications(): Promise<{ notifications: VendorNotification[]; unreadCount: number }> {
  return { notifications: [], unreadCount: 0 };
}

async function apiNotifications(): Promise<{ notifications: VendorNotification[]; unreadCount: number }> {
  return vendorFetch<{ notifications: VendorNotification[]; unreadCount: number }>('/notifications?limit=50');
}

async function apiMarkNotificationRead(id: string): Promise<void> {
  await vendorFetch(`/notifications/${id}/read`, { method: 'PUT' });
}

async function apiMarkAllNotificationsRead(): Promise<void> {
  await vendorFetch('/notifications/read-all', { method: 'PUT' });
}

async function apiDeleteAllNotifications(): Promise<void> {
  await vendorFetch('/notifications', { method: 'DELETE' });
}  async function apiSubmitQuotation(rfqId: string, payload: SubmitQuotationPayload, attachments?: File[], bidBondDocument?: File): Promise<{ id: string } | void> {
  const token = authService.getToken();
  const TIMEOUT_MS = 120_000; // 2 minutes — file uploads + backend processing can be slow

  // Determine if we need FormData (attachments or bid bond document)
  const hasFiles = (attachments && attachments.length > 0) || !!bidBondDocument;

  if (hasFiles) {
    const formData = new FormData();
    formData.append('totalPrice', String(payload.totalPrice));
    if (payload.leadTimeDays) formData.append('leadTimeDays', String(payload.leadTimeDays));
    if (payload.paymentTerms) formData.append('paymentTerms', payload.paymentTerms);
    if (payload.paymentPlanId) formData.append('paymentPlanId', payload.paymentPlanId);
    if (payload.currency) formData.append('currency', payload.currency);
    formData.append('items', JSON.stringify(payload.items));
    if (payload.customFieldValues) {
      formData.append('customFieldValues', JSON.stringify(payload.customFieldValues));
    }
    // Bid Security fields
    if (payload.bidSecurityValueType) formData.append('bidSecurityValueType', payload.bidSecurityValueType);
    if (payload.bidSecurityValue) formData.append('bidSecurityValue', String(payload.bidSecurityValue));
    if (payload.bidSecurityCurrency) formData.append('bidSecurityCurrency', payload.bidSecurityCurrency);
    if (payload.bidSecurityValidityValue) formData.append('bidSecurityValidityValue', String(payload.bidSecurityValidityValue));
    if (payload.bidSecurityValidityUnit) formData.append('bidSecurityValidityUnit', payload.bidSecurityValidityUnit);
    // Bid Bond fields
    if (payload.bidBondNumber) formData.append('bidBondNumber', payload.bidBondNumber);
    if (payload.bidBondIssuer) formData.append('bidBondIssuer', payload.bidBondIssuer);
    if (payload.bidBondAmount) formData.append('bidBondAmount', String(payload.bidBondAmount));
    if (payload.bidBondCurrency) formData.append('bidBondCurrency', payload.bidBondCurrency);
    if (payload.bidBondIssueDate) formData.append('bidBondIssueDate', payload.bidBondIssueDate);
    if (payload.bidBondExpiryDate) formData.append('bidBondExpiryDate', payload.bidBondExpiryDate);
    if (attachments) {
      attachments.forEach(file => formData.append('attachments', file));
    }
    if (bidBondDocument) {
      formData.append('bidBondDocument', bidBondDocument);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/vendors/rfqs/${rfqId}/quotations`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string; message?: string }).error || (err as { message?: string }).message || 'Failed to submit quotation');
      }
      const json = await res.json();
      return json.data || json;
    } catch (fetchErr) {
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        throw new Error('Quotation submission timed out. The quotation may have been saved — please check your quotations list and refresh.');
      }
      throw fetchErr;
    } finally {
      clearTimeout(timer);
    }
  } else {
    return await vendorFetch<{ id: string }>(`/rfqs/${rfqId}/quotations`, {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: TIMEOUT_MS,
    });
  }
}

async function mockSubmitQuotation(): Promise<{ id: string } | void> {
  await new Promise((r) => setTimeout(r, 300));
}

async function mockResubmitQuotation(): Promise<{ id: string } | void> {
  await new Promise((r) => setTimeout(r, 300));
}

async function apiResubmitQuotation(rfqId: string, payload: SubmitQuotationPayload, bidBondDocument?: File): Promise<{ id: string } | void> {
  const token = authService.getToken();
  const TIMEOUT_MS = 120_000;

  if (bidBondDocument) {
    const formData = new FormData();
    formData.append('totalPrice', String(payload.totalPrice));
    if (payload.leadTimeDays) formData.append('leadTimeDays', String(payload.leadTimeDays));
    if (payload.paymentTerms) formData.append('paymentTerms', payload.paymentTerms);
    if (payload.paymentPlanId) formData.append('paymentPlanId', payload.paymentPlanId);
    if (payload.currency) formData.append('currency', payload.currency);
    formData.append('items', JSON.stringify(payload.items));
    if (payload.customFieldValues) {
      formData.append('customFieldValues', JSON.stringify(payload.customFieldValues));
    }
    // Bid Security fields
    if (payload.bidSecurityValueType) formData.append('bidSecurityValueType', payload.bidSecurityValueType);
    if (payload.bidSecurityValue) formData.append('bidSecurityValue', String(payload.bidSecurityValue));
    if (payload.bidSecurityCurrency) formData.append('bidSecurityCurrency', payload.bidSecurityCurrency);
    if (payload.bidSecurityValidityValue) formData.append('bidSecurityValidityValue', String(payload.bidSecurityValidityValue));
    if (payload.bidSecurityValidityUnit) formData.append('bidSecurityValidityUnit', payload.bidSecurityValidityUnit);
    // Bid Bond fields
    if (payload.bidBondNumber) formData.append('bidBondNumber', payload.bidBondNumber);
    if (payload.bidBondIssuer) formData.append('bidBondIssuer', payload.bidBondIssuer);
    if (payload.bidBondAmount) formData.append('bidBondAmount', String(payload.bidBondAmount));
    if (payload.bidBondCurrency) formData.append('bidBondCurrency', payload.bidBondCurrency);
    if (payload.bidBondIssueDate) formData.append('bidBondIssueDate', payload.bidBondIssueDate);
    if (payload.bidBondExpiryDate) formData.append('bidBondExpiryDate', payload.bidBondExpiryDate);
    formData.append('bidBondDocument', bidBondDocument);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/vendors/rfqs/${rfqId}/quotations`, {
        method: 'PUT',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string; message?: string }).error || (err as { message?: string }).message || 'Failed to resubmit quotation');
      }
      const json = await res.json();
      return json.data || json;
    } catch (fetchErr) {
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        throw new Error('Quotation resubmission timed out. Please check your quotations list and refresh.');
      }
      throw fetchErr;
    } finally {
      clearTimeout(timer);
    }
  } else {
    return await vendorFetch<{ id: string }>(`/rfqs/${rfqId}/quotations`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      timeoutMs: TIMEOUT_MS,
    });
  }
}

async function mockOrders(): Promise<VendorOrderMock[]> {
  return VENDOR_ORDERS_MOCK;
}

async function apiOrders(): Promise<VendorOrderMock[]> {
  try {
    const data = await vendorFetch<{ purchaseOrders?: VendorOrderMock[] }>('/erp-data');
    return data.purchaseOrders ?? [];
  } catch {
    return [];
  }
}

async function mockInvoices(): Promise<VendorInvoiceMock[]> {
  return VENDOR_INVOICES_MOCK;
}

async function apiInvoices(): Promise<VendorInvoiceMock[]> {
  try {
    const data = await vendorFetch<{ invoices?: VendorInvoiceMock[] }>('/erp-data');
    return (data.invoices as VendorInvoiceMock[]) ?? [];
  } catch {
    return [];
  }
}

// ─── Bid Security (Vendor-facing) ───────────────────────────

async function apiVendorGetBidSecurity(quotationId: string): Promise<import('../types').QuotationBidSecurity | null> {
  try {
    return await vendorFetch<import('../types').QuotationBidSecurity>(`/quotations/${quotationId}/bid-security`);
  } catch {
    return null;
  }
}

// ─── Quotation Evaluation ───────────────────────────────────

async function apiGetQuotationEvaluation(rfqId: string): Promise<{
  rfq: { id: string; rfqNumber: string; title: string; rfqType: string; status: string };
  quotation: { id: string; score: number | null; status: string } | null;
  evaluation: {
    finalScore: number;
    rank: number;
    isRecommended: boolean;
    totalWeightedScore: number;
    categoryScores: Array<{
      categoryName: string;
      weightage: number;
      earned: number;
      maxPossible: number;
      percentage: number;
      weightedScore: number;
      subParameterScores: Array<{ subParameterId: string; subParameterName: string; maxScore: number; score: number }>;
    }>;
  };
}> {
  // Use enterprise evaluation scores endpoint (simple eval endpoint doesn't exist on backend)
  const scores = await vendorFetch<Record<string, unknown>>(`/rfqs/${rfqId}/evaluation/scores`, { cacheTtlMs: 0 });
  const suppliers = (scores.suppliers as Array<Record<string, unknown>>) || [];
  const vendorEval = suppliers[0] as Record<string, unknown> | undefined;
  const categoryScores = ((vendorEval?.categoryScores as Array<Record<string, unknown>>) || []).map((cs: Record<string, unknown>) => ({
    categoryName: cs.categoryName as string,
    weightage: cs.weightage as number,
    earned: cs.earned as number,
    maxPossible: cs.maxPossible as number,
    percentage: cs.percentage as number,
    weightedScore: cs.weightedScore as number,
    subParameterScores: ((cs.subParameterScores as Array<Record<string, unknown>>) || []).map((sp: Record<string, unknown>) => ({
      subParameterId: sp.subParameterId as string,
      subParameterName: sp.subParameterName as string,
      maxScore: sp.maxScore as number,
      score: sp.score as number,
    })),
  }));

  return {
    rfq: scores.rfq as { id: string; rfqNumber: string; title: string; rfqType: string; status: string },
    quotation: null,
    evaluation: {
      finalScore: (vendorEval?.finalScore as number) || 0,
      rank: (vendorEval?.rank as number) || 0,
      isRecommended: (vendorEval?.isRecommended as boolean) || false,
      totalWeightedScore: (vendorEval?.totalWeightedScore as number) || 0,
      categoryScores,
    },
  };
}

// ─── Profile ────────────────────────────────────────────────

export interface VendorProfileData {
  company: {
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
    location: string | null;
    website: string | null;
    category: string | null;
    contactPerson: string | null;
    gstNumber: string | null;
    panNumber: string | null;
    status: string;
    isActive: boolean;
    createdAt: string;
  };
  banking: {
    bankName: string | null;
    bankBranch: string | null;
    bankAccountNumber: string | null;
    bankIfscCode: string | null;
  };
  documents: Array<{
    id: string;
    name: string;
    type: string;
    status: 'pending' | 'verified' | 'rejected';
    uploadedAt: string;
    verifiedAt: string | null;
    rejectionReason: string | null;
  }>;
  performance: {
    avgQuality: number;
    avgDelivery: number;
    avgPriceScore: number;
    overallScore: number;
    quotationWinRate: number;
    totalQuotations: number;
    totalOrders: number;
    deliveredOrders: number;
  };
  // Mandatory info field labels (from Company Settings)
  gstNumberLabel?: string;
  panNumberLabel?: string;
  // Custom field definitions (id + label + required) from Company Settings
  mandatoryCustomFields?: Array<{ id: string; label: string; required: boolean }>;
  // Vendor's stored custom field values
  customFieldValues?: Record<string, string>;
}

async function apiGetProfile(): Promise<VendorProfileData> {
  // cacheTtlMs=0 ensures every vendor profile fetch goes directly to the backend.
  // This prevents stale vendor data from showing in the document upload form
  // when switching between vendor accounts in the same browser.
  return vendorFetch<VendorProfileData>('/profile', { cacheTtlMs: 0 });
}

export interface UpdateBankingPayload {
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
}

async function apiUpdateBanking(payload: UpdateBankingPayload): Promise<void> {
  await vendorFetch('/profile/banking', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function apiUploadDocument(file: File, documentType: string): Promise<VendorProfileData['documents'][0]> {
  const formData = new FormData();
  formData.append('document', file);
  formData.append('documentType', documentType);

  const token = authService.getToken();
  const res = await fetch(`${API_BASE}/vendors/profile/documents`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string; message?: string }).error
        || (err as { message?: string }).message
        || 'Upload failed'
    );
  }
  const json = await res.json();
  return json.data;
}

// ─── Widget Preferences ────────────────────────────────────

export interface VendorWidgetPref {
  widgetId: string;
  isActive: boolean;
  sortOrder?: number;
}

async function apiGetWidgetPreferences(): Promise<VendorWidgetPref[]> {
  const data = await vendorFetch<{ widgets: VendorWidgetPref[] }>('/widgets', { cacheTtlMs: 0 });
  return data.widgets || [];
}

async function apiSaveWidgetPreferences(widgets: { widgetId: string; isActive: boolean }[]): Promise<void> {
  await vendorFetch('/widgets', {
    method: 'PUT',
    body: JSON.stringify({ widgets }),
  });
}

// ─── Vendor Agreements (Signed NDA/MNDA) ────────────────────────────────

export interface VendorAgreement {
  id: string;
  documentType: string;
  selectedDocType: string;
  companyCode: string;
  companyName: string;
  contentSnapshot: string;
  status: string;
  signedAt: string;
  signatures: Array<{
    id: string;
    signerName: string;
    signerType: string;
    signatureUrl: string;
    signedAt: string;
  }>;
  createdAt: string;
}

async function apiListAgreements(): Promise<VendorAgreement[]> {
  const data = await vendorFetch<{ agreements: VendorAgreement[]; total: number }>('/agreements', { cacheTtlMs: 0 });
  return data.agreements || [];
}

// ─── Payment Plan API ────────────────────────────────────────────────────

async function apiListPaymentPlans(): Promise<PaymentPlan[]> {
  const data = await vendorFetch<{ paymentPlans: PaymentPlan[] }>('/payment-plans', { cacheTtlMs: 0 });
  return data.paymentPlans || [];
}

async function apiCreatePaymentPlan(name: string, milestones: Array<{ title: string; percentage: number }>): Promise<PaymentPlan> {
  return vendorFetch<PaymentPlan>('/payment-plans', {
    method: 'POST',
    body: JSON.stringify({ name, milestones }),
  });
}

async function apiUpdatePaymentPlan(planId: string, data: { name?: string; milestones?: Array<{ title: string; percentage: number }> }): Promise<PaymentPlan> {
  return vendorFetch<PaymentPlan>(`/payment-plans/${planId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function apiDeletePaymentPlan(planId: string): Promise<void> {
  await vendorFetch(`/payment-plans/${planId}`, { method: 'DELETE' });
}

export const vendorPortalService = {
  listRfqs: USE_MOCK ? mockVendorRfqs : apiVendorRfqs,
  listQuotations: USE_MOCK ? mockVendorQuotations : apiVendorQuotations,
  listOrders: USE_MOCK ? mockOrders : apiOrders,
  listInvoices: USE_MOCK ? mockInvoices : apiInvoices,
  listNotifications: USE_MOCK ? mockNotifications : apiNotifications,
  markNotificationRead: USE_MOCK ? async () => {} : apiMarkNotificationRead,
  markAllNotificationsRead: USE_MOCK ? async () => {} : apiMarkAllNotificationsRead,
  deleteAllNotifications: USE_MOCK ? async () => {} : apiDeleteAllNotifications,
  submitQuotation: USE_MOCK ? mockSubmitQuotation : apiSubmitQuotation,
  resubmitQuotation: USE_MOCK ? mockResubmitQuotation : apiResubmitQuotation,
  getBidSecurity: apiVendorGetBidSecurity,
  getQuotationEvaluation: apiGetQuotationEvaluation,
  getProfile: apiGetProfile,
  updateBanking: apiUpdateBanking,
  uploadDocument: apiUploadDocument,
  getWidgetPreferences: apiGetWidgetPreferences,
  saveWidgetPreferences: apiSaveWidgetPreferences,
  // Payment plans
  listPaymentPlans: apiListPaymentPlans,
  createPaymentPlan: apiCreatePaymentPlan,
  updatePaymentPlan: apiUpdatePaymentPlan,
  deletePaymentPlan: apiDeletePaymentPlan,
  // Agreements
  listAgreements: apiListAgreements,
};
