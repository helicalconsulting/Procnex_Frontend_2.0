import { USE_MOCK } from '../config/mock';
import { ALL_MOCK_USERS, MOCK_TOKEN } from '../config/mockData';
import { apiRequest, API_BASE, authHeaders, ApiError, clearAllApiCache } from '../api/client';
import type { AuthResponse, LoginPayload, UserModulePermission } from '../types';
import { PERMISSION_MODULE_NAMES } from '../config/modulePermissions';

const TOKEN_KEY = 'heliflow_token';
const USER_KEY = 'heliflow_user';
const ROLES_KEY = 'heliflow_roles';
const PERMISSIONS_KEY = 'heliflow_permissions';
const VENDOR_TOKEN_KEY = 'heliflow_vendor_token';

function mockPermissionsForRoles(roles: string[]): UserModulePermission[] {
  if (roles.some((r) => r === 'Super Admin' || r === 'admin' || r === 'Administrator')) {
    return PERMISSION_MODULE_NAMES.map((module) => ({
      module,
      canView: true,
      canCreate: module !== 'Dashboard' && module !== 'Notifications' && module !== 'Audit Trail',
      canApprove:
        module === 'RFQ' ||
        module === 'Quotations' ||
        module === 'Purchase Orders' ||
        module === 'Approvals',
    }));
  }
  if (roles.includes('Procurement Manager') || roles.includes('purchase_clerk')) {
    return [
      { module: 'Dashboard', canView: true, canCreate: false, canApprove: false },
      { module: 'RFQ', canView: true, canCreate: true, canApprove: true },
      { module: 'Quotations', canView: true, canCreate: false, canApprove: false },
      { module: 'Vendors', canView: true, canCreate: false, canApprove: false },
      { module: 'Documents', canView: true, canCreate: true, canApprove: false },
      { module: 'Notifications', canView: true, canCreate: false, canApprove: false },
    ];
  }
  if (roles.includes('Finance Approver') || roles.includes('finance_approver')) {
    return [
      { module: 'Dashboard', canView: true, canCreate: false, canApprove: false },
      { module: 'RFQ', canView: true, canCreate: false, canApprove: true },
      { module: 'Quotations', canView: true, canCreate: false, canApprove: true },
      { module: 'Purchase Orders', canView: true, canCreate: false, canApprove: true },
      { module: 'Approvals', canView: true, canCreate: false, canApprove: true },
    ];
  }
  return [{ module: 'Dashboard', canView: true, canCreate: false, canApprove: false }];
}

const MOCK_USERS = ALL_MOCK_USERS;

async function mockLogin(payload: LoginPayload): Promise<AuthResponse> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const user = MOCK_USERS.find(
    (u) => u.username === payload.username && u.password === payload.password
  );
  if (!user) throw new Error('Invalid username or password');
  if (!user.isActive) throw new Error('Account is deactivated. Contact your administrator.');
  const { password, roles, ...userData } = user;
  void password;
  const permissions = mockPermissionsForRoles(roles);
  return { user: userData, token: MOCK_TOKEN, roles, permissions };
}

async function mockVendorLogin(payload: LoginPayload): Promise<AuthResponse> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const login = payload.username.trim().toLowerCase();
  const user = MOCK_USERS.find(
    (u) =>
      u.roles.includes('Vendor') &&
      (u.username === payload.username || u.email.toLowerCase() === login) &&
      u.password === payload.password
  );
  if (!user) throw new Error('Invalid email or password');
  if (!user.isActive) throw new Error('Account is deactivated. Contact your administrator.');
  const { password, roles, ...userData } = user;
  void password;
  const permissions = mockPermissionsForRoles(roles);
  return { user: userData, token: MOCK_TOKEN, roles, permissions };
}

async function mockGetCurrentUser(): Promise<AuthResponse | null> {
  const token = localStorage.getItem(TOKEN_KEY);
  const userStr = localStorage.getItem(USER_KEY);
  const rolesStr = localStorage.getItem(ROLES_KEY);
  const permsStr = localStorage.getItem(PERMISSIONS_KEY);
  if (!token || !userStr) return null;
  try {
    const roles: string[] = rolesStr ? JSON.parse(rolesStr) : [];
    const permissions: UserModulePermission[] = permsStr
      ? JSON.parse(permsStr)
      : mockPermissionsForRoles(roles);
    return {
      user: JSON.parse(userStr),
      token,
      roles,
      permissions,
    };
  } catch {
    return null;
  }
}

async function apiLogin(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Login failed');
  }
  return json as AuthResponse;
}

async function apiVendorLogin(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/vendors/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      username: payload.username.trim(),
      password: payload.password,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Login failed');
  }
  const data = json.data ?? json;
  return {
    token: data.token,
    user: {
      id: data.vendor.id,
      username: data.vendor.email,
      email: data.vendor.email,
      fullName: data.vendor.name,
      companyCode: 'VENDOR',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    roles: ['Vendor'],
  };
}

async function apiGetCurrentUser(): Promise<AuthResponse | null> {
  // Detect vendor session from cached roles
  const cachedRoles = getCachedSession()?.roles;
  const isVendorSession = cachedRoles?.includes('Vendor');

  const tokenKey = isVendorSession ? VENDOR_TOKEN_KEY : TOKEN_KEY;
  const token = localStorage.getItem(tokenKey);
  if (!token) return null;

  // For vendor sessions, call the vendor profile endpoint (uses VENDOR_JWT_SECRET)
  // For admin sessions, call /auth/me (uses JWT_SECRET)
  // This prevents vendor tokens from being rejected by the admin auth middleware
  try {
    if (isVendorSession) {
      // Save the vendor token as the active token so authHeaders() sends the right one
      localStorage.setItem(TOKEN_KEY, token);
      const res = await fetch(`${API_BASE}/vendors/profile`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearSession();
          throw new ApiError('Session expired', 'UNAUTHORIZED', 401);
        }
        throw new ApiError('Failed to validate session', 'VALIDATION_ERROR', res.status);
      }
      const json = await res.json();
      // Vendor profile endpoint returns { success: true, data: { company: {...}, ... } }
      // Reconstruct AuthResponse from cached session data since we just validated the token
      const userStr = localStorage.getItem(USER_KEY);
      const rolesStr = localStorage.getItem(ROLES_KEY);
      if (userStr && rolesStr) {
        return {
          user: JSON.parse(userStr),
          token,
          roles: JSON.parse(rolesStr),
          permissions: [],
        };
      }
      return null;
    }

    // Admin session: call /auth/me
    const data = await apiRequest<AuthResponse>('/auth/me');
    if (data) saveSession(data);
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // Token stale/expired — clear session and re-throw so AuthContext clears UI state
      clearSession();
      throw err;
    }
    // Network error (backend down) — localStorage cache se restore karo offline support ke liye
    const userStr = localStorage.getItem(USER_KEY);
    const rolesStr = localStorage.getItem(ROLES_KEY);
    const permsStr = localStorage.getItem(PERMISSIONS_KEY);
    if (userStr && rolesStr) {
      try {
        return {
          user: JSON.parse(userStr),
          token,
          roles: JSON.parse(rolesStr),
          permissions: permsStr ? JSON.parse(permsStr) : [],
        };
      } catch {
        // localStorage corrupt
      }
    }
    return null;
  }
}

function saveSession(data: AuthResponse, options?: { vendorPortal?: boolean }): void {
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem(ROLES_KEY, JSON.stringify(data.roles));
  if (data.permissions?.length) {
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(data.permissions));
  } else {
    localStorage.removeItem(PERMISSIONS_KEY);
  }
  if (options?.vendorPortal) {
    localStorage.setItem(VENDOR_TOKEN_KEY, data.token);
  }
}

/** Synchronously read cached session from localStorage — no async call needed */
function getCachedSession(): {
  user: import('../types').User;
  roles: string[];
  permissions?: UserModulePermission[];
} | null {
  try {
    const userStr = localStorage.getItem(USER_KEY);
    const rolesStr = localStorage.getItem(ROLES_KEY);
    if (!userStr || !rolesStr) return null;
    return {
      user: JSON.parse(userStr),
      roles: JSON.parse(rolesStr),
      permissions: localStorage.getItem(PERMISSIONS_KEY)
        ? JSON.parse(localStorage.getItem(PERMISSIONS_KEY)!)
        : undefined,
    };
  } catch {
    return null;
  }
}

function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLES_KEY);
  localStorage.removeItem(PERMISSIONS_KEY);
  localStorage.removeItem(VENDOR_TOKEN_KEY);
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Production-grade token migration:
 * If localStorage still has the old MOCK_TOKEN (from a previous USE_MOCK=true session),
 * silently exchange it for a real JWT by calling the real login API.
 * This happens once — after that, all tokens are real JWTs.
 */
async function migrateMockToken(): Promise<AuthResponse | null> {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  if (storedToken !== MOCK_TOKEN) return null; // not the mock token, nothing to do

  try {
    // Use well-known admin credentials from backend seed data
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.warn('[Auth] Mock token migration failed — clearing session', json.error);
      clearSession();
      return null;
    }
    const data = json as AuthResponse;
    saveSession(data);
    console.info('[Auth] Mock token migrated to real JWT successfully');
    return data;
  } catch (err) {
    console.warn('[Auth] Mock token migration error — clearing session', err);
    clearSession();
    return null;
  }
}

export const authService = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const data = USE_MOCK ? await mockLogin(payload) : await apiLogin(payload);
    saveSession(data);
    return data;
  },

  vendorLogin: async (payload: LoginPayload): Promise<AuthResponse> => {
    const data = USE_MOCK ? await mockVendorLogin(payload) : await apiVendorLogin(payload);
    saveSession(data, { vendorPortal: true });
    return data;
  },

  logout: async (): Promise<void> => {
    // Clear local session instantly so the UI redirects immediately
    const token = getToken();
    clearSession();

    // Clear in-memory API response cache to prevent stale data showing
    // when the next user logs in from the same browser tab.
    clearAllApiCache();

    // Fire-and-forget: notify backend in background (don't block the user)
    if (!USE_MOCK && token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {});
    }
  },

  getCurrentUser: USE_MOCK ? mockGetCurrentUser : apiGetCurrentUser,
  getToken,
  getCachedSession,
  isAuthenticated: (): boolean => !!getToken(),
  saveSession,
  clearSession,
  migrateMockToken,
};
