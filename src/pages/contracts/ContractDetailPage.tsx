import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { contractService, type Contract, type ContractItem, type ContractClause, type ContractSLAEntry, type ContractMilestone } from '../../services/contractService';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import {
  FileText, ArrowLeft, CheckCircle2, Clock, AlertTriangle, XCircle,
  FileSignature, Download, Printer, Plus, Eye, ChevronDown, ChevronRight,
  Check, X, Trash2, Calendar, IndianRupee, Building2, Users, Shield,
  PenLine, AlertCircle, Ban, FileSpreadsheet, Activity, Package,
  ChevronLeft, ChevronUp,
} from 'lucide-react';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import './ContractDetailPage.css';

// ─── Status helpers ──────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_VENDOR_SIGNATURE: 'Pending Vendor Signature',
  AWAITING_VENDOR_SIGNATURE: 'Pending Vendor Signature',
  AWAITING_CUSTOMER_SIGNATURE: 'Awaiting Your Signature',
  VENDOR_SIGNED: 'Vendor Signed',
  COMPLETED: 'Completed',
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring Soon',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  TERMINATED: 'Cancelled',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  DRAFT: <FileText size={14} />,
  PENDING_VENDOR_SIGNATURE: <Clock size={14} />,
  AWAITING_CUSTOMER_SIGNATURE: <Clock size={14} />,
  AWAITING_VENDOR_SIGNATURE: <Clock size={14} />,
  VENDOR_SIGNED: <CheckCircle2 size={14} />,
  COMPLETED: <CheckCircle2 size={14} />,
  ACTIVE: <CheckCircle2 size={14} />,
  EXPIRING_SOON: <AlertTriangle size={14} />,
  EXPIRED: <XCircle size={14} />,
  CANCELLED: <Ban size={14} />,
  TERMINATED: <Ban size={14} />,
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'ctr-badge--DRAFT',
  PENDING_VENDOR_SIGNATURE: 'ctr-badge--AWAITING_VENDOR_SIGNATURE',
  AWAITING_CUSTOMER_SIGNATURE: 'ctr-badge--AWAITING_CUSTOMER_SIGNATURE',
  AWAITING_VENDOR_SIGNATURE: 'ctr-badge--AWAITING_VENDOR_SIGNATURE',
  VENDOR_SIGNED: 'ctr-badge--ACTIVE',
  COMPLETED: 'ctr-badge--ACTIVE',
  ACTIVE: 'ctr-badge--ACTIVE',
  EXPIRING_SOON: 'ctr-badge--EXPIRING_SOON',
  EXPIRED: 'ctr-badge--EXPIRED',
  CANCELLED: 'ctr-badge--TERMINATED',
  TERMINATED: 'ctr-badge--TERMINATED',
};

// ─── Sign Modal ──────────────────────────────────────────────

function SignModal({
  contractNumber,
  signerLabel,
  onSign,
  onClose,
  signing,
}: {
  contractNumber: string;
  signerLabel: string;
  onSign: (signerName: string, signerTitle: string, signatureDataUrl: string) => Promise<void>;
  onClose: () => void;
  signing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width), y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height) };
    }
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    setHasDrawn(true);
    const ctx = canvasRef.current?.getContext('2d');
    const pos = getCanvasPos(e);
    if (ctx) { ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const pos = getCanvasPos(e);
    if (ctx) { ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
  };

  const stopDraw = () => { setIsDrawing(false); };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    setHasDrawn(false);
    setUploadedImage(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result as string);
      setHasDrawn(true);
    };
    reader.readAsDataURL(file);
  };

  const getSignatureDataUrl = (): string | null => {
    if (mode === 'upload' && uploadedImage) return uploadedImage;
    if (mode === 'draw') return canvasRef.current?.toDataURL('image/png') || null;
    return null;
  };

  const handleSign = async () => {
    if (!signerName.trim()) { setError('Please enter your name.'); return; }
    const sig = getSignatureDataUrl();
    if (!sig) { setError('Please draw or upload your signature.'); return; }
    setError(null);
    try {
      await onSign(signerName.trim(), signerTitle.trim(), sig);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
    }
  };

  return (
    <div className="ctr-modal-backdrop" onClick={() => !signing && onClose()}>
      <div className="ctr-sign-modal" onClick={e => e.stopPropagation()}>
        <div className="ctr-sign-modal__header">
          <span className="ctr-sign-modal__title"><FileSignature size={20} /> Sign Contract</span>
          <button className="ctr-modal__close" onClick={onClose} disabled={signing}><X size={18} /></button>
        </div>
        <div className="ctr-sign-modal__body">
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Signing as <strong>{signerLabel}</strong> for contract {contractNumber}
          </p>

          <div className="ctr-sign-modal__signer-field">
            <label>Full Name *</label>
            <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Enter your full name" disabled={signing} />
          </div>

          <div className="ctr-sign-modal__signer-field">
            <label>Title / Role</label>
            <input type="text" value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="e.g. Procurement Manager" disabled={signing} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <button className={`ctr-sign-modal__canvas-btn ${mode === 'draw' ? 'ctr-sign-modal__canvas-btn--primary' : ''}`} onClick={() => { setMode('draw'); clearCanvas(); }} disabled={signing}>Draw Signature</button>
            <button className={`ctr-sign-modal__canvas-btn ${mode === 'upload' ? 'ctr-sign-modal__canvas-btn--primary' : ''}`} onClick={() => { setMode('upload'); clearCanvas(); fileInputRef.current?.click(); }} disabled={signing}>Upload Image</button>
          </div>

          {mode === 'draw' && (
            <div className="ctr-sign-modal__canvas-wrap">
              <canvas
                ref={canvasRef}
                className="ctr-sign-modal__canvas"
                width={400} height={140}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
              />
            </div>
          )}

          {mode === 'upload' && uploadedImage && (
            <div className="ctr-sign-modal__canvas-wrap" style={{ padding: 12, textAlign: 'center' }}>
              <img src={uploadedImage} alt="Uploaded signature" style={{ maxHeight: 100, objectFit: 'contain' }} />
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />

          <div className="ctr-sign-modal__canvas-actions">
            {hasDrawn && (
              <button className="ctr-sign-modal__canvas-btn ctr-sign-modal__canvas-btn--danger" onClick={clearCanvas} disabled={signing}>
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          {error && <MessageStrip type="error" compact onClose={() => setError(null)}>{error}</MessageStrip>}
        </div>
        <div className="ctr-sign-modal__footer">
          <button className="ctr-modal__btn ctr-modal__btn--secondary" onClick={onClose} disabled={signing}>Cancel</button>
          <button className="ctr-modal__btn ctr-modal__btn--primary" onClick={handleSign} disabled={signing || !signerName.trim() || !hasDrawn}>
            {signing ? <><Clock size={14} /> Signing…</> : <><FileSignature size={14} /> Apply Signature</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatAmount, companyDefaultCurrency } = useCurrency();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [showSignModal, setShowSignModal] = useState(false);
  const [signing, setSigning] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [terminating, setTerminating] = useState(false);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [creatingPO, setCreatingPO] = useState(false);
  const [sendingToVendor, setSendingToVendor] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [clauseOpen, setClauseOpen] = useState<string | null>(null);

  useBodyScrollLock(showSignModal || showTerminateConfirm);

  // Fetch contract
  const { data, loading, error, reload } = useServiceData(
    () => contractService.getContract(id!).then(r => r),
    null as { contract: Contract; activity: unknown[] } | null,
    [id],
    { cacheKey: `contract:${id}`, cacheTtlMs: 30000 }
  );

  // Check if we should open sign modal from query param
  useEffect(() => {
    if (searchParams.get('action') === 'sign' && data && !showSignModal) {
      setShowSignModal(true);
    }
  }, [searchParams, data]);

  if (loading) return <div className="ctr-detail"><div className="ctr-detail__loading">Loading contract…</div></div>;
  if (error) return (
    <div className="ctr-detail">
      <button className="ctr-detail__back" onClick={() => navigate('/contracts')}><ChevronLeft size={16} /> Back to Contracts</button>
      <div className="ctr-detail__error">
        <div className="ctr-detail__error-icon"><AlertCircle size={48} /></div>
        <div className="ctr-detail__error-title">Failed to load contract</div>
        <div className="ctr-detail__error-desc">{error}</div>
        <button className="ctr-detail__action-btn" onClick={reload}>Retry</button>
      </div>
    </div>
  );
  if (!data) return null;

  const { contract, activity } = data;

  // ─── Computed values ─────────────────────────────────────

  const formatDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const pageTitle = `${contract.contractNumber} — ${contract.title}`;

  const canSign = contract.status === 'DRAFT' || contract.status === 'AWAITING_CUSTOMER_SIGNATURE';
  const canSendToVendor = contract.status === 'DRAFT';
  const canComplete = contract.status === 'VENDOR_SIGNED' || contract.status === 'ACTIVE';
  const canCreatePO = contract.status === 'VENDOR_SIGNED' || contract.status === 'COMPLETED' || contract.status === 'ACTIVE';
  const canTerminate = ['VENDOR_SIGNED', 'COMPLETED', 'ACTIVE', 'EXPIRING_SOON'].includes(contract.status);
  const canEdit = contract.status === 'DRAFT';

  // ─── Handlers ────────────────────────────────────────────

  const handleSign = useCallback(async (signerName: string, signerTitle: string, signatureDataUrl: string) => {
    if (!id) return;
    setSigning(true);
    try {
      const result = await contractService.signContractBuyer(id, signerName, signerTitle, signatureDataUrl);
      setPageMsg(`Contract signed successfully. Status: ${result.status}`);
      setShowSignModal(false);
      await reload();
    } finally {
      setSigning(false);
    }
  }, [id, reload]);

  const handleCreatePO = useCallback(async () => {
    if (!id) return;
    setCreatingPO(true);
    try {
      const result = await contractService.createPOFromContract(id);
      setPageMsg(`Purchase Order ${result.poNumber} created from contract.`);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to create PO');
    } finally {
      setCreatingPO(false);
    }
  }, [id, reload]);

  const handleSendToVendor = useCallback(async () => {
    if (!id) return;
    setSendingToVendor(true);
    try {
      const result = await contractService.sendToVendor(id);
      setPageMsg(`Contract sent to vendor by email and portal notification. Status: ${STATUS_LABELS[result.status] || result.status}`);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to send contract to vendor');
    } finally {
      setSendingToVendor(false);
    }
  }, [id, reload]);

  const handleCompleteContract = useCallback(async () => {
    if (!id) return;
    setCompleting(true);
    try {
      await contractService.completeContract(id);
      setPageMsg('Contract marked as completed.');
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to complete contract');
    } finally {
      setCompleting(false);
    }
  }, [id, reload]);

  const handleTerminate = useCallback(async () => {
    if (!id) return;
    setTerminating(true);
    try {
      await contractService.terminateContract(id, terminateReason || undefined);
      setPageMsg(`Contract ${contract.contractNumber} terminated.`);
      setShowTerminateConfirm(false);
      await reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to terminate');
    } finally {
      setTerminating(false);
    }
  }, [id, terminateReason, contract.contractNumber, reload]);

  const handleDownload = useCallback(() => {
    downloadContractAsPdf(
      contract.contentSnapshot,
      contract.contractNumber,
      contract.title,
    );
  }, [contract.contentSnapshot, contract.contractNumber, contract.title]);

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(contract.contentSnapshot || '<html><body><p>No content available</p></body></html>');
    win.document.close();
    win.print();
  };

  // ─── Render ──────────────────────────────────────────────

  const subTotal = (contract.items || []).reduce((s, i) => s + (i.totalValue || 0), 0);
  const totalTax = (contract.items || []).reduce((s, i) => s + (i.tax || 0), 0);
  const totalValue = contract.contractValue || subTotal + totalTax;

  const vendorSignature = contract.signedByVendorAt
    ? contract.documentSignatures?.[contract.documentSignatures.length - 1]?.signature?.dataUrl
    : null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <FileText size={13} /> },
    { id: 'items', label: 'Items & Pricing', icon: <Package size={13} />, count: contract.items?.length },
    { id: 'terms', label: 'Terms & Clauses', icon: <Shield size={13} />, count: (contract.clauses?.length || 0) + (contract.slaEntries?.length || 0) > 0 ? (contract.clauses?.length || 0) + (contract.slaEntries?.length || 0) : undefined },
    { id: 'signatures', label: 'Signatures', icon: <FileSignature size={13} /> },
    { id: 'documents', label: 'Documents', icon: <FileSpreadsheet size={13} /> },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: <Plus size={13} />, count: contract._count?.purchaseOrders || contract.purchaseOrders?.length || 0 },
    { id: 'activity', label: 'Activity', icon: <Activity size={13} /> },
  ];

  return (
    <div className="ctr-detail">
      {pageMsg && (
        <MessageStrip type={inferMessageType(pageMsg)} onClose={() => setPageMsg(null)} autoHideMs={5000}>
          {pageMsg}
        </MessageStrip>
      )}

      {/* Back button */}
      <button className="ctr-detail__back" onClick={() => navigate('/contracts')}>
        <ChevronLeft size={16} /> Back to Contracts
      </button>

      {/* Summary Bar */}
      <div className="ctr-detail__summary">
        <div className="ctr-detail__summary-top">
          <div className="ctr-detail__summary-left">
            <h1 className="ctr-detail__summary-title">{contract.title}</h1>
            <span className="ctr-detail__summary-number">{contract.contractNumber}</span>
          </div>
          <div className="ctr-detail__summary-right">
            <span className={`ctr-badge ${STATUS_CLASSES[contract.status] || 'ctr-badge--DRAFT'}`}>
              {STATUS_ICONS[contract.status]} {STATUS_LABELS[contract.status] || contract.status}
            </span>
            {canSendToVendor && (
              <button className="ctr-detail__action-btn ctr-detail__action-btn--primary" onClick={handleSendToVendor} disabled={sendingToVendor}>
                <FileSignature size={14} /> {sendingToVendor ? 'Sending…' : 'Send to Vendor'}
              </button>
            )}
            {canComplete && (
              <button className="ctr-detail__action-btn ctr-detail__action-btn--success" onClick={handleCompleteContract} disabled={completing}>
                <CheckCircle2 size={14} /> {completing ? 'Completing…' : 'Mark Completed'}
              </button>
            )}
            {canSign && (
              <button className="ctr-detail__action-btn ctr-detail__action-btn--success" onClick={() => setShowSignModal(true)}>
                <FileSignature size={14} /> Sign Now
              </button>
            )}
            <button className="ctr-detail__action-btn" onClick={handleDownload}>
              <Download size={14} /> {contract.signedByVendorAt ? 'Download Signed Copy' : 'Download'}
            </button>
            <button className="ctr-detail__action-btn" onClick={handlePrint}>
              <Printer size={14} /> Print
            </button>
            {canEdit && (
              <button className="ctr-detail__action-btn" onClick={() => navigate(`/contracts/${id}/edit`)}>
                <PenLine size={14} /> Edit
              </button>
            )}
          </div>
        </div>
        <div className="ctr-detail__summary-meta">
          <div className="ctr-detail__summary-item">
            <span className="ctr-detail__summary-item-label">Supplier</span>
            <span className="ctr-detail__summary-item-value">{contract.vendor?.name || '—'}</span>
          </div>
          <div className="ctr-detail__summary-item">
            <span className="ctr-detail__summary-item-label">Contract Value</span>
            <span className="ctr-detail__summary-item-value">{formatAmount(contract.contractValue, contract.currency || companyDefaultCurrency)}</span>
          </div>
          <div className="ctr-detail__summary-item">
            <span className="ctr-detail__summary-item-label">Start Date</span>
            <span className="ctr-detail__summary-item-value">{formatDate(contract.effectiveDate)}</span>
          </div>
          <div className="ctr-detail__summary-item">
            <span className="ctr-detail__summary-item-label">End Date</span>
            <span className="ctr-detail__summary-item-value">{formatDate(contract.expirationDate)}</span>
          </div>
          <div className="ctr-detail__summary-item">
            <span className="ctr-detail__summary-item-label">Source RFQ</span>
            <span className="ctr-detail__summary-item-value">{contract.rfq?.rfqNumber || '—'}</span>
          </div>
          <div className="ctr-detail__summary-item">
            <span className="ctr-detail__summary-item-label">Owner</span>
            <span className="ctr-detail__summary-item-value">{contract.contractOwner?.fullName || '—'}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="ctr-detail__tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`ctr-detail__tab ${activeTab === tab.id ? 'ctr-detail__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ctr-detail__tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="ctr-detail__content">
        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="ctr-detail__overview-grid">
            <div className="ctr-detail__overview-section">
              <h3 className="ctr-detail__section-title">Contract Information</h3>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Title</span><span className="ctr-detail__field-value">{contract.title}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Type</span><span className="ctr-detail__field-value">{contract.contractType?.replace(/_/g, ' ')}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Number</span><span className="ctr-detail__field-value">{contract.contractNumber}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Status</span><span className="ctr-detail__field-value">{STATUS_LABELS[contract.status] || contract.status}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Priority</span><span className="ctr-detail__field-value">{contract.priority || 'Medium'}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Department</span><span className="ctr-detail__field-value">{contract.department || '—'}</span></div>
              {contract.autoRenewal && (
                <div className="ctr-detail__field"><span className="ctr-detail__field-label">Auto Renewal</span><span className="ctr-detail__field-value">Yes — {contract.renewalPeriod || ''}</span></div>
              )}
            </div>

            <div className="ctr-detail__overview-section">
              <h3 className="ctr-detail__section-title">Supplier & RFQ</h3>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Supplier</span><span className="ctr-detail__field-value">{contract.vendor?.name || '—'}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Email</span><span className="ctr-detail__field-value">{contract.vendor?.email || '—'}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Source RFQ</span><span className="ctr-detail__field-value">{contract.rfq?.rfqNumber || '—'}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">RFQ Title</span><span className="ctr-detail__field-value">{contract.rfq?.title || '—'}</span></div>
            </div>

            <div className="ctr-detail__overview-section">
              <h3 className="ctr-detail__section-title">Commercial Terms</h3>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Contract Value</span><span className="ctr-detail__field-value">{formatAmount(contract.contractValue, contract.currency || companyDefaultCurrency)}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Currency</span><span className="ctr-detail__field-value">{contract.currency || companyDefaultCurrency}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Payment Terms</span><span className="ctr-detail__field-value">{contract.paymentTerms || '—'}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Delivery Terms</span><span className="ctr-detail__field-value">{contract.deliveryTerms || '—'}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Tax / VAT</span><span className="ctr-detail__field-value">{contract.taxPercentage ? `${contract.taxPercentage}%` : '—'}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Lead Time</span><span className="ctr-detail__field-value">{contract.leadTime || '—'}</span></div>
            </div>

            <div className="ctr-detail__overview-section">
              <h3 className="ctr-detail__section-title">Important Dates</h3>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Effective Date</span><span className="ctr-detail__field-value">{formatDate(contract.effectiveDate)}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Expiration Date</span><span className="ctr-detail__field-value">{formatDate(contract.expirationDate)}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Created</span><span className="ctr-detail__field-value">{formatDate(contract.createdAt)}</span></div>
              <div className="ctr-detail__field"><span className="ctr-detail__field-label">Last Updated</span><span className="ctr-detail__field-value">{formatDate(contract.updatedAt)}</span></div>
              {contract.signedByCustomerAt && <div className="ctr-detail__field"><span className="ctr-detail__field-label">Signed (Buyer)</span><span className="ctr-detail__field-value">{formatDate(contract.signedByCustomerAt)}</span></div>}
              {contract.signedByVendorAt && <div className="ctr-detail__field"><span className="ctr-detail__field-label">Signed (Vendor)</span><span className="ctr-detail__field-value">{formatDate(contract.signedByVendorAt)}</span></div>}
            </div>

            {/* Milestones */}
            {contract.milestones && contract.milestones.length > 0 && (
              <div className="ctr-detail__overview-section ctr-detail__overview-section--full">
                <h3 className="ctr-detail__section-title">Payment Milestones</h3>
                <div className="ctr-detail__milestones">
                  {contract.milestones.map((m, i) => (
                    <div key={i} className="ctr-detail__milestone">
                      <div className="ctr-detail__milestone-info">
                        <div className="ctr-detail__milestone-name">{m.name}</div>
                        {m.description && <div className="ctr-detail__milestone-desc">{m.description}</div>}
                      </div>
                      {m.dueDate && <div className="ctr-detail__milestone-due"><Calendar size={11} /> {formatDate(m.dueDate)}</div>}
                      <div className="ctr-detail__milestone-bar">
                        <div className="ctr-detail__milestone-fill" style={{ width: `${m.paymentPercent}%` }} />
                      </div>
                      <span className="ctr-detail__milestone-pct">{m.paymentPercent}%</span>
                      <span className="ctr-detail__field-value">{formatAmount(m.paymentAmount, contract.currency || companyDefaultCurrency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ITEMS & PRICING ── */}
        {activeTab === 'items' && (
          <div>
            {(contract.items && contract.items.length > 0) ? (
              <>
                <table className="ctr-detail__items-table">
                  <colgroup>
                    <col style={{ width: '40px' }} />
                    <col />
                    <col style={{ width: '100px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '130px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item / Service</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Unit Price</th>
                      <th>Tax</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contract.items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', color: 'var(--text-placeholder)' }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.itemName}</div>
                          {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.description}</div>}
                        </td>
                        <td>{item.quantity}</td>
                        <td>{item.unit || '—'}</td>
                        <td>{formatAmount(item.unitPrice, contract.currency || companyDefaultCurrency)}</td>
                        <td>{item.tax ? formatAmount(item.tax, contract.currency || companyDefaultCurrency) : '—'}</td>
                        <td style={{ fontWeight: 700 }}>{formatAmount(item.totalValue, contract.currency || companyDefaultCurrency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="ctr-detail__items-total">
                  <div className="ctr-detail__items-total-item">
                    <span className="ctr-detail__items-total-label">Subtotal</span>
                    <span className="ctr-detail__items-total-value">{formatAmount(subTotal, contract.currency || companyDefaultCurrency)}</span>
                  </div>
                  <div className="ctr-detail__items-total-item">
                    <span className="ctr-detail__items-total-label">Tax</span>
                    <span className="ctr-detail__items-total-value">{formatAmount(totalTax, contract.currency || companyDefaultCurrency)}</span>
                  </div>
                  <div className="ctr-detail__items-total-item">
                    <span className="ctr-detail__items-total-label">Total Contract Value</span>
                    <span className="ctr-detail__items-total-value" style={{ color: 'var(--primary-500)', fontSize: 18 }}>{formatAmount(totalValue, contract.currency || companyDefaultCurrency)}</span>
                  </div>
                </div>

                {/* Commitments */}
                {contract.items.some(i => i.minOrderQty != null || i.maxOrderQty != null || i.committedQty != null) && (
                  <div className="ctr-detail__commitments">
                    <h3 className="ctr-detail__section-title" style={{ gridColumn: '1 / -1', marginBottom: 8 }}>Commitments</h3>
                    {contract.items.filter(i => i.minOrderQty != null || i.maxOrderQty != null || i.committedQty != null).map((item, idx) => (
                      <div key={idx} className="ctr-detail__commitment">
                        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{item.itemName}</div>
                        {item.minOrderQty != null && <div><span className="ctr-detail__commitment-label">Min Qty: </span><span className="ctr-detail__commitment-value">{item.minOrderQty}</span></div>}
                        {item.maxOrderQty != null && <div><span className="ctr-detail__commitment-label">Max Qty: </span><span className="ctr-detail__commitment-value">{item.maxOrderQty}</span></div>}
                        {item.committedQty != null && <div><span className="ctr-detail__commitment-label">Committed: </span><span className="ctr-detail__commitment-value">{item.committedQty}</span></div>}
                        {item.flexibleQtyPct != null && <div><span className="ctr-detail__commitment-label">Flexible: </span><span className="ctr-detail__commitment-value">±{item.flexibleQtyPct}%</span></div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ctr-detail__po-empty">
                <div className="ctr-detail__po-empty-icon"><Package size={36} /></div>
                <p style={{ fontWeight: 600 }}>No items found</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No contracted items are associated with this contract.</p>
              </div>
            )}
          </div>
        )}

        {/* ── TERMS & CLAUSES ── */}
        {activeTab === 'terms' && (
          <div>
            {/* Commercial Terms */}
            <div className="ctr-detail__terms-grid">
              <div className="ctr-detail__terms-card">
                <h4 className="ctr-detail__terms-card-title"><IndianRupee size={14} /> Payment Terms</h4>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Payment Terms</span><span className="ctr-detail__terms-value">{contract.paymentTerms || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Payment Schedule</span><span className="ctr-detail__terms-value">{contract.paymentSchedule || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Advance Payment</span><span className="ctr-detail__terms-value">{contract.advancePaymentPercent ? `${contract.advancePaymentPercent}%` : '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Retention</span><span className="ctr-detail__terms-value">{contract.retentionPercentage ? `${contract.retentionPercentage}%` : '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Price Adjustment</span><span className="ctr-detail__terms-value">{contract.priceAdjustmentAllowed ? 'Allowed' : 'Not Allowed'}</span></div>
              </div>

              <div className="ctr-detail__terms-card">
                <h4 className="ctr-detail__terms-card-title"><Package size={14} /> Delivery</h4>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Delivery Terms</span><span className="ctr-detail__terms-value">{contract.deliveryTerms || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Delivery Location</span><span className="ctr-detail__terms-value">{contract.deliveryLocation || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Lead Time</span><span className="ctr-detail__terms-value">{contract.leadTime || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Freight Terms</span><span className="ctr-detail__terms-value">{contract.freightTerms || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Inspection Required</span><span className="ctr-detail__terms-value">{contract.inspectionRequired ? 'Yes' : 'No'}</span></div>
              </div>

              <div className="ctr-detail__terms-card">
                <h4 className="ctr-detail__terms-card-title"><AlertTriangle size={14} /> Penalties & Liability</h4>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Late Delivery</span><span className="ctr-detail__terms-value">{contract.lateDeliveryPenalty || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Quality Failure</span><span className="ctr-detail__terms-value">{contract.qualityFailurePenalty || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">SLA Breach</span><span className="ctr-detail__terms-value">{contract.slaBreachPenalty || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Max Penalty Cap</span><span className="ctr-detail__terms-value">{contract.maxPenaltyCap || '—'}</span></div>
              </div>

              <div className="ctr-detail__terms-card">
                <h4 className="ctr-detail__terms-card-title"><Shield size={14} /> Warranty & Support</h4>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Warranty Period</span><span className="ctr-detail__terms-value">{contract.warrantyPeriod || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Support Period</span><span className="ctr-detail__terms-value">{contract.supportPeriod || '—'}</span></div>
                <div className="ctr-detail__terms-row"><span className="ctr-detail__terms-label">Response Time</span><span className="ctr-detail__terms-value">{contract.supportResponseTime || '—'}</span></div>
              </div>

              <div className="ctr-detail__terms-card ctr-detail__terms-card--full">
                <h4 className="ctr-detail__terms-card-title"><CheckCircle2 size={14} /> SLA / Service Levels</h4>
                {contract.slaEntries && contract.slaEntries.length > 0 ? (
                  <table className="ctr-detail__sla-table">
                    <thead>
                      <tr>
                        <th>SLA Name</th>
                        <th>Target</th>
                        <th>Measurement</th>
                        <th>Review Frequency</th>
                        <th>Penalty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.slaEntries.map((sla, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{sla.slaName}</td>
                          <td>{sla.target || '—'}</td>
                          <td>{sla.measurementMethod || '—'}</td>
                          <td>{sla.reviewFrequency || '—'}</td>
                          <td>{sla.penaltyForBreach || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>No SLA entries defined.</p>
                )}
              </div>

              <div className="ctr-detail__terms-card ctr-detail__terms-card--full">
                <h4 className="ctr-detail__terms-card-title"><CheckCircle2 size={14} /> Compliance & Legal</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 13 }}>
                  {[
                    { label: 'Confidentiality', val: contract.confidentiality },
                    { label: 'Data Protection', val: contract.dataProtection },
                    { label: 'Anti-Bribery', val: contract.antiBriberyCompliance },
                    { label: 'Regulatory Compliance', val: contract.regulatoryCompliance },
                    { label: 'Insurance Required', val: contract.insuranceRequired },
                    { label: 'Audit Rights', val: contract.auditRights },
                    { label: 'Arbitration', val: contract.arbitrationRequired },
                    { label: 'Termination (Convenience)', val: contract.terminationConvenience },
                    { label: 'Termination (Breach)', val: contract.terminationBreach },
                  ].map(item => (
                    <div key={item.label} className={item.val ? 'ctr-detail__terms-check' : 'ctr-detail__terms-cross'}>
                      {item.val ? <Check size={12} /> : <X size={12} />} {item.label}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 13, display: 'flex', gap: 24 }}>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Governing Law: </span><strong>{contract.governingLaw || '—'}</strong></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Jurisdiction: </span><strong>{contract.jurisdiction || '—'}</strong></div>
                  {contract.arbitrationLocation && <div><span style={{ color: 'var(--text-secondary)' }}>Arbitration Location: </span><strong>{contract.arbitrationLocation}</strong></div>}
                </div>
              </div>
            </div>

            {/* Clauses */}
            {contract.clauses && contract.clauses.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 className="ctr-detail__section-title" style={{ marginBottom: 12 }}>Contract Clauses</h3>
                {contract.clauses.map((clause, idx) => (
                  <div key={idx} className="ctr-detail__clause">
                    <div className="ctr-detail__clause-header" onClick={() => setClauseOpen(clauseOpen === clause.title ? null : clause.title)}>
                      <div>
                        <span className="ctr-detail__clause-category">{clause.category}</span>
                        <div style={{ fontSize: 14 }}>{clause.title}</div>
                      </div>
                      {clauseOpen === clause.title ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                    {clauseOpen === clause.title && (
                      <div className="ctr-detail__clause-content">{clause.contentSnapshot || 'No content'}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SIGNATURES ── */}
        {activeTab === 'signatures' && (
          <div className="ctr-detail__sig-grid">
            <div className="ctr-detail__sig-card">
              <div className="ctr-detail__sig-label">Buyer (Customer)</div>
              <div className="ctr-detail__sig-name">{contract.contractOwner?.fullName || '—'}</div>
              <div className="ctr-detail__sig-role">{contract.contractOwner?.email || ''}</div>
              <div className={`ctr-detail__sig-status ${contract.signedByCustomerAt ? 'ctr-detail__sig-status--signed' : 'ctr-detail__sig-status--pending'}`}>
                {contract.signedByCustomerAt ? <><Check size={12} /> Signed {formatDate(contract.signedByCustomerAt)}</> : <><Clock size={12} /> Awaiting Signature</>}
              </div>
              {contract.documentSignatures && contract.documentSignatures.length > 0 && contract.documentSignatures[0]?.signature?.dataUrl && (
                <img src={contract.documentSignatures[0].signature.dataUrl} alt="Buyer signature" className="ctr-detail__sig-image" />
              )}
            </div>
            <div className="ctr-detail__sig-card">
              <div className="ctr-detail__sig-label">Supplier</div>
              <div className="ctr-detail__sig-name">{contract.vendor?.name || '—'}</div>
              <div className="ctr-detail__sig-role">{contract.vendor?.email || ''}</div>
              <div className={`ctr-detail__sig-status ${contract.signedByVendorAt ? 'ctr-detail__sig-status--signed' : 'ctr-detail__sig-status--pending'}`}>
                {contract.signedByVendorAt ? <><Check size={12} /> Signed {formatDate(contract.signedByVendorAt)}</> : <><Clock size={12} /> Awaiting Signature</>}
              </div>
              {vendorSignature && (
                <img src={vendorSignature} alt="Vendor signature" className="ctr-detail__sig-image" />
              )}
            </div>
            {canSign && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: 16 }}>
                <button className="ctr-detail__action-btn ctr-detail__action-btn--success" onClick={() => setShowSignModal(true)}>
                  <FileSignature size={14} /> Sign Contract
                </button>
              </div>
            )}
            {canCreatePO && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
                <button className="ctr-detail__action-btn ctr-detail__action-btn--primary" onClick={handleCreatePO} disabled={creatingPO}>
                  <Plus size={14} /> {creatingPO ? 'Creating PO…' : 'Create Purchase Order'}
                </button>
                {canTerminate && (
                  <button className="ctr-detail__action-btn ctr-detail__action-btn--danger" onClick={() => setShowTerminateConfirm(true)}>
                    <Ban size={14} /> Terminate Contract
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {activeTab === 'documents' && (
          <div>
            <div className="ctr-detail__doc-preview">
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{contract.title}</h2>
                <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 13 }}>{contract.contractNumber}</p>
              </div>
              {contract.contentSnapshot ? (
                <div dangerouslySetInnerHTML={{ __html: contract.contentSnapshot }} />
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>
                  No generated document content available. The contract document will appear here after generation.
                </p>
              )}
            </div>
            <div className="ctr-detail__doc-actions">
              <button className="ctr-detail__action-btn" onClick={handleDownload}>
                <Download size={14} /> {contract.signedByVendorAt ? 'Download Signed Copy' : 'Download Unsigned Copy'}
              </button>
              {canSign && (
                <button className="ctr-detail__action-btn ctr-detail__action-btn--success" onClick={() => setShowSignModal(true)}>
                  <FileSignature size={14} /> Sign Digitally
                </button>
              )}
              <button className="ctr-detail__action-btn" onClick={handlePrint}><Printer size={14} /> Print</button>
            </div>
          </div>
        )}

        {/* ── PURCHASE ORDERS ── */}
        {activeTab === 'purchase-orders' && (
          <div>
            {contract.purchaseOrders && contract.purchaseOrders.length > 0 ? (
              <>
                <table className="ctr-detail__po-table">
                  <colgroup>
                    <col style={{ width: '160px' }} />
                    <col style={{ width: '130px' }} />
                    <col style={{ width: '140px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '100px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>PO Number</th>
                      <th>Created Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contract.purchaseOrders.map((po) => (
                      <tr key={po.id}>
                        <td className="ctr-detail__po-number">{po.poNumber}</td>
                        <td>{formatDate(po.createdAt)}</td>
                        <td style={{ fontWeight: 700 }}>{formatAmount(po.totalAmount, contract.currency || companyDefaultCurrency)}</td>
                        <td><span className="ctr-badge ctr-badge--ACTIVE">{po.status}</span></td>
                        <td>
                          <button className="ctr-table__action-btn" title="View PO" onClick={() => navigate(`/accounts-payable?po=${po.id}`)}>
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 16 }}>
                  <button className="ctr-detail__action-btn ctr-detail__action-btn--primary" onClick={handleCreatePO} disabled={creatingPO}>
                    <Plus size={14} /> {creatingPO ? 'Creating PO…' : 'Create Another Purchase Order'}
                  </button>
                </div>
              </>
            ) : (
              <div className="ctr-detail__po-empty">
                <div className="ctr-detail__po-empty-icon"><Package size={36} /></div>
                <p style={{ fontWeight: 600 }}>No Purchase Orders Yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Purchase orders linked to this contract will appear here.
                </p>
                {canCreatePO && (
                  <button className="ctr-detail__action-btn ctr-detail__action-btn--primary" onClick={handleCreatePO} disabled={creatingPO}>
                    <Plus size={14} /> {creatingPO ? 'Creating PO…' : 'Create Purchase Order'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY ── */}
        {activeTab === 'activity' && (
          <div className="ctr-detail__activity">
            {activity && (activity.length > 0) ? (
              (activity as Array<{ type?: string; action: string; description?: string; timestamp?: string; createdAt?: string }>).map((a, idx) => (
                <div key={idx} className="ctr-detail__activity-item">
                  <div className="ctr-detail__activity-icon"><Activity size={16} /></div>
                  <div className="ctr-detail__activity-content">
                    <div className="ctr-detail__activity-text">{a.action || a.description || 'Activity entry'}</div>
                    <div className="ctr-detail__activity-time">{formatDate(a.timestamp || a.createdAt || '')}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="ctr-detail__po-empty">
                <div className="ctr-detail__po-empty-icon"><Activity size={36} /></div>
                <p style={{ fontWeight: 600 }}>No activity recorded</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Activities and changes to this contract will be logged here.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sign Modal */}
      {showSignModal && (
        <SignModal
          contractNumber={contract.contractNumber}
          signerLabel="Buyer / Customer"
          onSign={handleSign}
          onClose={() => setShowSignModal(false)}
          signing={signing}
        />
      )}

      {/* Terminate Confirm Modal */}
      {showTerminateConfirm && (
        <div className="ctr-modal-backdrop" onClick={() => !terminating && setShowTerminateConfirm(false)}>
          <div className="ctr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="ctr-modal__header">
              <span className="ctr-modal__title"><Ban size={20} /> Terminate Contract</span>
              <button className="ctr-modal__close" onClick={() => setShowTerminateConfirm(false)} disabled={terminating}><X size={18} /></button>
            </div>
            <div className="ctr-modal__body">
              <p style={{ margin: 0, fontSize: 14 }}>
                Are you sure you want to terminate <strong>{contract.contractNumber}</strong>?
              </p>
              <div className="ctr-sign-modal__signer-field">
                <label>Reason for termination (optional)</label>
                <input
                  type="text"
                  value={terminateReason}
                  onChange={e => setTerminateReason(e.target.value)}
                  placeholder="e.g. Contract completed, mutual agreement"
                  disabled={terminating}
                />
              </div>
            </div>
            <div className="ctr-modal__footer">
              <button className="ctr-modal__btn ctr-modal__btn--secondary" onClick={() => setShowTerminateConfirm(false)} disabled={terminating}>Cancel</button>
              <button className="ctr-modal__btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleTerminate} disabled={terminating}>
                {terminating ? 'Terminating…' : 'Terminate Contract'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
