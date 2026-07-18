import type { ApprovalTableRow } from '../types/viewModels';

export const APPROVALS_PAGE_MOCK: ApprovalTableRow[] = [
  {
    id: 'ap-1', referenceId: 'q-001', module: 'Purchase Order', referenceNumber: 'PO-2024-0042', title: 'Server Room Equipment',
    requestedBy: 'Rahul Sharma', requestedByInitials: 'RS', avatarMod: '2',
    amount: '₹17,85,000', amountNum: 1785000, currentLevel: 2, totalLevels: 3,
    requiredRole: 'Finance Approver', status: 'PENDING', priority: 'HIGH',
    submittedAt: '2024-04-26T10:00:00', department: 'IT',
  },
  {
    id: 'ap-2', referenceId: 'rfq-020', module: 'RFQ', referenceNumber: 'RFQ-2024-020', title: 'Office Furniture Procurement',
    requestedBy: 'Priya Patel', requestedByInitials: 'PP', avatarMod: '1',
    amount: '₹4,50,000', amountNum: 450000, currentLevel: 1, totalLevels: 2,
    requiredRole: 'Procurement Manager', status: 'PENDING', priority: 'MEDIUM',
    submittedAt: '2024-04-25T14:30:00', department: 'Admin',
  },
  {
    id: 'ap-3', referenceId: 'q-088', module: 'Quotation', referenceNumber: 'QT-2024-0088', title: 'Industrial Safety Equipment',
    requestedBy: 'Amit Kumar', requestedByInitials: 'AK', avatarMod: '3',
    amount: '₹7,20,000', amountNum: 720000, currentLevel: 1, totalLevels: 1,
    requiredRole: 'Finance Approver', status: 'APPROVED', priority: 'HIGH',
    submittedAt: '2024-04-24T09:00:00', department: 'Operations',
  },
];
