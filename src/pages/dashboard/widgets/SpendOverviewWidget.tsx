import { TrendingUp } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { useCurrency } from '../../../components/shared/CurrencyMaster';
import { WidgetHeader, WidgetBody, WidgetLoading } from './WidgetShell';

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
            <div className="flex h-36 items-end gap-2 border-b border-border/70 pb-2 pt-4">
              {data.monthlyTrend.map((item) => (
                <div key={item.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="flex w-full flex-1 items-end justify-center rounded-lg bg-muted/40 p-0.5">
                    <div
                      className="w-full rounded-md bg-primary transition-all duration-300 hover:bg-primary/80"
                      style={{ height: `${(item.value / maxValue) * 100}%` }}
                      title={`${item.month}: ${formatAmount(item.value, companyDefaultCurrency)}`}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">{item.month}</span>
                </div>
              ))}
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
