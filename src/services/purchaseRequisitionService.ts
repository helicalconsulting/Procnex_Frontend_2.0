import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';

// ─── Types ──────────────────────────────────────────────────

export interface PurchaseRequisitionItem {
  id?: string;
  itemNo: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxPercent: number;
  discount: number;
  total: number;
}

export interface PurchaseRequisition {
  id?: string;
  rfqId: string;
  poNumber?: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT_TO_VENDOR';

  // Company Details
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;

  // Vendor Details
  vendorName: string;
  vendorAddress: string;
  vendorContactPerson: string;
  vendorPhone: string;
  vendorEmail: string;
  vendorGstVat: string;

  // Ship To
  shipToCompany: string;
  shipToWarehouse: string;
  shipToAddress: string;
  shipToContact: string;
  shipToPhone: string;

  // PO Details
  poDate: string;
  currency: string;
  requisitioner: string;
  shipVia: string;
  fob: string;
  paymentTerms: string;
  deliveryDate: string;
  shippingTerms: string;

  // Items
  items: PurchaseRequisitionItem[];

  // Charges
  shippingCharges: number;
  otherCharges: number;

  // Notes
  internalNotes: string;
  specialInstructions: string;

  // Calculated
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;

  // Meta
  createdAt?: string;
  updatedAt?: string;
}

// ─── Mock Data ──────────────────────────────────────────────

function generateMockPR(rfqId: string): PurchaseRequisition {
  return {
    id: `mock-pr-${Date.now()}`,
    rfqId,
    poNumber: `PR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    status: 'DRAFT',

    companyName: 'Heliflow Industries Ltd',
    companyAddress: '123 Business Park, Sector 62, Noida, UP 201301',
    companyPhone: '+91-120-4567890',
    companyEmail: 'procurement@heliflow.com',
    companyWebsite: 'www.heliflow.com',

    vendorName: 'Fabricast Limited',
    vendorAddress: '456 Industrial Area, Chennai, TN 600001',
    vendorContactPerson: 'Rajesh Kumar',
    vendorPhone: '+91-44-2345678',
    vendorEmail: 'info@fabricast.com',
    vendorGstVat: 'GST-33ABCDE1234F1Z5',

    shipToCompany: 'Heliflow Industries Ltd',
    shipToWarehouse: 'Warehouse A - Noida',
    shipToAddress: '123 Business Park, Sector 62, Noida, UP 201301',
    shipToContact: 'Warehouse Manager',
    shipToPhone: '+91-120-4567891',

    poDate: new Date().toISOString().slice(0, 10),
    currency: 'INR',
    requisitioner: 'Procurement Manager',
    shipVia: 'Surface',
    fob: 'Destination',
    paymentTerms: 'Net 30',
    deliveryDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    shippingTerms: 'FOB Destination',

    items: [
      { itemNo: 1, description: 'Industrial Bearing Assembly - Type A', quantity: 50, unit: 'Pcs', unitPrice: 1250, taxPercent: 18, discount: 0, total: 73750 },
      { itemNo: 2, description: 'Hydraulic Pump Unit - HP-200', quantity: 10, unit: 'Pcs', unitPrice: 8500, taxPercent: 18, discount: 5, total: 96050 },
      { itemNo: 3, description: 'Steel Reinforcement Bars - 16mm', quantity: 500, unit: 'Kg', unitPrice: 85, taxPercent: 18, discount: 0, total: 50150 },
    ],

    shippingCharges: 5000,
    otherCharges: 2500,

    internalNotes: 'Priority delivery required for Production Line A.',
    specialInstructions: 'Inspect all items upon arrival. Submit GRN within 24 hours.',

    subtotal: 219950,
    taxTotal: 39591,
    discountTotal: 4250,
    grandTotal: 262791,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Mock API ───────────────────────────────────────────────

async function mockGetByRfqId(rfqId: string): Promise<PurchaseRequisition | null> {
  await new Promise(r => setTimeout(r, 600));
  // Return null on first fetch (no existing PR), caller creates new from RFQ data
  return null;
}

async function mockSave(data: PurchaseRequisition): Promise<PurchaseRequisition> {
  await new Promise(r => setTimeout(r, 400));
  return { ...data, id: data.id || `mock-pr-${Date.now()}`, updatedAt: new Date().toISOString() };
}

async function mockList(): Promise<PurchaseRequisition[]> {
  await new Promise(r => setTimeout(r, 300));
  return [
    generateMockPR('rfq-1'),
    generateMockPR('rfq-2'),
  ];
}

async function mockGetById(id: string): Promise<PurchaseRequisition> {
  await new Promise(r => setTimeout(r, 300));
  return generateMockPR('rfq-mock');
}

async function mockSendToVendor(id: string): Promise<{ success: boolean }> {
  await new Promise(r => setTimeout(r, 500));
  return { success: true };
}

// ─── API Functions ──────────────────────────────────────────

async function apiGetByRfqId(rfqId: string): Promise<PurchaseRequisition | null> {
  try {
    const data = await apiRequest<{ purchaseRequisition: PurchaseRequisition | null }>(
      `/purchase-requisitions/rfq/${rfqId}`
    );
    return data.purchaseRequisition;
  } catch {
    return null;
  }
}

async function apiSave(data: PurchaseRequisition): Promise<PurchaseRequisition> {
  return apiRequest<PurchaseRequisition>('/purchase-requisitions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function apiList(): Promise<PurchaseRequisition[]> {
  const data = await apiRequest<{ purchaseRequisitions: PurchaseRequisition[] }>('/purchase-requisitions');
  return data.purchaseRequisitions || [];
}

async function apiGetById(id: string): Promise<PurchaseRequisition> {
  return apiRequest<PurchaseRequisition>(`/purchase-requisitions/${id}`);
}

async function apiSendToVendor(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/purchase-requisitions/${id}/send`, { method: 'POST' });
}

async function mockDelete(id: string): Promise<{ success: boolean }> {
  await new Promise(r => setTimeout(r, 300));
  return { success: true };
}

async function apiDelete(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/purchase-requisitions/${id}`, { method: 'DELETE' });
}

// ─── Service Export ─────────────────────────────────────────

export const purchaseRequisitionService = {
  getByRfqId: USE_MOCK ? mockGetByRfqId : apiGetByRfqId,
  save: USE_MOCK ? mockSave : apiSave,
  list: USE_MOCK ? mockList : apiList,
  getById: USE_MOCK ? mockGetById : apiGetById,
  sendToVendor: USE_MOCK ? mockSendToVendor : apiSendToVendor,
  delete: USE_MOCK ? mockDelete : apiDelete,
};
