import { Link } from 'react-router-dom';
import {
  History,
  ArrowRight,
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
      <div className="dash-card__header">
        <span className="dash-card__title">
          <History size={16} />
          Recent Activity
        </span>
        <Link to="/audit" className="dash-card__action">
          View All <ArrowRight size={14} />
        </Link>
      </div>
      <div className="dash-card__body">
        {loading && <p className="dash-card__loading">Loading…</p>}
        <div className="dash-timeline">
          {activity.map((item, idx) => {
            const Icon = ICON_MAP[item.iconName];
            return (
              <div key={idx} className="dash-tl-item">
                <div className="dash-tl__dot">
                  <Icon size={14} />
                </div>
                <div className="dash-tl__content">
                  <div
                    className="dash-tl__text"
                    dangerouslySetInnerHTML={{ __html: item.text }}
                  />
                  <div className="dash-tl__time">{item.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
