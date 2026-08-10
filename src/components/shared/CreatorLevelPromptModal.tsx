import React, { useState } from 'react';
import { HelpCircle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import './CreatorLevelPromptModal.css';

interface CreatorLevelPromptModalProps {
  isOpen: boolean;
  moduleName: string;
  onConfirm: (startLevelNumber: number) => void;
  onCancel: () => void;
}

export const CreatorLevelPromptModal: React.FC<CreatorLevelPromptModalProps> = ({
  isOpen,
  moduleName,
  onConfirm,
  onCancel,
}) => {
  const [selectedOption, setSelectedOption] = useState<'LEVEL_1' | 'MY_LEVEL'>('LEVEL_1');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(selectedOption === 'LEVEL_1' ? 1 : 2);
  };

  return (
    <div className="prompt-modal-backdrop" onClick={onCancel}>
      <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-modal__header">
          <div className="prompt-modal__title">
            <HelpCircle size={20} className="prompt-modal__icon" />
            <span>Select Approval Starting Level</span>
          </div>
          <button type="button" className="prompt-modal__close" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="prompt-modal__body">
            <p className="prompt-modal__question">
              Do you want to send this <strong>{moduleName}</strong> for approval to Level 1?
            </p>
            <p className="prompt-modal__subtext">
              As an approver, you can choose whether the approval workflow starts at Level 1 (Clerk) or directly at your level.
            </p>

            <div className="prompt-modal__options">
              <label
                className={`prompt-modal__option ${selectedOption === 'LEVEL_1' ? 'prompt-modal__option--selected' : ''}`}
                onClick={() => setSelectedOption('LEVEL_1')}
              >
                <input
                  type="radio"
                  name="startLevel"
                  value="LEVEL_1"
                  checked={selectedOption === 'LEVEL_1'}
                  onChange={() => setSelectedOption('LEVEL_1')}
                />
                <div className="prompt-modal__option-content">
                  <div className="prompt-modal__option-title">
                    <CheckCircle2 size={16} /> Start at Level 1 (Clerk / Requisitioner)
                  </div>
                  <div className="prompt-modal__option-desc">
                    Send to Level 1 first so lower level approvers can review before it reaches higher management.
                  </div>
                </div>
              </label>

              <label
                className={`prompt-modal__option ${selectedOption === 'MY_LEVEL' ? 'prompt-modal__option--selected' : ''}`}
                onClick={() => setSelectedOption('MY_LEVEL')}
              >
                <input
                  type="radio"
                  name="startLevel"
                  value="MY_LEVEL"
                  checked={selectedOption === 'MY_LEVEL'}
                  onChange={() => setSelectedOption('MY_LEVEL')}
                />
                <div className="prompt-modal__option-content">
                  <div className="prompt-modal__option-title">
                    <ShieldCheck size={16} /> Start at My Level (Level 2+)
                  </div>
                  <div className="prompt-modal__option-desc">
                    Bypass Level 1 and initiate approval directly at your level.
                  </div>
                </div>
              </label>
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
    </div>
  );
};
