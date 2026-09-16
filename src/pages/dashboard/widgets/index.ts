/**
 * Widget Registry — Central catalog of all dashboard widgets.
 * Each entry maps an ID to its component, metadata, and allowed roles.
 */

import type { ComponentType } from 'react';
import type { PermissionField } from '../../../config/modulePermissions';
import { RoleName } from '../../../utils/rbac';

import KpiStatsWidget from './KpiStatsWidget';
import ProcurementPipelineWidget from './ProcurementPipelineWidget';
import PendingApprovalsWidget from './PendingApprovalsWidget';
import RecentRfqsWidget from './RecentRfqsWidget';
import ActivityTimelineWidget from './ActivityTimelineWidget';
import TopVendorsWidget from './TopVendorsWidget';
import SpendOverviewWidget from './SpendOverviewWidget';
import QuickActionsWidget from './QuickActionsWidget';

// ─── Types ──────────────────────────────────────────────────

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: 'kpis' | 'data' | 'actions';
  icon: string;
  accentColor: string;
  roles: string[];
  requiredPermission: { module: string; action?: PermissionField };
  fullWidth?: boolean;
  component: ComponentType;
}

// ─── Registry ───────────────────────────────────────────────

const ALL_INTERNAL_ROLES = [
  RoleName.SUPER_ADMIN,
  RoleName.PROCUREMENT_MANAGER,
  RoleName.FINANCE_MANAGER,
  RoleName.FINANCE_APPROVER,
];

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    id: 'kpi-stats',
    name: 'KPI Statistics',
    description: 'Key performance indicators — RFQs, approvals, POs, vendors, spend & lead time',
    category: 'kpis',
    icon: 'BarChart3',
    accentColor: '#0a6ed1',
    roles: ALL_INTERNAL_ROLES,
    requiredPermission: { module: 'Dashboard', action: 'canView' },
    fullWidth: true,
    component: KpiStatsWidget,
  },
  {
    id: 'quick-actions',
    name: 'Quick Actions',
    description: 'One-click shortcuts to create RFQs, view approvals, manage vendors & more',
    category: 'actions',
    icon: 'Zap',
    accentColor: '#8b5cf6',
    roles: ALL_INTERNAL_ROLES,
    requiredPermission: { module: 'Dashboard', action: 'canView' },
    fullWidth: false,
    component: QuickActionsWidget,
  },
  {
    id: 'procurement-pipeline',
    name: 'Procurement Pipeline',
    description: 'Visual breakdown of RFQ statuses — draft, sent, in progress, closed & cancelled',
    category: 'data',
    icon: 'BarChart3',
    accentColor: '#0a6ed1',
    roles: [RoleName.SUPER_ADMIN, RoleName.PROCUREMENT_MANAGER],
    requiredPermission: { module: 'RFQ', action: 'canView' },
    fullWidth: false,
    component: ProcurementPipelineWidget,
  },
  {
    id: 'pending-approvals',
    name: 'Pending Approvals',
    description: 'Items awaiting your approval — RFQs, purchase orders & quotations',
    category: 'data',
    icon: 'Clock',
    accentColor: '#e9730c',
    roles: [RoleName.SUPER_ADMIN, RoleName.FINANCE_MANAGER, RoleName.FINANCE_APPROVER],
    requiredPermission: { module: 'Approvals', action: 'canView' },
    fullWidth: false,
    component: PendingApprovalsWidget,
  },
  {
    id: 'recent-rfqs',
    name: 'Recent RFQs',
    description: 'Latest requests for quotation with status, date & vendor count',
    category: 'data',
    icon: 'FileText',
    accentColor: '#0891b2',
    roles: [RoleName.SUPER_ADMIN, RoleName.PROCUREMENT_MANAGER, RoleName.FINANCE_MANAGER],
    requiredPermission: { module: 'RFQ', action: 'canView' },
    fullWidth: false,
    component: RecentRfqsWidget,
  },
  {
    id: 'activity-timeline',
    name: 'Activity Timeline',
    description: 'Real-time feed of recent actions across your procurement workflow',
    category: 'data',
    icon: 'History',
    accentColor: '#059669',
    roles: ALL_INTERNAL_ROLES,
    requiredPermission: { module: 'Dashboard', action: 'canView' },
    fullWidth: false,
    component: ActivityTimelineWidget,
  },
  {
    id: 'top-vendors',
    name: 'Top Vendors',
    description: 'Best performing vendors by quality, delivery & overall score',
    category: 'data',
    icon: 'Users',
    accentColor: '#8b5cf6',
    roles: [RoleName.SUPER_ADMIN, RoleName.PROCUREMENT_MANAGER],
    requiredPermission: { module: 'Vendors', action: 'canView' },
    fullWidth: false,
    component: TopVendorsWidget,
  },
  {
    id: 'spend-overview',
    name: 'Spend Overview',
    description: 'Monthly spending breakdown with category-wise distribution',
    category: 'kpis',
    icon: 'IndianRupee',
    accentColor: '#ec4899',
    roles: [RoleName.SUPER_ADMIN, RoleName.FINANCE_MANAGER],
    requiredPermission: { module: 'Purchase Orders', action: 'canView' },
    fullWidth: false,
    component: SpendOverviewWidget,
  },
];