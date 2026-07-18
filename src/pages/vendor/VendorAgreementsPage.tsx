import { useState, useMemo } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService, type VendorAgreement } from '../../services/vendorPortalService';
import {
  FileSignature,
  Search,
  Eye,
  Download,
  Building2,
  Calendar,
  FileText,
  ChevronDown,
  X,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import '../../styles/vendor-portal.css';
import './VendorAgreementsPage.css';

// ─── Helpers ────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDocTypeLabel(docType: string): string {
  if (docType === 'NDA' || docType === 'NDA Agreement') return 'Non-Disclosure Agreement (NDA)';
  if (docType === 'MNDA' || docType === 'MNDA Agreement') return 'Mutual Non-Disclosure Agreement (MNDA)';
  return docType;
}

function getDocTypeAbbr(docType: string): string {
  if (docType === 'NDA' || docType === 'NDA Agreement') return 'NDA';
  if (docType === 'MNDA' || docType === 'MNDA Agreement') return 'MNDA';
  return docType;
}

// ─── Component ──────────────────────────────────────────────

export default function VendorAgreementsPage() {
  const { data: agreements, loading } = useServiceData(
    () => vendorPortalService.listAgreements(),
    [] as VendorAgreement[],
    [],
    { cacheKey: 'vendor:agreements', cacheTtlMs: 30000 }
  );

  const [search, setSearch] = useState('');
  const [previewDoc, setPreviewDoc] = useState<VendorAgreement | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = useMemo(() => ({
    total: agreements.length,
    nda: agreements.filter((a) => a.selectedDocType === 'NDA' || a.documentType === 'NDA Agreement').length,
    mnda: agreements.filter((a) => a.selectedDocType === 'MNDA' || a.documentType === 'MNDA Agreement').length,
  }), [agreements]);

  const filtered = useMemo(() => {
    let list = agreements;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.companyName.toLowerCase().includes(q) ||
          a.selectedDocType.toLowerCase().includes(q) ||
          a.documentType.toLowerCase().includes(q)
      );
    }
    return list;
  }, [agreements, search]);

  const handlePreview = (doc: VendorAgreement) => {
    setPreviewDoc(doc);
  };

  const handleDownload = (doc: VendorAgreement) => {
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${doc.selectedDocType} Agreement - ${doc.companyName}</title><style>body{font-family:Arial,sans-serif;padding:40px;line-height:1.6;color:#333;max-width:800px;margin:0 auto}img{max-width:100%}</style></head><body>${doc.contentSnapshot}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.selectedDocType}_Agreement_${doc.companyName.replace(/\s+/g, '_')}_${formatDate(doc.signedAt).replace(/\s+/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="vendor-portal">
      <div className="vendor-portal__container">
        {/* Header */}
        <div className="vendor-header">
          <div className="vendor-header__content">
            <h1>Signed Agreements 🤝</h1>
            <p>View, preview, and download all NDA/MNDA agreements you have signed.</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="vendor-kpis va-summary">
          <div className="vendor-kpi-card">
            <div className="vendor-kpi-icon" style={{ background: 'rgba(10,110,209,0.1)', color: '#0a6ed1' }}>
              <FileSignature size={24} />
            </div>
            <div>
              <div className="vendor-kpi-label">Total Agreements</div>
              <div className="vendor-kpi-value">{summary.total}</div>
              <div className="vendor-kpi-subtext">All signed</div>
            </div>
          </div>
          <div className="vendor-kpi-card">
            <div className="vendor-kpi-icon" style={{ background: 'rgba(16,126,62,0.1)', color: '#107e3e' }}>
              <FileText size={24} />
            </div>
            <div>
              <div className="vendor-kpi-label">NDA</div>
              <div className="vendor-kpi-value">{summary.nda}</div>
              <div className="vendor-kpi-subtext">Non-Disclosure</div>
            </div>
          </div>
          <div className="vendor-kpi-card">
            <div className="vendor-kpi-icon" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
              <FileText size={24} />
            </div>
            <div>
              <div className="vendor-kpi-label">MNDA</div>
              <div className="vendor-kpi-value">{summary.mnda}</div>
              <div className="vendor-kpi-subtext">Mutual NDA</div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="vo-toolbar">
          <div className="vo-toolbar__search">
            <Search size={16} className="vo-toolbar__search-icon" />
            <input
              type="text"
              placeholder="Search by company name or agreement type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Agreements List */}
        {loading ? (
          <div className="vendor-empty-state">
            <div className="vendor-empty-state__icon">⏳</div>
            <div className="vendor-empty-state__title">Loading agreements…</div>
          </div>
        ) : filtered.length > 0 ? (
          <div className="va-agreements">
            {filtered.map((agreement) => {
              const isExpanded = expandedId === agreement.id;

              return (
                <div
                  key={agreement.id}
                  className={`va-card ${isExpanded ? 'va-card--expanded' : ''}`}
                >
                  <div
                    className="va-card__header"
                    onClick={() => setExpandedId(isExpanded ? null : agreement.id)}
                  >
                    <div className="va-card__left">
                      <div className="va-card__type-badge">
                        <span className={`va-badge va-badge--${(agreement.selectedDocType || agreement.documentType).toLowerCase().includes('mnda') ? 'mnda' : 'nda'}`}>
                          {getDocTypeAbbr(agreement.selectedDocType || agreement.documentType)}
                        </span>
                      </div>
                      <div className="va-card__info">
                        <span className="va-card__company">
                          <Building2 size={14} /> {agreement.companyName}
                        </span>
                        <span className="va-card__meta">
                          <span><Calendar size={12} /> Signed {formatDate(agreement.signedAt)}</span>
                          <span className="va-card__dot">·</span>
                          <span><CheckCircle2 size={12} /> {agreement.status}</span>
                        </span>
                      </div>
                    </div>
                    <div className="va-card__right">
                      <span className="va-card__type-label">
                        {getDocTypeLabel(agreement.selectedDocType || agreement.documentType)}
                      </span>
                      <ChevronDown
                        size={18}
                        style={{
                          transition: 'transform 0.2s',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          color: 'var(--text-secondary)',
                          flexShrink: 0,
                        }}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="va-card__body">
                      <div className="va-card__grid">
                        <div className="va-card__info-section">
                          <div className="va-card__info-title">Agreement Details</div>
                          <div className="va-card__row">
                            <span className="va-card__row-label">Type</span>
                            <span className="va-card__row-value">
                              {getDocTypeLabel(agreement.selectedDocType || agreement.documentType)}
                            </span>
                          </div>
                          <div className="va-card__row">
                            <span className="va-card__row-label">Company</span>
                            <span className="va-card__row-value">{agreement.companyName}</span>
                          </div>
                          <div className="va-card__row">
                            <span className="va-card__row-label">Signed On</span>
                            <span className="va-card__row-value">{formatDateTime(agreement.signedAt)}</span>
                          </div>
                          <div className="va-card__row">
                            <span className="va-card__row-label">Status</span>
                            <span className="va-card__row-value va-status--signed">
                              <CheckCircle2 size={13} /> Signed
                            </span>
                          </div>
                        </div>
                        <div className="va-card__info-section">
                          <div className="va-card__info-title">Signature</div>
                          {agreement.signatures && agreement.signatures.length > 0 ? (
                            agreement.signatures.map((sig) => (
                              <div key={sig.id} className="va-card__sig-block">
                                <div className="va-card__row">
                                  <span className="va-card__row-label">Signed By</span>
                                  <span className="va-card__row-value">{sig.signerName}</span>
                                </div>
                                {sig.signatureUrl && (
                                  <div className="va-card__sig-preview">
                                    <img src={sig.signatureUrl} alt="Signature" />
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="va-card__row">
                              <span className="va-card__row-value" style={{ color: 'var(--text-secondary)' }}>
                                Signature data not available
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="va-card__actions">
                        <button
                          className="vendor-btn vendor-btn--secondary"
                          onClick={() => handlePreview(agreement)}
                        >
                          <Eye size={15} /> Preview
                        </button>
                        <button
                          className="vendor-btn vendor-btn--primary"
                          onClick={() => handleDownload(agreement)}
                        >
                          <Download size={15} /> Download
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="vendor-empty-state">
            <div className="vendor-empty-state__icon">📝</div>
            <div className="vendor-empty-state__title">No Signed Agreements</div>
            <div className="vendor-empty-state__text">
              {search
                ? 'Try adjusting your search.'
                : 'You have not signed any NDA or MNDA agreements yet. These will appear here once you sign them during onboarding.'}
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {previewDoc && (
          <div className="va-preview-backdrop" onClick={() => setPreviewDoc(null)}>
            <div className="va-preview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="va-preview-header">
                <div className="va-preview-header-left">
                  <FileText size={18} />
                  <span>
                    {getDocTypeLabel(previewDoc.selectedDocType || previewDoc.documentType)} —{' '}
                    {previewDoc.companyName}
                  </span>
                </div>
                <div className="va-preview-header-actions">
                  <button
                    className="vendor-btn vendor-btn--secondary"
                    onClick={() => handleDownload(previewDoc)}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    <Download size={13} /> Download
                  </button>
                  <button
                    className="va-preview-close"
                    onClick={() => setPreviewDoc(null)}
                    title="Close preview"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="va-preview-body">
                <div
                  className="va-preview-content"
                  dangerouslySetInnerHTML={{ __html: previewDoc.contentSnapshot }}
                />
              </div>
              <div className="va-preview-footer">
                <span>
                  Signed on {formatDateTime(previewDoc.signedAt)} by{' '}
                  {previewDoc.signatures?.[0]?.signerName || 'You'}
                </span>
                <button
                  className="vendor-btn vendor-btn--primary"
                  onClick={() => {
                    window.open(
                      `data:text/html,${encodeURIComponent(
                        `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${previewDoc.selectedDocType} Agreement</title><style>body{font-family:Arial,sans-serif;padding:40px;line-height:1.6;color:#333;max-width:800px;margin:0 auto}img{max-width:100%}</style></head><body>${previewDoc.contentSnapshot}</body></html>`
                      )}`,
                      '_blank',
                      'noopener,noreferrer'
                    );
                  }}
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  <ExternalLink size={13} /> Open in New Tab
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
