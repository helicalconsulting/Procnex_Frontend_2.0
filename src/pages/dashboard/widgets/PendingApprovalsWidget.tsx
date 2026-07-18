import { Link } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import { approvalService } from '../../../services/approvalService';

export default function PendingApprovalsWidget() {
  const { data: approvals, loading, error } = useServiceData(
    async () => {
      const all = await approvalService.listTable();
      return all.filter((a) => a.status === 'PENDING').slice(0, 4);
    },
    []
  );

  const dotMod = (module: string) => {
    if (module.includes('PO') || module.includes('Purchase')) return 'po';
    if (module.includes('Quotation')) return 'quotation';
    return 'rfq';
  };

  return (
    <>
      <div className="dash-card__header">
        <span className="dash-card__title">
          <Clock size={16} />
          Pending Approvals
        </span>
        <Link to="/approvals" className="dash-card__action">
          View All <ArrowRight size={14} />
        </Link>
      </div>
      {error && <MessageStrip type="error" compact className="sap-message-strip--flush">{error}</MessageStrip>}
      {loading && <p className="dash-card__loading">Loading…</p>}
      <div className="dash-approvals">
        {approvals.map((item) => (
          <div key={item.id} className="dash-approval-item">
            <span className={`dash-approval-item__dot dash-approval-item__dot--${dotMod(item.module)}`} />
            <div className="dash-approval-item__body">
              <span className="dash-approval-item__module">{item.module}</span>
              <span className="dash-approval-item__ref">{item.referenceNumber}</span>
            </div>
            <div className="dash-approval-item__meta">
              <span className="dash-approval-item__requester">{item.requestedBy}</span>
              <span className="dash-approval-item__amount">{item.amount}</span>
            </div>
          </div>
        ))}
        {!loading && approvals.length === 0 && (
          <p className="dash-card__empty">No pending approvals</p>
        )}
      </div>
    </>
  );
}
