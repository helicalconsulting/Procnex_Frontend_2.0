import { TrendingUp } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { useCurrency } from '../../../components/shared/CurrencyMaster';
import { WidgetHeader, WidgetBody, WidgetLoading } from './WidgetShell';
import { cn } from '../../../lib/utils';

export default function SpendOverviewWidget() {
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { data, loading } = useServiceData(
    () => dashboardService.getSpendOverview(),
    { monthlyTrend: [], categories: [] },
    []
  );

  const maxValue = Math.max(1, ...data.monthlyTrend.map((m) => m.value));

  return (
    <>
      <WidgetHeader icon={<TrendingUp size={16} />} title="Spend Overview" subtitle="Monthly Trend & Breakdown" />
      <WidgetBody className="grid gap-6">
        {loading ? (
          <WidgetLoading />
        ) : (
          <>
            {/* Bar chart */}
            <div className="flex h-40 items-end justify-between gap-3 sm:gap-4 border-b border-border/60 pb-3 pt-6 px-1 sm:px-2">
              {data.monthlyTrend.map((item) => {
                const isHighlighted = item.value === maxValue && item.value > 0;
                const heightPct = (item.value / maxValue) * 100;
                const formattedVal = formatAmount(item.value, companyDefaultCurrency);

                return (
                  <div
                    key={item.month}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2 text-center"
                  >
                    {/* Hover tooltip */}
                    <div className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[11px] font-semibold text-popover-foreground shadow-md ring-1 ring-border/50 opacity-0 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:opacity-100">
                      {item.month}: {formattedVal}
                    </div>

                    {/* Column Pillar Track */}
                    <div
                      className={cn(
                        'flex h-full w-7 sm:w-8 items-end justify-center rounded-t-lg rounded-b-md p-0.5 transition-colors duration-200',
                        isHighlighted
                          ? 'bg-primary/[0.08] ring-1 ring-primary/20 dark:bg-primary/10'
                          : 'bg-muted/30 dark:bg-muted/20 group-hover:bg-muted/50'
                      )}
                    >
                      {item.value > 0 ? (
                        <div
                          className={cn(
                            'w-full rounded-t-md rounded-b-sm bg-primary transition-all duration-300 ease-out group-hover:brightness-110',
                            isHighlighted && 'shadow-[0_2px_8px_-2px_rgba(10,110,209,0.35)] dark:shadow-[0_2px_10px_-2px_rgba(59,130,246,0.4)]'
                          )}
                          style={{ height: `${Math.max(heightPct, 6)}%` }}
                        />
                      ) : (
                        <div className="h-1 w-full rounded-full bg-muted-foreground/20 group-hover:bg-muted-foreground/35 transition-colors" />
                      )}
                    </div>

                    {/* Month Label */}
                    <span
                      className={cn(
                        'text-[12px] transition-colors',
                        isHighlighted
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-muted-foreground group-hover:text-foreground'
                      )}
                    >
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Category breakdown */}
            <div className="grid gap-3">
              {data.categories.map((cat, idx) => {
                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-pink-500'];
                const colorClass = colors[idx % colors.length];
                return (
                  <div key={cat.label} className="grid gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <span className={`size-2 rounded-full ${colorClass}`} />
                        <span>{cat.label}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatAmount(cat.amount, companyDefaultCurrency)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${colorClass} transition-all duration-300`}
                        style={{ width: `${cat.percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </WidgetBody>
    </>
  );
}
