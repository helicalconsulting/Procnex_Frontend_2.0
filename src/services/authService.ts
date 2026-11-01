import { applyBrandingProfile, readCachedProfile, applyPrimaryColor, DEFAULT_PRIMARY } from '../lib/branding';
import { companySettingsService } from './companySettingsService';
import { USE_MOCK } from '../config/mock';
import { ALL_MOCK_USERS, MOCK_TOKEN } from '../config/mockData';
import { apiRequest, API_BASE, authHeaders, ApiError, clearAllApiCache } from '../api/client';
import { sseClient } from './sseClient';
import type { AuthResponse, LoginPayload, UserModulePermission } from '../types';
import { PERMISSION_MODULE_NAMES } from '../config/modulePermissions';

const TOKEN_KEY = 'heliflow_token';
const USER_KEY = 'heliflow_user';
const ROLES_KEY = 'heliflow_roles';
const PERMISSIONS_KEY = 'heliflow_permissions';
const VENDOR_TOKEN_KEY = 'heliflow_vendor_token';

export function pruneStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Never delete critical authentication keys
      if (
        key === TOKEN_KEY ||
        key === USER_KEY ||
        key === ROLES_KEY ||
        key === PERMISSIONS_KEY ||
        key === VENDOR_TOKEN_KEY ||
        key === 'employee_company_code' ||
        key === 'vendor_company_code'
      ) {
        continue;
      }
      // Target ephemeral caches, base64 attachments, and large objects
      if (
        key.includes('attachment') ||
        key.startsWith('invoice_') ||
        key.startsWith('payment_') ||
        key.startsWith('vendor_invoice_') ||
        key.startsWith('dispatch_') ||
        key.startsWith('approvers_') ||
        key.startsWith('po_items_') ||
        key.startsWith('voucher_items_') ||
        key.startsWith('heliflow_sig_') ||
        key.startsWith('heliflow_doc_signatures') ||
        key.startsWith('heliflow_signatures') ||
        key.startsWith('sap_') ||
        key.startsWith('dashboard_') ||
        key.startsWith('calendar_') ||
        key.startsWith('branding_')
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // If quota exceeded or error, aggressively purge non-essential keys
    pruneStorage();
    try {
      localStorage.setItem(key, value);
    } catch {
      // Fallback to sessionStorage so authentication and session always succeed
      try {
        sessionStorage.setItem(key, value);
      } catch {}
    }
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeRemoveItem(key: string): void {
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
}

// Proactively run prune on file load to clear any preexisting quota exhaustion
try {
  pruneStorage();
} catch {}

function mockPermissionsForRoles(roles: string[]): UserModulePermission[] {
  const isSuper = roles.some((r) => r === 'Super Admin' || r === 'admin' || r === 'Administrator');
  const isManager = roles.some((r) =>
    ['Procurement Manager', 'Purchase Manager', 'purchase_manager', 'procurement_manager', 'purchase_clerk', 'Purchase Clerk', 'Manager'].includes(r)
  );
  const isFinance = roles.some((r) =>
    ['Finance Approver', 'finance_approver', 'Finance Manager', 'finance_manager'].includes(r)
  );

  if (isSuper || isManager) {
    return PERMISSION_MODULE_NAMES.map((module) => ({
      module,
      canView: true,
      canCreate: module !== 'Dashboard' && module !== 'Notifications' && module !== 'Audit Trail' && module !== 'Form Responses',
      canApprove: true,
    }));
  }

  if (isFinance) {
    return PERMISSION_MODULE_NAMES.map((module) => ({
      module,
      canView: true,
      canCreate: module === 'Create Payment Voucher' || module === 'Create Purchase Invoice',
      canApprove: true,
    }));
  }

  return PERMISSION_MODULE_NAMES.map((module) => ({
    module,
    canView: true,
    canCreate: false,
    canApprove: false,
  }));
}

const MOCK_USERS = ALL_MOCK_USERS;

async function mockLogin(payload: LoginPayload): Promise<AuthResponse> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const user = MOCK_USERS.find(
    (u) => u.username === payload.username && u.password === payload.password
  );
  if (!user) throw new Error('Invalid username or password');
  if (!user.isActive) throw new Error('Account is deactivated. Contact your administrator.');
  if (payload.companyCode) {
    const uCode = (user.companyCode || '').trim().toUpperCase();
    const reqCode = payload.companyCode.trim().toUpperCase();
    if (uCode && uCode !== reqCode) {
      throw new Error(`This user account does not belong to organization '${reqCode}'.`);
    }
  }
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
  const companyCode = payload.companyCode || localStorage.getItem('employee_company_code') || undefined;
  const headers = authHeaders();
  if (companyCode) {
    (headers as any)['x-company-code'] = companyCode;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        companyCode,
      }),
    });
  } catch (err) {
    throw new Error(`Unable to connect to authentication server at ${API_BASE}. Please verify server network status.`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Login failed');
  }
  return json as AuthResponse;
}

async function apiVendorLogin(payload: LoginPayload): Promise<AuthResponse> {
  const companyCode = localStorage.getItem('vendor_company_code') || undefined;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/vendors/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        username: payload.username.trim(),
        password: payload.password,
        companyCode,
      }),
    });
  } catch (err) {
    throw new Error(`Unable to connect to vendor authentication server at ${API_BASE}. Please verify server network status.`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Login failed');
  }
  const data = json.data ?? json;
  if (data.vendor?.companyCode) {
    localStorage.setItem('vendor_company_code', data.vendor.companyCode);
  }
  return {
    token: data.token,
    user: {
      id: data.vendor.id,
      username: data.vendor.email,
      email: data.vendor.email,
      fullName: data.vendor.name,
      companyCode: data.vendor?.companyCode || 'VENDOR',
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
    if (data) {
      if (!data.roles || data.roles.length === 0) {
        const cached = getCachedSession();
        if (cached?.roles && cached.roles.length > 0) {
          data.roles = cached.roles;
        }
      }
      saveSession(data);
    }
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
  try {
    safeSetItem(TOKEN_KEY, data.token);
    safeSetItem(USER_KEY, JSON.stringify(data.user));

    let rolesToSave = data.roles || [];
    if (rolesToSave.length === 0) {
      try {
        const existing = safeGetItem(ROLES_KEY);
        if (existing) {
          const parsed = JSON.parse(existing);
          if (Array.isArray(parsed) && parsed.length > 0) {
            rolesToSave = parsed;
          }
        }
      } catch {}
    }
    safeSetItem(ROLES_KEY, JSON.stringify(rolesToSave));

    if (data.permissions?.length) {
      safeSetItem(PERMISSIONS_KEY, JSON.stringify(data.permissions));
    } else if (!safeGetItem(PERMISSIONS_KEY)) {
      safeRemoveItem(PERMISSIONS_KEY);
    }
    if (options?.vendorPortal) {
      safeSetItem(VENDOR_TOKEN_KEY, data.token);
      if (data.user?.companyCode) {
        safeSetItem('vendor_company_code', data.user.companyCode.toUpperCase());
      }
    } else {
      if (data.user?.companyCode) {
        safeSetItem('employee_company_code', data.user.companyCode.toUpperCase());
      }
    }
  } catch (e) {
    console.warn('[Auth] Non-fatal storage notice during saveSession:', e);
  }
}

/** Synchronously read cached session from localStorage / sessionStorage — no async call needed */
function getCachedSession(): {
  user: import('../types').User;
  roles: string[];
  permissions?: UserModulePermission[];
} | null {
  try {
    const userStr = safeGetItem(USER_KEY);
    const rolesStr = safeGetItem(ROLES_KEY);
    if (!userStr || !rolesStr) return null;
    const permsStr = safeGetItem(PERMISSIONS_KEY);
    return {
      user: JSON.parse(userStr),
      roles: JSON.parse(rolesStr),
      permissions: permsStr ? JSON.parse(permsStr) : undefined,
    };
  } catch {
    return null;
  }
}

function clearSession(): void {
  const companyCode = safeGetItem('vendor_company_code');
  safeRemoveItem(TOKEN_KEY);
  safeRemoveItem(USER_KEY);
  safeRemoveItem(ROLES_KEY);
  safeRemoveItem(PERMISSIONS_KEY);
  safeRemoveItem(VENDOR_TOKEN_KEY);
  safeRemoveItem('heliflow_branding_cache');
  safeRemoveItem('heliflow_tab_title');
  if (companyCode) {
    safeSetItem('vendor_company_code', companyCode);
  }
}

function getToken(): string | null {
  return safeGetItem(TOKEN_KEY);
}

/**
 * Production-grade token migration:
 * If localStorage still has the old MOCK_TOKEN (from a previous USE_MOCK=true session),
 * silently exchange it for a real JWT by calling the real login API.
 * This happens once — after that, all tokens are real JWTs.
 */
async function migrateMockToken(): Promise<AuthResponse | null> {
  const storedToken = safeGetItem(TOKEN_KEY);
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

async function prepareSessionBranding(companyCode?: string): Promise<void> {
  const code = companyCode?.toUpperCase();
  const cached = code ? readCachedProfile(code) : null;
  if (cached) { applyBrandingProfile(cached); return; }
  applyPrimaryColor(DEFAULT_PRIMARY);
  try {
    const profile = await companySettingsService.getCompanyProfile();
    if (!code || profile.companyCode?.toUpperCase() === code) applyBrandingProfile(profile);
  } catch { /* Login remains available when branding cannot be fetched. */ }
}

export const authService = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    clearAllApiCache();
    const data = USE_MOCK ? await mockLogin(payload) : await apiLogin(payload);
    saveSession(data);
    await prepareSessionBranding(data.user?.companyCode);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('heliflow_auth_change'));
    }
    return data;
  },

  vendorLogin: async (payload: LoginPayload): Promise<AuthResponse> => {
    const data = USE_MOCK ? await mockVendorLogin(payload) : await apiVendorLogin(payload);
    saveSession(data, { vendorPortal: true });
    await prepareSessionBranding(data.user?.companyCode);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('heliflow_auth_change'));
    }
    return data;
  },

  logout: async (): Promise<void> => {
    // Clear local session instantly so the UI redirects immediately
    const token = getToken();
    clearSession();

    // Disconnect SSE stream on logout
    sseClient.disconnect();

    // Clear in-memory API response cache to prevent stale data showing
    // when the next user logs in from the same browser tab.
    clearAllApiCache();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('heliflow_auth_change'));
    }

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
  pruneStorage,
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
};
