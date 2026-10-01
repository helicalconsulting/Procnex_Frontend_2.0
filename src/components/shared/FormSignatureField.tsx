import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  PenTool,
  RotateCcw,
  Eraser,
  Upload,
  Type,
  CheckCircle2,
  X,
  Bookmark,
  Sparkles,
} from 'lucide-react';
import { signatureService, type SavedSignature } from '../../services/signatureService';
import './FormSignatureField.css';

export interface FormSignatureFieldProps {
  id?: string;
  label?: string;
  placeholder?: string;
  value?: string | null | Record<string, any>;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  onChange?: (value: string) => void;
  className?: string;
}

const PEN_COLORS = [
  { name: 'Navy', value: '#0a6ed1' },
  { name: 'Black', value: '#1a1a2e' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#059669' },
];

function normalizeValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, any>;
    return (obj.signatureDataUrl || obj.fileDataUrl || obj.dataUrl || obj.url || '').trim();
  }
  return String(value).trim();
}

function isImageSignature(val: string): boolean {
  return /^(data:image\/|https?:\/\/|blob:|\/)/i.test(val);
}

export function FormSignatureField({
  id,
  label,
  placeholder,
  value,
  disabled = false,
  readOnly = false,
  required = false,
  onChange,
  className = '',
}: FormSignatureFieldProps) {
  const normalizedVal = normalizeValue(value);
  const isLocked = disabled || readOnly;

  // Active sub-tab in pad: 'draw' | 'type' | 'upload' | 'saved'
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload' | 'saved'>('draw');
  const [isEditing, setIsEditing] = useState<boolean>(!normalizedVal);

  // Drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState('#0a6ed1');
  const [history, setHistory] = useState<ImageData[]>([]);

  // Typing state
  const [typedName, setTypedName] = useState('');

  // Saved signatures state
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Update edit state if incoming value changes
  useEffect(() => {
    if (!normalizedVal) {
      setIsEditing(true);
    }
  }, [normalizedVal]);

  // Load saved signatures if interactive
  useEffect(() => {
    if (isLocked) return;
    let isMounted = true;
    setLoadingSaved(true);
    signatureService
      .list()
      .then((sigs) => {
        if (isMounted) {
          setSavedSignatures(sigs || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingSaved(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isLocked]);

  // Canvas initialization and resize handling
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Scale 2x for sharp retina rendering
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
  }, []);

  useEffect(() => {
    if (activeTab === 'draw' && isEditing && !isLocked) {
      // Small timeout to allow container layout calculation
      const timer = setTimeout(() => {
        setupCanvas();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, isEditing, isLocked, setupCanvas]);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setHistory((prev) => [...prev.slice(-15), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const getCoordinates = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e && e.touches.length > 0) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      const me = e as React.MouseEvent<HTMLCanvasElement>;
      return {
        x: me.clientX - rect.left,
        y: me.clientY - rect.top,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (isLocked) return;
      e.preventDefault();
      saveHistory();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getCoordinates(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = 2.5;
      setIsDrawing(true);
      setHasDrawn(true);
    },
    [isLocked, saveHistory, getCoordinates, penColor]
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing || isLocked) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getCoordinates(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    },
    [isDrawing, isLocked, getCoordinates]
  );

  const commitDrawing = useCallback(() => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    if (onChange) {
      onChange(dataUrl);
    }
  }, [hasDrawn, onChange]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    saveHistory();
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    if (onChange) {
      onChange('');
    }
  }, [saveHistory, onChange]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory((h) => h.slice(0, -1));
    const dataUrl = canvas.toDataURL('image/png');
    if (onChange) {
      onChange(dataUrl);
    }
  }, [history, onChange]);

  // Type-to-sign conversion
  const handleApplyTypedSignature = useCallback(() => {
    if (!typedName.trim()) return;
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = penColor;
    ctx.font = 'italic 52px "Caveat", "Dancing Script", "Brush Script MT", "Segoe Script", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName.trim(), canvas.width / 2, canvas.height / 2);

    const dataUrl = canvas.toDataURL('image/png');
    if (onChange) {
      onChange(dataUrl);
    }
    setIsEditing(false);
  }, [typedName, penColor, onChange]);

  // Upload file handling
  const handleUploadFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        if (dataUrl && onChange) {
          onChange(dataUrl);
          setIsEditing(false);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [onChange]
  );

  // Select saved signature
  const handleSelectSaved = useCallback(
    (sig: SavedSignature) => {
      if (sig.dataUrl && onChange) {
        onChange(sig.dataUrl);
        setIsEditing(false);
      }
    },
    [onChange]
  );

  // If already signed and not currently in edit mode, display the clean signature preview
  if (normalizedVal && !isEditing) {
    const isImage = isImageSignature(normalizedVal);
    return (
      <div className={`fsig-preview-container ${className}`} id={id}>
        <div className="fsig-preview-card">
          <div className="fsig-preview-body">
            {isImage ? (
              <img
                src={normalizedVal}
                alt={label || 'Captured Signature'}
                className="fsig-preview-img"
              />
            ) : (
              <div className="fsig-preview-text">{normalizedVal}</div>
            )}
          </div>

          <div className="fsig-preview-footer">
            <div className="fsig-badge">
              <CheckCircle2 size={15} className="fsig-badge-icon" />
              <span>Digitally Signed</span>
            </div>

            {!isLocked && (
              <button
                type="button"
                className="fsig-btn-secondary"
                onClick={() => {
                  setIsEditing(true);
                  setHasDrawn(false);
                  setHistory([]);
                }}
              >
                <RotateCcw size={13} />
                <span>Change / Re-sign</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Locked and empty view
  if (isLocked) {
    return (
      <div className={`fsig-empty-locked ${className}`} id={id}>
        <PenTool size={16} className="text-muted-foreground" />
        <span className="italic text-muted-foreground">No signature provided</span>
      </div>
    );
  }

  // Interactive Signature Pad
  return (
    <div className={`fsig-container ${className}`} id={id}>
      {/* Header with Mode Tabs */}
      <div className="fsig-header">
        <div className="fsig-tabs">
          <button
            type="button"
            className={`fsig-tab ${activeTab === 'draw' ? 'fsig-tab--active' : ''}`}
            onClick={() => setActiveTab('draw')}
          >
            <PenTool size={14} />
            <span>Draw</span>
          </button>
          <button
            type="button"
            className={`fsig-tab ${activeTab === 'type' ? 'fsig-tab--active' : ''}`}
            onClick={() => setActiveTab('type')}
          >
            <Type size={14} />
            <span>Type</span>
          </button>
          <button
            type="button"
            className={`fsig-tab ${activeTab === 'upload' ? 'fsig-tab--active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={14} />
            <span>Upload</span>
          </button>
          {savedSignatures.length > 0 && (
            <button
              type="button"
              className={`fsig-tab ${activeTab === 'saved' ? 'fsig-tab--active' : ''}`}
              onClick={() => setActiveTab('saved')}
            >
              <Bookmark size={14} />
              <span>Saved ({savedSignatures.length})</span>
            </button>
          )}
        </div>

        {normalizedVal && (
          <button
            type="button"
            className="fsig-btn-cancel"
            onClick={() => setIsEditing(false)}
            title="Keep existing signature"
          >
            <X size={14} />
            <span>Keep Existing</span>
          </button>
        )}
      </div>

      {/* DRAW TAB */}
      {activeTab === 'draw' && (
        <div className="fsig-draw-panel">
          <div className="fsig-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="fsig-canvas"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={commitDrawing}
              onMouseLeave={commitDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={commitDrawing}
            />
            {!hasDrawn && !normalizedVal && (
              <div className="fsig-canvas-placeholder">
                <PenTool size={20} className="fsig-placeholder-icon" />
                <span>Sign here using your mouse, touchpad, or touchscreen</span>
              </div>
            )}
            <div className="fsig-canvas-baseline" />
          </div>

          <div className="fsig-draw-toolbar">
            <div className="fsig-color-picker">
              {PEN_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`fsig-color-dot ${penColor === c.value ? 'fsig-color-dot--active' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setPenColor(c.value)}
                  title={`${c.name} Pen`}
                />
              ))}
            </div>

            <div className="fsig-draw-actions">
              <button
                type="button"
                className="fsig-tool-btn"
                onClick={handleUndo}
                disabled={history.length === 0}
                title="Undo last stroke"
              >
                <RotateCcw size={14} />
                <span>Undo</span>
              </button>
              <button
                type="button"
                className="fsig-tool-btn fsig-tool-btn--danger"
                onClick={handleClear}
                disabled={!hasDrawn && !normalizedVal}
                title="Clear canvas"
              >
                <Eraser size={14} />
                <span>Clear</span>
              </button>
              {hasDrawn && (
                <button
                  type="button"
                  className="fsig-btn-apply"
                  onClick={() => setIsEditing(false)}
                >
                  <CheckCircle2 size={14} />
                  <span>Done</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TYPE TAB */}
      {activeTab === 'type' && (
        <div className="fsig-type-panel">
          <input
            type="text"
            className="fsig-type-input"
            placeholder="Type your full name..."
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyTypedSignature();
              }
            }}
          />

          {typedName.trim() && (
            <div className="fsig-type-preview-box">
              <span
                className="fsig-type-styled-name"
                style={{ color: penColor }}
              >
                {typedName.trim()}
              </span>
            </div>
          )}

          <div className="fsig-type-toolbar">
            <div className="fsig-color-picker">
              {PEN_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`fsig-color-dot ${penColor === c.value ? 'fsig-color-dot--active' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setPenColor(c.value)}
                  title={`${c.name} Color`}
                />
              ))}
            </div>

            <button
              type="button"
              className="fsig-btn-apply"
              onClick={handleApplyTypedSignature}
              disabled={!typedName.trim()}
            >
              <Sparkles size={14} />
              <span>Adopt &amp; Sign</span>
            </button>
          </div>
        </div>
      )}

      {/* UPLOAD TAB */}
      {activeTab === 'upload' && (
        <div className="fsig-upload-panel">
          <label className="fsig-upload-dropzone">
            <Upload size={24} className="fsig-upload-icon" />
            <span className="fsig-upload-text">Click to choose a signature image</span>
            <span className="fsig-upload-subtext">Supported formats: PNG, JPG, WEBP (Max 5MB)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="fsig-upload-hidden"
              onChange={handleUploadFile}
            />
          </label>
        </div>
      )}

      {/* SAVED TAB */}
      {activeTab === 'saved' && (
        <div className="fsig-saved-panel">
          {loadingSaved ? (
            <div className="fsig-saved-loading">Loading saved signatures...</div>
          ) : savedSignatures.length === 0 ? (
            <div className="fsig-saved-empty">No saved signatures found in your profile.</div>
          ) : (
            <div className="fsig-saved-grid">
              {savedSignatures.map((sig) => (
                <button
                  key={sig.id}
                  type="button"
                  className="fsig-saved-card"
                  onClick={() => handleSelectSaved(sig)}
                >
                  <img src={sig.dataUrl} alt={sig.name} className="fsig-saved-img" />
                  <span className="fsig-saved-name">{sig.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FormSignatureField;
