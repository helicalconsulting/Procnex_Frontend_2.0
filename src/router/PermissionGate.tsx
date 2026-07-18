import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkRoutePermission, getFirstAllowedPath } from '../utils/permissions';
import { isVendor } from '../utils/rbac';

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

  if (!checkRoutePermission(permissions, location.pathname)) {
    const fallback = getFirstAllowedPath(permissions);
    if (location.pathname === fallback) {
      return <Outlet />;
    }
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
