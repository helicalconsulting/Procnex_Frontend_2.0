import { FileText } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import type { DashboardRecentRfq } from '../../../types/viewModels';
import { WidgetHeader, WidgetBody, WidgetLoading } from './WidgetShell';
import { Badge } from '../../../components/ui/badge';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Approved',
  IN_PROGRESS: 'Accepted',
  ACCEPTED: 'Accepted',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'neutral',
  SENT: 'success',
  IN_PROGRESS: 'success',
  ACCEPTED: 'success',
  CLOSED: 'info',
  CANCELLED: 'danger',
};

function formatRfqDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RecentRfqsWidget() {
  const { data: recentRfqs, loading, error } = useServiceData(
    () => dashboardService.getRecentRfqs(),
    [] as DashboardRecentRfq[]
  );

  return (
    <>
      <WidgetHeader icon={<FileText size={16} />} title="Recent RFQs" href="/rfq" />
      <WidgetBody className="p-0">
        {error && <div className="p-4"><MessageStrip type="error">{error}</MessageStrip></div>}
        {loading && <WidgetLoading>Loading RFQs…</WidgetLoading>}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground">
                  <th className="px-4 py-2.5">RFQ #</th>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-center">Quotes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentRfqs.map((rfq) => (
                  <tr key={rfq.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold text-primary">{rfq.rfqNumber}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 font-medium text-foreground">{rfq.title}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[rfq.status] || 'neutral'}>
                        {STATUS_LABELS[rfq.status] || rfq.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatRfqDate(rfq.createdAt)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-foreground">{rfq.quotations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetBody>
    </>
  );
}
