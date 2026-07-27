import { useState, useEffect } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { companySettingsService, type ContractTemplate } from '../../services/companySettingsService';
import { contractService } from '../../services/contractService';
import { MessageStrip } from '../shared/MessageStrip';
import { CurrencySelector } from '../shared/CurrencyMaster';
import { FileText, Clock, Check, AlertTriangle, Eye, Maximize2, Minimize2, X } from 'lucide-react';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
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
  /** When set, called right before generating the contract to approve the quotation first */
  onApproveFirst?: () => Promise<void>;
}

export default function ContractTemplateSelectModal({
  rfqId,
  rfqNumber,
  vendorName,
  winningQuotationMissing = false,
  onClose,
  onGenerated,
  onApproveFirst,
}: ContractTemplateSelectModalProps) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [contractValue, setContractValue] = useState<string>('');
  const [currency, setCurrency] = useState<string>('KES');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ContractTemplate | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

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
    if (!contractValue || Number(contractValue) <= 0) {
      setError('Please enter a valid contract value');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      if (onApproveFirst) {
        await onApproveFirst();
      }
      const contract = await contractService.generateFromTemplate(rfqId, selectedType, Number(contractValue), currency);
      downloadContractAsPdf(
        contract.contentSnapshot,
        contract.contractNumber,
        contract.title,
      ).catch(err => console.warn('[ContractSelect] Auto PDF download failed:', err));
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
      <div className="sap-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="sap-dialog__header">
          <div className="sap-dialog__title-wrap">
            <div className="sap-dialog__icon-badge sap-dialog__icon-badge--primary">
              <FileText size={18} />
            </div>
            <div className="sap-dialog__title-group">
              <h3 className="sap-dialog__title">Select Contract Template</h3>
              <span className="sap-dialog__subtitle">Contract Generation</span>
            </div>
          </div>
          <button
            type="button"
            className="sap-dialog__close-btn"
            onClick={onClose}
            disabled={generating}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="sap-dialog__body">
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
                <div
                  key={t.type}
                  className={`ctr-template-select-item${selectedType === t.type ? ' ctr-template-select-item--selected' : ''}`}
                >
                  <button
                    type="button"
                    className="ctr-template-select-item__clickable"
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
                  <button
                    type="button"
                    className="ctr-template-preview-btn"
                    onClick={() => setPreviewTemplate(t)}
                    title={`Preview ${t.name}`}
                    disabled={generating}
                  >
                    <Eye size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Contract Value & Currency Inputs */}
          {!loading && templates.length > 0 && !winningQuotationMissing && (
            <div className="pr-field" style={{ marginTop: 12 }}>
              <label>Contract Value *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  placeholder="Enter contract value"
                  value={contractValue}
                  onChange={e => setContractValue(e.target.value)}
                  disabled={generating}
                  min={0}
                  step={0.01}
                  style={{ flex: 1 }}
                />
                <div style={{ width: 140 }}>
                  <CurrencySelector
                    value={currency}
                    onChange={setCurrency}
                    disabled={generating}
                  />
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'block' }}>
                This value will determine the maximum PO amount that can be created against this contract.
              </span>
            </div>
          )}
        </div>

        <div className="sap-dialog__footer">
          <button className="pr-btn pr-btn--outline" onClick={onClose} disabled={generating}>Cancel</button>
          <button
            className="pr-btn pr-btn--primary"
            onClick={handleGenerate}
            disabled={generating || !selectedType || templates.length === 0 || winningQuotationMissing || !contractValue || Number(contractValue) <= 0}
            title={winningQuotationMissing ? 'Select a winning quotation first' : !contractValue || Number(contractValue) <= 0 ? 'Enter a valid contract value' : undefined}
            style={winningQuotationMissing ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {generating ? 'Generating…' : winningQuotationMissing ? 'Select Winning Quotation First' : 'Generate Contract'}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="ctr-modal-backdrop" onClick={() => { setPreviewTemplate(null); setPreviewFullscreen(false); }}>
          <div
            className={`sap-dialog${previewFullscreen ? ' ctr-award-modal--preview-fullscreen' : ''}`}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: previewFullscreen ? '96vw' : 720 }}
          >
            <div className="sap-dialog__header">
              <div className="sap-dialog__title-wrap">
                <div className="sap-dialog__icon-badge sap-dialog__icon-badge--primary">
                  <FileText size={18} />
                </div>
                <div className="sap-dialog__title-group">
                  <h3 className="sap-dialog__title">{previewTemplate.name}</h3>
                  <span className="sap-dialog__subtitle">Template Preview</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="sap-dialog__close-btn"
                  onClick={() => setPreviewFullscreen(!previewFullscreen)}
                  title={previewFullscreen ? 'Minimize' : 'Full Screen'}
                >
                  {previewFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button
                  type="button"
                  className="sap-dialog__close-btn"
                  onClick={() => { setPreviewTemplate(null); setPreviewFullscreen(false); }}
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="sap-dialog__body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {previewTemplate.content ? (
                <div
                  className="ctr-template-preview-content"
                  dangerouslySetInnerHTML={{ __html: previewTemplate.content }}
                />
              ) : (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No content available for this template.
                </div>
              )}
            </div>
            <div className="sap-dialog__footer">
              <button className="pr-btn pr-btn--outline" onClick={() => { setPreviewTemplate(null); setPreviewFullscreen(false); }}>Close</button>
              <button
                className="pr-btn pr-btn--primary"
                onClick={() => {
                  setSelectedType(previewTemplate.type);
                  setPreviewTemplate(null);
                  setPreviewFullscreen(false);
                }}
              >
                Select This Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
