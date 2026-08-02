import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { companySettingsService, type ContractTemplate } from '../../services/companySettingsService';
import { contractService } from '../../services/contractService';
import { MessageStrip } from '../shared/MessageStrip';
import { CurrencySelector } from '../shared/CurrencyMaster';
import { FileText, Clock, Check, AlertTriangle, Eye, Maximize2, Minimize2, X, FileCheck2, Sparkles } from 'lucide-react';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import '../../pages/contracts/ContractDetailPage.css';
import './ContractTemplateSelectModal.css';

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  PURCHASE_CONTRACT: 'Purchase Contract',
  SERVICE_CONTRACT: 'Service Contract',
  AMC: 'AMC',
  BINDING_CONTRACT: 'Binding Contract',
  CUSTOM: 'Custom',
};

const CONTRACT_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  PURCHASE_CONTRACT: { bg: 'rgba(10,110,209,0.12)', color: '#0a6ed1' },
  SERVICE_CONTRACT: { bg: 'rgba(16,126,62,0.12)', color: '#107e3e' },
  AMC:              { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
  BINDING_CONTRACT: { bg: 'rgba(217,119,6,0.12)',  color: '#d97706' },
  CUSTOM:           { bg: 'rgba(100,116,139,0.12)', color: '#64748b' },
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
  const getTypeStyle = (type: string) => CONTRACT_TYPE_COLORS[type] || CONTRACT_TYPE_COLORS['CUSTOM'];

  return createPortal(
    <div className="ctsm-backdrop" onClick={() => !generating && onClose()}>
      <div className="ctsm-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ctsm-header">
          <div className="ctsm-header__icon">
            <FileCheck2 size={20} />
          </div>
          <div className="ctsm-header__text">
            <h3 className="ctsm-header__title">Select Contract Template</h3>
            <p className="ctsm-header__subtitle">Contract Generation</p>
          </div>
          <button
            type="button"
            className="ctsm-close-btn"
            onClick={onClose}
            disabled={generating}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="ctsm-body">
          <p className="ctsm-desc">
            Choose an active template to generate a vendor contract for{' '}
            <strong>{vendorName}</strong>{' '}
            <span className="ctsm-desc__rfq">({rfqNumber})</span>
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

          {/* Template List */}
          {winningQuotationMissing ? (
            <div className="ctsm-empty">
              <AlertTriangle size={28} className="ctsm-empty__icon ctsm-empty__icon--warn" />
              <p className="ctsm-empty__text">
                Please accept a quotation first and ensure a winning vendor is selected before generating a contract.
              </p>
            </div>
          ) : loading ? (
            <div className="ctsm-empty">
              <Clock size={22} className="ctsm-empty__icon" />
              <p className="ctsm-empty__text">Loading templates…</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="ctsm-empty">
              <FileText size={28} className="ctsm-empty__icon" />
              <p className="ctsm-empty__text">No active contract templates found.<br />Ask an admin to create templates in <strong>Company Settings → Contracts</strong>.</p>
            </div>
          ) : (
            <div className="ctsm-template-list">
              {templates.map(t => {
                const isSelected = selectedType === t.type;
                const typeStyle = getTypeStyle(t.type);
                return (
                  <div
                    key={t.type}
                    className={`ctsm-template-card${isSelected ? ' ctsm-template-card--selected' : ''}`}
                    onClick={() => !generating && setSelectedType(t.type)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && !generating && setSelectedType(t.type)}
                  >
                    {/* Radio dot */}
                    <div className={`ctsm-radio${isSelected ? ' ctsm-radio--checked' : ''}`}>
                      {isSelected && <div className="ctsm-radio__dot" />}
                    </div>

                    {/* Type badge icon */}
                    <div className="ctsm-template-card__icon" style={{ background: typeStyle.bg, color: typeStyle.color }}>
                      <FileText size={16} />
                    </div>

                    {/* Text */}
                    <div className="ctsm-template-card__info">
                      <span className="ctsm-template-card__name">{t.name}</span>
                      <span className="ctsm-template-card__type" style={{ color: typeStyle.color }}>
                        {formatType(t.type)}
                      </span>
                      {t.description && (
                        <span className="ctsm-template-card__desc">{t.description}</span>
                      )}
                    </div>

                    {/* Check / Preview */}
                    <div className="ctsm-template-card__actions">
                      {isSelected && <Check size={16} className="ctsm-template-card__check" />}
                      <button
                        type="button"
                        className="ctsm-preview-btn"
                        onClick={e => { e.stopPropagation(); setPreviewTemplate(t); }}
                        title={`Preview ${t.name}`}
                        disabled={generating}
                      >
                        <Eye size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Contract Value & Currency */}
          {!loading && templates.length > 0 && !winningQuotationMissing && (
            <div className="ctsm-value-section">
              <label className="ctsm-label">
                Contract Value <span className="ctsm-label__required">*</span>
              </label>
              <div className="ctsm-value-row">
                <input
                  type="number"
                  placeholder="Enter contract value"
                  value={contractValue}
                  onChange={e => setContractValue(e.target.value)}
                  disabled={generating}
                  min={0}
                  step={0.01}
                  className="ctsm-input"
                />
                <div className="ctsm-currency">
                  <CurrencySelector
                    value={currency}
                    onChange={setCurrency}
                    disabled={generating}
                  />
                </div>
              </div>
              <span className="ctsm-hint">
                This value determines the maximum PO amount that can be created against this contract.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ctsm-footer">
          <button className="ctsm-btn ctsm-btn--ghost" onClick={onClose} disabled={generating}>
            Cancel
          </button>
          <button
            className="ctsm-btn ctsm-btn--primary"
            onClick={handleGenerate}
            disabled={generating || !selectedType || templates.length === 0 || winningQuotationMissing || !contractValue || Number(contractValue) <= 0}
            title={
              winningQuotationMissing ? 'Select a winning quotation first'
              : !contractValue || Number(contractValue) <= 0 ? 'Enter a valid contract value'
              : undefined
            }
          >
            {generating ? (
              <>
                <span className="ctsm-spinner" />
                Generating…
              </>
            ) : winningQuotationMissing ? (
              'Select Winning Quotation First'
            ) : (
              <>
                <Sparkles size={15} />
                Generate Contract
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="ctsm-backdrop ctsm-backdrop--preview" onClick={() => { setPreviewTemplate(null); setPreviewFullscreen(false); }}>
          <div
            className={`ctsm-dialog ctsm-dialog--preview${previewFullscreen ? ' ctsm-dialog--fullscreen' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="ctsm-header">
              <div className="ctsm-header__icon">
                <FileText size={20} />
              </div>
              <div className="ctsm-header__text">
                <h3 className="ctsm-header__title">{previewTemplate.name}</h3>
                <p className="ctsm-header__subtitle">Template Preview</p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="ctsm-close-btn"
                  onClick={() => setPreviewFullscreen(!previewFullscreen)}
                  title={previewFullscreen ? 'Minimize' : 'Full Screen'}
                >
                  {previewFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button
                  type="button"
                  className="ctsm-close-btn"
                  onClick={() => { setPreviewTemplate(null); setPreviewFullscreen(false); }}
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="ctsm-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {previewTemplate.content ? (
                <div
                  className="ctr-template-preview-content"
                  dangerouslySetInnerHTML={{ __html: previewTemplate.content }}
                />
              ) : (
                <div className="ctsm-empty">
                  <FileText size={28} className="ctsm-empty__icon" />
                  <p className="ctsm-empty__text">No content available for this template.</p>
                </div>
              )}
            </div>
            <div className="ctsm-footer">
              <button className="ctsm-btn ctsm-btn--ghost" onClick={() => { setPreviewTemplate(null); setPreviewFullscreen(false); }}>
                Close
              </button>
              <button
                className="ctsm-btn ctsm-btn--primary"
                onClick={() => {
                  setSelectedType(previewTemplate.type);
                  setPreviewTemplate(null);
                  setPreviewFullscreen(false);
                }}
              >
                <Check size={15} />
                Select This Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
