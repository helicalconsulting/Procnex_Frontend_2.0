// ============================================================
// components/admin/company-settings/budgetLogicModel.ts
// Domain model, presets, persistence and simulation for Budget Logic
// ============================================================

export type ControlLevel = 'HARD_STOP' | 'SOFT_WARNING' | 'ADVISORY' | 'NONE';
export type ScopeLevel = 'LINE_ITEM' | 'COST_CENTER' | 'DEPARTMENT' | 'ORGANIZATION';
export type PeriodGranularity = 'ANNUAL' | 'QUARTERLY' | 'MONTHLY';
export type FxSource = 'LIVE_MARKET' | 'FIXED_BUDGET_RATE' | 'DAILY_CENTRAL_BANK';
export type VatTreatment = 'EXCLUSIVE' | 'INCLUSIVE';

export interface CheckPointsConfig {
  purchaseRequisition: boolean;
  quotationAward: boolean;
  contractSigning: boolean;
  purchaseOrder: boolean;
  goodsReceipt: boolean;
  purchaseInvoice: boolean;
}

export interface ToleranceConfig {
  enabled: boolean;
  percent: number;
  maxCap: number;
  allowExceptionApproval: boolean;
  exceptionApproverRole: string;
}

export interface AlertThresholdsConfig {
  advisoryPercent: number;
  warningPercent: number;
  criticalPercent: number;
  emailNotifications: boolean;
  inAppNotifications: boolean;
}

export interface PhasingRulesConfig {
  periodGranularity: PeriodGranularity;
  enforceStrictPeriod: boolean;
  allowRollover: boolean;
  rolloverPercent: number; // 0 - 100% of remaining unspent funds allowed to roll over
  allowFutureQuarterBorrowing: boolean;
}

export interface BudgetLogicConfig {
  id?: string;
  companyCode?: string;
  controlLevel: ControlLevel;
  scopeLevel: ScopeLevel;
  tolerance: ToleranceConfig;
  checkPoints: CheckPointsConfig;
  phasing: PhasingRulesConfig;
  alerts: AlertThresholdsConfig;
  fxSource: FxSource;
  vatTreatment: VatTreatment;
  defaultBudgetDimension: 'ITEM' | 'SUPPLIER' | 'DEPARTMENT' | 'MIX_BAG';
  allowVirementBetweenLines: boolean;
  requireFinanceSignoffForVirement: boolean;
  budgetTypes?: string[];
  fundingSources?: string[];
  fxConversionSources?: Array<{ code: string; label: string }>;
  defaultBudgetType?: string;
  defaultFundingSource?: string;
  updatedAt?: string;
}

export const STORAGE_KEY_BUDGET_LOGIC = 'procnex_budget_logic_settings';

export const DEFAULT_BUDGET_LOGIC: BudgetLogicConfig = {
  controlLevel: 'HARD_STOP',
  scopeLevel: 'LINE_ITEM',
  defaultBudgetDimension: 'ITEM',
  tolerance: {
    enabled: true,
    percent: 5,
    maxCap: 50000,
    allowExceptionApproval: true,
    exceptionApproverRole: 'Finance Director / CFO',
  },
  checkPoints: {
    purchaseRequisition: true,
    quotationAward: true,
    contractSigning: true,
    purchaseOrder: true,
    goodsReceipt: false,
    purchaseInvoice: true,
  },
  phasing: {
    periodGranularity: 'QUARTERLY',
    enforceStrictPeriod: true,
    allowRollover: true,
    rolloverPercent: 100,
    allowFutureQuarterBorrowing: false,
  },
  alerts: {
    advisoryPercent: 80,
    warningPercent: 90,
    criticalPercent: 100,
    emailNotifications: true,
    inAppNotifications: true,
  },
  fxSource: 'LIVE_MARKET',
  vatTreatment: 'EXCLUSIVE',
  allowVirementBetweenLines: true,
  requireFinanceSignoffForVirement: true,
  budgetTypes: [
    'OPEX (Operating Expenditure)',
    'CAPEX (Capital Expenditure)',
    'Project Spend',
    'Donor / Grant Funded',
  ],
  fundingSources: [
    'Internal Revenue / Operational Cashflow',
    'Bank Credit / Loan Facility',
    'Equity / Shareholder Inflow',
    'Donor / NGO Grant',
  ],
  fxConversionSources: [
    { code: 'LIVE_MARKET', label: 'Live Market Rates (open.er-api.com)' },
    { code: 'FIXED_BUDGET_RATE', label: 'Fixed Budget Master Table' },
    { code: 'CENTRAL_BANK', label: 'Central Bank Daily Fixing' },
  ],
  defaultBudgetType: 'OPEX (Operating Expenditure)',
  defaultFundingSource: 'Internal Revenue / Operational Cashflow',
  updatedAt: new Date().toISOString(),
};

export const BUDGET_LOGIC_PRESETS: Record<string, { label: string; tag: string; description: string; config: Partial<BudgetLogicConfig> }> = {
  BALANCED: {
    label: 'Standard Balanced (Recommended)',
    tag: 'Recommended',
    description: 'Enforces hard stops at PO and invoice levels with 5% tolerance buffer and exception approvals enabled.',
    config: {
      controlLevel: 'HARD_STOP',
      scopeLevel: 'LINE_ITEM',
      tolerance: {
        enabled: true,
        percent: 5,
        maxCap: 50000,
        allowExceptionApproval: true,
        exceptionApproverRole: 'Finance Director / CFO',
      },
      checkPoints: {
        purchaseRequisition: true,
        quotationAward: true,
        contractSigning: true,
        purchaseOrder: true,
        goodsReceipt: false,
        purchaseInvoice: true,
      },
      allowVirementBetweenLines: true,
      requireFinanceSignoffForVirement: true,
    },
  },
  STRICT_ENTERPRISE: {
    label: 'Strict Enterprise Governance',
    tag: 'High Compliance',
    description: 'Strict 0% tolerance buffer on every single lifecycle checkpoint. Transfers require multi-tier finance approval.',
    config: {
      controlLevel: 'HARD_STOP',
      scopeLevel: 'LINE_ITEM',
      tolerance: {
        enabled: false,
        percent: 0,
        maxCap: 0,
        allowExceptionApproval: true,
        exceptionApproverRole: 'Executive Committee / Board',
      },
      checkPoints: {
        purchaseRequisition: true,
        quotationAward: true,
        contractSigning: true,
        purchaseOrder: true,
        goodsReceipt: true,
        purchaseInvoice: true,
      },
      phasing: {
        periodGranularity: 'QUARTERLY',
        enforceStrictPeriod: true,
        allowRollover: false,
        rolloverPercent: 0,
        allowFutureQuarterBorrowing: false,
      },
      allowVirementBetweenLines: true,
      requireFinanceSignoffForVirement: true,
    },
  },
  FLEXIBLE_ADVISORY: {
    label: 'Flexible Growth / Soft Warning',
    tag: 'Fast Pace',
    description: 'Soft warnings with written justification and cost center pooling. Keeps procurement flowing with minimal friction.',
    config: {
      controlLevel: 'SOFT_WARNING',
      scopeLevel: 'COST_CENTER',
      tolerance: {
        enabled: true,
        percent: 10,
        maxCap: 150000,
        allowExceptionApproval: true,
        exceptionApproverRole: 'Department Head',
      },
      checkPoints: {
        purchaseRequisition: false,
        quotationAward: false,
        contractSigning: false,
        purchaseOrder: true,
        goodsReceipt: false,
        purchaseInvoice: true,
      },
      phasing: {
        periodGranularity: 'ANNUAL',
        enforceStrictPeriod: false,
        allowRollover: true,
        rolloverPercent: 100,
        allowFutureQuarterBorrowing: true,
      },
      allowVirementBetweenLines: true,
      requireFinanceSignoffForVirement: false,
    },
  },
};

export function loadBudgetLogicSettings(): BudgetLogicConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_BUDGET_LOGIC;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY_BUDGET_LOGIC);
    if (!raw) return DEFAULT_BUDGET_LOGIC;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_BUDGET_LOGIC,
      ...parsed,
      tolerance: { ...DEFAULT_BUDGET_LOGIC.tolerance, ...(parsed.tolerance || {}) },
      checkPoints: { ...DEFAULT_BUDGET_LOGIC.checkPoints, ...(parsed.checkPoints || {}) },
      phasing: {
        ...DEFAULT_BUDGET_LOGIC.phasing,
        ...(parsed.phasing || {}),
        rolloverPercent: typeof parsed.phasing?.rolloverPercent === 'number'
          ? Math.max(0, Math.min(100, parsed.phasing.rolloverPercent))
          : (parsed.phasing?.allowRollover === false ? 0 : 100),
      },
      alerts: { ...DEFAULT_BUDGET_LOGIC.alerts, ...(parsed.alerts || {}) },
      budgetTypes: parsed.budgetTypes && parsed.budgetTypes.length > 0 ? parsed.budgetTypes : DEFAULT_BUDGET_LOGIC.budgetTypes,
      fundingSources: parsed.fundingSources && parsed.fundingSources.length > 0 ? parsed.fundingSources : DEFAULT_BUDGET_LOGIC.fundingSources,
      fxConversionSources: parsed.fxConversionSources && parsed.fxConversionSources.length > 0 ? parsed.fxConversionSources : DEFAULT_BUDGET_LOGIC.fxConversionSources,
    };
  } catch (err) {
    console.error('Failed to parse budget logic settings from localStorage', err);
    return DEFAULT_BUDGET_LOGIC;
  }
}

export function saveBudgetLogicSettings(config: BudgetLogicConfig): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const data: BudgetLogicConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY_BUDGET_LOGIC, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save budget logic settings to localStorage', err);
  }
}

export function resetBudgetLogicSettings(): BudgetLogicConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY_BUDGET_LOGIC);
    }
  } catch (err) {
    console.error('Failed to clear budget logic settings', err);
  }
  return DEFAULT_BUDGET_LOGIC;
}

export interface SpendSimulationOutcome {
  status: 'APPROVED' | 'TOLERANCE_APPROVED' | 'SOFT_WARNING' | 'HARD_STOP' | 'TRACKING_ONLY';
  allowed: boolean;
  badgeTone: 'success' | 'warning' | 'destructive' | 'neutral';
  headline: string;
  explanation: string;
  deficit: number;
  effectiveAvailable: number;
  toleranceAmount: number;
  actionRequired?: string;
}

export function simulateSpendEvaluation(
  config: BudgetLogicConfig,
  requestedAmount: number,
  lineBalance: number,
  annualAllocation: number,
  currency = 'KES'
): SpendSimulationOutcome {
  const req = Math.max(0, requestedAmount || 0);
  const bal = Math.max(0, lineBalance || 0);
  const annual = Math.max(0, annualAllocation || bal);

  let toleranceAmount = 0;
  if (config.tolerance.enabled && config.tolerance.percent > 0) {
    toleranceAmount = (annual * config.tolerance.percent) / 100;
    if (config.tolerance.maxCap > 0 && toleranceAmount > config.tolerance.maxCap) {
      toleranceAmount = config.tolerance.maxCap;
    }
  }

  const effectiveAvailable = bal + toleranceAmount;
  const deficit = Math.max(0, req - bal);

  if (config.controlLevel === 'NONE') {
    return {
      status: 'TRACKING_ONLY',
      allowed: true,
      badgeTone: 'neutral',
      headline: 'Tracking Only — Spend Permitted',
      explanation: `Budget controls are set to Tracking Only. Requisition/PO of ${req.toLocaleString()} ${currency} will be booked without blocking regardless of balance.`,
      deficit,
      effectiveAvailable,
      toleranceAmount,
    };
  }

  // Within base balance
  if (req <= bal) {
    return {
      status: 'APPROVED',
      allowed: true,
      badgeTone: 'success',
      headline: 'Pass — Full Funds Available',
      explanation: `Requested ${req.toLocaleString()} ${currency} is within the active available balance of ${bal.toLocaleString()} ${currency}. Document will be approved instantly.`,
      deficit: 0,
      effectiveAvailable,
      toleranceAmount,
    };
  }

  // Within tolerance buffer
  if (req <= effectiveAvailable) {
    return {
      status: 'TOLERANCE_APPROVED',
      allowed: true,
      badgeTone: 'warning',
      headline: 'Pass via Tolerance Buffer',
      explanation: `Spend exceeds base balance by ${deficit.toLocaleString()} ${currency}, but falls within the configured ${config.tolerance.percent}% tolerance buffer (+${toleranceAmount.toLocaleString()} ${currency}).`,
      deficit,
      effectiveAvailable,
      toleranceAmount,
      actionRequired: 'Warning logged on ledger; spend proceeds without approval halt.',
    };
  }

  // Over budget & over tolerance
  if (config.controlLevel === 'ADVISORY') {
    return {
      status: 'SOFT_WARNING',
      allowed: true,
      badgeTone: 'warning',
      headline: 'Advisory Alert — Spend Permitted',
      explanation: `Spend exceeds available balance and tolerance by ${(req - effectiveAvailable).toLocaleString()} ${currency}. Advisory banner will be presented, but document is allowed to submit.`,
      deficit,
      effectiveAvailable,
      toleranceAmount,
      actionRequired: 'Advisory notice visible to managers.',
    };
  }

  if (config.controlLevel === 'SOFT_WARNING') {
    return {
      status: 'SOFT_WARNING',
      allowed: true,
      badgeTone: 'warning',
      headline: 'Soft Warning — Written Justification Required',
      explanation: `Spend exceeds available budget by ${deficit.toLocaleString()} ${currency}. The requester/approver will be prompted to enter a written business reason before proceeding.`,
      deficit,
      effectiveAvailable,
      toleranceAmount,
      actionRequired: 'Requires mandatory override reasoning text (min 10 characters).',
    };
  }

  // Hard Stop
  return {
    status: 'HARD_STOP',
    allowed: false,
    badgeTone: 'destructive',
    headline: 'Blocked by Hard Stop — Exception Approval Required',
    explanation: `Spend strictly exceeds available limit by ${deficit.toLocaleString()} ${currency} (effective ceiling: ${effectiveAvailable.toLocaleString()} ${currency}).`,
    deficit,
    effectiveAvailable,
    toleranceAmount,
    actionRequired: config.tolerance.allowExceptionApproval
      ? `Triggers Budget Exception Approval Modal directed to: ${config.tolerance.exceptionApproverRole}.`
      : 'Submission strictly blocked. Line balance must be increased via Budget Virement or Budget Revision.',
  };
}

export function calculateRolloverAmount(unspentBalance: number, phasing: PhasingRulesConfig): number {
  if (!phasing.allowRollover || unspentBalance <= 0) return 0;
  const pct = typeof phasing.rolloverPercent === 'number'
    ? Math.max(0, Math.min(100, phasing.rolloverPercent))
    : 100;
  return (unspentBalance * pct) / 100;
}
