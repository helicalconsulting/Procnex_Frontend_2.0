/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService';
import type { User, LoginPayload, UserModulePermission } from '../types';
import type { PermissionField } from '../config/modulePermissions';
import {
  hasModulePermission,
  permissionsListToMap,
  type UserPermissionsMap,
} from '../utils/permissions';

interface AuthContextType {
  user: User | null;
  roles: string[];
  permissions: UserPermissionsMap;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  vendorLogin: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasPermission: (module: string, action?: PermissionField) => boolean;
}

// ✅ export add kiya — useAuth.ts ko chahiye
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage cache for instant availability
  const [user, setUser] = useState<User | null>(() => authService.getCachedSession()?.user ?? null);
  const [roles, setRoles] = useState<string[]>(() => authService.getCachedSession()?.roles ?? []);
  const [permissions, setPermissions] = useState<UserPermissionsMap>(() => {
    const cached = authService.getCachedSession();
    return cached?.permissions?.length ? permissionsListToMap(cached.permissions) : {};
  });
  const [isLoading, setIsLoading] = useState(() => !authService.getCachedSession());

  const applySession = useCallback((session: {
    user: User;
    roles: string[];
    permissions?: { module: string; canView: boolean; canCreate: boolean; canApprove: boolean }[];
  }) => {
    setUser(session.user);
    setRoles(session.roles);
    setPermissions(
      session.permissions?.length ? permissionsListToMap(session.permissions) : {}
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        // Step 1: If localStorage has the old mock token, silently upgrade to a real JWT
        const migrated = await authService.migrateMockToken();
        if (migrated && !cancelled) {
          applySession(migrated);
          return;
        }

        // Step 2: Normal session restore
        const session = await authService.getCurrentUser();
        if (session && !cancelled) applySession(session);
      } catch {
        authService.clearSession();
        setUser(null);
        setRoles([]);
        setPermissions({});
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    restoreSession();

    const handleAuthChange = () => {
      authService.getCurrentUser().then((session) => {
        if (session && !cancelled) applySession(session);
      }).catch(() => {});
    };

    window.addEventListener('heliflow_auth_change', handleAuthChange);

    return () => {
      cancelled = true;
      window.removeEventListener('heliflow_auth_change', handleAuthChange);
    };
  }, [applySession]);

  const login = useCallback(async (payload: LoginPayload) => {
    const data = await authService.login(payload);
    applySession(data);
  }, [applySession]);

  const vendorLogin = useCallback(async (payload: LoginPayload) => {
    const data = await authService.vendorLogin(payload);
    applySession(data);
  }, [applySession]);

  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    await authService.logout();
    // Clear ALL React Query cache to prevent stale vendor data from
    // showing when a different vendor logs in from the same browser session.
    queryClient.clear();
    setUser(null);
    setRoles([]);
    setPermissions({});
  }, [queryClient]);

  const hasPermission = useCallback(
    (module: string, action: PermissionField = 'canView') =>
      hasModulePermission(permissions, module, action),
    [permissions]
  );

  const hasRole = useCallback(
    (role: string) => roles.includes(role),
    [roles]
  );

  const hasAnyRole = useCallback(
    (requiredRoles: string[]) =>
      requiredRoles.some((role) => roles.includes(role)),
    [roles]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        permissions,
        isAuthenticated: !!user,
        isLoading,
        login,
        vendorLogin,
        logout,
        hasRole,
        hasAnyRole,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Backward-compatible re-export ──────────────────────────
// Existing imports like:
//   import { useAuth } from '../context/AuthContext'
// will still work — nothing breaks in the rest of the codebase.
export { useAuth } from '../hooks/useAuth';
