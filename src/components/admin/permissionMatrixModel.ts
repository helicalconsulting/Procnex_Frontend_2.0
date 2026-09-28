import { MODULE_CAPABILITIES, moduleSupports, sanitizeModulePermission, type ModulePermissionRow, type PermissionField } from '../../config/modulePermissions';

export const PERMISSION_FIELDS: PermissionField[] = ['canView', 'canCreate', 'canApprove'];
export const PERMISSION_LABELS: Record<PermissionField, string> = { canView: 'View', canCreate: 'Create', canApprove: 'Approve' };
export const PERMISSION_GROUPS = [
  { name: 'Overview', modules: ['Dashboard'] },
  { name: 'Procurement', modules: ['RFQ Management', 'PO Creation', 'Contracts', 'Create Purchase Invoice', 'Create Payment Voucher'] },
  { name: 'Approvals', modules: ['Quotation Approval', 'Purchase Order Approval', 'Purchase Invoice Approval', 'Payment Voucher Approval'] },
  { name: 'Governance', modules: ['Vendors', 'New Onboarding', 'Onboarding Queue', 'Signature', 'Reports', 'Audit Trail'] },
  { name: 'Administration', modules: ['User Management', 'Roles & Permissions', 'Approval Levels', 'Company Settings', 'Custom Form Builder', 'Form Responses'] },
];

/** Applied when editing/submitting: dependent actions always require View. */
export function normalizePermissions(rows: ModulePermissionRow[]): ModulePermissionRow[] {
  return rows.map(row => {
    const supported = sanitizeModulePermission(row);
    return { ...supported, canView: supported.canView || supported.canCreate || supported.canApprove };
  });
}

export function setPermission(rows: ModulePermissionRow[], module: string, field: PermissionField, granted: boolean): ModulePermissionRow[] {
  if (!moduleSupports(module, field)) return rows;
  return rows.map(row => {
    if (row.module !== module) return row;
    const next = sanitizeModulePermission({ ...row, [field]: granted });
    if (field === 'canView' && !granted) return { ...next, canCreate: false, canApprove: false };
    if (granted && field !== 'canView') next.canView = true;
    return next;
  });
}

/** Bulk scope is explicit; filtered-out modules are never modified. */
export function setPermissionScope(rows: ModulePermissionRow[], modules: string[], granted: boolean, field?: PermissionField): ModulePermissionRow[] {
  const scope = new Set(modules);
  if (field) return modules.reduce((next, module) => setPermission(next, module, field, granted), rows);
  return rows.map(row => scope.has(row.module)
    ? sanitizeModulePermission({ module: row.module, canView: granted, canCreate: granted, canApprove: granted })
    : row);
}

export function permissionSelection(rows: ModulePermissionRow[], field?: PermissionField) {
  const values = rows.flatMap(row => (field ? [field] : PERMISSION_FIELDS)
    .filter(key => moduleSupports(row.module, key)).map(key => row[key]));
  const granted = values.filter(Boolean).length;
  return { granted, total: values.length, all: values.length > 0 && granted === values.length, mixed: granted > 0 && granted < values.length };
}

export function permissionChanges(before: ModulePermissionRow[], after: ModulePermissionRow[]) {
  return after.reduce((count, row) => {
    const original = before.find(p => p.module === row.module);
    return count + PERMISSION_FIELDS.filter(field => moduleSupports(row.module, field) && Boolean(original?.[field]) !== row[field]).length;
  }, 0);
}

/** Missing permissions deny access; only Super Admin has unconditional full access. */
export function rolePermissionRows(rows: ModulePermissionRow[] = [], fullAccess = false): ModulePermissionRow[] {
  return MODULE_CAPABILITIES.map(({ module }) => sanitizeModulePermission(
    fullAccess ? { module, canView: true, canCreate: true, canApprove: true }
      : rows.find(row => row.module === module) ?? { module, canView: false, canCreate: false, canApprove: false }
  ));
}

export function duplicateRoleName(name: string, existingNames: string[]) {
  return existingNames.some(existing => existing.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
}
