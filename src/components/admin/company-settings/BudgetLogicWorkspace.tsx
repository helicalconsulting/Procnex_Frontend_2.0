// ============================================================
// components/admin/company-settings/BudgetLogicWorkspace.tsx
// Streamlined, user-friendly UI workspace for configuring Budget Logic
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Save,
  Check,
  Percent,
  Sliders,
  Plus,
  Trash2,
  Landmark,
  RefreshCw,
  Coins,
} from 'lucide-react';
import {
  type BudgetLogicConfig,
  type ControlLevel,
  DEFAULT_BUDGET_LOGIC,
  loadBudgetLogicSettings,
  saveBudgetLogicSettings,
  resetBudgetLogicSettings,
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
  defaultCurrency = 'AED',
}: BudgetLogicWorkspaceProps) {
  const [config, setConfig] = useState<BudgetLogicConfig>(DEFAULT_BUDGET_LOGIC);
  const [initialConfig, setInitialConfig] = useState<BudgetLogicConfig>(DEFAULT_BUDGET_LOGIC);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // States for adding custom options
  const [newBudgetType, setNewBudgetType] = useState('');
  const [newFundingSource, setNewFundingSource] = useState('');
  const [newFxCode, setNewFxCode] = useState('');
  const [newFxLabel, setNewFxLabel] = useState('');

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

  const handleSave = () => {
    saveBudgetLogicSettings(config);
    setInitialConfig(config);
    setSaveSuccessMsg('Budget settings saved successfully.');
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 4000);
  };

  const handleDiscard = () => {
    setConfig(initialConfig);
    setNewBudgetType('');
    setNewFundingSource('');
    setNewFxCode('');
    setNewFxLabel('');
  };

  const handleResetToDefaults = () => {
    const def = resetBudgetLogicSettings();
    setConfig(def);
    setInitialConfig(def);
    setSaveSuccessMsg('Budget settings reset to defaults.');
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 3500);
  };

  // Add handlers
  const handleAddBudgetType = () => {
    const trimmed = newBudgetType.trim();
    if (!trimmed) return;
    const current = config.budgetTypes || [];
    if (!current.includes(trimmed)) {
      setConfig({
        ...config,
        budgetTypes: [...current, trimmed],
      });
    }
    setNewBudgetType('');
  };

  const handleRemoveBudgetType = (item: string) => {
    const current = config.budgetTypes || [];
    if (current.length <= 1) return; // Keep at least one
    setConfig({
      ...config,
      budgetTypes: current.filter((t) => t !== item),
      defaultBudgetType: config.defaultBudgetType === item ? current.find((t) => t !== item) : config.defaultBudgetType,
    });
  };

  const handleAddFundingSource = () => {
    const trimmed = newFundingSource.trim();
    if (!trimmed) return;
    const current = config.fundingSources || [];
    if (!current.includes(trimmed)) {
      setConfig({
        ...config,
        fundingSources: [...current, trimmed],
      });
    }
    setNewFundingSource('');
  };

  const handleRemoveFundingSource = (item: string) => {
    const current = config.fundingSources || [];
    if (current.length <= 1) return;
    setConfig({
      ...config,
      fundingSources: current.filter((s) => s !== item),
      defaultFundingSource: config.defaultFundingSource === item ? current.find((s) => s !== item) : config.defaultFundingSource,
    });
  };

  const handleAddFxSource = () => {
    const label = newFxLabel.trim();
    const code = (newFxCode.trim() || label.toUpperCase().replace(/[^A-Z0-9]/g, '_')).slice(0, 30);
    if (!label) return;
    const current = config.fxConversionSources || [];
    if (!current.some((fx) => fx.code === code)) {
      setConfig({
        ...config,
        fxConversionSources: [...current, { code, label }],
      });
    }
    setNewFxCode('');
    setNewFxLabel('');
  };

  const handleRemoveFxSource = (code: string) => {
    const current = config.fxConversionSources || [];
    if (current.length <= 1) return;
    setConfig({
      ...config,
      fxConversionSources: current.filter((fx) => fx.code !== code),
    });
  };

  return (
    <section className="settings-budget-logic cs-tab-panel space-y-6" aria-labelledby="budget-logic-title">
      {/* ── Header ── */}
      <header className="settings-section-intro">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 id="budget-logic-title" className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Wallet size={22} className="text-primary" />
              Budget Settings
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set how your organization creates, monitors, and controls budgets across procurement documents.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetToDefaults}
              className="gap-1.5 text-xs"
              title="Reset to recommended standard settings"
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
        <div className="settings-general-save flex items-center justify-between p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200" role="status">
          <span className="font-medium text-xs sm:text-sm flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            You have unsaved changes to your budget settings.
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDiscard} className="text-xs">
              Discard
            </Button>
            <Button type="button" size="sm" onClick={handleSave} className="gap-1.5 text-xs font-semibold">
              <Save size={14} />
              Save Settings
            </Button>
          </div>
        </div>
      )}

      {/* ── CARD 1: SPEND CONTROL ENFORCEMENT ── */}
      <div className="cs-section-card p-5 rounded-2xl border border-border bg-card shadow-xs">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            1. Spend Control Enforcement
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Choose what happens when a purchase requisition or purchase order exceeds available budget.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              level: 'HARD_STOP' as ControlLevel,
              title: 'Strict (Hard Stop)',
              badge: 'Recommended',
              description: 'Blocks document submission when budget is exceeded. Prevents unapproved overspending.',
              borderColor: 'border-rose-500/40',
              activeColor: 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5',
            },
            {
              level: 'SOFT_WARNING' as ControlLevel,
              title: 'Warning with Justification',
              badge: 'Flexible',
              description: 'Warns the user and requires a written justification before allowing them to submit.',
              borderColor: 'border-amber-500/40',
              activeColor: 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/5',
            },
            {
              level: 'NONE' as ControlLevel,
              title: 'Tracking Only',
              badge: 'Advisory',
              description: 'No restrictions. Tracks spending and commitments without blocking any purchase.',
              borderColor: 'border-slate-500/40',
              activeColor: 'border-slate-500 ring-2 ring-slate-500/20 bg-slate-500/5',
            },
          ].map((item) => {
            const isSelected = config.controlLevel === item.level;
            return (
              <button
                type="button"
                key={item.level}
                onClick={() => setConfig({ ...config, controlLevel: item.level })}
                className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                  isSelected ? item.activeColor : 'border-border/80 bg-background hover:bg-muted/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-foreground">{item.title}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    {item.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                      <CheckCircle2 size={14} /> Active Mode
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Click to select</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CARD 2: OVERSPEND TOLERANCE BUFFER ── */}
      <div className="cs-section-card p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Percent size={18} className="text-primary" />
              2. Overspend Tolerance Buffer
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Allow minor cost variations (e.g. taxes, slight price changes, shipping) without blocking purchases.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input
              type="checkbox"
              checked={config.tolerance.enabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  tolerance: { ...config.tolerance, enabled: e.target.checked },
                })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {config.tolerance.enabled ? (
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Tolerance Percentage
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={config.tolerance.percent}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tolerance: {
                        ...config.tolerance,
                        percent: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="pr-8 h-9 text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                  %
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Allow up to {config.tolerance.percent}% over budget before blocking.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Max Allowed Cap ({defaultCurrency})
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={config.tolerance.maxCap}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tolerance: {
                        ...config.tolerance,
                        maxCap: Math.max(0, Number(e.target.value) || 0),
                      },
                    })
                  }
                  className="pr-14 h-9 text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                  {defaultCurrency}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Maximum overspend amount in {defaultCurrency}, regardless of percentage.
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-muted/40 text-xs text-muted-foreground">
            Tolerance buffer is turned off. 100% of spend must be within the allocated budget.
          </div>
        )}
      </div>

      {/* ── CARD 3: PERIOD & UNSPENT FUNDS ── */}
      <div className="cs-section-card p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sliders size={18} className="text-primary" />
            3. Period &amp; Rollover
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Configure how unspent budget allocations behave across periods.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Default Budget Period
            </label>
            <Select
              value={config.phasing.periodGranularity}
              onChange={(e) =>
                setConfig({
                  ...config,
                  phasing: {
                    ...config.phasing,
                    periodGranularity: e.target.value as any,
                  },
                })
              }
              className="h-9 text-xs"
            >
              <option value="ANNUAL">Annual (Full Year)</option>
              <option value="QUARTERLY">Quarterly (Q1, Q2, Q3, Q4)</option>
              <option value="MONTHLY">Monthly (Jan - Dec)</option>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
            <div>
              <span className="text-xs font-semibold text-foreground block">
                Automatic Unspent Rollover
              </span>
              <span className="text-[11px] text-muted-foreground">
                Carry forward remaining unused funds to the next period.
              </span>
            </div>
            <input
              type="checkbox"
              checked={config.phasing.allowRollover}
              onChange={(e) =>
                setConfig({
                  ...config,
                  phasing: {
                    ...config.phasing,
                    allowRollover: e.target.checked,
                  },
                })
              }
              className="size-4 rounded text-primary focus:ring-primary ml-3 cursor-pointer"
            />
          </div>
        </div>

        {/* ── Rollover Percentage Configuration ── */}
        {config.phasing.allowRollover ? (
          <div className="p-4 rounded-xl bg-primary/[0.03] border border-primary/20 space-y-3 transition-all animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Percent size={14} className="text-primary" /> Allowed Unspent Rollover Percentage
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Remaining unspent budget ka kitna percentage aage wale period mein carry forward hoke use ho sakta hai.
                </p>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        phasing: {
                          ...config.phasing,
                          rolloverPercent: pct,
                        },
                      })
                    }
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                      (config.phasing.rolloverPercent ?? 100) === pct
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-card text-muted-foreground border-border hover:bg-accent/40'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-4 relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="100"
                  value={config.phasing.rolloverPercent ?? 100}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const num = raw === '' ? 0 : Math.min(100, Math.max(0, Number(raw)));
                    setConfig({
                      ...config,
                      phasing: {
                        ...config.phasing,
                        rolloverPercent: num,
                      },
                    });
                  }}
                  className="h-9 text-xs font-bold pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                  %
                </span>
              </div>

              <div className="sm:col-span-8 flex items-center gap-2 text-xs text-muted-foreground bg-card/70 p-2.5 rounded-lg border border-border/50">
                <span className="font-semibold text-primary shrink-0">Rule Preview:</span>
                <span>
                  Unspent balance ka <strong>{config.phasing.rolloverPercent ?? 100}%</strong> next period allocation mein carry forward hoga.
                  {(config.phasing.rolloverPercent ?? 100) < 100 && (
                    <span className="text-amber-600 dark:text-amber-400 ml-1">
                      (Remaining {100 - (config.phasing.rolloverPercent ?? 100)}% unused expire ho jayega).
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-muted/20 border border-border/40 text-xs text-muted-foreground flex items-center gap-2">
            <span className="size-2 rounded-full bg-muted-foreground/40 shrink-0" />
            <span>
              Unspent rollover is disabled. Period end par remaining funds lapse ho jayenge (0% carry-forward).
            </span>
          </div>
        )}
      </div>

      {/* ── CARD 4: BUDGET CLASSIFICATION & SOURCES OPTIONS ── */}
      <div className="cs-section-card p-5 rounded-2xl border border-border bg-card shadow-xs space-y-6">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Landmark size={18} className="text-primary" />
            4. Budget Classification &amp; Financial Sources
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Configure the selectable options for Budget Type, Funding Source, and FX Conversion Source across new budgets.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sub-Card 1: Budget Types */}
          <div className="p-4 rounded-xl border border-border/80 bg-background/50 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Budget Types
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {(config.budgetTypes || []).length} Options
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Expenditure classifications available in Create Budget.
              </p>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {(config.budgetTypes || []).map((type) => (
                  <div
                    key={type}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border/60 bg-card text-xs group hover:border-border transition"
                  >
                    <span className="font-medium text-foreground truncate mr-2" title={type}>
                      {type}
                    </span>
                    {(config.budgetTypes || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBudgetType(type)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition opacity-70 group-hover:opacity-100"
                        title={`Remove "${type}"`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-border/60 space-y-2">
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  placeholder="e.g. Special Project Spend"
                  value={newBudgetType}
                  onChange={(e) => setNewBudgetType(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBudgetType())}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddBudgetType}
                  disabled={!newBudgetType.trim()}
                  className="h-8 px-2.5 text-xs gap-1 shrink-0"
                >
                  <Plus size={13} />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Sub-Card 2: Funding Sources */}
          <div className="p-4 rounded-xl border border-border/80 bg-background/50 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Funding Sources
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {(config.fundingSources || []).length} Options
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Financial backing and cashflow origins for budgets.
              </p>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {(config.fundingSources || []).map((source) => (
                  <div
                    key={source}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border/60 bg-card text-xs group hover:border-border transition"
                  >
                    <span className="font-medium text-foreground truncate mr-2" title={source}>
                      {source}
                    </span>
                    {(config.fundingSources || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFundingSource(source)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition opacity-70 group-hover:opacity-100"
                        title={`Remove "${source}"`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-border/60 space-y-2">
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  placeholder="e.g. Government Subsidy"
                  value={newFundingSource}
                  onChange={(e) => setNewFundingSource(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFundingSource())}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddFundingSource}
                  disabled={!newFundingSource.trim()}
                  className="h-8 px-2.5 text-xs gap-1 shrink-0"
                >
                  <Plus size={13} />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Sub-Card 3: FX Conversion Sources */}
          <div className="p-4 rounded-xl border border-border/80 bg-background/50 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  FX Conversion Sources
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {(config.fxConversionSources || []).length} Options
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Foreign exchange conversion references for multi-currency budgets.
              </p>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {(config.fxConversionSources || []).map((fx) => (
                  <div
                    key={fx.code}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border/60 bg-card text-xs group hover:border-border transition"
                  >
                    <div className="truncate mr-2">
                      <span className="font-medium text-foreground block truncate" title={fx.label}>
                        {fx.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {fx.code}
                      </span>
                    </div>
                    {(config.fxConversionSources || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFxSource(fx.code)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition opacity-70 group-hover:opacity-100"
                        title={`Remove "${fx.label}"`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-border/60 space-y-2">
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  placeholder="Label e.g. Bloomberg Fix"
                  value={newFxLabel}
                  onChange={(e) => setNewFxLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFxSource())}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddFxSource}
                  disabled={!newFxLabel.trim()}
                  className="h-8 px-2.5 text-xs gap-1 shrink-0"
                >
                  <Plus size={13} />
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ACTIONS ── */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {isDirty ? (
            <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} /> Unsaved changes
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
              <Check size={14} /> All settings saved
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty}
            onClick={handleDiscard}
            className="gap-1.5 text-xs"
          >
            <RotateCcw size={14} />
            Discard
          </Button>

          <Button
            type="button"
            disabled={!isDirty || !canManage}
            onClick={handleSave}
            className="gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Save size={14} />
            Save Budget Settings
          </Button>
        </div>
      </footer>
    </section>
  );
}
