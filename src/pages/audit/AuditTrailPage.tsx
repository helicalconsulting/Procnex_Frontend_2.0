import { useState, useMemo, useCallback } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { localDataService, type AuditEntry as ServiceAuditEntry } from '../../services/localDataService';
import { adminService } from '../../services/adminService';
import {
  History, Search, ChevronLeft, ChevronRight, X, Clock,
  UserCog, CheckSquare, Settings,
  LogIn, Edit3, Trash2, Plus, Download, Filter, User, FileText, Calendar, RotateCcw,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { AuditExportModal } from './AuditExportModal';
import './AuditTrailPage.css';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOGIN' | 'EXPORT';
type AuditModule = 'RFQ' | 'Purchase Order' | 'Quotation' | 'Users' | 'Roles' | 'Vendors' | 'Approvals' | 'Auth' | 'Documents';

interface AuditEntry {
  id: number; action: AuditAction; module: AuditModule; description: string;
  performedBy: string; performedByInitials: string; avatarMod: string;
  ipAddress: string; referenceId: string; timestamp: string;
}

const ACTION_ICONS: Record<AuditAction, React.ReactNode> = {
  CREATE: <Plus size={14} />, UPDATE: <Edit3 size={14} />, DELETE: <Trash2 size={14} />,
  APPROVE: <CheckSquare size={14} />, REJECT: <X size={14} />, LOGIN: <LogIn size={14} />, EXPORT: <Download size={14} />,
};
const ACTION_CLS: Record<AuditAction, string> = {
  CREATE: 'create', UPDATE: 'update', DELETE: 'delete', APPROVE: 'approve', REJECT: 'reject', LOGIN: 'login', EXPORT: 'export',
};

function mapAuditEntry(e: any): AuditEntry {
  let userName = 'System Administrator';
  if (typeof e?.user === 'string' && e.user.trim()) {
    userName = e.user.trim();
  } else if (typeof e?.user === 'object' && e.user !== null) {
    userName = e.user.fullName || e.user.username || e.user.email || 'System Administrator';
  } else if (e?.performedBy) {
    if (typeof e.performedBy === 'string' && e.performedBy.trim()) {
      userName = e.performedBy.trim();
    } else if (typeof e.performedBy === 'object' && e.performedBy !== null) {
      userName = e.performedBy.fullName || e.performedBy.username || e.performedBy.email || 'System Administrator';
    }
  }

  if (userName === 'System User' || userName === 'System' || !userName) {
    userName = 'System Administrator';
  }

  const initials = String(userName)
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'SA';

  const actionRaw = typeof e?.action === 'string' ? e.action : (typeof e?.action === 'object' && e?.action ? JSON.stringify(e.action) : '');
  const actionUpper = actionRaw.toUpperCase();

  let action: AuditAction = 'UPDATE';
  if (actionUpper.includes('LOGIN')) action = 'LOGIN';
  else if (actionUpper.includes('CREATE') || actionUpper.includes('SUBMIT')) action = 'CREATE';
  else if (actionUpper.includes('REJECT')) action = 'REJECT';
  else if (actionUpper.includes('APPROVE') || actionUpper.includes('FORWARD') || actionUpper.includes('COMPLETE') || actionUpper.includes('SIGN')) action = 'APPROVE';
  else if (actionUpper.includes('DELETE')) action = 'DELETE';
  else if (actionUpper.includes('EXPORT')) action = 'EXPORT';

  const moduleMap: Record<string, AuditModule> = {
    AUTH: 'Auth',
    RFQ: 'RFQ',
    PO: 'Purchase Order',
    PURCHASE_ORDER: 'Purchase Order',
    'PO CREATION': 'Purchase Order',
    'PO_CREATION': 'Purchase Order',
    'PO_CREATE': 'Purchase Order',
    'CREATE_PO': 'Purchase Order',
    'PO Creation': 'Purchase Order',
    PR: 'Purchase Requisition',
    PURCHASE_REQUISITION: 'Purchase Requisition',
    GRN: 'Goods Receipt Note (GRN)',
    GOODS_RECEIPT: 'Goods Receipt Note (GRN)',
    VENDOR: 'Vendors',
    VENDORS: 'Vendors',
    QUOTATION: 'Quotation',
    QUOTATIONS: 'Quotation',
    CONTRACT: 'Contracts',
    CONTRACTS: 'Contracts',
    AP: 'Purchase Invoice',
    INVOICE: 'Purchase Invoice',
    PURCHASE_INVOICE: 'Purchase Invoice',
    'CREATE PURCHASE INVOICE': 'Purchase Invoice',
    'CREATE_PURCHASE_INVOICE': 'Purchase Invoice',
    'Create Purchase Invoice': 'Purchase Invoice',
    'ACCOUNTS PAYABLE': 'Purchase Invoice',
    'ACCOUNTS_PAYABLE': 'Purchase Invoice',
    'Accounts Payable': 'Purchase Invoice',
    PAYMENTS: 'Payment Voucher',
    PAYMENT: 'Payment Voucher',
    PAYMENT_VOUCHER: 'Payment Voucher',
    'CREATE PAYMENT VOUCHER': 'Payment Voucher',
    'CREATE_PAYMENT_VOUCHER': 'Payment Voucher',
    'Create Payment Voucher': 'Payment Voucher',
    USER: 'Users',
    USERS: 'Users',
    ROLES: 'Roles',
    APPROVALS: 'Approvals',
    APPROVAL: 'Approvals',
    DOCUMENTS: 'Documents',
    FORMS: 'Forms',
    FORM: 'Forms',
    ADMIN: 'Users',
  };

  const moduleRaw = typeof e?.module === 'string' ? e.module : (typeof e?.module === 'object' && e?.module ? (e.module.name || e.module.type || 'RFQ') : 'RFQ');

  let cleanDetails = typeof e?.details === 'string' ? e.details : (typeof e?.details === 'object' && e?.details !== null ? JSON.stringify(e.details) : (typeof e?.description === 'string' ? e.description : 'System activity logged'));

  const mongoIdRegex = /\b[0-9a-fA-F]{24}\b/g;
  cleanDetails = cleanDetails
    .replace(/QUOTATIONS#/gi, 'Quotation #')
    .replace(/Quotations#/gi, 'Quotation #')
    .replace(/RFQ#/gi, 'RFQ #')
    .replace(/PurchaseOrders#/gi, 'PO #')
    .replace(/AccountsPayable#/gi, 'Purchase Invoice #')
    .replace(/Accounts Payable#/gi, 'Purchase Invoice #')
    .replace(/Payments#/gi, 'Payment Voucher #')
    .replace(/SalesOrders#/gi, 'Sales Order #')
    .replace(/Contracts#/gi, 'Contract #')
    .replace(mongoIdRegex, (m) => `ID-${m.slice(-6).toUpperCase()}`);

  let cleanRef = typeof e?.referenceId === 'string' ? e.referenceId : (typeof e?.referenceId === 'number' ? String(e.referenceId) : '—');
  if (mongoIdRegex.test(cleanRef)) {
    cleanRef = `ID-${cleanRef.slice(-6).toUpperCase()}`;
  }

  const timestampStr = typeof e?.timestamp === 'string' ? e.timestamp : (e?.createdAt ? String(e.createdAt) : new Date().toISOString());
  const ip = typeof e?.ipAddress === 'string' ? e.ipAddress : '192.168.1.100';

  const rawId = e?.id;
  const entryId = typeof rawId === 'number' ? rawId : (typeof rawId === 'string' ? parseInt(rawId, 10) || Date.now() : Date.now());

  let targetModule: AuditModule = moduleMap[moduleRaw] || moduleMap[moduleRaw.toUpperCase()] || (moduleRaw as AuditModule) || 'RFQ';
  if (targetModule === ('PO Creation' as any) || moduleRaw === 'PO Creation' || moduleRaw === 'PO_CREATION') {
    targetModule = 'Purchase Order';
  } else if (targetModule === ('Accounts Payable' as any) || targetModule === ('Create Purchase Invoice' as any) || moduleRaw === 'AP' || moduleRaw === 'Accounts Payable' || moduleRaw === 'ACCOUNTS_PAYABLE') {
    targetModule = 'Purchase Invoice';
  } else if (targetModule === ('Create Payment Voucher' as any) || moduleRaw === 'Create Payment Voucher') {
    targetModule = 'Payment Voucher';
  }

  return {
    id: entryId,
    action,
    module: targetModule,
    description: cleanDetails,
    performedBy: String(userName),
    performedByInitials: String(initials),
    avatarMod: String((Math.abs(entryId) % 6) + 1),
    ipAddress: String(ip),
    referenceId: String(cleanRef),
    timestamp: String(timestampStr),
  };
}

const ACTION_FILTERS: ('ALL' | AuditAction)[] = ['ALL', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'EXPORT'];

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function AuditTrailPage() {
  const { data: auditLog, loading, error } = useServiceData(
    () => localDataService.getAuditTrail().then((list) => list.map(mapAuditEntry)),
    [] as AuditEntry[]
  );

  const { data: systemUsers } = useServiceData(
    () => adminService.listUsers(),
    []
  );

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<'ALL' | AuditAction>('ALL');
  const [userFilter, setUserFilter] = useState<string>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  useBodyScrollLock(!!detail || exportModalOpen);
  const perPage = 10;

  // Dynamically extract created system users (from User Management DB) + users in audit logs
  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();

    if (Array.isArray(systemUsers)) {
      for (const u of systemUsers) {
        const name = (u.fullName && u.fullName.trim()) || (u.username && u.username.trim());
        if (
          name &&
          name !== 'System User' &&
          name !== 'System' &&
          !name.startsWith('Deleted User') &&
          !name.startsWith('deleted_user_')
        ) {
          set.add(name);
        }
      }
    }

    for (const a of auditLog) {
      const name = a.performedBy && a.performedBy.trim();
      if (
        name &&
        name !== 'System User' &&
        name !== 'System' &&
        !name.startsWith('Deleted User') &&
        !name.startsWith('deleted_user_')
      ) {
        set.add(name);
      }
    }

    return Array.from(set).sort();
  }, [systemUsers, auditLog]);

  const uniqueModules = useMemo(() => {
    const set = new Set<string>();

    // Heliflow 3.0 System Modules (Filtered)
    const allowedModules = [
      'RFQ',
      'Quotation',
      'Purchase Order',
      'Purchase Invoice',
      'Payment Voucher',
      'Goods Receipt Note (GRN)',
      'Contracts',
      'Approvals',
      'Auth',
      'Forms',
    ];

    allowedModules.forEach(mod => set.add(mod));

    const excluded = new Set([
      'sales orders', 'sales order', 'salesorders', 'salesorder',
      'roles', 'role',
      'documents', 'document',
      'purchase requisitions', 'purchase requisition', 'pr',
      'users', 'user',
      'vendors', 'vendor',
      'po creation', 'po_creation', 'pocreation',
      'accounts payable', 'accounts_payable', 'accountspayable', 'ap',
      'create purchase invoice', 'create_purchase_invoice',
      'create payment voucher', 'create_payment_voucher',
    ]);

    for (const a of auditLog) {
      if (a.module && a.module.trim()) {
        const modTrim = a.module.trim();
        if (!excluded.has(modTrim.toLowerCase())) {
          set.add(modTrim);
        }
      }
    }

    return Array.from(set).sort();
  }, [auditLog]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const a of auditLog) {
      const d = new Date(a.timestamp);
      if (!isNaN(d.getTime())) {
        set.add(String(d.getFullYear()));
      }
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [auditLog]);

  const summary = useMemo(() => ({
    total: auditLog.length,
    today: auditLog.filter(a => a.timestamp.startsWith(new Date().toISOString().slice(0, 10))).length,
    actions: new Set(auditLog.map(a => a.action)).size,
    users: uniqueUsers.length,
  }), [auditLog, uniqueUsers]);

  const filterCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: auditLog.length };
    for (const a of auditLog) c[a.action] = (c[a.action] || 0) + 1;
    return c;
  }, [auditLog]);

  // Master Filter Engine: User-wise, Module-wise, Date/Month/Year-wise, Action-wise & Search
  const filtered = useMemo(() => {
    let list = auditLog;

    if (actionFilter !== 'ALL') {
      list = list.filter(a => a.action === actionFilter);
    }
    if (userFilter !== 'ALL') {
      list = list.filter(a => a.performedBy === userFilter);
    }
    if (moduleFilter !== 'ALL') {
      const mf = moduleFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
      list = list.filter(a => {
        const m = a.module.toLowerCase().replace(/[^a-z0-9]/g, '');
        return m === mf || m.includes(mf) || mf.includes(m);
      });
    }
    if (yearFilter !== 'ALL') {
      list = list.filter(a => {
        const d = new Date(a.timestamp);
        return !isNaN(d.getTime()) && String(d.getFullYear()) === yearFilter;
      });
    }
    if (monthFilter !== 'ALL') {
      list = list.filter(a => {
        const d = new Date(a.timestamp);
        return !isNaN(d.getTime()) && String(d.getMonth() + 1).padStart(2, '0') === monthFilter;
      });
    }
    if (fromDate) {
      const from = new Date(fromDate + 'T00:00:00');
      list = list.filter(a => {
        const d = new Date(a.timestamp);
        return !isNaN(d.getTime()) && d >= from;
      });
    }
    if (toDate) {
      const to = new Date(toDate + 'T23:59:59');
      list = list.filter(a => {
        const d = new Date(a.timestamp);
        return !isNaN(d.getTime()) && d <= to;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.description.toLowerCase().includes(q) ||
        a.performedBy.toLowerCase().includes(q) ||
        a.module.toLowerCase().includes(q) ||
        a.referenceId.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q)
      );
    }
    return list;
  }, [auditLog, actionFilter, userFilter, moduleFilter, yearFilter, monthFilter, fromDate, toDate, search]);

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (userFilter !== 'ALL') parts.push(`User: ${userFilter}`);
    if (moduleFilter !== 'ALL') parts.push(`Module: ${moduleFilter}`);
    if (yearFilter !== 'ALL') parts.push(`Year: ${yearFilter}`);
    if (monthFilter !== 'ALL') parts.push(`Month: ${monthFilter}`);
    if (fromDate) parts.push(`From: ${fromDate}`);
    if (toDate) parts.push(`To: ${toDate}`);
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    return parts.length > 0 ? parts.join(' | ') : 'All System Audit Logs';
  }, [userFilter, moduleFilter, yearFilter, monthFilter, fromDate, toDate, search]);

  const isFiltered = actionFilter !== 'ALL' || userFilter !== 'ALL' || moduleFilter !== 'ALL' || yearFilter !== 'ALL' || monthFilter !== 'ALL' || !!fromDate || !!toDate || !!search.trim();

  const resetFilters = useCallback(() => {
    setActionFilter('ALL');
    setUserFilter('ALL');
    setModuleFilter('ALL');
    setYearFilter('ALL');
    setMonthFilter('ALL');
    setFromDate('');
    setToDate('');
    setSearch('');
    setCurrentPage(1);
  }, []);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const formatDateTime = (d: string) => {
    if (!d || typeof d !== 'string') return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const timeAgo = (d: string) => {
    if (!d || typeof d !== 'string') return 'Just now';
    const date = new Date(d);
    if (isNaN(date.getTime())) return 'Just now';
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const handleExportLog = useCallback(() => {
    if (filtered.length === 0) return;
    const header = 'ID,Action,Module,Description,Performed By,Reference ID,IP Address,Timestamp\n';
    const rows = filtered.map(a =>
      `"${a.id}","${a.action}","${a.module}","${a.description.replace(/"/g, '""')}","${a.performedBy}","${a.referenceId}","${a.ipAddress}","${a.timestamp}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_trail_filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }, [filtered]);

  return (
    <div className="audit-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      <div className="audit-page__header">
        <div className="audit-page__header-left">
          <h1>Audit Trail</h1>
          <p>Complete activity log & compliance tracking with User, Document Type, and Date filtering</p>
        </div>
        <div className="audit-page__header-actions">
          {isFiltered && (
            <button className="audit-page__reset-btn" onClick={resetFilters} title="Reset all filters">
              <RotateCcw size={15} /> Reset Filters
            </button>
          )}
          <button className="audit-page__export-btn" onClick={() => setExportModalOpen(true)} title="Export Audit Trail Report (Excel, PDF)">
            <Download size={16} /> Export Report ({filtered.length})
          </button>
        </div>
      </div>

      <div className="audit-summary">
        {[
          { icon: <History size={22} />, val: summary.total, label: 'Total Entries', cls: 'total' },
          { icon: <Clock size={22} />, val: summary.today, label: 'Today', cls: 'today' },
          { icon: <Settings size={22} />, val: summary.actions, label: 'Action Types', cls: 'actions' },
          { icon: <UserCog size={22} />, val: summary.users, label: 'Active Users', cls: 'users' },
        ].map(c => (
          <div key={c.cls} className="audit-summary-card">
            <div className={`audit-summary-card__icon audit-summary-card__icon--${c.cls}`}>{c.icon}</div>
            <div className="audit-summary-card__info"><span className="audit-summary-card__value">{c.val}</span><span className="audit-summary-card__label">{c.label}</span></div>
          </div>
        ))}
      </div>

      {/* Advanced Glassmorphic Multi-Filter Control Panel */}
      <div className={`audit-filter-card ${isFiltered ? 'audit-filter-card--active' : ''}`}>
        <div className="audit-filter-card__header">
          <div className="audit-filter-card__title-group">
            <div className="audit-filter-card__icon-wrap">
              <Filter size={18} />
            </div>
            <div>
              <h3 className="audit-filter-card__title">Filter & Audit Controls</h3>
              <p className="audit-filter-card__subtitle">Refine log entries by user, document category, year, month, or custom date range</p>
            </div>
          </div>
          <div className="audit-filter-card__header-right">
            {filtered.length !== auditLog.length ? (
              <span className="audit-filter-card__count-badge">
                Showing {filtered.length} of {auditLog.length} logs
              </span>
            ) : (
              <span className="audit-filter-card__total-badge">
                {auditLog.length} Total Logs
              </span>
            )}
            {isFiltered && (
              <button className="audit-filter-card__clear-btn" onClick={resetFilters}>
                <RotateCcw size={13} /> Clear All Filters
              </button>
            )}
          </div>
        </div>

        {/* Quick Date Presets Row */}
        <div className="audit-filter-presets">
          <span className="audit-filter-presets__label">Quick Presets:</span>
          {[
            { label: 'All Time', id: 'ALL' },
            { label: 'Today', id: 'TODAY' },
            { label: 'This Month', id: 'THIS_MONTH' },
            { label: 'This Year', id: 'THIS_YEAR' },
          ].map(preset => {
            const isPresetActive =
              preset.id === 'TODAY' ? fromDate === new Date().toISOString().slice(0, 10) && toDate === new Date().toISOString().slice(0, 10) :
              preset.id === 'THIS_MONTH' ? yearFilter === String(new Date().getFullYear()) && monthFilter === String(new Date().getMonth() + 1).padStart(2, '0') :
              preset.id === 'THIS_YEAR' ? yearFilter === String(new Date().getFullYear()) && monthFilter === 'ALL' && !fromDate && !toDate :
              preset.id === 'ALL' && !isFiltered;

            return (
              <button
                key={preset.id}
                type="button"
                className={`audit-preset-chip ${isPresetActive ? 'audit-preset-chip--active' : ''}`}
                onClick={() => {
                  if (preset.id === 'ALL') {
                    resetFilters();
                  } else if (preset.id === 'TODAY') {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    setFromDate(todayStr);
                    setToDate(todayStr);
                    setYearFilter('ALL');
                    setMonthFilter('ALL');
                    setCurrentPage(1);
                  } else if (preset.id === 'THIS_MONTH') {
                    const now = new Date();
                    setYearFilter(String(now.getFullYear()));
                    setMonthFilter(String(now.getMonth() + 1).padStart(2, '0'));
                    setFromDate('');
                    setToDate('');
                    setCurrentPage(1);
                  } else if (preset.id === 'THIS_YEAR') {
                    const now = new Date();
                    setYearFilter(String(now.getFullYear()));
                    setMonthFilter('ALL');
                    setFromDate('');
                    setToDate('');
                    setCurrentPage(1);
                  }
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Filter Inputs Grid */}
        <div className="audit-filter-grid">
          {/* User-Wise Dropdown */}
          <div className={`audit-field-box ${userFilter !== 'ALL' ? 'audit-field-box--active' : ''}`}>
            <label className="audit-field-box__label">
              <User size={13} className="audit-field-box__icon" /> User / Performer
            </label>
            <div className="audit-field-box__input-wrap">
              <select
                className="audit-field-box__select"
                value={userFilter}
                onChange={e => { setUserFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="ALL">All Users ({uniqueUsers.length})</option>
                {uniqueUsers.map(usr => (
                  <option key={usr} value={usr}>{usr}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Module-Wise Dropdown */}
          <div className={`audit-field-box ${moduleFilter !== 'ALL' ? 'audit-field-box--active' : ''}`}>
            <label className="audit-field-box__label">
              <FileText size={13} className="audit-field-box__icon" /> Module-Wise
            </label>
            <div className="audit-field-box__input-wrap">
              <select
                className="audit-field-box__select"
                value={moduleFilter}
                onChange={e => { setModuleFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="ALL">All Modules ({uniqueModules.length})</option>
                {uniqueModules.map(mod => (
                  <option key={mod} value={mod}>{mod}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Year-Wise Dropdown */}
          <div className={`audit-field-box ${yearFilter !== 'ALL' ? 'audit-field-box--active' : ''}`}>
            <label className="audit-field-box__label">
              <Calendar size={13} className="audit-field-box__icon" /> Year
            </label>
            <div className="audit-field-box__input-wrap">
              <select
                className="audit-field-box__select"
                value={yearFilter}
                onChange={e => { setYearFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="ALL">All Years</option>
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Month-Wise Dropdown */}
          <div className={`audit-field-box ${monthFilter !== 'ALL' ? 'audit-field-box--active' : ''}`}>
            <label className="audit-field-box__label">
              <Calendar size={13} className="audit-field-box__icon" /> Month
            </label>
            <div className="audit-field-box__input-wrap">
              <select
                className="audit-field-box__select"
                value={monthFilter}
                onChange={e => { setMonthFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="ALL">All Months</option>
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* From Date */}
          <div className={`audit-field-box ${fromDate ? 'audit-field-box--active' : ''}`}>
            <label className="audit-field-box__label">
              <Calendar size={13} className="audit-field-box__icon" /> From Date
            </label>
            <div className="audit-field-box__input-wrap">
              <input
                type="date"
                className="audit-field-box__date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>

          {/* To Date */}
          <div className={`audit-field-box ${toDate ? 'audit-field-box--active' : ''}`}>
            <label className="audit-field-box__label">
              <Calendar size={13} className="audit-field-box__icon" /> To Date
            </label>
            <div className="audit-field-box__input-wrap">
              <input
                type="date"
                className="audit-field-box__date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>
        </div>
      </div>



      <div className="audit-toolbar">
        <div className="audit-toolbar__search">
          <Search size={16} className="audit-toolbar__search-icon" />
          <input type="text" placeholder="Search by description, user, module, or reference..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
        </div>
      </div>

      <div className="audit-timeline-card">
        {loading && <TableSkeleton rows={5} columns={4} />}

        {!loading && paginated.length > 0 && (
          <div className="audit-timeline">
            {paginated.map(entry => (
              <div key={entry.id} className="audit-entry" onClick={() => setDetail(entry)}>
                <div className="audit-entry__connector">
                  <div className={`audit-entry__dot audit-entry__dot--${ACTION_CLS[entry.action]}`}>{ACTION_ICONS[entry.action]}</div>
                  <div className="audit-entry__line" />
                </div>
                <div className="audit-entry__content">
                  <div className="audit-entry__top">
                    <div className="audit-entry__left">
                      <span className={`audit-entry__action audit-entry__action--${ACTION_CLS[entry.action]}`}>{entry.action}</span>
                      <span className="audit-entry__module">{entry.module}</span>
                    </div>
                    <span className="audit-entry__time"><Clock size={11} /> {timeAgo(entry.timestamp)}</span>
                  </div>
                  <p className="audit-entry__desc">{entry.description}</p>
                  <div className="audit-entry__meta">
                    <div className="audit-entry__user">
                      <div className={`audit-entry__avatar audit-entry__avatar--${entry.avatarMod}`}>{entry.performedByInitials}</div>
                      <span>{entry.performedBy}</span>
                    </div>
                    {entry.referenceId !== '-' && <span className="audit-entry__ref">{entry.referenceId}</span>}
                    <span className="audit-entry__ip">{entry.ipAddress}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && paginated.length === 0 && (
          <div className="audit-empty">
            <div className="audit-empty__icon-wrap">
              <History size={48} strokeWidth={1.5} />
            </div>
            <h3 className="audit-empty__title">No audit entries found</h3>
            <p className="audit-empty__desc">
              {isFiltered ? 'No matching logs for selected user, document type, date, or search filter.' : 'No audit trail entries yet.'}
            </p>
            {isFiltered && (
              <button type="button" className="audit-empty__clear-btn" onClick={resetFilters}>
                <RotateCcw size={14} /> Clear All Filters
              </button>
            )}
          </div>
        )}
        {filtered.length > perPage && (
          <div className="audit-pagination">
            <span className="audit-pagination__info">Showing {(currentPage-1)*perPage+1}–{Math.min(currentPage*perPage, filtered.length)} of {filtered.length}</span>
            <div className="audit-pagination__btns">
              <button className="audit-pagination__btn" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)}><ChevronLeft size={14} /></button>
              {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(<button key={p} className={`audit-pagination__btn ${currentPage===p?'audit-pagination__btn--active':''}`} onClick={()=>setCurrentPage(p)}>{p}</button>))}
              <button className="audit-pagination__btn" disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <div className="audit-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="audit-modal" onClick={e => e.stopPropagation()}>
            <div className="audit-modal__header"><span className="audit-modal__title"><History size={20} /> Audit Entry</span><button className="audit-modal__close" onClick={() => setDetail(null)}><X size={18} /></button></div>
            <div className="audit-modal__body">
              <div className="audit-modal__action-row">
                <span className={`audit-entry__action audit-entry__action--${ACTION_CLS[detail.action]}`}>{detail.action}</span>
                <span className="audit-modal__module-label">{detail.module}</span>
              </div>
              <p className="audit-modal__desc">{detail.description}</p>
              <div className="audit-modal__grid">
                {[
                  { l: 'Performed By', v: detail.performedBy }, { l: 'Reference', v: detail.referenceId !== '-' ? detail.referenceId : '—' },
                  { l: 'IP Address', v: detail.ipAddress }, { l: 'Timestamp', v: formatDateTime(detail.timestamp) },
                ].map(i => (
                  <div key={i.l} className="audit-modal__grid-item"><span className="audit-modal__grid-label">{i.l}</span><span className="audit-modal__grid-value">{i.v}</span></div>
                ))}
              </div>
            </div>
            <div className="audit-modal__footer"><button className="audit-modal__btn" onClick={() => setDetail(null)}>Close</button></div>
          </div>
        </div>
      )}

      <AuditExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        data={filtered}
        totalLogsCount={auditLog.length}
        activeFilterSummary={activeFilterSummary}
      />
    </div>
  );
}

