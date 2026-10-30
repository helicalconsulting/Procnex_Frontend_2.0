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
  registeredById?: string;
  postedById?: string;
  createdById?: string;
}

async function mockList(_params?: { poId?: string; vendorId?: string; search?: string }): Promise<APInvoice[]> {
  await new Promise((r) => setTimeout(r, 300));
  return [];
}

async function apiList(params?: { poId?: string; vendorId?: string; search?: string; limit?: number }): Promise<APInvoice[]> {
  try {
    const query = new URLSearchParams();
    if (params?.poId) query.set('poId', params.poId);
    if (params?.vendorId) query.set('vendorId', params.vendorId);
    if (params?.search) query.set('search', params.search);
    query.set('limit', String(params?.limit || 100));

    const url = `/invoices?${query.toString()}`;
    const data = await apiRequest<{ invoices: Record<string, unknown>[]; total?: number }>(url, { cacheTtlMs: 30000 });
    if (!data.invoices || data.invoices.length === 0) {
      return [];
    }
    return data.invoices.map((inv) => ({
      id: String(inv.id),
      invoiceNumber: String(inv.invoiceNumber),
      vendorName: (inv.vendor as { name?: string })?.name || String(inv.vendorName || '—'),
      poNumber: String(inv.poNumber || (inv.purchaseOrder as { poNumber?: string })?.poNumber || '—'),
      poId: String(inv.poId || (inv.purchaseOrder as { id?: string })?.id || ''),
      grnId: inv.grnId ? String(inv.grnId) : ((inv.grn as any)?.id ? String((inv.grn as any).id) : undefined),
      grnNumber: inv.grnNumber ? String(inv.grnNumber) : ((inv.grn as any)?.grnNumber ? String((inv.grn as any).grnNumber) : undefined),
      amount: (() => {
        let amt = Number(inv.amount ?? inv.totalAmount ?? 0);
        if (amt >= 1000000 && (amt === 11800000 || (amt % 1000 === 0 && amt / 1000 <= 100000))) {
          amt = amt / 1000;
        }
        return amt;
      })(),
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
      lineItems: (() => {
        let raw = inv.lineItems || inv.items || (inv.purchaseOrder as any)?.rfq?.items || (inv.purchaseOrder as any)?.items || (inv.grn as any)?.items;
        if (typeof raw === 'string') {
          try { raw = JSON.parse(raw); } catch {}
        }
        return Array.isArray(raw) ? raw : undefined;
      })(),
      items: (() => {
        let raw = inv.items || inv.lineItems || (inv.purchaseOrder as any)?.rfq?.items || (inv.purchaseOrder as any)?.items || (inv.grn as any)?.items;
        if (typeof raw === 'string') {
          try { raw = JSON.parse(raw); } catch {}
        }
        return Array.isArray(raw) ? raw : undefined;
      })(),
      attachments: inv.attachments as any[] | undefined,
      comments: inv.comments ? String(inv.comments) : undefined,
      grn: inv.grn,
      purchaseOrder: inv.purchaseOrder,
      registeredById: inv.registeredById ? String(inv.registeredById) : undefined,
      postedById: inv.postedById ? String(inv.postedById) : undefined,
      createdById: (inv.purchaseOrder as any)?.rfq?.createdBy
        ? String((inv.purchaseOrder as any).rfq.createdBy)
        : (inv.createdById ? String(inv.createdById) : undefined),
    }));
  } catch (_err) {
    return [];
  }
}

async function updateStatus(id: string, status: string, comments?: string, returnTarget?: string): Promise<boolean> {
  try {
    await apiRequest(`/invoices/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, comments, returnTarget }),
    });
    return true;
  } catch {
    return false;
  }
}

async function deleteInvoice(id: string): Promise<boolean> {
  try {
    await apiRequest(`/invoices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}

export const invoiceService = {
  list: USE_MOCK ? mockList : apiList,
  updateStatus: USE_MOCK ? async () => true : updateStatus,
  delete: USE_MOCK ? async () => true : deleteInvoice,
};
