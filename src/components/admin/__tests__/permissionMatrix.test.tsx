import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDefaultPermissions, MODULE_CAPABILITIES, moduleSupports } from '../../../config/modulePermissions';
import PermissionMatrix from '../PermissionMatrix';
import { duplicateRoleName, normalizePermissions, permissionChanges, permissionSelection, PERMISSION_FIELDS, PERMISSION_GROUPS, rolePermissionRows, setPermission, setPermissionScope } from '../permissionMatrixModel';

const empty = () => buildDefaultPermissions();
const modules = MODULE_CAPABILITIES.map(row => row.module);
const row = (rows: ReturnType<typeof empty>, module: string) => rows.find(p => p.module === module)!;

describe('permission dependencies and bulk scopes', () => {
  it.each(['canCreate', 'canApprove'] as const)('granting %s includes View; revoking View clears dependents', field => {
    const granted = setPermission(empty(), 'RFQ Management', field, true);
    expect(row(granted, 'RFQ Management').canView).toBe(true);
    expect(row(granted, 'RFQ Management')[field]).toBe(true);
    expect(row(setPermission(granted, 'RFQ Management', 'canView', false), 'RFQ Management')).toEqual({ module: 'RFQ Management', canView: false, canCreate: false, canApprove: false });
  });
  it('revoking one action retains View and the other action', () => {
    const granted = setPermissionScope(empty(), ['RFQ Management'], true);
    expect(row(setPermission(granted, 'RFQ Management', 'canCreate', false), 'RFQ Management')).toEqual({ module: 'RFQ Management', canView: true, canCreate: false, canApprove: true });
  });
  it('Grant all grants exactly the supported actions, including backend-supported contract approval', () => {
    const all = setPermissionScope(empty(), modules, true);
    expect(permissionSelection(all)).toEqual({ granted: 42, total: 42, all: true, mixed: false });
    for (const permission of all) for (const field of PERMISSION_FIELDS) expect(permission[field]).toBe(moduleSupports(permission.module, field));
    expect(row(all, 'Contracts').canApprove).toBe(true);
    expect(permissionSelection(setPermissionScope(all, modules, false)).granted).toBe(0);
  });
  it('filtered/group operations leave everything outside their scope untouched', () => {
    const initial = setPermission(empty(), 'Dashboard', 'canView', true);
    const scope = PERMISSION_GROUPS.find(group => group.name === 'Approvals')!.modules;
    const result = setPermissionScope(initial, scope, true);
    for (const p of initial.filter(p => !scope.includes(p.module))) expect(row(result, p.module)).toBe(p);
    expect(row(result, 'Dashboard').canView).toBe(true);
    expect(permissionSelection(result.filter(p => scope.includes(p.module))).all).toBe(true);
    const filtered = setPermissionScope(result, ['Quotation Approval'], false);
    expect(row(filtered, 'Purchase Order Approval').canApprove).toBe(true);
    expect(row(filtered, 'Quotation Approval').canApprove).toBe(false);
  });
  it('column grants enforce dependencies and column View revocation clears only scoped actions', () => {
    const granted = setPermissionScope(empty(), modules, true, 'canApprove');
    expect(permissionSelection(granted, 'canApprove').all).toBe(true);
    expect(row(granted, 'Dashboard').canView).toBe(false);
    const cleared = setPermissionScope(granted, ['Contracts'], false, 'canView');
    expect(row(cleared, 'Contracts').canApprove).toBe(false);
    expect(row(cleared, 'RFQ Management').canApprove).toBe(true);
  });
  it('unsupported and empty bulk actions do not create grants', () => {
    const initial = empty();
    expect(setPermission(initial, 'Dashboard', 'canApprove', true)).toBe(initial);
    expect(setPermissionScope(initial, [], true)).toEqual(initial);
    expect(permissionSelection([], 'canCreate')).toEqual({ granted: 0, total: 0, all: false, mixed: false });
  });
  it('reports mixed selection and exact changes, including dependencies', () => {
    const initial = empty();
    const granted = setPermission(initial, 'RFQ Management', 'canCreate', true);
    expect(permissionSelection(granted).mixed).toBe(true);
    expect(permissionChanges(initial, granted)).toBe(2);
    expect(permissionChanges(initial, setPermission(granted, 'RFQ Management', 'canView', false))).toBe(0);
    expect(permissionSelection(initial).granted).toBe(0);
  });
  it('normalizes invalid saved combinations before submitting', () => {
    const invalid = [{ module: 'RFQ Management', canView: false, canCreate: true, canApprove: false }, { module: 'Dashboard', canView: false, canCreate: true, canApprove: true }];
    const normalized = normalizePermissions(invalid);
    expect(normalized[0].canView).toBe(true);
    expect(normalized[1]).toEqual({ module: 'Dashboard', canView: false, canCreate: false, canApprove: false });
    expect(normalizePermissions(normalized)).toEqual(normalized);
  });
  it('each configured module belongs to exactly one section', () => {
    const grouped = PERMISSION_GROUPS.flatMap(group => group.modules);
    expect(grouped.length).toBe(new Set(grouped).size);
    expect([...grouped].sort()).toEqual([...modules].sort());
  });
  it('missing role grants deny access; protected full access includes only supported actions', () => {
    expect(permissionSelection(rolePermissionRows()).granted).toBe(0);
    expect(permissionSelection(rolePermissionRows([], true)).all).toBe(true);
    const supplied = [{ module: 'Dashboard', canView: true, canCreate: false, canApprove: false }];
    expect(permissionSelection(rolePermissionRows(supplied)).granted).toBe(1);
  });
  it('duplicate names compare case-insensitively with trimmed whitespace', () => {
    expect(duplicateRoleName(' PURCHASE manager ', ['Purchase Manager'])).toBe(true);
    expect(duplicateRoleName('Store Keeper', ['Purchase Manager'])).toBe(false);
  });
});

describe('shared permission matrix semantics', () => {
  it('read mode exposes checkboxes but no editing or bulk controls', () => {
    const html = renderToStaticMarkup(<PermissionMatrix permissions={rolePermissionRows([], true)} editable={false} />);
    expect((html.match(/type="checkbox"/g) ?? [])).toHaveLength(42);
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(42);
    expect(html).not.toContain('Grant all');
    expect(html).toContain('Approve not available for Dashboard');
    expect(html).toContain('Approve permission for Contracts');
  });
  it('edit mode provides the same checkbox controls and mixed column headers', () => {
    const permissions = setPermission(empty(), 'RFQ Management', 'canCreate', true);
    const html = renderToStaticMarkup(<PermissionMatrix permissions={permissions} editable />);
    expect((html.match(/type="checkbox"/g) ?? [])).toHaveLength(45);
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain('Grant all Procurement permissions');
    expect(html).toContain('Revoke all');
  });
});
