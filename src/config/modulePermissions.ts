/** Which permission actions apply to each app module (RBAC matrix). */

export type PermissionField = 'canView' | 'canCreate' | 'canApprove';

export interface ModuleCapability {
  module: string;
  /** Short hint shown under module name in the matrix */
  hint: string;
  supports: PermissionField[];
}

export const MODULE_CAPABILITIES: ModuleCapability[] = [
  { module: 'Dashboard', hint: 'Read-only', supports: ['canView'] },
  { module: 'RFQ', hint: 'Create & send RFQs', supports: ['canView', 'canCreate', 'canApprove'] },
  { module: 'Quotations', hint: 'Review vendor quotes', supports: ['canView', 'canApprove'] },
  { module: 'Purchase Orders', hint: 'PO lifecycle', supports: ['canView', 'canCreate', 'canApprove'] },
  { module: 'Vendors', hint: 'Vendor directory', supports: ['canView', 'canCreate'] },
  { module: 'Approvals', hint: 'Approval inbox', supports: ['canView', 'canApprove'] },
  { module: 'Documents', hint: 'Upload & browse files', supports: ['canView', 'canCreate'] },
  { module: 'Notifications', hint: 'Read alerts', supports: ['canView'] },
  { module: 'Audit Trail', hint: 'Read-only log', supports: ['canView'] },
  { module: 'User Management', hint: 'Manage users', supports: ['canView', 'canCreate'] },
  { module: 'Roles & Permissions', hint: 'Configure roles', supports: ['canView', 'canCreate'] },
  { module: 'Approval Levels', hint: 'Approval chains', supports: ['canView', 'canCreate'] },
  { module: 'Contracts', hint: 'Contract lifecycle management', supports: ['canView', 'canCreate', 'canApprove'] },
  { module: 'Reports', hint: 'View reports & analytics', supports: ['canView'] },
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
