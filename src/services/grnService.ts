import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';

export interface GRNItemPayload {
  itemName: string;
  orderedQty: number;
  receivedQty: number;
  acceptedQty?: number;
  rejectedQty?: number;
  unitPrice?: number;
  unit?: string;
  remarks?: string;
}

export interface CreateGRNPayload {
  poId: string;
  entryMode?: 'AUTO_FILL' | 'MANUAL';
  dispatchNoteNumber?: string;
  vendorInvoiceNumber?: string;
  vendorId?: string;
  vendorName?: string;
  notes?: string;
  receivedDate?: string;
  items: GRNItemPayload[];
}

export interface GRNItem {
  id: string;
  grnId: string;
  itemName: string;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unitPrice?: number;
  unit?: string;
  remarks?: string;
}

export interface GoodsReceivedNote {
  id: string;
  grnNumber: string;
  poId: string;
  receivedById: string;
  receivedDate: string;
  entryMode?: 'AUTO_FILL' | 'MANUAL';
  dispatchNoteNumber?: string;
  vendorInvoiceNumber?: string;
  vendorId?: string;
  vendorName?: string;
  notes?: string;
  status: string;
  createdAt: string;
  items: GRNItem[];
  purchaseOrder?: {
    id: string;
    poNumber: string;
    totalAmount: number;
    status: string;
    vendor?: { id: string; name: string; email: string };
  };
}

const MOCK_GRNS: GoodsReceivedNote[] = [];

export const grnService = {
  async list(params?: { page?: number; limit?: number; poId?: string; vendorId?: string; search?: string }): Promise<{ grns: GoodsReceivedNote[]; total: number }> {
    if (USE_MOCK) {
      let list = [...MOCK_GRNS];
      if (params?.poId) {
        list = list.filter((g) => g.poId === params.poId || g.purchaseOrder?.poNumber === params.poId);
      }
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter((g) =>
          g.grnNumber.toLowerCase().includes(q) ||
          (g.dispatchNoteNumber && g.dispatchNoteNumber.toLowerCase().includes(q)) ||
          (g.vendorInvoiceNumber && g.vendorInvoiceNumber.toLowerCase().includes(q)) ||
          (g.vendorName && g.vendorName.toLowerCase().includes(q)) ||
          (g.purchaseOrder?.poNumber && g.purchaseOrder.poNumber.toLowerCase().includes(q))
        );
      }
      return { grns: list, total: list.length };
    }
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit || 50));
    if (params?.poId) query.set('poId', params.poId);
    if (params?.vendorId) query.set('vendorId', params.vendorId);
    if (params?.search) query.set('search', params.search);

    const data = await apiRequest<{ grns: GoodsReceivedNote[]; total: number }>(`/grn?${query.toString()}`);
    return data;
  },

  async create(payload: CreateGRNPayload): Promise<GoodsReceivedNote> {
    if (USE_MOCK) {
      const grnNumber = payload.dispatchNoteNumber || `GRN-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const newGRN: GoodsReceivedNote = {
        id: String(Date.now()),
        grnNumber,
        poId: payload.poId,
        entryMode: payload.entryMode || 'MANUAL',
        dispatchNoteNumber: payload.dispatchNoteNumber,
        vendorInvoiceNumber: payload.vendorInvoiceNumber,
        vendorId: payload.vendorId,
        vendorName: payload.vendorName,
        receivedById: 'user_1',
        receivedDate: payload.receivedDate || new Date().toISOString(),
        notes: payload.notes,
        status: 'POSTED', // Direct post without approval chain
        createdAt: new Date().toISOString(),
        items: payload.items.map((it, idx) => ({
          id: `item_${idx}_${Date.now()}`,
          grnId: `grn_${Date.now()}`,
          itemName: it.itemName,
          orderedQty: it.orderedQty,
          receivedQty: it.receivedQty,
          acceptedQty: it.acceptedQty ?? it.receivedQty,
          rejectedQty: it.rejectedQty || 0,
          unitPrice: it.unitPrice || 0,
          unit: it.unit,
          remarks: it.remarks,
        })),
        purchaseOrder: {
          id: payload.poId,
          poNumber: payload.poId,
          totalAmount: payload.items.reduce((acc, curr) => acc + (curr.receivedQty * (curr.unitPrice || 0)), 0),
          status: 'APPROVED',
          vendor: payload.vendorName ? { id: payload.vendorId || 'v1', name: payload.vendorName, email: 'vendor@supplier.com' } : undefined,
        },
      };
      MOCK_GRNS.unshift(newGRN);
      return newGRN;
    }

    const data = await apiRequest<{ data: GoodsReceivedNote }>('/grn', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.data;
  },

  async getById(id: string): Promise<GoodsReceivedNote> {
    if (USE_MOCK) {
      const found = MOCK_GRNS.find((g) => g.id === id || g.grnNumber === id);
      if (!found) throw new Error('GRN not found');
      return found;
    }
    const data = await apiRequest<{ data: GoodsReceivedNote }>(`/grn/${id}`);
    return data.data;
  },

  async getByPO(poId: string): Promise<GoodsReceivedNote[]> {
    if (USE_MOCK) {
      return MOCK_GRNS.filter((g) => g.poId === poId || g.purchaseOrder?.poNumber === poId);
    }
    try {
      const res = await apiRequest<any>(`/grn/by-po/${poId}`);
      let list: GoodsReceivedNote[] = [];
      if (Array.isArray(res)) list = res;
      else if (Array.isArray(res?.data)) list = res.data;
      else if (Array.isArray(res?.grns)) list = res.grns;

      if (list.length === 0) {
        const fallback = await this.list({ poId, limit: 100 });
        if (fallback.grns && fallback.grns.length > 0) {
          list = fallback.grns;
        }
      }
      return list;
    } catch {
      try {
        const fallback = await this.list({ poId, limit: 100 });
        return fallback.grns || [];
      } catch {
        return [];
      }
    }
  },
};
