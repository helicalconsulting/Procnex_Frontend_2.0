// ============================================================
// components/budget/SRMSpendAnalyticsCard.tsx
// Section L: Supplier Relationship Management (SRM) Spend Analytics
// ============================================================
import React from 'react';
import { Users, PieChart } from 'lucide-react';
import { Card } from '../ui/card';

interface SRMSpendAnalyticsProps {
  analytics: {
    budgetName: string;
    totalAllocated: number;
    totalCommitted: number;
    totalActualSpent: number;
    topVendors: Array<{
      vendorId: string;
      vendorName: string;
      vendorCategory?: string;
      poCount: number;
      totalCommitted: number;
    }>;
    categoryBreakdown: Array<{
      category: string;
      amount: number;
      percentage: number;
    }>;
  } | null;
  currency?: string;
}

export const SRMSpendAnalyticsCard: React.FC<SRMSpendAnalyticsProps> = ({
  analytics,
  currency = 'KES',
}) => {
  if (!analytics) return null;

  const { totalAllocated, topVendors, categoryBreakdown } = analytics;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Top Suppliers Spend (SRM View) */}
      <Card className="p-5 border-border/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">
                Top Suppliers Consuming Budget
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                SRM vendor concentration & commitment ranking
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {topVendors.length} active vendors
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70">
              <tr>
                <th className="px-3.5 py-2.5">Vendor Name</th>
                <th className="px-3.5 py-2.5">Category</th>
                <th className="px-3.5 py-2.5 text-center">POs</th>
                <th className="px-3.5 py-2.5 text-right">Committed</th>
                <th className="px-3.5 py-2.5 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {topVendors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No supplier orders linked to this budget yet.
                  </td>
                </tr>
              ) : (
                topVendors.slice(0, 7).map((v, idx) => {
                  const share =
                    totalAllocated > 0
                      ? Math.round((v.totalCommitted / totalAllocated) * 1000) / 10
                      : 0;

                  return (
                    <tr key={v.vendorId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3.5 py-2.5 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-muted text-[10px] flex items-center justify-center font-bold text-muted-foreground">
                            {idx + 1}
                          </span>
                          <span className="truncate max-w-[140px]" title={v.vendorName}>
                            {v.vendorName}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 text-muted-foreground">
                        {v.vendorCategory || 'General'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-semibold text-foreground">
                        {v.poCount}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-foreground">
                        {v.totalCommitted.toLocaleString()} {currency}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary">
                          {share}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Spend Category Breakdown */}
      <Card className="p-5 border-border/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <PieChart className="size-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">
                Spend Category Distribution
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Committed funds by procurement category
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {categoryBreakdown.length} categories
          </span>
        </div>

        <div className="space-y-3 pt-1">
          {categoryBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              No categories linked to this budget.
            </p>
          ) : (
            categoryBreakdown.map((cat, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    {cat.category || 'General Operations'}
                  </span>
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">{cat.amount.toLocaleString()} {currency}</strong> ({cat.percentage}%)
                  </span>
                </div>
                {/* Visual Category Progress Bar */}
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(100, Math.max(0, cat.percentage))}%` }}
                    className="h-full bg-primary rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
