import { AlertTriangle, Building2, Mail, X } from 'lucide-react';

interface VendorDuplicateModalProps {
  companyName: string;
  matchedVendor: {
    name: string;
    email: string;
    contactPerson?: string | null;
  } | null;
  onViewExisting: () => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export default function VendorDuplicateModal({
  companyName,
  matchedVendor,
  onViewExisting,
  onCreateNew,
  onCancel,
}: VendorDuplicateModalProps) {
  return (
    <div className="vsd-backdrop" onClick={onCancel}>
      <div className="vsd-modal vsd-modal--alert" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="vsd-header vsd-header--warning">
          <div className="vsd-header__icon vsd-header__icon--warning">
            <AlertTriangle size={24} />
          </div>
          <div className="vsd-header__copy">
            <h3 className="vsd-header__title">Potential Duplicate Found</h3>
            <p className="vsd-header__sub">
              A vendor with a similar company name already exists in the system.
            </p>
          </div>
          <button
            type="button"
            className="vsd-close-btn"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="vsd-body">
          {/* Matched vendor info */}
          {matchedVendor && (
            <div className="vsd-match-card">
              <div className="vsd-match-card__header">
                <Building2 size={16} className="vsd-match-card__icon" />
                <span className="vsd-match-card__label">Existing Vendor</span>
              </div>
              <div className="vsd-match-card__body">
                <div className="vsd-match-card__name">{matchedVendor.name}</div>
                <div className="vsd-match-card__email">
                  <Mail size={12} />
                  {matchedVendor.email}
                </div>
                {matchedVendor.contactPerson && (
                  <div className="vsd-match-card__contact">
                    Contact: {matchedVendor.contactPerson}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Your input */}
          <div className="vsd-input-display">
            <span className="vsd-input-display__label">Your entry:</span>
            <span className="vsd-input-display__value">{companyName}</span>
          </div>

          <p className="vsd-warning-text">
            If this is the same company, please select the existing vendor to avoid duplicate registration.
            Otherwise, you can continue creating a new vendor entry.
          </p>

          {/* Matched company name inline */}
          {matchedVendor && (
            <div className="vsd-match-inline">
              <div className="vsd-match-inline__item">
                <span className="vsd-match-inline__diff">New: {companyName}</span>
              </div>
              <div className="vsd-match-inline__item">
                <span className="vsd-match-inline__diff">Existing: {matchedVendor.name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="vsd-footer">
          <button
            type="button"
            className="vsd-btn vsd-btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="vsd-btn vsd-btn--ghost"
            onClick={onCreateNew}
          >
            Create New Anyway
          </button>
          <button
            type="button"
            className="vsd-btn vsd-btn--primary"
            onClick={onViewExisting}
          >
            View Existing Vendor
          </button>
        </div>
      </div>
    </div>
  );
}
