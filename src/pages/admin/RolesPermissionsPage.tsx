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
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import './RolesPermissionsPage.css';

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
    return <span className="inline-flex items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold bg-muted text-muted-foreground">—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${granted ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>
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
    return <span className="inline-flex size-7 items-center justify-center text-xs text-muted-foreground font-medium">—</span>;
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className="inline-flex items-center justify-center p-1 rounded-full outline-none border-none ring-0 shadow-none !bg-transparent focus:outline-none focus:ring-0"
      onClick={onToggle}
      aria-label={`${field.replace('can', '')} permission for ${module}`}
    >
      <span
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
          value ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
            value ? 'translate-x-5' : 'translate-x-0'
          )}
        />
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
    <div
      className={cn(
        'grid min-w-[640px] grid-cols-[minmax(220px,1fr)_100px_100px_100px] items-center border-b border-border/50 px-4 py-3 transition-colors hover:bg-muted/40',
        striped ? 'bg-muted/15' : 'bg-card'
      )}
    >
      <div className="min-w-0 pr-4">
        <span className="block text-xs font-semibold text-foreground">{perm.module}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{hint}</span>}
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
  'Super Admin': <Crown size={18} />,
  Administrator: <Settings size={18} />,
  Manager: <UserCog size={18} />,
  'Finance Approver': <FileCheck size={18} />,
  Staff: <Users size={18} />,
};

const ROLE_ICON_TONE: Record<RoleName, string> = {
  'Super Admin': 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-300',
  Administrator: 'bg-primary/10 text-primary ring-primary/20',
  Manager: 'bg-cyan-500/10 text-cyan-600 ring-cyan-500/20 dark:text-cyan-300',
  'Finance Approver': 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-300',
  Staff: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300',
};

const ROLE_BAR_FILL: Record<RoleName, string> = {
  'Super Admin': 'bg-violet-500',
  Administrator: 'bg-primary',
  Manager: 'bg-cyan-500',
  'Finance Approver': 'bg-amber-500',
  Staff: 'bg-slate-400',
};

// ─── Component ──────────────────────────────────────────────

export default function RolesPermissionsPage() {
  const { roles: authRoles, hasPermission } = useAuth();
  const canDeleteRoles = authRoles.includes('Super Admin');

  const { data: roles, loading, error, forceRefresh } = useServiceData(
    () => adminService.listRoles().then((list) => list.map(mapRole)),
    [] as RoleData[],
    [],
    { cacheKey: 'roles:list' }
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
    <PageFrame className="space-y-6">
      {error && <MessageStrip type="error">{error}</MessageStrip>}

      {/* ── Header ─────────────────────────────────────────── */}
      <PageLead
        title="Roles & Permissions"
        description="Manage roles, define access levels, and configure module permissions"
        actions={
          <Button
            onClick={openCreateModal}
            disabled={!hasPermission('Roles & Permissions', 'canCreate')}
            title={
              !hasPermission('Roles & Permissions', 'canCreate')
                ? 'Admin has not allowed this action. You do not have permission to create roles.'
                : 'Create new role'
            }
            className="gap-2"
          >
            <Plus size={16} />
            Create Role
          </Button>
        }
      />

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Roles"
          value={summary.totalRoles}
          icon={Shield}
          tone="primary"
          aria-pressed={roleFilter === 'all' && !showModulesList}
          className="cursor-pointer"
          onClick={() => {
            setRoleFilter('all');
            setShowModulesList(false);
          }}
        />

        <MetricCard
          label="Modules"
          value={PERMISSION_MODULE_NAMES.length}
          icon={Lock}
          tone="warning"
          aria-pressed={showModulesList}
          className="cursor-pointer"
          onClick={() => {
            setRoleFilter('all');
            setShowModulesList((prev) => !prev);
          }}
        />

        <MetricCard
          label="System Roles"
          value={summary.systemRoles}
          icon={ShieldCheck}
          tone="success"
          aria-pressed={roleFilter === 'system'}
          className="cursor-pointer"
          onClick={() => {
            setRoleFilter(roleFilter === 'system' ? 'all' : 'system');
            setShowModulesList(false);
          }}
        />

        <MetricCard
          label="Custom Roles"
          value={summary.customRoles}
          icon={ShieldAlert}
          tone="violet"
          aria-pressed={roleFilter === 'custom'}
          className="cursor-pointer"
          onClick={() => {
            setRoleFilter(roleFilter === 'custom' ? 'all' : 'custom');
            setShowModulesList(false);
          }}
        />
      </div>

      {/* ── Inline Modules List ────────────────────────────── */}
      {showModulesList && (
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/70 bg-muted/30 px-5 py-3.5 text-sm font-semibold text-foreground">
            <Lock size={16} className="text-primary" />
            <span>All Modules ({PERMISSION_MODULE_NAMES.length})</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[640px] grid-cols-[minmax(220px,1fr)_100px_100px_100px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="min-w-0 pr-4">Module</div>
              <div className="flex justify-center">View</div>
              <div className="flex justify-center">Create</div>
              <div className="flex justify-center">Approve</div>
            </div>
            {MODULE_CAPABILITIES.map((mod, idx) => (
              <div
                key={mod.module}
                className={cn(
                  'grid min-w-[640px] grid-cols-[minmax(220px,1fr)_100px_100px_100px] items-center border-b border-border/50 px-4 py-3 transition-colors hover:bg-muted/30',
                  idx % 2 === 0 ? 'bg-muted/15' : 'bg-card'
                )}
              >
                <div className="min-w-0 pr-4">
                  <span className="block text-xs font-semibold text-foreground">{mod.module}</span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{mod.hint}</span>
                </div>
                {(['canView', 'canCreate', 'canApprove'] as PermissionField[]).map((field) => {
                  const supported = mod.supports.includes(field);
                  return (
                    <div key={field} className="flex justify-center">
                      {supported ? (
                        <Badge tone="emerald" variant="soft" className="px-2 py-0.5 text-[11px] font-medium">
                          {field.replace('can', '')}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground font-medium">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Search Toolbar ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search roles by name or description..."
            aria-label="Search roles and permissions"
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
            const toneClass = ROLE_ICON_TONE[role.iconRole] || ROLE_ICON_TONE.Staff;
            const barFillClass = ROLE_BAR_FILL[role.iconRole] || ROLE_BAR_FILL.Staff;

            return (
              <Card
                key={role.id}
                className={cn(
                  'overflow-hidden transition-all duration-200',
                  isExpanded ? 'border-primary/40 ring-2 ring-primary/10 shadow-md' : 'hover:border-border/90'
                )}
              >
                {/* Card Header */}
                <div
                  className="flex cursor-pointer items-center justify-between gap-4 p-4 sm:p-5 transition-colors hover:bg-muted/20"
                  onClick={() => toggleExpand(role.id)}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1', toneClass)}>
                      {ROLE_ICON_MAP[role.iconRole] ?? <Users size={18} />}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-base font-semibold text-foreground">{role.roleName}</span>
                        {role.isSystem && (
                          <Badge variant="secondary" className="gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                            <Lock size={9} />
                            System
                          </Badge>
                        )}
                      </div>
                      <span className="mt-0.5 truncate text-xs text-muted-foreground">{role.description}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="hidden items-center gap-5 sm:flex">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Users size={14} />
                        <span>{role.userCount} user{role.userCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div className={cn('h-full rounded-full transition-all duration-300', barFillClass)} style={{ width: `${permPercent}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">{permCount}/{permTotal}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                        title="Edit Permissions"
                        onClick={() => openEditModal(role)}
                        disabled={!hasPermission('Roles & Permissions', 'canCreate')}
                      >
                        <Edit3 size={15} />
                      </Button>
                      {role.roleName !== 'Super Admin' && canDeleteRoles && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                          title="Delete Role"
                          onClick={() => setDeleteTarget(role)}
                          disabled={!hasPermission('Roles & Permissions', 'canCreate')}
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:bg-muted"
                        onClick={() => toggleExpand(role.id)}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Expanded Matrix */}
                {isExpanded && (
                  <div className="border-t border-border/70 bg-muted/10 p-4 sm:p-5">
                    <Card className="overflow-hidden border-border/70 shadow-sm">
                      <div className="grid min-w-[640px] grid-cols-[minmax(220px,1fr)_100px_100px_100px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
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
                    </Card>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {filtered.length === 0 && !loading && (
        <EmptyState
          icon={Shield}
          title="No roles found"
          description="Try adjusting your filter or search criteria."
          size="default"
        />
      )}

      {/* ── Edit Permissions Modal ──────────────────────────── */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setEditingRole(null)}>
          <Card className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border-border/70 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Shield size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Edit Permissions</h2>
                  <p className="text-xs text-muted-foreground">Configure access level for role: <span className="font-semibold text-foreground">{editingRole.roleName}</span></p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="size-9 rounded-lg" onClick={() => setEditingRole(null)}>
                <X size={18} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {saveError && <MessageStrip type="error" className="mb-4">{saveError}</MessageStrip>}
              <Card className="overflow-hidden border-border/70">
                <div className="grid min-w-[640px] grid-cols-[minmax(220px,1fr)_100px_100px_100px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
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
              </Card>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <Button variant="outline" onClick={() => setEditingRole(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={savePermissions} disabled={saving}>
                {saving ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Create Role Modal ───────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <Card className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border-border/70 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <ShieldPlus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Create New Role</h2>
                  <p className="text-xs text-muted-foreground">Define role name, description, and module permission rules</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="size-9 rounded-lg" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {saveError && <MessageStrip type="error">{saveError}</MessageStrip>}
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Role Name *</label>
                  <Input
                    type="text"
                    placeholder="e.g. Regional Procurement Officer"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Description</label>
                  <Input
                    type="text"
                    placeholder="Role responsibilities overview..."
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>
              </div>

              <Card className="overflow-hidden border-border/70">
                <div className="grid min-w-[640px] grid-cols-[minmax(220px,1fr)_100px_100px_100px] border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
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
              </Card>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleCreateRole} disabled={saving || !newRoleName.trim()}>
                {saving ? 'Creating...' : 'Create Role'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <Card className="w-full max-w-md overflow-hidden border-border/70 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
                <AlertTriangle size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Delete Role?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Are you sure you want to delete role <span className="font-semibold text-foreground">"{deleteTarget.roleName}"</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteRole} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete Role'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PageFrame>
  );
}

