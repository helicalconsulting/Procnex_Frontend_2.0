import { USE_MOCK } from '../config/mock';
import { apiRequest, API_BASE, invalidateApiCache } from '../api/client';
import { authService } from './authService';
import { pickList } from '../api/normalize';
import { ALL_MOCK_USERS, MOCK_APPROVAL_LEVELS } from '../config/mockData';
import type { ApprovalLevel, User } from '../types';

type UserWithRoles = User & { roles?: string[]; role?: string };

export interface CreateUserPayload {
  fullName: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  department?: string;
  position?: string;
  companyCode?: string;
  roleName: string;
  userType?: 'rfq' | 'heliflow';
  documents?: {
    aadhaar?: File;
    pan?: File;
    offerLetter?: File;
  };
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  phone?: string;
  department?: string;
  roleName?: string;
}

export interface CreateApprovalLevelPayload {
  module: string;
  requiredRole: string;
  timeLimitHours?: number;
  minValue?: number | null;
  maxValue?: number | null;
  currency?: string;
}

export interface UpdateApprovalLevelPayload {
  requiredRole?: string;
  timeLimitHours?: number;
  minValue?: number | null;
  maxValue?: number | null;
  currency?: string;
}

// ─── Users ───────────────────────────────────────────────────────────────────

async function mockListUsers(): Promise<UserWithRoles[]> {
  return ALL_MOCK_USERS.map(({ password: _, roles, ...u }) => ({ ...u, roles }));
}

async function apiListUsers(): Promise<UserWithRoles[]> {
  const data = await apiRequest<{ users: UserWithRoles[] }>('/admin/users?limit=100');
  const users = pickList<UserWithRoles & { role?: string }>(data, ['users']);
  return users.map((u) => ({
    ...u,
    roles: u.roles || (u.role ? [u.role] : []),
  }));
}

async function mockCreateUser(payload: CreateUserPayload): Promise<UserWithRoles> {
  const row: UserWithRoles = {
    id: String(Date.now()),
    username: payload.username,
    email: payload.email,
    fullName: payload.fullName,
    companyCode: payload.companyCode || 'HFL',
    department: payload.department,
    phone: payload.phone,
    isActive: true,
    createdAt: new Date().toISOString(),
    roles: [payload.roleName],
  };
  void payload.documents;
  ALL_MOCK_USERS.push({ ...row, password: payload.password, roles: [payload.roleName] });
  return row;
}

async function apiCreateUser(payload: CreateUserPayload): Promise<UserWithRoles> {
  const formData = new FormData();
  formData.append('fullName', payload.fullName);
  formData.append('username', payload.username);
  formData.append('email', payload.email);
  formData.append('password', payload.password);
  formData.append('roleName', payload.roleName);
  if (payload.phone) formData.append('phone', payload.phone);
  if (payload.department) formData.append('department', payload.department);
  if (payload.position) formData.append('position', payload.position);
  if (payload.companyCode) formData.append('companyCode', payload.companyCode);
  if (payload.userType) formData.append('userType', payload.userType);
  if (payload.documents?.aadhaar) formData.append('aadhaar', payload.documents.aadhaar);
  if (payload.documents?.pan) formData.append('pan', payload.documents.pan);
  if (payload.documents?.offerLetter) formData.append('offerLetter', payload.documents.offerLetter);

  const token = authService.getToken();
  const res = await fetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });

  let json: {
    success?: boolean;
    data?: {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role?: string;
  isActive: boolean;
  createdAt: string;
    };
    error?: string;
    message?: string;
  };
  try {
    json = await res.json();
  } catch {
    throw new Error('Invalid response from server');
  }

  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || json.message || `Request failed (${res.status})`);
  }

  const created = json.data;
  invalidateApiCache('/admin/users');
  return {
    id: created.id,
    fullName: created.fullName,
    username: created.username,
    email: created.email,
    companyCode: payload.companyCode || 'HFL',
    department: payload.department,
    phone: payload.phone,
    isActive: created.isActive,
    createdAt: created.createdAt,
    roles: [created.role || payload.roleName],
  };
}

async function mockUpdateUser(id: string, payload: UpdateUserPayload): Promise<UserWithRoles> {
  const u = ALL_MOCK_USERS.find((x) => x.id === id);
  if (!u) throw new Error('User not found');
  Object.assign(u, payload);
  if (payload.roleName) u.roles = [payload.roleName];
  const { password: _, roles, ...rest } = u;
  return { ...rest, roles: roles || [] };
}

async function apiUpdateUser(id: string, payload: UpdateUserPayload): Promise<UserWithRoles> {
  const updated = await apiRequest<{
  id: string;
  fullName: string;
  username: string;
  email: string;
  role?: string;
  roles?: string[];
  phone?: string | null;
  department?: string | null;
  companyCode?: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  }>(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return {
    id: updated.id,
    fullName: updated.fullName,
    username: updated.username,
    email: updated.email,
    phone: updated.phone ?? undefined,
    department: updated.department ?? undefined,
    companyCode: updated.companyCode || 'HFL',
    isActive: updated.isActive,
    lastLoginAt: updated.lastLoginAt ?? undefined,
    createdAt: updated.createdAt,
    roles: updated.roles || (updated.role ? [updated.role] : []),
  };
}

async function mockDeleteUser(id: string): Promise<void> {
  const idx = ALL_MOCK_USERS.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error('User not found');
  ALL_MOCK_USERS.splice(idx, 1);
}

async function apiDeleteUser(id: string): Promise<void> {
  await apiRequest(`/admin/users/${id}`, { method: 'DELETE' });
}

async function mockToggleUserStatus(id: string): Promise<{ isActive: boolean }> {
  const u = ALL_MOCK_USERS.find((x) => x.id === id);
  if (!u) throw new Error('User not found');
  u.isActive = !u.isActive;
  return { isActive: u.isActive };
}

async function apiToggleUserStatus(id: string): Promise<{ isActive: boolean }> {
  return apiRequest<{ isActive: boolean }>(`/admin/users/${id}/toggle-status`, {
    method: 'PUT',
    body: JSON.stringify({}),
  });
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export interface RolePermissionPayload {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canApprove: boolean;
}

export interface AdminRoleRecord {
  id: string;
  roleName: string;
  displayRoleName?: string;
  description?: string;
  isSystem?: boolean;
  userCount?: number;
  createdAt?: string;
  permissions?: RolePermissionPayload[];
}

export interface CreateRolePayload {
  roleName: string;
  description?: string;
  permissions: RolePermissionPayload[];
}

export interface UpdateRolePayload {
  roleName?: string;
  description?: string;
}

/** Normalize API role (list/create/update) into a consistent shape */
export function normalizeAdminRole(raw: Partial<AdminRoleRecord> & { roleName: string }): AdminRoleRecord {
  return {
    id: String(raw.id),
    roleName: raw.roleName,
    displayRoleName: raw.displayRoleName || raw.roleName,
    description: raw.description ?? '',
    isSystem: Boolean(raw.isSystem),
    userCount: Number(raw.userCount ?? 0),
    createdAt: raw.createdAt,
    permissions: raw.permissions?.map((p) => ({
      module: p.module,
      canView: Boolean(p.canView),
      canCreate: Boolean(p.canCreate),
      canApprove: Boolean(p.canApprove),
    })),
  };
}

async function mockListRoles(): Promise<AdminRoleRecord[]> {
  return [
    { id: '1', roleName: 'Super Admin', description: 'Full access', isSystem: true, userCount: 1 },
    { id: '2', roleName: 'Procurement Manager', description: 'Procurement', isSystem: false, userCount: 0 },
    { id: '3', roleName: 'Finance Approver', description: 'Finance approvals', isSystem: false, userCount: 0 },
    { id: '4', roleName: 'Administrator', description: 'Admin', isSystem: true, userCount: 0 },
  ];
}

async function apiListRoles(): Promise<AdminRoleRecord[]> {
  const list = await apiRequest<AdminRoleRecord[]>('/admin/roles');
  return list.map((r) => normalizeAdminRole(r));
}

async function mockCreateRole(payload: CreateRolePayload): Promise<AdminRoleRecord> {
  return {
    id: String(Date.now()),
    roleName: payload.roleName,
    description: payload.description,
    isSystem: false,
    userCount: 0,
    permissions: payload.permissions,
  };
}

async function apiCreateRole(payload: CreateRolePayload): Promise<AdminRoleRecord> {
  const created = await apiRequest<AdminRoleRecord>('/admin/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeAdminRole(created);
}

async function mockUpdateRolePermissions(
  roleId: string,
  permissions: RolePermissionPayload[]
): Promise<AdminRoleRecord> {
  const roles = await mockListRoles();
  const role = roles.find((r) => r.id === roleId);
  if (!role) throw new Error('Role not found');
  return { ...role, permissions };
}

async function apiUpdateRolePermissions(
  roleId: string,
  permissions: RolePermissionPayload[]
): Promise<AdminRoleRecord> {
  const updated = await apiRequest<AdminRoleRecord>(`/admin/roles/${roleId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
  return normalizeAdminRole(updated);
}

async function mockUpdateRole(id: string, payload: UpdateRolePayload): Promise<AdminRoleRecord> {
  const roles = await mockListRoles();
  const role = roles.find((r) => r.id === id);
  if (!role) throw new Error('Role not found');
  return normalizeAdminRole({
    ...role,
    roleName: payload.roleName ?? role.roleName,
    description: payload.description ?? role.description,
  });
}

async function apiUpdateRole(id: string, payload: UpdateRolePayload): Promise<AdminRoleRecord> {
  const updated = await apiRequest<AdminRoleRecord>(`/admin/roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeAdminRole(updated);
}

async function mockDeleteRole(id: string): Promise<void> {
  const role = (await mockListRoles()).find((r) => r.id === id);
  if (!role) throw new Error('Role not found');
  if (role.isSystem) throw new Error('Cannot delete system role');
}

async function apiDeleteRole(id: string): Promise<void> {
  await apiRequest(`/admin/roles/${id}`, { method: 'DELETE' });
}

// ─── Approval levels ───────────────────────────────────────────────────────────

async function mockListApprovalLevels(): Promise<ApprovalLevel[]> {
  return [...MOCK_APPROVAL_LEVELS];
}

async function apiListApprovalLevels(): Promise<ApprovalLevel[]> {
  return apiRequest<ApprovalLevel[]>('/admin/approval-levels');
}

async function mockCreateApprovalLevel(payload: CreateApprovalLevelPayload): Promise<ApprovalLevel> {
  const moduleLevels = MOCK_APPROVAL_LEVELS.filter((l) => l.module === payload.module);
  const nextNum =
    moduleLevels.length > 0 ? Math.max(...moduleLevels.map((l) => l.levelNumber)) + 1 : 1;
  const row: ApprovalLevel = {
    id: String(Date.now()),
    module: payload.module,
    levelNumber: nextNum,
    requiredRole: payload.requiredRole,
    timeLimitHours: payload.timeLimitHours ?? 24,
    currency: payload.currency || 'KES',
  };
  MOCK_APPROVAL_LEVELS.push(row);
  return row;
}

async function apiCreateApprovalLevel(payload: CreateApprovalLevelPayload): Promise<ApprovalLevel> {
  return apiRequest<ApprovalLevel>('/admin/approval-levels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function mockUpdateApprovalLevel(
  id: string,
  payload: UpdateApprovalLevelPayload
): Promise<ApprovalLevel> {
  const idx = MOCK_APPROVAL_LEVELS.findIndex((l) => l.id === id);
  if (idx === -1) throw new Error('Level not found');
  MOCK_APPROVAL_LEVELS[idx] = { ...MOCK_APPROVAL_LEVELS[idx], ...payload };
  return MOCK_APPROVAL_LEVELS[idx];
}

async function apiUpdateApprovalLevel(
  id: string,
  payload: UpdateApprovalLevelPayload
): Promise<ApprovalLevel> {
  return apiRequest<ApprovalLevel>(`/admin/approval-levels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function mockDeleteApprovalLevel(id: string): Promise<void> {
  const level = MOCK_APPROVAL_LEVELS.find((l) => l.id === id);
  if (!level) throw new Error('Level not found');
  const mod = level.module;
  const filtered = MOCK_APPROVAL_LEVELS.filter((l) => l.id !== id);
  MOCK_APPROVAL_LEVELS.length = 0;
  MOCK_APPROVAL_LEVELS.push(...filtered);
  const remaining = MOCK_APPROVAL_LEVELS.filter((l) => l.module === mod)
    .sort((a, b) => a.levelNumber - b.levelNumber);
  remaining.forEach((l, i) => {
    l.levelNumber = i + 1;
  });
}

async function apiDeleteApprovalLevel(id: string): Promise<void> {
  await apiRequest(`/admin/approval-levels/${id}`, { method: 'DELETE' });
}

async function mockReorderApprovalLevel(
  id: string,
  direction: 'up' | 'down'
): Promise<void> {
  const level = MOCK_APPROVAL_LEVELS.find((l) => l.id === id);
  if (!level) throw new Error('Level not found');
  const moduleLevels = MOCK_APPROVAL_LEVELS.filter((l) => l.module === level.module).sort(
    (a, b) => a.levelNumber - b.levelNumber
  );
  const idx = moduleLevels.findIndex((l) => l.id === id);
  if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === moduleLevels.length - 1)) {
    throw new Error(`Cannot move ${direction}`);
  }
  const swap = moduleLevels[direction === 'up' ? idx - 1 : idx + 1];
  const tmp = level.levelNumber;
  level.levelNumber = swap.levelNumber;
  swap.levelNumber = tmp;
}

async function apiReorderApprovalLevel(id: string, direction: 'up' | 'down'): Promise<void> {
  await apiRequest(`/admin/approval-levels/${id}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ direction }),
  });
}

// ─── Widget Preferences ──────────────────────────────────────────────────────

export interface UserWidgetPref {
  widgetId: string;
  isEnabled: boolean;
  isUserActive?: boolean;
}

async function mockGetUserWidgets(_id: string): Promise<UserWidgetPref[]> {
  return [];
}

async function apiGetUserWidgets(id: string): Promise<UserWidgetPref[]> {
  const data = await apiRequest<{ userId: string; widgets: UserWidgetPref[] }>(
    `/admin/users/${id}/widgets`
  );
  return data.widgets ?? [];
}

async function mockSaveUserWidgets(
  _id: string,
  _widgets: UserWidgetPref[]
): Promise<void> {}

async function apiSaveUserWidgets(
  id: string,
  widgets: UserWidgetPref[]
): Promise<void> {
  await apiRequest(`/admin/users/${id}/widgets`, {
    method: 'PUT',
    body: JSON.stringify({ widgets }),
  });
}

export const adminService = {
  listUsers: USE_MOCK ? mockListUsers : apiListUsers,
  createUser: USE_MOCK ? mockCreateUser : apiCreateUser,
  updateUser: USE_MOCK ? mockUpdateUser : apiUpdateUser,
  deleteUser: USE_MOCK ? mockDeleteUser : apiDeleteUser,
  toggleUserStatus: USE_MOCK ? mockToggleUserStatus : apiToggleUserStatus,
  listRoles: USE_MOCK ? mockListRoles : apiListRoles,
  createRole: USE_MOCK ? mockCreateRole : apiCreateRole,
  updateRole: USE_MOCK ? mockUpdateRole : apiUpdateRole,
  deleteRole: USE_MOCK ? mockDeleteRole : apiDeleteRole,
  updateRolePermissions: USE_MOCK ? mockUpdateRolePermissions : apiUpdateRolePermissions,
  listApprovalLevels: USE_MOCK ? mockListApprovalLevels : apiListApprovalLevels,
  createApprovalLevel: USE_MOCK ? mockCreateApprovalLevel : apiCreateApprovalLevel,
  updateApprovalLevel: USE_MOCK ? mockUpdateApprovalLevel : apiUpdateApprovalLevel,
  deleteApprovalLevel: USE_MOCK ? mockDeleteApprovalLevel : apiDeleteApprovalLevel,
  reorderApprovalLevel: USE_MOCK ? mockReorderApprovalLevel : apiReorderApprovalLevel,
  getUserWidgets: USE_MOCK ? mockGetUserWidgets : apiGetUserWidgets,
  saveUserWidgets: USE_MOCK ? mockSaveUserWidgets : apiSaveUserWidgets,
};

