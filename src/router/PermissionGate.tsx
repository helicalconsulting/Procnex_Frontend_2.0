import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkRoutePermission, getFirstAllowedPath } from '../utils/permissions';
import { getRoutePermissionRule } from '../config/permissionRouting';
import { isVendor, NAVIGATION_MENU } from '../utils/rbac';

/**
 * Check if the current path is allowed by the user's role via NAVIGATION_MENU.
 * Used as fallback when permissions don't explicitly grant access.
 */
function hasRoleRouteAccess(pathname: string, roles: string[]): boolean {
  if (pathname === '/forms' || pathname.startsWith('/forms/')) return true;
  // Non-vendor internal employees with valid app access should not be blocked by static role lists
  if (!isVendor(roles)) return true;
  // Normalize purchase-requisition route path matching
  const normalizedPath = pathname.startsWith('/procurement/purchase-requisition') 
    ? '/procurement/purchase-requisitions' 
    : pathname;
  for (const item of NAVIGATION_MENU) {
    // Check the item's path
    if (normalizedPath.startsWith(item.path) && item.roles.some((r) => roles.includes(r))) {
      return true;
    }
    // Check children paths
    if (item.children) {
      for (const child of item.children) {
        if (normalizedPath.startsWith(child.path) && child.roles.some((r) => roles.includes(r))) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Blocks routes when the logged-in user's merged permissions deny access */
export function PermissionGate() {
  const { permissions, roles, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isVendor(roles)) {
    return <Outlet />;
  }

  if (!permissions || Object.keys(permissions).length === 0) {
    return <Outlet />;
  }

  // ── Debug: log permission check for contracts ──
  if (location.pathname.startsWith('/contracts')) {
    const routeRule = getRoutePermissionRule(location.pathname);
    const hasContractView = permissions['Contracts']?.canView;
    console.log('[PermissionGate] Path:', location.pathname);
    console.log('[PermissionGate] Route rule:', routeRule);
    console.log('[PermissionGate] permissions keys:', Object.keys(permissions));
    console.log('[PermissionGate] permissions["Contracts"]:', permissions['Contracts']);
    console.log('[PermissionGate] hasContractView:', hasContractView);
    console.log('[PermissionGate] roles:', roles);
    console.log('[PermissionGate] checkRoutePermission:', checkRoutePermission(permissions, location.pathname));
  }

  // Check permission-based access, fall back to role-based route access
  if (!checkRoutePermission(permissions, location.pathname)) {
    // Role-based fallback: if user's role grants access via NAVIGATION_MENU, allow
    if (hasRoleRouteAccess(location.pathname, roles)) {
      return <Outlet />;
    }
    const fallback = getFirstAllowedPath(permissions);
    if (location.pathname === fallback) {
      return <Outlet />;
    }
    console.log('[PermissionGate] BLOCKED', location.pathname, '→ redirecting to', fallback);
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
