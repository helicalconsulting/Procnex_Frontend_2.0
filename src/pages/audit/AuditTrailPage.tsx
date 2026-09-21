import { useState, useMemo, useCallback } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { localDataService, type AuditEntry as ServiceAuditEntry } from '../../services/localDataService';
import { adminService } from '../../services/adminService';
import {
  History, Search, ChevronLeft, ChevronRight, Clock,
  UserCog, CheckSquare, Settings,
  LogIn, Edit3, Trash2, Plus, Download, Filter, RotateCcw,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { AuditExportModal } from './AuditExportModal';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOGIN' | 'EXPORT';
type AuditModule = 'RFQ' | 'Purchase Order' | 'Quotation' | 'Users' | 'Roles' | 'Vendors' | 'Approvals' | 'Auth' | 'Documents';

interface AuditEntry {
  id: number; action: AuditAction; module: AuditModule; description: string;
  performedBy: string; performedByInitials: string; avatarMod: string;
  ipAddress: string; referenceId: string; timestamp: string;
}

const ACTION_CONFIG: Record<AuditAction, { icon: any; tone: 'success' | 'info' | 'danger' | 'primary' | 'warning'; iconBg: string }> = {
  CREATE: { icon: Plus, tone: 'success', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/15' },
  UPDATE: { icon: Edit3, tone: 'info', iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/15' },
  DELETE: { icon: Trash2, tone: 'danger', iconBg: 'bg-destructive/10 text-destructive ring-1 ring-destructive/15' },
  APPROVE: { icon: CheckSquare, tone: 'success', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/15' },
  REJECT: { icon: Trash2, tone: 'danger', iconBg: 'bg-destructive/10 text-destructive ring-1 ring-destructive/15' },
  LOGIN: { icon: LogIn, tone: 'primary', iconBg: 'bg-primary/10 text-primary ring-1 ring-primary/15' },
  EXPORT: { icon: Download, tone: 'warning', iconBg: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/15' },
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

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
    <PageFrame>
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      
      {/* Header */}
      <PageLead
        title="Audit Trail"
        description="Complete activity log & compliance tracking with User, Document Type, and Date filtering"
        actions={
          <>
            {isFiltered && (
              <Button
                variant="outline"
                onClick={resetFilters}
                title="Reset all filters"
              >
                <RotateCcw className="size-4" /> Reset Filters
              </Button>
            )}
            <Button
              onClick={() => setExportModalOpen(true)}
              title="Export Audit Trail Report"
            >
              <Download className="size-4" /> Export Report ({filtered.length})
            </Button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: History, tone: 'primary' as const, value: summary.total, label: 'Total Entries', detail: 'All logged activities', filterKey: 'ALL' },
          { icon: Clock, tone: 'cyan' as const, value: summary.today, label: 'Today', detail: 'Logged in last 24h', filterKey: 'TODAY' },
          { icon: Settings, tone: 'violet' as const, value: summary.actions, label: 'Action Types', detail: 'Distinct activity types', filterKey: null },
          { icon: UserCog, tone: 'success' as const, value: summary.users, label: 'Active Users', detail: 'Performers in logs', filterKey: null },
        ].map((c) => {
          const isActive = c.filterKey === 'ALL' ? actionFilter === 'ALL' && !fromDate && !toDate : false;
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
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
              )}
              onClick={() => {
                if (c.filterKey === 'ALL') {
                  resetFilters();
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
            />
          );
        })}
      </div>

      {/* Multi-Filter Controls */}
      <Card className={cn('mb-4 p-4 transition-all duration-200', isFiltered && 'border-primary/45 ring-2 ring-primary/10')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Filter className="size-4" />
            </div>
            <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Filter & Audit Controls</h3>
          </div>
          {isFiltered && (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 transition-colors"
              onClick={resetFilters}
            >
              <RotateCcw className="size-3.5" /> Clear All Filters
            </button>
          )}
        </div>

        <div className="mt-3.5 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">User / Performer</label>
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Users ({uniqueUsers.length})</option>
              {uniqueUsers.map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Module</label>
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={moduleFilter}
              onChange={(e) => { setModuleFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Modules ({uniqueModules.length})</option>
              {uniqueModules.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Year</label>
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={yearFilter}
              onChange={(e) => { setYearFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Years</option>
              {availableYears.map((y) => (<option key={y} value={y}>{y}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Month</label>
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={monthFilter}
              onChange={(e) => { setMonthFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Months</option>
              {MONTHS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">From Date</label>
            <Input
              type="date"
              className="h-11 rounded-xl"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">To Date</label>
            <Input
              type="date"
              className="h-11 rounded-xl"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>
      </Card>

      {/* Search Bar & Action Filter Pills Toolbar (RFQ Page Style) */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Bar on Left (Standalone, no Card wrapper) */}
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="h-11 rounded-xl pl-10"
            placeholder="Search description, user, module, or reference..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>

        {/* Card Container around Action Filter Pills on Right */}
        <Card className="p-1.5 shrink-0 sm:ml-auto shadow-xs">
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ACTION_FILTERS.map((act) => (
              <button
                type="button"
                key={act}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all duration-150 cursor-pointer select-none',
                  actionFilter === act
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card/40'
                )}
                onClick={() => { setActionFilter(act); setCurrentPage(1); }}
              >
                {act === 'ALL' ? 'All Actions' : act}
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                  actionFilter === act ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {filterCounts[act] || 0}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Log Feed Card */}
      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : paginated.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/60">
            {paginated.map((entry) => {
              const cfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG.UPDATE;
              const IconComponent = cfg.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-accent/40 sm:p-5 focus-visible:outline-none focus-visible:bg-accent/40"
                  onClick={() => setDetail(entry)}
                >
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cfg.iconBg}`}>
                    <IconComponent size={18} strokeWidth={2} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={cfg.tone}>
                          <span className="size-1.5 rounded-full bg-current" />
                          {entry.action}
                        </Badge>
                        <Badge tone="neutral">
                          {entry.module}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <Clock size={13} /> {timeAgo(entry.timestamp)}
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm font-medium text-foreground leading-relaxed">{entry.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground">
                        <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary ring-1 ring-primary/15">{entry.performedByInitials}</span>
                        {entry.performedBy}
                      </span>
                      {entry.referenceId !== '—' && (
                        <span className="font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md text-[11px]">
                          {entry.referenceId}
                        </span>
                      )}
                      <span className="tabular-nums">IP: {entry.ipAddress}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {filtered.length > perPage && (
            <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
              <span className="text-xs text-muted-foreground font-medium">
                Showing {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length} entries
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={safePage === p ? 'default' : 'outline'}
                    size="icon-sm"
                    className="text-xs font-semibold"
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={safePage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <EmptyState
          icon={History}
          title="No audit entries found"
          description={isFiltered ? 'No matching logs for selected filters.' : 'No audit trail entries recorded yet.'}
          action={
            isFiltered && (
              <Button variant="outline" onClick={resetFilters}>
                <RotateCcw className="size-4" /> Clear All Filters
              </Button>
            )
          }
        />
      )}

      {/* Detail Modal Dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <History className="size-4" />
              </div>
              Audit Entry Detail
            </DialogTitle>
          </DialogHeader>

          {detail && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2">
                <Badge tone={ACTION_CONFIG[detail.action]?.tone || 'neutral'}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {detail.action}
                </Badge>
                <Badge tone="neutral">{detail.module}</Badge>
              </div>
              <p className="text-sm font-medium leading-relaxed text-foreground bg-accent/30 p-3.5 rounded-xl border border-border/60">
                {detail.description}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/65 bg-secondary/40 p-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Performed By</span>
                  <span className="mt-1 block text-xs font-semibold text-foreground">{detail.performedBy}</span>
                </div>
                <div className="rounded-xl border border-border/65 bg-secondary/40 p-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Reference</span>
                  <span className="mt-1 block text-xs font-semibold text-primary">{detail.referenceId}</span>
                </div>
                <div className="rounded-xl border border-border/65 bg-secondary/40 p-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">IP Address</span>
                  <span className="mt-1 block text-xs font-semibold tabular-nums text-foreground">{detail.ipAddress}</span>
                </div>
                <div className="rounded-xl border border-border/65 bg-secondary/40 p-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Timestamp</span>
                  <span className="mt-1 block text-xs font-semibold text-foreground">{formatDateTime(detail.timestamp)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="default" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Export Modal */}
      <AuditExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        data={filtered}
        totalLogsCount={auditLog.length}
        activeFilterSummary={activeFilterSummary}
      />
    </PageFrame>
  );
}
