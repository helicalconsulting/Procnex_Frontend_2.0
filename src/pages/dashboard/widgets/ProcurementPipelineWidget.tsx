import { Link } from 'react-router-dom';
import { BarChart3, ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import type { DashboardPipelineItem } from '../../../types/viewModels';

const STATUS_MODIFIER: Record<string, string> = {
  DRAFT: 'draft',
  SENT: 'sent',
  IN_PROGRESS: 'progress',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
};

export default function ProcurementPipelineWidget() {
  const { data: pipeline, loading, error } = useServiceData(
    () => dashboardService.getPipeline(),
    [] as DashboardPipelineItem[]
  );

  const pipelineData = useMemo(() => {
    const max = Math.max(...pipeline.map((p) => p.count), 1);
    return pipeline.map((item) => ({
      label: item.label,
      count: item.count,
      percent: Math.round((item.count / max) * 100),
      modifier: STATUS_MODIFIER[item.status] || item.status.toLowerCase(),
    }));
  }, [pipeline]);

  return (
    <>
      <div className="dash-card__header">
        <span className="dash-card__title">
          <BarChart3 size={16} />
          Procurement Pipeline
        </span>
        <Link to="/rfq" className="dash-card__action">
          View All <ArrowRight size={14} />
        </Link>
      </div>
      <div className="dash-card__body">
        {error && <MessageStrip type="error" compact>{error}</MessageStrip>}
        {loading && <div className="dash-pipeline__loading">Loading pipeline…</div>}
        {!loading && !error && (
          <div className="dash-pipeline">
            {pipelineData.map((item) => (
              <div key={item.modifier} className="dash-pipeline__bar">
                <span className="dash-pipeline__label">{item.label}</span>
                <div className="dash-pipeline__track">
                  <div
                    className={`dash-pipeline__fill dash-pipeline__fill--${item.modifier}`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <span className="dash-pipeline__count">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
