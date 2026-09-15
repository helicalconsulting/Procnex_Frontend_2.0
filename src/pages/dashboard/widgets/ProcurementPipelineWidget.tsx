import { BarChart3 } from 'lucide-react';
import { useMemo, useEffect } from 'react';
import { useServiceData } from '../../../hooks/useServiceData';
import { sseClient } from '../../../services/sseClient';
import { dashboardService } from '../../../services/dashboardService';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import type { DashboardPipelineItem } from '../../../types/viewModels';
import { WidgetHeader, WidgetBody, WidgetLoading } from './WidgetShell';

const STATUS_BAR_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-500',
  SENT: 'bg-blue-500',
  IN_PROGRESS: 'bg-amber-500',
  CLOSED: 'bg-emerald-500',
  CANCELLED: 'bg-rose-500',
};

export default function ProcurementPipelineWidget() {
  const { data: pipeline, loading, error, reload } = useServiceData(
    () => dashboardService.getPipeline(),
    [] as DashboardPipelineItem[]
  );

  useEffect(() => {
    const unsubSigned = sseClient.on('contract_signed', () => reload());
    const unsubPO = sseClient.on('po_created', () => reload());
    return () => { unsubSigned(); unsubPO(); };
  }, [reload]);

  const pipelineData = useMemo(() => {
    const max = Math.max(...pipeline.map((p) => p.count), 1);
    return pipeline.map((item) => ({
      label: item.label,
      count: item.count,
      percent: Math.round((item.count / max) * 100),
      status: item.status,
    }));
  }, [pipeline]);

  return (
    <>
      <WidgetHeader icon={<BarChart3 size={16} />} title="Procurement Pipeline" href="/rfq" />
      <WidgetBody>
        {error && <MessageStrip type="error">{error}</MessageStrip>}
        {loading && <WidgetLoading>Loading pipeline…</WidgetLoading>}
        {!loading && !error && (
          <div className="grid gap-3.5">
            {pipelineData.map((item) => {
              const colorClass = STATUS_BAR_COLOR[item.status] || 'bg-primary';
              return (
                <div key={item.label} className="grid gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{item.label}</span>
                    <span className="font-bold tabular-nums text-foreground">{item.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${colorClass} transition-all duration-300`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </WidgetBody>
    </>
  );
}
