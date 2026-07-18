/**
 * Custom Hooks for RBAC and Approval Workflow
 */

import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  canView,
  canCreate,
  canApprove,
  getModulePermission,
  isVendor,
  isAdmin,
  hasApprovalRole,
  getAccessibleMenuItems,
  getVendorAccessibleMenuItems,
  type ModulePermission,
} from '../utils/rbac';
import { useApprovalWorkflow, canEdit } from './useApprovalWorkflow';

export { useApprovalWorkflow, canEdit };

// ─── Hook: useRoleAccess ────────────────────────────────────

export function useRoleAccess() {
  const { roles, permissions, hasPermission } = useAuth();

  return useCallback(
    (module: string) => {
      if (permissions && Object.keys(permissions).length > 0) {
        return {
          canView: hasPermission(module, 'canView'),
          canCreate: hasPermission(module, 'canCreate'),
          canApprove: hasPermission(module, 'canApprove'),
          canEdit: hasPermission(module, 'canCreate'),
        };
      }
      return {
        canView: canView(roles, module),
        canCreate: canCreate(roles, module),
        canApprove: canApprove(roles, module),
        canEdit: canEdit(roles, module),
      };
    },
    [roles, permissions, hasPermission]
  );
}

// ─── Hook: useModulePermission ──────────────────────────────

export function useModulePermission(module: string): ModulePermission {
  const { roles, permissions: userPerms } = useAuth();

  if (userPerms && Object.keys(userPerms).length > 0) {
    const p = userPerms[module];
    return {
      canView: Boolean(p?.canView),
      canCreate: Boolean(p?.canCreate),
      canApprove: Boolean(p?.canApprove),
      canEdit: Boolean(p?.canCreate),
      canDelete: false,
    };
  }

  if (!roles || roles.length === 0) {
    return {
      canView: false,
      canCreate: false,
      canApprove: false,
      canEdit: false,
      canDelete: false,
    };
  }

  const legacy = roles.map((role) => getModulePermission(role, module));
  return {
    canView: legacy.some((p) => p.canView),
    canCreate: legacy.some((p) => p.canCreate),
    canApprove: legacy.some((p) => p.canApprove),
    canEdit: legacy.some((p) => p.canEdit),
    canDelete: legacy.some((p) => p.canDelete),
  };
}

// ─── Hook: useRoleCheck ─────────────────────────────────────

export function useRoleCheck() {
  const { roles } = useAuth();

  return {
    isVendor: () => isVendor(roles),
    isAdmin: () => isAdmin(roles),
    hasApprovalRole: () => hasApprovalRole(roles),
    hasRole: (role: string) => roles.includes(role),
    hasAnyRole: (requiredRoles: string[]) => requiredRoles.some((r) => roles.includes(r)),
  };
}

// ─── Hook: useNavigationMenu ────────────────────────────────

export function useNavigationMenu() {
  const { roles, permissions } = useAuth();
  const roleCheck = useRoleCheck();

  const menu = roleCheck.isVendor()
    ? getVendorAccessibleMenuItems(roles)
    : getAccessibleMenuItems(roles, permissions);

  return menu;
}

// useApprovalWorkflow is in ./useApprovalWorkflow.ts
