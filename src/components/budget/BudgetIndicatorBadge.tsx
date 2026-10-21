// ============================================================
// components/budget/BudgetIndicatorBadge.tsx
// Real-time line balance indicator badge for PR/PO forms
// ============================================================
import React from 'react';
import { AlertTriangle, CheckCircle2, AlertOctagon } from 'lucide-react';

interface BudgetIndicatorBadgeProps {
  lineCode?: string;
  availableAmount?: number;
  currency?: string;
  requestedAmount?: number;
}

export const BudgetIndicatorBadge: React.FC<BudgetIndicatorBadgeProps> = ({
  lineCode,
  availableAmount,
  currency = 'KES',
  requestedAmount = 0,
}) => {
  if (availableAmount === undefined) return null;

  const isExceeded = requestedAmount > availableAmount;
  const isNearLimit = requestedAmount > 0 && requestedAmount >= availableAmount * 0.85 && !isExceeded;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
        isExceeded
          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900/60 animate-pulse'
          : isNearLimit
          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900/60'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/60'
      }`}
    >
      {isExceeded ? (
        <AlertOctagon size={13} className="text-red-600 dark:text-red-400 shrink-0" />
      ) : isNearLimit ? (
        <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
      ) : (
        <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
      )}
      <span>
        {lineCode ? `${lineCode}: ` : ''}
        Avail: {availableAmount.toLocaleString()} {currency}
      </span>
      {isExceeded && (
        <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.2 rounded font-bold">
          OVER BY +{(requestedAmount - availableAmount).toLocaleString()}
        </span>
      )}
    </div>
  );
};
