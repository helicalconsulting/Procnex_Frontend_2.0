import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useServiceData } from '../../hooks/useServiceData';
import { adminService } from '../../services/adminService';
import { companySettingsService, type Position } from '../../services/companySettingsService';
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
  IndianRupee,
  Banknote,
} from 'lucide-react';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { CardSkeleton } from '../../components/shared/Skeleton';
import { CurrencySelector, useCurrency, CurrencyBadge, formatCurrency } from '../../components/shared/CurrencyMaster';
import '../../components/shared/CurrencyMaster.css';
import './ApprovalLevelsPage.css';

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
  { key: 'Quotations', label: 'Quotations', system: 'rfq', color: 'quotations', icon: <ClipboardList size={16} /> },
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
    label: 'Accounts Payable',
    system: 'heliflow',
    color: 'accounts',
    aliases: ['Accounts Payable'],
    icon: <Wallet size={16} />,
  },
  { key: 'Payments', label: 'Payments', system: 'heliflow', color: 'payments', icon: <CreditCard size={16} /> },
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

const DEFAULT_ROLES = [
  'Procurement Manager',
  'purchase_clerk',
  'Finance Approver',
  'Administrator',
  'Super Admin',
];

const SYSTEM_LABELS: Record<SystemType, string> = {
  rfq: 'RFQ System',
  heliflow: 'Procnex System',
};

// ─── Mock Data ──────────────────────────────────────────────

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
  const roleOptions = useMemo(() => {
    const positionNames = positions
      .filter((p) => p.isActive)
      .map((p) => p.name)
      .sort();
    // Super Admin always appears as an option even if not in positions
    const all = ['Super Admin', ...positionNames];
    return [...new Set(all)];
  }, [positions]);
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [activeSystem, setActiveSystem] = useState<SystemType>('heliflow');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<ApprovalLevelData | null>(null);
  const anyModalOpen = !!(showAddModal || editingLevel);
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
  }, [companyDefaultCurrency, grouped]);

  const handleModuleSelect = (modKey: string) => {
    setFormModule(modKey);
    if (!editingLevel) {
      const count = modKey ? (grouped[modKey]?.length || 0) : 0;
      setFormLevelNumber(count + 1);
    }
  };

  // Open edit modal
  const openEditModal = useCallback((level: ApprovalLevelData) => {
    setEditingLevel(level);
    setFormModule(level.module);
    setFormRole(level.requiredRole);
    setFormLevelNumber(level.levelNumber);
    setFormTimeLimit(level.timeLimitHours);
    setFormMinValue(level.minValue ?? '');
    setFormMaxValue(level.maxValue ?? '');
    setFormCurrency(level.currency || companyDefaultCurrency);
    setShowAddModal(true);
  }, [companyDefaultCurrency]);

  const handleSave = useCallback(async () => {
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
  }, [formModule, formRole, formLevelNumber, formTimeLimit, formMinValue, formMaxValue, formCurrency, editingLevel, reload]);

  const handleDelete = useCallback(async (levelId: number) => {
    if (!window.confirm('Remove this approval level from the chain?')) return;
    setPageMsg(null);
    try {
      await adminService.deleteApprovalLevel(levelId);
      setPageMsg('Approval level removed.');
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [reload]);

  const moveLevel = useCallback(async (levelId: number, direction: 'up' | 'down') => {
    setPageMsg(null);
    try {
      await adminService.reorderApprovalLevel(levelId, direction);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Could not reorder level');
    }
  }, [reload]);

  return (
    <div className="alvl-page">
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
      <div className="alvl-page__header">
        <div className="alvl-page__header-left">
          <h1>Approval Levels</h1>
          <p>Configure multi-level approval chains for each module</p>
        </div>
        <button className="alvl-page__add-btn" onClick={() => openAddModal()}>
          <Plus size={18} />
          Add Level
        </button>
      </div>

      {/* Summary */}
      <div className="alvl-summary">
        {[
          { icon: <Layers size={22} />, value: summary.totalLevels, label: 'Total Levels', cls: 'total' },
          { icon: <CheckSquare size={22} />, value: summary.totalModules, label: 'Modules', cls: 'modules' },
          { icon: <ArrowDown size={22} />, value: summary.avgLevels, label: 'Avg. Depth', cls: 'avg' },
          { icon: <Shield size={22} />, value: summary.maxChain, label: 'Max Chain', cls: 'max' },
        ].map((c) => (
          <div key={c.cls} className="alvl-summary-card">
            <div className={`alvl-summary-card__icon alvl-summary-card__icon--${c.cls}`}>{c.icon}</div>
            <div className="alvl-summary-card__info">
              <span className="alvl-summary-card__value">{c.value}</span>
              <span className="alvl-summary-card__label">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Module Filter */}
      <div className="alvl-module-filter">
        <button
          className={`alvl-module-pill ${selectedModule === 'ALL' ? 'alvl-module-pill--active' : ''}`}
          onClick={() => setSelectedModule('ALL')}
        >
          All Modules
          <span className="alvl-module-pill__count">{levels.length}</span>
        </button>
        {MODULES.map((m) => (
          <button
            key={m}
            className={`alvl-module-pill ${selectedModule === m ? 'alvl-module-pill--active' : ''}`}
            onClick={() => setSelectedModule(m)}
          >
            {MODULE_BY_KEY[m].icon}
            {MODULE_BY_KEY[m].label}
            <span className="alvl-module-pill__count">{grouped[m]?.length || 0}</span>
          </button>
        ))}
      </div>

      {/* System Toggle */}
      <div className="alvl-system-toggle">
        <button
          className={`alvl-system-toggle__btn alvl-system-toggle__btn--rfq ${activeSystem === 'rfq' ? 'alvl-system-toggle__btn--active' : ''}`}
          onClick={() => setActiveSystem('rfq')}
        >
          <ShoppingCart size={15} />
          RFQ System
          <span className="alvl-system-toggle__sub">RFQ & Quotations</span>
        </button>
        <button
          className={`alvl-system-toggle__btn alvl-system-toggle__btn--heliflow ${activeSystem === 'heliflow' ? 'alvl-system-toggle__btn--active' : ''}`}
          onClick={() => setActiveSystem('heliflow')}
        >
          <Zap size={15} />
          Procnex System
          <span className="alvl-system-toggle__sub">PO, AP, Payments & Sales</span>
        </button>
      </div>

      {/* Approval Chains */}
      <div className="alvl-chains">
        {loading ? (
          <CardSkeleton count={3} />
        ) : (
          displayModules.map((mod) => {
          const chain = grouped[mod] || [];
          const moduleDef = MODULE_BY_KEY[mod];
          const modSystem = moduleDef.system;
          const isDisabled = modSystem !== activeSystem;
          return (
            <div key={mod} className={`alvl-chain-card ${isDisabled ? 'alvl-chain-card--disabled' : ''}`}>
              <div className="alvl-chain-card__header">
                <div className="alvl-chain-card__header-left">
                  <div className={`alvl-chain-card__module-icon alvl-chain-card__module-icon--${moduleDef.color}`}>
                    {moduleDef.icon}
                  </div>
                  <div>
                    <span className="alvl-chain-card__module-name">{moduleDef.label}</span>
                    <span className="alvl-chain-card__level-count">
                      {chain.length} level{chain.length !== 1 ? 's' : ''}
                      <span className={`alvl-chain-card__system-tag alvl-chain-card__system-tag--${modSystem}`}>
                        {SYSTEM_LABELS[modSystem]}
                      </span>
                    </span>
                  </div>
                </div>
                {isDisabled ? (
                  <div className="alvl-chain-card__locked-badge">
                    <Lock size={13} />
                    <span>{activeSystem === 'rfq' ? 'Procnex Only' : 'RFQ Only'}</span>
                  </div>
                ) : (
                  <button className="alvl-chain-card__add-btn" onClick={() => openAddModal(mod)}>
                    <Plus size={14} />
                    Add
                  </button>
                )}
              </div>

              {chain.length > 0 ? (
                <div className="alvl-chain-card__body">
                  <div className="alvl-pipeline">
                    {chain.map((level, idx) => (
                      <div key={level.id} className="alvl-pipeline__step">
                        <div className="alvl-pipeline__connector">
                          <div className={`alvl-pipeline__dot alvl-pipeline__dot--${moduleDef.color}`}>
                            {level.levelNumber}
                          </div>
                          {idx < chain.length - 1 && <div className={`alvl-pipeline__line alvl-pipeline__line--${moduleDef.color}`} />}
                        </div>
                        <div className="alvl-pipeline__content">
                          <div className="alvl-pipeline__role-card">
                            <div className="alvl-pipeline__role-info">
                              <span className="alvl-pipeline__level-label">Level {level.levelNumber}</span>
                              <span className="alvl-pipeline__role-name">{level.requiredRole}</span>
                              <div className="alvl-pipeline__time-badge">
                                <Clock size={11} />
                                <span>{formatTimeLimit(level.timeLimitHours)}</span>
                                {idx < chain.length - 1 && (
                                  <span className="alvl-pipeline__time-hint">• auto-forwards after timeout</span>
                                )}
                              </div>
                              {(level.minValue !== null || level.maxValue !== null) && (
                                <div className="alvl-pipeline__value-badge">
                                  <Banknote size={11} />
                                  <span>
                                    {formatCurrency(level.minValue ?? 0, level.currency || companyDefaultCurrency)}
                                    {' — '}
                                    {level.maxValue !== null ? formatCurrency(level.maxValue, level.currency || companyDefaultCurrency) : '∞'}
                                  </span>
                                  <CurrencyBadge currency={level.currency || companyDefaultCurrency} />
                                </div>
                              )}
                            </div>
                            <div className="alvl-pipeline__actions">
                              <button
                                className="alvl-pipeline__action-btn"
                                title="Move Up"
                                disabled={idx === 0}
                                onClick={() => moveLevel(level.id, 'up')}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                className="alvl-pipeline__action-btn"
                                title="Move Down"
                                disabled={idx === chain.length - 1}
                                onClick={() => moveLevel(level.id, 'down')}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                className="alvl-pipeline__action-btn"
                                title="Edit"
                                onClick={() => openEditModal(level)}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                className="alvl-pipeline__action-btn alvl-pipeline__action-btn--danger"
                                title="Remove"
                                onClick={() => handleDelete(level.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="alvl-chain-card__empty">
                  <Info size={16} />
                  <span>No approval levels configured. Add a level to start.</span>
                </div>
              )}
            </div>
          );
        })
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="alvl-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="alvl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="alvl-modal__header">
              <div className="alvl-modal__title">
                <Layers size={20} />
                <span>{editingLevel ? 'Edit Approval Level' : 'Add Approval Level'}</span>
              </div>
              <button className="alvl-modal__close" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="alvl-modal__body">
                {editingLevel || !formModule ? (
                <div className="alvl-modal__field">
                  <label className="alvl-modal__label">
                    Module <span>*</span>
                  </label>
                  <div className="alvl-modal__select-wrap">
                    <select
                      className="alvl-modal__select"
                      value={formModule}
                      onChange={(e) => handleModuleSelect(e.target.value)}
                      disabled={!!editingLevel}
                    >
                      <option value="">Select module</option>
                      {MODULES.map((m) => (
                        <option key={m} value={m}>{MODULE_BY_KEY[m].label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="alvl-modal__select-icon" />
                  </div>
                </div>
              ) : (
                <div className="alvl-modal__field">
                  <label className="alvl-modal__label">Module</label>
                  <div className="alvl-modal__module-badge">
                    {MODULE_BY_KEY[formModule]?.icon}
                    <span>{MODULE_BY_KEY[formModule]?.label}</span>
                  </div>
                </div>
              )}


              <div className="alvl-modal__field">
                <label className="alvl-modal__label">
                  Required Role <span>*</span>
                </label>
                <div className="alvl-modal__select-wrap">
                  <select
                    className="alvl-modal__select"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                  >
                    <option value="">Select role</option>
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="alvl-modal__select-icon" />
                </div>
              </div>
              <div className="alvl-modal__field">
                <label className="alvl-modal__label">
                  <Clock size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  Time Limit <span>*</span>
                </label>
                <div className="alvl-modal__time-input-row">
                  <div className="alvl-modal__time-input-wrap">
                    <input
                      className="alvl-modal__input"
                      type="number"
                      min={1}
                      max={168}
                      value={formTimeLimit}
                      onChange={(e) => setFormTimeLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <span className="alvl-modal__time-unit">hours</span>
                  </div>
                  <div className="alvl-modal__time-presets">
                    {TIME_LIMIT_PRESETS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={`alvl-modal__time-preset ${formTimeLimit === h ? 'alvl-modal__time-preset--active' : ''}`}
                        onClick={() => setFormTimeLimit(h)}
                      >
                        {h < 24 ? `${h}h` : `${h / 24}d`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="alvl-modal__time-note">
                  <AlertTriangle size={12} />
                  <span>If the approver doesn't act within this time, the request will auto-forward to the next level.</span>
                </div>
              </div>

              {/* ── Value Range with Currency ───────────────────── */}
              <div className="alvl-modal__field">
                <label className="alvl-modal__label">
                  <Banknote size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  Value Range <span style={{ fontWeight: 400, color: 'var(--text-placeholder)' }}>optional</span>
                </label>
                <div className="alvl-modal__currency-row">
                  <CurrencySelector
                    value={formCurrency}
                    onChange={setFormCurrency}
                    size="sm"
                  />
                </div>
                <div className="alvl-modal__value-row">
                  <div className="alvl-modal__value-input-wrap">
                    <input
                      className="alvl-modal__input alvl-modal__input--value"
                      type="number"
                      min={0}
                      placeholder="Min amount"
                      value={formMinValue}
                      onChange={(e) => setFormMinValue(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                  <span className="alvl-modal__value-sep">to</span>
                  <div className="alvl-modal__value-input-wrap">
                    <input
                      className="alvl-modal__input alvl-modal__input--value"
                      type="number"
                      min={0}
                      placeholder="Max amount"
                      value={formMaxValue}
                      onChange={(e) => setFormMaxValue(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                </div>

                <div className="alvl-modal__value-note">
                  <Info size={12} />
                  <span>Leave blank for all amounts. This level only applies to documents within this amount range.</span>
                </div>
              </div>

              {!editingLevel && formModule && (
                <div className="alvl-modal__preview">
                  <Info size={14} />
                  <span>
                    This will be added as <strong>Level {(grouped[formModule]?.length || 0) + 1}</strong> in the {MODULE_BY_KEY[formModule]?.label || formModule} approval chain.
                  </span>
                </div>
              )}
            </div>
              {formError && (
                <MessageStrip type="error" compact style={{ margin: '0 20px 12px' }}>
                  {formError}
                </MessageStrip>
              )}
            <div className="alvl-modal__footer">
              <button type="button" className="alvl-modal__btn alvl-modal__btn--secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="alvl-modal__btn alvl-modal__btn--primary"
                disabled={!formModule || !formRole || saveLoading}
                onClick={handleSave}
              >
                <Check size={16} />
                {saveLoading ? 'Saving…' : editingLevel ? 'Update Level' : 'Add Level'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
