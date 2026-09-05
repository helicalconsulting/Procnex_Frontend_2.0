import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useAuth } from '../../context/AuthContext';
import { MessageStrip } from '../../components/shared/MessageStrip';
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
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Canvas setup ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

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
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveState();
    const rect = canvas.getBoundingClientRect();
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
      flashSuccess('✅ Signature saved successfully!');
    } catch (err: unknown) {
      flashError((err as Error).message || 'Failed to save');
    }
  }, [savedSignatures, uploadedImage]);

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
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        saveState();
        const rect = canvas.getBoundingClientRect();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        const scale = Math.min(rect.width / img.width, rect.height / img.height) * 0.8;
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
      flashError('Failed to set default');
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
      flashSuccess(`✅ ${signModule.replace('_', ' ')} #${signRefId} signed!`);
      setSignRefId('');
      setSignComment('');
      setShowSignPanel(false);
    } catch (err: unknown) {
      flashError((err as Error).message || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  }, [signSigId, signModule, signRefId, signComment]);

  return (
    <div className="sig-page">
      {/* Header */}
      <div className="sig-page__header">
        <div className="sig-page__header-left">
          <h1>E-Signature</h1>
          <p>Draw, upload, and manage digital signatures for procurement documents</p>
        </div>
      </div>

      <div className="sig-content">
        {/* ── Main Capture Card ─────────────────────────────── */}
        <div className="sig-capture-card">
          <div className="sig-capture-card__header">
            <div className="sig-capture-card__header-icon">
              <PenLine size={24} />
            </div>
            <h2>Capture Signature</h2>
          </div>

          <div className="sig-capture-card__body">
            {/* Success / Error Messages */}
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

            {/* Canvas Section Label */}
            <div className="sig-section-label">
              <PenLine size={14} />
              <span>Sign Below</span>
            </div>

            {/* Pen Tools */}
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
                      <span className="sig-size-btn__dot" style={{ width: s + 4, height: s + 4 }} />
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="sig-pen-tools__undo"
                onClick={canCreateSignature ? handleUndo : undefined}
                disabled={history.length === 0 || !canCreateSignature}
                style={{ cursor: canCreateSignature ? 'pointer' : 'not-allowed' }}
                title="Undo"
              >
                <Undo2 size={15} />
              </button>
            </div>

            {/* Canvas */}
            <div
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
                  <PenLine size={32} />
                  <span>{canCreateSignature ? 'Draw your signature here' : 'Signature drawing disabled (View Only)'}</span>
                </div>
              )}
            </div>

            {/* Upload Alternative */}
            <div className="sig-upload-section">
              <div className="sig-section-label">
                <Upload size={14} />
                <span>Alternative: Upload Image</span>
              </div>
              <label
                className="sig-upload-area"
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
                  className="sig-upload-area__input"
                />
                <span className="sig-upload-area__btn" style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>Browse...</span>
                <span className="sig-upload-area__text">
                  {uploadedImage ? 'Image loaded on canvas' : 'No file selected.'}
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="sig-actions">
              <button className="sig-action-btn sig-action-btn--home" onClick={() => navigate('/dashboard')}>
                <Home size={16} /> Home
              </button>
              <button
                className="sig-action-btn sig-action-btn--clear"
                onClick={canCreateSignature ? clearCanvas : undefined}
                disabled={!hasDrawn || !canCreateSignature}
                style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreateSignature ? "Admin has not allowed this action. You do not have permission to clear signature canvas." : undefined}
              >
                <Eraser size={16} /> Clear
              </button>
              <button className="sig-action-btn sig-action-btn--download" onClick={handleDownload} disabled={!hasDrawn}>
                <Download size={16} /> Download
              </button>
              <button
                className="sig-action-btn sig-action-btn--save"
                onClick={handleSave}
                disabled={!hasDrawn || !canCreateSignature}
                style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreateSignature ? "Admin has not allowed this action. You do not have permission to save digital signatures." : undefined}
              >
                <Save size={16} /> Save Signature
              </button>
            </div>
          </div>
        </div>

        {/* ── Sign Document Panel ───────────────────────────── */}
        {showSignPanel && savedSignatures.length > 0 && (
          <div className="sig-sign-panel">
            <div className="sig-sign-panel__header">
              <h3><FileSignature size={18} /> Sign a Document</h3>
              <button className="sig-sign-panel__close" onClick={() => setShowSignPanel(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="sig-sign-panel__body">
              {/* Select Signature */}
              <div className="sig-sign-panel__field">
                <label>Select Signature</label>
                <div className="sig-sign-panel__sig-list">
                  {savedSignatures.map(s => (
                    <button
                      key={s.id}
                      className={`sig-sign-panel__sig-option ${signSigId === s.id ? 'sig-sign-panel__sig-option--active' : ''}`}
                      onClick={() => setSignSigId(s.id)}
                    >
                      <img src={s.dataUrl} alt={s.name} />
                      <span>{s.name} {s.isDefault && '⭐'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Module */}
              <div className="sig-sign-panel__field">
                <label>Document Type</label>
                <div className="sig-sign-panel__modules">
                  {DOC_MODULES.map(m => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.key}
                        className={`sig-sign-panel__module-btn ${signModule === m.key ? 'sig-sign-panel__module-btn--active' : ''}`}
                        onClick={() => setSignModule(m.key)}
                      >
                        <Icon size={14} /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reference ID */}
              <div className="sig-sign-panel__field">
                <label>Document Reference ID</label>
                <input
                  className="sig-sign-panel__input"
                  type="number"
                  placeholder={`e.g. 1, 2, 3...`}
                  value={signRefId}
                  onChange={e => setSignRefId(e.target.value)}
                />
              </div>

              {/* Comments */}
              <div className="sig-sign-panel__field">
                <label>Comments (optional)</label>
                <textarea
                  className="sig-sign-panel__textarea"
                  placeholder="Add any notes..."
                  value={signComment}
                  onChange={e => setSignComment(e.target.value)}
                  rows={2}
                />
              </div>

              <button
                className="sig-sign-panel__submit"
                onClick={handleSignDocument}
                disabled={signing || !signSigId || !signRefId.trim() || !canCreateSignature}
                style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreateSignature ? "Admin has not allowed this action. You do not have permission to apply digital signatures." : undefined}
              >
                <FileSignature size={16} />
                {signing ? 'Signing...' : 'Apply Signature'}
              </button>
            </div>
          </div>
        )}

        {/* ── Saved Signatures ──────────────────────────────── */}
        <div className="sig-saved-card">
          <div className="sig-saved-card__header">
            <h3>Saved Signatures ({loading ? '...' : savedSignatures.length})</h3>
          </div>
          {loading ? (
            <div className="sig-saved-card__loading">Loading...</div>
          ) : savedSignatures.length > 0 ? (
            <div className="sig-saved-list">
              {savedSignatures.map(sig => (
                <div key={sig.id} className="sig-saved-item">
                  <div className="sig-saved-item__preview" onClick={() => setPreviewSig(sig)}>
                    <img src={sig.dataUrl} alt={sig.name} />
                    {sig.isDefault && (
                      <span className="sig-saved-item__default-badge">
                        <Star size={10} /> Default
                      </span>
                    )}
                  </div>
                  <div className="sig-saved-item__info">
                    <span className="sig-saved-item__name">{sig.name}</span>
                    <span className="sig-saved-item__meta">
                      <span className={`sig-saved-item__type sig-saved-item__type--${sig.type}`}>
                        {sig.type === 'drawn' ? <PenLine size={10} /> : <FileImage size={10} />}
                        {sig.type}
                      </span>
                      · {sig.createdAt}
                    </span>
                  </div>
                  <div className="sig-saved-item__actions">
                    {!sig.isDefault && (
                      <button
                        className="sig-saved-item__action"
                        disabled={!canCreateSignature}
                        style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                        title={!canCreateSignature ? "Admin has not allowed this action. You do not have permission to set default signature." : "Set as default"}
                        onClick={canCreateSignature ? () => handleSetDefault(sig.id) : undefined}
                      >
                        <Star size={14} />
                      </button>
                    )}
                    <button className="sig-saved-item__action" title="Preview" onClick={() => setPreviewSig(sig)}>
                      <Eye size={14} />
                    </button>
                    <button
                      className="sig-saved-item__action sig-saved-item__action--danger"
                      disabled={!canCreateSignature}
                      style={!canCreateSignature ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                      title={!canCreateSignature ? "Admin has not allowed this action. You do not have permission to delete signatures." : "Delete"}
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
              <span>No saved signatures yet</span>
              <span className="sig-saved-card__empty-hint">Draw or upload your first signature above</span>
            </div>
          )}
        </div>

        {/* ── Signed Documents History ──────────────────────── */}
        {signedDocs.length > 0 && (
          <div className="sig-history-card">
            <div className="sig-history-card__header">
              <h3><FileSignature size={16} /> Recently Signed Documents ({signedDocs.length})</h3>
            </div>
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
                      <CheckCircle2 size={14} /> Signed
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Preview Modal ──────────────────────────────────── */}
      {previewSig && (
        <div className="sig-modal-backdrop" onClick={() => setPreviewSig(null)}>
          <div className="sig-modal" onClick={e => e.stopPropagation()}>
            <div className="sig-modal__header">
              <div className="sig-modal__title">
                <Eye size={20} />
                <span>{previewSig.name}</span>
                {previewSig.isDefault && <span className="sig-modal__default-tag">⭐ Default</span>}
              </div>
              <button className="sig-modal__close" onClick={() => setPreviewSig(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="sig-modal__body">
              <div className="sig-modal__preview-img">
                <img src={previewSig.dataUrl} alt={previewSig.name} />
              </div>
              <div className="sig-modal__meta">
                <span>Type: {previewSig.type === 'drawn' ? 'Hand-drawn' : 'Uploaded'}</span>
                <span>Created: {previewSig.createdAt}</span>
              </div>
            </div>
            <div className="sig-modal__footer">
              <button className="sig-modal__btn sig-modal__btn--secondary" onClick={() => setPreviewSig(null)}>Close</button>
              <a
                className="sig-modal__btn sig-modal__btn--primary"
                href={previewSig.dataUrl}
                download={`${previewSig.name}.png`}
              >
                <Download size={16} /> Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
