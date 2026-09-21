import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useAuth } from '../../context/AuthContext';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { PageFrame, PageLead } from '../../components/ui/product';
import {
  PenLine,
  Home,
  Eraser,
  Save,
  Upload,
  Download,
  Undo2,
  CheckCircle2,
  X,
  FileImage,
  Trash2,
  Eye,
  Star,
  FileSignature,
  FileText,
  ShoppingCart,
  Receipt,
  ClipboardList,
} from 'lucide-react';
import { signatureService } from '../../services/signatureService';
import type { SavedSignature, DocumentSignatureRecord } from '../../services/signatureService';
import './SignaturePage.css';

// ─── Color Palette ──────────────────────────────────────────

const PEN_COLORS = [
  { name: 'Black', value: '#1a1a2e' },
  { name: 'Navy', value: '#0a6ed1' },
  { name: 'White', value: '#ffffff' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#059669' },
];

const PEN_SIZES = [1, 2, 3, 4, 6];

const DOC_MODULES = [
  { key: 'PURCHASE_ORDER', label: 'Purchase Order', icon: ShoppingCart, prefix: 'PO-' },
  { key: 'INVOICE', label: 'Invoice', icon: Receipt, prefix: 'INV-' },
  { key: 'QUOTATION', label: 'Quotation', icon: ClipboardList, prefix: 'QTN-' },
  { key: 'RFQ', label: 'RFQ', icon: FileText, prefix: 'RFQ-' },
];

// ─── Component ──────────────────────────────────────────────

export default function SignaturePage() {
  const navigate = useNavigate();
  const { hasPermission, roles, permissions } = useAuth();
  const hasPermissionsMap = Boolean(permissions && Object.keys(permissions).length > 0);

  const canCreateSignature = hasPermissionsMap
    ? (hasPermission('Signature', 'canCreate') || hasPermission('Digital Signatures', 'canCreate') || hasPermission('Signatures', 'canCreate'))
    : roles.some((r) =>
      ['Super Admin', 'Administrator', 'admin', 'Procurement Manager', 'Purchase Manager', 'purchase_manager', 'procurement_manager', 'purchase_clerk', 'Purchase Clerk', 'Manager'].includes(r)
    );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#1a1a2e');
  const [penSize, setPenSize] = useState(3);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Service-backed state
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [signedDocs, setSignedDocs] = useState<DocumentSignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [saveSuccess, setSaveSuccess] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewSig, setPreviewSig] = useState<SavedSignature | null>(null);
  useBodyScrollLock(!!previewSig);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [activeRightTab, setActiveRightTab] = useState<'signatures' | 'history'>('signatures');

  // Sign document form state
  const [showSignPanel, setShowSignPanel] = useState(false);
  const [signModule, setSignModule] = useState('PURCHASE_ORDER');
  const [signRefId, setSignRefId] = useState('');
  const [signComment, setSignComment] = useState('');
  const [signSigId, setSignSigId] = useState<string | number>('');
  const [signing, setSigning] = useState(false);

  // ── Load saved signatures on mount ────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const sigs = await signatureService.list();
        setSavedSignatures(sigs);
        if (sigs.length > 0) {
          const defaultSig = sigs.find(s => s.isDefault) || sigs[0];
          setSignSigId(defaultSig.id);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Setup & Resize Canvas ─────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    initCanvas();
    const handleResize = () => {
      initCanvas();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initCanvas]);

  // ── Save canvas state for undo ────────────────────────────
  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev.slice(-19), imageData]);
  }, []);

  // ── Drawing handlers ──────────────────────────────────────
  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    const mouseEv = e as React.MouseEvent<HTMLCanvasElement>;
    return { x: mouseEv.clientX - rect.left, y: mouseEv.clientY - rect.top };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    saveState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    setIsDrawing(true);
    setHasDrawn(true);
  }, [getPos, penColor, penSize, saveState]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDrawing = useCallback(() => setIsDrawing(false), []);

  // ── Clear canvas ──────────────────────────────────────────
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveState();
    const rect = container.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    setUploadedImage(null);
  }, [saveState]);

  // ── Undo ──────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory(h => h.slice(0, -1));
  }, [history]);

  // ── Flash messages ────────────────────────────────────────
  const flashSuccess = (msg: string) => {
    setSaveSuccess(msg);
    setErrorMsg('');
    setTimeout(() => setSaveSuccess(''), 3000);
  };

  const flashError = (msg: string) => {
    setErrorMsg(msg);
    setSaveSuccess('');
    setTimeout(() => setErrorMsg(''), 4000);
  };

  // ── Save signature via service ────────────────────────────
  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    try {
      const sig = await signatureService.create({
        name: `Signature ${savedSignatures.length + 1}`,
        dataUrl,
        type: uploadedImage ? 'uploaded' : 'drawn',
      });
      setSavedSignatures(prev => [sig, ...prev]);
      if (!signSigId) setSignSigId(sig.id);
      flashSuccess('Signature saved successfully!');
    } catch (err: unknown) {
      flashError((err as Error).message || 'Failed to save signature');
    }
  }, [savedSignatures, uploadedImage, signSigId]);

  // ── Download signature ────────────────────────────────────
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `signature-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  // ── Upload image ──────────────────────────────────────────
  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const container = canvasContainerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        saveState();
        const rect = container.getBoundingClientRect();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        const scale = Math.min(rect.width / img.width, rect.height / img.height) * 0.85;
        const x = (rect.width - img.width * scale) / 2;
        const y = (rect.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        setHasDrawn(true);
        setUploadedImage(ev.target?.result as string);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [saveState]);

  // ── Delete saved signature via service ────────────────────
  const handleDeleteSaved = useCallback(async (id: string | number) => {
    try {
      await signatureService.delete(id);
      setSavedSignatures(prev => prev.filter(s => s.id !== id));
      flashSuccess('Signature deleted');
    } catch {
      flashError('Failed to delete signature');
    }
  }, []);

  // ── Set default signature ─────────────────────────────────
  const handleSetDefault = useCallback(async (id: string | number) => {
    try {
      await signatureService.setDefault(id);
      setSavedSignatures(prev => prev.map(s => ({ ...s, isDefault: s.id === id })));
      flashSuccess('Default signature updated');
    } catch {
      flashError('Failed to set default signature');
    }
  }, []);

  // ── Sign document ─────────────────────────────────────────
  const handleSignDocument = useCallback(async () => {
    if (!signSigId || !signRefId.trim()) {
      flashError('Select a signature and enter a document reference');
      return;
    }
    setSigning(true);
    try {
      const record = await signatureService.signDocument({
        signatureId: String(signSigId),
        module: signModule,
        referenceId: signRefId,
        comments: signComment.trim() || undefined,
      });
      setSignedDocs(prev => [record, ...prev]);
      flashSuccess(`Document #${signRefId} signed successfully!`);
      setSignRefId('');
      setSignComment('');
      setShowSignPanel(false);
      setActiveRightTab('history');
    } catch (err: unknown) {
      flashError((err as Error).message || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  }, [signSigId, signModule, signRefId, signComment]);

  return (
    <PageFrame className="sig-page">
      {/* Messages */}
      {saveSuccess && (
        <MessageStrip type="success" compact onClose={() => setSaveSuccess('')} autoHideMs={3000}>
          {saveSuccess}
        </MessageStrip>
      )}
      {errorMsg && (
        <MessageStrip type="error" compact onClose={() => setErrorMsg('')} autoHideMs={4000}>
          {errorMsg}
        </MessageStrip>
      )}

      {/* RFQ Style Title Header */}
      <PageLead
        title="E-Signature"
        description=""
        actions={
          savedSignatures.length > 0 ? (
            <Button
              onClick={() => setShowSignPanel(true)}
            >
              <FileSignature className="size-4 mr-1.5" /> Sign Document
            </Button>
          ) : undefined
        }
      />

      {/* Main Grid Content - Non-Scrollable Layout */}
      <div className="sig-grid">
        {/* Left Column: Capture Signature Card (Major Portion) */}
        <div className="sig-left-col">
          <div className="sig-capture-card">
            <div className="sig-capture-card__header">
              <div className="sig-capture-card__header-title">
                <div className="sig-capture-card__icon">
                  <PenLine size={18} />
                </div>
                <div>
                  <h2>Capture Signature</h2>
                  <span className="sig-capture-card__subtitle">Draw on canvas or upload an image signature</span>
                </div>
              </div>

              {/* Toolbar in Header */}
              <div className="sig-pen-tools" style={!canCreateSignature ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
                <div className="sig-pen-tools__colors">
                  {PEN_COLORS.map(c => (
                    <button
                      key={c.value}
                      disabled={!canCreateSignature}
                      className={`sig-color-dot ${penColor === c.value ? 'sig-color-dot--active' : ''}`}
                      style={{ '--dot-color': c.value, cursor: canCreateSignature ? 'pointer' : 'not-allowed' } as React.CSSProperties}
                      onClick={() => canCreateSignature && setPenColor(c.value)}
                      title={c.name}
                    />
                  ))}
                </div>

                <div className="sig-pen-tools__divider" />

                <div className="sig-pen-tools__size">
                  <span className="sig-pen-tools__size-label">Stroke</span>
                  <div className="sig-pen-tools__size-btns">
                    {PEN_SIZES.map(s => (
                      <button
                        key={s}
                        disabled={!canCreateSignature}
                        className={`sig-size-btn ${penSize === s ? 'sig-size-btn--active' : ''}`}
                        style={{ cursor: canCreateSignature ? 'pointer' : 'not-allowed' }}
                        onClick={() => canCreateSignature && setPenSize(s)}
                        title={`${s}px`}
                      >
                        <span className="sig-size-btn__dot" style={{ width: s + 3, height: s + 3 }} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sig-pen-tools__divider" />

                <button
                  className="sig-pen-tools__tool-btn"
                  onClick={canCreateSignature ? handleUndo : undefined}
                  disabled={history.length === 0 || !canCreateSignature}
                  style={{ cursor: canCreateSignature ? 'pointer' : 'not-allowed' }}
                  title="Undo stroke"
                >
                  <Undo2 size={15} />
                </button>

                <button
                  className="sig-pen-tools__tool-btn"
                  onClick={canCreateSignature ? clearCanvas : undefined}
                  disabled={!hasDrawn || !canCreateSignature}
                  style={{ cursor: canCreateSignature ? 'pointer' : 'not-allowed' }}
                  title="Clear canvas"
                >
                  <Eraser size={15} />
                </button>
              </div>
            </div>

            {/* Canvas Area (Flex 1) */}
            <div className="sig-capture-card__body">
              <div
                ref={canvasContainerRef}
                className="sig-canvas-wrap"
                style={!canCreateSignature ? { cursor: 'not-allowed', opacity: 0.7 } : undefined}
                title={!canCreateSignature ? "Admin has not allowed this action. You do not have permission to capture signatures." : undefined}
              >
                <canvas
                  ref={canvasRef}
                  className="sig-canvas"
                  style={!canCreateSignature ? { cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
                  onMouseDown={canCreateSignature ? startDrawing : undefined}
                  onMouseMove={canCreateSignature ? draw : undefined}
                  onMouseUp={canCreateSignature ? stopDrawing : undefined}
                  onMouseLeave={canCreateSignature ? stopDrawing : undefined}
                  onTouchStart={canCreateSignature ? startDrawing : undefined}
                  onTouchMove={canCreateSignature ? draw : undefined}
                  onTouchEnd={canCreateSignature ? stopDrawing : undefined}
                />
                {!hasDrawn && (
                  <div className="sig-canvas-placeholder">
                    <PenLine size={36} />
                    <span>{canCreateSignature ? 'Draw your signature here' : 'Signature drawing disabled (View Only)'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer / Upload & Action Bar */}
            <div className="sig-capture-card__footer">
              <label
                className="sig-upload-label"
                style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreateSignature ? "Admin has not allowed this action. You do not have permission to upload signatures." : undefined}
                onClick={(e) => {
                  if (!canCreateSignature) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  disabled={!canCreateSignature}
                  onChange={canCreateSignature ? handleUpload : undefined}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  style={{ pointerEvents: 'none' }}
                >
                  <Upload className="size-4 mr-1.5" /> Upload Image
                </Button>
                <span className="sig-upload-label__text">
                  {uploadedImage ? 'Image loaded' : 'PNG / JPG'}
                </span>
              </label>

              <div className="sig-capture-card__footer-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={!hasDrawn}
                >
                  <Download className="size-4 mr-1.5" /> Download
                </Button>

                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasDrawn || !canCreateSignature}
                  style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                  title={!canCreateSignature ? "Admin has not allowed this action." : undefined}
                >
                  <Save className="size-4 mr-1.5" /> Save Signature
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Saved Signatures (Right Column) */}
        <div className="sig-right-col">
          <div className="sig-saved-card">
            {/* Saved Signatures Header & Tabs */}
            <div className="sig-saved-card__header">
              <div className="sig-saved-card__tabs">
                <button
                  className={`sig-saved-card__tab ${activeRightTab === 'signatures' ? 'sig-saved-card__tab--active' : ''}`}
                  onClick={() => setActiveRightTab('signatures')}
                >
                  <PenLine size={15} /> Saved ({savedSignatures.length})
                </button>
                <button
                  className={`sig-saved-card__tab ${activeRightTab === 'history' ? 'sig-saved-card__tab--active' : ''}`}
                  onClick={() => setActiveRightTab('history')}
                >
                  <FileSignature size={15} /> History ({signedDocs.length})
                </button>
              </div>
            </div>

            {/* Content List */}
            {activeRightTab === 'signatures' ? (
              <div className="sig-saved-card__body">
                {loading ? (
                  <div className="sig-saved-card__loading">Loading signatures...</div>
                ) : savedSignatures.length > 0 ? (
                  <div className="sig-saved-list">
                    {savedSignatures.map(sig => (
                      <div key={sig.id} className="sig-saved-item">
                        <div className="sig-saved-item__preview" onClick={() => setPreviewSig(sig)}>
                          <img src={sig.dataUrl} alt={sig.name} />
                          {sig.isDefault && (
                            <span className="sig-saved-item__default-badge">
                              <Star size={9} /> Default
                            </span>
                          )}
                        </div>

                        <div className="sig-saved-item__info">
                          <span className="sig-saved-item__name">{sig.name}</span>
                          <div className="sig-saved-item__meta">
                            <span className={`sig-saved-item__type sig-saved-item__type--${sig.type}`}>
                              {sig.type === 'drawn' ? <PenLine size={10} /> : <FileImage size={10} />}
                              {sig.type}
                            </span>
                            <span className="sig-saved-item__date">{sig.createdAt}</span>
                          </div>
                        </div>

                        <div className="sig-saved-item__actions">
                          {!sig.isDefault && (
                            <button
                              className="sig-saved-item__action-btn"
                              disabled={!canCreateSignature}
                              title={!canCreateSignature ? "Permission denied" : "Set as default"}
                              onClick={canCreateSignature ? () => handleSetDefault(sig.id) : undefined}
                            >
                              <Star size={14} />
                            </button>
                          )}
                          <button
                            className="sig-saved-item__action-btn"
                            title="Preview"
                            onClick={() => setPreviewSig(sig)}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="sig-saved-item__action-btn sig-saved-item__action-btn--danger"
                            disabled={!canCreateSignature}
                            title={!canCreateSignature ? "Permission denied" : "Delete signature"}
                            onClick={canCreateSignature ? () => handleDeleteSaved(sig.id) : undefined}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="sig-saved-card__empty">
                    <PenLine size={32} />
                    <span>No saved signatures</span>
                    <p>Draw or upload a signature on the left to save for future use</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="sig-saved-card__body">
                {signedDocs.length > 0 ? (
                  <div className="sig-history-list">
                    {signedDocs.map(doc => {
                      const mod = DOC_MODULES.find(m => m.key === doc.module);
                      const Icon = mod?.icon || FileText;
                      return (
                        <div key={doc.id} className="sig-history-item">
                          <div className="sig-history-item__icon">
                            <Icon size={16} />
                          </div>
                          <div className="sig-history-item__info">
                            <span className="sig-history-item__module">
                              {mod?.label || doc.module} #{doc.referenceId}
                            </span>
                            <span className="sig-history-item__meta">
                              Signed: {doc.signedAt}
                              {doc.comments && <> · {doc.comments}</>}
                            </span>
                          </div>
                          <div className="sig-history-item__badge">
                            <CheckCircle2 size={12} /> Signed
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sig-saved-card__empty">
                    <FileSignature size={32} />
                    <span>No signed documents yet</span>
                    <p>Click "Sign Document" above to apply your saved signature to procurement records</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Sign Document Dialog / Modal ─────────────────── */}
      {showSignPanel && createPortal(
        <div className="sig-modal-backdrop" onClick={() => setShowSignPanel(false)}>
          <div className="sig-dialog" onClick={e => e.stopPropagation()}>
            <div className="sig-dialog__header">
              <div className="sig-dialog__title">
                <FileSignature size={20} className="text-primary" />
                <span>Apply Digital Signature</span>
              </div>
              <button className="sig-dialog__close" onClick={() => setShowSignPanel(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="sig-dialog__body">
              {/* Select Signature */}
              <div className="sig-dialog__field">
                <label>Select Saved Signature</label>
                <div className="sig-dialog__sig-list">
                  {savedSignatures.map(s => (
                    <button
                      key={s.id}
                      className={`sig-dialog__sig-option ${signSigId === s.id ? 'sig-dialog__sig-option--active' : ''}`}
                      onClick={() => setSignSigId(s.id)}
                    >
                      <img src={s.dataUrl} alt={s.name} />
                      <span className="flex items-center gap-1 justify-center">
                        {s.name} {s.isDefault && <Star size={10} className="fill-primary text-primary" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Module */}
              <div className="sig-dialog__field">
                <label>Document Type</label>
                <div className="sig-dialog__modules">
                  {DOC_MODULES.map(m => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.key}
                        className={`sig-dialog__module-btn ${signModule === m.key ? 'sig-dialog__module-btn--active' : ''}`}
                        onClick={() => setSignModule(m.key)}
                      >
                        <Icon size={14} /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reference ID */}
              <div className="sig-dialog__field">
                <label>Document Reference #</label>
                <input
                  className="sig-dialog__input"
                  type="text"
                  placeholder="e.g. PO-2026-001 or 1024"
                  value={signRefId}
                  onChange={e => setSignRefId(e.target.value)}
                />
              </div>

              {/* Comments */}
              <div className="sig-dialog__field">
                <label>Comments / Notes (Optional)</label>
                <textarea
                  className="sig-dialog__textarea"
                  placeholder="Add approval comment or notes..."
                  value={signComment}
                  onChange={e => setSignComment(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="sig-dialog__footer">
              <Button
                onClick={handleSignDocument}
                disabled={signing || !signSigId || !signRefId.trim() || !canCreateSignature}
              >
                <FileSignature className="size-4 mr-1.5" />
                {signing ? 'Signing...' : 'Apply Signature'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Preview Modal ──────────────────────────────────── */}
      {previewSig && createPortal(
        <div className="sig-modal-backdrop" onClick={() => setPreviewSig(null)}>
          <div className="sig-dialog sig-dialog--preview" onClick={e => e.stopPropagation()}>
            <div className="sig-dialog__header">
              <div className="sig-dialog__title">
                <Eye size={20} className="text-primary" />
                <span>{previewSig.name}</span>
                {previewSig.isDefault && (
                  <span className="sig-dialog__default-tag">
                    <Star size={12} className="fill-current" /> Default
                  </span>
                )}
              </div>
              <button className="sig-dialog__close" onClick={() => setPreviewSig(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="sig-dialog__body">
              <div className="sig-dialog__preview-img">
                <img src={previewSig.dataUrl} alt={previewSig.name} />
              </div>
              <div className="sig-dialog__meta">
                <span>Type: {previewSig.type === 'drawn' ? 'Hand-drawn' : 'Uploaded'}</span>
                <span>Created: {previewSig.createdAt}</span>
              </div>
            </div>

            <div className="sig-dialog__footer">
              <Button
                onClick={() => {
                  const link = document.createElement('a');
                  link.download = `${previewSig.name}.png`;
                  link.href = previewSig.dataUrl;
                  link.click();
                }}
              >
                <Download className="size-4 mr-1.5" /> Download
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </PageFrame>
  );
}

