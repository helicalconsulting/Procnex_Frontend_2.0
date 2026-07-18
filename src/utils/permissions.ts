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
  if (!permissions || Object.keys(permissions).length === 0) return false;
  return Boolean(permissions[module]?.[action]);
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
