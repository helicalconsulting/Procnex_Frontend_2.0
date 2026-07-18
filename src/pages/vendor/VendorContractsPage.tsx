import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { contractService, type Contract } from '../../services/contractService';
import {
  FileText, Search, Eye, Download, FileSignature, Clock, CheckCircle2,
  AlertTriangle, XCircle, ChevronDown, Calendar, IndianRupee, Building2,
  Ban, X, Maximize2,
} from 'lucide-react';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import '../../styles/vendor-portal.css';
import './VendorContractsPage.css';

// ─── Types ──────────────────────────────────────────────────

type ContractStatus = 'DRAFT' | 'PENDING_VENDOR_SIGNATURE' | 'AWAITING_CUSTOMER_SIGNATURE' | 'AWAITING_VENDOR_SIGNATURE' | 'VENDOR_SIGNED' | 'COMPLETED' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_VENDOR_SIGNATURE: 'Awaiting Your Signature',
  AWAITING_CUSTOMER_SIGNATURE: 'Awaiting Buyer Signature',
  AWAITING_VENDOR_SIGNATURE: 'Awaiting Your Signature',
  VENDOR_SIGNED: 'Vendor Signed',
  COMPLETED: 'Completed',
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring Soon',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  TERMINATED: 'Cancelled',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  DRAFT: <FileText size={12} />,
  PENDING_VENDOR_SIGNATURE: <Clock size={12} />,
  AWAITING_CUSTOMER_SIGNATURE: <Clock size={12} />,
  AWAITING_VENDOR_SIGNATURE: <Clock size={12} />,
  VENDOR_SIGNED: <CheckCircle2 size={12} />,
  COMPLETED: <CheckCircle2 size={12} />,
  ACTIVE: <CheckCircle2 size={12} />,
  EXPIRING_SOON: <AlertTriangle size={12} />,
  EXPIRED: <XCircle size={12} />,
  CANCELLED: <Ban size={12} />,
  TERMINATED: <Ban size={12} />,
};

// ─── Component ──────────────────────────────────────────────

export default function VendorContractsPage() {
  const navigate = useNavigate();
  useAuth();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { data: contracts, loading } = useServiceData(
    () => contractService.listVendorContracts().then(r => r.contracts),
    [] as Contract[],
    [],
    { cacheKey: 'vendor:contracts', cacheTtlMs: 30000 }
  );

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewContract, setPreviewContract] = useState<Contract | null>(null);

  const summary = useMemo(() => ({
    total: contracts.length,
    pendingSignature: contracts.filter(c => c.status === 'AWAITING_VENDOR_SIGNATURE' || c.status === 'PENDING_VENDOR_SIGNATURE').length,
    active: contracts.filter(c => ['VENDOR_SIGNED', 'COMPLETED', 'ACTIVE'].includes(c.status)).length,
    totalValue: contracts.reduce((s, c) => s + c.contractValue, 0),
  }), [contracts]);

  const filtered = useMemo(() => {
    let list = contracts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.contractNumber.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.rfq?.rfqNumber || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [contracts, search]);

  const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const formatCurrency = (val: number, curr?: string) =>
    formatAmount(val, curr || companyDefaultCurrency);

  const handleView = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSign = (id: string) => {
    navigate(`/vendor/contracts/${id}?action=sign`);
  };

  const handleDownload = (c: Contract) => {
    downloadContractAsPdf(
      c.contentSnapshot,
      c.contractNumber,
      c.title,
    );
  };

  const handlePreview = (c: Contract) => {
    setPreviewContract(c);
  };

  const closePreview = () => {
    setPreviewContract(null);
  };

  return (
    <div className="vendor-portal">
      <div className="vendor-portal__container">
        {/* Hero Banner */}
        <div className="vc-hero">
          <div className="vc-hero__content">
            <h1 className="vc-hero__title">
              <FileText size={24} />
              My Contracts
            </h1>
            <p className="vc-hero__subtitle">View, download, and sign contracts awarded to your company.</p>
            <div className="vc-hero__stats">
              <div className="vc-hero__stat">
                <span className="vc-hero__stat-value">{summary.total}</span>
                <span className="vc-hero__stat-label">Total Contracts</span>
              </div>
              <div className="vc-hero__stat">
                <span className="vc-hero__stat-value">{summary.pendingSignature}</span>
                <span className="vc-hero__stat-label">Need Signature</span>
              </div>
              <div className="vc-hero__stat">
                <span className="vc-hero__stat-value">{summary.active}</span>
                <span className="vc-hero__stat-label">Active</span>
              </div>
              <div className="vc-hero__stat">
                <span className="vc-hero__stat-value">{formatAmount(summary.totalValue, companyDefaultCurrency)}</span>
                <span className="vc-hero__stat-label">Total Value</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        {/* Search */}
      <div className="vo-toolbar" style={{ marginTop: 0 }}>
          <div className="vo-toolbar__search">
            <Search size={16} className="vo-toolbar__search-icon" />
            <input
              type="text"
              placeholder="Search by contract number, title, or RFQ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Contracts List */}
        {loading ? (
          <div className="vendor-empty-state">
            <div className="vendor-empty-state__icon">⏳</div>
            <div className="vendor-empty-state__title">Loading contracts…</div>
          </div>
        ) : filtered.length > 0 ? (
          <div className="vc-contracts">
            {filtered.map(contract => {
              const status = contract.status as ContractStatus;
              const isExpanded = expandedId === contract.id;

              return (
                <div key={contract.id} className={`vc-card ${isExpanded ? 'vc-card--expanded' : ''}`}>
                  <div className="vc-card__header" onClick={() => handleView(contract.id)}>
                    <div className="vc-card__left">
                      <div className="vc-card__top-row">
                        <span className="vc-card__number">{contract.contractNumber}</span>
                        <span className="vc-card__title">{contract.title}</span>
                      </div>
                      <div className="vc-card__meta">
                        <span className="vc-card__meta-item"><Building2 size={12} /> {contract.rfq?.rfqNumber || '—'}</span>
                        <span className="vc-card__meta-item"><Calendar size={12} /> {formatDate(contract.effectiveDate)}</span>
                      </div>
                    </div>
                    <div className="vc-card__right">
                      <span className="vc-card__value">{formatCurrency(contract.contractValue, contract.currency)}</span>
                      <span className={`vc-status vc-status--${status}`}>
                        {STATUS_ICONS[status]} {STATUS_LABELS[status]}
                      </span>
                      <ChevronDown size={18} className={`vc-card__chevron ${isExpanded ? 'vc-card__chevron--open' : ''}`} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="vc-card__body">
                      <div className="vc-card__grid">
                        <div className="vc-card__section">
                          <div className="vc-card__section-title">Contract Details</div>
                          <div className="vc-card__row">
                            <span className="vc-card__row-label">Type</span>
                            <span className="vc-card__row-value">{contract.contractType?.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="vc-card__row">
                            <span className="vc-card__row-label">Value</span>
                            <span className="vc-card__row-value">{formatCurrency(contract.contractValue, contract.currency)}</span>
                          </div>
                          <div className="vc-card__row">
                            <span className="vc-card__row-label">Currency</span>
                            <span className="vc-card__row-value">{contract.currency || companyDefaultCurrency}</span>
                          </div>
                          <div className="vc-card__row">
                            <span className="vc-card__row-label">Priority</span>
                            <span className="vc-card__row-value">{contract.priority || 'Medium'}</span>
                          </div>
                        </div>
                        <div className="vc-card__section">
                          <div className="vc-card__section-title">Buyer Company</div>
                          <div className="vc-card__row">
                            <span className="vc-card__row-label">Contact</span>
                            <span className="vc-card__row-value">{contract.contractOwner?.fullName || '—'}</span>
                          </div>
                          <div className="vc-card__row">
                            <span className="vc-card__row-label">Source RFQ</span>
                            <span className="vc-card__row-value">{contract.rfq?.rfqNumber || '—'}</span>
                          </div>
                          {contract.rfq?.title && (
                            <div className="vc-card__row">
                              <span className="vc-card__row-label">RFQ Title</span>
                              <span className="vc-card__row-value">{contract.rfq.title}</span>
                            </div>
                          )}
                          <div className="vc-card__row">
                            <span className="vc-card__row-label">Payment Terms</span>
                            <span className="vc-card__row-value">{contract.paymentTerms || '—'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="vc-card__actions">
                        <button
                          className="vc-btn vc-btn--secondary"
                          onClick={() => handleDownload(contract)}
                        >
                          <Download size={15} /> Download
                        </button>
                        <button
                          className="vc-btn vc-btn--secondary"
                          onClick={() => handlePreview(contract)}
                        >
                          <Eye size={15} /> Preview
                        </button>
                        {(status === 'AWAITING_VENDOR_SIGNATURE' || status === 'PENDING_VENDOR_SIGNATURE' || status === 'AWAITING_CUSTOMER_SIGNATURE') && (
                          <button
                            className="vc-btn vc-btn--primary"
                            onClick={() => handleSign(contract.id)}
                          >
                            <FileSignature size={15} /> Sign Contract
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="vendor-empty-state">
            <div className="vendor-empty-state__icon">📄</div>
            <div className="vendor-empty-state__title">No Contracts Found</div>
            <div className="vendor-empty-state__text">
              {search
                ? 'Try adjusting your search.'
                : 'Contracts awarded to your company will appear here for review and signing.'}
            </div>
          </div>
        )}
      </div>

      {/* ── Document Preview Modal ── */}
      {previewContract && (
        <div className="vc-preview-backdrop" onClick={closePreview}>
          <div className="vc-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="vc-preview-modal__header">
              <div className="vc-preview-modal__title">
                <Eye size={18} />
                <div>
                  <span>{previewContract.contractNumber}</span>
                  <small>{previewContract.title}</small>
                </div>
              </div>
              <div className="vc-preview-modal__header-actions">
                <button className="vc-preview-btn" onClick={() => handleDownload(previewContract)} title="Download">
                  <Download size={16} />
                </button>
                <button className="vc-preview-btn" onClick={closePreview} title="Close">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="vc-preview-modal__body">
              {previewContract.contentSnapshot ? (
                <div className="vc-preview-doc" dangerouslySetInnerHTML={{ __html: previewContract.contentSnapshot }} />
              ) : (
                <div className="vc-preview-empty">
                  <FileText size={48} />
                  <p>No document content available for preview.</p>
                  <button
                    className="vc-btn vc-btn--primary"
                    onClick={() => navigate(`/vendor/contracts/${previewContract.id}`)}
                  >
                    <Maximize2 size={15} /> View Full Details
                  </button>
                </div>
              )}
            </div>
            <div className="vc-preview-modal__footer">
              <span className="vc-preview-modal__status">
                Status: <span className={`vc-status vc-status--${previewContract.status}`}>
                  {STATUS_ICONS[previewContract.status]} {STATUS_LABELS[previewContract.status]}
                </span>
              </span>
              {(previewContract.status === 'AWAITING_VENDOR_SIGNATURE' || previewContract.status === 'PENDING_VENDOR_SIGNATURE') && (
                <button
                  className="vc-btn vc-btn--primary"
                  onClick={() => { closePreview(); handleSign(previewContract.id); }}
                >
                  <FileSignature size={15} /> Sign This Contract
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
