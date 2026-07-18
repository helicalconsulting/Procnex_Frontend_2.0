import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import {
  DASHBOARD_KPI_MOCK,
  DASHBOARD_PIPELINE_MOCK,
  DASHBOARD_RECENT_RFQ_MOCK,
  DASHBOARD_ACTIVITY_MOCK,
  DASHBOARD_TASKS_MOCK,
} from '../mocks/dashboard.mock';
import type { DashboardPipelineItem, DashboardRecentRfq, KpiItem } from '../types/viewModels';
import type { ActivityItem } from '../mocks/dashboard.mock';
import { vendorService } from './vendorService';
import { mapBackendRfqStatus } from '../api/mappers';

interface DashboardOverview {
  rfqs: { total: number; draft: number; sent: number; pendingApproval: number };
  quotations: { active: number };
  purchaseOrders: { total: number };
  vendors: { total: number; pendingApproval: number };
}

async function mockKpis(): Promise<KpiItem[]> {
  return DASHBOARD_KPI_MOCK;
}

async function apiKpis(): Promise<KpiItem[]> {
  const [o, tasksRes] = await Promise.all([
    apiRequest<DashboardOverview>('/dashboard/overview'),
    apiRequest<{ tasks: Array<{ type: string; count: number; label: string; link: string }>; taskCount: number }>('/dashboard/my-tasks'),
  ]);
  return [
    { id: 'rfq', label: 'Open RFQs', value: String(o.rfqs.total), trend: `${o.rfqs.draft} draft`, direction: 'neutral', modifier: 'rfq' },
    { id: 'approvals', label: 'Pending Eval', value: String(o.rfqs.pendingApproval), trend: '', direction: 'neutral', modifier: 'approvals' },
    { id: 'pos', label: 'Purchase Orders', value: String(o.purchaseOrders.total), trend: '', direction: 'neutral', modifier: 'pos' },
    { id: 'vendors', label: 'Active Vendors', value: String(o.vendors.total), trend: `${o.vendors.pendingApproval} pending`, direction: 'neutral', modifier: 'vendors' },
    { id: 'quotes', label: 'Active Quotations', value: String(o.quotations.active), trend: '', direction: 'neutral', modifier: 'spend' },
    { id: 'tasks', label: 'My Tasks', value: String(tasksRes.taskCount), trend: '', direction: 'neutral', modifier: 'lead' },
  ];
}

async function mockPipeline(): Promise<DashboardPipelineItem[]> {
  return DASHBOARD_PIPELINE_MOCK;
}

// Shared fetcher for /dashboard/rfq-status — both pipeline and recent RFQs
// use the same endpoint, so we share one call via apiRequest's built-in cache.
interface RfqStatusReport {
  distribution: { status: string; count: number }[];
  recentRFQs: Array<Record<string, unknown>>;
}

function fetchRfqStatusReport(): Promise<RfqStatusReport> {
  return apiRequest<RfqStatusReport>('/dashboard/rfq-status');
}

async function apiPipeline(): Promise<DashboardPipelineItem[]> {
  const report = await fetchRfqStatusReport();
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent',
    QUOTATIONS_RECEIVED: 'Quotations In',
    UNDER_EVALUATION: 'Under Eval',
    PO_CREATED: 'PO Created',
    CLOSED: 'Closed',
  };
  return (report.distribution || []).map((d) => ({
    status: mapBackendRfqStatus(d.status),
    label: labels[d.status] || d.status,
    count: d.count,
  }));
}

async function mockRecentRfqs(): Promise<DashboardRecentRfq[]> {
  return DASHBOARD_RECENT_RFQ_MOCK;
}

async function apiRecentRfqs(): Promise<DashboardRecentRfq[]> {
  const report = await fetchRfqStatusReport();
  return (report.recentRFQs || []).map((r) => ({
    id: String(r.id),
    rfqNumber: String(r.rfqNumber),
    title: String(r.title),
    status: mapBackendRfqStatus(String(r.status)),
    creator: (r.creator as { fullName?: string })?.fullName || '—',
    quotations: (r._count as { quotations?: number })?.quotations ?? 0,
    createdAt: String(r.createdAt).slice(0, 10),
  }));
}

async function mockActivity(): Promise<ActivityItem[]> {
  return DASHBOARD_ACTIVITY_MOCK;
}

async function apiActivity(): Promise<ActivityItem[]> {
  // No dedicated backend endpoint for "recent activity" timeline yet.
  // Return empty in dynamic mode to avoid frontend mock data leakage.
  return [];
}

async function mockTopVendors() {
  const vendors = await vendorService.list();
  return vendors
    .slice(0, 4)
    .map((v) => ({
      name: v.name,
      initials: v.initials,
      pos: v.totalOrders,
      score: v.overallScore ?? 0,
      quality: v.avgQuality ?? 0,
      delivery: v.avgDelivery ?? 0,
      avatarMod: v.avatarMod,
    }));
}

// ─── My Tasks ────────────────────────────────────────────────────────────────

interface DashboardTask {
  type: string;
  count: number;
  label: string;
  link: string;
}

interface MyTasksResponse {
  tasks: DashboardTask[];
  taskCount: number;
}

async function mockMyTasks(): Promise<MyTasksResponse> {
  return { tasks: DASHBOARD_TASKS_MOCK, taskCount: DASHBOARD_TASKS_MOCK.length };
}

async function apiMyTasks(): Promise<MyTasksResponse> {
  return apiRequest<MyTasksResponse>('/dashboard/my-tasks');
}

async function apiTopVendors() {
  return mockTopVendors();
}

export const dashboardService = {
  getMyTasks: USE_MOCK ? mockMyTasks : apiMyTasks,
  getKpis: USE_MOCK ? mockKpis : apiKpis,
  getPipeline: USE_MOCK ? mockPipeline : apiPipeline,
  getRecentRfqs: USE_MOCK ? mockRecentRfqs : apiRecentRfqs,
  getActivity: USE_MOCK ? mockActivity : apiActivity,
  getTopVendors: USE_MOCK ? mockTopVendors : apiTopVendors,
  getOverview: () => apiRequest<DashboardOverview>('/dashboard/overview'),
  getSpendOverview: () =>
    apiRequest<{
      monthlyTrend: Array<{ month: string; value: number }>;
      categories: Array<{ label: string; amount: number; percent: number }>;
    }>('/dashboard/spend-overview'),
};
