import { Link } from 'react-router-dom';
import { FileText, ArrowRight } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import type { DashboardRecentRfq } from '../../../types/viewModels';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Approved',
  IN_PROGRESS: 'Accepted',
  ACCEPTED: 'Accepted',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'draft',
  SENT: 'sent',
  IN_PROGRESS: 'closed',
  ACCEPTED: 'closed',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
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
      <div className="dash-card__header">
        <span className="dash-card__title">
          <FileText size={16} />
          Recent RFQs
        </span>
        <Link to="/rfq" className="dash-card__action">
          View All <ArrowRight size={14} />
        </Link>
      </div>
      <div className="dash-card__body dash-card__body--table">
        {error && <MessageStrip type="error" compact>{error}</MessageStrip>}
        {loading && <div className="dash-table__loading">Loading RFQs…</div>}
        {!loading && !error && (
          <table className="dash-table">
            <thead>
              <tr>
                <th>RFQ #</th>
                <th>Title</th>
                <th>Status</th>
                <th>Date</th>
                <th>Vendors</th>
              </tr>
            </thead>
            <tbody>
              {recentRfqs.map((rfq) => (
                <tr key={rfq.id}>
                  <td className="dash-table__rfq-num">{rfq.rfqNumber}</td>
                  <td className="dash-table__title">{rfq.title}</td>
                  <td>
                    <span className={`dash-badge dash-badge--${STATUS_BADGE[rfq.status] || 'draft'}`}>
                      {STATUS_LABELS[rfq.status] || rfq.status}
                    </span>
                  </td>
                  <td>{formatRfqDate(rfq.createdAt)}</td>
                  <td>{rfq.quotations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
