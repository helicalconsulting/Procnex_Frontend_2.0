// ============================================================
// pages/budget/BudgetCreatePage.tsx
// Screen 1: Master Setup (A) | Screen 2: Rules & Approvals (D, E, H)
// ============================================================
import React, { useState } from 'react';
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
} from 'lucide-react';
import { budgetApi, type CreateBudgetLineInput } from '../../api/budgetApi';
import { PageFrame, PageLead } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input, Select } from '../../components/ui/input';

export default function BudgetCreatePage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Section A: Header State
  const [budgetName, setBudgetName] = useState('');
  const [budgetCode, setBudgetCode] = useState(`BDG-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [budgetType, setBudgetType] = useState('OPEX');
  const [fiscalYear, setFiscalYear] = useState(`FY${new Date().getFullYear()}`);
  const [periodGranularity, setPeriodGranularity] = useState('QUARTERLY');
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [currency, setCurrency] = useState('KES');
  const [fxSource, setFxSource] = useState('LIVE_MARKET');
  const [vatTreatment, setVatTreatment] = useState('EXCLUSIVE');
  const [fundingSource, setFundingSource] = useState('INTERNAL_REVENUE');
  const [erpReference, setErpReference] = useState('');

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

  // Section B & C: Lines State
  const [lines, setLines] = useState<CreateBudgetLineInput[]>([
    {
      lineCode: 'LN-001',
      lineName: 'IT Infrastructure & Software Licenses',
      costCenterCode: 'CC-101',
      glAccountCode: 'GL-52010',
      spendCategory: 'IT & Telecoms',
      annualAmount: 1200000,
      q1Amount: 300000,
      q2Amount: 300000,
      q3Amount: 300000,
      q4Amount: 300000,
      controlLevelOverride: undefined,
    },
    {
      lineCode: 'LN-002',
      lineName: 'Office Supplies & Stationeries',
      costCenterCode: 'CC-102',
      glAccountCode: 'GL-52020',
      spendCategory: 'Admin & Office',
      annualAmount: 400000,
      q1Amount: 100000,
      q2Amount: 100000,
      q3Amount: 100000,
      q4Amount: 100000,
      controlLevelOverride: undefined,
    },
  ]);

  const addLine = () => {
    const nextIdx = lines.length + 1;
    setLines([
      ...lines,
      {
        lineCode: `LN-00${nextIdx}`,
        lineName: '',
        costCenterCode: '',
        glAccountCode: '',
        spendCategory: 'General',
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

  const updateLineField = (idx: number, field: keyof CreateBudgetLineInput, value: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };

    // Auto-split annual amount evenly across quarters if annual amount changes
    if (field === 'annualAmount') {
      const num = Number(value) || 0;
      const quarter = Math.round(num / 4);
      updated[idx].q1Amount = quarter;
      updated[idx].q2Amount = quarter;
      updated[idx].q3Amount = quarter;
      updated[idx].q4Amount = num - quarter * 3;
    }

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
      setError('Please add at least one budget allocation line with an annual amount');
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
        erpReference,
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

  return (
    <PageFrame className="space-y-6">
      {/* Top Header */}
      <PageLead
        title="Create New Budget"
        description="Configure header parameters, dimensional allocation lines, and multi-tier control rules"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/budget')}
            className="gap-2"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Budgets</span>
          </Button>
        }
      />

      {/* Step Indicator */}
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
          <span className="truncate">Lines & Dimensions (B, C)</span>
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
          <span className="truncate">Rules & Approvals (D, E, H)</span>
        </button>
      </div>

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
              Section A: Budget Header & Financial Setup
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Specify budgeting boundaries, currency, accounting treatment, and planning dates.
            </p>
          </div>

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
                Budget Code <span className="text-destructive font-normal">*</span>
              </label>
              <Input
                type="text"
                value={budgetCode}
                onChange={(e) => setBudgetCode(e.target.value)}
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
                <option value="OPEX">OPEX (Operating Expenditure)</option>
                <option value="CAPEX">CAPEX (Capital Expenditure)</option>
                <option value="PROJECT">Project Spend</option>
                <option value="DONOR_GRANT">Donor / Grant Funded</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Fiscal Year <span className="text-destructive font-normal">*</span>
              </label>
              <Input
                type="text"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                placeholder="e.g. FY2026"
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Base Currency (Single Budget Currency) <span className="text-destructive font-normal">*</span>
              </label>
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-10 text-sm rounded-xl"
              >
                <option value="KES">KES — Kenya Shilling</option>
                <option value="UGX">UGX — Uganda Shilling</option>
                <option value="RWF">RWF — Rwandan Franc</option>
                <option value="ZMW">ZMW — Zambian Kwacha</option>
                <option value="MWK">MWK — Malawian Kwacha</option>
                <option value="GHS">GHS — Ghana Cedi</option>
                <option value="CDF">CDF — Congolese Franc</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="USD">USD — US Dollar (Donor / Regional)</option>
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
                <option value="QUARTERLY">Quarterly (Q1, Q2, Q3, Q4)</option>
                <option value="MONTHLY">Monthly (M1 – M12)</option>
                <option value="SEMI_ANNUAL">Semi-Annual (H1, H2)</option>
                <option value="ANNUAL">Annual (Lump sum)</option>
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
                <option value="EXCLUSIVE">Exclusive of VAT</option>
                <option value="INCLUSIVE">Inclusive of VAT</option>
                <option value="EXEMPT">Exempt / Zero-rated</option>
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
                <option value="INTERNAL_REVENUE">Internal Revenue / Operational Cashflow</option>
                <option value="COMMERCIAL_LOAN">Commercial Bank Loan</option>
                <option value="DONOR_GRANT">Donor Grant / Development Partner</option>
                <option value="EQUITY">Equity Financing</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                FX Source
              </label>
              <Select
                value={fxSource}
                onChange={(e) => setFxSource(e.target.value)}
                className="h-10 text-sm rounded-xl"
              >
                <option value="LIVE_MARKET">Live Market Rates (open.er-api.com)</option>
                <option value="FIXED_PLANNING_RATE">Fixed Planning Rate</option>
                <option value="CENTRAL_BANK">Central Bank Official Rate</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                ERP Reference Code (Optional)
              </label>
              <Input
                type="text"
                value={erpReference}
                onChange={(e) => setErpReference(e.target.value)}
                placeholder="e.g. SAP-2026-BDG"
                className="h-10 text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border/60">
            <Button
              type="button"
              onClick={() => setActiveStep(2)}
              className="gap-2"
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
              <h3 className="text-sm font-bold text-foreground">
                Sections B & C: Dimensions & Allocation Lines
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total Budget: <strong className="text-primary text-sm font-bold">{totalAllocated.toLocaleString()} {currency}</strong> across {lines.length} line(s)
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="gap-1.5 self-start sm:self-auto"
            >
              <Plus className="size-4" />
              <span>Add Line</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[900px] table-divided">
              <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70">
                <tr>
                  <th className="px-3 py-2.5 w-24">Line Code</th>
                  <th className="px-3 py-2.5 w-48">Line Name</th>
                  <th className="px-3 py-2.5 w-36">Cost Centre</th>
                  <th className="px-3 py-2.5 w-36">GL Account</th>
                  <th className="px-3 py-2.5 w-32">Spend Category</th>
                  <th className="px-3 py-2.5 w-32 text-right">Annual ({currency})</th>
                  <th className="px-3 py-2.5 w-28 text-right">Q1</th>
                  <th className="px-3 py-2.5 w-28 text-right">Q2</th>
                  <th className="px-3 py-2.5 w-28 text-right">Q3</th>
                  <th className="px-3 py-2.5 w-28 text-right">Q4</th>
                  <th className="px-3 py-2.5 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={line.lineCode}
                        onChange={(e) => updateLineField(idx, 'lineCode', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={line.lineName}
                        onChange={(e) => updateLineField(idx, 'lineName', e.target.value)}
                        placeholder="e.g. Server Upgrades"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={line.costCenterCode}
                        onChange={(e) => updateLineField(idx, 'costCenterCode', e.target.value)}
                        placeholder="e.g. CC-IT"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={line.glAccountCode}
                        onChange={(e) => updateLineField(idx, 'glAccountCode', e.target.value)}
                        placeholder="e.g. GL-5100"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={line.spendCategory}
                        onChange={(e) => updateLineField(idx, 'spendCategory', e.target.value)}
                        placeholder="e.g. IT Equipment"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={line.annualAmount}
                        onChange={(e) => updateLineField(idx, 'annualAmount', Number(e.target.value))}
                        className="h-8 text-xs text-right font-semibold"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={line.q1Amount}
                        onChange={(e) => updateLineField(idx, 'q1Amount', Number(e.target.value))}
                        className="h-8 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={line.q2Amount}
                        onChange={(e) => updateLineField(idx, 'q2Amount', Number(e.target.value))}
                        className="h-8 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={line.q3Amount}
                        onChange={(e) => updateLineField(idx, 'q3Amount', Number(e.target.value))}
                        className="h-8 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={line.q4Amount}
                        onChange={(e) => updateLineField(idx, 'q4Amount', Number(e.target.value))}
                        className="h-8 text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
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
                ))}
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
              <span>Back</span>
            </Button>
            <Button
              type="button"
              onClick={() => setActiveStep(3)}
              className="gap-2"
            >
              <span>Next: Rules & Approvals</span>
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
              Screen 2: Control Rules & Multi-Tier Approvals
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
                <span>Section D: Control Level & Tolerance</span>
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
              Submitting this budget for approval will trigger the sequential approval chain:
              <br />
              <strong className="text-foreground font-semibold">Level 1 (Dept Head)</strong> &rarr; <strong className="text-foreground font-semibold">Level 2 (Finance Manager)</strong> &rarr; <strong className="text-foreground font-semibold">Level 3 (CFO / Board)</strong>.
              Upon final Level 3 approval, status automatically becomes <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">ACTIVE</strong>.
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
              <span>Back</span>
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
                className="gap-2 font-semibold"
              >
                {submitting ? 'Submitting...' : 'Submit for Level 1, 2, 3 Approval'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </PageFrame>
  );
}
