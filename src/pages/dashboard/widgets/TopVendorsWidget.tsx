import { Users } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { WidgetHeader, WidgetBody, WidgetLoading } from './WidgetShell';

interface TopVendor {
  name: string;
  initials: string;
  pos: number;
  score: number;
  quality: number;
  delivery: number;
  avatarMod: string;
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const barColorClass = value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  const textColorClass = value >= 80 ? 'text-emerald-600 dark:text-emerald-400' : value >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold tabular-nums ${textColorClass}`}>{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barColorClass} transition-all duration-300`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function TopVendorsWidget() {
  const { data: vendors, loading } = useServiceData(
    () => dashboardService.getTopVendors(),
    [] as TopVendor[]
  );

  return (
    <>
      <WidgetHeader icon={<Users size={16} />} title="Top Performing Vendors" href="/vendors" />
      <WidgetBody>
        {loading && <WidgetLoading>Loading vendors…</WidgetLoading>}
        {!loading && (
          <div className="grid gap-4">
            {vendors.map((v) => (
              <div key={v.name} className="grid gap-2.5 rounded-xl border border-border/80 bg-card p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/15">
                      {v.initials}
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">{v.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{v.pos} Purchase Orders</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`block text-sm font-bold tabular-nums ${v.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : v.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {v.score}%
                    </span>
                    <span className="block text-[11px] text-muted-foreground">Overall</span>
                  </div>
                </div>
                <div className="grid gap-2 border-t border-border/60 pt-2.5">
                  <ScoreBar value={v.quality} label="Quality" />
                  <ScoreBar value={v.delivery} label="Delivery" />
                </div>
              </div>
            ))}
          </div>
        )}
      </WidgetBody>
    </>
  );
}
