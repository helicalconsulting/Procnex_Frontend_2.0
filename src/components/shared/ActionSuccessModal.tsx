import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, RotateCcw, X, ShoppingCart, FileText } from 'lucide-react';
import './ActionSuccessModal.css';

export interface ActionSuccessModalData {
  actionType: 'approve' | 'reject' | 'return' | 'accept' | 'sent' | 'submit';
  module: 'Quotation' | 'RFQ' | 'Purchase Order' | 'Contract' | string;
  referenceNumber?: string;
  title?: string;
  message?: string;
  comment?: string;
  details?: Array<{ label: string; value: string }>;
  onNavigatePo?: () => void;
  onNavigateContract?: () => void;
  onNavigateDetails?: () => void;
  badgeText?: string;
  actionTitle?: string;
}

interface ActionSuccessModalProps {
  data: ActionSuccessModalData | null;
  onClose: () => void;
}

export function ActionSuccessModal({ data, onClose }: ActionSuccessModalProps) {
  useEffect(() => {
    if (!data) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, onClose]);

  if (!data) return null;

  const isSent = data.actionType === 'sent' || data.actionType === 'submit';
  const isApprove = data.actionType === 'approve' || data.actionType === 'accept';
  const isReject = data.actionType === 'reject';
  const isReturn = data.actionType === 'return';

  const typeClass = (isApprove || isSent) ? 'approve' : isReject ? 'reject' : 'return';

  const displayActionTitle = data.actionTitle || (isSent
    ? `${data.module} Sent`
    : isApprove
    ? `${data.module} Approved`
    : isReject
    ? `${data.module} Rejected`
    : `${data.module} Returned for Revision`);

  const badgeText = data.badgeText || (isSent ? 'SENT' : isApprove ? 'APPROVED' : isReject ? 'REJECTED' : 'RETURNED');

  const defaultMessage = isApprove
    ? `The ${data.module} request has been approved successfully. Email notifications and workflow updates have been sent.`
    : isReject
    ? `The ${data.module} request has been rejected. Email notifications have been sent to relevant parties.`
    : `The ${data.module} request has been returned for revision. The originator/vendor has been notified via email.`;

  const content = (
    <div className="action-success-backdrop" onClick={onClose} role="presentation">
      <div
        className={`action-success-modal action-success-modal--${typeClass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button className="action-success-modal__close" onClick={onClose} aria-label="Close modal">
          <X size={18} />
        </button>

        {/* Dynamic Icon Circle */}
        <div className={`action-success-modal__icon-wrap action-success-modal__icon-wrap--${typeClass}`}>
          {isApprove && <CheckCircle2 size={38} className="action-success-modal__icon" />}
          {isReject && <XCircle size={38} className="action-success-modal__icon" />}
          {isReturn && <RotateCcw size={38} className="action-success-modal__icon" />}
        </div>

        {/* Header Title & Badge */}
        <div className="action-success-modal__header">
          <span className={`action-success-modal__badge action-success-modal__badge--${typeClass}`}>
            {badgeText}
          </span>
          <h2 className="action-success-modal__title">{displayActionTitle}</h2>
          <p className="action-success-modal__message">{data.message || defaultMessage}</p>
        </div>

        {/* Summary Details Card */}
        <div className="action-success-modal__card">
          {data.referenceNumber && (
            <div className="action-success-modal__card-row">
              <span className="action-success-modal__card-label">Reference</span>
              <span className="action-success-modal__card-val action-success-modal__card-val--ref">
                {data.referenceNumber}
              </span>
            </div>
          )}
          {data.title && (
            <div className="action-success-modal__card-row">
              <span className="action-success-modal__card-label">Title</span>
              <span className="action-success-modal__card-val">{data.title}</span>
            </div>
          )}
          <div className="action-success-modal__card-row">
            <span className="action-success-modal__card-label">Module</span>
            <span className="action-success-modal__card-val">{data.module}</span>
          </div>
          {data.details && data.details.map((d, i) => (
            <div key={i} className="action-success-modal__card-row">
              <span className="action-success-modal__card-label">{d.label}</span>
              <span className="action-success-modal__card-val">{d.value}</span>
            </div>
          ))}
          {data.comment && (
            <div className="action-success-modal__comment-box">
              <span className="action-success-modal__comment-label">Comments:</span>
              <p className="action-success-modal__comment-text">"{data.comment}"</p>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="action-success-modal__footer">
          {data.onNavigatePo && (
            <button
              type="button"
              className="action-success-modal__btn action-success-modal__btn--secondary"
              onClick={() => { onClose(); data.onNavigatePo?.(); }}
            >
              <ShoppingCart size={15} />
              <span>Create PO</span>
            </button>
          )}
          {data.onNavigateContract && (
            <button
              type="button"
              className="action-success-modal__btn action-success-modal__btn--secondary"
              onClick={() => { onClose(); data.onNavigateContract?.(); }}
            >
              <FileText size={15} />
              <span>Create Contract</span>
            </button>
          )}
          <button
            type="button"
            className={`action-success-modal__btn action-success-modal__btn--primary action-success-modal__btn--${typeClass}`}
            onClick={onClose}
            autoFocus
          >
            <span>OK</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default ActionSuccessModal;
