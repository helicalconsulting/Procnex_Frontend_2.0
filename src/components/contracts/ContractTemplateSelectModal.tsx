import { useState, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { companySettingsService, type ContractTemplate } from '../../services/companySettingsService';
import { contractService } from '../../services/contractService';
import { MessageStrip } from '../shared/MessageStrip';
import { FileText, X, Clock, Check, AlertTriangle } from 'lucide-react';
import '../../pages/contracts/ContractDetailPage.css';

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  PURCHASE_CONTRACT: 'Purchase Contract',
  SERVICE_CONTRACT: 'Service Contract',
  AMC: 'AMC',
  BINDING_CONTRACT: 'Binding Contract',
  CUSTOM: 'Custom',
};

export interface ContractTemplateSelectModalProps {
  rfqId: string;
  rfqNumber: string;
  vendorName: string;
  winningQuotationMissing?: boolean;
  onClose: () => void;
  onGenerated: (contractId: string) => void;
}

export default function ContractTemplateSelectModal({
  rfqId,
  rfqNumber,
  vendorName,
  winningQuotationMissing = false,
  onClose,
  onGenerated,
}: ContractTemplateSelectModalProps) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await companySettingsService.listContractTemplates();
        if (!cancelled) {
          const active = all.filter(t => t.isActive);
          setTemplates(active);
          if (active.length === 1) setSelectedType(active[0].type);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = async () => {
    if (!selectedType) {
      setError('Please select a contract template');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const contract = await contractService.generateFromTemplate(rfqId, selectedType);
      onGenerated(contract.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate contract');
    } finally {
      setGenerating(false);
    }
  };

  const formatType = (type: string) => CONTRACT_TYPE_LABELS[type] || type.replace(/_/g, ' ');

  return (
    <div className="ctr-modal-backdrop" onClick={() => !generating && onClose()}>
      <div className="ctr-award-modal" onClick={e => e.stopPropagation()}>
        <div className="ctr-award-modal__header">
          <span className="ctr-award-modal__title"><FileText size={20} /> Select Contract Template</span>
          <button className="ctr-modal__close" onClick={onClose} disabled={generating}><X size={18} /></button>
        </div>

        <div className="ctr-award-modal__body">
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
            Choose an active contract template to generate a vendor contract for <strong>{vendorName}</strong> ({rfqNumber}).
          </p>

          {winningQuotationMissing && (
            <MessageStrip type="warning" compact>
              A winning quotation must be selected before generating a contract. Please select a winning vendor first.
            </MessageStrip>
          )}

          {!winningQuotationMissing && error && (
            <MessageStrip type="error" compact onClose={() => setError(null)}>
              {error}
            </MessageStrip>
          )}

          {winningQuotationMissing ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <AlertTriangle size={24} style={{ marginBottom: 8, color: 'var(--warning-500, #d97706)' }} />
              <p style={{ margin: 0, fontSize: 14 }}>
                Please accept a quotation first and ensure a winning vendor is selected before generating a contract.
              </p>
            </div>
          ) : loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Clock size={20} /> Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No active contract templates found. Ask an admin to create templates in Company Settings → Contracts.
            </div>
          ) : (
            <div className="ctr-template-select-list">
              {templates.map(t => (
                <button
                  key={t.type}
                  type="button"
                  className={`ctr-template-select-item${selectedType === t.type ? ' ctr-template-select-item--selected' : ''}`}
                  onClick={() => setSelectedType(t.type)}
                  disabled={generating}
                >
                  <div className="ctr-template-select-item__main">
                    <span className="ctr-template-select-item__name">{t.name}</span>
                    <span className="ctr-template-select-item__type">{formatType(t.type)}</span>
                    {t.description && (
                      <span className="ctr-template-select-item__desc">{t.description}</span>
                    )}
                  </div>
                  {selectedType === t.type && <Check size={18} />}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="ctr-detail__action-btn" onClick={onClose} disabled={generating}>Cancel</button>
            <button
              className="ctr-detail__action-btn ctr-detail__action-btn--primary"
              onClick={handleGenerate}
              disabled={generating || !selectedType || templates.length === 0 || winningQuotationMissing}
              title={winningQuotationMissing ? 'Select a winning quotation first' : undefined}
              style={winningQuotationMissing ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              {generating ? 'Generating…' : winningQuotationMissing ? 'Select Winning Quotation First' : 'Generate Contract'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
