import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { AP_INVOICES_MOCK } from '../mocks/invoicePage.mock';

export interface APInvoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  poNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  submittedAt: string;
  matchStatus?: string;
}

async function mockList(): Promise<APInvoice[]> {
  await new Promise((r) => setTimeout(r, 300));
  return AP_INVOICES_MOCK;
}

async function apiList(): Promise<APInvoice[]> {
  const data = await apiRequest<{ invoices: Record<string, unknown>[]; total?: number }>('/invoices');
  return (data.invoices || []).map((inv) => ({
    id: String(inv.id),
    invoiceNumber: String(inv.invoiceNumber),
    vendorName: (inv.vendor as { name?: string })?.name || String(inv.vendorName || '—'),
    poNumber: String(inv.poNumber || (inv.purchaseOrder as { poNumber?: string })?.poNumber || '—'),
    amount: Number(inv.amount ?? inv.totalAmount ?? 0),
    status: String(inv.status),
    dueDate: String(inv.dueDate || '').slice(0, 10),
    submittedAt: String(inv.createdAt || inv.submittedAt || '').slice(0, 10),
    matchStatus: inv.matchStatus ? String(inv.matchStatus) : undefined,
  }));
}

export const invoiceService = {
  list: USE_MOCK ? mockList : apiList,
};
