import type { NotificationRow } from '../types/viewModels';

export const NOTIFICATIONS_PAGE_MOCK: NotificationRow[] = [
  { id: '1', type: 'APPROVAL', title: 'Approval Required', message: 'PO-2024-0042 requires your approval.', isRead: false, linkedRef: 'PO-2024-0042', createdAt: '2024-04-26T14:30:00', from: 'System' },
  { id: '2', type: 'ORDER', title: 'Order Dispatched', message: 'PO-2024-0040 has been dispatched.', isRead: false, linkedRef: 'PO-2024-0040', createdAt: '2024-04-26T11:15:00', from: 'SafeGuard Corp.' },
  { id: '3', type: 'RFQ', title: 'New Quotation Received', message: 'Quotation received for RFQ-2024-021.', isRead: false, linkedRef: 'RFQ-2024-021', createdAt: '2024-04-26T09:00:00', from: 'ElectroPower India' },
  { id: '4', type: 'ALERT', title: 'Delivery Overdue', message: 'PO-2024-0035 is 2 days past expected delivery.', isRead: false, linkedRef: 'PO-2024-0035', createdAt: '2024-04-25T16:45:00', from: 'System' },
  { id: '5', type: 'SYSTEM', title: 'Role Updated', message: 'Your role permissions have been updated.', isRead: true, linkedRef: '-', createdAt: '2024-04-25T14:20:00', from: 'Admin' },
];
