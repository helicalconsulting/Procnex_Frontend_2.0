import { Building2, Mail, Users, Globe, MapPin, X, ExternalLink, Tag, CheckCircle2 } from 'lucide-react';
import type { VendorSearchResult } from '../../services/procurementService';
import './VendorSuggestDropdown.css';

interface VendorDetailModalProps {
  vendor: VendorSearchResult;
  onClose: () => void;
  onContinueNew: () => void;
  onViewVendor?: () => void;
}

function statusDisplay(v: VendorSearchResult): { label: string; cls: string } {
  const st = v.status.toUpperCase();
  if (v.isActive) return { label: 'Active / Approved', cls: 'vss-approved' };
  if (st === 'APPROVED' || st === 'ACTIVE') return { label: 'Approved', cls: 'vss-approved' };
  if (st === 'PENDING_APPROVAL' || st === 'DOCUMENTS_SUBMITTED' || st === 'INVITATION_ACCEPTED') return { label: 'Pending Approval', cls: 'vss-pending' };
  if (st === 'REJECTED') return { label: 'Rejected', cls: 'vss-rejected' };
  if (st === 'INVITED') return { label: 'Invited', cls: 'vss-invited' };
  return { label: st, cls: 'vss-pending' };
}

export default function VendorDetailModal({
  vendor,
  onClose,
  onContinueNew,
  onViewVendor,
}: VendorDetailModalProps) {
  const st = statusDisplay(vendor);

  return (
    <div className="vsd-backdrop" onClick={onClose}>
      <div className="vsd-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vsd-header">
          <div className="vsd-header__icon">
            <Building2 size={22} />
          </div>
          <div className="vsd-header__copy">
            <h3 className="vsd-header__title">{vendor.name}</h3>
            <p className="vsd-header__sub">Vendor Details</p>
          </div>
          <button
            type="button"
            className="vsd-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="vsd-body">
          {/* Status */}
          <div className="vsd-status-bar">
            <span className={`vss-item__badge vss-item__badge--${st.cls}`}>
              {st.label}
            </span>
          </div>

          {/* Details Grid */}
          <div className="vsd-section">
            <div className="vsd-section-label">
              <Mail size={13} />
              Contact Information
            </div>
            <div className="vsd-grid">
              <div className="vsd-field">
                <div className="vsd-field__label">Company Name</div>
                <div className="vsd-field__value">{vendor.name}</div>
              </div>
              <div className="vsd-field">
                <div className="vsd-field__label">Email</div>
                <div className="vsd-field__value">{vendor.email}</div>
              </div>
              {vendor.contactPerson && (
                <div className="vsd-field">
                  <div className="vsd-field__label">Contact Person</div>
                  <div className="vsd-field__value">
                    <Users size={12} />
                    {vendor.contactPerson}
                  </div>
                </div>
              )}
              <div className="vsd-field">
                <div className="vsd-field__label">Status</div>
                <div className="vsd-field__value">
                  <CheckCircle2 size={12} style={{ color: st.cls === 'vss-approved' ? 'var(--success-500)' : 'var(--warning-500)' }} />
                  {st.label}
                </div>
              </div>
            </div>
          </div>

          {/* Similarity info */}
          <div className="vsd-similarity">
            <Tag size={14} />
            <span>
              Match confidence: <strong>{vendor.score}%</strong>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="vsd-footer">
          <button
            type="button"
            className="vsd-btn vsd-btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="vsd-btn vsd-btn--outline"
            onClick={onViewVendor}
          >
            <ExternalLink size={15} />
            View Vendor
          </button>
          <button
            type="button"
            className="vsd-btn vsd-btn--primary"
            onClick={onContinueNew}
          >
            Continue with New Vendor
          </button>
        </div>
      </div>
    </div>
  );
}
