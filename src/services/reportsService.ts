import { USE_MOCK } from '../config/mock';
import { warnNoBackend } from '../api/client';
import { REPORTS_INVOICES_MOCK, type InvoiceRecord } from '../mocks/reportsPage.mock';
import { invoiceService, type APInvoice } from './invoiceService';

function mapApToReport(inv: APInvoice): InvoiceRecord {
  const status = inv.status.toLowerCase();
  let paymentStatus: InvoiceRecord['paymentStatus'] = 'pending';
  if (status.includes('paid')) paymentStatus = 'paid';
  else if (status.includes('overdue')) paymentStatus = 'overdue';
  else if (status.includes('reject')) paymentStatus = 'rejected';

  return {
    id: String(inv.id),
    invoiceNo: inv.invoiceNumber,
    supplier: inv.vendorName,
    supplierCode: inv.vendorName.slice(0, 2).toUpperCase(),
    invoiceDate: inv.submittedAt,
    dueDate: inv.dueDate,
    amount: inv.amount,
    paidAmount: paymentStatus === 'paid' ? inv.amount : 0,
    currency: '₹',
    paymentStatus,
    approvalStatus: status.includes('approv') ? 'approved' : 'pending',
    approvedBy: '—',
    approvedDate: '—',
    paymentMethod: '—',
    agingDays: 0,
    agingBucket: '0-30',
    poNumber: inv.poNumber,
    department: '—',
  };
}

async function mockList(): Promise<InvoiceRecord[]> {
  await new Promise((r) => setTimeout(r, 200));
  return REPORTS_INVOICES_MOCK;
}

async function apiList(): Promise<InvoiceRecord[]> {
  const invoices = await invoiceService.list();
  return invoices.map(mapApToReport);
}

if (!USE_MOCK) {
  warnNoBackend('Reports (uses invoice API)');
}

export const reportsService = {
  list: USE_MOCK ? mockList : apiList,
};
