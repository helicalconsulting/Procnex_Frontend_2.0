import type { PermissionField } from '../config/modulePermissions';
import {
  DEFAULT_LANDING_PATHS,
  getRoutePermissionRule,
  MENU_ITEM_PERMISSIONS,
  type RoutePermissionRule,
} from '../config/permissionRouting';

export interface ModulePermissionGrant {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canApprove: boolean;
}

export type UserPermissionsMap = Record<
  string,
  { canView: boolean; canCreate: boolean; canApprove: boolean }
>;

export function permissionsListToMap(
  list: ModulePermissionGrant[]
): UserPermissionsMap {
  const map: UserPermissionsMap = {};
  for (const p of list) {
    map[p.module] = {
      canView: p.canView,
      canCreate: p.canCreate,
      canApprove: p.canApprove,
    };
  }
  return map;
}

export function hasModulePermission(
  permissions: UserPermissionsMap | null | undefined,
  module: string,
  action: PermissionField = 'canView'
): boolean {
  if (module === 'Documents' || module === 'Notifications') return true;
  if (!permissions || Object.keys(permissions).length === 0) return false;
  if (Boolean(permissions[module]?.[action])) return true;

  const aliases: Record<string, string[]> = {
    'RFQ Management': ['RFQ Management', 'RFQ', 'RFQs', 'rfq'],
    RFQ: ['RFQ Management', 'RFQ', 'RFQs', 'rfq'],
    'PO Creation': ['PO Creation', 'Purchase Orders', 'PurchaseOrder', 'Purchase Order', 'PurchaseOrders', 'PO'],
    'Purchase Orders': ['PO Creation', 'Purchase Orders', 'PurchaseOrder', 'Purchase Order', 'PurchaseOrders', 'PO'],
    PurchaseOrder: ['PO Creation', 'Purchase Orders', 'PurchaseOrder', 'Purchase Order', 'PurchaseOrders', 'PO'],
    Contracts: ['Contracts', 'Contract'],
    Contract: ['Contracts', 'Contract'],
    'Create Purchase Invoice': ['Create Purchase Invoice', 'Accounts Payable', 'Purchase Invoice Approval', 'Approvals'],
    'Create Payment Voucher': ['Create Payment Voucher', 'Payments', 'Payment Voucher Approval', 'Approvals'],
    'Quotation Approval': ['Quotation Approval', 'Quotations', 'Quotation', 'QUOTATION'],
    Quotations: ['Quotation Approval', 'Quotations', 'Quotation', 'QUOTATION'],
    'Purchase Order Approval': ['Purchase Order Approval', 'Approvals', 'ApprovalManagement', 'Approval Management'],
    Approvals: ['Purchase Order Approval', 'Approvals', 'ApprovalManagement', 'Approval Management'],
    'Purchase Invoice Approval': ['Purchase Invoice Approval', 'Accounts Payable', 'AccountsPayable', 'Approvals'],
    'Accounts Payable': ['Purchase Invoice Approval', 'Accounts Payable', 'AccountsPayable', 'Approvals'],
    'Payment Voucher Approval': ['Payment Voucher Approval', 'Payments', 'PaymentVoucher', 'Approvals'],
    Payments: ['Payment Voucher Approval', 'Payments', 'PaymentVoucher', 'Approvals'],
    Vendors: ['Vendors', 'Vendor'],
    Vendor: ['Vendors', 'Vendor'],
    'New Onboarding': ['New Onboarding', 'Vendors', 'Vendor'],
    'Onboarding Queue': ['Onboarding Queue', 'Vendors', 'Vendor'],
    Signature: ['Signature', 'Documents'],
    'User Management': ['User Management', 'Users', 'UserManagement'],
    'Roles & Permissions': ['Roles & Permissions', 'Roles', 'RolesPermissions'],
    'Approval Levels': ['Approval Levels', 'ApprovalLevels'],
    'Company Settings': ['Company Settings', 'CompanySettings', 'User Management'],
    'Custom Form Builder': ['Custom Form Builder', 'CustomFormBuilder', 'User Management'],
    'Form Responses': ['Form Responses', 'FormResponses', 'User Management'],
  };

  const list = aliases[module] || [module, `${module}s`, module.replace(/s$/, '')];
  for (const m of list) {
    if (permissions[m]?.[action]) return true;
  }

  return false;
}

export function checkRoutePermission(
  permissions: UserPermissionsMap | null | undefined,
  pathname: string
): boolean {
  const rule = getRoutePermissionRule(pathname);
  if (!rule) return true;
  return hasModulePermission(permissions, rule.module, rule.action ?? 'canView');
}

export function checkMenuItemPermission(
  permissions: UserPermissionsMap | null | undefined,
  itemId: string
): boolean {
  const rule = MENU_ITEM_PERMISSIONS[itemId];
  if (!rule) return true;
  return hasModulePermission(permissions, rule.module, rule.action ?? 'canView');
}

export function getFirstAllowedPath(
  permissions: UserPermissionsMap | null | undefined
): string {
  if (!permissions) return '/dashboard';
  for (const path of DEFAULT_LANDING_PATHS) {
    if (checkRoutePermission(permissions, path)) return path;
  }
  return '/dashboard';
}

export function getMenuPermissionRule(itemId: string): RoutePermissionRule | undefined {
  return MENU_ITEM_PERMISSIONS[itemId];
}
