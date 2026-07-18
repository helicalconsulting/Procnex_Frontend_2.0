import { Link } from 'react-router-dom';
import { Users, ArrowRight } from 'lucide-react';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const barColor = value >= 80 ? '#16a34a' : value >= 60 ? '#ca8a04' : value >= 40 ? '#ea580c' : '#dc2626';
  return (
    <div className="dash-vendor__score-item">
      <div className="dash-vendor__score-label">
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: barColor }}>{value}%</span>
      </div>
      <div className="dash-vendor__score-track">
        <div
          className="dash-vendor__score-fill"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

export default function TopVendorsWidget() {
  const { data: vendors, loading } = useServiceData(
    () => dashboardService.getTopVendors(),
    []
  );

  return (
    <>
      <div className="dash-card__header">
        <span className="dash-card__title">
          <Users size={16} />
          Top Performing Vendors
        </span>
        <Link to="/vendors" className="dash-card__action">
          View All <ArrowRight size={14} />
        </Link>
      </div>
      <div className="dash-card__body">
        {loading && <p className="dash-card__loading">Loading…</p>}
        <div className="dash-vendors">
          {vendors.map((v) => (
            <div key={v.name} className="dash-vendor">
              <div className="dash-vendor__header">
                <div className={`dash-vendor__avatar dash-vendor__avatar--${v.avatarMod}`}>
                  {v.initials}
                </div>
                <div>
                  <div className="dash-vendor__name">{v.name}</div>
                  <div className="dash-vendor__pos">{v.pos} Purchase Orders</div>
                </div>
                <div className="dash-vendor__overall">
                  <span className="dash-vendor__overall-value" style={{ color: v.score >= 80 ? '#16a34a' : v.score >= 60 ? '#ca8a04' : '#dc2626' }}>
                    {v.score}%
                  </span>
                  <span className="dash-vendor__overall-label">Overall</span>
                </div>
              </div>
              <div className="dash-vendor__scores">
                <ScoreBar value={v.quality} label="Quality" color="#0a6ed1" />
                <ScoreBar value={v.delivery} label="Delivery" color="#7c3aed" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
