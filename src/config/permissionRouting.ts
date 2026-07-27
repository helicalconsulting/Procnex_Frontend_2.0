/**
 * Maps app routes & menu ids → RBAC module names (same as DB / Roles matrix).
 */
import type { PermissionField } from './modulePermissions';

export interface RoutePermissionRule {
  module: string;
  action?: PermissionField;
}

/** Longest-prefix match: more specific paths first */
export const ROUTE_PERMISSION_RULES: Array<{ prefix: string; rule: RoutePermissionRule }> = [
  { prefix: '/rfq/create', rule: { module: 'RFQ', action: 'canCreate' } },
  { prefix: '/rfq/edit', rule: { module: 'RFQ', action: 'canCreate' } },
  { prefix: '/admin/users', rule: { module: 'User Management', action: 'canView' } },
  { prefix: '/admin/roles-permissions', rule: { module: 'Roles & Permissions', action: 'canView' } },
  { prefix: '/admin/company-settings', rule: { module: 'User Management', action: 'canView' } },
  { prefix: '/admin/approval-levels', rule: { module: 'Approval Levels', action: 'canView' } },
  { prefix: '/dashboard', rule: { module: 'Dashboard', action: 'canView' } },
  { prefix: '/rfq', rule: { module: 'RFQ', action: 'canView' } },
  { prefix: '/quotations', rule: { module: 'Quotations', action: 'canView' } },
  { prefix: '/approvals', rule: { module: 'Approvals', action: 'canView' } },
  { prefix: '/accounts-payable', rule: { module: 'Purchase Orders', action: 'canView' } },
  { prefix: '/payments', rule: { module: 'Purchase Orders', action: 'canView' } },
  { prefix: '/sales-orders', rule: { module: 'Purchase Orders', action: 'canView' } },
  { prefix: '/vendors', rule: { module: 'Vendors', action: 'canView' } },
  { prefix: '/onboarding/new', rule: { module: 'Vendors', action: 'canCreate' } },
  { prefix: '/onboarding/queue', rule: { module: 'Vendors', action: 'canCreate' } },
  { prefix: '/signature', rule: { module: 'Documents', action: 'canView' } },
  { prefix: '/reports', rule: { module: 'Reports', action: 'canView' } },
  { prefix: '/audit', rule: { module: 'Audit Trail', action: 'canView' } },
  { prefix: '/procurement/purchase-requisition', rule: { module: 'Purchase Orders', action: 'canCreate' } },
  { prefix: '/contracts', rule: { module: 'Contracts', action: 'canView' } },
  { prefix: '/documents', rule: { module: 'Documents', action: 'canView' } },
  { prefix: '/notifications', rule: { module: 'Notifications', action: 'canView' } },
];

/** Menu item id → module permission */
export const MENU_ITEM_PERMISSIONS: Record<string, RoutePermissionRule> = {
  dashboard: { module: 'Dashboard', action: 'canView' },
  rfq: { module: 'RFQ', action: 'canView' },
  'rfq-list': { module: 'RFQ', action: 'canView' },
  'rfq-create': { module: 'RFQ', action: 'canCreate' },
  quotations: { module: 'Quotations', action: 'canView' },
  approvals: { module: 'Approvals', action: 'canView' },
  'accounts-payable': { module: 'Purchase Orders', action: 'canView' },
  payments: { module: 'Purchase Orders', action: 'canView' },
  'sales-orders': { module: 'Purchase Orders', action: 'canView' },
  vendors: { module: 'Vendors', action: 'canView' },
  'new-onboarding': { module: 'Vendors', action: 'canCreate' },
  'onboarding-queue': { module: 'Vendors', action: 'canCreate' },
  contracts: { module: 'Contracts', action: 'canView' },
  signature: { module: 'Documents', action: 'canView' },
  reports: { module: 'Reports', action: 'canView' },
  'audit-trail': { module: 'Audit Trail', action: 'canView' },
  users: { module: 'User Management', action: 'canView' },
  roles: { module: 'Roles & Permissions', action: 'canView' },
  'approval-levels': { module: 'Approval Levels', action: 'canView' },
  'company-settings': { module: 'User Management', action: 'canView' },
};

export function getRoutePermissionRule(pathname: string): RoutePermissionRule | null {
  const sorted = [...ROUTE_PERMISSION_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, rule } of sorted) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return rule;
    }
  }
  return null;
}

/** First internal page the user may open (for redirects) */
export const DEFAULT_LANDING_PATHS = [
  '/dashboard',
  '/rfq',
  '/quotations',
  '/approvals',
  '/vendors',
  '/documents',
  '/notifications',
  '/audit',
  '/admin/users',
];