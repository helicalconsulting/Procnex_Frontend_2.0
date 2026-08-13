import type { APInvoice } from '../services/invoiceService';

export const AP_INVOICES_MOCK: APInvoice[] = [
  {
    id: '1', invoiceNumber: 'INV-2024-0101', vendorName: 'TechSupply Co.',
    poNumber: 'PO-2024-0040', amount: 425000, status: 'PENDING_APPROVAL',
    dueDate: '2024-05-15', submittedAt: '2024-04-20', matchStatus: 'MATCHED',
    department: 'IT Infrastructure', paymentTerms: 'Net 30',
  },
  {
    id: '2', invoiceNumber: 'INV-2024-0102', vendorName: 'SafeGuard Corp.',
    poNumber: 'PO-2024-0037', amount: 185000, status: 'APPROVED',
    dueDate: '2024-05-10', submittedAt: '2024-04-18', matchStatus: 'MATCHED',
    department: 'Operations', paymentTerms: 'Net 15',
  },
  {
    id: '3', invoiceNumber: 'INV-2024-0103', vendorName: 'ElectroPower India',
    poNumber: 'PO-2024-0035', amount: 720000, status: 'DRAFT',
    dueDate: '2024-05-20', submittedAt: '2024-04-22', matchStatus: 'PENDING',
    department: 'Engineering', paymentTerms: 'Net 45',
  },
  {
    id: '4', invoiceNumber: 'INV-2024-0104', vendorName: 'Apex Logistics Ltd.',
    poNumber: 'PO-2024-0042', amount: 310000, status: 'OVERDUE',
    dueDate: '2024-04-05', submittedAt: '2024-03-05', matchStatus: 'MATCHED',
    department: 'Supply Chain', paymentTerms: 'Immediate',
  },
  {
    id: '5', invoiceNumber: 'INV-2024-0105', vendorName: 'Global Steel Works',
    poNumber: 'PO-2024-0045', amount: 1250000, status: 'PAID',
    dueDate: '2024-04-15', submittedAt: '2024-03-15', matchStatus: 'MATCHED',
    department: 'Manufacturing', paymentTerms: 'Net 30',
  },
  {
    id: '6', invoiceNumber: 'INV-2024-0106', vendorName: 'OmniNet Solutions',
    poNumber: 'PO-2024-0048', amount: 560000, status: 'PARTIAL',
    dueDate: '2024-05-01', submittedAt: '2024-04-01', matchStatus: 'MATCHED',
    department: 'IT Services', paymentTerms: 'Net 30',
  },
  {
    id: '7', invoiceNumber: 'INV-2024-0107', vendorName: 'Reliance Industrial',
    poNumber: 'PO-2024-0050', amount: 1890000, status: 'PENDING_APPROVAL',
    dueDate: '2024-05-25', submittedAt: '2024-04-25', matchStatus: 'PENDING',
    department: 'Procurement', paymentTerms: 'Net 60',
  },
  {
    id: '8', invoiceNumber: 'INV-2024-0108', vendorName: 'InfraBuild Projects',
    poNumber: 'PO-2024-0052', amount: 940000, status: 'REJECTED',
    dueDate: '2024-04-28', submittedAt: '2024-03-28', matchStatus: 'MISMATCH',
    department: 'Infrastructure', paymentTerms: 'Net 30',
  },
  {
    id: '9', invoiceNumber: 'INV-2024-0109', vendorName: 'Precision Tools Corp',
    poNumber: 'PO-2024-0055', amount: 275000, status: 'RETURNED',
    dueDate: '2024-05-05', submittedAt: '2024-04-10', matchStatus: 'MISMATCH',
    department: 'Maintenance', paymentTerms: 'Net 15',
  },
  {
    id: '10', invoiceNumber: 'INV-2024-0110', vendorName: 'GreenEnergy Systems',
    poNumber: 'PO-2024-0058', amount: 1480000, status: 'APPROVED',
    dueDate: '2024-05-18', submittedAt: '2024-04-19', matchStatus: 'MATCHED',
    department: 'Facilities', paymentTerms: 'Net 45',
  },
  {
    id: '11', invoiceNumber: 'INV-2024-0111', vendorName: 'Zenith Hardware Solutions',
    poNumber: 'PO-2024-0060', amount: 395000, status: 'PENDING',
    dueDate: '2024-05-28', submittedAt: '2024-04-28', matchStatus: 'PENDING',
    department: 'Hardware', paymentTerms: 'Net 30',
  },
  {
    id: '12', invoiceNumber: 'INV-2024-0112', vendorName: 'Horizon Telecom Services',
    poNumber: 'PO-2024-0063', amount: 630000, status: 'PAID',
    dueDate: '2024-04-30', submittedAt: '2024-03-30', matchStatus: 'MATCHED',
    department: 'Administration', paymentTerms: 'Net 30',
  },
];

