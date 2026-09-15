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

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOGIN' | 'EXPORT';
type AuditModule = 'RFQ' | 'Purchase Order' | 'Quotation' | 'Users' | 'Roles' | 'Vendors' | 'Approvals' | 'Auth' | 'Documents';

interface AuditEntry {
  id: number; action: AuditAction; module: AuditModule; description: string;
  performedBy: string; performedByInitials: string; avatarMod: string;
  ipAddress: string; referenceId: string; timestamp: string;
}

const ACTION_CONFIG: Record<AuditAction, { icon: any; classes: string }> = {
  CREATE: { icon: Plus, classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  UPDATE: { icon: Edit3, classes: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  DELETE: { icon: Trash2, classes: 'bg-destructive/10 text-destructive' },
  APPROVE: { icon: CheckSquare, classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  REJECT: { icon: X, classes: 'bg-destructive/10 text-destructive' },
  LOGIN: { icon: LogIn, classes: 'bg-primary/10 text-primary' },
  EXPORT: { icon: Download, classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
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

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Audit Trail</h1>
          <p className="mt-1 text-sm text-muted-foreground">Complete activity log & compliance tracking with User, Document Type, and Date filtering</p>
        </div>
        <div className="flex items-center gap-2">
          {isFiltered && (
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={resetFilters} title="Reset all filters">
              <RotateCcw size={15} /> Reset Filters
            </button>
          )}
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90" onClick={() => setExportModalOpen(true)} title="Export Audit Trail Report">
            <Download size={16} /> Export Report ({filtered.length})
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: <History size={22} />, val: summary.total, label: 'Total Entries', cls: 'bg-primary/10 text-primary' },
          { icon: <Clock size={22} />, val: summary.today, label: 'Today', cls: 'bg-sky-500/10 text-sky-600' },
          { icon: <Settings size={22} />, val: summary.actions, label: 'Action Types', cls: 'bg-violet-500/10 text-violet-600' },
          { icon: <UserCog size={22} />, val: summary.users, label: 'Active Users', cls: 'bg-emerald-500/10 text-emerald-600' },
        ].map((c, i) => (
          <div key={i} className="flex min-h-24 items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${c.cls}`}>{c.icon}</div>
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tracking-tight text-foreground">{c.val}</span>
              <span className="text-sm text-muted-foreground">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Multi-Filter Card */}
      <div className={`rounded-2xl border bg-card p-4 shadow-sm transition ${isFiltered ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border/70'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Filter & Audit Controls</h3>
          </div>
          {isFiltered && (
            <button className="text-xs font-semibold text-primary hover:underline flex items-center gap-1" onClick={resetFilters}>
              <RotateCcw size={13} /> Clear All Filters
            </button>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">User / Performer</label>
            <select
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Users ({uniqueUsers.length})</option>
              {uniqueUsers.map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Module</label>
            <select
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              value={moduleFilter}
              onChange={(e) => { setModuleFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Modules ({uniqueModules.length})</option>
              {uniqueModules.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Year</label>
            <select
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              value={yearFilter}
              onChange={(e) => { setYearFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Years</option>
              {availableYears.map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Month</label>
            <select
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              value={monthFilter}
              onChange={(e) => { setMonthFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Months</option>
              {MONTHS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">From Date</label>
            <input
              type="date"
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">To Date</label>
            <input
              type="date"
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>
      </div>

      {/* Action Pills & Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ACTION_FILTERS.map((act) => (
            <button
              type="button"
              key={act}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${actionFilter === act ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => { setActionFilter(act); setCurrentPage(1); }}
            >
              {act === 'ALL' ? 'All Actions' : act}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                {filterCounts[act] || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            placeholder="Search description, user, module, or reference..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* Log Feed */}
      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : paginated.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="divide-y divide-border/60">
            {paginated.map((entry) => {
              const cfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG.UPDATE;
              const IconComponent = cfg.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="flex w-full items-start gap-4 p-4 text-left transition hover:bg-muted/30 sm:p-5"
                  onClick={() => setDetail(entry)}
                >
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cfg.classes}`}>
                    <IconComponent size={16} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.classes}`}>{entry.action}</span>
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-foreground">{entry.module}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock size={12} /> {timeAgo(entry.timestamp)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">{entry.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground">
                        <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{entry.performedByInitials}</span>
                        {entry.performedBy}
                      </span>
                      {entry.referenceId !== '—' && <span className="font-semibold text-primary">{entry.referenceId}</span>}
                      <span>IP: {entry.ipAddress}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {filtered.length > perPage && (
            <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition ${currentPage === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card py-14 text-center shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <History size={28} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">No audit entries found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFiltered ? 'No matching logs for selected filters.' : 'No audit trail entries recorded yet.'}
          </p>
          {isFiltered && (
            <button type="button" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-input bg-background px-4 text-xs font-semibold text-foreground hover:bg-muted" onClick={resetFilters}>
              <RotateCcw size={14} /> Clear All Filters
            </button>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
              <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                <History size={20} />
                <span>Audit Entry Detail</span>
              </div>
              <button type="button" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ACTION_CONFIG[detail.action]?.classes || ''}`}>{detail.action}</span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">{detail.module}</span>
              </div>
              <p className="text-sm font-medium text-foreground">{detail.description}</p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performed By</span>
                  <span className="mt-0.5 block text-xs font-semibold text-foreground">{detail.performedBy}</span>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reference</span>
                  <span className="mt-0.5 block text-xs font-semibold text-foreground">{detail.referenceId}</span>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">IP Address</span>
                  <span className="mt-0.5 block text-xs font-semibold text-foreground">{detail.ipAddress}</span>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timestamp</span>
                  <span className="mt-0.5 block text-xs font-semibold text-foreground">{formatDateTime(detail.timestamp)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Export Modal */}
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
