import React from 'react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { adminService } from '../../services/adminService';
import { companySettingsService } from '../../services/companySettingsService';
import { COUNTRY_CODES } from '../../config/countryCodes';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import PhoneInput from '../../components/shared/PhoneInput';
import type { User } from '../../types';
import {
  Plus,
  Search,
  Users,
  UserCheck,
  UserX,
  Shield,
  Eye,
  Edit3,
  Trash2,
  X,
  UserPlus,
  Mail,
  Phone,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ShoppingCart,
  Zap,
  LayoutList,
  LayoutGrid,
  CheckSquare,
  Smartphone,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import '../../components/shared/ColumnCustomizer.css';
import './UsersPage.css';

// ─── Types ──────────────────────────────────────────────────

type UserType = 'rfq' | 'heliflow';

interface MockUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  department: string;
  companyCode: string;
  role: string;
  apiRoleName: string;
  isActive: boolean;
  isMobileAccessEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  avatarMod: string;
  initials: string;
}

function mapUser(u: User & { roles?: string[]; isMobileAccessEnabled?: boolean }): MockUser {
  const rawRole = u.roles?.[0] || 'Staff';
  const role = rawRole;
  const initials = u.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone || '—',
    department: u.department || '—',
    companyCode: u.companyCode,
    role,
    apiRoleName: rawRole,
    isActive: u.isActive,
    isMobileAccessEnabled: u.isMobileAccessEnabled ?? false,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt.slice(0, 10),
    avatarMod: String((u.id % 6) + 1),
    initials,
  };
}

const ALL_ROLES: string[] = ['Super Admin', 'Administrator', 'Procurement Manager', 'Manager', 'Finance Approver', 'Purchase Clerk', 'Staff'];

const ROLE_CLASS_MAP: Record<string, string> = {
  'Super Admin': 'super-admin',
  Administrator: 'administrator',
  'Procurement Manager': 'manager',
  Manager: 'manager',
  'Finance Approver': 'finance-approver',
  'Finance Manager': 'finance-approver',
  'Purchase Clerk': 'manager',
  Staff: 'staff',
  Vendor: 'staff',
};

// ─── Widget Registry (inline — no extra import needed) ──────
const WIDGET_LIST = [
  { id: 'kpi-stats', name: 'KPI Statistics', icon: '📊', description: 'Key metrics overview' },
  { id: 'quick-actions', name: 'Quick Actions', icon: '⚡', description: 'One-click shortcuts' },
  { id: 'procurement-pipeline', name: 'Procurement Pipeline', icon: '🔄', description: 'RFQ status breakdown' },
  { id: 'pending-approvals', name: 'Pending Approvals', icon: '⏰', description: 'Items awaiting approval' },
  { id: 'recent-rfqs', name: 'Recent RFQs', icon: '📋', description: 'Latest RFQ activity' },
  { id: 'activity-timeline', name: 'Activity Timeline', icon: '📅', description: 'Recent actions feed' },
  { id: 'top-vendors', name: 'Top Vendors', icon: '🏆', description: 'Best performing vendors' },
  { id: 'spend-overview', name: 'Spend Overview', icon: '💰', description: 'Monthly spend breakdown' },
];

// ─── Column Definitions ─────────────────────────────────────

interface UserColumnDef {
  key: string; label: string; defaultVisible: boolean; required?: boolean;
  width?: string;  render: (u: MockUser, fmtDate: (d: string) => string, fmtDT: (d: string | null) => string, toggle: (id: string) => void, toggleMobile?: (id: string) => void, canCreate?: boolean) => React.ReactNode;
}

const ALL_COLUMNS: UserColumnDef[] = [
  {
    key: 'user', label: 'User', defaultVisible: true, required: true, width: '220px',
    render: (u) => (
      <div className="users-table__user">
        <div className={`users-table__avatar users-table__avatar--${u.avatarMod}`}>
          {u.initials}
          <span className={`users-table__avatar-status users-table__avatar-status--${u.isActive ? 'active' : 'inactive'}`} />
        </div>
        <div className="users-table__user-info">
          <span className="users-table__user-name">{u.fullName}</span>
          <span className="users-table__user-username">@{u.username}</span>
        </div>
      </div>
    ),
  },
  { key: 'email', label: 'Email', defaultVisible: true, width: '200px', render: (u) => <span className="users-table__email">{u.email}</span> },
  {
    key: 'role', label: 'Role', defaultVisible: true, width: '140px',
    render: (u) => <span className={`users-role-badge users-role-badge--${ROLE_CLASS_MAP[u.role] || 'staff'}`}>{u.role}</span>,
  },
  { key: 'department', label: 'Department', defaultVisible: true, width: '110px', render: (u) => <span className="users-table__dept">{u.department}</span> },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: '110px',
    render: (u, _fd, _fdt, toggle, _toggleMobile, canCreate = true) => {
      const isSuperAdmin = u.role === 'Super Admin' || u.apiRoleName === 'Super Admin';
      const isDisabled = isSuperAdmin || !canCreate;
      return (
        <div
          className={`users-status-toggle ${isDisabled ? 'users-status-toggle--disabled' : ''}`}
          onClick={() => !isDisabled && toggle(u.id)}
          title={!canCreate ? 'Admin has not allowed this action. You do not have permission to modify user status.' : isSuperAdmin ? 'Super Admin status cannot be changed' : ''}
          style={!canCreate ? { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
        >
          <div className={`users-status-toggle__track ${u.isActive ? 'users-status-toggle__track--active' : ''}`}>
            <div className="users-status-toggle__knob" />
          </div>
          <span className={`users-status-toggle__label users-status-toggle__label--${u.isActive ? 'active' : 'inactive'}`}>
            {u.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      );
    },
  },
  {
    key: 'mobileAccess', label: 'Mobile App Access', defaultVisible: true, width: '150px',
    render: (u, _fd, _fdt, _toggle, toggleMobile, canCreate = true) => {
      return (
        <div
          className={`users-status-toggle ${!canCreate ? 'users-status-toggle--disabled' : ''}`}
          onClick={() => canCreate && toggleMobile && toggleMobile(u.id)}
          title={!canCreate ? 'Admin has not allowed this action. You do not have permission to modify mobile access.' : 'Toggle Mobile App Access'}
          style={{ cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.6, pointerEvents: 'auto' }}
        >
          <div className={`users-status-toggle__track ${u.isMobileAccessEnabled ? 'users-status-toggle__track--active' : ''}`}>
            <div className="users-status-toggle__knob" />
          </div>
          <span className={`users-status-toggle__label users-status-toggle__label--${u.isMobileAccessEnabled ? 'active' : 'inactive'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Smartphone size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            {u.isMobileAccessEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      );
    },
  },
  { key: 'lastLogin', label: 'Last Login', defaultVisible: true, width: '130px', render: (u, _fd, fmtDT) => <span className="users-table__date">{fmtDT(u.lastLoginAt)}</span> },
  { key: 'joined', label: 'Joined', defaultVisible: true, width: '110px', render: (u, fmtDate) => <span className="users-table__date">{fmtDate(u.createdAt)}</span> },
  { key: 'phone', label: 'Phone', defaultVisible: false, width: '140px', render: (u) => <span className="users-table__date">{u.phone}</span> },
  { key: 'companyCode', label: 'Company Code', defaultVisible: false, width: '110px', render: (u) => <span className="users-table__date">{u.companyCode}</span> },
];

// ─── Component ──────────────────────────────────────────────

export default function UsersPage() {
  const { hasPermission, companyCode: userCompanyCode } = useAuth();
  const { data: users, loading, error, reload, forceRefresh } = useServiceData(
    () => adminService.listUsers().then((list) => list.map(mapUser)),
    [] as MockUser[],
    [],
    { cacheKey: 'users:list', cacheTtlMs: 0 }
  );
  const { data: roleRecords } = useServiceData(
    () => adminService.listRoles(),
    [],
    [],
    { cacheKey: 'users:roles', cacheTtlMs: 0 }
  );

  const { data: departments } = useServiceData(
    () => companySettingsService.listDepartments(),
    [],
    [],
    { cacheKey: 'users:departments', cacheTtlMs: 0 }
  );

  const { data: positions } = useServiceData(
    () => companySettingsService.listPositions(),
    [],
    [],
    { cacheKey: 'users:positions', cacheTtlMs: 0 }
  );

  // ── Company User Limit ──
  const [maxUsersAllowed, setMaxUsersAllowed] = useState<number>(50);
  useEffect(() => {
    (async () => {
      try {
        const prof = await companySettingsService.getCompanyProfile();
        if (prof?.maxUsers) {
          setMaxUsersAllowed(prof.maxUsers);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // ── Optimistic status toggle state ──────────────────────────
  const [pendingStatus, setPendingStatus] = useState<Map<string, boolean>>(new Map());
  const [pendingMobileStatus, setPendingMobileStatus] = useState<Map<string, boolean>>(new Map());

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'admins'>('all');
  const [view, setView] = useState<'table' | 'card'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);

  const [createModalError, setCreateModalError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MockUser | null>(null);
  const [viewUser, setViewUser] = useState<MockUser | null>(null);
  const [editingUser, setEditingUser] = useState<MockUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCountryCode, setEditCountryCode] = useState('+254');
  const [editPhone, setEditPhone] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRoleName, setEditRoleName] = useState('');
  const [editMobileAccess, setEditMobileAccess] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // ── SAP Widget Toast state (must be declared before useBodyScrollLock) ──
  const [sapToast, setSapToast] = useState<{
    visible: boolean;
    userName: string;
    userId: string;
    selectedWidgets: string[];
  } | null>(null);
  const [widgetSaving, setWidgetSaving] = useState(false);

  // ── Mobile Access Success Modal state ──
  const [mobileSuccessModal, setMobileSuccessModal] = useState<{
    visible: boolean;
    userName: string;
    isEnabled: boolean;
  } | null>(null);

  const assignableRoles = useMemo(
    () => roleRecords.map((r) => r.roleName).sort(),
    [roleRecords]
  );

  // Combine roles from DB (Roles & Permissions) with active company positions from DB
  const positionRoleOptions = useMemo(() => {
    const roleNames = roleRecords.map((r) => r.roleName);
    const positionNames = positions
      .filter((p) => p.isActive)
      .map((p) => p.name);
    const currentEditRole = editingUser?.apiRoleName || editingUser?.role;
    const all = [...roleNames, ...positionNames, currentEditRole].filter(Boolean) as string[];
    return [...new Set(all)].sort((a, b) => a.localeCompare(b));
  }, [roleRecords, positions, editingUser]);

  const perPage = 8;

  const anyModalOpen = !!(showModal || editingUser || deleteTarget || viewUser || sapToast?.visible || showBatchDeleteModal || mobileSuccessModal?.visible);
  useBodyScrollLock(anyModalOpen);

  // ── Column state ────────────────────────────────────────────
  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const visibleColumns = useMemo(() => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)), [columnOrder, visibleKeys]);
  const handleToggleColumn = (key: string) => { setVisibleKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
  const handleResetColumns = () => { setColumnOrder(defaultOrder); setVisibleKeys(new Set(defaultVisible)); };

  // Multi-step modal state
  const [modalStep, setModalStep] = useState(1);
  const [selectedUserType, setSelectedUserType] = useState<UserType | null>(null);

  // New user form state
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('+254');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<string>('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newMobileAccess, setNewMobileAccess] = useState(false);

  // Document uploads
  const [docAadhaar, setDocAadhaar] = useState<File | null>(null);
  const [docPan, setDocPan] = useState<File | null>(null);
  const [docOffer, setDocOffer] = useState<File | null>(null);
  const aadhaarRef = useRef<HTMLInputElement>(null);
  const panRef = useRef<HTMLInputElement>(null);
  const offerRef = useRef<HTMLInputElement>(null);

  // ── Merge optimistic status into display data ───────────────
  // Any user with a pending status override uses that instead of the server value.
  // This makes the toggle reflect instantly in ALL places (table, summary cards).
  const displayUsers = useMemo(
    () =>
      users.map((u) => {
        const activeOverride = pendingStatus.get(u.id);
        const mobileOverride = pendingMobileStatus.get(u.id);
        return {
          ...u,
          isActive: activeOverride !== undefined ? activeOverride : u.isActive,
          isMobileAccessEnabled: mobileOverride !== undefined ? mobileOverride : u.isMobileAccessEnabled,
        };
      }),
    [users, pendingStatus, pendingMobileStatus]
  );

  // Summary
  const summary = useMemo(() => ({
    total: displayUsers.length,
    active: displayUsers.filter((u) => u.isActive).length,
    inactive: displayUsers.filter((u) => !u.isActive).length,
    admins: displayUsers.filter((u) => u.role === 'Super Admin' || u.role === 'Administrator').length,
  }), [displayUsers]);

  const filtered = useMemo(() => {
    let list = displayUsers;
    if (statusFilter === 'active') list = list.filter((u) => u.isActive);
    else if (statusFilter === 'inactive') list = list.filter((u) => !u.isActive);
    else if (statusFilter === 'admins') list = list.filter((u) => u.role === 'Super Admin' || u.role === 'Administrator');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q)
      );
    }
    return list;
  }, [displayUsers, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  // ── Batch selection ──
  const isAllSelected = useMemo(() => {
    const selectable = paginated.filter(u => u.role !== 'Super Admin');
    if (selectable.length === 0) return false;
    return selectable.every(u => selectedUserIds.includes(u.id));
  }, [paginated, selectedUserIds]);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      const paginatedIds = new Set(paginated.map(u => u.id));
      setSelectedUserIds(prev => prev.filter(id => !paginatedIds.has(id)));
    } else {
      const newIds = paginated.filter(u => u.role !== 'Super Admin').map(u => u.id);
      setSelectedUserIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  }, [isAllSelected, paginated]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleBatchDeleteConfirm = useCallback(async () => {
    if (selectedUserIds.length === 0) return;
    setBatchDeleting(true);
    try {
      for (const id of selectedUserIds) {
        await adminService.deleteUser(id).catch(() => {});
      }
      setPageMsg(`Successfully deleted ${selectedUserIds.length} user(s).`);
      setSelectedUserIds([]);
      setShowBatchDeleteModal(false);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete selected users');
    } finally {
      setBatchDeleting(false);
    }
  }, [selectedUserIds, reload]);

  const toggleActive = useCallback(async (id: string) => {
    setPageMsg(null);
    // Find current user and compute the new status BEFORE the API call
    const user = users.find((u) => u.id === id);
    if (!user) return;

    // Prevent toggling Super Admin
    if (user.role === 'Super Admin' || user.apiRoleName === 'Super Admin') {
      setPageMsg('Super Admin status cannot be changed.');
      return;
    }

    const newStatus = !user.isActive;

    // Instantly flip the toggle in local state (zero delay — before API call)
    setPendingStatus((prev) => {
      const next = new Map(prev);
      next.set(id, newStatus);
      return next;
    });

    try {
      await adminService.toggleUserStatus(id);
      // Clean up pending state — the background reload will pick up the real data
      setPendingStatus((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      reload();
    } catch (err) {
      // API failed — revert the optimistic toggle
      setPendingStatus((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setPageMsg(err instanceof Error ? err.message : 'Could not update user status');
    }
  }, [reload, users]);

  const toggleMobileActive = useCallback(async (id: string) => {
    setPageMsg(null);
    const user = users.find((u) => u.id === id);
    if (!user) return;

    const newStatus = !user.isMobileAccessEnabled;

    // Set optimistic status immediately - no flicker!
    setPendingMobileStatus((prev) => {
      const next = new Map(prev);
      next.set(id, newStatus);
      return next;
    });

    try {
      await adminService.toggleUserMobileAccess(id);

      // Show Success Modal Box instead of toast
      setMobileSuccessModal({
        visible: true,
        userName: user.fullName,
        isEnabled: newStatus,
      });

      // Reload in background (pendingMobileStatus keeps override until server data arrives)
      await reload();
    } catch (err) {
      // Revert optimistic override on error
      setPendingMobileStatus((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setPageMsg(err instanceof Error ? err.message : 'Could not update mobile access status');
    }
  }, [reload, users]);

  const openAddModal = useCallback(() => {
    setModalStep(1);
    setSelectedUserType(null);
    setNewFullName('');
    setNewUsername('');
    setNewPassword('');
    setNewEmail('');
    setNewCountryCode('+254');
    setNewPhone('');
    setNewRole('');
    setNewDepartment('');
    setNewPosition('');
    setNewMobileAccess(false);
    setDocAadhaar(null);
    setDocPan(null);
    setDocOffer(null);
    setCreateModalError(null);
    setShowModal(true);
  }, []);

  // ── handleCreateUser — shows SAP toast after creation ───────
  const handleCreateUser = useCallback(async () => {
    const roleName =
      selectedUserType === 'rfq'
        ? (newRole || newPosition || 'Purchase Clerk')
        : (newRole || 'Staff');

    if (!newFullName.trim() || !newUsername.trim() || !newPassword.trim() || !newEmail.trim()) return;
    if (isNewEmailInvalid) {
      setCreateModalError('Please enter a complete valid email address (e.g. user@domain.com)');
      return;
    }
    if (selectedUserType === 'heliflow' && !newRole) return;
    if (selectedUserType === 'rfq' && !newPosition) return;

    setActionLoading(true);
    setPageMsg(null);
    setCreateModalError(null);
    try {
      const created = await adminService.createUser({
        fullName: newFullName.trim(),
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        phone: newPhone.trim() ? `${newCountryCode}${newPhone.trim()}` : undefined,
        department: newDepartment || (selectedUserType === 'rfq' ? 'Procurement' : 'General'),
        position: selectedUserType === 'rfq' ? newPosition : undefined,
        companyCode: userCompanyCode || undefined,
        roleName,
        userType: selectedUserType || undefined,
        isMobileAccessEnabled: newMobileAccess,
        documents: {
          aadhaar: docAadhaar || undefined,
          pan: docPan || undefined,
          offerLetter: docOffer || undefined,
        },
      });
      setSearch('');
      setStatusFilter('all');
      setCurrentPage(1);
      setShowModal(false);
      await reload();

      // ✅ SAP Toast — widget permissions configure karo
      setSapToast({
        visible: true,
        userName: created.fullName,
        userId: created.id,
        selectedWidgets: [],
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setCreateModalError(message);
      setPageMsg(message);
    } finally {
      setActionLoading(false);
    }
  }, [
    selectedUserType, newFullName, newUsername, newPassword, newEmail,
    newPhone, newCountryCode, newRole, newDepartment, newPosition, docAadhaar, docPan, docOffer, reload,
  ]);

  const openViewUser = useCallback((user: MockUser) => { setViewUser(user); }, []);

  const openEditUser = useCallback((user: MockUser) => {
    setPageMsg(null);
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email);
    // Parse country code from existing phone
    const rawEditPhone = user.phone === '—' ? '' : user.phone;
    const matchedEditCc = COUNTRY_CODES.find((cc) => rawEditPhone.startsWith(cc.dial));
    if (matchedEditCc) {
      setEditCountryCode(matchedEditCc.dial);
      setEditPhone(rawEditPhone.slice(matchedEditCc.dial.length));
    } else {
      setEditCountryCode('+254');
      setEditPhone(rawEditPhone);
    }
    setEditDepartment(user.department === '—' ? '' : user.department);
    setEditRoleName(user.apiRoleName || user.role || '');
    setEditMobileAccess(user.isMobileAccessEnabled);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingUser) return;
    if (!editFullName.trim() || !editEmail.trim()) return;
    if (isEditEmailInvalid) {
      setPageMsg('Please enter a complete valid email address (e.g. user@domain.com)');
      return;
    }
    setActionLoading(true);
    setPageMsg(null);
    try {
      const updated = await adminService.updateUser(editingUser.id, {
        fullName: editFullName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() ? `${editCountryCode}${editPhone.trim()}` : undefined,
        department: editDepartment.trim() || undefined,
        roleName: editRoleName || undefined,
        isMobileAccessEnabled: editMobileAccess,
      });
      setPageMsg(`User "${updated.fullName}" updated successfully.`);
      setEditingUser(null);
      await forceRefresh();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setActionLoading(false);
    }
  }, [editingUser, editFullName, editEmail, editPhone, editCountryCode, editDepartment, editRoleName, editMobileAccess, forceRefresh]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    setPageMsg(null);
    try {
      await adminService.deleteUser(deleteTarget.id);
      setPageMsg(`User "${deleteTarget.fullName}" deleted.`);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActionLoading(false);
    }
  }, [deleteTarget, reload]);

  // ── SAP Widget Toast handlers ────────────────────────────────
  const toggleToastWidget = useCallback((id: string) => {
    setSapToast((prev) => {
      if (!prev) return prev;
      const has = prev.selectedWidgets.includes(id);
      return {
        ...prev,
        selectedWidgets: has
          ? prev.selectedWidgets.filter((w) => w !== id)
          : [...prev.selectedWidgets, id],
      };
    });
  }, []);

  // ── Open widget config for existing user ──────────────────────
  const openWidgetConfig = useCallback(async (user: MockUser) => {
    setPageMsg(null);
    try {
      const prefs =                    await adminService.getUserWidgets(user.id);
      const enabledWidgetIds = prefs
        .filter((p) => p.isEnabled)
        .map((p) => p.widgetId);
      setSapToast({
        visible: true,
        userName: user.fullName,
        userId: user.id,
        selectedWidgets: enabledWidgetIds,
      });
    } catch {
      // Fall back to empty selection on error
      setSapToast({
        visible: true,
        userName: user.fullName,
        userId: user.id,
        selectedWidgets: [],
      });
    }
  }, []);

  const handleSaveWidgets = useCallback(async () => {
    if (!sapToast) return;
    setWidgetSaving(true);
    try {
      await adminService.saveUserWidgets(
        sapToast.userId,
        WIDGET_LIST.map((w) => ({
          widgetId: w.id,
          isEnabled: sapToast.selectedWidgets.includes(w.id),
        }))
      );
      setPageMsg(`Dashboard widgets configured for "${sapToast.userName}" ✓`);
      setSapToast(null);
    } catch {
      setPageMsg('User created. Widget preferences can be set later.');
      setSapToast(null);
    } finally {
      setWidgetSaving(false);
    }
  }, [sapToast]);

  const canCreateUser =
    newFullName.trim() &&
    newUsername.trim() &&
    newPassword.trim().length >= 8 &&
    newEmail.trim() &&
    (selectedUserType === 'rfq' ? !!newPosition : !!newRole);

  const isNewEmailInvalid = useMemo(() => {
    if (!newEmail.trim()) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return !emailRegex.test(newEmail.trim());
  }, [newEmail]);

  const isEditEmailInvalid = useMemo(() => {
    if (!editEmail.trim()) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return !emailRegex.test(editEmail.trim());
  }, [editEmail]);

  const createUserMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!newFullName.trim()) missing.push('Full name');
    if (!newUsername.trim()) missing.push('Username');
    if (newPassword.trim().length < 8) missing.push('Password (minimum 8 characters)');
    if (!newEmail.trim()) {
      missing.push('Email');
    } else if (isNewEmailInvalid) {
      missing.push('Valid email (e.g. user@domain.com)');
    }
    if (selectedUserType === 'rfq' && !newPosition) missing.push('Position');
    if (selectedUserType === 'heliflow' && !newRole) missing.push('Role');
    return missing;
  }, [newFullName, newUsername, newPassword, newEmail, isNewEmailInvalid, newPosition, newRole, selectedUserType]);

  const canProceedStep1 = selectedUserType !== null;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const formatDateTime = (d: string | null) => {
    if (!d) return 'Never';
    const date = new Date(d);
    return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const isUserLimitReached = useMemo(() => {
    return summary.active >= maxUsersAllowed;
  }, [summary.active, maxUsersAllowed]);

  return (
    <div className="users-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {pageMsg && (
        <MessageStrip
          type={inferMessageType(pageMsg)}
          onClose={() => setPageMsg(null)}
          autoHideMs={2000}
        >
          {pageMsg}
        </MessageStrip>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="users-page__header">
        <div className="users-page__header-left">
          <h1>User Management</h1>
          <p>Manage users, assign roles, and control access</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: 'var(--radius-md, 8px)',
            background: isUserLimitReached ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface-hover)',
            border: isUserLimitReached ? '1px solid #ef4444' : '1px solid var(--border)',
            color: isUserLimitReached ? '#ef4444' : 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: 700,
          }}>
            <Users size={16} />
            <span>Active Users: {summary.active} / {maxUsersAllowed} Limit</span>
          </div>

          <button
            className="users-page__add-btn"
            onClick={(!isUserLimitReached && hasPermission('User Management', 'canCreate')) ? openAddModal : undefined}
            disabled={isUserLimitReached || !hasPermission('User Management', 'canCreate')}
            title={!hasPermission('User Management', 'canCreate') ? 'Admin has not allowed this action. You do not have permission to add users.' : isUserLimitReached ? 'Company user limit reached. Please contact Procnex Support to upgrade.' : 'Add new staff user'}
            style={(isUserLimitReached || !hasPermission('User Management', 'canCreate')) ? { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
          >
            <Plus size={18} />
            Add User
          </button>
        </div>
      </div>

      {isUserLimitReached && (
        <div style={{ marginBottom: '16px' }}>
          <MessageStrip type="warning">
            ⚠️ <strong>Company User Limit Reached:</strong> Your organization has reached its maximum active user limit ({summary.active} / {maxUsersAllowed} active users). Please contact your service provider (Procnex Support) to upgrade your user limit.
          </MessageStrip>
        </div>
      )}

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="users-summary">
        {[
          { icon: <Users size={22} />, val: summary.total, label: 'Total Users', cls: 'total', mode: 'all' as const },
          { icon: <UserCheck size={22} />, val: summary.active, label: 'Active', cls: 'active', mode: 'active' as const },
          { icon: <UserX size={22} />, val: summary.inactive, label: 'Inactive', cls: 'inactive', mode: 'inactive' as const },
          { icon: <Shield size={22} />, val: summary.admins, label: 'Admins', cls: 'admins', mode: 'admins' as const },
        ].map((c) => (
          <div
            key={c.cls}
            className={`users-summary-card ${statusFilter === c.mode ? 'users-summary-card--active' : ''}`}
            onClick={() => {
              setStatusFilter((prev) => prev === c.mode ? 'all' : c.mode);
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className={`users-summary-card__icon users-summary-card__icon--${c.cls}`}>{c.icon}</div>
            <div className="users-summary-card__info">
              <span className="users-summary-card__value">{c.val}</span>
              <span className="users-summary-card__label">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="users-toolbar">
        <div className="users-toolbar__search">
          <Search size={16} className="users-toolbar__search-icon" />
          <input
            type="search"
            name="usersTableSearch"
            autoComplete="off"
            placeholder="Search by name, username, email, or department..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <div className="users-toolbar__right">
          <div className="users-toolbar__view-toggle">
            <button
              type="button"
              className={`users-toolbar__view-btn ${view === 'table' ? 'users-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('table')}
              title="Table view"
            >
              <LayoutList size={16} />
            </button>
            <button
              type="button"
              className={`users-toolbar__view-btn ${view === 'card' ? 'users-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('card')}
              title="Card view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating Bulk Action Banner ── */}
      {selectedUserIds.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-card)', border: '1px solid var(--primary-500)',
          padding: '12px 18px', borderRadius: 'var(--radius-md)', marginBottom: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)', transition: 'all 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            <CheckSquare size={18} style={{ color: 'var(--primary-500)' }} />
            <span><strong>{selectedUserIds.length}</strong> User(s) selected</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="users-modal__btn users-modal__btn--secondary"
              style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600 }}
              onClick={() => setSelectedUserIds([])}
            >
              Cancel Selection
            </button>
            <button
              type="button"
              disabled={!hasPermission('User Management', 'canCreate')}
              style={{
                background: hasPermission('User Management', 'canCreate') ? '#dc2626' : '#64748b',
                color: '#ffffff', border: 'none',
                padding: '7px 16px', fontSize: 13, fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                cursor: hasPermission('User Management', 'canCreate') ? 'pointer' : 'not-allowed',
                opacity: hasPermission('User Management', 'canCreate') ? 1 : 0.5,
                pointerEvents: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 6
              }}
              title={!hasPermission('User Management', 'canCreate') ? "Admin has not allowed this action. You do not have permission to delete users." : undefined}
              onClick={(e) => {
                if (!hasPermission('User Management', 'canCreate')) return;
                (e.currentTarget as HTMLElement).blur();
                setShowBatchDeleteModal(true);
              }}
            >
              <Trash2 size={14} /> Delete Selected ({selectedUserIds.length})
            </button>
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────── */}
      {loading ? (
        <div className="users-table-card">
          <TableSkeleton rows={4} columns={5} />
        </div>
      ) : paginated.length > 0 ? (
        view === 'table' ? (
          <div className="users-table-card">
            <div className="users-table-wrap">
              <table className="users-table" style={{ tableLayout: 'fixed', minWidth: '800px' }}>
                <colgroup>
                  <col style={{ width: '44px' }} />
                  {visibleColumns.map((col) => (<col key={col.key} style={{ width: col.width || 'auto' }} />))}
                  <col style={{ width: '130px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        disabled={!hasPermission('User Management', 'canCreate')}
                        onChange={hasPermission('User Management', 'canCreate') ? handleToggleSelectAll : undefined}
                        style={{ cursor: hasPermission('User Management', 'canCreate') ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                        title={!hasPermission('User Management', 'canCreate') ? "Admin has not allowed this action. You do not have permission to select users." : undefined}
                      />
                    </th>
                    {visibleColumns.map((col) => (<th key={col.key}>{col.label}</th>))}
                    <th>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>Actions</span>
                        <div className="col-btn-wrap">
                          <button ref={colBtnRef} className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`} onClick={() => setShowColPanel((v) => !v)} title="Customize columns" aria-label="Customize columns" aria-expanded={showColPanel}>
                            <span /><span /><span />
                          </button>
                          {showColPanel && (
                            <ColumnCustomizer columnOrder={columnOrder} visibleKeys={visibleKeys} allColumns={ALL_COLUMNS} onToggle={handleToggleColumn} onReorder={setColumnOrder} onReset={handleResetColumns} onClose={() => setShowColPanel(false)} anchorRef={colBtnRef} />
                          )}
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((user) => (
                    <tr key={user.id} className={`users-table__row users-table__row--${user.isActive ? 'active' : 'inactive'}`}>
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        {user.role !== 'Super Admin' && (
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(user.id)}
                            disabled={!hasPermission('User Management', 'canCreate')}
                            onChange={() => hasPermission('User Management', 'canCreate') && handleToggleSelect(user.id)}
                            style={{ cursor: hasPermission('User Management', 'canCreate') ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                            title={!hasPermission('User Management', 'canCreate') ? "Admin has not allowed this action. You do not have permission to select users." : undefined}
                          />
                        )}
                      </td>
                      {visibleColumns.map((col) => (<td key={col.key}>{col.render(user, formatDate, formatDateTime, toggleActive, toggleMobileActive, hasPermission('User Management', 'canCreate'))}</td>))}
                      <td>
                        <div className="users-table__actions">
                          <button type="button" className="users-table__action-btn" title="View" onClick={() => openViewUser(user)}><Eye size={15} /></button>
                          <button
                            type="button"
                            className="users-table__action-btn"
                            title={hasPermission('User Management', 'canCreate') ? "Edit" : "Admin has not allowed this action. You do not have permission to edit users."}
                            onClick={() => hasPermission('User Management', 'canCreate') && openEditUser(user)}
                            disabled={!hasPermission('User Management', 'canCreate')}
                            style={!hasPermission('User Management', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            className="users-table__action-btn"
                            title={hasPermission('User Management', 'canCreate') ? "Widgets" : "Admin has not allowed this action. You do not have permission to configure widgets."}
                            onClick={() => hasPermission('User Management', 'canCreate') && openWidgetConfig(user)}
                            disabled={!hasPermission('User Management', 'canCreate')}
                            style={!hasPermission('User Management', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
                          >
                            <Zap size={15} />
                          </button>
                          {user.role !== 'Super Admin' && (
                            <button
                              type="button"
                              className="users-table__action-btn users-table__action-btn--danger"
                              title={hasPermission('User Management', 'canCreate') ? "Delete" : "Admin has not allowed this action. You do not have permission to delete users."}
                              onClick={() => hasPermission('User Management', 'canCreate') && setDeleteTarget(user)}
                              disabled={!hasPermission('User Management', 'canCreate')}
                              style={!hasPermission('User Management', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > perPage && (
              <div className="users-pagination">
                <span className="users-pagination__info">
                  Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                </span>
                <div className="users-pagination__btns">
                  <button className="users-pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft size={14} /></button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} className={`users-pagination__btn ${currentPage === p ? 'users-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
                  ))}
                  <button className="users-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="users-cards-wrap">
            <div className="users-cards">
              {paginated.map((user) => (
                <div key={user.id} className="users-card" onClick={() => openViewUser(user)}>
                  <div className="users-card__top">
                    <div className={`users-card__avatar users-table__avatar--${user.avatarMod}`}>{user.initials}</div>
                    <div className="users-card__name-block">
                      <span className="users-card__name">{user.fullName}</span>
                      <span className={`users-role-badge users-role-badge--${ROLE_CLASS_MAP[user.role] || 'staff'}`}>{user.role}</span>
                    </div>
                    <span className={`users-card__status-dot ${user.isActive ? 'users-card__status-dot--active' : ''}`} />
                  </div>
                  <div className="users-card__details">
                    <div className="users-card__detail"><Mail size={12} /><span>{user.email}</span></div>
                    <div className="users-card__detail"><Building2 size={12} /><span>{user.department}</span></div>
                    {user.phone !== '—' && (
                      <div className="users-card__detail"><Phone size={12} /><span>{user.phone}</span></div>
                    )}
                  </div>
                  <div className="users-card__footer">
                    <div className="users-card__meta">
                      <span className="users-card__meta-label">Last login</span>
                      <span className="users-card__meta-value">{formatDateTime(user.lastLoginAt)}</span>
                    </div>
                    <div className="users-card__actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="users-table__action-btn" title="View" onClick={() => openViewUser(user)}><Eye size={15} /></button>
                      <button
                        type="button"
                        className="users-table__action-btn"
                        title={hasPermission('User Management', 'canCreate') ? "Edit" : "Admin has not allowed this action. You do not have permission to edit users."}
                        onClick={() => hasPermission('User Management', 'canCreate') && openEditUser(user)}
                        disabled={!hasPermission('User Management', 'canCreate')}
                        style={!hasPermission('User Management', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        className="users-table__action-btn"
                        title={hasPermission('User Management', 'canCreate') ? "Widgets" : "Admin has not allowed this action. You do not have permission to configure widgets."}
                        onClick={() => hasPermission('User Management', 'canCreate') && openWidgetConfig(user)}
                        disabled={!hasPermission('User Management', 'canCreate')}
                        style={!hasPermission('User Management', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
                      >
                        <Zap size={15} />
                      </button>
                      {user.role !== 'Super Admin' && (
                        <button
                          type="button"
                          className="users-table__action-btn users-table__action-btn--danger"
                          title={hasPermission('User Management', 'canCreate') ? "Delete" : "Admin has not allowed this action. You do not have permission to delete users."}
                          onClick={() => hasPermission('User Management', 'canCreate') && setDeleteTarget(user)}
                          disabled={!hasPermission('User Management', 'canCreate')}
                          style={!hasPermission('User Management', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > perPage && (
              <div className="users-table-card users-cards-wrap__pagination">
                <div className="users-pagination">
                  <span className="users-pagination__info">
                    Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                  </span>
                  <div className="users-pagination__btns">
                    <button className="users-pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft size={14} /></button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button key={p} className={`users-pagination__btn ${currentPage === p ? 'users-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
                    ))}
                    <button className="users-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight size={14} /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="users-table-card">
          <div className="users-empty">
            <div className="users-empty__icon"><Users size={48} /></div>
            <div className="users-empty__title">No users found</div>
            <div className="users-empty__desc">
              {search
                ? 'Try adjusting your search criteria.'
                : statusFilter !== 'all'
                  ? statusFilter === 'admins'
                    ? 'No admin users found.'
                    : `No ${statusFilter} users match the current filters.`
                  : 'Create your first user to get started.'}
            </div>
          </div>
        </div>
      )}

      {/* ── Add User Modal ─────────────────────────────────── */}
      {showModal && (
        <div className="users-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className={`users-modal ${modalStep === 2 ? 'users-modal--create' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="users-modal__header">
              <span className="users-modal__title">
                <UserPlus size={20} />
                {modalStep === 1 ? 'Select User Type' : 'Add New User'}
              </span>
              <button className="users-modal__close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            {/* Step Indicator */}
            <div className="users-modal__steps">
              <div className={`users-modal__step ${modalStep >= 1 ? 'users-modal__step--active' : ''}`}>
                <div className="users-modal__step-dot">1</div>
                <span>User Type</span>
              </div>
              <div className="users-modal__step-line" />
              <div className={`users-modal__step ${modalStep >= 2 ? 'users-modal__step--active' : ''}`}>
                <div className="users-modal__step-dot">2</div>
                <span>Details</span>
              </div>
            </div>

            {/* STEP 1 */}
            {modalStep === 1 && (
              <>
                <div className="users-modal__body">
                  <p className="users-modal__subtitle">Select the type of user you want to create</p>
                  <div className="users-modal__type-cards">
                    <div className={`users-modal__type-card ${selectedUserType === 'rfq' ? 'users-modal__type-card--selected' : ''}`} onClick={() => setSelectedUserType('rfq')}>
                      <div className="users-modal__type-card-icon users-modal__type-card-icon--rfq"><ShoppingCart size={28} /></div>
                      <div className="users-modal__type-card-check">{selectedUserType === 'rfq' && <CheckCircle2 size={22} />}</div>
                      <h3>RFQ User</h3>
                      <p>Create a user for company positions like Purchase Clerk, Store Keeper, etc.</p>
                    </div>
                    <div className={`users-modal__type-card ${selectedUserType === 'heliflow' ? 'users-modal__type-card--selected' : ''}`} onClick={() => setSelectedUserType('heliflow')}>
                      <div className="users-modal__type-card-icon users-modal__type-card-icon--heliflow"><Zap size={28} /></div>
                      <div className="users-modal__type-card-check">{selectedUserType === 'heliflow' && <CheckCircle2 size={22} />}</div>
                      <h3>Procnex User</h3>
                      <p>Platform user with full access. Requires document verification.</p>
                    </div>
                  </div>
                </div>
                <div className="users-modal__footer">
                  <button className="users-modal__btn users-modal__btn--secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="users-modal__btn users-modal__btn--primary" disabled={!canProceedStep1} onClick={() => setModalStep(2)}>
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}

            {/* STEP 2 */}
            {modalStep === 2 && (
              <>
                <div className="users-modal__body">
                  {createModalError && (
                    <MessageStrip type="error" compact className="sap-message-strip--flush">{createModalError}</MessageStrip>
                  )}
                  <div className="users-modal__type-badge">
                    {selectedUserType === 'rfq' ? <ShoppingCart size={14} /> : <Zap size={14} />}
                    {selectedUserType === 'rfq' ? 'RFQ User' : 'Procnex User'}
                  </div>
                  <div className="users-modal__field">
                    <label className="users-modal__label">Full Name <span>*</span></label>
                    <input className="users-modal__input" type="text" placeholder="e.g. Rahul Sharma" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
                  </div>
                  <div className="users-modal__row">
                    <div className="users-modal__field">
                      <label className="users-modal__label">Username <span>*</span></label>
                      <input className="users-modal__input" type="text" placeholder="e.g. rahul.sharma" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                    </div>
                    <div className="users-modal__field">
                      <label className="users-modal__label">Password <span>*</span></label>
                      <input
                        className={`users-modal__input ${newPassword && newPassword.length < 8 ? 'users-modal__input--invalid' : ''}`}
                        type="password" placeholder="Min 8 characters" value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      {newPassword && newPassword.length < 8 && (
                        <p className="users-modal__field-hint">Password must be at least 8 characters ({newPassword.length}/8)</p>
                      )}
                    </div>
                  </div>
                  <div className="users-modal__row">
                    <div className="users-modal__field">
                      <label className="users-modal__label"><Mail size={13} style={{ marginRight: 4 }} />Email <span>*</span></label>
                      <input
                        className={`users-modal__input ${isNewEmailInvalid ? 'users-modal__input--invalid' : ''}`}
                        type="email"
                        placeholder="user@procnex.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                      {isNewEmailInvalid && (
                        <p className="users-modal__field-hint" style={{ color: '#ef4444' }}>
                          Please enter a complete valid email (e.g. name@domain.com)
                        </p>
                      )}
                    </div>
                    <div className="users-modal__field">
                      <label className="users-modal__label"><Phone size={13} style={{ marginRight: 4 }} />Phone</label>
                      <PhoneInput
                        countryCode={newCountryCode}
                        onCountryCodeChange={setNewCountryCode}
                        value={newPhone}
                        onChange={setNewPhone}
                        placeholder="Type your mobile number"
                      />
                    </div>
                  </div>
                  {selectedUserType === 'rfq' && (
                    <div className="users-modal__row">
                      <div className="users-modal__field">
                        <label className="users-modal__label"><Shield size={13} style={{ marginRight: 4 }} />Position <span>*</span></label>
                        <select className="users-modal__select" value={newPosition} onChange={(e) => setNewPosition(e.target.value)}>
                          <option value="">Select position</option>
                          {positionRoleOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                        </select>
                      </div>
                      <div className="users-modal__field">
                        <label className="users-modal__label"><Building2 size={13} style={{ marginRight: 4 }} />Department</label>
                        <select className="users-modal__select" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)}>
                          <option value="">Select department</option>
                          {departments.filter((d) => d.isActive).map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                        </select>
                      </div>
                    </div>
                  )}
                  {selectedUserType === 'heliflow' && (
                    <div className="users-modal__row">
                      <div className="users-modal__field">
                        <label className="users-modal__label"><Shield size={13} style={{ marginRight: 4 }} />Role <span>*</span></label>
                        <select className="users-modal__select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                          <option value="">Select role</option>
                          {positionRoleOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                        </select>
                      </div>
                      <div className="users-modal__field">
                        <label className="users-modal__label"><Building2 size={13} style={{ marginRight: 4 }} />Department</label>
                        <select className="users-modal__select" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)}>
                          <option value="">Select department</option>
                          {departments.filter((d) => d.isActive).map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="users-modal__field" style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface-elevated, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                    <label className="users-modal__label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                      <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Smartphone size={18} strokeWidth={2} style={{ color: 'var(--primary-500, #0a6ed1)' }} /> Allow Mobile App Access</span>
                      <input
                        type="checkbox"
                        checked={newMobileAccess}
                        onChange={(e) => setNewMobileAccess(e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </label>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                      Allow this user to log in to the Mobile App.
                    </p>
                  </div>
                  <div className="users-modal__docs-section">
                    <h4 className="users-modal__docs-title"><FileText size={15} /> Optional Documents</h4>
                    <p className="users-modal__docs-hint">Upload if available; this is not required to create the user.</p>
                    <div className="users-modal__docs-grid">
                      <div className={`users-modal__doc-card ${docAadhaar ? 'users-modal__doc-card--uploaded' : ''}`} onClick={() => aadhaarRef.current?.click()}>
                        <input ref={aadhaarRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => setDocAadhaar(e.target.files?.[0] || null)} />
                        {docAadhaar ? <CheckCircle2 size={22} /> : <Upload size={22} />}
                        <span className="users-modal__doc-card-label" title={docAadhaar ? docAadhaar.name : 'Aadhaar Card'}>{docAadhaar ? docAadhaar.name : 'Aadhaar Card'}</span>
                      </div>
                      <div className={`users-modal__doc-card ${docPan ? 'users-modal__doc-card--uploaded' : ''}`} onClick={() => panRef.current?.click()}>
                        <input ref={panRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => setDocPan(e.target.files?.[0] || null)} />
                        {docPan ? <CheckCircle2 size={22} /> : <Upload size={22} />}
                        <span className="users-modal__doc-card-label" title={docPan ? docPan.name : 'PAN Card'}>{docPan ? docPan.name : 'PAN Card'}</span>
                      </div>
                      <div className={`users-modal__doc-card ${docOffer ? 'users-modal__doc-card--uploaded' : ''}`} onClick={() => offerRef.current?.click()}>
                        <input ref={offerRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => setDocOffer(e.target.files?.[0] || null)} />
                        {docOffer ? <CheckCircle2 size={22} /> : <Upload size={22} />}
                        <span className="users-modal__doc-card-label" title={docOffer ? docOffer.name : 'Offer Letter'}>{docOffer ? docOffer.name : 'Offer Letter'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="users-modal__footer">
                  {!canCreateUser && createUserMissingFields.length > 0 && (
                    <p className="users-modal__footer-hint">Complete: <strong>{createUserMissingFields.join(', ')}</strong></p>
                  )}
                  <button className="users-modal__btn users-modal__btn--secondary" onClick={() => setModalStep(1)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    type="button"
                    className="users-modal__btn users-modal__btn--primary"
                    disabled={!canCreateUser || actionLoading}
                    onClick={handleCreateUser}
                  >
                    <UserPlus size={16} />
                    {actionLoading ? 'Creating…' : 'Create User'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── View User Modal ─────────────────────────────────── */}
      {viewUser && (
        <div className="users-modal-backdrop" onClick={() => setViewUser(null)}>
          <div className="users-modal" onClick={(e) => e.stopPropagation()}>
            <div className="users-modal__header">
              <span className="users-modal__title"><Eye size={20} /> User Details</span>
              <button type="button" className="users-modal__close" onClick={() => setViewUser(null)}><X size={18} /></button>
            </div>
            <div className="users-modal__body">
              <div className="users-modal__field"><label className="users-modal__label">Full Name</label><p style={{ margin: 0 }}>{viewUser.fullName}</p></div>
              <div className="users-modal__row">
                <div className="users-modal__field"><label className="users-modal__label">Username</label><p style={{ margin: 0 }}>@{viewUser.username}</p></div>
                <div className="users-modal__field"><label className="users-modal__label">Role</label><p style={{ margin: 0 }}>{viewUser.role}{viewUser.apiRoleName !== viewUser.role ? ` (${viewUser.apiRoleName})` : ''}</p></div>
              </div>
              <div className="users-modal__row">
                <div className="users-modal__field"><label className="users-modal__label">Email</label><p style={{ margin: 0 }}>{viewUser.email}</p></div>
                <div className="users-modal__field"><label className="users-modal__label">Phone</label><p style={{ margin: 0 }}>{viewUser.phone}</p></div>
              </div>
              <div className="users-modal__row">
                <div className="users-modal__field"><label className="users-modal__label">Department</label><p style={{ margin: 0 }}>{viewUser.department}</p></div>
                <div className="users-modal__field"><label className="users-modal__label">Status</label><p style={{ margin: 0 }}>{viewUser.isActive ? 'Active' : 'Inactive'}</p></div>
              </div>
              <div className="users-modal__row">
                <div className="users-modal__field"><label className="users-modal__label">Mobile App Access</label><p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Smartphone size={15} strokeWidth={2} /> {viewUser.isMobileAccessEnabled ? 'Enabled' : 'Disabled'}</p></div>
                <div className="users-modal__field"><label className="users-modal__label">Last Login</label><p style={{ margin: 0 }}>{formatDateTime(viewUser.lastLoginAt)}</p></div>
              </div>
            </div>
            <div className="users-modal__footer">
              <button type="button" className="users-modal__btn users-modal__btn--secondary" onClick={() => setViewUser(null)}>Close</button>
              <button type="button" className="users-modal__btn users-modal__btn--primary" onClick={() => { setViewUser(null); openEditUser(viewUser); }}>
                <Edit3 size={16} /> Edit User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ─────────────────────────────────── */}
      {editingUser && (
        <div key={editingUser.id} className="users-modal-backdrop" onClick={() => !actionLoading && setEditingUser(null)}>
          <div className="users-modal" onClick={(e) => e.stopPropagation()}>
            <div className="users-modal__header">
              <span className="users-modal__title"><Edit3 size={20} /> Edit User</span>
              <button type="button" className="users-modal__close" onClick={() => setEditingUser(null)}><X size={18} /></button>
            </div>
            <div className="users-modal__body">
              <div className="users-modal__field">
                <label className="users-modal__label">Full Name <span>*</span></label>
                <input className="users-modal__input" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
              </div>
              <div className="users-modal__row">
                <div className="users-modal__field">
                  <label className="users-modal__label">Email <span>*</span></label>
                  <input
                    className={`users-modal__input ${isEditEmailInvalid ? 'users-modal__input--invalid' : ''}`}
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                  {isEditEmailInvalid && (
                    <p className="users-modal__field-hint" style={{ color: '#ef4444' }}>
                      Please enter a complete valid email (e.g. name@domain.com)
                    </p>
                  )}
                </div>
                <div className="users-modal__field">
                  <label className="users-modal__label">Phone</label>
                  <PhoneInput
                    countryCode={editCountryCode}
                    onCountryCodeChange={setEditCountryCode}
                    value={editPhone}
                    onChange={setEditPhone}
                    placeholder="Type your mobile number"
                  />
                </div>
              </div>
              <div className="users-modal__row">
                <div className="users-modal__field">
                  <label className="users-modal__label">Department</label>
                  <select className="users-modal__select" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)}>
                    <option value="">Select department</option>
                    {departments.filter((d) => d.isActive).map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                  </select>
                </div>
                <div className="users-modal__field">
                  <label className="users-modal__label">Role</label>
                  <select className="users-modal__select" value={editRoleName} onChange={(e) => setEditRoleName(e.target.value)}>
                    <option value="">Select role / position</option>
                    {positionRoleOptions.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                </div>
              </div>
              <div className="users-modal__field" style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface-elevated, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                <label className="users-modal__label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                  <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Smartphone size={18} strokeWidth={2} style={{ color: 'var(--primary-500, #0a6ed1)' }} /> Allow Mobile App Access</span>
                  <input
                    type="checkbox"
                    checked={editMobileAccess}
                    onChange={(e) => setEditMobileAccess(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                </label>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                  When enabled, this user can log in to the Mobile App.
                </p>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>
                Username: @{editingUser.username} (cannot be changed here)
              </p>
            </div>
            <div className="users-modal__footer">
              <button type="button" className="users-modal__btn users-modal__btn--secondary" disabled={actionLoading} onClick={() => setEditingUser(null)}>Cancel</button>
              <button type="button" className="users-modal__btn users-modal__btn--primary" disabled={actionLoading || !editFullName.trim() || !editEmail.trim()} onClick={handleSaveEdit}>
                {actionLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ────────────────────────────── */}
      {deleteTarget && (
        <div className="users-modal-backdrop" onClick={() => !actionLoading && setDeleteTarget(null)}>
          <div className="users-modal" onClick={(e) => e.stopPropagation()}>
            <div className="users-modal__header">
              <span className="users-modal__title"><Trash2 size={20} /> Delete user?</span>
              <button type="button" className="users-modal__close" onClick={() => setDeleteTarget(null)}><X size={18} /></button>
            </div>
            <div className="users-modal__body">
              <p style={{ margin: 0 }}>Remove <strong>{deleteTarget.fullName}</strong> (@{deleteTarget.username})? This cannot be undone.</p>
            </div>
            <div className="users-modal__footer">
              <button type="button" className="users-modal__btn users-modal__btn--secondary" disabled={actionLoading} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="users-modal__btn users-modal__btn--primary" style={{ background: '#dc2626' }} disabled={actionLoading} onClick={handleConfirmDelete}>
                {actionLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAP Widget Toast ────────────────────────────────── */}
      {sapToast?.visible && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, width: 400,
          background: 'var(--surface-card)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, overflow: 'hidden',
          animation: 'sapToastSlideIn 0.35s cubic-bezier(0.22,1,0.36,1)',
        }}>
          <style>{`
            @keyframes sapToastSlideIn {
              from { opacity: 0; transform: translateY(24px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          {/* Toast Header */}
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(10,110,209,0.08))',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✨</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Configure Dashboard</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Select widgets for <strong>{sapToast.userName}</strong>
                </div>
              </div>
            </div>
            <button onClick={() => setSapToast(null)} style={{
              width: 28, height: 28, border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6,
            }}>×</button>
          </div>

          {/* Widget Grid */}
          <div style={{ padding: '12px 14px', maxHeight: 300, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Select widgets to enable
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {WIDGET_LIST.map((widget) => {
                const active = sapToast.selectedWidgets.includes(widget.id);
                return (
                  <button
                    key={widget.id}
                    onClick={() => toggleToastWidget(widget.id)}
                    style={{
                      padding: '10px 12px',
                      border: `1.5px solid ${active ? 'var(--primary-500)' : 'var(--border)'}`,
                      borderRadius: 8,
                      background: active ? 'rgba(10,110,209,0.06)' : 'var(--surface)',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{widget.icon}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: active ? 'var(--primary-500)' : 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{widget.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3, marginTop: 2 }}>
                        {widget.description}
                      </div>
                    </div>
                    {active && (
                      <span style={{
                        marginLeft: 'auto', flexShrink: 0, width: 16, height: 16,
                        borderRadius: '50%', background: 'var(--primary-500)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700,
                      }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toast Footer */}
          <div style={{
            padding: '12px 14px', borderTop: '1px solid var(--border)',
            background: 'var(--surface-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {sapToast.selectedWidgets.length} widget{sapToast.selectedWidgets.length !== 1 ? 's' : ''} selected
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSapToast(null)} style={{
                padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 6,
                background: 'var(--surface-card)', color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Skip</button>
              <button onClick={handleSaveWidgets} disabled={widgetSaving} style={{
                padding: '8px 20px', border: 'none', borderRadius: 6,
                background: 'linear-gradient(135deg, #8b5cf6, #0a6ed1)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: widgetSaving ? 'not-allowed' : 'pointer',
                opacity: widgetSaving ? 0.7 : 1,
              }}>
                {widgetSaving ? 'Saving…' : 'Save & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Delete Confirm Modal ────────────────────────── */}
      {showBatchDeleteModal && (
        <div className="users-modal-backdrop" onClick={() => !batchDeleting && setShowBatchDeleteModal(false)}>
          <div className="users-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="users-modal__header">
              <span className="users-modal__title"><Trash2 size={20} /> Delete {selectedUserIds.length} Selected User(s)?</span>
              <button type="button" className="users-modal__close" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}><X size={18} /></button>
            </div>
            <div className="users-modal__body">
              <p style={{ margin: 0 }}>
                Are you sure you want to delete the <strong>{selectedUserIds.length} selected user(s)</strong>?
                This action cannot be undone.
              </p>
            </div>
            <div className="users-modal__footer">
              <button autoFocus type="button" className="users-modal__btn users-modal__btn--secondary" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}>Cancel</button>
              <button type="button" className="users-modal__btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleBatchDeleteConfirm} disabled={batchDeleting}>
                {batchDeleting ? 'Deleting…' : `Delete ${selectedUserIds.length} User(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Access Success Modal ────────────────────── */}
      {mobileSuccessModal?.visible && (
        <div className="users-modal-backdrop" onClick={() => setMobileSuccessModal(null)}>
          <div
            className="users-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 400,
              padding: '28px 24px 24px',
              textAlign: 'center',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
              position: 'relative',
            }}
          >
            {/* Header Close */}
            <button
              type="button"
              onClick={() => setMobileSuccessModal(null)}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '50%',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <X size={15} />
            </button>

            {/* Icon Badge */}
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: mobileSuccessModal.isEnabled
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(16, 185, 129, 0.1))'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.22), rgba(225, 29, 72, 0.1))',
                border: `1.5px solid ${mobileSuccessModal.isEnabled ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                boxShadow: `0 0 28px ${mobileSuccessModal.isEnabled ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Smartphone size={38} strokeWidth={2} color={mobileSuccessModal.isEnabled ? '#22c55e' : '#ef4444'} />
            </div>

            {/* Title */}
            <h3
              style={{
                margin: '0 0 8px',
                fontSize: 19,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Mobile Access {mobileSuccessModal.isEnabled ? 'Enabled' : 'Disabled'}
            </h3>

            {/* Subtitle */}
            <p
              style={{
                margin: '0 0 24px',
                fontSize: 14,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
              }}
            >
              Mobile App access for <strong style={{ color: 'var(--text-primary)' }}>{mobileSuccessModal.userName}</strong> has been {mobileSuccessModal.isEnabled ? 'granted successfully.' : 'revoked.'}
            </p>

            {/* Button */}
            <button
              type="button"
              onClick={() => setMobileSuccessModal(null)}
              style={{
                width: '100%',
                padding: '11px 0',
                borderRadius: 10,
                border: 'none',
                background: mobileSuccessModal.isEnabled
                  ? 'linear-gradient(135deg, #16a34a, #15803d)'
                  : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: mobileSuccessModal.isEnabled
                  ? '0 4px 14px rgba(22, 163, 74, 0.35)'
                  : '0 4px 14px rgba(220, 38, 38, 0.35)',
                transition: 'all 0.15s ease',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}