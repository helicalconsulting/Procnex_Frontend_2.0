import { useState, useMemo, useCallback, useEffect } from 'react';
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
  const isSystem = r.isSystem ?? (roleName === 'Super Admin' || roleName === 'Administrator');

  const permissions = PERMISSION_MODULE_NAMES.map((module) => {
    const fromApi = r.permissions?.find((p) => p.module === module);
    if (fromApi) return sanitizeModulePermission(fromApi);
    return sanitizeModulePermission(
      buildDefaultPermissions({
        canView: isSystem,
        canCreate: isSystem && roleName === 'Super Admin',
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
    return <span className="roles-perm-chip roles-perm-chip--na">—</span>;
  }
  return (
    <span className={`roles-perm-chip ${granted ? 'roles-perm-chip--granted' : 'roles-perm-chip--denied'}`}>
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
    return <span className="roles-perm-chip roles-perm-chip--na" title="Not applicable">—</span>;
  }
  return (
    <div className="roles-modal-toggle" onClick={onToggle} role="button" tabIndex={0}>
      <div className={`roles-modal-toggle__track ${value ? 'roles-modal-toggle__track--active' : ''}`}>
        <div className="roles-modal-toggle__knob" />
      </div>
    </div>
  );
}

function PermissionMatrixRow({
  perm,
  striped,
  mode,
  onToggle,
  variant = 'card',
}: {
  perm: ModulePermission;
  striped: boolean;
  mode: 'view' | 'edit';
  onToggle?: (field: PermissionField) => void;
  variant?: 'card' | 'modal';
}) {
  const hint = getModuleCapability(perm.module).hint;
  const p = variant === 'modal' ? 'roles-modal-matrix' : 'roles-perm-matrix';
  return (
    <div className={`${p}__row ${striped ? `${p}__row--striped` : ''}`}>
      <div className={`${p}__module-col`}>
        <span className={`${p}__module-name`}>{perm.module}</span>
        {hint && <span className="roles-perm-matrix__module-hint">{hint}</span>}
      </div>
      {(['canView', 'canCreate', 'canApprove'] as PermissionField[]).map((field) => (
        <div key={field} className={`${p}__perm-col`}>
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

const ROLE_CLASS_MAP: Record<RoleName, string> = {
  'Super Admin': 'super-admin',
  Administrator: 'administrator',
  Manager: 'manager',
  'Finance Approver': 'finance-approver',
  Staff: 'staff',
};

// ─── Component ──────────────────────────────────────────────

export default function RolesPermissionsPage() {
  const { roles: authRoles } = useAuth();
  const canDeleteRoles = authRoles.includes('Super Admin');

  const { data: roles, loading, error, reload } = useServiceData(
    () => adminService.listRoles().then((list) => list.map(mapRole)),
    [] as RoleData[]
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
    // Filter by type
    if (roleFilter === 'system') {
      result = result.filter((r) => r.isSystem);
    } else if (roleFilter === 'custom') {
      result = result.filter((r) => !r.isSystem);
    }
    // Filter by search
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
      await reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }, [editingRole, editPermissions, reload]);

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
    try {
      await adminService.createRole({
        roleName: newRoleName.trim(),
        description: newRoleDesc.trim() || `Custom role: ${newRoleName.trim()}`,
        permissions: newRolePerms.map(sanitizeModulePermission),
      });
      setShowCreateModal(false);
      await reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to create role');
    } finally {
      setSaving(false);
    }
  }, [newRoleName, newRoleDesc, newRolePerms, reload]);

  const handleDeleteRole = useCallback(async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setSaveError(null);
    try {
      await adminService.deleteRole(deleteTarget.id);
      setDeleteTarget(null);
      if (expandedRole === deleteTarget.id) setExpandedRole(null);
      await reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to delete role');
    } finally {
      setSaving(false);
    }
  }, [deleteTarget, expandedRole, reload]);

  return (
    <div className="roles-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="roles-page__header">
        <div className="roles-page__header-left">
          <h1>Roles & Permissions</h1>
          <p>Manage roles, define access levels, and configure module permissions</p>
        </div>
        <button className="roles-page__add-btn" onClick={openCreateModal}>
          <Plus size={18} />
          Create Role
        </button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="roles-summary">
        <div
          className={`roles-summary-card ${roleFilter === 'all' ? 'roles-summary-card--active' : ''}`}
          onClick={() => { setRoleFilter('all'); setShowModulesList(false); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setRoleFilter('all'); setShowModulesList(false); } }}
          title="Show all roles"
        >
          <div className="roles-summary-card__icon roles-summary-card__icon--total">
            <Shield size={22} />
          </div>
          <div className="roles-summary-card__info">
            <span className="roles-summary-card__value">{summary.totalRoles}</span>
            <span className="roles-summary-card__label">Total Roles</span>
          </div>
        </div>
        <div
          className={`roles-summary-card ${roleFilter === 'all' ? 'roles-summary-card--active' : ''}`}
          onClick={() => setShowModulesList((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowModulesList((prev) => !prev); }}
          title={showModulesList ? 'Hide modules list' : 'Show all modules and their capabilities'}
        >
          <div className="roles-summary-card__icon roles-summary-card__icon--perms">
            <Lock size={22} />
          </div>
          <div className="roles-summary-card__info">
            <span className="roles-summary-card__value">{PERMISSION_MODULE_NAMES.length}</span>
            <span className="roles-summary-card__label">Modules</span>
          </div>
        </div>
        <div
          className={`roles-summary-card ${roleFilter === 'system' ? 'roles-summary-card--active' : ''}`}
          onClick={() => { setRoleFilter(roleFilter === 'system' ? 'all' : 'system'); setShowModulesList(false); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setRoleFilter(roleFilter === 'system' ? 'all' : 'system'); setShowModulesList(false); } }}
          title="Show only system roles"
        >
          <div className="roles-summary-card__icon roles-summary-card__icon--system">
            <ShieldCheck size={22} />
          </div>
          <div className="roles-summary-card__info">
            <span className="roles-summary-card__value">{summary.systemRoles}</span>
            <span className="roles-summary-card__label">System Roles</span>
          </div>
        </div>
        <div
          className={`roles-summary-card ${roleFilter === 'custom' ? 'roles-summary-card--active' : ''}`}
          onClick={() => { setRoleFilter(roleFilter === 'custom' ? 'all' : 'custom'); setShowModulesList(false); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setRoleFilter(roleFilter === 'custom' ? 'all' : 'custom'); setShowModulesList(false); } }}
          title="Show only custom roles"
        >
          <div className="roles-summary-card__icon roles-summary-card__icon--custom">
            <ShieldAlert size={22} />
          </div>
          <div className="roles-summary-card__info">
            <span className="roles-summary-card__value">{summary.customRoles}</span>
            <span className="roles-summary-card__label">Custom Roles</span>
          </div>
        </div>
      </div>

      {/* ── Inline Modules List ────────────────────────────── */}
      {showModulesList && (
        <div className="roles-modules-list">
          <div className="roles-modules-list__header">
            <Lock size={16} />
            <span>All Modules ({PERMISSION_MODULE_NAMES.length})</span>
          </div>
          <div className="roles-modules-matrix">
            <div className="roles-modules-matrix__header">
              <div className="roles-modules-matrix__module-col">Module</div>
              <div className="roles-modules-matrix__perm-col">View</div>
              <div className="roles-modules-matrix__perm-col">Create</div>
              <div className="roles-modules-matrix__perm-col">Approve</div>
            </div>
            {MODULE_CAPABILITIES.map((mod, idx) => (
              <div
                key={mod.module}
                className={`roles-modules-matrix__row ${idx % 2 === 0 ? 'roles-modules-matrix__row--striped' : ''}`}
              >
                <div className="roles-modules-matrix__module-col">
                  <span className="roles-modules-matrix__module-name">{mod.module}</span>
                  <span className="roles-modules-matrix__module-hint">{mod.hint}</span>
                </div>
                {(['canView', 'canCreate', 'canApprove'] as PermissionField[]).map((field) => {
                  const supported = mod.supports.includes(field);
                  return (
                    <div key={field} className="roles-modules-matrix__perm-col">
                      <span className={`roles-module-tag ${supported ? 'roles-module-tag--yes' : 'roles-module-tag--no'}`}>
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
      <div className="roles-toolbar">
        <div className="roles-toolbar__search">
          <Search size={16} className="roles-toolbar__search-icon" />
          <input
            type="text"
            placeholder="Search roles by name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Role Cards ─────────────────────────────────────── */}
      <div className="roles-cards">
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
              className={`roles-card ${isExpanded ? 'roles-card--expanded' : ''}`}
            >
              {/* Card Header */}
              <div className="roles-card__header" onClick={() => toggleExpand(role.id)}>
                <div className="roles-card__header-left">
                  <div className={`roles-card__icon roles-card__icon--${ROLE_CLASS_MAP[role.iconRole] ?? 'staff'}`}>
                    {ROLE_ICON_MAP[role.iconRole] ?? <Users size={20} />}
                  </div>
                  <div className="roles-card__meta">
                    <div className="roles-card__name-row">
                      <span className="roles-card__name">{role.roleName}</span>
                      {role.isSystem && (
                        <span className="roles-card__system-badge">
                          <Lock size={10} />
                          System
                        </span>
                      )}
                    </div>
                    <span className="roles-card__desc">{role.description}</span>
                  </div>
                </div>
                <div className="roles-card__header-right">
                  <div className="roles-card__stats">
                    <div className="roles-card__stat">
                      <Users size={14} />
                      <span>{role.userCount} user{role.userCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="roles-card__perm-bar-wrap">
                      <div className="roles-card__perm-bar">
                        <div
                          className={`roles-card__perm-fill roles-card__perm-fill--${ROLE_CLASS_MAP[role.iconRole] ?? 'staff'}`}
                          style={{ width: `${permPercent}%` }}
                        />
                      </div>
                      <span className="roles-card__perm-label">{permCount}/{permTotal} perms</span>
                    </div>
                  </div>
                  <div className="roles-card__actions">
                    <>
                      <button
                        className="roles-card__action-btn"
                        title="Edit Permissions"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(role);
                        }}
                      >
                        <Edit3 size={15} />
                      </button>
                      {!role.isSystem && canDeleteRoles && role.userCount === 0 && (
                        <button
                          className="roles-card__action-btn roles-card__action-btn--danger"
                          title="Delete Role"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSaveError(null);
                            setDeleteTarget(role);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </>
                    <button
                      className="roles-card__action-btn"
                      title="View Permissions"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(role.id);
                      }}
                    >
                      <Eye size={15} />
                    </button>
                    <div className="roles-card__chevron">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Permission Matrix */}
              {isExpanded && (
                <div className="roles-card__body">
                  <div className="roles-perm-matrix">
                    <div className="roles-perm-matrix__header">
                      <div className="roles-perm-matrix__module-col">Module</div>
                      <div className="roles-perm-matrix__perm-col">
                        <Eye size={13} />
                        <span>View</span>
                      </div>
                      <div className="roles-perm-matrix__perm-col">
                        <Plus size={13} />
                        <span>Create</span>
                      </div>
                      <div className="roles-perm-matrix__perm-col">
                        <Check size={13} />
                        <span>Approve</span>
                      </div>
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
                  <div className="roles-card__body-actions">
                    <button
                      className="roles-card__edit-btn"
                      onClick={() => openEditModal(role)}
                    >
                      <Edit3 size={15} />
                      Edit Permissions
                    </button>
                  </div>
                  {role.isSystem && (
                    <div className="roles-card__system-notice">
                      <Info size={14} />
                      <span>System role — changes will affect all users with this role.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
        )}
      </div>

      {filtered.length === 0 && (
        <div className="roles-empty">
          <div className="roles-empty__icon">
            <Shield size={48} />
          </div>
          <div className="roles-empty__title">No roles found</div>
          <div className="roles-empty__desc">
            {search ? 'Try adjusting your search.' : 'Create a new role to get started.'}
          </div>
        </div>
      )}

      {/* ── Edit Permissions Modal ──────────────────────────── */}
      {editingRole && (
        <div className="roles-modal-backdrop" onClick={() => setEditingRole(null)}>
          <div className="roles-modal" onClick={(e) => e.stopPropagation()}>
            <div className="roles-modal__header">
              <div className="roles-modal__title">
                <Shield size={20} />
                <span>Edit Permissions — {editingRole.roleName}</span>
              </div>
              <button className="roles-modal__close" onClick={() => setEditingRole(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="roles-modal__info-bar">
              <Info size={14} />
              <span>
                Only relevant actions are shown per module (— = not applicable). Turning off View also clears Create and Approve for that module.
              </span>
            </div>

            <div className="roles-modal__body">
              <div className="roles-modal-matrix">
                <div className="roles-modal-matrix__header">
                  <div className="roles-modal-matrix__module-col">Module</div>
                  <div className="roles-modal-matrix__perm-col">View</div>
                  <div className="roles-modal-matrix__perm-col">Create</div>
                  <div className="roles-modal-matrix__perm-col">Approve</div>
                </div>
                {editPermissions.map((perm, idx) => (
                  <PermissionMatrixRow
                    key={perm.module}
                    perm={perm}
                    striped={idx % 2 === 0}
                    mode="edit"
                    variant="modal"
                    onToggle={(field) => togglePermission(idx, field)}
                  />
                ))}
              </div>
            </div>

            {saveError && (
              <MessageStrip type="error" compact style={{ margin: '0 24px' }}>
                {saveError}
              </MessageStrip>
            )}
            <div className="roles-modal__footer">
              <button
                className="roles-modal__btn roles-modal__btn--secondary"
                onClick={() => setEditingRole(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="roles-modal__btn roles-modal__btn--primary"
                onClick={savePermissions}
                disabled={saving}
              >
                <Check size={16} />
                {saving ? 'Saving…' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Role Modal ───────────────────────────────── */}
      {showCreateModal && (
        <div className="roles-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="roles-modal roles-modal--create" onClick={(e) => e.stopPropagation()}>
            <div className="roles-modal__header">
              <div className="roles-modal__title">
                <ShieldPlus size={20} />
                <span>Create New Role</span>
              </div>
              <button className="roles-modal__close" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="roles-modal__body">
              {/* Role details section */}
              <div className="roles-create-fields">
                <div className="roles-create-field">
                  <label className="roles-create-field__label">
                    <Type size={13} style={{ marginRight: 4 }} />
                    Role Name <span>*</span>
                  </label>
                  <input
                    className="roles-create-field__input"
                    type="text"
                    placeholder="e.g. Procurement Lead"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                </div>
                <div className="roles-create-field">
                  <label className="roles-create-field__label">
                    <AlignLeft size={13} style={{ marginRight: 4 }} />
                    Description
                  </label>
                  <textarea
                    className="roles-create-field__textarea"
                    placeholder="Brief description of this role's responsibilities..."
                    rows={3}
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                  />
                </div>
              </div>

              {/* Permissions section */}
              <div className="roles-create-perms-section">
                <div className="roles-create-perms-section__title">
                  <Shield size={15} />
                  <span>Module Permissions</span>
                </div>
                <div className="roles-modal-matrix">
                  <div className="roles-modal-matrix__header">
                    <div className="roles-modal-matrix__module-col">Module</div>
                    <div className="roles-modal-matrix__perm-col">View</div>
                    <div className="roles-modal-matrix__perm-col">Create</div>
                    <div className="roles-modal-matrix__perm-col">Approve</div>
                  </div>
                  {newRolePerms.map((perm, idx) => (
                    <PermissionMatrixRow
                      key={perm.module}
                      perm={perm}
                      striped={idx % 2 === 0}
                      mode="edit"
                      variant="modal"
                      onToggle={(field) => toggleNewPerm(idx, field)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {saveError && (
              <MessageStrip type="error" compact style={{ margin: '0 24px' }}>
                {saveError}
              </MessageStrip>
            )}
            <div className="roles-modal__footer">
              <button
                className="roles-modal__btn roles-modal__btn--secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="roles-modal__btn roles-modal__btn--primary"
                disabled={!newRoleName.trim() || saving}
                onClick={handleCreateRole}
              >
                <ShieldPlus size={16} />
                {saving ? 'Creating…' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="roles-modal-backdrop" onClick={() => !saving && setDeleteTarget(null)}>
          <div className="roles-modal" onClick={(e) => e.stopPropagation()}>
            <div className="roles-modal__header">
              <div className="roles-modal__title">
                <Trash2 size={20} />
                <span>Delete role?</span>
              </div>
              <button className="roles-modal__close" onClick={() => setDeleteTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="roles-modal__body">
              <p style={{ margin: 0 }}>
                Delete <strong>{deleteTarget.roleName}</strong>? This cannot be undone.
              </p>
              {saveError && (
                <MessageStrip type="error" compact style={{ marginTop: 12 }}>
                  {saveError}
                </MessageStrip>
              )}
            </div>
            <div className="roles-modal__footer">
              <button
                className="roles-modal__btn roles-modal__btn--secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="roles-modal__btn roles-modal__btn--primary"
                style={{ background: '#dc2626' }}
                onClick={handleDeleteRole}
                disabled={saving}
              >
                {saving ? 'Deleting…' : 'Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
