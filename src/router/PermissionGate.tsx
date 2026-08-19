import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkRoutePermission, getFirstAllowedPath } from '../utils/permissions';
import { getRoutePermissionRule } from '../config/permissionRouting';
import { isAdmin, isVendor, NAVIGATION_MENU } from '../utils/rbac';
import { isRoleMatching } from '../services/formWorkflowService';

/**
 * Check if the current path is allowed by the user's role via NAVIGATION_MENU.
 * Used as fallback when permissions don't explicitly grant access.
 */
function hasRoleRouteAccess(pathname: string, roles: string[]): boolean {
  if (pathname === '/forms' || pathname.startsWith('/forms/') || pathname === '/profile' || pathname === '/notifications') {
    return true;
  }
  if (isAdmin(roles)) {
    return true;
  }

  // Normalize purchase-requisition route path matching
  const normalizedPath = pathname.startsWith('/procurement/purchase-requisition') 
    ? '/procurement/purchase-requisitions' 
    : pathname;

  for (const item of NAVIGATION_MENU) {
    if (normalizedPath.startsWith(item.path) && item.roles.some((r) => roles.some((ur) => isRoleMatching(r, ur)))) {
      return true;
    }
    if (item.children) {
      for (const child of item.children) {
        if (normalizedPath.startsWith(child.path) && child.roles.some((r) => roles.some((ur) => isRoleMatching(r, ur)))) {
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

  if (isVendor(roles) || isAdmin(roles)) {
    return <Outlet />;
  }

  const hasPermissionsMap = Boolean(permissions && Object.keys(permissions).length > 0);

  // DB permissions are authoritative when present!
  // Fall back to role navigation list ONLY if DB permissions are completely empty/unloaded.
  const isAllowed = hasPermissionsMap
    ? checkRoutePermission(permissions, location.pathname)
    : hasRoleRouteAccess(location.pathname, roles);

  if (!isAllowed) {
    const fallback = getFirstAllowedPath(permissions);
    if (location.pathname === fallback) {
      return <Outlet />;
    }
    console.warn('[PermissionGate] BLOCKED UNAUTHORIZED PAGE VIEW:', location.pathname, '→ Redirecting to:', fallback);
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
