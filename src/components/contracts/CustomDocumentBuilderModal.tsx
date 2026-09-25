import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { companySettingsService, type ContractTemplate, type VendorOption } from '../../services/companySettingsService';
import { contractService } from '../../services/contractService';
import { useBranding } from '../../context/BrandingContext';
import { useCurrency, CurrencySelector } from '../shared/CurrencyMaster';
import { MessageStrip } from '../shared/MessageStrip';
import RichTextEditor from '../shared/RichTextEditor';
import { ALL_PLACEHOLDERS, PLACEHOLDER_CATEGORIES, resolvePlaceholders } from '../../utils/placeholderResolver';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import { apiRequest } from '../../api/client';
import {
  FileText,
  X,
  Sparkles,
  Save,
  Download,
  Eye,
  Edit3,
  Plus,
  CheckCircle2,
  Building2,
  Calendar,
  DollarSign,
  FileCheck2,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import './CustomDocumentBuilderModal.css';

export interface CustomDocumentBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (contractId: string) => void;
  initialTemplateType?: string;
  initialVendorId?: string;
  initialVendorName?: string;
}

export const CustomDocumentBuilderModal: React.FC<CustomDocumentBuilderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialTemplateType,
  initialVendorId,
  initialVendorName,
}) => {
  useBodyScrollLock(isOpen);
  const { companyName, companyEmail, companyPhone } = useBranding();
  const { companyDefaultCurrency, formatAmount } = useCurrency();

  // Document Metadata Form
  const [docTitle, setDocTitle] = useState('Vendor Service Agreement');
  const [docType, setDocType] = useState('SERVICE_CONTRACT');
  const [vendorId, setVendorId] = useState(initialVendorId || '');
  const [vendorName, setVendorName] = useState(initialVendorName || '');
  const [vendorList, setVendorList] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [contractValue, setContractValue] = useState<number | string>(150000);
  const [currency, setCurrency] = useState(companyDefaultCurrency || 'KES');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [deliveryTerms, setDeliveryTerms] = useState('FOB Destination');

  // Signature Settings
  const [embedCompanySig, setEmbedCompanySig] = useState(true);
  const [companySigUrl, setCompanySigUrl] = useState<string | null>(null);

  // Editor Content & Active Tab (Editor vs Preview)
  const [contentHtml, setContentHtml] = useState('');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [selectedPlaceholderCategory, setSelectedPlaceholderCategory] = useState('all');
  const [insertedNotice, setInsertedNotice] = useState<string | null>(null);

  // System State
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Fetch Vendors & Signature on Mount
  useEffect(() => {
    if (!isOpen) return;

    // Fetch Vendors
    apiRequest<{ vendors?: any[]; data?: any[] }>('/vendors')
      .then((res) => {
        const list = (res.vendors || res.data || []).map((v: any) => ({
          id: String(v.id || v.vendorId),
          name: v.name || v.companyName || v.vendorName,
          email: v.email,
        }));
        setVendorList(list);
        if (!vendorName && list.length > 0) {
          setVendorId(list[0].id);
          setVendorName(list[0].name);
        }
      })
      .catch(() => {});

    // Fetch Default Company Signature
    companySettingsService
      .getDefaultSignature()
      .then((sig) => {
        if (sig?.dataUrl) setCompanySigUrl(sig.dataUrl);
      })
      .catch(() => {});

    // Fetch Templates
    setLoadingTemplates(true);
    companySettingsService
      .listContractTemplates()
      .then((tmplList) => {
        setTemplates(tmplList);
        if (tmplList.length > 0) {
          const match = initialTemplateType
            ? tmplList.find((t) => t.type === initialTemplateType) || tmplList[0]
            : tmplList[0];
          setContentHtml(match.content || getDefaultBlankTemplate());
          if (match.type) setDocType(match.type);
          if (match.name) setDocTitle(match.name);
        } else {
          setContentHtml(getDefaultBlankTemplate());
        }
      })
      .catch(() => setContentHtml(getDefaultBlankTemplate()))
      .finally(() => setLoadingTemplates(false));
  }, [isOpen, initialTemplateType]);

  if (!isOpen) return null;

  // Insert tag into editor
  const handleInsertTag = (tagCode: string) => {
    setContentHtml((prev) => {
      const space = prev && !prev.endsWith(' ') && !prev.endsWith('>') ? ' ' : '';
      return `${prev}${space}${tagCode} `;
    });
    setInsertedNotice(tagCode);
    setTimeout(() => setInsertedNotice(null), 2500);
  };

  // Vendor selection handler
  const handleVendorChange = (vId: string) => {
    setVendorId(vId);
    const found = vendorList.find((v) => v.id === vId);
    if (found) setVendorName(found.name);
  };

  // Template switch handler
  const handleSelectTemplate = (tmpl: ContractTemplate) => {
    setDocTitle(tmpl.name);
    setDocType(tmpl.type);
    setContentHtml(tmpl.content || getDefaultBlankTemplate());
  };

  // Resolved dynamic preview snapshot
  const resolvedPreviewHtml = resolvePlaceholders(contentHtml, {
    companyName: companyName || 'Procnex Consulting',
    companyAddress: 'Central Operations Depot, Suite 400',
    companyEmail: companyEmail || 'procurement@procnex.com',
    companyPhone: companyPhone || '+254 700 000 000',
    companySignatureUrl: embedCompanySig ? companySigUrl || undefined : undefined,

    vendorName: vendorName || 'Selected Vendor',
    vendorAddress: 'Vendor Registered Premises',
    vendorEmail: 'vendor@supplier.com',

    contractNumber: `CTR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    effectiveDate,
    expiryDate,
    createdDate: new Date().toLocaleDateString('en-GB'),

    contractValue,
    currency,
    paymentTerms,
    deliveryTerms,
  });

  // Save / Generate Contract
  const handleSaveContract = async () => {
    if (!docTitle.trim()) {
      setMsg({ text: 'Please enter a Document Title.', type: 'error' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const newContract = await contractService.createContract({
        rfqId: 'DIRECT-BUILDER',
        title: docTitle,
        contractType: docType,
        contractValue: Number(contractValue) || 0,
        currency,
        effectiveDate,
        expirationDate: expiryDate,
        paymentTerms,
        deliveryTerms,
      });

      setMsg({ text: `Contract "${docTitle}" created successfully!`, type: 'success' });
      if (onSuccess && newContract?.id) {
        onSuccess(newContract.id);
      }
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setMsg({ text: err?.message || 'Failed to save contract.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Export PDF
  const handleExportPdf = () => {
    downloadContractAsPdf(
      resolvedPreviewHtml,
      `DOC-${Date.now().toString().slice(-6)}`,
      docTitle
    ).catch(() => setMsg({ text: 'PDF export failed', type: 'error' }));
  };

  return createPortal(
    <div className="cdbm-overlay" role="dialog" aria-modal="true">
      <div className="cdbm-container">
        {/* Header */}
        <div className="cdbm-header">
          <div className="cdbm-header__left">
            <div className="cdbm-header__icon">
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="cdbm-header__title">Dynamic Contract & Document Builder</h2>
              <p className="cdbm-header__subtitle">
                Create customizable contracts with interactive placeholders and real-time live preview
              </p>
            </div>
          </div>
          <div className="cdbm-header__actions">
            <button
              type="button"
              className={`cdbm-tab-btn ${activeTab === 'editor' ? 'cdbm-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              <Edit3 size={15} /> Editor Mode
            </button>
            <button
              type="button"
              className={`cdbm-tab-btn ${activeTab === 'preview' ? 'cdbm-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <Eye size={15} /> Live Preview
            </button>
            <button type="button" className="cdbm-close-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notice Message */}
        {msg && (
          <div style={{ padding: '8px 20px 0' }}>
            <MessageStrip type={msg.type} onClose={() => setMsg(null)}>
              {msg.text}
            </MessageStrip>
          </div>
        )}

        {/* Content Body */}
        <div className="cdbm-body">
          {/* Main Workspace Grid */}
          <div className="cdbm-grid">
            {/* Left Configuration Panel */}
            <div className="cdbm-sidebar">
              <h3 className="cdbm-sidebar__heading">Document Properties</h3>

              {/* Template Select */}
              <div className="cdbm-field">
                <label className="cdbm-field__label">Base Template</label>
                <select
                  className="cdbm-select"
                  value={docType}
                  onChange={(e) => {
                    const found = templates.find((t) => t.type === e.target.value);
                    if (found) handleSelectTemplate(found);
                    else setDocType(e.target.value);
                  }}
                  disabled={loadingTemplates}
                >
                  <option value="CUSTOM">Blank / Custom Document</option>
                  {templates.map((t) => (
                    <option key={t.id || t.type} value={t.type}>
                      {t.name || t.type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Document Title */}
              <div className="cdbm-field">
                <label className="cdbm-field__label">Document Title</label>
                <input
                  type="text"
                  className="cdbm-input"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Master Services Agreement"
                />
              </div>

              {/* Vendor Selector */}
              <div className="cdbm-field">
                <label className="cdbm-field__label">Select Vendor / Party B</label>
                <select
                  className="cdbm-select"
                  value={vendorId}
                  onChange={(e) => handleVendorChange(e.target.value)}
                >
                  <option value="">-- Custom / Manual Vendor --</option>
                  {vendorList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {!vendorId && (
                <div className="cdbm-field">
                  <label className="cdbm-field__label">Manual Vendor Name</label>
                  <input
                    type="text"
                    className="cdbm-input"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="e.g. Acme Corp Ltd"
                  />
                </div>
              )}

              {/* Financial & Terms Row */}
              <div className="cdbm-form-row">
                <div className="cdbm-field" style={{ flex: 1 }}>
                  <label className="cdbm-field__label">Contract Value</label>
                  <input
                    type="number"
                    className="cdbm-input"
                    value={contractValue}
                    onChange={(e) => setContractValue(e.target.value)}
                  />
                </div>
                <div className="cdbm-field" style={{ width: 90 }}>
                  <label className="cdbm-field__label">Currency</label>
                  <select
                    className="cdbm-select"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="KES">KES</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="cdbm-form-row">
                <div className="cdbm-field">
                  <label className="cdbm-field__label">Effective Date</label>
                  <input
                    type="date"
                    className="cdbm-input"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
                <div className="cdbm-field">
                  <label className="cdbm-field__label">Expiry Date</label>
                  <input
                    type="date"
                    className="cdbm-input"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Signature Toggle */}
              <div className="cdbm-sig-toggle">
                <label className="cdbm-sig-toggle__label">
                  <input
                    type="checkbox"
                    checked={embedCompanySig}
                    onChange={(e) => setEmbedCompanySig(e.target.checked)}
                  />
                  <span>Auto-Embed Company Signature</span>
                </label>
                <div className="cdbm-sig-toggle__sub">
                  Embeds your drawn official signature image for <code>{`{{companySignature}}`}</code>.
                </div>
              </div>
            </div>

            {/* Right Main Editor / Preview View */}
            <div className="cdbm-main">
              {activeTab === 'editor' ? (
                <div className="cdbm-editor-wrap">
                  {/* Interactive Click-to-Insert Toolbar */}
                  <div className="cdbm-ph-toolbar">
                    <div className="cdbm-ph-toolbar__top">
                      <div className="cdbm-ph-toolbar__title">
                        <Sparkles size={14} className="text-amber-500" /> Click-to-Insert Placeholders
                      </div>
                      {insertedNotice && (
                        <div className="cdbm-ph-notice">
                          <CheckCircle2 size={13} className="text-emerald-500" /> Inserted{' '}
                          <code>{insertedNotice}</code>
                        </div>
                      )}
                    </div>

                    <div className="cdbm-ph-tabs">
                      {PLACEHOLDER_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`cdbm-ph-tab ${
                            selectedPlaceholderCategory === cat.id ? 'cdbm-ph-tab--active' : ''
                          }`}
                          onClick={() => setSelectedPlaceholderCategory(cat.id)}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="cdbm-ph-grid">
                      {ALL_PLACEHOLDERS.filter(
                        (ph) =>
                          selectedPlaceholderCategory === 'all' ||
                          ph.category === selectedPlaceholderCategory
                      ).map((ph) => (
                        <button
                          key={ph.code}
                          type="button"
                          className="cdbm-ph-chip"
                          onClick={() => handleInsertTag(ph.code)}
                          title={`Insert ${ph.code} (${ph.description})`}
                        >
                          <code>{ph.code}</code>
                          <span>{ph.label}</span>
                          <Plus size={12} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rich Text Editor */}
                  <div className="cdbm-editor-area">
                    <RichTextEditor
                      value={contentHtml}
                      onChange={setContentHtml}
                      placeholder="Type contract clauses or insert dynamic placeholder tags..."
                      minHeight={420}
                    />
                  </div>
                </div>
              ) : (
                /* Live Preview Mode */
                <div className="cdbm-preview-wrap">
                  <div className="cdbm-preview-paper">
                    <div className="cdbm-preview-header-stamp">
                      <ShieldCheck size={16} /> Official Document Snapshot Preview
                    </div>
                    <div
                      className="cdbm-preview-content"
                      dangerouslySetInnerHTML={{ __html: resolvedPreviewHtml }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cdbm-footer">
          <div className="cdbm-footer__left">
            <span className="cdbm-footer__badge">
              Dynamic Binding Active • {vendorName || 'No Vendor Selected'}
            </span>
          </div>
          <div className="cdbm-footer__right">
            <button type="button" className="cdbm-btn cdbm-btn--outline" onClick={handleExportPdf}>
              <Download size={15} /> Export PDF
            </button>
            <button
              type="button"
              className="cdbm-btn cdbm-btn--primary"
              onClick={handleSaveContract}
              disabled={saving}
            >
              <Save size={15} /> {saving ? 'Creating Document…' : 'Generate & Save Contract'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

function getDefaultBlankTemplate(): string {
  return `<h2>CONTRACT AGREEMENT</h2>
<p>This Agreement is entered into on <strong>{{effective_date}}</strong> by and between:</p>
<p><strong>PARTY A:</strong> {{company_name}}, located at {{company_address}}.<br/>
<strong>PARTY B:</strong> {{vendor_name}}, located at {{vendor_address}}.</p>

<h3>1. PURPOSE & SCOPE OF WORK</h3>
<p>Party B agrees to provide products/services in accordance with RFQ reference <strong>{{rfq_number}}</strong> and contract specification <strong>{{contract_number}}</strong>.</p>

<h3>2. COMMERCIAL CONSIDERATION</h3>
<p>The total agreed contract value is <strong>{{contract_value}}</strong> subject to payment terms <strong>{{payment_terms}}</strong> and delivery terms <strong>{{delivery_terms}}</strong>.</p>

<h3>3. SIGNATURES & AUTHORIZATION</h3>
<table style="width:100%; margin-top:30px; border-collapse:collapse;">
  <tr>
    <td style="width:50%; vertical-align:top;">
      <strong>For Party A ({{company_name}}):</strong><br/><br/>
      {{companySignature}}
    </td>
    <td style="width:50%; vertical-align:top;">
      <strong>For Party B ({{vendor_name}}):</strong><br/><br/>
      {{vendor_signature}}
    </td>
  </tr>
</table>`;
}

export default CustomDocumentBuilderModal;
