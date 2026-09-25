import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { toNumber } from '../api/normalize';
import { MOCK_PURCHASE_ORDERS } from '../api/mappers';
import type { PurchaseOrder } from '../types';

function normalizePO(po: any): any {
  const totalAmount = toNumber(po.totalAmount);
  const rfqItems = po.rfq?.items || [];
  const quoteItems = po.rfq?.selectedQuotation?.items || [];
  const rawItems = (po.items && po.items.length > 0) ? po.items : rfqItems;

  const items = rawItems.map((item: any, idx: number) => {
    const quoteItem = quoteItems.find((q: any) => q.rfqItemId === item.id) || quoteItems[idx];
    const qty = Math.max(1, Number(item.quantity || item.orderedQty || 1));
    let price = Number(item.unitPrice || quoteItem?.unitPrice || 0);
    if (!price && totalAmount > 0) {
      price = Number((totalAmount / (rawItems.length || 1) / qty).toFixed(2));
    }
    const name = item.itemName || item.name || item.description || po.rfq?.title || `PO Line Item ${idx + 1}`;
    return {
      id: item.id || `po_item_${idx}`,
      itemCode: item.itemCode || `ITM-${String(idx + 1).padStart(3, '0')}`,
      itemName: name,
      description: item.description || '',
      quantity: qty,
      unitPrice: price,
      totalPrice: Number(quoteItem?.totalPrice || (price * qty).toFixed(2)),
    };
  });

  return {
    ...po,
    totalAmount,
    items: items.length > 0 ? items : po.items || [],
  };
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
  const userStr = localStorage.getItem('heliflow_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const rolesStr = localStorage.getItem('heliflow_roles');
  const roles: string[] = rolesStr ? JSON.parse(rolesStr) : (user?.roles || []);
  const isVendorAccount = roles.some((r: string) => typeof r === 'string' && r.toLowerCase().includes('vendor')) || !!localStorage.getItem('heliflow_vendor_token') || !!localStorage.getItem('heliflow_vendor');

  if (isVendorAccount) {
    try {
      const { vendorPortalService } = await import('./vendorPortalService');
      const vOrders = await vendorPortalService.listOrders();
      const orders: any[] = vOrders.map((vo) => ({
        id: vo.id,
        poNumber: vo.poNumber,
        totalAmount: Number(vo.totalAmount || vo.grandTotal || 0),
        status: vo.status || 'CONFIRMED',
        createdAt: vo.orderDate || new Date().toISOString(),
        vendor: {
          id: 'vendor_me',
          name: vo.vendorName || user?.fullName || 'Vendor',
          email: vo.vendorEmail || user?.email || '',
        },
        items: (vo.items || []).map((it: any) => ({
          itemName: it.name || it.itemName || 'Line Item',
          quantity: Number(it.quantity || 1),
          unit: it.unit || 'Pcs',
          unitPrice: Number(it.unitPrice || 0),
          totalPrice: Number(it.total || (it.unitPrice || 0) * (it.quantity || 1)),
        })),
      }));
      return { orders, total: orders.length };
    } catch {
      // Fallback to standard endpoint
    }
  }

  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit || 50));
  const qs = query.toString();
  const data = await apiRequest<{ purchaseOrders?: PurchaseOrder[]; pos?: PurchaseOrder[]; orders?: PurchaseOrder[]; total: number }>(
    `/purchase-orders${qs ? `?${qs}` : ''}`
  );
  const rawList = data.purchaseOrders || data.pos || data.orders || [];
  const orders = rawList.map(normalizePO);
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
  async updateStatus(id: number | string, status: string, comments?: string): Promise<void> {
    if (USE_MOCK) {
      await new Promise(r => setTimeout(r, 200));
      const found = MOCK_PURCHASE_ORDERS.find(p => String(p.id) === String(id) || p.poNumber === String(id));
      if (found) found.status = status;
      return;
    }
    await apiRequest(`/purchase-orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, comments }),
    });
  },
};
