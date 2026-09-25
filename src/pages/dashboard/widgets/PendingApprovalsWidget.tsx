import { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import { approvalService } from '../../../services/approvalService';
import { sseClient } from '../../../services/sseClient';
import { WidgetHeader, WidgetBody, WidgetLoading, WidgetEmpty } from './WidgetShell';
import { Badge } from '../../../components/ui/badge';

export default function PendingApprovalsWidget() {
  const { data: approvals, loading, error, forceRefresh } = useServiceData(
    async () => {
      const all = await approvalService.listTable();
      return all.filter((a) => a.status === 'PENDING').slice(0, 4);
    },
    [],
    [],
    { cacheKey: 'widget:pending-approvals' }
  );

  useEffect(() => {
    const handleRefresh = () => forceRefresh();
    window.addEventListener('heliflow:approval-updated', handleRefresh);
    const unsub = sseClient.on('approval_level_complete', handleRefresh);
    return () => {
      window.removeEventListener('heliflow:approval-updated', handleRefresh);
      unsub();
    };
  }, [forceRefresh]);

  return (
    <>
      <WidgetHeader icon={<Clock size={16} />} title="Pending Approvals" href="/approvals" />
      <WidgetBody>
        {error && <MessageStrip type="error">{error}</MessageStrip>}
        {loading && <WidgetLoading>Loading approvals…</WidgetLoading>}
        {!loading && !error && (
          <div className="grid gap-2">
            {approvals.map((item) => (
              <div key={item.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="size-2 rounded-full bg-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">{item.referenceNumber}</span>
                      <Badge tone="neutral" className="text-[11px] px-1.5 py-0">{item.module}</Badge>
                    </div>
                    <span className="truncate text-[12px] text-muted-foreground">Requested by {item.requestedBy}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-xs font-semibold tabular-nums text-foreground">{item.amount || '—'}</span>
                </div>
              </div>
            ))}
            {approvals.length === 0 && <WidgetEmpty>No pending approvals</WidgetEmpty>}
          </div>
        )}
      </WidgetBody>
    </>
  );
}
