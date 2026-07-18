import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

interface AuthContextType {
  user: import('../types').User | null;
  roles: string[];
  permissions: import('../utils/permissions').UserPermissionsMap;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: import('../types').LoginPayload) => Promise<void>;
  vendorLogin: (payload: import('../types').LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasPermission: (module: string, action?: import('../config/modulePermissions').PermissionField) => boolean;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context as AuthContextType;
}