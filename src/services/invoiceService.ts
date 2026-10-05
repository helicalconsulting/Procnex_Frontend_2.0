import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';

export interface APInvoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  poNumber: string;
  poId?: string;
  grnNumber?: string;
  amount: number;
  paidAmount?: number;
  status: string;
  dueDate: string;
  submittedAt: string;
  invoiceDate?: string;
  threeWayMatch?: string;
  matchStatus?: string;
  department?: string;
  paymentTerms?: string;
  lineItems?: any[];
  items?: any[];
  attachments?: any[];
  comments?: string;
  grn?: any;
  purchaseOrder?: any;
}

async function mockList(_params?: { poId?: string; vendorId?: string; search?: string }): Promise<APInvoice[]> {
  await new Promise((r) => setTimeout(r, 300));
  return [];
}

async function apiList(params?: { poId?: string; vendorId?: string; search?: string }): Promise<APInvoice[]> {
  try {
    const query = new URLSearchParams();
    if (params?.poId) query.set('poId', params.poId);
    if (params?.vendorId) query.set('vendorId', params.vendorId);
    if (params?.search) query.set('search', params.search);

    const url = query.toString() ? `/invoices?${query.toString()}` : '/invoices';
    const data = await apiRequest<{ invoices: Record<string, unknown>[]; total?: number }>(url);
    if (!data.invoices || data.invoices.length === 0) {
      return [];
    }
    return data.invoices.map((inv) => ({
      id: String(inv.id),
      invoiceNumber: String(inv.invoiceNumber),
      vendorName: (inv.vendor as { name?: string })?.name || String(inv.vendorName || '—'),
      poNumber: String(inv.poNumber || (inv.purchaseOrder as { poNumber?: string })?.poNumber || '—'),
      poId: String(inv.poId || (inv.purchaseOrder as { id?: string })?.id || ''),
      grnNumber: (inv.grn as { grnNumber?: string })?.grnNumber || undefined,
      amount: Number(inv.amount ?? inv.totalAmount ?? 0),
      paidAmount: Number(inv.paidAmount ?? 0),
      status: String(inv.status),
      dueDate: (() => {
        const raw = inv.dueDate || (inv as any).due_date;
        if (!raw) return '';
        return typeof raw === 'string' ? raw.slice(0, 10) : (raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10));
      })(),
      invoiceDate: (() => {
        const raw = inv.invoiceDate || (inv as any).issueDate || (inv as any).submittedDate || inv.submittedAt || inv.createdAt || inv.syncedAt;
        if (!raw) return '';
        return typeof raw === 'string' ? raw.slice(0, 10) : (raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10));
      })(),
      submittedAt: (() => {
        const raw = inv.submittedAt || inv.createdAt || inv.syncedAt || inv.invoiceDate;
        if (!raw) return '';
        return typeof raw === 'string' ? raw.slice(0, 10) : (raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10));
      })(),
      threeWayMatch: (() => {
        const raw = inv.threeWayMatch ? String(inv.threeWayMatch) : (inv.matchStatus ? String(inv.matchStatus) : '');
        if (raw === 'MATCHED' || raw === 'VERIFIED') return 'MATCHED';
        if (raw === 'MISMATCH' || raw === 'DISCREPANCY' || raw === 'FAILED') return 'DISCREPANCY';
        // NOT_MATCHED, '', null → unknown (not confirmed matched yet)
        return 'NOT_MATCHED';
      })(),
      matchStatus: inv.matchStatus ? String(inv.matchStatus) : undefined,
      department: inv.department ? String(inv.department) : undefined,
      paymentTerms: inv.paymentTerms ? String(inv.paymentTerms) : undefined,
      lineItems: (inv.lineItems || inv.items) as any[] | undefined,
      items: (inv.items || inv.lineItems) as any[] | undefined,
      attachments: inv.attachments as any[] | undefined,
      comments: inv.comments ? String(inv.comments) : undefined,
      grn: inv.grn,
      purchaseOrder: inv.purchaseOrder,
    }));
  } catch (_err) {
    return [];
  }
}

async function updateStatus(id: string, status: string, comments?: string): Promise<boolean> {
  try {
    await apiRequest(`/invoices/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, comments }),
    });
    return true;
  } catch {
    return false;
  }
}

export const invoiceService = {
  list: USE_MOCK ? mockList : apiList,
  updateStatus: USE_MOCK ? async () => true : updateStatus,
};
