import { useState, useMemo, useCallback } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/adminService';
import {
  Shield,
  Search,
  Eye,
  Edit3,
  Plus,
  X,
  Check,
  Lock,
  Unlock,
  Users,
  Crown,
  Settings,
  FileCheck,
  UserCog,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Info,
  ShieldPlus,
  Type,
  AlignLeft,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  MODULE_CAPABILITIES,
  PERMISSION_MODULE_NAMES,
  buildDefaultPermissions,
  countGrantedPermissions,
  getModuleCapability,
  moduleSupports,
  sanitizeModulePermission,
  type PermissionField,
  type ModulePermissionRow,
} from '../../config/modulePermissions';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { CardSkeleton } from '../../components/shared/Skeleton';

// ─── Types ──────────────────────────────────────────────────

type RoleName = 'Super Admin' | 'Administrator' | 'Manager' | 'Finance Approver' | 'Staff';

type ModulePermission = ModulePermissionRow;

interface RoleData {
  id: number;
  roleName: string;
  iconRole: RoleName;
  description: string;
  userCount: number;
  isSystem: boolean;
  permissions: ModulePermission[];
  createdAt: string;
}

const ROLE_NAME_ALIASES: Record<string, RoleName> = {
  'Super Admin': 'Super Admin',
  Administrator: 'Administrator',
  Manager: 'Manager',
  'Finance Approver': 'Finance Approver',
  'Procurement Manager': 'Manager',
  'Purchase Clerk': 'Manager',
  purchase_clerk: 'Manager',
  Staff: 'Staff',
};

function mapRole(r: {
  id: number;
  roleName: string;
  displayRoleName?: string;
  description?: string;
  userCount?: number;
  isSystem?: boolean;
  createdAt?: string;
  permissions?: ModulePermission[];
}): RoleData {
  const roleName = r.displayRoleName || r.roleName;
  const iconRole = ROLE_NAME_ALIASES[roleName] ?? ROLE_NAME_ALIASES[r.roleName] ?? 'Staff';
  const isSuperAdmin = roleName === 'Super Admin' || r.roleName === 'Super Admin';
  const isSystem = r.isSystem ?? (isSuperAdmin || roleName === 'Administrator');

  const permissions = PERMISSION_MODULE_NAMES.map((module) => {
    if (isSuperAdmin) {
      return sanitizeModulePermission({
        module,
        canView: true,
        canCreate: true,
        canApprove: true,
      });
    }

    const fromApi = r.permissions?.find((p) => p.module === module);
    if (fromApi) return sanitizeModulePermission(fromApi);
    return sanitizeModulePermission(
      buildDefaultPermissions({
        canView: isSystem,
        canCreate: false,
        canApprove: isSystem,
      }).find((p) => p.module === module)!
    );
  });

  return {
    id: r.id,
    roleName,
    iconRole,
    description: r.description || '',
    userCount: r.userCount ?? 0,
    isSystem,
    createdAt: r.createdAt ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    permissions,
  };
}

function PermissionDisplayChip({
  module,
  field,
  granted,
}: {
  module: string;
  field: PermissionField;
  granted: boolean;
}) {
  if (!moduleSupports(module, field)) {
    return <span className="inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold bg-muted text-muted-foreground">—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${granted ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>
      {granted ? <Unlock size={12} /> : <Lock size={12} />}
      {granted ? 'Yes' : 'No'}
    </span>
  );
}

function PermissionToggleCell({
  module,
  field,
  value,
  onToggle,
}: {
  module: string;
  field: PermissionField;
  value: boolean;
  onToggle: () => void;
}) {
  if (!moduleSupports(module, field)) {
    return <span className="inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold bg-muted text-muted-foreground" title="Not applicable">—</span>;
  }
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center"
      onClick={onToggle}
      aria-pressed={value}
      aria-label={`${field.replace('can', '')} permission for ${module}`}
    >
      <span className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}

function PermissionMatrixRow({
  perm,
  striped,
  mode,
  onToggle,
}: {
  perm: ModulePermission;
  striped: boolean;
  mode: 'view' | 'edit';
  onToggle?: (field: PermissionField) => void;
}) {
  const hint = getModuleCapability(perm.module).hint;
  return (
    <div className={`grid min-w-[680px] grid-cols-[minmax(220px,1fr)_110px_110px_110px] items-center border-b border-border/60 px-4 py-3 ${striped ? 'bg-muted/25' : ''}`}>
      <div className="min-w-0 pr-3">
        <span className="block text-xs font-semibold text-foreground">{perm.module}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {(['canView', 'canCreate', 'canApprove'] as PermissionField[]).map((field) => (
        <div key={field} className="flex justify-center">
          {mode === 'view' ? (
            <PermissionDisplayChip module={perm.module} field={field} granted={perm[field]} />
          ) : (
            <PermissionToggleCell
              module={perm.module}
              field={field}
              value={perm[field]}
              onToggle={() => onToggle?.(field)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const ROLE_ICON_MAP: Record<RoleName, React.ReactNode> = {
  'Super Admin': <Crown size={20} />,
  Administrator: <Settings size={20} />,
  Manager: <UserCog size={20} />,
  'Finance Approver': <FileCheck size={20} />,
  Staff: <Users size={20} />,
};

// ─── Component ──────────────────────────────────────────────

export default function RolesPermissionsPage() {
  const { roles: authRoles, hasPermission } = useAuth();
  const canDeleteRoles = authRoles.includes('Super Admin');

  const { data: roles, loading, error, forceRefresh } = useServiceData(
    () => adminService.listRoles().then((list) => list.map(mapRole)),
    [] as RoleData[],
    [],
    { cacheKey: 'roles:list', cacheTtlMs: 0 }
  );

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'system' | 'custom'>('all');
  const [expandedRole, setExpandedRole] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState<RoleData | null>(null);
  const [editPermissions, setEditPermissions] = useState<ModulePermission[]>([]);

  // Modules list inline expand
  const [showModulesList, setShowModulesList] = useState(false);

  // Create Role modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<ModulePermission[]>(buildDefaultPermissions());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleData | null>(null);

  const anyModalOpen = !!(editingRole || showCreateModal || deleteTarget);
  useBodyScrollLock(anyModalOpen);

  // Summary
  const summary = useMemo(
    () => ({
      totalRoles: roles.length,
      totalPermissions: roles.reduce((sum, r) => sum + countGrantedPermissions(r.permissions).granted, 0),
      systemRoles: roles.filter((r) => r.isSystem).length,
      customRoles: roles.filter((r) => !r.isSystem).length,
    }),
    [roles]
  );

  // Filter
  const filtered = useMemo(() => {
    let result = roles;
    if (roleFilter === 'system') {
      result = result.filter((r) => r.isSystem);
    } else if (roleFilter === 'custom') {
      result = result.filter((r) => !r.isSystem);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.roleName.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [roles, roleFilter, search]);

  // Toggle expand
  const toggleExpand = useCallback((roleId: number) => {
    setExpandedRole((prev) => (prev === roleId ? null : roleId));
  }, []);

  // Open edit modal
  const openEditModal = useCallback((role: RoleData) => {
    setSaveError(null);
    setEditingRole(role);
    setEditPermissions(role.permissions.map((p) => ({ ...p })));
  }, []);

  // Toggle a permission in the edit modal
  const togglePermission = useCallback((moduleIndex: number, field: PermissionField) => {
    setEditPermissions((prev) =>
      prev.map((p, i) => {
        if (i !== moduleIndex || !moduleSupports(p.module, field)) return p;
        const updated = sanitizeModulePermission({ ...p, [field]: !p[field] });
        if (field === 'canView' && !updated.canView) {
          return sanitizeModulePermission({ ...updated, canCreate: false, canApprove: false });
        }
        if ((field === 'canCreate' || field === 'canApprove') && updated[field]) {
          return sanitizeModulePermission({ ...updated, canView: true });
        }
        return updated;
      })
    );
  }, []);

  // Save permissions
  const savePermissions = useCallback(async () => {
    if (!editingRole) return;
    const sanitized = editPermissions.map(sanitizeModulePermission);
    setSaving(true);
    setSaveError(null);
    try {
      await adminService.updateRolePermissions(editingRole.id, sanitized);
      setEditingRole(null);
      await forceRefresh();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('heliflow_auth_change'));
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }, [editingRole, editPermissions, forceRefresh]);

  // Toggle a permission in the create modal
  const toggleNewPerm = useCallback((moduleIndex: number, field: PermissionField) => {
    setNewRolePerms((prev) =>
      prev.map((p, i) => {
        if (i !== moduleIndex || !moduleSupports(p.module, field)) return p;
        const updated = sanitizeModulePermission({ ...p, [field]: !p[field] });
        if (field === 'canView' && !updated.canView) {
          return sanitizeModulePermission({ ...updated, canCreate: false, canApprove: false });
        }
        if ((field === 'canCreate' || field === 'canApprove') && updated[field]) {
          return sanitizeModulePermission({ ...updated, canView: true });
        }
        return updated;
      })
    );
  }, []);

  // Open create modal
  const openCreateModal = useCallback(() => {
    setSaveError(null);
    setNewRoleName('');
    setNewRoleDesc('');
    setNewRolePerms(buildDefaultPermissions());
    setShowCreateModal(true);
  }, []);

  // Create new role
  const handleCreateRole = useCallback(async () => {
    if (!newRoleName.trim()) return;
    setSaving(true);
    setSaveError(null);
    const name = newRoleName.trim();
    const desc = newRoleDesc.trim() || `Custom role: ${name}`;
    const perms = newRolePerms.map(sanitizeModulePermission);

    setShowCreateModal(false);
    try {
      await adminService.createRole({
        roleName: name,
        description: desc,
        permissions: perms,
      });
      await forceRefresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to create role');
      await forceRefresh();
    } finally {
      setSaving(false);
    }
  }, [newRoleName, newRoleDesc, newRolePerms, forceRefresh]);

  const handleDeleteRole = useCallback(async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setSaveError(null);
    const targetId = deleteTarget.id;
    setDeleteTarget(null);
    if (expandedRole === targetId) setExpandedRole(null);
    try {
      await adminService.deleteRole(String(targetId));
      await forceRefresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to delete role');
      await forceRefresh();
    } finally {
      setSaving(false);
    }
  }, [deleteTarget, expandedRole, forceRefresh]);

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage roles, define access levels, and configure module permissions</p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={openCreateModal}
          disabled={!hasPermission('Roles & Permissions', 'canCreate')}
          title={!hasPermission('Roles & Permissions', 'canCreate') ? 'Admin has not allowed this action. You do not have permission to create roles.' : 'Create new role'}
        >
          <Plus size={18} />
          Create Role
        </button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${roleFilter === 'all' && !showModulesList ? 'border-primary ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => { setRoleFilter('all'); setShowModulesList(false); }}
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield size={22} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold tracking-tight text-foreground">{summary.totalRoles}</span>
            <span className="text-sm text-muted-foreground">Total Roles</span>
          </div>
        </button>

        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${showModulesList ? 'border-primary ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => { setRoleFilter('all'); setShowModulesList((prev) => !prev); }}
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Lock size={22} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold tracking-tight text-foreground">{PERMISSION_MODULE_NAMES.length}</span>
            <span className="text-sm text-muted-foreground">Modules</span>
          </div>
        </button>

        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${roleFilter === 'system' ? 'border-primary ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => { setRoleFilter(roleFilter === 'system' ? 'all' : 'system'); setShowModulesList(false); }}
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <ShieldCheck size={22} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold tracking-tight text-foreground">{summary.systemRoles}</span>
            <span className="text-sm text-muted-foreground">System Roles</span>
          </div>
        </button>

        <button
          type="button"
          className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${roleFilter === 'custom' ? 'border-primary ring-2 ring-primary/10' : 'border-border/70'}`}
          onClick={() => { setRoleFilter(roleFilter === 'custom' ? 'all' : 'custom'); setShowModulesList(false); }}
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
            <ShieldAlert size={22} />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-semibold tracking-tight text-foreground">{summary.customRoles}</span>
            <span className="text-sm text-muted-foreground">Custom Roles</span>
          </div>
        </button>
      </div>

      {/* ── Inline Modules List ────────────────────────────── */}
      {showModulesList && (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/70 bg-muted/30 px-4 py-3 text-sm font-semibold text-foreground">
            <Lock size={16} className="text-primary" />
            <span>All Modules ({PERMISSION_MODULE_NAMES.length})</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[680px] grid-cols-[minmax(220px,1fr)_110px_110px_110px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="min-w-0 pr-3">Module</div>
              <div className="flex justify-center">View</div>
              <div className="flex justify-center">Create</div>
              <div className="flex justify-center">Approve</div>
            </div>
            {MODULE_CAPABILITIES.map((mod, idx) => (
              <div
                key={mod.module}
                className={`grid min-w-[680px] grid-cols-[minmax(220px,1fr)_110px_110px_110px] items-center border-b border-border/60 px-4 py-3 ${idx % 2 === 0 ? 'bg-muted/15' : ''}`}
              >
                <div className="min-w-0 pr-3">
                  <span className="block text-xs font-semibold text-foreground">{mod.module}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{mod.hint}</span>
                </div>
                {(['canView', 'canCreate', 'canApprove'] as PermissionField[]).map((field) => {
                  const supported = mod.supports.includes(field);
                  return (
                    <div key={field} className="flex justify-center">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${supported ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                        {supported ? field.replace('can', '') : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-xl">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            type="search"
            placeholder="Search roles by name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Role Cards ─────────────────────────────────────── */}
      <div className="space-y-3">
        {loading ? (
          <CardSkeleton count={3} />
        ) : (
          filtered.map((role) => {
            const isExpanded = expandedRole === role.id;
            const { granted: permCount, applicable: permTotal } = countGrantedPermissions(role.permissions);
            const permPercent = permTotal > 0 ? Math.round((permCount / permTotal) * 100) : 0;

            return (
              <div
                key={role.id}
                className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition ${isExpanded ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border/70'}`}
              >
                {/* Card Header */}
                <div
                  className="flex cursor-pointer items-center justify-between gap-4 p-5 transition hover:bg-muted/20"
                  onClick={() => toggleExpand(role.id)}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {ROLE_ICON_MAP[role.iconRole] ?? <Users size={20} />}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-base font-semibold text-foreground">{role.roleName}</span>
                        {role.isSystem && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            <Lock size={10} />
                            System
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 truncate text-xs text-muted-foreground">{role.description}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="hidden items-center gap-4 sm:flex">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Users size={14} />
                        <span>{role.userCount} user{role.userCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${permPercent}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">{permCount}/{permTotal}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                        title="Edit Permissions"
                        onClick={() => openEditModal(role)}
                        disabled={!hasPermission('Roles & Permissions', 'canCreate')}
                      >
                        <Edit3 size={15} />
                      </button>
                      {role.roleName !== 'Super Admin' && canDeleteRoles && (
                        <button
                          type="button"
                          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                          title="Delete Role"
                          onClick={() => setDeleteTarget(role)}
                          disabled={!hasPermission('Roles & Permissions', 'canCreate')}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
                        onClick={() => toggleExpand(role.id)}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Matrix */}
                {isExpanded && (
                  <div className="border-t border-border/70 bg-muted/10 p-5">
                    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                      <div className="grid min-w-[680px] grid-cols-[minmax(220px,1fr)_110px_110px_110px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <div>Module</div>
                        <div className="flex justify-center">View</div>
                        <div className="flex justify-center">Create</div>
                        <div className="flex justify-center">Approve</div>
                      </div>
                      {role.permissions.map((perm, idx) => (
                        <PermissionMatrixRow
                          key={perm.module}
                          perm={perm}
                          striped={idx % 2 === 0}
                          mode="view"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card py-12 text-center shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <Shield size={28} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">No roles found</h3>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filter or search criteria.</p>
        </div>
      )}

      {/* ── Edit Permissions Modal ──────────────────────────── */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setEditingRole(null)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Shield size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Edit Permissions</h2>
                  <p className="text-xs text-muted-foreground">Configure access level for role: <span className="font-semibold text-foreground">{editingRole.roleName}</span></p>
                </div>
              </div>
              <button type="button" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted" onClick={() => setEditingRole(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {saveError && <MessageStrip type="error" className="mb-4">{saveError}</MessageStrip>}
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="grid min-w-[680px] grid-cols-[minmax(220px,1fr)_110px_110px_110px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <div>Module</div>
                  <div className="flex justify-center">View</div>
                  <div className="flex justify-center">Create</div>
                  <div className="flex justify-center">Approve</div>
                </div>
                {editPermissions.map((perm, idx) => (
                  <PermissionMatrixRow
                    key={perm.module}
                    perm={perm}
                    striped={idx % 2 === 0}
                    mode="edit"
                    onToggle={(field) => togglePermission(idx, field)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setEditingRole(null)} disabled={saving}>Cancel</button>
              <button type="button" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50" onClick={savePermissions} disabled={saving}>
                {saving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Role Modal ───────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldPlus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Create New Role</h2>
                  <p className="text-xs text-muted-foreground">Define role name, description, and module permission rules</p>
                </div>
              </div>
              <button type="button" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {saveError && <MessageStrip type="error">{saveError}</MessageStrip>}
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Role Name *</label>
                  <input
                    type="text"
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    placeholder="e.g. Regional Procurement Officer"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Description</label>
                  <input
                    type="text"
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    placeholder="Role responsibilities overview..."
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="grid min-w-[680px] grid-cols-[minmax(220px,1fr)_110px_110px_110px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <div>Module</div>
                  <div className="flex justify-center">View</div>
                  <div className="flex justify-center">Create</div>
                  <div className="flex justify-center">Approve</div>
                </div>
                {newRolePerms.map((perm, idx) => (
                  <PermissionMatrixRow
                    key={perm.module}
                    perm={perm}
                    striped={idx % 2 === 0}
                    mode="edit"
                    onToggle={(field) => toggleNewPerm(idx, field)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setShowCreateModal(false)} disabled={saving}>Cancel</button>
              <button type="button" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50" onClick={handleCreateRole} disabled={saving || !newRoleName.trim()}>
                {saving ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertTriangle size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">Delete Role?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete role <span className="font-semibold text-foreground">"{deleteTarget.roleName}"</span>? This action cannot be undone.</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancel</button>
              <button type="button" className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50" onClick={handleDeleteRole} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
