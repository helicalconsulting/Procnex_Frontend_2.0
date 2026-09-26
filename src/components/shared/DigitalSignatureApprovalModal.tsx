import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { signatureService, type SavedSignature } from '../../services/signatureService';
import {
  FileSignature,
  PenLine,
  Upload,
  Star,
  CheckCircle2,
  X,
  Undo2,
  Eraser,
  Check,
  AlertCircle
} from 'lucide-react';
import './DigitalSignatureApprovalModal.css';

export interface DocDetailItem {
  label: string;
  value: string;
}

export interface DigitalSignatureApprovalModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (signatureDataUrl: string, comment?: string) => Promise<void> | void;
  docTitle: string;
  docDetails?: DocDetailItem[];
  initialComment?: string;
  actionType?: 'confirm' | 'approve';
}

const PEN_COLORS = [
  { name: 'Navy', value: '#0a6ed1' },
  { name: 'Black', value: '#1a1a2e' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#059669' },
];

export function DigitalSignatureApprovalModal({
  open,
  onClose,
  onConfirm,
  docTitle,
  docDetails = [],
  initialComment = '',
  actionType = 'approve',
}: DigitalSignatureApprovalModalProps) {
  const [activeTab, setActiveTab] = useState<'saved' | 'draw' | 'upload'>('saved');
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<string | number | null>(null);
  const [selectedDataUrl, setSelectedDataUrl] = useState<string>('');
  const [comment, setComment] = useState(initialComment);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Canvas State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState('#0a6ed1');
  const [history, setHistory] = useState<ImageData[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Load saved signatures
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    (async () => {
      try {
        const sigs = await signatureService.list();
        if (!isMounted) return;

        // Deduplicate saved signatures by dataUrl
        const seen = new Set<string>();
        const uniqueSigs: SavedSignature[] = [];
        for (const s of sigs) {
          if (!s.dataUrl) continue;
          if (seen.has(s.dataUrl)) continue;
          seen.add(s.dataUrl);
          uniqueSigs.push(s);
        }

        // Ensure only one signature is marked default
        const firstDefaultIndex = uniqueSigs.findIndex((s) => s.isDefault);
        const normalizedSigs = uniqueSigs.map((s, idx) => ({
          ...s,
          isDefault: firstDefaultIndex !== -1 ? idx === firstDefaultIndex : idx === 0,
        }));

        setSavedSignatures(normalizedSigs);
        const def = normalizedSigs.find((s) => s.isDefault) || normalizedSigs[0];
        if (def) {
          setSelectedSigId(def.id);
          setSelectedDataUrl(def.dataUrl);
          setActiveTab('saved');
        } else {
          setActiveTab('draw');
        }
      } catch {
        if (isMounted) setActiveTab('draw');
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [open]);

  // Setup Canvas when draw tab is active
  useEffect(() => {
    if (activeTab !== 'draw' || !open) return;
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
  }, [activeTab, open]);

  const saveCanvasState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setHistory((prev) => [...prev.slice(-15), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    const me = e as React.MouseEvent<HTMLCanvasElement>;
    return { x: me.clientX - rect.left, y: me.clientY - rect.top };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    saveCanvasState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 3;
    setIsDrawing(true);
    setHasDrawn(true);
  }, [getPos, penColor, saveCanvasState]);

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

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      setSelectedDataUrl(dataUrl);
    }
  }, [isDrawing]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveCanvasState();
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    setSelectedDataUrl('');
  }, [saveCanvasState]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory((h) => h.slice(0, -1));
    setSelectedDataUrl(canvas.toDataURL('image/png'));
  }, [history]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setUploadedImage(url);
      setSelectedDataUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectSaved = (sig: SavedSignature) => {
    setSelectedSigId(sig.id);
    setSelectedDataUrl(sig.dataUrl);
  };

  const handleSubmit = async () => {
    let finalUrl = selectedDataUrl;
    if (activeTab === 'draw' && canvasRef.current && hasDrawn) {
      finalUrl = canvasRef.current.toDataURL('image/png');
    }

    if (!finalUrl) {
      setErrorMsg('Please select or draw a signature before approving.');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      await onConfirm(finalUrl, comment.trim() || undefined);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="sig-approve-backdrop" onClick={onClose}>
      <div className="sig-approve-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sig-approve-header">
          <div className="sig-approve-header-left">
            <div className="sig-approve-icon-badge">
              <FileSignature size={20} />
            </div>
            <div>
              <h3 className="sig-approve-title">Digital Signature Approval</h3>
              <p className="sig-approve-subtitle">Sign and verify approval for {docTitle}</p>
            </div>
          </div>
          <button className="sig-approve-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="sig-approve-body">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Doc details summary */}
          {docDetails.length > 0 && (
            <div className="sig-approve-doc-card">
              {docDetails.map((item, idx) => (
                <div key={idx}>
                  <div className="sig-approve-doc-label">{item.label}</div>
                  <div className="sig-approve-doc-val">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Mode Tabs */}
          <div className="sig-approve-tabs">
            <button
              type="button"
              className={`sig-approve-tab ${activeTab === 'saved' ? 'sig-approve-tab--active' : ''}`}
              onClick={() => setActiveTab('saved')}
            >
              <Star size={14} /> Saved Signatures ({savedSignatures.length})
            </button>
            <button
              type="button"
              className={`sig-approve-tab ${activeTab === 'draw' ? 'sig-approve-tab--active' : ''}`}
              onClick={() => setActiveTab('draw')}
            >
              <PenLine size={14} /> Draw Signature
            </button>
            <button
              type="button"
              className={`sig-approve-tab ${activeTab === 'upload' ? 'sig-approve-tab--active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <Upload size={14} /> Upload Image
            </button>
          </div>

          {/* Tab 1: Saved Signatures */}
          {activeTab === 'saved' && (
            <div className="space-y-3">
              {savedSignatures.length > 0 ? (
                <div className="sig-saved-grid">
                  {savedSignatures.map((sig) => (
                    <div
                      key={sig.id}
                      className={`sig-saved-card-item ${selectedSigId === sig.id ? 'sig-saved-card-item--selected' : ''}`}
                      onClick={() => handleSelectSaved(sig)}
                    >
                      <img src={sig.dataUrl} alt={sig.name} />
                      <span className="sig-saved-card-item-name">{sig.name}</span>
                      {sig.isDefault && <span className="sig-saved-badge-default">⭐ Default Signature</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No saved signatures found on Signature Page. Please draw or upload one below.
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Draw Signature */}
          {activeTab === 'draw' && (
            <div className="space-y-2">
              <div className="sig-approve-canvas-wrap">
                <canvas
                  ref={canvasRef}
                  className="sig-approve-canvas"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {!hasDrawn && (
                  <div className="sig-approve-canvas-placeholder">
                    <PenLine size={24} />
                    <span>Draw your digital signature here</span>
                  </div>
                )}
              </div>

              <div className="sig-approve-canvas-tools">
                <div className="sig-approve-colors">
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`sig-approve-color-dot ${penColor === c.value ? 'sig-approve-color-dot--active' : ''}`}
                      style={{ '--dot-color': c.value } as React.CSSProperties}
                      onClick={() => setPenColor(c.value)}
                    />
                  ))}
                </div>
                <div className="sig-approve-tool-btns">
                  <button type="button" className="sig-approve-tool-btn" onClick={handleUndo} disabled={history.length === 0}>
                    <Undo2 size={13} /> Undo
                  </button>
                  <button type="button" className="sig-approve-tool-btn" onClick={clearCanvas} disabled={!hasDrawn}>
                    <Eraser size={13} /> Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Upload Signature */}
          {activeTab === 'upload' && (
            <div className="space-y-3">
              <label className="sig-approve-upload-box">
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                <Upload size={24} className="mx-auto text-muted-foreground" />
                <span className="mt-2 block text-xs font-semibold">Click to upload signature image</span>
                <span className="text-[11px] text-muted-foreground">PNG, JPG, SVG up to 2MB</span>
              </label>
              {uploadedImage && (
                <div className="flex flex-col items-center rounded-lg border border-border/70 p-3 bg-white">
                  <img src={uploadedImage} alt="Uploaded preview" className="max-h-24 object-contain" />
                  <span className="mt-1 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                    <Check size={12} /> Image ready
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Comments input */}
          <div className="sig-approve-comments-area">
            <label>Approver Comments (Optional)</label>
            <textarea
              placeholder="Add approval comments or signature notes..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sig-approve-footer">
          <button type="button" className="sig-approve-btn sig-approve-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="sig-approve-btn sig-approve-btn--primary"
            onClick={handleSubmit}
            disabled={submitting || (!selectedDataUrl && !hasDrawn)}
          >
            <CheckCircle2 size={16} />
            {submitting ? 'Approving & Signing...' : 'Confirm Approval & Sign'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
