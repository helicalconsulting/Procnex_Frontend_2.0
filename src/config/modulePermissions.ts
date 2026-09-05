/** Which permission actions apply to each app module (RBAC matrix). */

export type PermissionField = 'canView' | 'canCreate' | 'canApprove';

export interface ModuleCapability {
  module: string;
  /** Short hint shown under module name in the matrix */
  hint: string;
  supports: PermissionField[];
}

export const MODULE_CAPABILITIES: ModuleCapability[] = [
  { module: 'Dashboard', hint: 'Read-only dashboard overview', supports: ['canView'] },
  { module: 'RFQ Management', hint: 'Create & send RFQs', supports: ['canView', 'canCreate', 'canApprove'] },
  { module: 'PO Creation', hint: 'Purchase Requisition & PO creation', supports: ['canView', 'canCreate'] },
  { module: 'Contracts', hint: 'Contract lifecycle management', supports: ['canView', 'canCreate'] },
  { module: 'Create Purchase Invoice', hint: 'Create purchase invoices', supports: ['canView', 'canCreate'] },
  { module: 'Create Payment Voucher', hint: 'Create payment vouchers', supports: ['canView', 'canCreate'] },
  { module: 'Quotation Approval', hint: 'Review & approve vendor quotes', supports: ['canView', 'canApprove'] },
  { module: 'Purchase Order Approval', hint: 'Approval inbox for purchase orders', supports: ['canView', 'canApprove'] },
  { module: 'Purchase Invoice Approval', hint: 'Approval inbox for purchase invoices', supports: ['canView', 'canApprove'] },
  { module: 'Payment Voucher Approval', hint: 'Approval inbox for payment vouchers', supports: ['canView', 'canApprove'] },
  { module: 'Vendors', hint: 'Vendor directory & management', supports: ['canView', 'canCreate'] },
  { module: 'New Onboarding', hint: 'Initiate vendor onboarding', supports: ['canView', 'canCreate'] },
  { module: 'Onboarding Queue', hint: 'Review onboarding applications', supports: ['canView', 'canApprove'] },
  { module: 'Signature', hint: 'Digital signature management', supports: ['canView', 'canCreate'] },
  { module: 'Reports', hint: 'View reports & analytics', supports: ['canView'] },
  { module: 'Audit Trail', hint: 'Read-only audit log', supports: ['canView'] },
  { module: 'User Management', hint: 'Manage user accounts', supports: ['canView', 'canCreate'] },
  { module: 'Roles & Permissions', hint: 'Configure RBAC roles & access', supports: ['canView', 'canCreate'] },
  { module: 'Approval Levels', hint: 'Configure approval chains', supports: ['canView', 'canCreate'] },
  { module: 'Company Settings', hint: 'Company profile & settings', supports: ['canView', 'canCreate'] },
  { module: 'Custom Form Builder', hint: 'Build custom forms', supports: ['canView', 'canCreate'] },
  { module: 'Form Responses', hint: 'View form submissions', supports: ['canView'] },
];

export const PERMISSION_MODULE_NAMES = MODULE_CAPABILITIES.map((m) => m.module);

export function getModuleCapability(module: string): ModuleCapability {
  return (
    MODULE_CAPABILITIES.find((m) => m.module === module) ?? {
      module,
      hint: '',
      supports: ['canView'],
    }
  );
}

export function moduleSupports(module: string, field: PermissionField): boolean {
  return getModuleCapability(module).supports.includes(field);
}

export interface ModulePermissionRow {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canApprove: boolean;
}

/** Force create/approve off when the module does not support them. */
export function sanitizeModulePermission(perm: ModulePermissionRow): ModulePermissionRow {
  const cap = getModuleCapability(perm.module);
  return {
    module: perm.module,
    canView: cap.supports.includes('canView') ? perm.canView : false,
    canCreate: cap.supports.includes('canCreate') ? perm.canCreate : false,
    canApprove: cap.supports.includes('canApprove') ? perm.canApprove : false,
  };
}

export function buildDefaultPermissions(
  defaults?: Partial<Record<PermissionField, boolean>>
): ModulePermissionRow[] {
  const d = { canView: false, canCreate: false, canApprove: false, ...defaults };
  return PERMISSION_MODULE_NAMES.map((module) => sanitizeModulePermission({ module, ...d }));
}

export function countGrantedPermissions(perms: ModulePermissionRow[]): {
  granted: number;
  applicable: number;
} {
  let granted = 0;
  let applicable = 0;
  for (const p of perms) {
    const cap = getModuleCapability(p.module);
    for (const field of cap.supports) {
      applicable++;
      if (p[field]) granted++;
    }
  }
  return { granted, applicable };
}
