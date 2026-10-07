import ColumnSettingsButton from '../../components/shared/ColumnSettingsButton';
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
  Plus, Search, Eye, Edit3, Trash2, Users, Shield, UserCheck, UserX,
  ChevronLeft, ChevronRight, X, UserPlus, Mail, Phone, Building2,
  Zap, LayoutList, LayoutGrid, CheckSquare, Smartphone, Clock,
  ShoppingCart, CheckCircle2, ArrowRight, ArrowLeft, Upload, FileText,
  BarChart3, GitBranch, ClipboardList, History, Award, Wallet, LayoutDashboard, Check
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { getPaginationPages } from '../../components/shared/TablePagination';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input, Select } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import '../../components/shared/ColumnCustomizer.css';
import './UsersPage.css';
import './users-workspace.css';
import UserAccessControls, { AccessSwitch } from './UserAccessControls';
import { useDialogFocus } from '../../hooks/useDialogFocus';

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
  accessBusy?: boolean;
}

function mapUser(
  u: User & { roles?: string[]; isMobileAccessEnabled?: boolean }
): MockUser {
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
    avatarMod: String((Array.from(String(u.id)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6) + 1),
    initials,
  };
}

// ─── Widget Registry ──────
const WIDGET_LIST = [
  { id: 'kpi-stats', name: 'KPI Statistics', icon: BarChart3, description: 'Key metrics overview' },
  { id: 'quick-actions', name: 'Quick Actions', icon: Zap, description: 'One-click shortcuts' },
  { id: 'procurement-pipeline', name: 'Procurement Pipeline', icon: GitBranch, description: 'RFQ status breakdown' },
  { id: 'pending-approvals', name: 'Pending Approvals', icon: Clock, description: 'Items awaiting approval' },
  { id: 'recent-rfqs', name: 'Recent RFQs', icon: ClipboardList, description: 'Latest RFQ activity' },
  { id: 'activity-timeline', name: 'Activity Timeline', icon: History, description: 'Recent actions feed' },
  { id: 'top-vendors', name: 'Top Vendors', icon: Award, description: 'Best performing vendors' },
  { id: 'spend-overview', name: 'Spend Overview', icon: Wallet, description: 'Monthly spend breakdown' },
];

// ─── Column Definitions ─────────────────────────────────────

interface UserColumnDef {
  key: string; label: string; defaultVisible: boolean; required?: boolean;
  width?: string; render?: (u: MockUser, fmtDate: (d: string) => string, fmtDT: (d: string | null) => string) => React.ReactNode;
}

const ALL_COLUMNS: UserColumnDef[] = [
  {
    key: 'user', label: 'User', defaultVisible: true, required: true, width: '330px',
    render: (u) => (
      <div className="users-table__user">
        <div className={`users-table__avatar users-table__avatar--${u.avatarMod}`}>
          {u.initials}
          <span className={`users-table__avatar-status users-table__avatar-status--${u.isActive ? 'active' : 'inactive'}`} />
        </div>
        <div className="users-table__user-info">
          <span className="users-table__user-name" title={u.fullName}>{u.fullName}</span>
          <span className="users-table__email" title={u.email}>{u.email}</span>
          {u.username !== u.email && <span className="users-table__user-username" title={`@${u.username}`}>@{u.username}</span>}
        </div>
      </div>
    ),
  },
  { key: 'email', label: 'Email', defaultVisible: false, width: '200px', render: (u) => <span className="users-table__email">{u.email}</span> },
  {
    key: 'role', label: 'Role', defaultVisible: true, required: true, width: '195px',
    render: (u) => {
      let tone: 'primary' | 'info' | 'warning' | 'neutral' | 'success' | 'danger' = 'neutral';
      if (u.role === 'Super Admin' || u.role === 'Administrator') tone = 'primary';
      else if (u.role.includes('Manager')) tone = 'info';
      else if (u.role.includes('Finance')) tone = 'warning';
      return <Badge tone={tone} className="users-role-pill" title={u.role}>{u.role}</Badge>;
    },
  },
  { key: 'department', label: 'Department', defaultVisible: true, width: '130px', render: (u) => <span className="users-table__dept">{u.department}</span> },
  {
    key: 'access', label: 'Access', defaultVisible: true, required: true, width: '190px',
  },
  { key: 'lastLogin', label: 'Last Login', defaultVisible: true, width: '160px', render: (u, _fd, fmtDT) => <span className="users-table__date">{fmtDT(u.lastLoginAt)}</span> },
  { key: 'joined', label: 'Joined', defaultVisible: false, width: '110px', render: (u, fmtDate) => <span className="users-table__date">{fmtDate(u.createdAt)}</span> },
  { key: 'phone', label: 'Phone', defaultVisible: false, width: '140px', render: (u) => <span className="users-table__date">{u.phone}</span> },
  { key: 'companyCode', label: 'Company Code', defaultVisible: false, width: '110px', render: (u) => <span className="users-table__date">{u.companyCode}</span> },
];

// ─── Component ──────────────────────────────────────────────

export default function UsersPage() {
  const { hasPermission, user: signedInUser } = useAuth();
  const userCompanyCode = signedInUser?.companyCode;

  const { data: users, loading, error, reload, forceRefresh } = useServiceData(
    () => adminService.listUsers().then((list) => list.map((u) => mapUser(u))),
    [] as MockUser[],
    [],
    { cacheKey: 'users:list' }
  );
  const { data: roleRecords } = useServiceData(
    () => adminService.listRoles(),
    [],
    [],
    { cacheKey: 'users:roles' }
  );

  const { data: departments } = useServiceData(
    () => companySettingsService.listDepartments(),
    [],
    [],
    { cacheKey: 'users:departments' }
  );

  const { data: positions } = useServiceData(
    () => companySettingsService.listPositions(),
    [],
    [],
    { cacheKey: 'users:positions' }
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
  const accessRequests = useRef(new Set<string>());
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
  const [widgetError, setWidgetError] = useState('');

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

  const anyModalOpen = !!(showModal || editingUser || deleteTarget || viewUser || sapToast?.visible || showBatchDeleteModal);
  useBodyScrollLock(anyModalOpen);
  const createDialogRef = useRef<HTMLDivElement>(null);
  const editDialogRef = useRef<HTMLDivElement>(null);
  const viewDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(createDialogRef, showModal, () => { if (!actionLoading) setShowModal(false); });
  useDialogFocus(editDialogRef, Boolean(editingUser), () => { if (!actionLoading) setEditingUser(null); });
  useDialogFocus(viewDialogRef, Boolean(viewUser), () => setViewUser(null));

  // ── Column state ────────────────────────────────────────────
  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const visibleColumns = useMemo(() => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)), [columnOrder, visibleKeys]);
  const handleToggleColumn = (key: string) => { if (ALL_COLUMNS.find(col => col.key === key)?.required) return; setVisibleKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
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
          accessBusy: pendingStatus.has(u.id) || pendingMobileStatus.has(u.id),
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
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
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
    if (!user || !hasPermission('User Management', 'canCreate') || accessRequests.current.has(id)) return;

    // Prevent toggling Super Admin
    if (user.role === 'Super Admin' || user.apiRoleName === 'Super Admin') {
      setPageMsg('Super Admin status cannot be changed.');
      return;
    }

    accessRequests.current.add(id);
    const newStatus = !user.isActive;

    // Instantly flip the toggle in local state (zero delay — before API call)
    setPendingStatus((prev) => {
      const next = new Map(prev);
      next.set(id, newStatus);
      return next;
    });

    try {
      await adminService.toggleUserStatus(id);
      await forceRefresh();
      setPageMsg(`Account access ${newStatus ? 'enabled' : 'disabled'} for ${user.fullName}.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Could not update user status');
    } finally {
      accessRequests.current.delete(id);
      setPendingStatus(prev => { const next = new Map(prev); next.delete(id); return next; });
    }
  }, [forceRefresh, users, hasPermission]);

  const toggleMobileActive = useCallback(async (id: string) => {
    setPageMsg(null);
    const user = users.find(u => u.id === id);
    if (!user || !user.isActive || !hasPermission('User Management', 'canCreate') || accessRequests.current.has(id)) return;
    accessRequests.current.add(id);
    const newStatus = !user.isMobileAccessEnabled;
    setPendingMobileStatus(prev => new Map(prev).set(id, newStatus));
    try {
      await adminService.toggleUserMobileAccess(id);
      await forceRefresh();
      setPageMsg(`Mobile app access ${newStatus ? 'enabled' : 'disabled'} for ${user.fullName}.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Could not update mobile access');
    } finally {
      accessRequests.current.delete(id);
      setPendingMobileStatus(prev => { const next = new Map(prev); next.delete(id); return next; });
    }
  }, [forceRefresh, users, hasPermission]);

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

  // ── handleCreateUser — shows SAP toast after creation ───────
  const handleCreateUser = useCallback(async () => {
    const roleName = selectedUserType === 'rfq' ? newPosition : newRole;

    if (actionLoading || !hasPermission('User Management', 'canCreate') || !selectedUserType || !newFullName.trim() || !newUsername.trim() || newPassword.length < 8 || !newEmail.trim()) return;
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

      // Configure widgets after the user has been created.
      setWidgetError('');
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
    newPhone, newCountryCode, newRole, newDepartment, newPosition, docAadhaar, docPan, docOffer,
    newMobileAccess, userCompanyCode, reload, actionLoading, hasPermission, isNewEmailInvalid,
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
    if (!editingUser || actionLoading || !hasPermission('User Management', 'canCreate')) return;
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
  }, [
    editingUser, editFullName, editEmail, isEditEmailInvalid, editPhone, editCountryCode,
    editDepartment, editRoleName, editMobileAccess, forceRefresh, actionLoading, hasPermission,
  ]);

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
    setWidgetError('');
    try {
      const prefs = await adminService.getUserWidgets(user.id);
      const enabledWidgetIds = prefs
        .filter((p) => p.isEnabled)
        .map((p) => p.widgetId);
      setSapToast({
        visible: true,
        userName: user.fullName,
        userId: user.id,
        selectedWidgets: enabledWidgetIds,
      });
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Could not load widget settings. Please try again.');
    }
  }, []);

  const handleSaveWidgets = useCallback(async () => {
    if (!sapToast || widgetSaving) return;
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
    } catch (err) {
      setWidgetError(err instanceof Error ? err.message : 'Could not save widget settings. Please try again.');
    } finally {
      setWidgetSaving(false);
    }
  }, [sapToast, widgetSaving]);

  const canCreateUser =
    newFullName.trim() &&
    newUsername.trim() &&
    newPassword.length >= 8 &&
    !isNewEmailInvalid &&
    selectedUserType !== null &&
    newEmail.trim() &&
    (selectedUserType === 'rfq' ? !!newPosition : !!newRole);

  const createUserMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!newFullName.trim()) missing.push('Full name');
    if (!newUsername.trim()) missing.push('Username');
    if (newPassword.length < 8) missing.push('Password (minimum 8 characters)');
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
    <PageFrame className="users-workspace">
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

      <PageLead
        title="User Management"
        description="Manage users, assign roles, and control access"
        actions={
          <div className="flex items-center gap-3">
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all",
              isUserLimitReached ? "bg-red-500/10 border-red-500 text-red-500" : "bg-muted/60 border-border text-foreground"
            )}>
              <Users size={16} />
              <span>Active Users: {summary.active} / {maxUsersAllowed} Limit</span>
            </div>

            <Button
              onClick={(!isUserLimitReached && hasPermission('User Management', 'canCreate')) ? openAddModal : undefined}
              disabled={isUserLimitReached || !hasPermission('User Management', 'canCreate')}
              title={!hasPermission('User Management', 'canCreate') ? 'Admin has not allowed this action. You do not have permission to add users.' : isUserLimitReached ? 'Company user limit reached. Please contact Procnex Support to upgrade.' : 'Add new staff user'}
            >
              <Plus /> Add User
            </Button>
          </div>
        }
      />

      {isUserLimitReached && (
        <div className="mb-4">
          <MessageStrip type="warning">
            <strong>Company User Limit Reached:</strong> Your organization has reached its maximum active user limit ({summary.active} / {maxUsersAllowed} active users). Please contact your service provider (Procnex Support) to upgrade your user limit.
          </MessageStrip>
        </div>
      )}

      {/* ── Summary KPI Cards ──────────────────────────────────── */}
      <div className="users-metrics mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Users, tone: 'primary' as const, value: summary.total, label: 'TOTAL USERS', detail: 'All registered users', mode: 'all' as const },
          { icon: UserCheck, tone: 'success' as const, value: summary.active, label: 'ACTIVE', detail: 'Active user accounts', mode: 'active' as const },
          { icon: UserX, tone: 'danger' as const, value: summary.inactive, label: 'INACTIVE', detail: 'Deactivated accounts', mode: 'inactive' as const },
          { icon: Shield, tone: 'violet' as const, value: summary.admins, label: 'ADMINS', detail: 'Admin & Super Admin', mode: 'admins' as const },
        ].map((c) => {
          const isActive = statusFilter === c.mode;
          return (
            <MetricCard
              key={c.label}
              icon={c.icon}
              tone={c.tone}
              value={c.value}
              label={c.label}
              detail={c.detail}
              className={cn(
                'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                isActive &&
                  'border-primary bg-primary/[0.08] dark:bg-primary/20'
              )}
              onClick={() => {
                setStatusFilter((prev) => prev === c.mode ? 'all' : c.mode);
                setCurrentPage(1);
              }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStatusFilter(prev => prev === c.mode ? 'all' : c.mode); setCurrentPage(1); } }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
            />
          );
        })}
      </div>

      {/* ── Search Toolbar & View Toggle ────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            aria-label="Search users"
            placeholder="Search by name, username, email, department, or role..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="flex items-center gap-2 justify-end shrink-0 sm:ml-auto">
          <div className="inline-flex rounded-xl border border-input bg-card p-1 shadow-xs">
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                view === 'table' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              onClick={() => setView('table')}
              title="Table view" aria-label="Table view" aria-pressed={view === 'table'}
            >
              <LayoutList size={15} />
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                view === 'card' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              onClick={() => setView('card')}
              title="Card view" aria-label="Card view" aria-pressed={view === 'card'}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating Bulk Action Banner ── */}
      {selectedUserIds.length > 0 && !showBatchDeleteModal && (
        <Card className="mb-4 flex flex-col gap-3 border-primary/35 bg-primary/[0.045] p-3 shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <CheckSquare size={18} className="text-primary" />
            <span><strong>{selectedUserIds.length}</strong> User(s) selected</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedUserIds([])}
            >
              Clear selection
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!hasPermission('User Management', 'canCreate')}
              title={!hasPermission('User Management', 'canCreate') ? "Admin has not allowed this action. You do not have permission to delete users." : undefined}
              onClick={() => {
                if (!hasPermission('User Management', 'canCreate')) return;
                setShowBatchDeleteModal(true);
              }}
            >
              <Trash2 /> Delete Selected ({selectedUserIds.length})
            </Button>
          </div>
        </Card>
      )}

      {/* ── Content ────────────────────────────────────────── */}
      {loading ? (
        view === 'table' ? (
          <Card className="overflow-hidden p-4">
            <TableSkeleton rows={5} columnWidths={['44px', ...visibleColumns.map((col) => col.width || '140px'), '164px']} />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )
      ) : paginated.length > 0 ? (
        view === 'table' ? (
          <Card className="overflow-hidden">
            <div className="users-table-wrap" role="region" aria-label="Users register" tabIndex={0}>
              <table className="users-table" style={{ tableLayout: 'fixed', minWidth: `${44 + 164 + visibleColumns.reduce((sum, col) => sum + parseInt(col.width || '140'), 0)}px` }}>
                <colgroup>
                  <col style={{ width: '44px' }} />
                  {visibleColumns.map((col) => (<col key={col.key} style={{ width: col.width || 'auto' }} />))}
                  <col style={{ width: '164px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all eligible users on this page"
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
                          <ColumnSettingsButton ref={colBtnRef} open={showColPanel} onClick={() => setShowColPanel((v) => !v)} />
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
                            aria-label={`Select ${user.fullName}`}
                            checked={selectedUserIds.includes(user.id)}
                            disabled={!hasPermission('User Management', 'canCreate')}
                            onChange={() => hasPermission('User Management', 'canCreate') && handleToggleSelect(user.id)}
                            style={{ cursor: hasPermission('User Management', 'canCreate') ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                            title={!hasPermission('User Management', 'canCreate') ? "Admin has not allowed this action. You do not have permission to select users." : undefined}
                          />
                        )}
                      </td>
                      {visibleColumns.map((col) => (
                        <td key={col.key}>
                          {col.key === 'access' ? (
                            <UserAccessControls user={user} canManage={hasPermission('User Management', 'canCreate')} busy={user.accessBusy}
                              onAccountChange={() => toggleActive(user.id)} onMobileChange={() => toggleMobileActive(user.id)} />
                          ) : col.render?.(user, formatDate, formatDateTime)}
                        </td>
                      ))}
                      <td>
                        <div className="users-table__actions">
                          <button type="button" className="users-table__action-btn" aria-label={`View ${user.fullName}`} title="View" onClick={() => openViewUser(user)}><Eye size={15} /></button>
                          <button
                            type="button"
                            className="users-table__action-btn"
                            aria-label={`Edit ${user.fullName}`}
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
                            aria-label={`Configure widgets for ${user.fullName}`} title={hasPermission('User Management', 'canCreate') ? "Widgets" : "Admin has not allowed this action. You do not have permission to configure widgets."}
                            onClick={() => hasPermission('User Management', 'canCreate') && openWidgetConfig(user)}
                            disabled={!hasPermission('User Management', 'canCreate')}
                            style={!hasPermission('User Management', 'canCreate') ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
                          >
                            <LayoutDashboard size={15} />
                          </button>
                          {user.role !== 'Super Admin' && (
                            <button
                              type="button"
                              className="users-table__action-btn users-table__action-btn--danger"
                              aria-label={`Delete ${user.fullName}`} title={hasPermission('User Management', 'canCreate') ? "Delete" : "Admin has not allowed this action. You do not have permission to delete users."}
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
                  {getPaginationPages(currentPage, totalPages).map((p, idx) =>
                    typeof p === 'number' ? (
                      <button key={p} className={`users-pagination__btn ${currentPage === p ? 'users-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
                    ) : (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground select-none">…</span>
                    )
                  )}
                  <button className="users-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <div className="users-cards-wrap">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginated.map((user) => {
                let roleTone: 'primary' | 'info' | 'warning' | 'neutral' | 'success' | 'danger' = 'neutral';
                if (user.role === 'Super Admin' || user.role === 'Administrator') roleTone = 'primary';
                else if (user.role.includes('Manager')) roleTone = 'info';
                else if (user.role.includes('Finance')) roleTone = 'warning';

                return (
                  <Card
                    key={user.id}
                    className="p-4 cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                    onClick={() => openViewUser(user)}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`users-table__avatar users-table__avatar--${user.avatarMod} size-10 text-sm`}>
                            {user.initials}
                          </div>
                          <div className="min-w-0 flex flex-col gap-1">
                            <span className="font-bold text-foreground text-sm truncate leading-none">
                              {user.fullName}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              @{user.username}
                            </span>
                          </div>
                        </div>

                        <span className={cn(
                          "size-2.5 rounded-full shrink-0 mt-1",
                          user.isActive ? "bg-emerald-500 ring-2 ring-emerald-500/20" : "bg-muted-foreground/40"
                        )} />
                      </div>

                      <div className="mb-4">
                        <Badge tone={roleTone} className="users-role-pill text-[10px] px-2 py-0.5 max-w-full truncate" title={user.role}>
                          {user.role}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                        <div className="flex items-center gap-2 truncate">
                          <Mail size={13} className="shrink-0 text-muted-foreground/70" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        <div className="flex items-center gap-2 truncate">
                          <Building2 size={13} className="shrink-0 text-muted-foreground/70" />
                          <span className="truncate">{user.department}</span>
                        </div>
                        {user.phone !== '—' && (
                          <div className="flex items-center gap-2 truncate">
                            <Phone size={13} className="shrink-0 text-muted-foreground/70" />
                            <span className="truncate">{user.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-4" onClick={event => event.stopPropagation()}>
                      <UserAccessControls user={user} canManage={hasPermission('User Management', 'canCreate')} busy={user.accessBusy} onAccountChange={() => toggleActive(user.id)} onMobileChange={() => toggleMobileActive(user.id)} />
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted-foreground">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">Last login</span>
                        <span className="font-medium text-foreground text-[11px]">{formatDateTime(user.lastLoginAt)}</span>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View ${user.fullName}`} title="View"
                          onClick={() => openViewUser(user)}
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${user.fullName}`} title={hasPermission('User Management', 'canCreate') ? "Edit" : "No permission"}
                          disabled={!hasPermission('User Management', 'canCreate')}
                          onClick={() => hasPermission('User Management', 'canCreate') && openEditUser(user)}
                        >
                          <Edit3 size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Configure widgets for ${user.fullName}`} title={hasPermission('User Management', 'canCreate') ? "Widgets" : "No permission"}
                          disabled={!hasPermission('User Management', 'canCreate')}
                          onClick={() => hasPermission('User Management', 'canCreate') && openWidgetConfig(user)}
                        >
                          <LayoutDashboard size={14} />
                        </Button>
                        {user.role !== 'Super Admin' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Delete ${user.fullName}`} title={hasPermission('User Management', 'canCreate') ? "Delete" : "No permission"}
                            disabled={!hasPermission('User Management', 'canCreate')}
                            onClick={() => hasPermission('User Management', 'canCreate') && setDeleteTarget(user)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            {filtered.length > perPage && (
              <Card className="users-cards-wrap__pagination">
                <div className="users-pagination">
                  <span className="users-pagination__info">
                    Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                  </span>
                  <div className="users-pagination__btns">
                    <button className="users-pagination__btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft size={14} /></button>
                    {getPaginationPages(currentPage, totalPages).map((p, idx) =>
                      typeof p === 'number' ? (
                        <button key={p} className={`users-pagination__btn ${currentPage === p ? 'users-pagination__btn--active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground select-none">…</span>
                      )
                    )}
                    <button className="users-pagination__btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight size={14} /></button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )
      ) : (
        <Card className="overflow-hidden">
          <EmptyState
            icon={Users}
            title="No users found"
            description={
              search
                ? 'Try adjusting your search criteria.'
                : statusFilter !== 'all'
                  ? statusFilter === 'admins'
                    ? 'No admin users found.'
                    : `No ${statusFilter} users match the current filters.`
                  : 'Create your first user to get started.'
            }
          />
        </Card>
      )}

      {/* ── Add User Modal ─────────────────────────────────── */}
      {showModal && (
        <div className="users-modal-backdrop" onClick={() => { if (!actionLoading) setShowModal(false); }}>
          <div ref={createDialogRef} role="dialog" aria-modal="true" aria-labelledby="users-create-title" tabIndex={-1} className={`users-modal ${modalStep === 2 ? 'users-modal--create' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="users-modal__header">
              <span id="users-create-title" className="users-modal__title">
                <UserPlus size={20} />
                {modalStep === 1 ? 'Select User Type' : 'Add New User'}
              </span>
              <button aria-label="Close dialog" className="users-modal__close" onClick={() => { if (!actionLoading) setShowModal(false); }}><X size={18} /></button>
            </div>

            {/* Step Indicator */}
            <div className="users-modal__steps" aria-label={`Create user: step ${modalStep} of 2`}>
              <div aria-current={modalStep === 1 ? 'step' : undefined} className={`users-modal__step ${modalStep >= 1 ? 'users-modal__step--active' : ''}`}>
                <div className="users-modal__step-dot">1</div>
                <span>User Type</span>
              </div>
              <div className="users-modal__step-line" />
              <div aria-current={modalStep === 2 ? 'step' : undefined} className={`users-modal__step ${modalStep >= 2 ? 'users-modal__step--active' : ''}`}>
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
                    <button type="button" aria-pressed={selectedUserType === 'rfq'} className={`users-modal__type-card ${selectedUserType === 'rfq' ? 'users-modal__type-card--selected' : ''}`} onClick={() => setSelectedUserType('rfq')}>
                      <div className="users-modal__type-card-icon users-modal__type-card-icon--rfq"><ShoppingCart size={28} /></div>
                      <div className="users-modal__type-card-check">{selectedUserType === 'rfq' && <CheckCircle2 size={22} />}</div>
                      <h3>P2P User</h3>
                      <p>Create a user for company positions like Purchase Clerk, Store Keeper, etc.</p>
                    </button>
                    <button type="button" aria-pressed={selectedUserType === 'heliflow'} className={`users-modal__type-card ${selectedUserType === 'heliflow' ? 'users-modal__type-card--selected' : ''}`} onClick={() => setSelectedUserType('heliflow')}>
                      <div className="users-modal__type-card-icon users-modal__type-card-icon--heliflow"><Zap size={28} /></div>
                      <div className="users-modal__type-card-check">{selectedUserType === 'heliflow' && <CheckCircle2 size={22} />}</div>
                      <h3>Workflow User</h3>
                      <p>Create a workflow user with access determined by their assigned role.</p>
                    </button>
                  </div>
                </div>
                <div className="users-modal__footer">
                  <button className="users-modal__btn users-modal__btn--secondary" onClick={() => { if (!actionLoading) setShowModal(false); }}>Cancel</button>
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
                    {selectedUserType === 'rfq' ? <ShoppingCart size={14} /> : <LayoutDashboard size={14} />}
                    {selectedUserType === 'rfq' ? 'P2P User' : 'Workflow User'}
                  </div>
                  <div className="users-modal__field">
                    <label htmlFor="users-newFullName" className="users-modal__label">Full Name <span className="users-required" aria-hidden="true">*</span></label>
                    <Input id="users-newFullName" disabled={actionLoading} className="users-modal__input" type="text" placeholder="e.g. Rahul Sharma" required value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
                  </div>
                  <div className="users-modal__row">
                    <div className="users-modal__field">
                      <label htmlFor="users-newUsername" className="users-modal__label">Username <span className="users-required" aria-hidden="true">*</span></label>
                      <Input id="users-newUsername" disabled={actionLoading} className="users-modal__input" type="text" placeholder="e.g. rahul.sharma" required value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                    </div>
                    <div className="users-modal__field">
                      <label htmlFor="users-newPassword" className="users-modal__label">Password <span className="users-required" aria-hidden="true">*</span></label>
                      <Input id="users-newPassword" disabled={actionLoading}
                        className={`users-modal__input ${newPassword && newPassword.length < 8 ? 'users-modal__input--invalid' : ''}`}
                        autoComplete="new-password" minLength={8} type="password" placeholder="Min 8 characters" required value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      {newPassword && newPassword.length < 8 && (
                        <p className="users-modal__field-hint">Password must be at least 8 characters ({newPassword.length}/8)</p>
                      )}
                    </div>
                  </div>
                  <div className="users-modal__row">
                    <div className="users-modal__field">
                      <label htmlFor="users-newEmail" className="users-modal__label"><Mail size={13} style={{ marginRight: 4 }} />Email <span className="users-required" aria-hidden="true">*</span></label>
                      <Input id="users-newEmail" disabled={actionLoading} aria-invalid={isNewEmailInvalid} aria-describedby={isNewEmailInvalid ? 'users-newEmail-error' : undefined}
                        className={`users-modal__input ${isNewEmailInvalid ? 'users-modal__input--invalid' : ''}`}
                        type="email"
                        placeholder="user@procnex.com"
                        required value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                      {isNewEmailInvalid && (
                        <p id="users-newEmail-error" className="users-modal__field-hint">
                          Please enter a complete valid email (e.g. name@domain.com)
                        </p>
                      )}
                    </div>
                    <div className="users-modal__field">
                      <label htmlFor="users-newPhone" className="users-modal__label"><Phone size={13} style={{ marginRight: 4 }} />Phone</label>
                      <PhoneInput
                        id="users-newPhone"
                        disabled={actionLoading}
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
                        <label htmlFor="users-newPosition" className="users-modal__label"><Shield size={13} style={{ marginRight: 4 }} />Position <span className="users-required" aria-hidden="true">*</span></label>
                        <Select id="users-newPosition" disabled={actionLoading} className="users-modal__select" required value={newPosition} onChange={(e) => setNewPosition(e.target.value)}>
                          <option value="">Select position</option>
                          {positionRoleOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                        </Select>
                      </div>
                      <div className="users-modal__field">
                        <label htmlFor="users-newDepartment" className="users-modal__label"><Building2 size={13} style={{ marginRight: 4 }} />Department</label>
                        <Select id="users-newDepartment" disabled={actionLoading} className="users-modal__select" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)}>
                          <option value="">Select department</option>
                          {departments.filter((d) => d.isActive).map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                        </Select>
                      </div>
                    </div>
                  )}
                  {selectedUserType === 'heliflow' && (
                    <div className="users-modal__row">
                      <div className="users-modal__field">
                        <label htmlFor="users-newRole" className="users-modal__label"><Shield size={13} style={{ marginRight: 4 }} />Role <span className="users-required" aria-hidden="true">*</span></label>
                        <Select id="users-newRole" disabled={actionLoading} className="users-modal__select" required value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                          <option value="">Select role</option>
                          {positionRoleOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                        </Select>
                      </div>
                      <div className="users-modal__field">
                        <label htmlFor="users-newDepartment" className="users-modal__label"><Building2 size={13} style={{ marginRight: 4 }} />Department</label>
                        <Select id="users-newDepartment" disabled={actionLoading} className="users-modal__select" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)}>
                          <option value="">Select department</option>
                          {departments.filter((d) => d.isActive).map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="users-mobile-setting">
                    <div className="users-mobile-setting__heading">
                      <span className="users-modal__label"><Smartphone size={18} /> Allow Mobile App Access</span>
                      <AccessSwitch checked={newMobileAccess} disabled={actionLoading} label="Allow Mobile App Access" onChange={() => setNewMobileAccess(value => !value)} />
                    </div>
                    <p>Allow this user to sign in from the mobile app.</p>
                  </div>
                  <div className="users-modal__docs-section">
                    <h4 className="users-modal__docs-title"><FileText size={15} /> Optional Documents</h4>
                    <p className="users-modal__docs-hint">Upload if available; this is not required to create the user.</p>
                    <div className="users-modal__docs-grid">
                      <label className={`users-modal__doc-card ${docAadhaar ? 'users-modal__doc-card--uploaded' : ''}`}>
                        <input ref={aadhaarRef} type="file" accept=".pdf,.jpg,.jpeg,.png" aria-label="Attach Aadhaar Card" disabled={actionLoading} className="sr-only" onChange={(e) => setDocAadhaar(e.target.files?.[0] || null)} />
                        {docAadhaar ? <CheckCircle2 size={22} /> : <Upload size={22} />}
                        <span className="users-modal__doc-card-label" title={docAadhaar ? docAadhaar.name : 'Aadhaar Card'}>{docAadhaar ? docAadhaar.name : 'Aadhaar Card'}</span>
                      </label>
                      <label className={`users-modal__doc-card ${docPan ? 'users-modal__doc-card--uploaded' : ''}`}>
                        <input ref={panRef} type="file" accept=".pdf,.jpg,.jpeg,.png" aria-label="Attach PAN Card" disabled={actionLoading} className="sr-only" onChange={(e) => setDocPan(e.target.files?.[0] || null)} />
                        {docPan ? <CheckCircle2 size={22} /> : <Upload size={22} />}
                        <span className="users-modal__doc-card-label" title={docPan ? docPan.name : 'PAN Card'}>{docPan ? docPan.name : 'PAN Card'}</span>
                      </label>
                      <label className={`users-modal__doc-card ${docOffer ? 'users-modal__doc-card--uploaded' : ''}`}>
                        <input ref={offerRef} type="file" accept=".pdf,.jpg,.jpeg,.png" aria-label="Attach Offer Letter" disabled={actionLoading} className="sr-only" onChange={(e) => setDocOffer(e.target.files?.[0] || null)} />
                        {docOffer ? <CheckCircle2 size={22} /> : <Upload size={22} />}
                        <span className="users-modal__doc-card-label" title={docOffer ? docOffer.name : 'Offer Letter'}>{docOffer ? docOffer.name : 'Offer Letter'}</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="users-modal__footer">
                  {!canCreateUser && createUserMissingFields.length > 0 && (
                    <p className="users-modal__footer-hint">Complete: <strong>{createUserMissingFields.join(', ')}</strong></p>
                  )}
                  <button className="users-modal__btn users-modal__btn--secondary" disabled={actionLoading} onClick={() => setModalStep(1)}>
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
          <div ref={viewDialogRef} role="dialog" aria-modal="true" aria-labelledby="users-view-title" tabIndex={-1} className="users-modal" onClick={(e) => e.stopPropagation()}>
            <div className="users-modal__header">
              <span id="users-view-title" className="users-modal__title"><Eye size={20} /> User Details</span>
              <button type="button" aria-label="Close dialog" className="users-modal__close" onClick={() => setViewUser(null)}><X size={18} /></button>
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
            <div className="users-modal__footer" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="users-modal__btn users-modal__btn--primary" disabled={!hasPermission('User Management', 'canCreate')} onClick={() => { setViewUser(null); openEditUser(viewUser); }}>
                <Edit3 size={16} /> Edit User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ─────────────────────────────────── */}
      {editingUser && (
        <div key={editingUser.id} className="users-modal-backdrop" onClick={() => !actionLoading && setEditingUser(null)}>
          <div ref={editDialogRef} role="dialog" aria-modal="true" aria-labelledby="users-edit-title" tabIndex={-1} className="users-modal" onClick={(e) => e.stopPropagation()}>
            <div className="users-modal__header">
              <span id="users-edit-title" className="users-modal__title"><Edit3 size={20} /> Edit User</span>
              <button type="button" aria-label="Close dialog" className="users-modal__close" onClick={() => { if (!actionLoading) setEditingUser(null); }}><X size={18} /></button>
            </div>
            <div className="users-modal__body">
              <div className="users-modal__field">
                <label htmlFor="users-editFullName" className="users-modal__label">Full Name <span className="users-required" aria-hidden="true">*</span></label>
                <Input id="users-editFullName" disabled={actionLoading} className="users-modal__input" required value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
              </div>
              <div className="users-modal__row">
                <div className="users-modal__field">
                  <label htmlFor="users-editEmail" className="users-modal__label">Email <span className="users-required" aria-hidden="true">*</span></label>
                  <Input id="users-editEmail" disabled={actionLoading} aria-invalid={isEditEmailInvalid} aria-describedby={isEditEmailInvalid ? 'users-editEmail-error' : undefined}
                    className={`users-modal__input ${isEditEmailInvalid ? 'users-modal__input--invalid' : ''}`}
                    type="email"
                    required value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                  {isEditEmailInvalid && (
                    <p id="users-editEmail-error" className="users-modal__field-hint">
                      Please enter a complete valid email (e.g. name@domain.com)
                    </p>
                  )}
                </div>
                <div className="users-modal__field">
                  <label htmlFor="users-editPhone" className="users-modal__label">Phone</label>
                  <PhoneInput
                    id="users-editPhone"
                    disabled={actionLoading}
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
                  <label htmlFor="users-editDepartment" className="users-modal__label">Department</label>
                  <Select id="users-editDepartment" disabled={actionLoading} className="users-modal__select" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)}>
                    <option value="">Select department</option>
                    {editDepartment && !departments.some(d => d.isActive && d.name === editDepartment) && <option value={editDepartment}>{editDepartment}</option>}
                    {departments.filter((d) => d.isActive).map((d) => (<option key={d.id} value={d.name}>{d.name}</option>))}
                  </Select>
                </div>
                <div className="users-modal__field">
                  <label htmlFor="users-editRoleName" className="users-modal__label">Role</label>
                  <Select id="users-editRoleName" disabled={actionLoading} className="users-modal__select" value={editRoleName} onChange={(e) => setEditRoleName(e.target.value)}>
                    <option value="">Select role / position</option>
                    {positionRoleOptions.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </Select>
                </div>
              </div>
              <div className="users-mobile-setting">
                    <div className="users-mobile-setting__heading">
                      <span className="users-modal__label"><Smartphone size={18} /> Allow Mobile App Access</span>
                      <AccessSwitch checked={editMobileAccess} disabled={!editingUser.isActive || actionLoading} label="Allow Mobile App Access" onChange={() => setEditMobileAccess(value => !value)} />
                    </div>
                    <p>{editingUser.isActive ? 'Allow this user to sign in from the mobile app.' : 'This account is inactive. Mobile permission is retained and takes effect when the account is active.'}</p>
                  </div>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-placeholder)' }}>
                Username: @{editingUser.username} (cannot be changed here)
              </p>
            </div>
            <div className="users-modal__footer">
              <button type="button" className="users-modal__btn users-modal__btn--secondary" disabled={actionLoading} onClick={() => { if (!actionLoading) setEditingUser(null); }}>Cancel</button>
              <button type="button" className="users-modal__btn users-modal__btn--primary" disabled={actionLoading || !editFullName.trim() || !editEmail.trim() || isEditEmailInvalid} onClick={handleSaveEdit}>
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
              <button type="button" aria-label="Close dialog" className="users-modal__close" onClick={() => setDeleteTarget(null)}><X size={18} /></button>
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

      {/* ── Widget Configuration Modal ────────────────────────────────── */}
      <Dialog open={Boolean(sapToast?.visible)} onOpenChange={(open) => { if (!open && !widgetSaving) setSapToast(null); }}>
        {sapToast?.visible && (
          <DialogContent className="users-workspace users-widget-dialog max-w-xl p-0 overflow-hidden sm:rounded-2xl">
            <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <LayoutDashboard size={20} />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">Configure Dashboard Widgets</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Select widgets to display on the dashboard for <strong className="text-foreground font-semibold">{sapToast.userName}</strong>
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              {widgetError && <MessageStrip type="error">{widgetError}</MessageStrip>}
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Available Widgets
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {WIDGET_LIST.map((widget) => {
                  const active = sapToast.selectedWidgets.includes(widget.id);
                  const Icon = widget.icon;
                  return (
                    <button
                      key={widget.id}
                      aria-pressed={active}
                      disabled={widgetSaving}
                      type="button"
                      onClick={() => toggleToastWidget(widget.id)}
                      className={cn(
                        "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        active
                          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                          : "border-border/80 bg-card hover:border-border hover:bg-accent/40"
                      )}
                    >
                      <Icon className="size-5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
                          {widget.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                          {widget.description}
                        </div>
                      </div>
                      <div className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-md border transition-all mt-0.5",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 bg-background"
                      )}>
                        {active && <Check className="size-3.5" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-medium text-muted-foreground mb-2 sm:mb-0">
                {sapToast.selectedWidgets.length} widget{sapToast.selectedWidgets.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={widgetSaving} onClick={() => setSapToast(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveWidgets}
                  disabled={widgetSaving}
                >
                  {widgetSaving ? 'Saving...' : 'Save & Apply'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Batch Delete Confirm Modal ────────────────────────── */}
      {showBatchDeleteModal && (
        <div className="users-modal-backdrop" onClick={() => !batchDeleting && setShowBatchDeleteModal(false)}>
          <div className="users-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="users-modal__header">
              <span className="users-modal__title"><Trash2 size={20} /> Delete {selectedUserIds.length} Selected User(s)?</span>
              <button type="button" aria-label="Close dialog" className="users-modal__close" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}><X size={18} /></button>
            </div>
            <div className="users-modal__body">
              <p style={{ margin: 0 }}>
                Are you sure you want to delete the <strong>{selectedUserIds.length} selected user(s)</strong>?
                This action cannot be undone.
              </p>
            </div>
            <div className="users-modal__footer">
              <button ref={(el) => el?.focus()} type="button" className="users-modal__btn users-modal__btn--secondary" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}>Cancel</button>
              <button type="button" className="users-modal__btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleBatchDeleteConfirm} disabled={batchDeleting}>
                {batchDeleting ? 'Deleting…' : `Delete ${selectedUserIds.length} User(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

    </PageFrame>
  );
}
