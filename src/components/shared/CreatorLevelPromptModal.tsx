import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import './CreatorLevelPromptModal.css';

interface CreatorLevelPromptModalProps {
  isOpen: boolean;
  moduleName?: string;
  title?: string;
  initialRfqApprovalStartPoint?: 'ORIGINATOR' | 'L1_USER';
  initialQuotationApprovalMode?: 'DIRECT_X_ONLY' | 'FULL_CHAIN';
  onConfirm: (
    startLevelNumber: number,
    rfqApprovalStartPoint?: 'ORIGINATOR' | 'L1_USER',
    quotationApprovalMode?: 'DIRECT_X_ONLY' | 'FULL_CHAIN'
  ) => void;
  onCancel: () => void;
}

export const CreatorLevelPromptModal: React.FC<CreatorLevelPromptModalProps> = ({
  isOpen,
  title,
  initialRfqApprovalStartPoint = 'L1_USER',
  initialQuotationApprovalMode = 'DIRECT_X_ONLY',
  onConfirm,
  onCancel,
}) => {
  const [rfqApprovalStartPoint, setRfqApprovalStartPoint] = useState<'ORIGINATOR' | 'L1_USER'>(
    initialRfqApprovalStartPoint
  );
  const [quotationApprovalMode, setQuotationApprovalMode] = useState<'DIRECT_X_ONLY' | 'FULL_CHAIN'>(
    initialQuotationApprovalMode
  );

  useEffect(() => {
    if (isOpen) {
      setRfqApprovalStartPoint(initialRfqApprovalStartPoint || 'L1_USER');
      setQuotationApprovalMode(initialQuotationApprovalMode || 'DIRECT_X_ONLY');
    }
  }, [isOpen, initialRfqApprovalStartPoint, initialQuotationApprovalMode]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startLevelNumber = rfqApprovalStartPoint === 'L1_USER' ? 1 : 2;
    onConfirm(startLevelNumber, rfqApprovalStartPoint, quotationApprovalMode);
  };

  return createPortal(
    <div className="prompt-modal-backdrop" onClick={onCancel}>
      <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-modal__header">
          <div className="prompt-modal__title">
            <HelpCircle size={20} className="prompt-modal__icon" />
            <span>{title || 'Select Approval Starting Level'}</span>
          </div>
          <button type="button" className="prompt-modal__close" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="prompt-modal__body">
            <div className="prompt-modal__field">
              <label className="prompt-modal__label">
                RFQ Internal Approval Start Point
              </label>
              <select
                className="prompt-modal__select"
                value={rfqApprovalStartPoint}
                onChange={(e) => setRfqApprovalStartPoint(e.target.value as 'ORIGINATOR' | 'L1_USER')}
              >
                <option value="ORIGINATOR">Originator (Self — Skip Approval Chain)</option>
                <option value="L1_USER">Approver 1 / L1 User (Start Normal Chain)</option>
              </select>
              <span className="prompt-modal__hint">
                <strong>Originator</strong>: RFQ is self-approved by you — no approval chain runs.<br/>
                <strong>Approver 1</strong>: RFQ goes through the configured approval levels chain.
              </span>
            </div>

            <div className="prompt-modal__field">
              <label className="prompt-modal__label">
                Quotation Approval Mode (N-Logic)
              </label>
              <select
                className="prompt-modal__select"
                value={quotationApprovalMode}
                onChange={(e) => setQuotationApprovalMode(e.target.value as 'DIRECT_X_ONLY' | 'FULL_CHAIN')}
              >
                <option value="DIRECT_X_ONLY">Single-level Review</option>
                <option value="FULL_CHAIN">Multi-level Review</option>
              </select>
              <span className="prompt-modal__hint">
                Choose whether incoming vendor bids go through Single-level Review or Multi-level Review chain.
              </span>
            </div>
          </div>

          <div className="prompt-modal__footer">
            <button type="button" className="prompt-modal__btn prompt-modal__btn--secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="prompt-modal__btn prompt-modal__btn--primary">
              Confirm & Submit
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
