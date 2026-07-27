import { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { ShoppingCart, FileText, ArrowRight, X } from 'lucide-react';
import '../../pages/purchase-requisitions/PurchaseRequisitionPage.css';

export interface PoTypeSelectModalProps {
  rfqId: string;
  rfqNumber: string;
  vendorName: string;
  onClose: () => void;
  onSelectGeneralPO: () => Promise<void>;
  onSelectRFQBasedPO: () => Promise<void>;
}

export default function PoTypeSelectModal({
  rfqId,
  rfqNumber,
  vendorName,
  onClose,
  onSelectGeneralPO,
  onSelectRFQBasedPO,
}: PoTypeSelectModalProps) {
  const [selectedType, setSelectedType] = useState<'general' | 'rfq-based' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(true);

  const handleContinue = async () => {
    if (!selectedType) return;
    setSaving(true);
    setError(null);
    try {
      if (selectedType === 'general') {
        await onSelectGeneralPO();
      } else {
        await onSelectRFQBasedPO();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  };

  return (
    <div className="pr-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="po-type-modal" onClick={e => e.stopPropagation()}>
        <div className="po-type-modal__header">
          <span className="po-type-modal__title">
            <ShoppingCart size={20} /> Create Purchase Order
          </span>
          <button className="po-type-modal__close" onClick={() => !saving && onClose()} disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <div className="po-type-modal__body">
          <p className="po-type-modal__subtitle">
            Choose the type of purchase order to create for <strong>{vendorName}</strong> ({rfqNumber})
          </p>

          <div className="po-type-modal__options">
            <button
              className={`po-type-modal__option ${selectedType === 'general' ? 'po-type-modal__option--selected' : ''}`}
              onClick={() => setSelectedType('general')}
              disabled={saving}
            >
              <div className="po-type-modal__option-icon po-type-modal__option-icon--general">
                <ShoppingCart size={24} />
              </div>
              <div className="po-type-modal__option-info">
                <span className="po-type-modal__option-title">General PO</span>
                <span className="po-type-modal__option-desc">
                  Create a standard purchase order using the existing workflow. The PO will be created and submitted for approval.
                </span>
              </div>
              <div className="po-type-modal__option-radio">
                <div className={`po-type-modal__radio-circle ${selectedType === 'general' ? 'po-type-modal__radio-circle--selected' : ''}`} />
              </div>
            </button>

            <button
              className={`po-type-modal__option ${selectedType === 'rfq-based' ? 'po-type-modal__option--selected' : ''}`}
              onClick={() => setSelectedType('rfq-based')}
              disabled={saving}
            >
              <div className="po-type-modal__option-icon po-type-modal__option-icon--rfq">
                <FileText size={24} />
              </div>
              <div className="po-type-modal__option-info">
                <span className="po-type-modal__option-title">RFQ Based PO</span>
                <span className="po-type-modal__option-desc">
                  Open the Purchase Requisition editor with auto-filled RFQ data. Edit items, pricing, and details before finalizing.
                </span>
              </div>
              <div className="po-type-modal__option-radio">
                <div className={`po-type-modal__radio-circle ${selectedType === 'rfq-based' ? 'po-type-modal__radio-circle--selected' : ''}`} />
              </div>
            </button>
          </div>

          {error && (
            <div className="po-type-modal__error">{error}</div>
          )}
        </div>

        <div className="po-type-modal__footer">
          <button
            className="po-type-modal__btn po-type-modal__btn--cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="po-type-modal__btn po-type-modal__btn--primary"
            onClick={handleContinue}
            disabled={!selectedType || saving}
          >
            {saving ? 'Processing…' : (
              <>
                Continue
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
