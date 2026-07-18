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

export const REPORTS_INVOICES_MOCK: InvoiceRecord[] = [
  { id: 1, invoiceNo: 'INV-2026-0142', supplier: 'TechSupply Co.', supplierCode: 'TS-001', invoiceDate: '2026-03-15', dueDate: '2026-04-14', amount: 485000, paidAmount: 485000, currency: '₹', paymentStatus: 'paid', approvalStatus: 'approved', approvedBy: 'Rahul Sharma', approvedDate: '2026-03-18', paymentMethod: 'Bank Transfer', agingDays: 0, agingBucket: '0-30', poNumber: 'PO-2026-0089', department: 'Engineering' },
  { id: 2, invoiceNo: 'INV-2026-0143', supplier: 'ElectroPower India', supplierCode: 'EP-003', invoiceDate: '2026-03-20', dueDate: '2026-04-19', amount: 320000, paidAmount: 0, currency: '₹', paymentStatus: 'pending', approvalStatus: 'pending', approvedBy: '—', approvedDate: '—', paymentMethod: '—', agingDays: 22, agingBucket: '0-30', poNumber: 'PO-2026-0091', department: 'Operations' },
  { id: 3, invoiceNo: 'INV-2026-0138', supplier: 'SafeGuard Corp.', supplierCode: 'SC-002', invoiceDate: '2026-02-10', dueDate: '2026-03-12', amount: 178500, paidAmount: 0, currency: '₹', paymentStatus: 'overdue', approvalStatus: 'approved', approvedBy: 'Priya Patel', approvedDate: '2026-02-14', paymentMethod: '—', agingDays: 60, agingBucket: '61-90', poNumber: 'PO-2026-0078', department: 'Manufacturing' },
  { id: 4, invoiceNo: 'INV-2026-0145', supplier: 'PackRight India', supplierCode: 'PR-004', invoiceDate: '2026-04-01', dueDate: '2026-05-01', amount: 95000, paidAmount: 95000, currency: '₹', paymentStatus: 'paid', approvalStatus: 'approved', approvedBy: 'Vikram Singh', approvedDate: '2026-04-03', paymentMethod: 'UPI', agingDays: 0, agingBucket: '0-30', poNumber: 'PO-2026-0095', department: 'Admin' },
];
