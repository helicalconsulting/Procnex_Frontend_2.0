// ============================================================
// components/admin/company-settings/BudgetLogicWorkspace.tsx
// High-fidelity UI workspace for configuring Organizational Budget Logic & Spend Gatekeeper rules
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  RotateCcw,
  Save,
  Sparkles,
  Layers,
  DollarSign,
  Bell,
  RefreshCw,
  Gauge,
  Info,
  Check,
  ArrowRight,
  TrendingUp,
  Building2,
  Calendar,
  Lock,
  Zap,
} from 'lucide-react';
import {
  type BudgetLogicConfig,
  type ControlLevel,
  type ScopeLevel,
  type PeriodGranularity,
  type FxSource,
  type VatTreatment,
  DEFAULT_BUDGET_LOGIC,
  BUDGET_LOGIC_PRESETS,
  loadBudgetLogicSettings,
  saveBudgetLogicSettings,
  resetBudgetLogicSettings,
  simulateSpendEvaluation,
} from './budgetLogicModel';
import { Button } from '../../ui/button';
import { Input, Select } from '../../ui/input';
import { MessageStrip } from '../../shared/MessageStrip';

interface BudgetLogicWorkspaceProps {
  canManage?: boolean;
  defaultCurrency?: string;
}

export function BudgetLogicWorkspace({
  canManage = true,
  defaultCurrency = 'KES',
}: BudgetLogicWorkspaceProps) {
  const [config, setConfig] = useState<BudgetLogicConfig>(DEFAULT_BUDGET_LOGIC);
  const [initialConfig, setInitialConfig] = useState<BudgetLogicConfig>(DEFAULT_BUDGET_LOGIC);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>('BALANCED');

  // Simulator Test State
  const [simAnnualBudget, setSimAnnualBudget] = useState<number>(1000000);
  const [simAvailableBalance, setSimAvailableBalance] = useState<number>(200000);
  const [simOrderAmount, setSimOrderAmount] = useState<number>(235000);

  // Load persisted configuration on mount
  useEffect(() => {
    const loaded = loadBudgetLogicSettings();
    setConfig(loaded);
    setInitialConfig(loaded);
  }, []);

  // Determine if there are unsaved changes
  const isDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(initialConfig);
  }, [config, initialConfig]);

  // Live simulation outcome based on current form state
  const simulation = useMemo(() => {
    return simulateSpendEvaluation(
      config,
      simOrderAmount,
      simAvailableBalance,
      simAnnualBudget,
      defaultCurrency
    );
  }, [config, simOrderAmount, simAvailableBalance, simAnnualBudget, defaultCurrency]);

  const handleApplyPreset = (presetKey: string) => {
    const preset = BUDGET_LOGIC_PRESETS[presetKey];
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      ...preset.config,
      tolerance: { ...prev.tolerance, ...(preset.config.tolerance || {}) },
      checkPoints: { ...prev.checkPoints, ...(preset.config.checkPoints || {}) },
      phasing: { ...prev.phasing, ...(preset.config.phasing || {}) },
    }));
    setActivePreset(presetKey);
  };

  const handleSave = () => {
    saveBudgetLogicSettings(config);
    setInitialConfig(config);
    setSaveSuccessMsg('Budget Logic & Spend Gatekeeper configuration saved successfully.');
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 4500);
  };

  const handleDiscard = () => {
    setConfig(initialConfig);
  };

  const handleResetToDefaults = () => {
    const def = resetBudgetLogicSettings();
    setConfig(def);
    setInitialConfig(def);
    setActivePreset('BALANCED');
    setSaveSuccessMsg('Restored standard default budget logic.');
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 4000);
  };

  // Checkpoint toggles helper
  const toggleCheckpoint = (key: keyof BudgetLogicConfig['checkPoints']) => {
    setConfig((prev) => ({
      ...prev,
      checkPoints: {
        ...prev.checkPoints,
        [key]: !prev.checkPoints[key],
      },
    }));
    setActivePreset(null);
  };

  return (
    <section className="settings-budget-logic cs-tab-panel" aria-labelledby="budget-logic-title">
      {/* ── Intro Header ── */}
      <header className="settings-section-intro">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 id="budget-logic-title" className="flex items-center gap-2">
              <Wallet size={20} className="text-primary" />
              Budget Logic &amp; Spend Governance
            </h2>
            <p>
              Configure company-wide rules for budget enforcement, overspend tolerance buffers,
              procurement lifecycle checkpoints, and spend gatekeeping policies.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetToDefaults}
              className="gap-1.5 text-xs"
              title="Reset all settings to default procurement standards"
            >
              <RotateCcw size={14} />
              Reset Defaults
            </Button>
          </div>
        </div>
      </header>

      {/* ── Notification Feedback ── */}
      {saveSuccessMsg && (
        <MessageStrip type="success">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{saveSuccessMsg}</span>
          </div>
        </MessageStrip>
      )}

      {/* ── Sticky Unsaved Changes Notification ── */}
      {isDirty && (
        <div className="settings-general-save" role="status">
          <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle size={16} />
            You have unsaved changes to your organization's Budget Logic.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={handleDiscard}>
            Discard Changes
          </Button>
          <Button type="button" size="sm" onClick={handleSave} className="gap-1.5 font-semibold">
            <Save size={15} />
            Save Budget Settings
          </Button>
        </div>
      )}

      {/* ── Governance Policy Presets Bar ── */}
      <div className="p-4 rounded-xl border border-border/80 bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Procurement Presets:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(BUDGET_LOGIC_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleApplyPreset(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all text-left flex items-center gap-2 ${
                activePreset === key
                  ? 'border-primary bg-primary/10 text-primary shadow-xs font-semibold'
                  : 'border-border/80 bg-card hover:bg-muted/50 text-foreground'
              }`}
            >
              <span>{p.label}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-semibold">
                {p.tag}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION 1: CONTROL LEVEL & SPEND GATEKEEPER ── */}
      <div className="cs-section-card">
        <div className="cs-section-header">
          <div className="cs-section-header__left">
            <h2>
              <Sliders size={18} /> Default Control Level &amp; Spend Gatekeeper Mode
            </h2>
            <p>
              Controls what action the system enforces when a Requisition, Quotation Award, or Purchase Order exceeds available funds.
            </p>
          </div>
        </div>

        <div className="cs-section-body space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                level: 'HARD_STOP' as ControlLevel,
                title: 'Hard Stop',
                subtitle: 'Strict Enforcement',
                description: 'Blocks document submission when budget is exceeded. Requires formal Exception Approval or Budget Transfer.',
                colorClass: 'border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300',
                activeClass: 'ring-2 ring-rose-500 border-rose-500 bg-rose-500/10',
                badgeText: 'Highest Control',
              },
              {
                level: 'SOFT_WARNING' as ControlLevel,
                title: 'Soft Warning',
                subtitle: 'Written Justification',
                description: 'Alerts the user of budget overrun and requires a mandatory written business justification (min 10 chars) to proceed.',
                colorClass: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
                activeClass: 'ring-2 ring-amber-500 border-amber-500 bg-amber-500/10',
                badgeText: 'Audit Logged',
              },
              {
                level: 'ADVISORY' as ControlLevel,
                title: 'Advisory',
                subtitle: 'Informational Only',
                description: 'Displays a warning notice with the deficit amount, but permits document submission without approval halts.',
                colorClass: 'border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-300',
                activeClass: 'ring-2 ring-sky-500 border-sky-500 bg-sky-500/10',
                badgeText: 'Non-Blocking',
              },
              {
                level: 'NONE' as ControlLevel,
                title: 'Tracking Only',
                subtitle: 'No Restrictions',
                description: 'Passive spend monitoring. Records commitments and actuals without imposing gatekeeper checks.',
                colorClass: 'border-slate-500/40 bg-slate-500/5 text-slate-700 dark:text-slate-300',
                activeClass: 'ring-2 ring-slate-500 border-slate-500 bg-slate-500/10',
                badgeText: 'Open Flow',
              },
            ].map((item) => {
              const isSelected = config.controlLevel === item.level;
              return (
                <button
                  type="button"
                  key={item.level}
                  onClick={() => {
                    setConfig({ ...config, controlLevel: item.level });
                    setActivePreset(null);
                  }}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                    isSelected ? item.activeClass : 'border-border/80 bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">{item.title}</span>
                      {isSelected ? (
                        <CheckCircle2 size={16} className="text-primary" />
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {item.badgeText}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-muted-foreground">{item.subtitle}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: TOLERANCE BUFFER & EXCEPTION APPROVALS ── */}
      <div className="cs-section-card">
        <div className="cs-section-header">
          <div className="cs-section-header__left">
            <h2>
              <Gauge size={18} /> Overspend Tolerance &amp; Exception Overrides
            </h2>
            <p>
              Allow minor cost variations (e.g., shipping, taxes, exchange rate fluctuations) to proceed automatically within a defined buffer.
            </p>
          </div>
        </div>

        <div className="cs-section-body space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border/70">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Enable Overspend Tolerance Buffer
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, spend that exceeds the exact line allocation but remains within the tolerance buffer will proceed without a hard stop.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.tolerance.enabled}
                onChange={(e) => {
                  setConfig({
                    ...config,
                    tolerance: { ...config.tolerance, enabled: e.target.checked },
                  });
                  setActivePreset(null);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {config.tolerance.enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Tolerance Percentage (%)
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={config.tolerance.percent}
                    onChange={(e) => {
                      setConfig({
                        ...config,
                        tolerance: { ...config.tolerance, percent: Number(e.target.value) || 0 },
                      });
                      setActivePreset(null);
                    }}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    %
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  e.g., 5% allows spend up to 105% of the annual line balance.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Maximum Tolerance Cap ({defaultCurrency})
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={config.tolerance.maxCap}
                    onChange={(e) => {
                      setConfig({
                        ...config,
                        tolerance: { ...config.tolerance, maxCap: Number(e.target.value) || 0 },
                      });
                      setActivePreset(null);
                    }}
                    className="pr-14"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    {defaultCurrency}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Hard monetary ceiling. Tolerance buffer will never exceed this amount regardless of line size.
                </span>
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl border border-border/70 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Allow Exception Approval Overrides
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  If funds are exhausted under a Hard Stop, allow users to trigger an exception request rather than outright rejection.
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.tolerance.allowExceptionApproval}
                onChange={(e) => {
                  setConfig({
                    ...config,
                    tolerance: {
                      ...config.tolerance,
                      allowExceptionApproval: e.target.checked,
                    },
                  });
                  setActivePreset(null);
                }}
                className="size-4 rounded text-primary focus:ring-primary"
              />
            </div>

            {config.tolerance.allowExceptionApproval && (
              <div className="pt-2 border-t border-border/40">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Designated Exception Approval Authority
                </label>
                <Select
                  value={config.tolerance.exceptionApproverRole}
                  onChange={(e) => {
                    setConfig({
                      ...config,
                      tolerance: {
                        ...config.tolerance,
                        exceptionApproverRole: e.target.value,
                      },
                    });
                    setActivePreset(null);
                  }}
                >
                  <option value="Finance Director / CFO">Finance Director / CFO (Recommended)</option>
                  <option value="Approval Level 2+">Approval Level 2 and above</option>
                  <option value="Department Head & Finance Manager">Department Head &amp; Finance Manager Co-sign</option>
                  <option value="Managing Director / Board">Managing Director / Board of Directors</option>
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: LIFECYCLE CHECK POINTS ── */}
      <div className="cs-section-card">
        <div className="cs-section-header">
          <div className="cs-section-header__left">
            <h2>
              <FileCheck size={18} /> Procurement Lifecycle Check Points
            </h2>
            <p>
              Select which stages in the procurement workflow must run an automated budget check before proceeding to the next step.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setConfig({
                  ...config,
                  checkPoints: {
                    purchaseRequisition: true,
                    quotationAward: true,
                    contractSigning: true,
                    purchaseOrder: true,
                    goodsReceipt: true,
                    purchaseInvoice: true,
                  },
                });
                setActivePreset(null);
              }}
              className="text-xs"
            >
              Select All
            </Button>
          </div>
        </div>

        <div className="cs-section-body">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                key: 'purchaseRequisition' as keyof BudgetLogicConfig['checkPoints'],
                stage: '1. Purchase Requisition',
                impact: 'Pre-Commitment',
                desc: 'Reserves tentative funds when an employee raises a purchase requisition.',
              },
              {
                key: 'quotationAward' as keyof BudgetLogicConfig['checkPoints'],
                stage: '2. RFQ / Quotation Award',
                impact: 'Award Gatekeeper',
                desc: 'Verifies budget line availability prior to selecting a winning vendor bid.',
              },
              {
                key: 'contractSigning' as keyof BudgetLogicConfig['checkPoints'],
                stage: '3. Master Contract Signing',
                impact: 'Legal Encumbrance',
                desc: 'Locks annual contract ceiling amount against targeted budget lines.',
              },
              {
                key: 'purchaseOrder' as keyof BudgetLogicConfig['checkPoints'],
                stage: '4. Purchase Order Issuance',
                impact: 'Official Commitment',
                desc: 'Locks formal encumbrance when PO is issued to the vendor. (Standard)',
              },
              {
                key: 'goodsReceipt' as keyof BudgetLogicConfig['checkPoints'],
                stage: '5. Goods Received Note (GRN)',
                impact: 'Delivery Matching',
                desc: 'Validates line items upon physical receipt of inventory / delivery note.',
              },
              {
                key: 'purchaseInvoice' as keyof BudgetLogicConfig['checkPoints'],
                stage: '6. Purchase Invoice Approval',
                impact: 'Actual Spend Realization',
                desc: 'Converts commitment into actual expenditure on the company general ledger.',
              },
            ].map(({ key, stage, impact, desc }) => {
              const active = config.checkPoints[key];
              return (
                <div
                  key={key}
                  onClick={() => toggleCheckpoint(key)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                    active
                      ? 'border-primary/50 bg-primary/5 shadow-xs'
                      : 'border-border/70 bg-card hover:bg-muted/30 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-foreground">{stage}</div>
                      <span className="text-[10px] font-semibold text-primary">{impact}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {}} // handled by card div
                      className="size-4 mt-0.5 rounded text-primary focus:ring-primary pointer-events-none"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── SECTION 4: SPEND SCOPE, PHASING & TRANSFERS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Spend Scope & Pooling */}
        <div className="cs-section-card">
          <div className="cs-section-header">
            <div className="cs-section-header__left">
              <h2>
                <Layers size={18} /> Budget Scope &amp; Fund Pooling
              </h2>
              <p>Determine the organizational granularity evaluated during spend validation.</p>
            </div>
          </div>
          <div className="cs-section-body space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Set Default Budget By (Primary Dimension)
              </label>
              <Select
                value={config.defaultBudgetDimension || 'ITEM'}
                onChange={(e) => {
                  setConfig({
                    ...config,
                    defaultBudgetDimension: e.target.value as 'ITEM' | 'SUPPLIER' | 'DEPARTMENT' | 'MIX_BAG',
                  });
                  setActivePreset(null);
                }}
              >
                <option value="ITEM">Item-Wise Budget (Item No., Item Name)</option>
                <option value="SUPPLIER">Supplier-Wise Budget (Supplier No., Supplier Name)</option>
                <option value="DEPARTMENT">Department-Wise Budget (Department Code, Name)</option>
                <option value="MIX_BAG">Mix Bag (Multi-Dimensional Composite)</option>
              </Select>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Pre-selected dimension when creating new organizational budgets.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Evaluation Level
              </label>
              <Select
                value={config.scopeLevel}
                onChange={(e) => {
                  setConfig({ ...config, scopeLevel: e.target.value as ScopeLevel });
                  setActivePreset(null);
                }}
              >
                <option value="LINE_ITEM">Line-Item Strict (Exact budget code match required)</option>
                <option value="COST_CENTER">Cost Center Pooling (Allow surplus within same Cost Center)</option>
                <option value="DEPARTMENT">Departmental Pool (Allow surplus across department lines)</option>
                <option value="ORGANIZATION">Organization / Entity Ceiling (Global budget pool)</option>
              </Select>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Info size={14} className="text-primary" />
                <span>Scope Behavior Note</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {config.scopeLevel === 'LINE_ITEM' &&
                  'Strict Line enforcement: If line LN-001 has 0 balance, spend will trigger gatekeeping even if other lines have surplus funds.'}
                {config.scopeLevel === 'COST_CENTER' &&
                  'Cost Center pooling: If a specific line is short of funds, the gatekeeper automatically checks if other lines in the same Cost Center can cover the difference.'}
                {config.scopeLevel === 'DEPARTMENT' &&
                  'Department pool: Flexible allocation across all cost centers belonging to the requesting department.'}
                {config.scopeLevel === 'ORGANIZATION' &&
                  'Macro level: Tracks against global corporate procurement budget.'}
              </p>
            </div>
          </div>
        </div>

        {/* Phasing & Rollover Rules */}
        <div className="cs-section-card">
          <div className="cs-section-header">
            <div className="cs-section-header__left">
              <h2>
                <Calendar size={18} /> Period Phasing &amp; Unspent Balances
              </h2>
              <p>Configure fiscal period division and unspent balance rollover policies.</p>
            </div>
          </div>
          <div className="cs-section-body space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Default Period Division
              </label>
              <Select
                value={config.phasing.periodGranularity}
                onChange={(e) => {
                  setConfig({
                    ...config,
                    phasing: {
                      ...config.phasing,
                      periodGranularity: e.target.value as PeriodGranularity,
                    },
                  });
                  setActivePreset(null);
                }}
              >
                <option value="QUARTERLY">Quarterly (Q1, Q2, Q3, Q4) — Standard</option>
                <option value="MONTHLY">Monthly Phasing (Jan - Dec)</option>
                <option value="ANNUAL">Annual (Lump-sum single period)</option>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    Automatic Unspent Budget Rollover
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Carry forward unused funds from Q1 into Q2 automatically.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.phasing.allowRollover}
                  onChange={(e) => {
                    setConfig({
                      ...config,
                      phasing: { ...config.phasing, allowRollover: e.target.checked },
                    });
                    setActivePreset(null);
                  }}
                  className="size-4 rounded text-primary focus:ring-primary"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    Allow Borrowing from Future Quarters
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Permit spending ahead against Q3/Q4 allocations during Q1 with managerial approval.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.phasing.allowFutureQuarterBorrowing}
                  onChange={(e) => {
                    setConfig({
                      ...config,
                      phasing: {
                        ...config.phasing,
                        allowFutureQuarterBorrowing: e.target.checked,
                      },
                    });
                    setActivePreset(null);
                  }}
                  className="size-4 rounded text-primary focus:ring-primary"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 5: ALERT THRESHOLDS & MULTI-CURRENCY ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Alert Thresholds */}
        <div className="cs-section-card">
          <div className="cs-section-header">
            <div className="cs-section-header__left">
              <h2>
                <Bell size={18} /> Consumption Alert Thresholds
              </h2>
              <p>Automated warning notifications as budget lines approach depletion.</p>
            </div>
          </div>
          <div className="cs-section-body space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                  Advisory Alert
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="50"
                    max="100"
                    value={config.alerts.advisoryPercent}
                    onChange={(e) => {
                      setConfig({
                        ...config,
                        alerts: {
                          ...config.alerts,
                          advisoryPercent: Number(e.target.value) || 0,
                        },
                      });
                      setActivePreset(null);
                    }}
                    className="pr-6 text-xs"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    %
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                  Warning Alert
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="70"
                    max="100"
                    value={config.alerts.warningPercent}
                    onChange={(e) => {
                      setConfig({
                        ...config,
                        alerts: {
                          ...config.alerts,
                          warningPercent: Number(e.target.value) || 0,
                        },
                      });
                      setActivePreset(null);
                    }}
                    className="pr-6 text-xs"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    %
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">
                  Critical Lock
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="90"
                    max="100"
                    value={config.alerts.criticalPercent}
                    onChange={(e) => {
                      setConfig({
                        ...config,
                        alerts: {
                          ...config.alerts,
                          criticalPercent: Number(e.target.value) || 0,
                        },
                      });
                      setActivePreset(null);
                    }}
                    className="pr-6 text-xs"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                <input
                  type="checkbox"
                  checked={config.alerts.emailNotifications}
                  onChange={(e) => {
                    setConfig({
                      ...config,
                      alerts: {
                        ...config.alerts,
                        emailNotifications: e.target.checked,
                      },
                    });
                    setActivePreset(null);
                  }}
                  className="size-4 rounded text-primary focus:ring-primary"
                />
                <span>Email Notifications</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                <input
                  type="checkbox"
                  checked={config.alerts.inAppNotifications}
                  onChange={(e) => {
                    setConfig({
                      ...config,
                      alerts: {
                        ...config.alerts,
                        inAppNotifications: e.target.checked,
                      },
                    });
                    setActivePreset(null);
                  }}
                  className="size-4 rounded text-primary focus:ring-primary"
                />
                <span>In-App Toast &amp; Bell Notifications</span>
              </label>
            </div>
          </div>
        </div>

        {/* Currency & Tax Evaluation */}
        <div className="cs-section-card">
          <div className="cs-section-header">
            <div className="cs-section-header__left">
              <h2>
                <DollarSign size={18} /> FX &amp; Tax Evaluation Basis
              </h2>
              <p>Rules for multi-currency conversion and VAT impact calculation.</p>
            </div>
          </div>
          <div className="cs-section-body space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Foreign Exchange (FX) Source
              </label>
              <Select
                value={config.fxSource}
                onChange={(e) => {
                  setConfig({ ...config, fxSource: e.target.value as FxSource });
                  setActivePreset(null);
                }}
              >
                <option value="LIVE_MARKET">Live Market Rates (Open Exchange API)</option>
                <option value="FIXED_BUDGET_RATE">Fixed Budget Master Table Rates</option>
                <option value="DAILY_CENTRAL_BANK">Central Bank Daily Fixing</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Tax (VAT) Check Basis
              </label>
              <Select
                value={config.vatTreatment}
                onChange={(e) => {
                  setConfig({ ...config, vatTreatment: e.target.value as VatTreatment });
                  setActivePreset(null);
                }}
              >
                <option value="EXCLUSIVE">VAT Exclusive / Net Amount (Budget tracks subtotal)</option>
                <option value="INCLUSIVE">VAT Inclusive / Gross Amount (Budget absorbs total invoice taxes)</option>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 6: INTERACTIVE LIVE POLICY SIMULATOR ── */}
      <div className="cs-section-card border-primary/40 bg-gradient-to-br from-card to-primary/[0.03]">
        <div className="cs-section-header">
          <div className="cs-section-header__left">
            <h2 className="flex items-center gap-2 text-primary font-bold">
              <Zap size={18} /> Live Spend Policy Simulator
            </h2>
            <p>
              Instantly test how a real Purchase Order will be evaluated under the active configured logic above.
            </p>
          </div>
        </div>

        <div className="cs-section-body space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Sample Line Annual Budget ({defaultCurrency})
              </label>
              <Input
                type="number"
                min="0"
                step="50000"
                value={simAnnualBudget}
                onChange={(e) => setSimAnnualBudget(Number(e.target.value) || 0)}
                className="h-10 text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Available Line Balance ({defaultCurrency})
              </label>
              <Input
                type="number"
                min="0"
                step="10000"
                value={simAvailableBalance}
                onChange={(e) => setSimAvailableBalance(Number(e.target.value) || 0)}
                className="h-10 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Incoming PO Spend Amount ({defaultCurrency})
              </label>
              <Input
                type="number"
                min="0"
                step="10000"
                value={simOrderAmount}
                onChange={(e) => setSimOrderAmount(Number(e.target.value) || 0)}
                className="h-10 text-sm font-semibold text-primary"
              />
            </div>
          </div>

          {/* Simulation Output Card */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              simulation.badgeTone === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200'
                : simulation.badgeTone === 'warning'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200'
                : simulation.badgeTone === 'destructive'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-950 dark:text-rose-200'
                : 'border-slate-500/40 bg-slate-500/10 text-slate-950 dark:text-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                {simulation.badgeTone === 'success' && <CheckCircle2 className="size-5 text-emerald-600" />}
                {simulation.badgeTone === 'warning' && <AlertTriangle className="size-5 text-amber-600" />}
                {simulation.badgeTone === 'destructive' && <ShieldAlert className="size-5 text-rose-600" />}
                <span className="font-bold text-sm tracking-wide">
                  {simulation.headline}
                </span>
              </div>

              <div className="text-xs font-semibold px-2.5 py-1 rounded-full bg-background/80 border border-current shadow-xs">
                Status: {simulation.status} · Allowed: {simulation.allowed ? 'YES' : 'NO'}
              </div>
            </div>

            <p className="text-xs leading-relaxed opacity-90">{simulation.explanation}</p>

            {simulation.actionRequired && (
              <div className="mt-3 pt-2.5 border-t border-current/20 text-xs font-semibold flex items-center gap-2">
                <ArrowRight size={14} />
                <span>Next Action: {simulation.actionRequired}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── FOOTER ACTIONS ── */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/80">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {isDirty ? (
            <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} /> Unsaved changes
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
              <Check size={14} /> Current configuration saved to organization profile
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty}
            onClick={handleDiscard}
            className="gap-1.5"
          >
            <RotateCcw size={15} />
            Discard
          </Button>

          <Button
            type="button"
            disabled={!isDirty || !canManage}
            onClick={handleSave}
            className="gap-2 font-semibold shadow-sm"
          >
            <Save size={16} />
            Save Budget Settings
          </Button>
        </div>
      </footer>
    </section>
  );
}
