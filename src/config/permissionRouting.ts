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
  { prefix: '/rfq/create', rule: { module: 'RFQ Management', action: 'canCreate' } },
  { prefix: '/rfq/edit', rule: { module: 'RFQ Management', action: 'canCreate' } },
  { prefix: '/admin/users', rule: { module: 'User Management', action: 'canView' } },
  { prefix: '/admin/roles-permissions', rule: { module: 'Roles & Permissions', action: 'canView' } },
  { prefix: '/admin/company-settings', rule: { module: 'Company Settings', action: 'canView' } },
  { prefix: '/admin/approval-levels', rule: { module: 'Approval Levels', action: 'canView' } },
  { prefix: '/admin/custom-form-builder', rule: { module: 'Custom Form Builder', action: 'canView' } },
  { prefix: '/admin/form-responses', rule: { module: 'Form Responses', action: 'canView' } },
  { prefix: '/dashboard', rule: { module: 'Dashboard', action: 'canView' } },
  { prefix: '/rfq', rule: { module: 'RFQ Management', action: 'canView' } },
  { prefix: '/quotations', rule: { module: 'Quotation Approval', action: 'canView' } },
  { prefix: '/approvals', rule: { module: 'Purchase Order Approval', action: 'canView' } },
  { prefix: '/accounts-payable', rule: { module: 'Purchase Invoice Approval', action: 'canView' } },
  { prefix: '/payments', rule: { module: 'Payment Voucher Approval', action: 'canView' } },
  { prefix: '/procurement/create-purchase-invoice', rule: { module: 'Create Purchase Invoice', action: 'canView' } },
  { prefix: '/procurement/create-payment-voucher', rule: { module: 'Create Payment Voucher', action: 'canView' } },
  { prefix: '/sales-orders', rule: { module: 'Purchase Order Approval', action: 'canView' } },
  { prefix: '/vendors', rule: { module: 'Vendors', action: 'canView' } },
  { prefix: '/onboarding/new', rule: { module: 'New Onboarding', action: 'canView' } },
  { prefix: '/onboarding/queue', rule: { module: 'Onboarding Queue', action: 'canView' } },
  { prefix: '/signature', rule: { module: 'Signature', action: 'canView' } },
  { prefix: '/reports', rule: { module: 'Reports', action: 'canView' } },
  { prefix: '/audit', rule: { module: 'Audit Trail', action: 'canView' } },
  { prefix: '/procurement/purchase-requisitions', rule: { module: 'PO Creation', action: 'canView' } },
  { prefix: '/procurement/purchase-requisition', rule: { module: 'PO Creation', action: 'canView' } },
  { prefix: '/contracts', rule: { module: 'Contracts', action: 'canView' } },
];

/** Menu item id → module permission */
export const MENU_ITEM_PERMISSIONS: Record<string, RoutePermissionRule> = {
  dashboard: { module: 'Dashboard', action: 'canView' },
  rfq: { module: 'RFQ Management', action: 'canView' },
  'rfq-list': { module: 'RFQ Management', action: 'canView' },
  'rfq-create': { module: 'RFQ Management', action: 'canCreate' },
  'purchase-requisitions': { module: 'PO Creation', action: 'canView' },
  contracts: { module: 'Contracts', action: 'canView' },
  'create-purchase-invoice': { module: 'Create Purchase Invoice', action: 'canView' },
  'create-payment-voucher': { module: 'Create Payment Voucher', action: 'canView' },
  quotations: { module: 'Quotation Approval', action: 'canView' },
  approvals: { module: 'Purchase Order Approval', action: 'canView' },
  'accounts-payable': { module: 'Purchase Invoice Approval', action: 'canView' },
  payments: { module: 'Payment Voucher Approval', action: 'canView' },
  vendors: { module: 'Vendors', action: 'canView' },
  'new-onboarding': { module: 'New Onboarding', action: 'canView' },
  'onboarding-queue': { module: 'Onboarding Queue', action: 'canView' },
  signature: { module: 'Signature', action: 'canView' },
  reports: { module: 'Reports', action: 'canView' },
  'audit-trail': { module: 'Audit Trail', action: 'canView' },
  users: { module: 'User Management', action: 'canView' },
  roles: { module: 'Roles & Permissions', action: 'canView' },
  'approval-levels': { module: 'Approval Levels', action: 'canView' },
  'company-settings': { module: 'Company Settings', action: 'canView' },
  'custom-form-builder': { module: 'Custom Form Builder', action: 'canView' },
  'form-responses': { module: 'Form Responses', action: 'canView' },
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