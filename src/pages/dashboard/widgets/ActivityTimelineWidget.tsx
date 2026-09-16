import {
  History,
  Send,
  ShieldCheck,
  CheckCircle2,
  FileText,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import type { ActivityItem } from '../../../mocks/dashboard.mock';
import { WidgetBody, WidgetHeader, WidgetLoading } from './WidgetShell';
import DOMPurify from 'dompurify';

const ICON_MAP = {
  Send,
  ShieldCheck,
  CheckCircle2,
  FileText,
  XCircle,
  AlertCircle,
};

export default function ActivityTimelineWidget() {
  const { data: activity, loading } = useServiceData(
    () => dashboardService.getActivity(),
    [] as ActivityItem[]
  );

  return (
    <>
      <WidgetHeader icon={<History size={16} />} title="Recent activity" href="/audit" />
      <WidgetBody>
        {loading && <WidgetLoading />}
        <div className="grid gap-1">
          {activity.map((item, idx) => {
            const Icon = ICON_MAP[item.iconName];
            return (
              <div key={idx} className="relative flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                {idx < activity.length - 1 && <span aria-hidden="true" className="absolute bottom-[-7px] left-[21px] top-9 w-px bg-border" />}
                <div className="relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
                  <Icon size={14} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <div className="text-[14px] leading-5 text-foreground" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.text) }} />
                  <div className="mt-0.5 text-[12px] text-muted-foreground">{item.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </WidgetBody>
    </>
  );
}
