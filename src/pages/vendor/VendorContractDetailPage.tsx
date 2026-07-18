import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { contractService, type Contract } from '../../services/contractService';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import {
  ChevronLeft, Download, FileSignature, CheckCircle2,
  Clock, AlertTriangle, Trash2, FileText, Maximize2, Minimize2,
} from 'lucide-react';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import './VendorContractDetailPage.css';

// ─── Component ──────────────────────────────────────────────

export default function VendorContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatAmount } = useCurrency();

  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullPreview, setFullPreview] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch contract
  const { data, loading, error: fetchError, reload } = useServiceData(
    () => contractService.getVendorContract(id!).then(r => r),
    null as { contract: Contract } | null,
    [id],
    { cacheKey: `vendor:contract:${id}`, cacheTtlMs: 30000 }
  );

  // Auto-open sign mode from query param
  useEffect(() => {
    if (searchParams.get('action') === 'sign' && data && !signed) {
      // Focus sign section
      setTimeout(() => {
        document.getElementById('vcd-sign-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, [searchParams, data, signed]);

  // Init canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [mode]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height),
      };
    }
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
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

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  const handleSign = useCallback(async () => {
    if (!signerName.trim()) { setError('Please enter your name.'); return; }
    const sig = getSignatureDataUrl();
    if (!sig) { setError('Please draw or upload your signature.'); return; }
    setError(null);
    setSigning(true);
    try {
      await contractService.signContractVendor(id!, signerName.trim(), signerTitle.trim(), sig);
      setPageMsg('Contract signed successfully! The contract is now active.');
      setSigned(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setSigning(false);
    }
  }, [id, signerName, signerTitle, reload]);

  const handleDownload = () => {
    if (!data) return;
    downloadContractAsPdf(
      data.contract.contentSnapshot,
      data.contract.contractNumber,
      data.contract.title,
    );
  };

  if (loading) return <div className="vcd-page"><div className="vcd-page__loading">Loading contract…</div></div>;
  if (fetchError) return (
    <div className="vcd-page">
      <button className="vcd-back" onClick={() => navigate('/vendor/contracts')}><ChevronLeft size={16} /> Back to Contracts</button>
      <div className="vcd-page__error">
        <div className="vcd-page__error-icon"><AlertTriangle size={48} /></div>
        <p style={{ fontWeight: 700, fontSize: 18 }}>Failed to load contract</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{fetchError}</p>
        <button className="vendor-btn vendor-btn--primary" onClick={reload} style={{ marginTop: 16 }}>Retry</button>
      </div>
    </div>
  );
  if (!data) return null;

  const contract = data.contract;
  const status = contract.status;
  const canSign = status === 'AWAITING_VENDOR_SIGNATURE' || status === 'PENDING_VENDOR_SIGNATURE';
  const isSigned = signed || ['VENDOR_SIGNED', 'COMPLETED', 'ACTIVE'].includes(status);
  const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="vcd-page">
      {pageMsg && (
        <MessageStrip type={inferMessageType(pageMsg)} onClose={() => setPageMsg(null)} autoHideMs={6000}>
          {pageMsg}
        </MessageStrip>
      )}

      {/* Back */}
      <button className="vcd-back" onClick={() => navigate('/vendor/contracts')}>
        <ChevronLeft size={16} /> Back to Contracts
      </button>

      {/* Summary */}
      <div className="vcd-summary">
        <div className="vcd-summary__top">
          <div>
            <h1 className="vcd-summary__title">{contract.title}</h1>
            <span className="vcd-summary__number">{contract.contractNumber}</span>
          </div>
          <span className={`vc-status vc-status--${status}`}>
            {isSigned ? <CheckCircle2 size={14} /> : canSign ? <Clock size={14} /> : <FileText size={14} />}
            {isSigned ? 'Vendor Signed' : canSign ? 'Awaiting Your Signature' : status === 'DRAFT' ? 'Draft' : status}
          </span>
        </div>
        <div className="vcd-summary__meta">
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Buyer</span>
            <span className="vcd-summary__item-value">{contract.contractOwner?.fullName || '—'}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Contract Value</span>
            <span className="vcd-summary__item-value">{formatAmount(contract.contractValue, contract.currency)}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Effective Date</span>
            <span className="vcd-summary__item-value">{formatDate(contract.effectiveDate)}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Expiration Date</span>
            <span className="vcd-summary__item-value">{formatDate(contract.expirationDate)}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Source RFQ</span>
            <span className="vcd-summary__item-value">{contract.rfq?.rfqNumber || '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-placeholder)', marginTop: 2, display: 'block' }}>
              {contract.rfq?.title || ''}
            </span>
          </div>
        </div>
      </div>

      {/* Document Preview */}
      <div className={`vcd-doc-preview ${fullPreview ? 'vcd-doc-preview--full' : ''}`}>
        <div className="vcd-doc-preview__toolbar">
          <div className="vcd-doc-preview__toolbar-left">
            <FileText size={15} />
            <span>Document Preview</span>
          </div>
          <button
            className="vcd-doc-preview__toggle"
            onClick={() => setFullPreview(!fullPreview)}
            title={fullPreview ? 'Collapse' : 'Expand'}
          >
            {fullPreview ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {fullPreview ? 'Collapse' : 'Full View'}
          </button>
        </div>
        <div className="vcd-doc-preview__body">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{contract.title}</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 13 }}>{contract.contractNumber}</p>
          </div>
          {contract.contentSnapshot ? (
            <div className="vcd-doc-content" dangerouslySetInnerHTML={{ __html: contract.contentSnapshot }} />
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 48 }}>
              The contract document will appear here.
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="vcd-actions">
        <button className="vcd-action-btn vcd-action-btn--secondary" onClick={handleDownload}>
          <Download size={15} /> Download
        </button>
        {canSign && (
          <button className="vcd-action-btn vcd-action-btn--primary" onClick={() => document.getElementById('vcd-sign-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <FileSignature size={15} /> Sign Now
          </button>
        )}
      </div>

      {/* Sign Section */}
      <div id="vcd-sign-section" className="vcd-sign-section">
        {isSigned ? (
          <div>
            <div className="vcd-status-badge vcd-status-badge--signed">
              <CheckCircle2 size={18} /> Contract Signed
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>
              You signed this contract on {formatDate(contract.signedByVendorAt)}. A fully executed copy is available for download.
            </p>
          </div>
        ) : canSign ? (
          <>
            <h3 className="vcd-sign-title"><FileSignature size={22} /> Sign This Contract</h3>
            <div className="vcd-sign-info">
              <p style={{ margin: '0 0 4px' }}>By signing, you agree to the terms and conditions of this contract.</p>
              <p style={{ margin: 0, fontSize: 12 }}>Contract: <strong>{contract.contractNumber}</strong></p>
            </div>

            <div className="vcd-form-field">
              <label>Full Name *</label>
              <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)}
                placeholder="Enter your full name" disabled={signing} />
            </div>

            <div className="vcd-form-field">
              <label>Title / Role</label>
              <input type="text" value={signerTitle} onChange={e => setSignerTitle(e.target.value)}
                placeholder="e.g. Managing Director" disabled={signing} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
              <button className={`vcd-canvas-btn ${mode === 'draw' ? 'vcd-canvas-btn--primary' : ''}`}
                onClick={() => { setMode('draw'); clearCanvas(); }} disabled={signing}>
                Draw Signature
              </button>
              <button className={`vcd-canvas-btn ${mode === 'upload' ? 'vcd-canvas-btn--primary' : ''}`}
                onClick={() => { setMode('upload'); clearCanvas(); fileInputRef.current?.click(); }} disabled={signing}>
                Upload Image
              </button>
            </div>

            {mode === 'draw' && (
              <div className="vcd-canvas-wrap">
                <canvas ref={canvasRef} className="vcd-canvas" width={400} height={120}
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
              </div>
            )}

            {mode === 'upload' && uploadedImage && (
              <div className="vcd-canvas-wrap" style={{ padding: 12 }}>
                <img src={uploadedImage} alt="Signature" style={{ maxHeight: 80, objectFit: 'contain' }} />
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />

            <div className="vcd-canvas-actions">
              {hasDrawn && (
                <button className="vcd-canvas-btn vcd-canvas-btn--danger" onClick={clearCanvas} disabled={signing}>
                  <Trash2 size={12} /> Clear
                </button>
              )}
              <button className="vcd-canvas-btn vcd-canvas-btn--primary" onClick={handleSign}
                disabled={signing || !signerName.trim() || !hasDrawn}>
                {signing ? <><Clock size={14} /> Signing…</> : <><FileSignature size={14} /> Sign Contract</>}
              </button>
            </div>

            {error && <MessageStrip type="error" compact style={{ marginTop: 12 }} onClose={() => setError(null)}>{error}</MessageStrip>}
          </>
        ) : (
          <div>
            <div className="vcd-status-badge vcd-status-badge--pending">
              <Clock size={18} /> Not Ready for Signature
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>
              This contract has not been sent for your signature yet. You will be notified when it is ready.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
