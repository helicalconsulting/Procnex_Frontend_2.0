import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useServiceData } from '../../hooks/useServiceData';
import { adminService, type AdminRoleRecord } from '../../services/adminService';
import { companySettingsService, type Position } from '../../services/companySettingsService';
import { useAuth } from '../../context/AuthContext';
import type { ApprovalLevel } from '../../types';
import {
  Layers,
  Plus,
  X,
  Check,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Shield,
  FileText,
  ShoppingCart,
  ClipboardList,
  CheckSquare,
  Wallet,
  CreditCard,
  TrendingUp,
  Info,
  ChevronDown,
  Clock,
  AlertTriangle,
  Lock,
  Zap,
  Banknote,
} from 'lucide-react';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { CardSkeleton } from '../../components/shared/Skeleton';
import { CurrencySelector, useCurrency, CurrencyBadge, formatCurrency } from '../../components/shared/CurrencyMaster';

// ─── Types ──────────────────────────────────────────────────

interface ApprovalLevelData {
  id: number;
  module: string;
  levelNumber: number;
  requiredRole: string;
  timeLimitHours: number;
  minValue: number | null;
  maxValue: number | null;
  currency: string;
}

// ─── Constants ──────────────────────────────────────────────

type SystemType = 'rfq' | 'heliflow';

interface ApprovalModuleDef {
  key: string;
  label: string;
  system: SystemType;
  color: string;
  aliases?: string[];
  icon: ReactNode;
}

const MODULE_DEFS: ApprovalModuleDef[] = [
  { key: 'RFQ', label: 'RFQ', system: 'rfq', color: 'rfq', icon: <FileText size={16} /> },
  { key: 'Quotations', label: 'Quotation Approval', system: 'rfq', color: 'quotations', aliases: ['Quotations', 'Quotation', 'Quotation Approval'], icon: <ClipboardList size={16} /> },
  {
    key: 'PurchaseOrders',
    label: 'Purchase Orders',
    system: 'heliflow',
    color: 'po',
    aliases: ['Purchase Orders', 'PurchaseOrder', 'PO Approval'],
    icon: <ShoppingCart size={16} />,
  },
  {
    key: 'AccountsPayable',
    label: 'Purchase Invoice Approval',
    system: 'heliflow',
    color: 'accounts',
    aliases: ['Accounts Payable', 'Purchase Invoice Approval'],
    icon: <Wallet size={16} />,
  },
  { key: 'Payments', label: 'Payment Voucher Approval', system: 'heliflow', color: 'payments', aliases: ['Payments', 'Payment Voucher Approval'], icon: <CreditCard size={16} /> },
  {
    key: 'SalesOrders',
    label: 'Sales Orders',
    system: 'heliflow',
    color: 'sales',
    aliases: ['Sales Orders', 'SalesOrder'],
    icon: <TrendingUp size={16} />,
  },
  { key: 'Approvals', label: 'Approvals', system: 'heliflow', color: 'approvals', icon: <CheckSquare size={16} /> },
];

const MODULES = MODULE_DEFS.map((m) => m.key);
const MODULE_BY_KEY = Object.fromEntries(MODULE_DEFS.map((m) => [m.key, m]));
const MODULE_ALIAS_TO_KEY = MODULE_DEFS.reduce<Record<string, string>>((acc, mod) => {
  acc[mod.key] = mod.key;
  acc[mod.label] = mod.key;
  mod.aliases?.forEach((alias) => {
    acc[alias] = mod.key;
  });
  return acc;
}, {});

const SYSTEM_LABELS: Record<SystemType, string> = {
  rfq: 'P2P Engine',
  heliflow: 'Workflow Engine',
};

const TIME_LIMIT_PRESETS = [2, 4, 8, 12, 24, 48, 72];

function mapLevel(l: ApprovalLevel): ApprovalLevelData {
  return {
    id: l.id,
    module: MODULE_ALIAS_TO_KEY[l.module] || l.module,
    levelNumber: l.levelNumber,
    requiredRole: l.requiredRole,
    timeLimitHours: l.timeLimitHours ?? 24,
    minValue: l.minValue ?? null,
    maxValue: l.maxValue ?? null,
    currency: l.currency ?? '',
  };
}

// ─── Component ──────────────────────────────────────────────

export default function ApprovalLevelsPage() {
  const { hasPermission } = useAuth();
  const canCreateLevels = hasPermission('Approval Levels', 'canCreate');
  const noPermissionTitle = "Admin has not allowed this action. You do not have permission to modify approval levels.";
  const { companyDefaultCurrency } = useCurrency();
  const { data: levels, loading, error, reload } = useServiceData(
    () => adminService.listApprovalLevels().then((list) => list.map(mapLevel)),
    [] as ApprovalLevelData[],
    [],
    { cacheKey: 'approvalLevels:list' }
  );
  const { data: positions } = useServiceData(
    () => companySettingsService.listPositions(),
    [] as Position[],
    [],
    { cacheKey: 'approvalLevels:positions' }
  );
  const { data: dbRoles } = useServiceData(
    () => adminService.listRoles(),
    [] as AdminRoleRecord[],
    [],
    { cacheKey: 'approvalLevels:dbRoles' }
  );

  const roleOptions = useMemo(() => {
    const dbRoleNames = dbRoles.map((r) => r.roleName).filter(Boolean);
    const positionNames = positions
      .filter((p) => p.isActive)
      .map((p) => p.name)
      .filter(Boolean);
    const all = ['Super Admin', ...dbRoleNames, ...positionNames].sort();
    return [...new Set(all)];
  }, [positions, dbRoles]);

  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [activeSystem, setActiveSystem] = useState<SystemType>('heliflow');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<ApprovalLevelData | null>(null);
  const [deleteConfirmLevelId, setDeleteConfirmLevelId] = useState<number | null>(null);
  const anyModalOpen = !!(showAddModal || editingLevel || deleteConfirmLevelId);
  useBodyScrollLock(anyModalOpen);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add/Edit form
  const [formModule, setFormModule] = useState('');
  const [formLevelNumber, setFormLevelNumber] = useState<number>(1);
  const [formTimeLimit, setFormTimeLimit] = useState(24);
  const [formRole, setFormRole] = useState('');
  const [formMinValue, setFormMinValue] = useState<number | ''>('');
  const [formMaxValue, setFormMaxValue] = useState<number | ''>('');
  const [formCurrency, setFormCurrency] = useState(companyDefaultCurrency);

  // Summary
  const summary = useMemo(() => ({
    totalLevels: levels.length,
    totalModules: new Set(levels.map((l) => l.module)).size,
    avgLevels: levels.length > 0 ? (levels.length / new Set(levels.map((l) => l.module)).size).toFixed(1) : '0',
    maxChain: Math.max(...MODULES.map((m) => levels.filter((l) => l.module === m).length), 0),
  }), [levels]);

  // Grouped by module
  const grouped = useMemo(() => {
    const map: Record<string, ApprovalLevelData[]> = {};
    for (const m of MODULES) {
      map[m] = levels.filter((l) => l.module === m).sort((a, b) => a.levelNumber - b.levelNumber);
    }
    return map;
  }, [levels]);

  // Filtered modules
  const displayModules = selectedModule === 'ALL' ? MODULES : [selectedModule];

  // Format time for display
  const formatTimeLimit = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  };

  // Open add modal
  const openAddModal = useCallback((preselectedModule?: string) => {
    if (!canCreateLevels) return;
    const mod = preselectedModule || '';
    setFormModule(mod);
    setFormRole('');
    setFormTimeLimit(24);
    setFormMinValue('');
    setFormMaxValue('');
    setFormCurrency(companyDefaultCurrency);
    const count = mod ? (grouped[mod]?.length || 0) : 0;
    setFormLevelNumber(count + 1);
    setEditingLevel(null);
    setFormError(null);
    setShowAddModal(true);
  }, [companyDefaultCurrency, grouped, canCreateLevels]);

  const handleModuleSelect = (modKey: string) => {
    setFormModule(modKey);
    if (!editingLevel) {
      const count = modKey ? (grouped[modKey]?.length || 0) : 0;
      setFormLevelNumber(count + 1);
    }
  };

  // Open edit modal
  const openEditModal = useCallback((level: ApprovalLevelData) => {
    if (!canCreateLevels) return;
    setEditingLevel(level);
    setFormModule(level.module);
    setFormRole(level.requiredRole);
    setFormLevelNumber(level.levelNumber);
    setFormTimeLimit(level.timeLimitHours);
    setFormMinValue(level.minValue ?? '');
    setFormMaxValue(level.maxValue ?? '');
    setFormCurrency(level.currency || companyDefaultCurrency);
    setShowAddModal(true);
  }, [companyDefaultCurrency, canCreateLevels]);

  const handleSave = useCallback(async () => {
    if (!canCreateLevels) return;
    if (!formModule || !formRole) return;
    setSaveLoading(true);
    setFormError(null);
    setPageMsg(null);
    try {
      const payload = {
        requiredRole: formRole,
        levelNumber: formLevelNumber,
        timeLimitHours: formTimeLimit,
        minValue: formMinValue !== '' ? Number(formMinValue) : null,
        maxValue: formMaxValue !== '' ? Number(formMaxValue) : null,
        currency: formCurrency,
      };

      if (editingLevel) {
        await adminService.updateApprovalLevel(editingLevel.id, payload);
        setPageMsg(`Approval level updated to Level ${formLevelNumber}.`);
      } else {
        await adminService.createApprovalLevel({
          module: formModule,
          ...payload,
        });
        setPageMsg(`Approval level added as Level ${formLevelNumber}.`);
      }
      setShowAddModal(false);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setFormError(msg);
      setPageMsg(msg);
    } finally {
      setSaveLoading(false);
    }
  }, [formModule, formRole, formLevelNumber, formTimeLimit, formMinValue, formMaxValue, formCurrency, editingLevel, reload, canCreateLevels]);

  const handleDelete = useCallback((levelId: number) => {
    if (!canCreateLevels) return;
    setDeleteConfirmLevelId(levelId);
  }, [canCreateLevels]);

  const moveLevel = useCallback(async (levelId: number, direction: 'up' | 'down') => {
    if (!canCreateLevels) return;
    setPageMsg(null);
    try {
      await adminService.reorderApprovalLevel(levelId, direction);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Could not reorder level');
    }
  }, [reload, canCreateLevels]);

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {pageMsg && (
        <MessageStrip
          type={inferMessageType(pageMsg)}
          onClose={() => setPageMsg(null)}
          autoHideMs={5000}
        >
          {pageMsg}
        </MessageStrip>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Approval Levels</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure multi-level approval chains for each module</p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => openAddModal()}
          disabled={!canCreateLevels}
          title={!canCreateLevels ? noPermissionTitle : 'Add level'}
        >
          <Plus size={18} />
          Add Level
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: <Layers size={22} />, value: summary.totalLevels, label: 'Total Levels', cls: 'bg-primary/10 text-primary' },
          { icon: <CheckSquare size={22} />, value: summary.totalModules, label: 'Modules', cls: 'bg-emerald-500/10 text-emerald-600' },
          { icon: <ArrowDown size={22} />, value: summary.avgLevels, label: 'Avg. Depth', cls: 'bg-violet-500/10 text-violet-600' },
          { icon: <Shield size={22} />, value: summary.maxChain, label: 'Max Chain', cls: 'bg-amber-500/10 text-amber-600' },
        ].map((c, i) => (
          <div key={i} className="flex min-h-24 items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${c.cls}`}>{c.icon}</div>
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tracking-tight text-foreground">{c.value}</span>
              <span className="text-sm text-muted-foreground">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Module Filter Pills */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-card p-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition ${selectedModule === 'ALL' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          onClick={() => setSelectedModule('ALL')}
        >
          All Modules
          <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${selectedModule === 'ALL' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'}`}>
            {levels.length}
          </span>
        </button>
        {MODULES.map((m) => (
          <button
            key={m}
            type="button"
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition ${selectedModule === m ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={() => {
              setSelectedModule(m);
              setActiveSystem(MODULE_BY_KEY[m].system);
            }}
          >
            {MODULE_BY_KEY[m].icon}
            {MODULE_BY_KEY[m].label}
            <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${selectedModule === m ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'}`}>
              {grouped[m]?.length || 0}
            </span>
          </button>
        ))}
      </div>

      {/* System Toggle Banner */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">System scope</p>
          <p className="text-xs text-muted-foreground">Choose which approval workflow family to configure.</p>
        </div>
        <div className="inline-flex rounded-xl bg-muted p-1">
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${activeSystem === 'rfq' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveSystem('rfq')}
          >
            <ShoppingCart size={15} />
            P2P Engine
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${activeSystem === 'heliflow' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveSystem('heliflow')}
          >
            <Zap size={15} />
            Workflow Engine
          </button>
        </div>
      </div>

      {/* Approval Chains Display */}
      <div className="space-y-4">
        {loading ? (
          <CardSkeleton count={3} />
        ) : (
          displayModules.map((mod) => {
            const chain = grouped[mod] || [];
            const moduleDef = MODULE_BY_KEY[mod];
            const modSystem = moduleDef.system;
            const isDisabled = modSystem !== activeSystem;
            return (
              <section key={mod} className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition ${isDisabled ? 'opacity-60' : 'border-border/70'}`}>
                <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {moduleDef.icon}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{moduleDef.label}</h2>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{chain.length} level{chain.length !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span className="font-medium text-primary">{SYSTEM_LABELS[modSystem]}</span>
                      </div>
                    </div>
                  </div>

                  {isDisabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      <Lock size={12} />
                      {activeSystem === 'rfq' ? 'Workflow Engine Only' : 'P2P Engine Only'}
                    </span>
                  ) : (
                    <button
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-40"
                      onClick={() => openAddModal(mod)}
                      disabled={!canCreateLevels}
                      title={!canCreateLevels ? noPermissionTitle : undefined}
                    >
                      <Plus size={14} />
                      Add Level
                    </button>
                  )}
                </div>

                {chain.length > 0 ? (
                  <div className="overflow-x-auto p-5">
                    <ol className="flex items-stretch gap-4" aria-label={`${moduleDef.label} approval chain`}>
                      {chain.map((level, idx) => (
                        <li key={level.id} className="flex items-center gap-4">
                          <article className="flex min-h-[180px] w-[300px] flex-col rounded-2xl border border-border/70 bg-background p-4 shadow-sm transition hover:border-primary/30">
                            <div className="flex items-center gap-3">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                                {level.levelNumber}
                              </span>
                              <div className="min-w-0">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Level {level.levelNumber}</span>
                                <h4 className="truncate text-sm font-semibold text-foreground">{level.requiredRole}</h4>
                              </div>
                            </div>

                            <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Clock size={13} className="text-amber-500" />
                                <span>{formatTimeLimit(level.timeLimitHours)} time limit</span>
                              </div>
                              {(level.minValue !== null || level.maxValue !== null) && (
                                <div className="flex items-center gap-1.5">
                                  <Banknote size={13} className="text-emerald-500" />
                                  <span className="font-semibold text-foreground">
                                    {formatCurrency(level.minValue ?? 0, level.currency || companyDefaultCurrency)}
                                    {' — '}
                                    {level.maxValue !== null ? formatCurrency(level.maxValue, level.currency || companyDefaultCurrency) : '∞'}
                                  </span>
                                  <CurrencyBadge currency={level.currency || companyDefaultCurrency} />
                                </div>
                              )}
                            </div>

                            <div className="mt-auto flex items-center justify-end gap-1 border-t border-border/60 pt-3">
                              <button
                                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                title="Move Up"
                                disabled={idx === 0 || !canCreateLevels}
                                onClick={() => moveLevel(level.id, 'up')}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                                title="Move Down"
                                disabled={idx === chain.length - 1 || !canCreateLevels}
                                onClick={() => moveLevel(level.id, 'down')}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30"
                                title="Edit"
                                disabled={!canCreateLevels}
                                onClick={() => openEditModal(level)}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                                title="Remove"
                                disabled={!canCreateLevels}
                                onClick={() => handleDelete(level.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </article>
                          {idx < chain.length - 1 && (
                            <ArrowRight size={18} className="shrink-0 text-muted-foreground/40" />
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
                    <Info size={18} className="mb-1" />
                    <span>No approval levels configured for this module.</span>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{editingLevel ? 'Edit Approval Level' : 'Add Approval Level'}</h2>
                  <p className="text-xs text-muted-foreground">Specify required role and threshold conditions</p>
                </div>
              </div>
              <button type="button" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {formError && <MessageStrip type="error">{formError}</MessageStrip>}
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Module *</label>
                <select
                  className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                  value={formModule}
                  onChange={(e) => handleModuleSelect(e.target.value)}
                  disabled={!!editingLevel}
                >
                  <option value="">Select module</option>
                  {MODULES.map((m) => (
                    <option key={m} value={m}>{MODULE_BY_KEY[m].label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Required Role *</label>
                <select
                  className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                >
                  <option value="">Select role</option>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Time Limit (Hours) *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={168}
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    value={formTimeLimit}
                    onChange={(e) => setFormTimeLimit(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <div className="flex gap-1">
                    {TIME_LIMIT_PRESETS.slice(0, 4).map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={`rounded-lg border px-2.5 py-2 text-xs font-medium ${formTimeLimit === h ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}
                        onClick={() => setFormTimeLimit(h)}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Value Threshold Range</label>
                <div className="mb-2">
                  <CurrencySelector value={formCurrency} onChange={setFormCurrency} size="sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min={0}
                    placeholder="Min amount"
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    value={formMinValue}
                    onChange={(e) => setFormMinValue(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Max amount (leave empty for ∞)"
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    value={formMaxValue}
                    onChange={(e) => setFormMaxValue(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setShowAddModal(false)} disabled={saveLoading}>Cancel</button>
              <button type="button" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50" onClick={handleSave} disabled={!formModule || !formRole || saveLoading}>
                {saveLoading ? 'Saving...' : editingLevel ? 'Update Level' : 'Add Level'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmLevelId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDeleteConfirmLevelId(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertTriangle size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">Remove Approval Level?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to remove this approval level from the chain? This will adjust step numbers for remaining levels.</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border/70 bg-muted/20 px-6 py-4">
              <button type="button" className="min-h-11 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setDeleteConfirmLevelId(null)}>Cancel</button>
              <button
                type="button"
                className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/90"
                onClick={async () => {
                  const id = deleteConfirmLevelId;
                  setDeleteConfirmLevelId(null);
                  setPageMsg(null);
                  try {
                    await adminService.deleteApprovalLevel(id);
                    setPageMsg('Approval level removed.');
                    await reload();
                  } catch (err) {
                    setPageMsg(err instanceof Error ? err.message : 'Delete failed');
                  }
                }}
              >
                Remove Level
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
