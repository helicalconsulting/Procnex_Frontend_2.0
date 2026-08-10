import { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { contractService } from '../../services/contractService';
import { useAuth } from '../../context/AuthContext';
import { isL2OrHigherUser } from '../../utils/rbac';
import { CreatorLevelPromptModal } from '../shared/CreatorLevelPromptModal';
import { MessageStrip } from '../shared/MessageStrip';
import {
  ShoppingCart, FileText, X, Clock, DollarSign, Building2,
} from 'lucide-react';
import '../../pages/contracts/ContractDetailPage.css';

export interface PostAwardModalProps {
  rfqNumber: string;
  vendorName: string;
  awardValue: number;
  currency: string;
  rfqId: string;
  onClose: () => void;
  onNavigatePO: (startLevelNumber?: number) => void;
  onNavigateContract: () => Promise<void>;
  /**
   * When set, the modal operates in pre-approval mode:
   * - The decision is NOT persisted via updatePostAwardDecision.
   * - Instead, onApproveFirst() is called before the selected action.
   * - If onApproveFirst rejects, the error is shown and no navigation occurs.
   */
  preAwardMode?: boolean;
  /** Required in preAwardMode: called before navigating to PO/contract */
  onApproveFirst?: (startLevelNumber?: number) => Promise<void>;
}

export default function PostAwardModal({
  rfqNumber,
  vendorName,
  awardValue,
  currency,
  rfqId,
  onClose,
  onNavigatePO,
  onNavigateContract,
  preAwardMode = false,
  onApproveFirst,
}: PostAwardModalProps) {
  const { roles } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLevelPrompt, setShowLevelPrompt] = useState(false);

  useBodyScrollLock(true);

  const executePoAction = async (startLevelNumber?: number) => {
    setSaving('PO_CREATED');
    setError(null);
    try {
      if (preAwardMode && onApproveFirst) {
        await onApproveFirst(startLevelNumber);
      }
      if (!preAwardMode) {
        await contractService.updatePostAwardDecision(rfqId, 'PO_CREATED');
      }
      await onNavigatePO(startLevelNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decision');
    } finally {
      setSaving(null);
    }
  };

  const handleSelect = async (decision: 'PO_CREATED' | 'CONTRACT_CREATED' | 'DISMISSED') => {
    if (decision === 'PO_CREATED') {
      await executePoAction();
      return;
    }

    setSaving(decision);
    setError(null);
    try {
      if (!preAwardMode) {
        await contractService.updatePostAwardDecision(rfqId, decision);
      }
      if (decision === 'CONTRACT_CREATED') {
        await onNavigateContract();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decision');
    } finally {
      setSaving(null);
    }
  };

  const formatCurrency = (value: number, _curr: string) => {
    return `$${value.toLocaleString('en-US')}`;
  };

  return (
    <div className="ctr-modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="ctr-award-modal" onClick={e => e.stopPropagation()}>
        <div className="ctr-award-modal__header">
          <span className="ctr-award-modal__title"><FileText size={20} /> Purchase Order or Contract</span>
        </div>

        <div className="ctr-award-modal__body">
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            Do you want to create a <strong>Purchase Order</strong> or a <strong>Contract</strong> for this vendor?
          </p>

          <div className="ctr-award-modal__info">
            <div className="ctr-award-modal__row">
              <span className="ctr-award-modal__label"><Building2 size={14} /> Supplier</span>
              <span className="ctr-award-modal__value">{vendorName}</span>
            </div>
            <div className="ctr-award-modal__row">
              <span className="ctr-award-modal__label"><FileText size={14} /> RFQ</span>
              <span className="ctr-award-modal__value">{rfqNumber}</span>
            </div>
            <div className="ctr-award-modal__row">
              <span className="ctr-award-modal__label"><DollarSign size={14} /> Award Value</span>
              <span className="ctr-award-modal__value">{formatCurrency(awardValue, currency)}</span>
            </div>
          </div>

          {error && (
            <MessageStrip type="error" compact onClose={() => setError(null)}>
              {error}
            </MessageStrip>
          )}

          <div className="ctr-award-modal__actions">
            <button
              className="ctr-award-modal__btn"
              onClick={() => handleSelect('PO_CREATED')}
              disabled={!!saving}
            >
              <div className="ctr-award-modal__btn-icon ctr-award-modal__btn-icon--po">
                <ShoppingCart size={22} />
              </div>
              <div className="ctr-award-modal__btn-info">
                <span className="ctr-award-modal__btn-title">Create Purchase Order</span>
                <span className="ctr-award-modal__btn-desc">
                  Create a standalone purchase order linked to this RFQ
                </span>
              </div>
              {saving === 'PO_CREATED' && <Clock size={16} className="ctr-award-modal__spinner" />}
            </button>

            <button
              className="ctr-award-modal__btn"
              onClick={() => handleSelect('CONTRACT_CREATED')}
              disabled={!!saving}
            >
              <div className="ctr-award-modal__btn-icon ctr-award-modal__btn-icon--contract">
                <FileText size={22} />
              </div>
              <div className="ctr-award-modal__btn-info">
                <span className="ctr-award-modal__btn-title">Create Contract</span>
                <span className="ctr-award-modal__btn-desc">
                  Select an active contract template and generate the agreement
                </span>
              </div>
              {saving === 'CONTRACT_CREATED' && <Clock size={16} className="ctr-award-modal__spinner" />}
            </button>

            <button
              className="ctr-award-modal__btn"
              onClick={() => handleSelect('DISMISSED')}
              disabled={!!saving}
            >
              <div className="ctr-award-modal__btn-icon ctr-award-modal__btn-icon--dismiss">
                <X size={22} />
              </div>
              <div className="ctr-award-modal__btn-info">
                <span className="ctr-award-modal__btn-title">Not Now</span>
                <span className="ctr-award-modal__btn-desc">
                  Dismiss and create PO or contract later from the RFQ details page
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <CreatorLevelPromptModal
        isOpen={showLevelPrompt}
        moduleName="Purchase Order"
        onConfirm={(startLevelNumber) => {
          setShowLevelPrompt(false);
          void executePoAction(startLevelNumber);
        }}
        onCancel={() => setShowLevelPrompt(false)}
      />
    </div>
  );
}
