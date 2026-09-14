import { USE_MOCK } from '../config/mock';
import { REPORTS_INVOICES_MOCK, type InvoiceRecord, type AgingBucket } from '../mocks/reportsPage.mock';
import { invoiceService, type APInvoice } from './invoiceService';

function mapApToReport(inv: APInvoice): InvoiceRecord {
  const status = (inv.status || '').toLowerCase();
  let paymentStatus: InvoiceRecord['paymentStatus'] = 'pending';
  if (status.includes('paid')) paymentStatus = 'paid';
  else if (status.includes('overdue')) paymentStatus = 'overdue';
  else if (status.includes('reject')) paymentStatus = 'rejected';

  let agingDays = 0;
  let agingBucket: AgingBucket = '0-30';
  if (inv.dueDate && paymentStatus !== 'paid' && paymentStatus !== 'rejected') {
    const due = new Date(inv.dueDate).getTime();
    const now = Date.now();
    if (now > due) {
      agingDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
      paymentStatus = 'overdue';
      if (agingDays > 90) agingBucket = '90+';
      else if (agingDays > 60) agingBucket = '61-90';
      else if (agingDays > 30) agingBucket = '31-60';
      else agingBucket = '0-30';
    }
  }

  return {
    id: typeof inv.id === 'number' ? inv.id : Math.floor(Math.random() * 10000),
    invoiceNo: inv.invoiceNumber || `INV-${inv.id}`,
    supplier: inv.vendorName || 'Supplier',
    supplierCode: (inv.vendorName || 'SUP').slice(0, 4).toUpperCase(),
    invoiceDate: inv.submittedAt || new Date().toISOString().slice(0, 10),
    dueDate: inv.dueDate || new Date().toISOString().slice(0, 10),
    amount: Number(inv.amount || 0),
    paidAmount: paymentStatus === 'paid' ? Number(inv.amount || 0) : 0,
    currency: '₹',
    paymentStatus,
    approvalStatus: status.includes('approv') ? 'approved' : status.includes('reject') ? 'rejected' : 'pending',
    approvedBy: 'Finance Approver',
    approvedDate: inv.submittedAt || '—',
    paymentMethod: 'NEFT',
    agingDays,
    agingBucket,
    poNumber: inv.poNumber || 'N/A',
    department: inv.department || 'Procurement',
  };
}

async function mockList(): Promise<InvoiceRecord[]> {
  await new Promise((r) => setTimeout(r, 200));
  return REPORTS_INVOICES_MOCK;
}

async function apiList(): Promise<InvoiceRecord[]> {
  try {
    const invoices = await invoiceService.list();
    if (invoices && Array.isArray(invoices) && invoices.length > 0) {
      return invoices.map(mapApToReport);
    }
  } catch (_err) {
    // API error
  }
  return REPORTS_INVOICES_MOCK;
}

export const reportsService = {
  list: USE_MOCK ? mockList : apiList,
};


