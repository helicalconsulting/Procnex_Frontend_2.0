import { apiRequest } from '../api/client';
import { USE_MOCK } from '../config/mock';

export interface DispatchNoteItem {
  id?: string;
  itemCode?: string;
  itemName: string;
  description?: string;
  poQty: number;
  dispatchedQty: number;
  unitPrice?: number;
  unit?: string;
  remarks?: string;
}

export interface DispatchNote {
  id: string;
  dispatchNoteNumber: string;
  poId: string;
  poNumber?: string;
  vendorId?: string;
  vendorName?: string;
  dispatchDate: string;
  expectedDeliveryDate?: string;
  transportMode?: string;
  transporterName?: string;
  carrierName?: string;
  vehicleNumber?: string;
  trackingNumber?: string;
  driverName?: string;
  driverPhone?: string;
  shippingAddress?: string;
  dispatchFromAddress?: string;
  totalPackages?: number;
  totalWeight?: string;
  notes?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
  items: DispatchNoteItem[];
  attachments?: any[];
  createdAt: string;
  updatedAt?: string;
  purchaseOrder?: {
    id: string;
    poNumber: string;
    totalAmount: number;
    status: string;
  };
}

export interface CreateDispatchNotePayload {
  dispatchNoteNumber?: string;
  poId: string;
  vendorId?: string;
  dispatchDate: string;
  expectedDeliveryDate?: string;
  transportMode?: string;
  transporterName?: string;
  carrierName?: string;
  vehicleNumber?: string;
  trackingNumber?: string;
  driverName?: string;
  driverPhone?: string;
  shippingAddress?: string;
  dispatchFromAddress?: string;
  totalPackages?: number;
  totalWeight?: string;
  notes?: string;
  items: DispatchNoteItem[];
  attachments?: any[];
  isDraft?: boolean;
}

const MOCK_DISPATCH_NOTES: DispatchNote[] = [];

export const dispatchNoteService = {
  async list(params?: {
    page?: number;
    limit?: number;
    poId?: string;
    vendorId?: string;
    search?: string;
  }): Promise<{ dispatchNotes: DispatchNote[]; total: number }> {
    if (USE_MOCK) {
      let list = [...MOCK_DISPATCH_NOTES];
      if (params?.poId) {
        list = list.filter((dn) => dn.poId === params.poId || dn.poNumber === params.poId);
      }
      if (params?.vendorId) {
        list = list.filter((dn) => dn.vendorId === params.vendorId);
      }
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (dn) =>
            dn.dispatchNoteNumber.toLowerCase().includes(q) ||
            (dn.poNumber && dn.poNumber.toLowerCase().includes(q)) ||
            (dn.vendorName && dn.vendorName.toLowerCase().includes(q))
        );
      }
      return { dispatchNotes: list, total: list.length };
    }

    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.poId) query.append('poId', params.poId);
    if (params?.vendorId) query.append('vendorId', params.vendorId);
    if (params?.search) query.append('search', params.search);

    const qs = query.toString();
    const endpoint = `/dispatch-notes${qs ? `?${qs}` : ''}`;

    try {
      const res = await apiRequest<{ dispatchNotes: DispatchNote[]; total: number }>(endpoint);
      return res || { dispatchNotes: [], total: 0 };
    } catch {
      return { dispatchNotes: [], total: 0 };
    }
  },

  async getById(id: string): Promise<DispatchNote | null> {
    if (USE_MOCK) {
      return MOCK_DISPATCH_NOTES.find((dn) => dn.id === id) || null;
    }
    try {
      const res = await apiRequest<DispatchNote>(`/dispatch-notes/${id}`);
      return res || null;
    } catch {
      return null;
    }
  },

  async create(payload: CreateDispatchNotePayload): Promise<DispatchNote> {
    if (USE_MOCK) {
      const newDn: DispatchNote = {
        id: `dn_${Date.now()}`,
        dispatchNoteNumber: payload.dispatchNoteNumber || `DN-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        poId: payload.poId,
        vendorId: payload.vendorId,
        dispatchDate: payload.dispatchDate,
        expectedDeliveryDate: payload.expectedDeliveryDate,
        transportMode: payload.transportMode,
        transporterName: payload.transporterName || payload.carrierName,
        carrierName: payload.carrierName || payload.transporterName,
        vehicleNumber: payload.vehicleNumber,
        trackingNumber: payload.trackingNumber,
        driverName: payload.driverName,
        driverPhone: payload.driverPhone,
        shippingAddress: payload.shippingAddress,
        dispatchFromAddress: payload.dispatchFromAddress,
        totalPackages: payload.totalPackages,
        totalWeight: payload.totalWeight,
        notes: payload.notes,
        status: payload.isDraft ? 'DRAFT' : 'SUBMITTED',
        items: payload.items,
        attachments: payload.attachments,
        createdAt: new Date().toISOString(),
      };
      MOCK_DISPATCH_NOTES.unshift(newDn);
      return newDn;
    }

    return apiRequest<DispatchNote>('/dispatch-notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
