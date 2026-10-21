// ============================================================
// components/budget/BudgetApprovalTimeline.tsx
// Section H: Multi-Tier Approval Workflow Timeline (Level 1, 2, 3)
// ============================================================
import React from 'react';
import { CheckCircle2, Clock, ShieldCheck, UserCheck } from 'lucide-react';
import { Card } from '../ui/card';

interface BudgetApprovalTimelineProps {
  status: string;
  totalAllocated: number;
  currency?: string;
}

export const BudgetApprovalTimeline: React.FC<BudgetApprovalTimelineProps> = ({
  status,
  totalAllocated,
  currency = 'KES',
}) => {
  const isApproved = status === 'ACTIVE' || status === 'APPROVED';
  const isPending = status === 'PENDING_APPROVAL';

  const levels = [
    {
      levelNumber: 1,
      role: 'Department Head / Budget Owner',
      description: 'Validates line items, cost centres & quarterly operational phasing',
      slaHours: 24,
      status: isApproved ? 'APPROVED' : isPending ? 'PENDING' : 'DRAFT',
    },
    {
      levelNumber: 2,
      role: 'Finance Manager',
      description: 'Checks GL accounts, statutory compliance, VAT treatment & funding sources',
      slaHours: 48,
      status: isApproved ? 'APPROVED' : isPending ? 'UPCOMING' : 'DRAFT',
    },
    {
      levelNumber: 3,
      role: 'CFO / Managing Director / Donor Rep',
      description: `Final institutional sign-off for expenditures exceeding thresholds (${totalAllocated.toLocaleString()} ${currency})`,
      slaHours: 72,
      status: isApproved ? 'APPROVED' : 'UPCOMING',
    },
  ];

  return (
    <Card className="p-5 border-border/80 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div>
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="size-4.5 text-primary" />
            Budget Approval Workflow (Level 1, 2, 3)
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enforced sequential multi-tier sign-off before budget activation
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            isApproved
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              : isPending
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
        >
          {status}
        </span>
      </div>

      <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/80">
        {levels.map((lvl) => {
          const isDone = lvl.status === 'APPROVED';
          const isCurrent = lvl.status === 'PENDING';

          return (
            <div key={lvl.levelNumber} className="relative flex items-start gap-4">
              {/* Step indicator node */}
              <div
                className={`absolute -left-6 mt-0.5 size-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition ${
                  isDone
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                    : isCurrent
                    ? 'bg-primary border-primary text-primary-foreground shadow-xs animate-pulse'
                    : 'bg-card border-border text-muted-foreground'
                }`}
              >
                {isDone ? <CheckCircle2 className="size-3" /> : lvl.levelNumber}
              </div>

              {/* Step Details */}
              <div className="flex-1 p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold text-foreground">
                      Level {lvl.levelNumber}: {lvl.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    <span>SLA: {lvl.slaHours}h</span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {lvl.description}
                </p>

                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Verification status:</span>
                  <span
                    className={`font-semibold ${
                      isDone
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isCurrent
                        ? 'text-primary font-bold'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {isDone ? '✓ Verified & Approved' : isCurrent ? '⏳ Awaiting Decision' : 'Queued'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
