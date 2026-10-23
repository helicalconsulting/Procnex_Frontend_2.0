// ============================================================
// pages/budget/BudgetDetailPage.tsx — Detailed Command Centre (A-M)
// ============================================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Wallet,
  ArrowLeft,
  ArrowRightLeft,
  FileText,
  PieChart,
  ShieldCheck,
  History,
  Snowflake,
  Plus,
  Layers,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { budgetApi, type BudgetDetailResponse } from '../../api/budgetApi';
import { BudgetConsumptionBar } from '../../components/budget/BudgetConsumptionBar';
import { BudgetLedgerTable } from '../../components/budget/BudgetLedgerTable';
import { BudgetVirementModal } from '../../components/budget/BudgetVirementModal';
import { BudgetApprovalTimeline } from '../../components/budget/BudgetApprovalTimeline';
import { SRMSpendAnalyticsCard } from '../../components/budget/SRMSpendAnalyticsCard';
import { PageFrame, PageLead } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

export default function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BudgetDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<
    'lines' | 'ledger' | 'srm' | 'controls' | 'transfers' | 'overview' | 'audit'
  >('lines');
  const [virementModalOpen, setVirementModalOpen] = useState(false);
  const [selectedVirementSource, setSelectedVirementSource] = useState<string | undefined>(undefined);
  const [freezeLoading, setFreezeLoading] = useState(false);

  const fetchBudgetDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await budgetApi.getById(id);
      setData(res);
    } catch (err) {
      console.error('Failed to load budget detail', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgetDetails();
  }, [id]);

  const handleToggleFreeze = async () => {
    if (!id || !data?.budget) return;
    const isCurrentlyFrozen = data.budget.status === 'FROZEN';
    const nextFreeze = !isCurrentlyFrozen;

    setFreezeLoading(true);
    try {
      await budgetApi.freezeBudget(id, nextFreeze, nextFreeze ? 'Audit freeze initiated by finance' : 'Unfrozen by finance');
      await fetchBudgetDetails();
    } catch (err: any) {
      alert(err?.message || 'Failed to update freeze status');
    } finally {
      setFreezeLoading(false);
    }
  };

  if (loading) {
    return (
      <PageFrame className="p-8 text-center text-muted-foreground">
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
          <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs font-medium">Loading budget command centre...</p>
        </div>
      </PageFrame>
    );
  }

  if (!data?.budget) {
    return (
      <PageFrame className="space-y-4">
        <Card className="p-8 text-center space-y-4 max-w-md mx-auto">
          <p className="text-destructive text-sm font-semibold">Budget not found</p>
          <Button variant="outline" onClick={() => navigate('/budget')}>
            Back to Budgets
          </Button>
        </Card>
      </PageFrame>
    );
  }

  const { budget, lines, ledgerItems, srmAnalytics } = data;
  const currency = budget.currency || 'KES';

  return (
    <PageFrame className="space-y-6">
      {/* Top Header */}
      <PageLead
        title={budget.budgetName}
        description={
          <span className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-primary font-semibold text-xs">{budget.budgetCode}</span>
            <span>&bull;</span>
            <span className="text-xs">{budget.fiscalYear} ({budget.budgetType})</span>
            <span>&bull;</span>
            <span className="text-xs">Base Currency: <strong className="text-foreground">{currency}</strong></span>
            <span>&bull;</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              budget.status === 'ACTIVE'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : budget.status === 'FROZEN'
                ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}>
              {budget.status === 'ACTIVE' ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
              {budget.status}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/budget')}
              className="gap-1.5"
            >
              <ArrowLeft className="size-4" />
              <span>Back</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedVirementSource(undefined);
                setVirementModalOpen(true);
              }}
              className="gap-1.5"
            >
              <ArrowRightLeft className="size-4" />
              <span>Transfer Funds</span>
            </Button>

            <Button
              variant={budget.status === 'FROZEN' ? 'default' : 'outline'}
              size="sm"
              disabled={freezeLoading}
              onClick={handleToggleFreeze}
              className="gap-1.5"
            >
              <Snowflake className="size-4" />
              <span>{budget.status === 'FROZEN' ? 'Unfreeze Budget' : 'Freeze Budget'}</span>
            </Button>
          </div>
        }
      />

      {/* Primary KPI Header Card */}
      <Card className="p-5 border-border/80 shadow-sm space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Total Allocation
            </span>
            <div className="text-lg sm:text-xl font-bold text-foreground">
              {budget.totalAllocated.toLocaleString()} {currency}
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Pre-Committed (PRs)
            </span>
            <div className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400">
              {budget.totalPreCommitted.toLocaleString()} {currency}
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
              Committed (POs)
            </span>
            <div className="text-lg sm:text-xl font-bold text-cyan-600 dark:text-cyan-400">
              {budget.totalCommitted.toLocaleString()} {currency}
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Available Fund
            </span>
            <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {budget.totalAvailable.toLocaleString()} {currency}
            </div>
          </div>
        </div>

        {/* Global Consumption Bar */}
        <BudgetConsumptionBar
          annualAmount={budget.totalAllocated}
          preCommittedAmount={budget.totalPreCommitted}
          committedAmount={budget.totalCommitted}
          actualSpentAmount={budget.totalActualSpent}
          availableAmount={budget.totalAvailable}
          currency={currency}
          showLabels={true}
        />
      </Card>

      {/* Navigation Tabs (7 Modular Tabs) */}
      <div className="flex overflow-x-auto gap-1 border-b border-border/70 pb-px text-xs font-semibold">
        {[
          { key: 'lines', label: 'Allocation Lines (C & I)', icon: <Layers className="size-3.5" /> },
          { key: 'ledger', label: 'Transaction Ledger (J)', icon: <FileText className="size-3.5" /> },
          { key: 'srm', label: 'SRM Spend Analytics (L)', icon: <PieChart className="size-3.5" /> },
          { key: 'controls', label: 'Control Rules & Approvals (D, E, H)', icon: <ShieldCheck className="size-3.5" /> },
          { key: 'transfers', label: 'Virements & Transfers (G)', icon: <ArrowRightLeft className="size-3.5" /> },
          { key: 'overview', label: 'Header Parameters (A)', icon: <Wallet className="size-3.5" /> },
          { key: 'audit', label: 'Revisions & Audit (K, M)', icon: <History className="size-3.5" /> },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl transition whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-card border-x border-t border-border/80 text-primary shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB 1: ALLOCATION LINES & CONSUMPTION BARS (C & I) ── */}
      {activeTab === 'lines' && (
        <Card className="overflow-hidden border-border/80 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[950px] table-divided">
              <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70">
                <tr>
                  <th className="px-4 py-3 w-28">Line Code</th>
                  <th className="px-4 py-3 w-48">Description & Owner</th>
                  <th className="px-4 py-3 w-36">GL & Cost Centre</th>
                  <th className="px-4 py-3 w-32 text-right">Allocation</th>
                  <th className="px-4 py-3 w-72">Consumption Breakdown</th>
                  <th className="px-4 py-3 w-32 text-right">Available</th>
                  <th className="px-4 py-3 w-20 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-foreground">
                      {line.lineCode}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground">
                        {line.lineName}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {line.spendCategory || 'General'} {line.lineOwnerName ? `• ${line.lineOwnerName}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-foreground">
                        {line.glAccountCode || '—'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {line.costCenterCode || ''}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                      {line.annualAmount.toLocaleString()} {currency}
                    </td>
                    <td className="px-4 py-3.5">
                      <BudgetConsumptionBar
                        annualAmount={line.annualAmount}
                        preCommittedAmount={line.preCommittedAmount}
                        committedAmount={line.committedAmount}
                        actualSpentAmount={line.actualSpentAmount}
                        availableAmount={line.availableAmount}
                        currency={currency}
                        compact={true}
                        showLabels={true}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <span className={`font-bold ${line.availableAmount < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {line.availableAmount.toLocaleString()} {currency}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedVirementSource(line.id);
                          setVirementModalOpen(true);
                        }}
                        className="h-7 text-[11px] font-semibold text-primary hover:bg-primary/10"
                        title="Transfer from this line"
                      >
                        Transfer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB 2: TRANSACTION MOVEMENT LEDGER (J) ── */}
      {activeTab === 'ledger' && (
        <BudgetLedgerTable
          items={ledgerItems}
          currency={currency}
          onRefresh={fetchBudgetDetails}
        />
      )}

      {/* ── TAB 3: SRM & SUPPLIER SPEND (L) ── */}
      {activeTab === 'srm' && (
        <SRMSpendAnalyticsCard
          analytics={srmAnalytics}
          currency={currency}
        />
      )}

      {/* ── TAB 4: CONTROL RULES & APPROVAL WORKFLOW (D, E, H) ── */}
      {activeTab === 'controls' && (
        <div className="space-y-6">
          <BudgetApprovalTimeline
            status={budget.status}
            totalAllocated={budget.totalAllocated}
            currency={currency}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <Card className="p-5 border-border/80 shadow-sm space-y-3">
              <h4 className="font-bold text-foreground">
                Control Levels & Tolerances (D)
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground">Default Enforcement:</span>
                  <span className="font-bold text-foreground">{budget.controlLevel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground">Tolerance Percent:</span>
                  <span className="font-semibold text-foreground">{budget.tolerancePercent}% buffer</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/40">
                  <span className="text-muted-foreground">Tolerance Cap:</span>
                  <span className="font-semibold text-foreground">{budget.toleranceCap.toLocaleString()} {currency}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 border-border/80 shadow-sm space-y-3">
              <h4 className="font-bold text-foreground">
                Document Check Points (E)
              </h4>
              <div className="space-y-1.5">
                {Object.entries(budget.checkPoints || {}).map(([key, enabled]) => (
                  <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/40">
                    <span className="capitalize text-foreground font-medium">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      enabled
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-muted text-muted-foreground border border-border'
                    }`}>
                      {enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB 5: VIREMENTS & TRANSFERS (G) ── */}
      {activeTab === 'transfers' && (
        <Card className="p-6 border-border/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Virements & Fund Adjustments Log (Section G)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                History of fund transfers between lines and fresh budget supplements
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setSelectedVirementSource(undefined);
                setVirementModalOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              <span>New Transfer Request</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Reason & Initiator</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {!budget.transfers || budget.transfers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No virements or supplements recorded yet.
                    </td>
                  </tr>
                ) : (
                  budget.transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">
                        {t.transferType}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-foreground">
                        {t.amount.toLocaleString()} {currency}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">
                        <div>{t.reason}</div>
                        <div className="text-[10px] text-muted-foreground">By: {t.createdByName || 'User'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : t.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-destructive/10 text-destructive border border-destructive/20'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB 6: HEADER PARAMETERS (A) ── */}
      {activeTab === 'overview' && (
        <Card className="p-6 border-border/80 shadow-sm space-y-4 text-xs">
          <div className="border-b border-border/60 pb-3">
            <h3 className="text-sm font-bold text-foreground">
              Section A: Master Parameters Snapshot
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Read-only view of initial setup and accounting parameters.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-muted-foreground">Company Code:</span>
              <p className="font-semibold text-foreground mt-0.5">{budget.companyCode}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Fiscal Period:</span>
              <p className="font-semibold text-foreground mt-0.5">
                {new Date(budget.startDate).toLocaleDateString()} – {new Date(budget.endDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">VAT Treatment:</span>
              <p className="font-semibold text-foreground mt-0.5">{budget.vatTreatment}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Funding Source:</span>
              <p className="font-semibold text-foreground mt-0.5">{budget.fundingSource}</p>
            </div>
            <div>
              <span className="text-muted-foreground">FX Source:</span>
              <p className="font-semibold text-foreground mt-0.5">{budget.fxSource}</p>
            </div>
            <div>
              <span className="text-muted-foreground">ERP Sync Ref:</span>
              <p className="font-semibold text-foreground mt-0.5">{budget.erpReference || 'None'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Version:</span>
              <p className="font-semibold text-foreground mt-0.5">v{budget.version}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <p className="font-semibold text-foreground mt-0.5">
                {new Date(budget.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── TAB 7: REVISIONS & AUDIT LOG (K, M) ── */}
      {activeTab === 'audit' && (
        <Card className="p-6 border-border/80 shadow-sm space-y-4">
          <div className="border-b border-border/60 pb-3">
            <h3 className="text-sm font-bold text-foreground">
              Revisions & Audit Log (Sections K & M)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Baseline snapshots, change reasons, and financial audit logs
            </p>
          </div>

          <div className="space-y-3">
            {!budget.revisions || budget.revisions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Initial baseline active. No revisions logged.
              </p>
            ) : (
              budget.revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3.5 rounded-xl border border-border/60 bg-muted/30 text-xs flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-foreground">
                      Revision v{rev.revisionNumber}
                    </span>
                    <p className="text-muted-foreground">{rev.changeReason}</p>
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(rev.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Virement Modal */}
      <BudgetVirementModal
        isOpen={virementModalOpen}
        onClose={() => setVirementModalOpen(false)}
        budgetId={budget.id}
        lines={lines}
        currency={currency}
        preselectedSourceId={selectedVirementSource}
        onSuccess={fetchBudgetDetails}
      />
    </PageFrame>
  );
}
