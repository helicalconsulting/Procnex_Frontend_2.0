import { apiRequest } from '../api/client';
import { pickList, toNumber } from '../api/normalize';
import type { Quotation, QuotationBidSecurity } from '../types';
import { isRfqDeleted } from './rfqService';

export interface QuotationStats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

function normalizeQuotation(q: Quotation): Quotation {
  return { ...q, totalPrice: toNumber(q.totalPrice) };
}

async function list(includeAll = true): Promise<Quotation[]> {
  const params = includeAll ? '?limit=100&includeAll=true' : '?limit=100';
  const data = await apiRequest<{ quotations: Quotation[] }>(`/quotations${params}`, { cacheTtlMs: 0 });
  const items = pickList<Quotation>(data, ['quotations']).map(normalizeQuotation);
  return items.filter((q) => {
    const rfqNum = (q as Quotation & { rfq?: { rfqNumber?: string }; rfqNumber?: string }).rfq?.rfqNumber || (q as any).rfqNumber;
    return !isRfqDeleted(q.rfqId, rfqNum);
  });
}

async function listAll(): Promise<Quotation[]> {
  return list(true);
}

async function getById(id: number | string): Promise<Quotation | null> {
  const q = await apiRequest<Quotation>(`/quotations/${id}`);
  return q ? normalizeQuotation(q) : null;
}

async function updateStatus(
  id: number | string,
  status: string,
  comment?: string,
  startLevelNumber?: number,
  returnTarget?: 'LEVEL_1' | 'VENDOR'
): Promise<{ nextLevel?: boolean; message?: string }> {
  return apiRequest<{ nextLevel?: boolean; message?: string }>(`/quotations/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, comments: comment, startLevelNumber, returnTarget }),
  });
}

async function getStats(): Promise<QuotationStats> {
  return apiRequest<QuotationStats>('/quotations/stats');
}

async function updateSelectedItems(id: string, selectedItemIds: string[]): Promise<{ selectedItemIds: string[] }> {
  return apiRequest<{ selectedItemIds: string[] }>(`/quotations/${id}/items/selection`, {
    method: 'PUT',
    body: JSON.stringify({ selectedItemIds }),
  });
}

// ─── Bid Security ────────────────────────────────────────────────

async function getBidSecurity(quotationId: string): Promise<QuotationBidSecurity | null> {
  try {
    return await apiRequest<QuotationBidSecurity>(`/quotations/${quotationId}/bid-security`);
  } catch {
    return null;
  }
}

async function uploadBidSecurity(quotationId: string, file: File): Promise<QuotationBidSecurity> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<QuotationBidSecurity>(`/quotations/${quotationId}/bid-security/upload`, {
    method: 'POST',
    body: formData,
    timeoutMs: 60000,
  });
}

async function verifyBidSecurity(quotationId: string): Promise<QuotationBidSecurity> {
  return apiRequest<QuotationBidSecurity>(`/quotations/${quotationId}/bid-security/verify`, {
    method: 'PUT',
  });
}

async function rejectBidSecurity(quotationId: string, reason: string): Promise<QuotationBidSecurity> {
  return apiRequest<QuotationBidSecurity>(`/quotations/${quotationId}/bid-security/reject`, {
    method: 'PUT',
    body: JSON.stringify({ reason }),
  });
}

async function sendToApproval(id: string, startLevelNumber?: number): Promise<void> {
  return apiRequest<void>(`/quotations/${id}/send-to-approval`, {
    method: 'POST',
    body: JSON.stringify({ startLevelNumber }),
  });
}

export const quotationService = {
  getBidSecurity,
  uploadBidSecurity,
  verifyBidSecurity,
  rejectBidSecurity,
  list,
  listAll,
  getById,
  updateStatus,
  sendToApproval,
  getStats,
  updateSelectedItems,
};
