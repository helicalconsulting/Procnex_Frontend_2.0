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

export const purchaseOrderService = {
  list: USE_MOCK ? mockList : apiList,
  async create(rfqId: string, notes?: string): Promise<{ poNumber: string; id: string }> {
    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 400));
      return { id: String(Date.now()), poNumber: `PO-${Date.now()}` };
    }
    const data = await apiRequest<{ data: { poNumber: string; id: string } }>('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({ rfqId, notes }),
    });
    return data.data;
  },
};
