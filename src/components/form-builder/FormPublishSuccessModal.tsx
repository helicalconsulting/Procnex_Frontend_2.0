import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  CheckCircle2,
  Users,
  Building,
  Calendar,
  Clock,
  GitMerge,
  PlusCircle,
  ListFilter,
  FileSpreadsheet,
  X,
  Sparkles,
} from 'lucide-react';
import type { AudienceType } from '../../services/formWorkflowService';
import './FormPublishSuccessModal.css';

interface FormPublishSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  formTitle: string;
  recipientCount: number;
  audienceType: AudienceType;
  dueDate: string;
  priority: string;
  hasWorkflow: boolean;
  onCreateAnotherForm: () => void;
  onViewFormsList: () => void;
  onViewResponses: () => void;
}

export default function FormPublishSuccessModal({
  isOpen,
  onClose,
  formTitle,
  recipientCount,
  audienceType,
  dueDate,
  priority,
  hasWorkflow,
  onCreateAnotherForm,
  onViewFormsList,
  onViewResponses,
}: FormPublishSuccessModalProps) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fpsm-backdrop" onClick={onClose}>
      <div className="fpsm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="fpsm-close-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* Top Success Header */}
        <div className="fpsm-success-header">
          <div className="fpsm-icon-ring">
            <CheckCircle2 size={36} className="fpsm-check-icon" />
          </div>
          <h3 className="fpsm-title">Form Published & Distributed!</h3>
          <p className="fpsm-form-name">"{formTitle}"</p>
        </div>

        {/* Distribution Details Card */}
        <div className="fpsm-details-card">
          <div className="fpsm-detail-item">
            <div className="fpsm-detail-icon">
              {audienceType === 'whole_org' ? <Building size={16} /> : <Users size={16} />}
            </div>
            <div className="fpsm-detail-text">
              <span className="fpsm-detail-label">Recipients</span>
              <span className="fpsm-detail-val">
                {audienceType === 'whole_org'
                  ? `Whole Organization (${recipientCount} Active Employees)`
                  : `${recipientCount} Specific User(s)`}
              </span>
            </div>
          </div>

          <div className="fpsm-detail-item">
            <div className="fpsm-detail-icon">
              <Calendar size={16} />
            </div>
            <div className="fpsm-detail-text">
              <span className="fpsm-detail-label">Due Date</span>
              <span className="fpsm-detail-val">{dueDate || 'No deadline'}</span>
            </div>
          </div>

          <div className="fpsm-detail-item">
            <div className="fpsm-detail-icon">
              <Clock size={16} />
            </div>
            <div className="fpsm-detail-text">
              <span className="fpsm-detail-label">Priority Level</span>
              <span className="fpsm-detail-val">{priority} Priority</span>
            </div>
          </div>

          <div className="fpsm-detail-item">
            <div className="fpsm-detail-icon">
              <GitMerge size={16} />
            </div>
            <div className="fpsm-detail-text">
              <span className="fpsm-detail-label">Workflow Status</span>
              <span className="fpsm-detail-val">
                {hasWorkflow ? 'Approval Matrix Attached' : 'Direct Distribution'}
              </span>
            </div>
          </div>
        </div>

        {/* Prompt Question */}
        <div className="fpsm-prompt-box">
          <Sparkles size={16} className="fpsm-sparkle" />
          <span>Do you want to send or create more forms?</span>
        </div>

        {/* Action Buttons */}
        <div className="fpsm-actions">
          <button type="button" className="fpsm-btn fpsm-btn--primary" onClick={onCreateAnotherForm}>
            <PlusCircle size={16} />
            <span>Create Another Form</span>
          </button>
          <button type="button" className="fpsm-btn fpsm-btn--secondary" onClick={onViewResponses}>
            <FileSpreadsheet size={16} />
            <span>View Responses</span>
          </button>
        </div>
      </div>
    </div>
  );
}
