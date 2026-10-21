// ============================================================
// pages/budget/BudgetListPage.tsx — Budget Master Overview & List
// ============================================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  Plus,
  Search,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Snowflake,
  RefreshCw,
  X,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { budgetApi, type BudgetListResponse } from '../../api/budgetApi';
import { BudgetConsumptionBar } from '../../components/budget/BudgetConsumptionBar';
import { PageFrame, PageLead, MetricCard, EmptyState } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TableSkeleton } from '../../components/shared/Skeleton';

export default function BudgetListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BudgetListResponse | null>(null);
  const [fiscalYear, setFiscalYear] = useState<string>('');
  const [budgetType, setBudgetType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const res = await budgetApi.list({
        fiscalYear: fiscalYear || undefined,
        budgetType: budgetType || undefined,
        status: status || undefined,
        search: search || undefined,
      });
      setData(res);
    } catch (err) {
      console.error('Failed to load budgets', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, [fiscalYear, budgetType, status]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBudgets();
  };

  const kpis = data?.kpis || {
    totalAllocated: 0,
    totalPreCommitted: 0,
    totalCommitted: 0,
    totalActualSpent: 0,
    totalAvailable: 0,
    activeBudgetsCount: 0,
    totalBudgetsCount: 0,
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3" /> Active
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
            <Clock className="size-3" /> In Approval
          </span>
        );
      case 'FROZEN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            <Snowflake className="size-3" /> Frozen
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            {st || 'Draft'}
          </span>
        );
    }
  };

  return (
    <PageFrame className="space-y-6">
      {/* Page Header */}
      <PageLead
        title="Budget Management"
        description="Encumbrance tracking, real-time control checkpoints & SRM spend governance"
        actions={
          <Button
            onClick={() => navigate('/budget/create')}
            className="gap-2 shadow-sm font-semibold"
          >
            <Plus className="size-4" />
            <span>New Budget</span>
          </Button>
        }
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="TOTAL ALLOCATED"
          value={kpis.totalAllocated.toLocaleString()}
          detail={`Across ${kpis.totalBudgetsCount} budget(s)`}
          icon={Wallet}
          tone="primary"
        />

        <MetricCard
          label="PRE-COMMITTED"
          value={kpis.totalPreCommitted.toLocaleString()}
          detail="Requisitions in flight"
          icon={Clock}
          tone="warning"
        />

        <MetricCard
          label="COMMITTED"
          value={kpis.totalCommitted.toLocaleString()}
          detail="Active POs & Contracts"
          icon={ShoppingCart}
          tone="cyan"
        />

        <MetricCard
          label="ACTUAL SPENT"
          value={kpis.totalActualSpent.toLocaleString()}
          detail="Invoiced & Paid"
          icon={DollarSign}
          tone="success"
        />

        <MetricCard
          label="AVAILABLE FUND"
          value={kpis.totalAvailable.toLocaleString()}
          detail={
            kpis.totalAllocated > 0
              ? `${Math.round((kpis.totalAvailable / kpis.totalAllocated) * 100)}% remaining`
              : '—'
          }
          icon={TrendingUp}
          tone="primary"
        />

        <MetricCard
          label="ACTIVE BUDGETS"
          value={kpis.activeBudgetsCount}
          detail="Locked & operational"
          icon={ShieldCheck}
          tone="violet"
        />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search budget name, code..."
            className="h-10 pl-9 pr-9 text-xs rounded-xl"
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch('');
                fetchBudgets();
              }}
            >
              <X className="size-3.5" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
            aria-label="Filter by Fiscal Year"
            className="h-10 px-3 text-xs rounded-xl border border-input bg-card text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Fiscal Years</option>
            <option value="FY2026">FY2026</option>
            <option value="FY2025">FY2025</option>
            <option value="FY2024">FY2024</option>
          </select>

          <select
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value)}
            aria-label="Filter by Budget Type"
            className="h-10 px-3 text-xs rounded-xl border border-input bg-card text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Types</option>
            <option value="OPEX">OPEX (Operational)</option>
            <option value="CAPEX">CAPEX (Capital)</option>
            <option value="PROJECT">Project Spend</option>
            <option value="DONOR_GRANT">Donor / Grant</option>
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by Status"
            className="h-10 px-3 text-xs rounded-xl border border-input bg-card text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING_APPROVAL">In Approval</option>
            <option value="DRAFT">Draft</option>
            <option value="FROZEN">Frozen</option>
          </select>

          <Button
            variant="outline"
            size="icon"
            onClick={fetchBudgets}
            className="h-10 w-10 rounded-xl"
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Main Budgets Card & Table */}
      {loading ? (
        <Card className="p-6">
          <TableSkeleton rows={4} columns={6} />
        </Card>
      ) : !data?.budgets || data.budgets.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No budgets found"
          description="Create your first budget to start tracking encumbrances, checkpoints, and SRM spend control."
          action={
            <Button
              onClick={() => navigate('/budget/create')}
              className="gap-2"
            >
              <Plus className="size-4" />
              <span>New Budget</span>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden border-border/80 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[900px]">
              <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70">
                <tr>
                  <th className="px-5 py-3.5">Budget Code & Name</th>
                  <th className="px-5 py-3.5">Fiscal Year & Type</th>
                  <th className="px-5 py-3.5">Lines</th>
                  <th className="px-5 py-3.5 w-64">Consumption Progress</th>
                  <th className="px-5 py-3.5 text-right">Available Balance</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {data.budgets.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => navigate(`/budget/${b.id}`)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                        <FileText className="size-4 text-primary shrink-0" />
                        <span>{b.budgetName}</span>
                      </div>
                      <div className="text-[11px] text-primary font-mono mt-0.5">
                        {b.budgetCode}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{b.fiscalYear}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {b.budgetType} • {b.currency}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground font-medium">
                      {b._count?.lines || 0} lines
                    </td>
                    <td className="px-5 py-4">
                      <BudgetConsumptionBar
                        annualAmount={b.totalAllocated}
                        preCommittedAmount={b.totalPreCommitted}
                        committedAmount={b.totalCommitted}
                        actualSpentAmount={b.totalActualSpent}
                        availableAmount={b.totalAvailable}
                        currency={b.currency}
                        compact={true}
                        showLabels={true}
                      />
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <div className="font-bold text-foreground text-sm">
                        {b.totalAvailable.toLocaleString()} {b.currency}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        of {b.totalAllocated.toLocaleString()} {b.currency}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      {getStatusBadge(b.status)}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/budget/${b.id}`);
                        }}
                        className="h-8 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 gap-1"
                      >
                        <span>View</span>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageFrame>
  );
}
