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

export interface DashboardSummary {
  overview: DashboardOverview;
  pipeline: { distribution: { status: string; count: number }[] };
  recentRFQs: Array<Record<string, unknown>>;
  spend: {
    monthlyTrend: Array<{ month: string; value: number }>;
    categories: Array<{ label: string; amount: number; percent: number }>;
  };
  myTasks: MyTasksResponse;
  kpis: KpiItem[];
  sseClients?: number;
}

async function fetchSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/dashboard/summary', { cacheTtlMs: 15000 });
}

async function mockKpis(): Promise<KpiItem[]> {
  return DASHBOARD_KPI_MOCK.map((k) => ({ ...k, trend: '' }));
}

async function apiKpis(): Promise<KpiItem[]> {
  try {
    const summary = await fetchSummary();
    if (summary.kpis && summary.kpis.length > 0) {
      return summary.kpis;
    }
  } catch {}

  const [o, tasksRes, approvalsRes] = await Promise.all([
    apiRequest<DashboardOverview>('/dashboard/overview'),
    apiRequest<{ tasks: Array<{ type: string; count: number; label: string; link: string }>; taskCount: number }>('/dashboard/my-tasks'),
    apiRequest<{ approvals?: Array<{ status: string }> }>('/approvals').catch(() => ({ approvals: [] })),
  ]);
  const pendingApprovalsCount = Array.isArray(approvalsRes?.approvals)
    ? approvalsRes.approvals.filter((a) => ['PENDING', 'RETURNED'].includes(String(a.status || ''))).length
    : (o.rfqs?.pendingApproval || 0);

  return [
    { id: 'rfq', label: 'Open RFQs', value: String(o.rfqs.total), trend: '', direction: 'neutral', modifier: 'rfq' },
    { id: 'approvals', label: 'Pending Eval', value: String(Math.max(pendingApprovalsCount, o.rfqs?.pendingApproval || 0)), trend: '', direction: 'neutral', modifier: 'approvals' },
    { id: 'pos', label: 'Purchase Orders', value: String(o.purchaseOrders.total), trend: '', direction: 'neutral', modifier: 'pos' },
    { id: 'vendors', label: 'Active Vendors', value: String(o.vendors.total), trend: '', direction: 'neutral', modifier: 'vendors' },
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
  return apiRequest<RfqStatusReport>('/dashboard/rfq-status', { cacheTtlMs: 15000 });
}

const RFQ_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  QUOTATIONS_RECEIVED: 'Quotations In',
  UNDER_EVALUATION: 'Under Eval',
  PO_CREATED: 'PO Created',
  CLOSED: 'Closed',
};

async function apiPipeline(): Promise<DashboardPipelineItem[]> {
  try {
    const summary = await fetchSummary();
    if (summary.pipeline?.distribution) {
      return summary.pipeline.distribution.map((d) => ({
        status: mapBackendRfqStatus(d.status),
        label: RFQ_STATUS_LABELS[d.status] || d.status,
        count: d.count,
      }));
    }
  } catch {}

  const report = await fetchRfqStatusReport();
  return (report.distribution || []).map((d) => ({
    status: mapBackendRfqStatus(d.status),
    label: RFQ_STATUS_LABELS[d.status] || d.status,
    count: d.count,
  }));
}

async function mockRecentRfqs(): Promise<DashboardRecentRfq[]> {
  return DASHBOARD_RECENT_RFQ_MOCK;
}

async function apiRecentRfqs(): Promise<DashboardRecentRfq[]> {
  try {
    const summary = await fetchSummary();
    if (summary.recentRFQs && summary.recentRFQs.length > 0) {
      return summary.recentRFQs.map((r) => ({
        id: String(r.id),
        rfqNumber: String(r.rfqNumber),
        title: String(r.title),
        status: mapBackendRfqStatus(String(r.status)),
        creator: (r.creator as { fullName?: string })?.fullName || '—',
        quotations: (r._count as { quotations?: number })?.quotations ?? 0,
        createdAt: String(r.createdAt).slice(0, 10),
      }));
    }
  } catch {}

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
  try {
    const summary = await fetchSummary();
    if (summary.myTasks) return summary.myTasks;
  } catch {}
  return apiRequest<MyTasksResponse>('/dashboard/my-tasks', { cacheTtlMs: 15000 });
}

async function apiOverview(): Promise<DashboardOverview> {
  try {
    const summary = await fetchSummary();
    if (summary.overview) return summary.overview;
  } catch {}
  return apiRequest<DashboardOverview>('/dashboard/overview', { cacheTtlMs: 15000 });
}

async function apiSpendOverview(): Promise<{
  monthlyTrend: Array<{ month: string; value: number }>;
  categories: Array<{ label: string; amount: number; percent: number }>;
}> {
  try {
    const summary = await fetchSummary();
    if (summary.spend) return summary.spend;
  } catch {}
  return apiRequest('/dashboard/spend-overview', { cacheTtlMs: 15000 });
}

async function apiTopVendors() {
  return mockTopVendors();
}

export const dashboardService = {
  getSummary: fetchSummary,
  getMyTasks: USE_MOCK ? mockMyTasks : apiMyTasks,
  getKpis: USE_MOCK ? mockKpis : apiKpis,
  getPipeline: USE_MOCK ? mockPipeline : apiPipeline,
  getRecentRfqs: USE_MOCK ? mockRecentRfqs : apiRecentRfqs,
  getActivity: USE_MOCK ? mockActivity : apiActivity,
  getTopVendors: USE_MOCK ? mockTopVendors : apiTopVendors,
  getOverview: apiOverview,
  getSpendOverview: apiSpendOverview,
};
