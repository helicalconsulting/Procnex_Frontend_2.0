export type PaymentStatus = 'paid' | 'pending' | 'overdue' | 'rejected';
export type ApprovalStatus = 'approved' | 'pending' | 'rejected';
export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

export interface InvoiceRecord {
  id: number;
  invoiceNo: string;
  supplier: string;
  supplierCode: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  approvalStatus: ApprovalStatus;
  approvedBy: string;
  approvedDate: string;
  paymentMethod: string;
  agingDays: number;
  agingBucket: AgingBucket;
  poNumber: string;
  department: string;
}

export const REPORTS_INVOICES_MOCK: InvoiceRecord[] = [];
