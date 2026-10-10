import { BarChart3, ChevronRight } from 'lucide-react';
import { useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useServiceData } from '../../../hooks/useServiceData';
import { sseClient } from '../../../services/sseClient';
import { dashboardService } from '../../../services/dashboardService';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import type { DashboardPipelineItem } from '../../../types/viewModels';
import { WidgetHeader, WidgetBody, WidgetLoading } from './WidgetShell';

const STAGE_CONFIG: Record<
  string,
  {
    label: string;
    stageBadge: string;
    desc: string;
    color: string;
    link: string;
  }
> = {
  Draft: {
    label: 'Draft RFQs',
    stageBadge: 'Stage 1',
    desc: 'Created & in preparation, not yet sent to vendors',
    color: 'bg-slate-500',
    link: '/rfq?status=DRAFT',
  },
  Sent: {
    label: 'Sent to Vendors',
    stageBadge: 'Stage 2',
    desc: 'Published to vendors, awaiting quotation submissions',
    color: 'bg-blue-500',
    link: '/rfq?status=SENT',
  },
  'Quotations In': {
    label: 'Quotations Received',
    stageBadge: 'Stage 3',
    desc: 'Vendor quotes submitted, ready for comparative evaluation',
    color: 'bg-sky-500',
    link: '/quotations',
  },
  'Under Eval': {
    label: 'Under Evaluation',
    stageBadge: 'Stage 4',
    desc: 'Quotations undergoing evaluation and internal approval',
    color: 'bg-amber-500',
    link: '/rfq?status=PENDING_APPROVAL',
  },
  'PO Created': {
    label: 'PO Created & Awarded',
    stageBadge: 'Stage 5',
    desc: 'Winning quotation awarded and purchase order issued',
    color: 'bg-emerald-500',
    link: '/procurement/purchase-orders',
  },
  Closed: {
    label: 'Closed / Fulfilled',
    stageBadge: 'Stage 6',
    desc: 'Order fulfilled or completed, RFQ procurement cycle closed',
    color: 'bg-teal-500',
    link: '/rfq?status=CLOSED',
  },
};

export default function ProcurementPipelineWidget() {
  const { data: pipeline, loading, error, reload } = useServiceData(
    () => dashboardService.getPipeline(),
    [] as DashboardPipelineItem[]
  );

  useEffect(() => {
    const unsubSigned = sseClient.on('contract_signed', () => reload());
    const unsubPO = sseClient.on('po_created', () => reload());
    return () => {
      unsubSigned();
      unsubPO();
    };
  }, [reload]);

  const totalRfqs = useMemo(() => {
    return pipeline.reduce((sum, p) => sum + (p.count || 0), 0);
  }, [pipeline]);

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
      <WidgetHeader
        icon={<BarChart3 size={16} />}
        title="Procurement Pipeline"
        subtitle={`Live RFQ progression across procurement stages (${totalRfqs} total RFQs)`}
        href="/rfq"
      />
      <WidgetBody>
        {error && <MessageStrip type="error">{error}</MessageStrip>}
        {loading && <WidgetLoading>Loading pipeline…</WidgetLoading>}
        {!loading && !error && (
          <div className="grid gap-2">
            {pipelineData.map((item) => {
              const meta = STAGE_CONFIG[item.label] || {
                label: `${item.label} RFQs`,
                stageBadge: 'Stage',
                desc: 'Procurement pipeline stage',
                color: 'bg-primary',
                link: '/rfq',
              };

              return (
                <Link
                  key={item.label}
                  to={meta.link}
                  className="group -mx-2 flex flex-col gap-1.5 rounded-xl p-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`Click to view ${meta.label} (${item.count} RFQs)`}
                >
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground transition-colors group-hover:text-primary">
                          {meta.label}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {meta.stageBadge}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {meta.desc}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-right">
                      <div>
                        <span className="block font-bold tabular-nums text-foreground">
                          {item.count}{' '}
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {item.count === 1 ? 'RFQ' : 'RFQs'}
                          </span>
                        </span>
                        {totalRfqs > 0 ? (
                          <span className="block text-[10.5px] tabular-nums text-muted-foreground">
                            {Math.round((item.count / totalRfqs) * 100)}% of pipeline
                          </span>
                        ) : null}
                      </div>
                      <ChevronRight
                        size={14}
                        className="text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80">
                    <div
                      className={`h-full rounded-full ${meta.color} transition-all duration-300`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </WidgetBody>
    </>
  );
}
