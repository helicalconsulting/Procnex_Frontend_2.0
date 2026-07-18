import type { APInvoice } from '../services/invoiceService';

export const AP_INVOICES_MOCK: APInvoice[] = [
  {
    id: '1', invoiceNumber: 'INV-2024-0101', vendorName: 'TechSupply Co.',
    poNumber: 'PO-2024-0040', amount: 425000, status: 'PENDING_APPROVAL',
    dueDate: '2024-05-15', submittedAt: '2024-04-20', matchStatus: 'MATCHED',
  },
  {
    id: '2', invoiceNumber: 'INV-2024-0102', vendorName: 'SafeGuard Corp.',
    poNumber: 'PO-2024-0037', amount: 185000, status: 'APPROVED',
    dueDate: '2024-05-10', submittedAt: '2024-04-18', matchStatus: 'MATCHED',
  },
  {
    id: '3', invoiceNumber: 'INV-2024-0103', vendorName: 'ElectroPower India',
    poNumber: 'PO-2024-0035', amount: 720000, status: 'DRAFT',
    dueDate: '2024-05-20', submittedAt: '2024-04-22', matchStatus: 'PENDING',
  },
];
