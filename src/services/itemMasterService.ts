import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';

export type ItemType = 'Fixed asset' | 'Non-stock / consumable' | 'Service' | 'Stock / Raw Material' | string;
export type ItemStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL' | 'ARCHIVED';

export interface ItemMaster {
  id: string;
  companyCode: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  itemType: ItemType;
  productClass?: string | null;
  categoryHierarchy?: string | null;
  uom: string;
  taxRate: number;
  taxTreatment: string;
  isTaxExempt: boolean;
  availableForPr: boolean;
  availableForRfq: boolean;
  preferredSupplierId?: string | null;
  preferredSupplierName?: string | null;
  standardPrice: number;
  currency: string;
  status: ItemStatus;
  brand?: string | null;
  partNumber?: string | null;
  hsnSacCode?: string | null;
  currentStock: number;
  minStock?: number | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemMasterStats {
  totalItems: number;
  active: number;
  pendingApproval: number;
  availableForPr: number;
  availableForRfq: number;
  taxExempt: number;
}

export interface ItemMasterFilterParams {
  search?: string;
  itemType?: string;
  productClass?: string;
  status?: string;
  taxTreatment?: string;
  availableForPr?: boolean | string;
  availableForRfq?: boolean | string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateItemMasterPayload {
  itemCode?: string;
  itemName: string;
  description?: string;
  itemType?: ItemType;
  productClass?: string;
  categoryHierarchy?: string;
  uom?: string;
  taxRate?: number;
  taxTreatment?: string;
  isTaxExempt?: boolean;
  availableForPr?: boolean;
  availableForRfq?: boolean;
  preferredSupplierId?: string;
  preferredSupplierName?: string;
  standardPrice?: number;
  currency?: string;
  status?: ItemStatus;
  brand?: string;
  partNumber?: string;
  hsnSacCode?: string;
  currentStock?: number;
  minStock?: number;
  warehouseId?: string;
  warehouseName?: string;
}

export interface UpdateItemMasterPayload extends Partial<CreateItemMasterPayload> {}

export interface ItemMasterListResponse {
  items: ItemMaster[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Fallback mock items matching screenshot
const FALLBACK_ITEMS: ItemMaster[] = [
  {
    id: 'mock-1',
    companyCode: 'DEFAULT',
    itemCode: 'AST-00042',
    itemName: 'Dell Latitude 5540 15" i7 32GB',
    description: 'Standard developer workstation laptop bundle with docking kit',
    itemType: 'Fixed asset',
    productClass: 'Laptops',
    categoryHierarchy: 'Hardware > Laptops',
    uom: 'EA',
    taxRate: 5.0,
    taxTreatment: 'Taxable 5%',
    isTaxExempt: false,
    availableForPr: true,
    availableForRfq: true,
    preferredSupplierName: 'Dell Direct MEA',
    standardPrice: 4200.0,
    currency: 'AED',
    status: 'ACTIVE',
    currentStock: 18,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-2',
    companyCode: 'DEFAULT',
    itemCode: 'AST-00043',
    itemName: 'Apple MacBook Pro 16" M3 Max 64GB',
    description: 'Executive design & high-performance engineering system',
    itemType: 'Fixed asset',
    productClass: 'Laptops',
    categoryHierarchy: 'Hardware > Laptops',
    uom: 'EA',
    taxRate: 5.0,
    taxTreatment: 'Taxable 5%',
    isTaxExempt: false,
    availableForPr: true,
    availableForRfq: true,
    preferredSupplierName: 'Apple Authorized Enterprise',
    standardPrice: 12500.0,
    currency: 'AED',
    status: 'ACTIVE',
    currentStock: 6,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-3',
    companyCode: 'DEFAULT',
    itemCode: 'NSK-00108',
    itemName: 'Ergonomic Mesh Task Chair (Black)',
    description: 'High-back lumbar support office chair for workstation pods',
    itemType: 'Non-stock / consumable',
    productClass: 'Office furniture',
    categoryHierarchy: 'Facilities > Furniture',
    uom: 'EA',
    taxRate: 16.0,
    taxTreatment: 'Taxable 16%',
    isTaxExempt: false,
    availableForPr: true,
    availableForRfq: false,
    preferredSupplierName: 'Steelcase Regional Supply',
    standardPrice: 38500.0,
    currency: 'KES',
    status: 'ACTIVE',
    currentStock: 42,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-4',
    companyCode: 'DEFAULT',
    itemCode: 'SRV-00015',
    itemName: 'Cloud Infrastructure Advisory (Monthly Retainer)',
    description: 'Tier-3 architectural support and DevOps automation services',
    itemType: 'Service',
    productClass: 'Professional services',
    categoryHierarchy: 'IT > Consulting',
    uom: 'MONTH',
    taxRate: 0.0,
    taxTreatment: 'Exempt',
    isTaxExempt: true,
    availableForPr: true,
    availableForRfq: true,
    preferredSupplierName: 'Helical Cloud Solutions LLC',
    standardPrice: 180000.0,
    currency: 'INR',
    status: 'ACTIVE',
    currentStock: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-5',
    companyCode: 'DEFAULT',
    itemCode: 'NSK-00119',
    itemName: 'Multipurpose Copy Paper A4 80GSM (Box of 5 Reams)',
    description: 'Standard office printing supplies for central mailroom',
    itemType: 'Non-stock / consumable',
    productClass: 'Stationery',
    categoryHierarchy: 'Office Supplies > Paper',
    uom: 'BOX',
    taxRate: 5.0,
    taxTreatment: 'Taxable 5%',
    isTaxExempt: false,
    availableForPr: true,
    availableForRfq: false,
    preferredSupplierName: 'Al Furqan Stationery Trading',
    standardPrice: 115.0,
    currency: 'AED',
    status: 'PENDING_APPROVAL',
    currentStock: 250,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-6',
    companyCode: 'DEFAULT',
    itemCode: 'SRV-00021',
    itemName: 'Annual HVAC Plant Preventive Maintenance',
    description: 'Quarterly overhaul, refrigerant top-up and filter replacement for HQ towers',
    itemType: 'Service',
    productClass: 'Facilities maintenance',
    categoryHierarchy: 'Facilities > Maintenance',
    uom: 'YEAR',
    taxRate: 5.0,
    taxTreatment: 'Taxable 5%',
    isTaxExempt: false,
    availableForPr: true,
    availableForRfq: true,
    preferredSupplierName: 'Emirates Facilities Management',
    standardPrice: 65000.0,
    currency: 'AED',
    status: 'ACTIVE',
    currentStock: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const itemMasterService = {
  async list(params?: ItemMasterFilterParams): Promise<ItemMasterListResponse> {
    if (USE_MOCK) {
      let filtered = [...FALLBACK_ITEMS];
      if (params?.search) {
        const q = params.search.toLowerCase();
        filtered = filtered.filter(
          (it) =>
            it.itemCode.toLowerCase().includes(q) ||
            it.itemName.toLowerCase().includes(q) ||
            (it.description && it.description.toLowerCase().includes(q)) ||
            (it.brand && it.brand.toLowerCase().includes(q)) ||
            (it.partNumber && it.partNumber.toLowerCase().includes(q)) ||
            (it.hsnSacCode && it.hsnSacCode.toLowerCase().includes(q)) ||
            (it.preferredSupplierName && it.preferredSupplierName.toLowerCase().includes(q))
        );
      }
      if (params?.itemType && params.itemType !== 'ALL') {
        filtered = filtered.filter((it) => it.itemType === params.itemType);
      }
      if (params?.productClass && params.productClass !== 'ALL') {
        filtered = filtered.filter((it) => it.productClass === params.productClass);
      }
      if (params?.status && params.status !== 'ALL') {
        filtered = filtered.filter((it) => it.status === params.status);
      }
      if (params?.taxTreatment && params.taxTreatment !== 'ALL') {
        filtered = filtered.filter((it) => it.taxTreatment === params.taxTreatment);
      }
      if (params?.availableForPr !== undefined && params.availableForPr !== 'ALL') {
        const bool = params.availableForPr === true || params.availableForPr === 'true';
        filtered = filtered.filter((it) => it.availableForPr === bool);
      }
      if (params?.availableForRfq !== undefined && params.availableForRfq !== 'ALL') {
        const bool = params.availableForRfq === true || params.availableForRfq === 'true';
        filtered = filtered.filter((it) => it.availableForRfq === bool);
      }

      return {
        items: filtered,
        total: filtered.length,
        page: params?.page || 1,
        limit: params?.limit || 50,
        totalPages: 1,
      };
    }

    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.itemType && params.itemType !== 'ALL') query.set('itemType', params.itemType);
    if (params?.productClass && params.productClass !== 'ALL') query.set('productClass', params.productClass);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.taxTreatment && params.taxTreatment !== 'ALL') query.set('taxTreatment', params.taxTreatment);
    if (params?.availableForPr !== undefined && params.availableForPr !== 'ALL') {
      query.set('availableForPr', String(params.availableForPr));
    }
    if (params?.availableForRfq !== undefined && params.availableForRfq !== 'ALL') {
      query.set('availableForRfq', String(params.availableForRfq));
    }
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

    const queryString = query.toString();
    const endpoint = `/inventory-master${queryString ? `?${queryString}` : ''}`;
    return await apiRequest<ItemMasterListResponse>(endpoint, { cacheTtlMs: 0 });
  },

  async getStats(): Promise<ItemMasterStats> {
    if (USE_MOCK) {
      return {
        totalItems: FALLBACK_ITEMS.length,
        active: FALLBACK_ITEMS.filter((i) => i.status === 'ACTIVE').length,
        pendingApproval: FALLBACK_ITEMS.filter((i) => i.status === 'PENDING_APPROVAL').length,
        availableForPr: FALLBACK_ITEMS.filter((i) => i.availableForPr).length,
        availableForRfq: FALLBACK_ITEMS.filter((i) => i.availableForRfq).length,
        taxExempt: FALLBACK_ITEMS.filter((i) => i.isTaxExempt || i.taxTreatment?.toLowerCase().includes('exempt')).length,
      };
    }
    return await apiRequest<ItemMasterStats>('/inventory-master/stats', { cacheTtlMs: 0 });
  },

  async getById(id: string): Promise<ItemMaster> {
    if (USE_MOCK) {
      const it = FALLBACK_ITEMS.find((i) => i.id === id);
      if (!it) throw new Error('Item not found');
      return it;
    }
    return await apiRequest<ItemMaster>(`/inventory-master/${id}`, { cacheTtlMs: 0 });
  },

  async create(payload: CreateItemMasterPayload): Promise<ItemMaster> {
    // Logic: If availableForPr is true, force availableForRfq to true
    if (payload.availableForPr) {
      payload.availableForRfq = true;
    }
    
    if (USE_MOCK) {
      const newItem: ItemMaster = {
        id: `mock-${Date.now()}`,
        companyCode: 'DEFAULT',
        itemCode: payload.itemCode || `ITM-${Math.floor(10000 + Math.random() * 90000)}`,
        itemName: payload.itemName,
        description: payload.description,
        itemType: payload.itemType || 'Non-stock / consumable',
        productClass: payload.productClass,
        categoryHierarchy: payload.categoryHierarchy,
        uom: payload.uom || 'EA',
        taxRate: payload.taxRate ?? 5.0,
        taxTreatment: payload.taxTreatment || (Number(payload.taxRate) === 0 ? 'Exempt' : `Taxable ${payload.taxRate ?? 5}%`),
        isTaxExempt: Boolean(payload.isTaxExempt || Number(payload.taxRate) === 0),
        availableForPr: payload.availableForPr ?? true,
        availableForRfq: payload.availableForRfq ?? true,
        preferredSupplierName: payload.preferredSupplierName,
        standardPrice: payload.standardPrice ?? 0,
        currency: payload.currency || (typeof window !== 'undefined' ? localStorage.getItem('company_default_currency') || 'KES' : 'KES'),
        status: payload.status || 'ACTIVE',
        brand: payload.brand,
        partNumber: payload.partNumber,
        hsnSacCode: payload.hsnSacCode,
        currentStock: payload.currentStock ?? 0,
        minStock: payload.minStock,
        warehouseName: payload.warehouseName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      FALLBACK_ITEMS.unshift(newItem);
      return newItem;
    }
    return await apiRequest<ItemMaster>('/inventory-master', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id: string, payload: UpdateItemMasterPayload): Promise<ItemMaster> {
    // Logic: If availableForPr is true, force availableForRfq to true
    if (payload.availableForPr) {
      payload.availableForRfq = true;
    }
    
    if (USE_MOCK) {
      const idx = FALLBACK_ITEMS.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error('Item not found');
      FALLBACK_ITEMS[idx] = { ...FALLBACK_ITEMS[idx], ...payload, updatedAt: new Date().toISOString() };
      return FALLBACK_ITEMS[idx];
    }
    return await apiRequest<ItemMaster>(`/inventory-master/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id: string): Promise<{ message: string; id: string }> {
    if (USE_MOCK) {
      const idx = FALLBACK_ITEMS.findIndex((i) => i.id === id);
      if (idx !== -1) FALLBACK_ITEMS.splice(idx, 1);
      return { message: 'Item deleted successfully', id };
    }
    return await apiRequest<{ message: string; id: string }>(`/inventory-master/${id}`, {
      method: 'DELETE',
    });
  },

  async bulkDelete(ids: string[]): Promise<{ message: string; count: number }> {
    if (USE_MOCK) {
      ids.forEach((id) => {
        const idx = FALLBACK_ITEMS.findIndex((i) => i.id === id);
        if (idx !== -1) FALLBACK_ITEMS.splice(idx, 1);
      });
      return { message: `${ids.length} items deleted successfully`, count: ids.length };
    }
    return await apiRequest<{ message: string; count: number }>('/inventory-master/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async exportCsv(): Promise<void> {
    const token = localStorage.getItem('heliflow_token') || localStorage.getItem('heliflow_vendor_token') || '';
    const companyCode = localStorage.getItem('heliflow_company_code') || '';
    
    // Using the same endpoint pattern as other services, adding /api if needed
    // The client handles API_BASE + path
    const response = await fetch(`${window.location.protocol}//${window.location.hostname}:3000/api/inventory-master/export`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'X-Company-Code': companyCode,
        'Accept': 'text/csv',
      },
    });
    if (!response.ok) {
      throw new Error('Failed to export inventory CSV');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-master-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
};
export default itemMasterService;
