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
  threeWayMatch?: string;
  matchStatus?: string;
  department?: string;
  paymentTerms?: string;
  lineItems?: any[];
  items?: any[];
  attachments?: any[];
  comments?: string;
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
      dueDate: String(inv.dueDate || '').slice(0, 10),
      submittedAt: String(inv.createdAt || inv.submittedAt || '').slice(0, 10),
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
    }));
  } catch (_err) {
    return [];
  }
}

export const invoiceService = {
  list: USE_MOCK ? mockList : apiList,
};
