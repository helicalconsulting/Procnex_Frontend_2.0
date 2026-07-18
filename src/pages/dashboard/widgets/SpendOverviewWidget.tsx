import { TrendingUp } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { useCurrency } from '../../../components/shared/CurrencyMaster';

// ─── Component ──────────────────────────────────────────────

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
      <div className="dash-card__header">
        <span className="dash-card__title">
          <TrendingUp size={16} />
          Spend Overview
        </span>
        <span className="dash-card__subtitle">Monthly Trend & Breakdown</span>
      </div>
      <div className="dash-card__body">
        <div className="spend-widget">
          {/* Mini bar chart */}
          <div className="spend-chart">
            {loading ? (
              <p className="dash-card__loading">Loading…</p>
            ) : (
              data.monthlyTrend.map((item) => (
                <div key={item.month} className="spend-chart__col">
                  <div className="spend-chart__bar-track">
                    <div
                      className="spend-chart__bar-fill"
                      style={{ height: `${(item.value / maxValue) * 100}%` }}
                    />
                  </div>
                  <span className="spend-chart__label">{item.month}</span>
                </div>
              ))
            )}
          </div>

          {/* Category breakdown */}
          <div className="spend-categories">
            {loading ? null : (
              data.categories.map((cat, idx) => {
                const colors = ['#0a6ed1', '#059669', '#8b5cf6', '#e9730c', '#ec4899'];
                const color = colors[idx % colors.length];
                return (
                  <div key={cat.label} className="spend-cat">
                    <div className="spend-cat__info">
                      <span
                        className="spend-cat__dot"
                        style={{ background: color }}
                      />
                      <span className="spend-cat__label">{cat.label}</span>
                      <span className="spend-cat__amount">
                        {formatAmount(cat.amount, companyDefaultCurrency)}
                      </span>
                    </div>
                    <div className="spend-cat__bar-track">
                      <div
                        className="spend-cat__bar-fill"
                        style={{ width: `${cat.percent}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
