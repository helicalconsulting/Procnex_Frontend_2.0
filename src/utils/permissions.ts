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
    'Dashboard': ['Dashboard'],
    'RFQ Management': ['RFQ Management', 'RFQ', 'RFQs', 'rfq'],
    RFQ: ['RFQ Management', 'RFQ', 'RFQs', 'rfq'],
    'PO Creation': ['PO Creation', 'Purchase Orders', 'PurchaseOrder', 'Purchase Order', 'PurchaseOrders', 'PO', 'GRN', 'Goods Received Note'],
    'Purchase Orders': ['PO Creation', 'Purchase Orders', 'PurchaseOrder', 'Purchase Order', 'PurchaseOrders', 'PO', 'GRN', 'Goods Received Note'],
    PurchaseOrder: ['PO Creation', 'Purchase Orders', 'PurchaseOrder', 'Purchase Order', 'PurchaseOrders', 'PO', 'GRN', 'Goods Received Note'],
    'GRN Entry & Management': ['PO Creation', 'Goods Received Note', 'GRN', 'Purchase Orders'],
    'Goods Received Note': ['PO Creation', 'Goods Received Note', 'GRN', 'Purchase Orders'],
    GRN: ['PO Creation', 'Goods Received Note', 'GRN', 'Purchase Orders'],
    Contracts: ['Contracts', 'Contract'],
    Contract: ['Contracts', 'Contract'],
    'Create Purchase Invoice': ['Create Purchase Invoice'],
    'Create Payment Voucher': ['Create Payment Voucher'],
    'Quotation Approval': ['Quotation Approval', 'Quotations', 'Quotation', 'QUOTATION'],
    Quotations: ['Quotation Approval', 'Quotations', 'Quotation', 'QUOTATION'],
    'Purchase Order Approval': ['Purchase Order Approval', 'Approvals', 'ApprovalManagement', 'Approval Management'],
    Approvals: ['Purchase Order Approval', 'Approvals', 'ApprovalManagement', 'Approval Management'],
    'Purchase Invoice Approval': ['Purchase Invoice Approval', 'Accounts Payable', 'AccountsPayable'],
    'Accounts Payable': ['Purchase Invoice Approval', 'Accounts Payable', 'AccountsPayable'],
    'Payment Voucher Approval': ['Payment Voucher Approval', 'Payments', 'PaymentVoucher'],
    Payments: ['Payment Voucher Approval', 'Payments', 'PaymentVoucher'],
    Vendors: ['Vendors', 'Vendor'],
    Vendor: ['Vendors', 'Vendor'],
    'New Onboarding': ['New Onboarding'],
    'Onboarding Queue': ['Onboarding Queue'],
    Signature: ['Signature', 'Digital Signatures', 'Digital Signature', 'Signatures', 'Documents'],
    'Digital Signatures': ['Signature', 'Digital Signatures', 'Digital Signature', 'Signatures', 'Documents'],
    'Digital Signature': ['Signature', 'Digital Signatures', 'Digital Signature', 'Signatures', 'Documents'],
    Signatures: ['Signature', 'Digital Signatures', 'Digital Signature', 'Signatures', 'Documents'],
    Reports: ['Reports'],
    'Audit Trail': ['Audit Trail'],
    'User Management': ['User Management', 'Users', 'UserManagement'],
    'Roles & Permissions': ['Roles & Permissions', 'Roles', 'RolesPermissions'],
    'Approval Levels': ['Approval Levels', 'ApprovalLevels'],
    'Company Settings': ['Company Settings', 'CompanySettings'],
    'Custom Form Builder': ['Custom Form Builder', 'CustomFormBuilder'],
    'Form Responses': ['Form Responses', 'FormResponses'],
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
