// ============================================================
// pages/budget/BudgetCreatePage.tsx
// Screen 1: Master Setup (A) | Screen 2: Dynamic Lines & Dimensions (B, C) | Screen 3: Rules & Approvals (D, E, H)
// Supports Item, Supplier, Department, and Mix Bag dimensions with 12-Month (Jan - Dec) phasing
// and Original / Revision workflow protected with ADMIN password.
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  ArrowLeft,
  Plus,
  Trash2,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  Sliders,
  DollarSign,
  Layers,
  Building2,
  Package,
  Users,
  Shuffle,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Search,
  Filter,
  Check,
  Calendar,
  Sparkles,
  Settings,
} from 'lucide-react';
import { budgetApi } from '../../api/budgetApi';
import { loadBudgetLogicSettings } from '../../components/admin/company-settings/budgetLogicModel';
import { companySettingsService } from '../../services/companySettingsService';
import { vendorService } from '../../services/vendorService';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { PageFrame, PageLead } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input, Select } from '../../components/ui/input';

export type BudgetLogicType = 'ITEM' | 'SUPPLIER' | 'DEPARTMENT' | 'MIX_BAG';
export type BudgetMode = 'ORIGINAL' | 'REVISION';

export interface DynamicBudgetLine {
  lineCode: string;
  lineName: string;
  costCenterCode: string;
  glAccountCode: string;
  spendCategory: string;
  dimensionType?: 'ITEM' | 'SUPPLIER' | 'DEPARTMENT';
  monthlyPhasing: number[]; // 12 numbers representing Jan through Dec
  annualAmount: number;
  q1Amount: number;
  q2Amount: number;
  q3Amount: number;
  q4Amount: number;
  controlLevelOverride?: string;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface ExistingBudgetDisplay {
  id?: string;
  budgetCode: string;
  budgetName: string;
  budgetLogic: BudgetLogicType;
  fiscalYear: string;
  currency: string;
  totalAllocated: number;
  status: string;
  lines: DynamicBudgetLine[];
}

export default function BudgetCreatePage() {
  const navigate = useNavigate();
  const { companyDefaultCurrency } = useCurrency();
  const [activeStep, setActiveStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Primary 4 Wireframe Controls ──
  const [budgetLogic, setBudgetLogic] = useState<BudgetLogicType>('ITEM');
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('ORIGINAL');
  const [budgetCode, setBudgetCode] = useState(`BDG-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [fiscalYear, setFiscalYear] = useState(`FY${new Date().getFullYear()}`);

  // Modals for Revision Flow
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionFilterLogic, setRevisionFilterLogic] = useState<string>('ALL');
  const [selectedBudgetForRev, setSelectedBudgetForRev] = useState<ExistingBudgetDisplay | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Section A: Other Header Fields
  const [budgetName, setBudgetName] = useState('');
  const [budgetType, setBudgetType] = useState('OPEX');
  const [periodGranularity, setPeriodGranularity] = useState('MONTHLY');
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [currency, setCurrency] = useState(companyDefaultCurrency || 'AED');
  const userChangedCurrencyRef = useRef(false);
  const [fxSource, setFxSource] = useState('LIVE_MARKET');
  const [vatTreatment, setVatTreatment] = useState('EXCLUSIVE');
  const [fundingSource, setFundingSource] = useState('Internal Revenue / Operational Cashflow');
  const [erpReference, setErpReference] = useState('');

  // Options configured from Budget Settings
  const [configuredBudgetTypes, setConfiguredBudgetTypes] = useState<string[]>([
    'OPEX (Operating Expenditure)',
    'CAPEX (Capital Expenditure)',
    'Project Spend',
    'Donor / Grant Funded',
  ]);
  const [configuredFundingSources, setConfiguredFundingSources] = useState<string[]>([
    'Internal Revenue / Operational Cashflow',
    'Bank Credit / Loan Facility',
    'Equity / Shareholder Inflow',
    'Donor / NGO Grant',
  ]);
  const [configuredFxSources, setConfiguredFxSources] = useState<Array<{ code: string; label: string }>>([
    { code: 'LIVE_MARKET', label: 'Live Market Rates (open.er-api.com)' },
    { code: 'FIXED_BUDGET_RATE', label: 'Fixed Budget Master Table' },
    { code: 'CENTRAL_BANK', label: 'Central Bank Daily Fixing' },
  ]);

  // Dynamic Master Data
  const [departments, setDepartments] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; vendorNo?: string; category?: string }>>([]);
  const [existingBudgets, setExistingBudgets] = useState<ExistingBudgetDisplay[]>([]);
  const [loadingExistingBudgets, setLoadingExistingBudgets] = useState(false);

  // Keep currency synced with company default unless user explicitly changed it
  useEffect(() => {
    if (companyDefaultCurrency && !userChangedCurrencyRef.current && (currency === 'KES' || !currency)) {
      setCurrency(companyDefaultCurrency);
    }
  }, [companyDefaultCurrency]);

  // Load Company Master Data on mount
  useEffect(() => {
    let isMounted = true;
    companySettingsService
      .listDepartments()
      .then((deps) => {
        if (isMounted) {
          const names = (deps || [])
            .filter((d) => d && d.isActive !== false && d.name?.trim())
            .map((d) => d.name.trim());
          if (names.length > 0) setDepartments(Array.from(new Set(names)));
        }
      })
      .catch((err) => console.error('Failed to load departments', err));

    companySettingsService
      .listCategories()
      .then((cats) => {
        if (isMounted) {
          const names = (cats || [])
            .filter((c) => c && c.name?.trim())
            .map((c) => c.name.trim());
          if (names.length > 0) setCategories(Array.from(new Set(names)));
        }
      })
      .catch((err) => console.error('Failed to load categories', err));

    vendorService
      .listTyped()
      .then((vList) => {
        if (isMounted && Array.isArray(vList)) {
          setVendors(
            vList.map((v) => ({
              id: v.id,
              name: v.name,
              vendorNo: (v as any).vendorNo,
              category: v.category,
            }))
          );
        }
      })
      .catch((err) => console.error('Failed to load vendors', err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch real existing budgets for revision modal
  useEffect(() => {
    if (showRevisionModal) {
      setLoadingExistingBudgets(true);
      budgetApi
        .list({ limit: 100 })
        .then((res) => {
          if (res?.budgets && Array.isArray(res.budgets)) {
            const mapped: ExistingBudgetDisplay[] = res.budgets.map((b) => {
              let logic: BudgetLogicType = 'ITEM';
              if (b.erpReference && b.erpReference.includes('Logic:')) {
                const match = b.erpReference.match(/Logic:([A-Z_]+)/);
                if (match && ['ITEM', 'SUPPLIER', 'DEPARTMENT', 'MIX_BAG'].includes(match[1])) {
                  logic = match[1] as BudgetLogicType;
                }
              }

              const dynamicLines: DynamicBudgetLine[] = (b.lines || []).map((l, i) => {
                let monthly: number[] = Array(12).fill(0);
                if (l.monthlyPhasing) {
                  if (Array.isArray(l.monthlyPhasing)) {
                    monthly = l.monthlyPhasing.slice(0, 12);
                  } else if (typeof l.monthlyPhasing === 'object') {
                    const keys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    monthly = keys.map((k) => Number((l.monthlyPhasing as any)[k] || (l.monthlyPhasing as any)[k.toUpperCase()] || 0));
                  }
                } else if (l.annualAmount) {
                  const perMonth = Math.round(Number(l.annualAmount) / 12);
                  monthly = Array(12).fill(perMonth);
                  monthly[11] = Number(l.annualAmount) - perMonth * 11;
                }
                return {
                  lineCode: l.lineCode || `LN-${String(i + 1).padStart(3, '0')}`,
                  lineName: l.lineName || '',
                  costCenterCode: l.costCenterCode || '',
                  glAccountCode: l.glAccountCode || '',
                  spendCategory: l.spendCategory || '',
                  dimensionType: (l as any).dimensionType || 'ITEM',
                  monthlyPhasing: monthly,
                  annualAmount: Number(l.annualAmount || 0),
                  q1Amount: Number(l.q1Amount || monthly[0] + monthly[1] + monthly[2]),
                  q2Amount: Number(l.q2Amount || monthly[3] + monthly[4] + monthly[5]),
                  q3Amount: Number(l.q3Amount || monthly[6] + monthly[7] + monthly[8]),
                  q4Amount: Number(l.q4Amount || monthly[9] + monthly[10] + monthly[11]),
                };
              });

              return {
                id: b.id,
                budgetCode: b.budgetCode,
                budgetName: b.budgetName,
                budgetLogic: logic,
                fiscalYear: b.fiscalYear,
                currency: b.currency || 'AED',
                totalAllocated: b.totalAllocated || 0,
                status: b.status || 'ACTIVE',
                lines: dynamicLines.length > 0 ? dynamicLines : generateInitialLinesForLogic(logic),
              };
            });
            setExistingBudgets(mapped);
          }
        })
        .catch((err) => console.error('Failed to load budgets for revision', err))
        .finally(() => setLoadingExistingBudgets(false));
    }
  }, [showRevisionModal]);

  // Step 2 View Mode Toggle (Monthly 12-Month vs Condensed Quarter)
  const [phasingDisplayMode, setPhasingDisplayMode] = useState<'MONTHLY' | 'QUARTERLY'>('MONTHLY');

  // Section D & E: Controls & Check Points
  const [controlLevel, setControlLevel] = useState('HARD_STOP');
  const [tolerancePercent, setTolerancePercent] = useState<number>(5);
  const [toleranceCap, setToleranceCap] = useState<number>(50000);
  const [checkPoints, setCheckPoints] = useState({
    purchaseRequisition: true,
    quotationAward: true,
    contractSigning: true,
    purchaseOrder: true,
    goodsReceipt: false,
    purchaseInvoice: true,
  });

  // Seed default dimension & classification options from Settings on mount
  useEffect(() => {
    const settings = loadBudgetLogicSettings();
    if (settings?.defaultBudgetDimension) {
      setBudgetLogic(settings.defaultBudgetDimension);
    }
    if (settings?.budgetTypes && settings.budgetTypes.length > 0) {
      setConfiguredBudgetTypes(settings.budgetTypes);
      if (settings.defaultBudgetType && settings.budgetTypes.includes(settings.defaultBudgetType)) {
        setBudgetType(settings.defaultBudgetType);
      } else {
        setBudgetType(settings.budgetTypes[0]);
      }
    }
    if (settings?.fundingSources && settings.fundingSources.length > 0) {
      setConfiguredFundingSources(settings.fundingSources);
      if (settings.defaultFundingSource && settings.fundingSources.includes(settings.defaultFundingSource)) {
        setFundingSource(settings.defaultFundingSource);
      } else {
        setFundingSource(settings.fundingSources[0]);
      }
    }
    if (settings?.fxConversionSources && settings.fxConversionSources.length > 0) {
      setConfiguredFxSources(settings.fxConversionSources);
      if (!settings.fxConversionSources.some((fx) => fx.code === fxSource)) {
        setFxSource(settings.fxConversionSources[0].code);
      }
    }
  }, []);

  // Helper to generate a clean empty line based on selected Budget Logic
  const generateInitialLinesForLogic = (logic: BudgetLogicType): DynamicBudgetLine[] => {
    let code = 'ITM-001';
    let dimensionType: DynamicBudgetLine['dimensionType'] = undefined;
    if (logic === 'SUPPLIER') code = 'SUP-001';
    else if (logic === 'DEPARTMENT') code = 'DEP-001';
    else if (logic === 'MIX_BAG') {
      code = 'LN-001';
      dimensionType = 'ITEM';
    }

    return [
      {
        lineCode: code,
        lineName: '',
        costCenterCode: '',
        glAccountCode: '',
        spendCategory: '',
        dimensionType,
        monthlyPhasing: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        annualAmount: 0,
        q1Amount: 0,
        q2Amount: 0,
        q3Amount: 0,
        q4Amount: 0,
      },
    ];
  };

  // Lines State initialized cleanly
  const [lines, setLines] = useState<DynamicBudgetLine[]>(() => generateInitialLinesForLogic('ITEM'));

  // Switch logic: updates lines when user changes Budget Logic
  const handleBudgetLogicChange = (newLogic: BudgetLogicType) => {
    setBudgetLogic(newLogic);
    setLines(generateInitialLinesForLogic(newLogic));
  };

  // Mode change handler: if Revision chosen, trigger modal
  const handleModeChange = (newMode: BudgetMode) => {
    setBudgetMode(newMode);
    if (newMode === 'REVISION') {
      setShowRevisionModal(true);
    }
  };

  // Revision modal: select budget
  const handleSelectBudgetForRevision = (budget: MockExistingBudget) => {
    setSelectedBudgetForRev(budget);
    setShowRevisionModal(false);
    setAdminPasswordInput('');
    setPasswordError(null);
    setShowPasswordModal(true);
  };

  // Admin password verification
  const handleVerifyAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (adminPasswordInput.trim().toUpperCase() !== 'ADMIN') {
      setPasswordError('Invalid Admin Password. Please enter "ADMIN".');
      return;
    }

    if (!selectedBudgetForRev) return;

    // Load selected budget data
    setBudgetLogic(selectedBudgetForRev.budgetLogic);
    setBudgetCode(`${selectedBudgetForRev.budgetCode}-REV1`);
    setBudgetName(`${selectedBudgetForRev.budgetName} (Revised)`);
    setFiscalYear(selectedBudgetForRev.fiscalYear);
    setCurrency(selectedBudgetForRev.currency);
    setLines(selectedBudgetForRev.lines);
    setShowPasswordModal(false);
    setSuccessMsg(`Revision mode unlocked for ${selectedBudgetForRev.budgetCode}. Existing dimensional lines and monthly phasing loaded.`);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const cancelRevision = () => {
    setShowPasswordModal(false);
    setShowRevisionModal(false);
    setSelectedBudgetForRev(null);
    setBudgetMode('ORIGINAL');
  };

  // Add line according to current logic
  const addLine = () => {
    const nextIdx = lines.length + 1;
    let code = `LN-00${nextIdx}`;
    let dimensionType: DynamicBudgetLine['dimensionType'] = undefined;

    if (budgetLogic === 'ITEM') code = `ITM-00${nextIdx}`;
    else if (budgetLogic === 'SUPPLIER') code = `SUP-10${nextIdx}`;
    else if (budgetLogic === 'DEPARTMENT') code = `DEP-0${nextIdx}`;
    else if (budgetLogic === 'MIX_BAG') {
      code = `LN-00${nextIdx}`;
      dimensionType = 'ITEM';
    }

    setLines([
      ...lines,
      {
        lineCode: code,
        lineName: '',
        costCenterCode: '',
        glAccountCode: '',
        spendCategory: 'General',
        dimensionType,
        monthlyPhasing: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        annualAmount: 0,
        q1Amount: 0,
        q2Amount: 0,
        q3Amount: 0,
        q4Amount: 0,
      },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  // Update a single field on a line
  const updateLineField = (idx: number, field: keyof DynamicBudgetLine, value: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };

    // Auto-split annual amount evenly across all 12 months (Jan - Dec)
    if (field === 'annualAmount') {
      const num = Number(value) || 0;
      const monthly = Math.round(num / 12);
      const newMonthly = Array(12).fill(monthly);
      // Adjust last month to handle roundoff
      newMonthly[11] = num - monthly * 11;
      updated[idx].monthlyPhasing = newMonthly;

      // Update quarters
      updated[idx].q1Amount = newMonthly[0] + newMonthly[1] + newMonthly[2];
      updated[idx].q2Amount = newMonthly[3] + newMonthly[4] + newMonthly[5];
      updated[idx].q3Amount = newMonthly[6] + newMonthly[7] + newMonthly[8];
      updated[idx].q4Amount = newMonthly[9] + newMonthly[10] + newMonthly[11];
    }

    setLines(updated);
  };

  // Update an individual month value
  const updateLineMonth = (lineIdx: number, monthIdx: number, value: number) => {
    const updated = [...lines];
    const newPhasing = [...updated[lineIdx].monthlyPhasing];
    newPhasing[monthIdx] = Math.max(0, Number(value) || 0);
    updated[lineIdx].monthlyPhasing = newPhasing;

    // Recalculate annual sum and quarters
    const newAnnual = newPhasing.reduce((sum, v) => sum + v, 0);
    updated[lineIdx].annualAmount = newAnnual;
    updated[lineIdx].q1Amount = newPhasing[0] + newPhasing[1] + newPhasing[2];
    updated[lineIdx].q2Amount = newPhasing[3] + newPhasing[4] + newPhasing[5];
    updated[lineIdx].q3Amount = newPhasing[6] + newPhasing[7] + newPhasing[8];
    updated[lineIdx].q4Amount = newPhasing[9] + newPhasing[10] + newPhasing[11];

    setLines(updated);
  };

  const totalAllocated = lines.reduce((sum, l) => sum + (Number(l.annualAmount) || 0), 0);

  const handleSubmit = async (submitForApproval: boolean) => {
    setError(null);
    if (!budgetName.trim()) {
      setError('Budget Name is required');
      setActiveStep(1);
      return;
    }

    if (lines.length === 0 || totalAllocated <= 0) {
      setError('Please add at least one budget allocation line with an amount');
      setActiveStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const res = await budgetApi.create({
        budgetName,
        budgetCode,
        budgetType,
        fiscalYear,
        periodGranularity,
        startDate,
        endDate,
        currency,
        fxSource,
        vatTreatment,
        fundingSource,
        erpReference: `Logic:${budgetLogic}|Mode:${budgetMode}|${erpReference || ''}`,
        controlLevel,
        tolerancePercent,
        toleranceCap,
        checkPoints,
        lines,
        submitForApproval,
      });

      if (res?.budget?.id) {
        navigate(`/budget/${res.budget.id}`);
      } else {
        navigate('/budget');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create budget');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered real budgets for revision
  const filteredExistingBudgets = existingBudgets.filter((b) => {
    if (revisionFilterLogic === 'ALL') return true;
    return b.budgetLogic === revisionFilterLogic;
  });

  return (
    <PageFrame className="space-y-6">
      {/* Top Header */}
      <PageLead
        title={budgetMode === 'REVISION' ? `Revise Budget (${budgetCode})` : 'Create New Budget'}
        description="Configure header parameters, dimensional allocation lines, and multi-tier control rules"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin/company-settings?tab=budget-logic')}
            className="gap-2"
          >
            <Settings className="size-4 text-primary" />
            <span>Budget Settings</span>
          </Button>
        }
      />

      {/* ── Step Progress Indicator ── */}
      <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-muted/60 border border-border/60 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          className={`py-2.5 px-2 rounded-xl flex items-center justify-center gap-2 min-w-0 transition ${
            activeStep === 1
              ? 'bg-card text-foreground shadow-xs border border-border font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="w-5 h-5 shrink-0 rounded-full bg-primary/10 text-primary text-[11px] flex items-center justify-center font-bold">1</span>
          <span className="truncate">Header (A)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(2)}
          className={`py-2.5 px-2 rounded-xl flex items-center justify-center gap-2 min-w-0 transition ${
            activeStep === 2
              ? 'bg-card text-foreground shadow-xs border border-border font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="w-5 h-5 shrink-0 rounded-full bg-primary/10 text-primary text-[11px] flex items-center justify-center font-bold">2</span>
          <span className="truncate">Lines &amp; Dimensions (B, C)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(3)}
          className={`py-2.5 px-2 rounded-xl flex items-center justify-center gap-2 min-w-0 transition ${
            activeStep === 3
              ? 'bg-card text-foreground shadow-xs border border-border font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="w-5 h-5 shrink-0 rounded-full bg-primary/10 text-primary text-[11px] flex items-center justify-center font-bold">3</span>
          <span className="truncate">Rules &amp; Approvals (D, E, H)</span>
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── STEP 1: HEADER & PARAMETERS (A) ── */}
      {activeStep === 1 && (
        <Card className="p-6 border-border/80 shadow-sm space-y-6">
          <div className="border-b border-border/60 pb-3">
            <h3 className="text-base font-semibold text-foreground">
              Section A: Budget Header &amp; Financial Setup
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Specify budgeting logic, dimensions, boundaries, currency, and planning dates.
            </p>
          </div>

          {/* ── WIREFRAME CONTROL CARD (From User Sketch) ── */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-primary/5 via-card to-primary/10 border-2 border-primary/30 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Budget Governance &amp; Dimensional Logic Control
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Set Budget By: <strong className="text-primary">{budgetLogic}</strong> · Mode: <strong className="text-foreground">{budgetMode}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Budget Logic */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Package className="size-3.5 text-primary" />
                  <span>Budget Logic</span>
                  <span className="text-destructive">*</span>
                </label>
                <Select
                  value={budgetLogic}
                  onChange={(e) => handleBudgetLogicChange(e.target.value as BudgetLogicType)}
                  className="h-10 text-sm font-semibold rounded-xl bg-card"
                >
                  <option value="ITEM">Item — Set Budget By Item</option>
                  <option value="SUPPLIER">Supplier — Set Budget By Supplier</option>
                  <option value="DEPARTMENT">Department — Set Budget By Department</option>
                  <option value="MIX_BAG">Mix Bag — Composite Dimensions</option>
                </Select>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {budgetLogic === 'ITEM' && 'Aligns Section B & C to Item No., Item Name & Monthly Phasing'}
                  {budgetLogic === 'SUPPLIER' && 'Aligns Section B & C to Supplier No., Supplier Name & Quota'}
                  {budgetLogic === 'DEPARTMENT' && 'Aligns Section B & C to Department Code, Name & Cost Center'}
                  {budgetLogic === 'MIX_BAG' && 'Permits mixing Items, Suppliers and Department lines'}
                </span>
              </div>

              {/* 2. Original / Revision */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                  <FileCheck className="size-3.5 text-primary" />
                  <span>Original / Revision</span>
                  <span className="text-destructive">*</span>
                </label>
                <Select
                  value={budgetMode}
                  onChange={(e) => handleModeChange(e.target.value as BudgetMode)}
                  className="h-10 text-sm font-semibold rounded-xl bg-card"
                >
                  <option value="ORIGINAL">Original (New Master Budget)</option>
                  <option value="REVISION">Revision (Modify Existing Budget)</option>
                </Select>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {budgetMode === 'ORIGINAL'
                    ? 'Enter budget number or use auto-generated reference'
                    : 'Unlocks revision modal filtered by Budget Logic'}
                </span>
              </div>

              {/* 3. Budget No */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                  <span className="font-mono text-primary font-bold">#</span>
                  <span>Budget No.</span>
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  value={budgetCode}
                  onChange={(e) => setBudgetCode(e.target.value)}
                  placeholder="e.g. BDG-2026-665"
                  className="h-10 text-sm font-semibold rounded-xl bg-card"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  Unique organizational identifier
                </span>
              </div>

              {/* 4. Budget Year */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" />
                  <span>Budget Year</span>
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(e.target.value)}
                  placeholder="e.g. 2026 / FY2026"
                  className="h-10 text-sm font-semibold rounded-xl bg-card"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  Active financial planning year
                </span>
              </div>
            </div>
          </div>

          {/* ── General Header Details ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Budget Name <span className="text-destructive font-normal">*</span>
              </label>
              <Input
                type="text"
                value={budgetName}
                onChange={(e) => setBudgetName(e.target.value)}
                placeholder="e.g. FY2026 Commercial Banking OPEX"
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Budget Type
              </label>
              <Select
                value={budgetType}
                onChange={(e) => setBudgetType(e.target.value)}
                className="h-10 text-sm rounded-xl"
              >
                {configuredBudgetTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Base Currency (Single Budget Currency) <span className="text-destructive font-normal">*</span>
              </label>
              <Select
                value={currency}
                onChange={(e) => {
                  userChangedCurrencyRef.current = true;
                  setCurrency(e.target.value);
                }}
                className="h-10 text-sm rounded-xl"
              >
                <option value="AED">AED — UAE Dirham</option>
                <option value="USD">USD — US Dollar</option>
                <option value="INR">INR — Indian Rupee</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="KES">KES — Kenya Shilling</option>
                <option value="UGX">UGX — Uganda Shilling</option>
                <option value="RWF">RWF — Rwandan Franc</option>
                {companyDefaultCurrency && !['AED', 'USD', 'INR', 'EUR', 'GBP', 'SAR', 'KES', 'UGX', 'RWF'].includes(companyDefaultCurrency) && (
                  <option value={companyDefaultCurrency}>{companyDefaultCurrency}</option>
                )}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Period Granularity
              </label>
              <Select
                value={periodGranularity}
                onChange={(e) => setPeriodGranularity(e.target.value)}
                className="h-10 text-sm rounded-xl"
              >
                <option value="MONTHLY">Monthly (January to December) — Recommended</option>
                <option value="QUARTERLY">Quarterly (Q1, Q2, Q3, Q4)</option>
                <option value="ANNUAL">Annual (Lump Sum)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                VAT / Tax Treatment
              </label>
              <Select
                value={vatTreatment}
                onChange={(e) => setVatTreatment(e.target.value)}
                className="h-10 text-sm rounded-xl"
              >
                <option value="EXCLUSIVE">Exclusive of VAT (Net Amount)</option>
                <option value="INCLUSIVE">Inclusive of VAT (Gross Amount)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Funding Source
              </label>
              <Select
                value={fundingSource}
                onChange={(e) => setFundingSource(e.target.value)}
                className="h-10 text-sm rounded-xl"
              >
                {configuredFundingSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                FX Conversion Source
              </label>
              <Select
                value={fxSource}
                onChange={(e) => setFxSource(e.target.value)}
                className="h-10 text-sm rounded-xl"
              >
                {configuredFxSources.map((fx) => (
                  <option key={fx.code} value={fx.code}>
                    {fx.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border/60">
            <Button
              type="button"
              onClick={() => setActiveStep(2)}
              className="gap-2 font-semibold shadow-xs"
            >
              <span>Next: Allocation Lines (B, C)</span>
              <span>&rarr;</span>
            </Button>
          </div>
        </Card>
      )}

      {/* ── STEP 2: ALLOCATION LINES & DIMENSIONS (B, C) ── */}
      {activeStep === 2 && (
        <Card className="p-6 border-border/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                  Logic: {budgetLogic}
                </span>
                <h3 className="text-sm font-bold text-foreground">
                  {budgetLogic === 'ITEM' && 'Section B & C: Item-Wise Allocation Lines & Monthly Phasing'}
                  {budgetLogic === 'SUPPLIER' && 'Section B & C: Supplier-Wise Allocation Lines & Monthly Phasing'}
                  {budgetLogic === 'DEPARTMENT' && 'Section B & C: Department-Wise Allocation Lines & Monthly Phasing'}
                  {budgetLogic === 'MIX_BAG' && 'Section B & C: Mix Bag Dimensional Lines & Monthly Phasing'}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total Budget: <strong className="text-primary text-sm font-bold">{totalAllocated.toLocaleString()} {currency}</strong> across {lines.length} line(s) · January to December monthly distribution
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {/* Phasing Display View Toggle */}
              <div className="flex items-center p-1 rounded-xl bg-muted/60 border border-border/60 text-xs">
                <button
                  type="button"
                  onClick={() => setPhasingDisplayMode('MONTHLY')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition ${
                    phasingDisplayMode === 'MONTHLY'
                      ? 'bg-card text-foreground shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  12 Months (Jan–Dec)
                </button>
                <button
                  type="button"
                  onClick={() => setPhasingDisplayMode('QUARTERLY')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition ${
                    phasingDisplayMode === 'QUARTERLY'
                      ? 'bg-card text-foreground shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Quarters (Q1–Q4)
                </button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                <span>
                  {budgetLogic === 'ITEM' && 'Add Item'}
                  {budgetLogic === 'SUPPLIER' && 'Add Supplier'}
                  {budgetLogic === 'DEPARTMENT' && 'Add Department'}
                  {budgetLogic === 'MIX_BAG' && 'Add Line'}
                </span>
              </Button>
            </div>
          </div>

          {/* Dynamic Master Data Datalists for Step 2 Autocomplete */}
          <datalist id="budget-depts-list">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>

          <datalist id="budget-categories-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <datalist id="budget-vendors-list">
            {vendors.map((v) => (
              <option key={v.id} value={v.name}>
                {v.category ? `Category: ${v.category}` : ''}
              </option>
            ))}
          </datalist>

          {/* ── Dynamic Lines Table ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[1100px] table-divided">
              <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70">
                <tr>
                  <th className="px-2.5 py-2.5 w-10 text-center">#</th>

                  {/* Dynamic Dimension Column Headers */}
                  {budgetLogic === 'MIX_BAG' && (
                    <th className="px-3 py-2.5 w-32">Dimension</th>
                  )}

                  <th className="px-3 py-2.5 w-28">
                    {budgetLogic === 'ITEM' && 'Item No.'}
                    {budgetLogic === 'SUPPLIER' && 'Supplier No.'}
                    {budgetLogic === 'DEPARTMENT' && 'Dept Code'}
                    {budgetLogic === 'MIX_BAG' && 'Code / No.'}
                  </th>

                  <th className="px-3 py-2.5 w-44">
                    {budgetLogic === 'ITEM' && 'Item Name'}
                    {budgetLogic === 'SUPPLIER' && 'Supplier Name'}
                    {budgetLogic === 'DEPARTMENT' && 'Department Name'}
                    {budgetLogic === 'MIX_BAG' && 'Name / Description'}
                  </th>

                  <th className="px-3 py-2.5 w-36">
                    {budgetLogic === 'ITEM' && 'Category'}
                    {budgetLogic === 'SUPPLIER' && 'Category / Service'}
                    {budgetLogic === 'DEPARTMENT' && 'Cost Center'}
                    {budgetLogic === 'MIX_BAG' && 'Cost Center / Cat'}
                  </th>

                  {/* 12-Month Columns (January to December) or Quarterly Columns */}
                  {phasingDisplayMode === 'MONTHLY' ? (
                    MONTH_NAMES.map((m, mIdx) => (
                      <th key={m} className="px-2 py-2.5 w-20 text-right font-medium">
                        {m}
                      </th>
                    ))
                  ) : (
                    <>
                      <th className="px-3 py-2.5 w-24 text-right font-medium">Q1 (Jan–Mar)</th>
                      <th className="px-3 py-2.5 w-24 text-right font-medium">Q2 (Apr–Jun)</th>
                      <th className="px-3 py-2.5 w-24 text-right font-medium">Q3 (Jul–Sep)</th>
                      <th className="px-3 py-2.5 w-24 text-right font-medium">Q4 (Oct–Dec)</th>
                    </>
                  )}

                  <th className="px-3 py-2.5 w-32 text-right font-bold text-foreground">
                    Total ({currency})
                  </th>
                  <th className="px-2 py-2.5 w-10 text-center"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/40">
                {lines.map((line, idx) => {
                  const effectiveDimension = budgetLogic === 'MIX_BAG' ? (line.dimensionType || 'ITEM') : budgetLogic;
                  return (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-2.5 py-2 text-center text-muted-foreground font-semibold text-[11px]">
                      {idx + 1}
                    </td>

                    {/* Mix Bag Dimension Selector */}
                    {budgetLogic === 'MIX_BAG' && (
                      <td className="px-3 py-2">
                        <Select
                          value={line.dimensionType || 'ITEM'}
                          onChange={(e) => updateLineField(idx, 'dimensionType', e.target.value)}
                          className="h-8 text-xs"
                        >
                          <option value="ITEM">Item</option>
                          <option value="SUPPLIER">Supplier</option>
                          <option value="DEPARTMENT">Department</option>
                        </Select>
                      </td>
                    )}

                    {/* Line Code / No */}
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={line.lineCode}
                        onChange={(e) => updateLineField(idx, 'lineCode', e.target.value)}
                        placeholder={
                          budgetLogic === 'ITEM' ? 'ITM-001' :
                          budgetLogic === 'SUPPLIER' ? 'SUP-001' :
                          budgetLogic === 'DEPARTMENT' ? 'DEP-001' : 'LN-001'
                        }
                        className="h-8 text-xs font-mono font-semibold"
                      />
                    </td>

                    {/* Line Name with Autocomplete */}
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={line.lineName}
                        list={
                          effectiveDimension === 'DEPARTMENT'
                            ? 'budget-depts-list'
                            : effectiveDimension === 'SUPPLIER'
                            ? 'budget-vendors-list'
                            : undefined
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          updateLineField(idx, 'lineName', val);
                          // Auto-suggest category if supplier matched from list
                          if (effectiveDimension === 'SUPPLIER') {
                            const found = vendors.find((v) => v.name.toLowerCase() === val.toLowerCase());
                            if (found?.category && !line.spendCategory) {
                              updateLineField(idx, 'spendCategory', found.category);
                            }
                          }
                          // Auto-suggest cost center if department matched
                          if (effectiveDimension === 'DEPARTMENT' && val.trim() && !line.costCenterCode) {
                            const autoCc = `CC-${val.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 8)}`;
                            updateLineField(idx, 'costCenterCode', autoCc);
                          }
                        }}
                        placeholder={
                          effectiveDimension === 'ITEM'
                            ? 'e.g. Workstations, Office Equipment...'
                            : effectiveDimension === 'SUPPLIER'
                            ? 'Select or type supplier name...'
                            : effectiveDimension === 'DEPARTMENT'
                            ? 'Select or type department...'
                            : 'Name / Description'
                        }
                        className="h-8 text-xs"
                      />
                    </td>

                    {/* Category or Cost Center */}
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={effectiveDimension === 'DEPARTMENT' ? line.costCenterCode : line.spendCategory}
                        list={effectiveDimension !== 'DEPARTMENT' ? 'budget-categories-list' : undefined}
                        onChange={(e) =>
                          updateLineField(
                            idx,
                            effectiveDimension === 'DEPARTMENT' ? 'costCenterCode' : 'spendCategory',
                            e.target.value
                          )
                        }
                        placeholder={effectiveDimension === 'DEPARTMENT' ? 'e.g. CC-IT-101' : 'Select or type category...'}
                        className="h-8 text-xs"
                      />
                    </td>

                    {/* Monthly Inputs (Jan to Dec) or Quarterly View */}
                    {phasingDisplayMode === 'MONTHLY' ? (
                      line.monthlyPhasing.map((val, mIdx) => (
                        <td key={mIdx} className="px-1.5 py-2 text-right">
                          <Input
                            type="number"
                            min="0"
                            value={val}
                            onChange={(e) => updateLineMonth(idx, mIdx, Number(e.target.value))}
                            className="h-8 text-xs text-right px-1 font-mono"
                          />
                        </td>
                      ))
                    ) : (
                      <>
                        <td className="px-2 py-2 text-right font-mono text-xs">{line.q1Amount.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{line.q2Amount.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{line.q3Amount.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{line.q4Amount.toLocaleString()}</td>
                      </>
                    )}

                    {/* Total Annual Amount */}
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={line.annualAmount}
                        onChange={(e) => updateLineField(idx, 'annualAmount', Number(e.target.value))}
                        className="h-8 text-xs text-right font-bold text-primary"
                      />
                    </td>

                    {/* Delete Line */}
                    <td className="px-2 py-2 text-center">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive transition"
                          title="Remove line"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-4 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveStep(1)}
              className="gap-2"
            >
              <span>&larr;</span>
              <span>Back: Header (A)</span>
            </Button>
            <Button
              type="button"
              onClick={() => setActiveStep(3)}
              className="gap-2 font-semibold shadow-xs"
            >
              <span>Next: Rules &amp; Approvals</span>
              <span>&rarr;</span>
            </Button>
          </div>
        </Card>
      )}

      {/* ── STEP 3: CONTROLS, CHECK POINTS & APPROVALS (D, E, H) ── */}
      {activeStep === 3 && (
        <Card className="p-6 border-border/80 shadow-sm space-y-6">
          <div className="border-b border-border/60 pb-3">
            <h3 className="text-base font-semibold text-foreground">
              Screen 2: Control Rules &amp; Multi-Tier Approvals
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set automated tolerance thresholds and lifecycle document checkpoints.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Section D: Control Level */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                <span>Section D: Control Level &amp; Tolerance</span>
              </h4>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Default Control Level <span className="text-destructive font-normal">*</span>
                </label>
                <Select
                  value={controlLevel}
                  onChange={(e) => setControlLevel(e.target.value)}
                  className="h-10 text-sm rounded-xl"
                >
                  <option value="HARD_STOP">Hard Stop — Opens Exception Approval Modal</option>
                  <option value="SOFT_WARNING">Soft Warning — Requires Written Override Justification</option>
                  <option value="ADVISORY">Advisory — Informational Banner Only</option>
                  <option value="NONE">None — Tracking Only</option>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Tolerance %
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={tolerancePercent}
                    onChange={(e) => setTolerancePercent(Number(e.target.value))}
                    className="h-10 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Tolerance Cap ({currency})
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={toleranceCap}
                    onChange={(e) => setToleranceCap(Number(e.target.value))}
                    className="h-10 text-sm rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Section E: Check Points */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileCheck className="size-4 text-primary" />
                <span>Section E: Lifecycle Check Points</span>
              </h4>
              <p className="text-xs text-muted-foreground">
                Choose which documents validate against budget availability:
              </p>

              <div className="space-y-2.5">
                {[
                  { key: 'purchaseRequisition', label: '1. Purchase Requisition (Pre-Commitment)' },
                  { key: 'quotationAward', label: '2. RFQ / Quotation Award' },
                  { key: 'contractSigning', label: '3. Master Contract Signing' },
                  { key: 'purchaseOrder', label: '4. Purchase Order Issuance (Commitment)' },
                  { key: 'goodsReceipt', label: '5. Goods Received Note (GRN)' },
                  { key: 'purchaseInvoice', label: '6. Purchase Invoice Approval (Actual Spend)' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(checkPoints as any)[key]}
                      onChange={(e) =>
                        setCheckPoints({ ...checkPoints, [key]: e.target.checked })
                      }
                      className="rounded border-input text-primary shadow-xs focus:ring-primary size-4"
                    />
                    <span className="text-sm text-foreground font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Section H: Multi-Tier Approval Summary */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <span>Section H: Multi-Tier Approval Routing (Level 1 &rarr; 2 &rarr; 3)</span>
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Submitting this budget will initiate multi-tier governance:
              <br />
              <strong className="text-foreground font-semibold">Level 1 (Dept Head)</strong> &rarr; <strong className="text-foreground font-semibold">Level 2 (Finance Manager)</strong> &rarr; <strong className="text-foreground font-semibold">Level 3 (CFO / Board)</strong>.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveStep(2)}
              className="gap-2"
            >
              <span>&larr;</span>
              <span>Back: Lines &amp; Dimensions</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
              >
                Save as Draft
              </Button>

              <Button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
                className="gap-2 font-semibold shadow-xs"
              >
                {submitting ? 'Submitting...' : 'Submit for Level 1, 2, 3 Approval'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── MODAL 1: REVISION SELECTION MODAL ── */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-5 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <FileCheck className="size-5 text-primary" />
                  Select Budget for Revision
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filtered based on Budget Logic: choose an active budget to create a revision.
                </p>
              </div>
              <button
                type="button"
                onClick={cancelRevision}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Filter by Budget Logic */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Filter size={13} /> Filter:
              </span>
              {[
                { id: 'ALL', label: 'All Budgets' },
                { id: 'ITEM', label: 'Item Wise' },
                { id: 'SUPPLIER', label: 'Supplier Wise' },
                { id: 'DEPARTMENT', label: 'Department Wise' },
                { id: 'MIX_BAG', label: 'Mix Bag' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRevisionFilterLogic(f.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                    revisionFilterLogic === f.id
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-border/70 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Budget List */}
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {loadingExistingBudgets ? (
                <div className="p-8 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl">
                  Loading budgets from database...
                </div>
              ) : filteredExistingBudgets.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl">
                  No active budgets found in the system.
                </div>
              ) : (
                filteredExistingBudgets.map((b) => (
                  <div
                    key={b.budgetCode}
                    className="p-3.5 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition flex items-center justify-between gap-3 cursor-pointer"
                    onClick={() => handleSelectBudgetForRevision(b)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {b.budgetCode}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border/60">
                          {b.budgetLogic}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          {b.status}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-foreground">{b.budgetName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        FY{b.fiscalYear} · Total Allocated: {b.totalAllocated.toLocaleString()} {b.currency} across {b.lines.length} line(s)
                      </div>
                    </div>

                    <Button type="button" size="sm" variant="outline" className="text-xs shrink-0 gap-1">
                      <span>Select</span>
                      <span>&rarr;</span>
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border/60">
              <Button type="button" variant="outline" size="sm" onClick={cancelRevision}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: ADMIN PASSWORD VERIFICATION MODAL ── */}
      {showPasswordModal && selectedBudgetForRev && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-5 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  <Lock size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Admin Verification Required</h3>
                  <p className="text-[11px] text-muted-foreground">Budget Revision Authorization</p>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelRevision}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyAdminPassword} className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Revising <strong className="text-foreground">{selectedBudgetForRev.budgetCode}</strong> will generate a tracked revision. Please enter the Administrator password to authorize this action:
              </p>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Admin Password
                </label>
                <div className="relative">
                  <Input
                    type={showPasswordText ? 'text' : 'password'}
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter password (ADMIN)"
                    className="h-10 text-sm rounded-xl pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1.5 block">
                  💡 Hint: Enter <code className="px-1.5 py-0.5 rounded bg-muted font-bold text-primary">ADMIN</code> to unlock.
                </span>
              </div>

              {passwordError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button type="button" variant="outline" size="sm" onClick={cancelRevision}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="font-semibold gap-1.5">
                  <Lock size={14} />
                  <span>Verify &amp; Unlock Revision</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
