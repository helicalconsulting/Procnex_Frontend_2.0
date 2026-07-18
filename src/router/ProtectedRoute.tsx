import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isVendor } from '../utils/rbac';

interface ProtectedRouteProps {
  allowedRoles?: string[];
  requireVendor?: boolean;
}

export function ProtectedRoute({ allowedRoles, requireVendor }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasAnyRole, roles } = useAuth();

  // Show nothing while checking session (prevents flash)
  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__spinner" />
      </div>
    );
  }

  // Not logged in → redirect to appropriate login
  if (!isAuthenticated) {
    if (requireVendor) {
      return <Navigate to="/vendor/login" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  // Check if vendor portal route
  if (requireVendor) {
    if (!isVendor(roles)) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Outlet />;
  }

  // Logged in but wrong role → redirect to dashboard
  if (allowedRoles && !hasAnyRole(allowedRoles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
