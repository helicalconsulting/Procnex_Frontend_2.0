import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { toNumber } from '../api/normalize';
import { MOCK_PURCHASE_ORDERS } from '../api/mappers';
import type { PurchaseOrder } from '../types';

function normalizePO(po: PurchaseOrder): PurchaseOrder {
  return { ...po, totalAmount: toNumber(po.totalAmount) };
}

interface ListResult {
  orders: PurchaseOrder[];
  total: number;
}

async function mockList(): Promise<ListResult> {
  await new Promise((r) => setTimeout(r, 300));
  return { orders: MOCK_PURCHASE_ORDERS, total: MOCK_PURCHASE_ORDERS.length };
}

async function apiList(params?: { page?: number; limit?: number }): Promise<ListResult> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit || 50));
  const qs = query.toString();
  const data = await apiRequest<{ purchaseOrders?: PurchaseOrder[]; pos?: PurchaseOrder[]; total: number }>(
    `/purchase-orders${qs ? `?${qs}` : ''}`
  );
  const orders = (data.purchaseOrders || data.pos || []).map(normalizePO);
  return {
    orders,
    total: data.total || orders.length,
  };
}

export interface StandalonePOPayload {
  vendorId: string;
  totalAmount: number;
  notes?: string;
  paymentTerms?: string;
  deliveryDate?: string;
  status?: string;
  items?: Array<{
    itemCode?: string;
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    taxPercent?: number;
    totalPrice: number;
  }>;
  sourceReferences?: Record<string, string>;
}

async function createStandalonePO(payload: StandalonePOPayload): Promise<{ poNumber: string; id: string }> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newPO: any = {
      id: String(Date.now()),
      poNumber,
      vendorId: payload.vendorId,
      totalAmount: payload.totalAmount,
      status: payload.status || 'PENDING_APPROVAL',
      createdAt: new Date().toISOString(),
      vendor: { id: payload.vendorId, name: 'Selected Vendor', email: 'vendor@example.com' },
      items: payload.items || [],
    };
    MOCK_PURCHASE_ORDERS.unshift(newPO);
    return { id: newPO.id, poNumber };
  }
  const data = await apiRequest<{ poNumber: string; id: string }>('/purchase-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data;
}

export const purchaseOrderService = {
  list: USE_MOCK ? mockList : apiList,
  async create(rfqId: string, notes?: string, startLevelNumber?: number): Promise<{ poNumber: string; id: string }> {
    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 400));
      return { id: String(Date.now()), poNumber: `PO-${Date.now()}` };
    }
    const data = await apiRequest<{ poNumber: string; id: string }>('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({ rfqId, notes, startLevelNumber }),
    });
    return data;
  },
  createStandalonePO,
  async delete(id: number | string): Promise<void> {
    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      const idx = MOCK_PURCHASE_ORDERS.findIndex(p => String(p.id) === String(id));
      if (idx !== -1) MOCK_PURCHASE_ORDERS.splice(idx, 1);
      return;
    }
    await apiRequest(`/purchase-orders/${id}`, { method: 'DELETE' });
  },
};
