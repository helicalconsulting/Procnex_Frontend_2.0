import { useState, useRef, useCallback, useEffect } from 'react';
import { signatureService, type SavedSignature } from '../../services/signatureService';
import { MessageStrip } from './MessageStrip';
import {
  PenLine, Eraser, Save, Upload, Download, Undo2, Trash2, Star, FileImage, Eye, X,
} from 'lucide-react';
import './SignatureSection.css';

const PEN_COLORS = [
  { name: 'Black', value: '#1a1a2e' },
  { name: 'Navy', value: '#0a6ed1' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#059669' },
];

const PEN_SIZES = [1, 2, 3, 4, 6];

export default function SignatureSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#1a1a2e');
  const [penSize, setPenSize] = useState(3);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<ImageData[]>([]);

  // Saved signatures
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [loading, setLoading] = useState(true);

  // Messages
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Preview
  const [previewSig, setPreviewSig] = useState<SavedSignature | null>(null);

  // ── Load saved signatures on mount ──
  useEffect(() => {
    (async () => {
      try {
        const sigs = await signatureService.list();
        setSavedSignatures(sigs);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Flash messages ──
  const flashSuccess = (msg: string) => { setSuccessMsg(msg); setErrorMsg(''); setTimeout(() => setSuccessMsg(''), 3000); };
  const flashError = (msg: string) => { setErrorMsg(msg); setSuccessMsg(''); setTimeout(() => setErrorMsg(''), 4000); };

  // ── Canvas setup ──
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

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setHistory(prev => [...prev.slice(-19), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
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

  // ── Upload image ──
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

  // ── Download ──
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `signature-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  // ── Save signature ──
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
      flashSuccess('✅ Signature saved!');
    } catch (err: unknown) {
      flashError((err as Error).message || 'Failed to save');
    }
  }, [savedSignatures, uploadedImage]);

  // ── Delete signature ──
  const handleDelete = useCallback(async (id: string | number) => {
    try {
      await signatureService.delete(id);
      setSavedSignatures(prev => prev.filter(s => s.id !== id));
      flashSuccess('Signature deleted');
    } catch { flashError('Failed to delete'); }
  }, []);

  // ── Set default ──
  const handleSetDefault = useCallback(async (id: string | number) => {
    try {
      await signatureService.setDefault(id);
      setSavedSignatures(prev => prev.map(s => ({ ...s, isDefault: s.id === id })));
      flashSuccess('Default signature updated');
    } catch { flashError('Failed to set default'); }
  }, []);

  return (
    <div className="sig-section">
      {/* Messages */}
      {successMsg && <MessageStrip type="success" compact onClose={() => setSuccessMsg('')} autoHideMs={3000}>{successMsg}</MessageStrip>}
      {errorMsg && <MessageStrip type="error" compact onClose={() => setErrorMsg('')} autoHideMs={4000}>{errorMsg}</MessageStrip>}

      {/* ── Capture Area ── */}
      <div className="sig-section__card">
        <div className="sig-section__card-header">
          <PenLine size={16} />
          <h3>My Signature</h3>
        </div>

        {/* Canvas */}
        <div className="sig-section__canvas-wrap">
          <canvas
            ref={canvasRef}
            className="sig-section__canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {!hasDrawn && (
            <div className="sig-section__canvas-placeholder">
              <PenLine size={24} />
              <span>Draw your signature here</span>
            </div>
          )}
        </div>

        {/* Pen Tools */}
        <div className="sig-section__tools">
          <div className="sig-section__colors">
            {PEN_COLORS.map(c => (
              <button
                key={c.value}
                className={`sig-section__color-dot ${penColor === c.value ? 'sig-section__color-dot--active' : ''}`}
                style={{ '--dot-color': c.value } as React.CSSProperties}
                onClick={() => setPenColor(c.value)}
                title={c.name}
              />
            ))}
          </div>
          <div className="sig-section__sizes">
            {PEN_SIZES.map(s => (
              <button
                key={s}
                className={`sig-section__size-btn ${penSize === s ? 'sig-section__size-btn--active' : ''}`}
                onClick={() => setPenSize(s)}
                title={`${s}px`}
              >
                <span className="sig-section__size-dot" style={{ width: s + 3, height: s + 3 }} />
              </button>
            ))}
          </div>
          <button className="sig-section__undo" onClick={handleUndo} disabled={history.length === 0} title="Undo">
            <Undo2 size={13} />
          </button>
        </div>

        {/* Action Buttons Row */}
        <div className="sig-section__actions">
          {/* Upload */}
          <label className="sig-section__upload-btn">
            <input type="file" accept="image/*" onChange={handleUpload} className="sig-section__upload-input" />
            <Upload size={13} /> Upload
          </label>
          <button className="sig-section__action-btn" onClick={clearCanvas} disabled={!hasDrawn}>
            <Eraser size={13} /> Clear
          </button>
          <button className="sig-section__action-btn" onClick={handleDownload} disabled={!hasDrawn}>
            <Download size={13} /> Download
          </button>
          <button className="sig-section__action-btn sig-section__action-btn--save" onClick={handleSave} disabled={!hasDrawn}>
            <Save size={13} /> Save
          </button>
        </div>
      </div>

      {/* ── Saved Signatures ── */}
      <div className="sig-section__list">
        <h4>Saved Signatures ({loading ? '...' : savedSignatures.length})</h4>
        {loading ? (
          <p className="sig-section__loading">Loading...</p>
        ) : savedSignatures.length > 0 ? (
          <div className="sig-section__items">
            {savedSignatures.map(sig => (
              <div key={sig.id} className="sig-section__item">
                <div className="sig-section__item-preview" onClick={() => setPreviewSig(sig)}>
                  <img src={sig.dataUrl} alt={sig.name} />
                  {sig.isDefault && <span className="sig-section__item-default">⭐ Default</span>}
                </div>
                <div className="sig-section__item-info">
                  <span className="sig-section__item-name">{sig.name}</span>
                  <span className="sig-section__item-meta">
                    <span className={`sig-section__item-type sig-section__item-type--${sig.type}`}>
                      {sig.type === 'drawn' ? <PenLine size={9} /> : <FileImage size={9} />}
                      {sig.type}
                    </span>
                  </span>
                </div>
                <div className="sig-section__item-actions">
                  {!sig.isDefault && (
                    <button className="sig-section__item-action" title="Set as default" onClick={() => handleSetDefault(sig.id)}>
                      <Star size={13} />
                    </button>
                  )}
                  <button className="sig-section__item-action" title="Preview" onClick={() => setPreviewSig(sig)}>
                    <Eye size={13} />
                  </button>
                  <button className="sig-section__item-action sig-section__item-action--danger" title="Delete" onClick={() => handleDelete(sig.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sig-section__empty">
            <PenLine size={20} />
            <span>No saved signatures yet</span>
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {previewSig && (
        <div className="sig-section__backdrop" onClick={() => setPreviewSig(null)}>
          <div className="sig-section__modal" onClick={e => e.stopPropagation()}>
            <div className="sig-section__modal-header">
              <span><Eye size={16} /> {previewSig.name}</span>
              <button className="sig-section__modal-close" onClick={() => setPreviewSig(null)}><X size={16} /></button>
            </div>
            <div className="sig-section__modal-body">
              <img src={previewSig.dataUrl} alt={previewSig.name} />
            </div>
            <div className="sig-section__modal-footer">
              <a className="sig-section__modal-download" href={previewSig.dataUrl} download={`${previewSig.name}.png`}>
                <Download size={14} /> Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
