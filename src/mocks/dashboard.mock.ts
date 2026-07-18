import type { DashboardPipelineItem, DashboardRecentRfq, KpiItem } from '../types/viewModels';

export const DASHBOARD_KPI_MOCK: KpiItem[] = [
  { id: 'rfq', label: 'Open RFQs', value: '12', trend: '+3 from last week', direction: 'up', modifier: 'rfq' },
  { id: 'approvals', label: 'Pending Approvals', value: '8', trend: '-2 from last week', direction: 'down', modifier: 'approvals' },
  { id: 'pos', label: 'Active POs', value: '24', trend: '+5 from last month', direction: 'up', modifier: 'pos' },
  { id: 'vendors', label: 'Total Vendors', value: '47', trend: '+3 new this month', direction: 'up', modifier: 'vendors' },
  { id: 'spend', label: 'Total Spend (MTD)', value: '₹18.4L', trend: '↑ 12% vs last month', direction: 'up', modifier: 'spend' },
  { id: 'tasks', label: 'My Tasks', value: '5', trend: '', direction: 'neutral', modifier: 'lead' },
];

export const DASHBOARD_TASKS_MOCK: Array<{ type: string; count: number; label: string; link: string }> = [
  { type: 'VENDOR_APPROVAL', count: 2, label: 'Vendors pending approval', link: '/procurement/vendor-approval-queue' },
  { type: 'RFQ_DRAFT', count: 1, label: 'Draft RFQs to send', link: '/rfqs?status=DRAFT' },
  { type: 'QUOTATION_EVAL', count: 1, label: 'RFQs with quotations to evaluate', link: '/rfqs?status=QUOTATIONS_RECEIVED' },
  { type: 'NOTIFICATION', count: 3, label: 'Unread notifications', link: '/notifications' },
  { type: 'QUOTATION_ACCEPTED', count: 1, label: 'Accepted quotations pending PO creation', link: '/rfqs?status=UNDER_EVALUATION' },
];

export const DASHBOARD_PIPELINE_MOCK: DashboardPipelineItem[] = [
  { status: 'DRAFT', label: 'Draft', count: 4 },
  { status: 'SENT', label: 'Sent', count: 3 },
  { status: 'IN_PROGRESS', label: 'In Progress', count: 5 },
  { status: 'CLOSED', label: 'Closed', count: 8 },
  { status: 'CANCELLED', label: 'Cancelled', count: 1 },
];

export interface ActivityItem {
  iconName: 'Send' | 'ShieldCheck' | 'CheckCircle2' | 'FileText' | 'XCircle' | 'AlertCircle';
  text: string;
  time: string;
}

export const DASHBOARD_ACTIVITY_MOCK: ActivityItem[] = [
  { iconName: 'Send', text: '<strong>RFQ-2024-019</strong> sent to 5 vendors', time: '2 hours ago' },
  { iconName: 'ShieldCheck', text: '<strong>PO-2024-041</strong> approved by Finance Manager', time: '4 hours ago' },
  { iconName: 'CheckCircle2', text: 'Vendor <strong>TechSupply Co.</strong> submitted quotation', time: '6 hours ago' },
  { iconName: 'FileText', text: '<strong>RFQ-2024-020</strong> created by Rahul Sharma', time: 'Yesterday, 5:30 PM' },
];

export const DASHBOARD_RECENT_RFQ_MOCK: DashboardRecentRfq[] = [
  { id: '1', rfqNumber: 'RFQ-2024-020', title: 'Office Furniture', status: 'DRAFT', creator: 'Rahul Sharma', quotations: 0, createdAt: '2024-04-25' },
  { id: '2', rfqNumber: 'RFQ-2024-019', title: 'IT Hardware Q2', status: 'SENT', creator: 'Priya Patel', quotations: 3, createdAt: '2024-04-24' },
  { id: '3', rfqNumber: 'RFQ-2024-018', title: 'Electrical Panels', status: 'IN_PROGRESS', creator: 'Amit Kumar', quotations: 2, createdAt: '2024-04-22' },
];
