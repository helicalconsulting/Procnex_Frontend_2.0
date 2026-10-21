// ============================================================
// components/budget/BudgetConsumptionBar.tsx
// Visual stacked progress bar: Actual (Green) | Committed (Blue) | Pre-committed (Amber) | Available (Gray)
// ============================================================
import React from 'react';
import { AlertTriangle, CheckCircle2, AlertOctagon } from 'lucide-react';

interface BudgetConsumptionBarProps {
  annualAmount: number;
  preCommittedAmount: number;
  committedAmount: number;
  actualSpentAmount: number;
  availableAmount: number;
  currency?: string;
  showLabels?: boolean;
  compact?: boolean;
}

export const BudgetConsumptionBar: React.FC<BudgetConsumptionBarProps> = ({
  annualAmount,
  preCommittedAmount,
  committedAmount,
  actualSpentAmount,
  availableAmount,
  currency = 'KES',
  showLabels = true,
  compact = false,
}) => {
  const totalAllocated = Math.max(annualAmount, 1);
  const actualPct = Math.min(100, Math.round((actualSpentAmount / totalAllocated) * 100));
  const committedPct = Math.min(100 - actualPct, Math.round((committedAmount / totalAllocated) * 100));
  const preCommitPct = Math.min(100 - (actualPct + committedPct), Math.round((preCommittedAmount / totalAllocated) * 100));
  const availablePct = Math.max(0, 100 - (actualPct + committedPct + preCommitPct));

  const totalConsumed = actualSpentAmount + committedAmount + preCommittedAmount;
  const totalUtilization = totalAllocated > 0 ? Math.round((totalConsumed / totalAllocated) * 1000) / 10 : 0;
  const isOverBudget = availableAmount < 0;
  const isCritical = totalUtilization >= 90 && !isOverBudget;

  return (
    <div className="w-full space-y-1.5">
      {showLabels && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">
              {totalUtilization}% consumed
            </span>
            {isOverBudget ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                <AlertOctagon className="size-3" /> Over-Budget
              </span>
            ) : isCritical ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <AlertTriangle className="size-3" /> Critical (&gt;90%)
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="size-3" /> On Track
              </span>
            )}
          </div>
          <span className="text-muted-foreground">
            Avail: <strong className={isOverBudget ? 'text-destructive' : 'text-foreground font-bold'}>{availableAmount.toLocaleString()} {currency}</strong>
          </span>
        </div>
      )}

      {/* Stacked Visual Bar */}
      <div className={`w-full overflow-hidden rounded-full bg-muted flex ${compact ? 'h-2' : 'h-3.5'} shadow-inner`}>
        {/* Actual Spend (Emerald) */}
        {actualPct > 0 && (
          <div
            style={{ width: `${actualPct}%` }}
            className="h-full bg-emerald-500 transition-all duration-300 relative group"
            title={`Actual Spent: ${actualSpentAmount.toLocaleString()} ${currency} (${actualPct}%)`}
          />
        )}
        {/* Committed (Cyan/Blue) */}
        {committedPct > 0 && (
          <div
            style={{ width: `${committedPct}%` }}
            className="h-full bg-cyan-500 transition-all duration-300 relative group"
            title={`Committed: ${committedAmount.toLocaleString()} ${currency} (${committedPct}%)`}
          />
        )}
        {/* Pre-committed (Amber) */}
        {preCommitPct > 0 && (
          <div
            style={{ width: `${preCommitPct}%` }}
            className="h-full bg-amber-400 transition-all duration-300 relative group"
            title={`Pre-committed: ${preCommittedAmount.toLocaleString()} ${currency} (${preCommitPct}%)`}
          />
        )}
        {/* Available */}
        {availablePct > 0 && !isOverBudget && (
          <div
            style={{ width: `${availablePct}%` }}
            className="h-full bg-muted-foreground/20 transition-all duration-300"
            title={`Available: ${availableAmount.toLocaleString()} ${currency} (${availablePct}%)`}
          />
        )}
      </div>

      {!compact && showLabels && (
        <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 inline-block" />
            <span>Actual: {actualSpentAmount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-cyan-500 inline-block" />
            <span>Committed: {committedAmount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-400 inline-block" />
            <span>Pre-commit: {preCommittedAmount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/40 inline-block" />
            <span>Total: {annualAmount.toLocaleString()} {currency}</span>
          </div>
        </div>
      )}
    </div>
  );
};
