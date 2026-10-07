import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  PenLine,
  Eraser,
  Save,
  Upload,
  Download,
  Undo2,
  FileImage,
  Trash2,
  Eye,
  Star,
  FileSignature,
  Type,
  CheckCircle2,
  X,
  ShieldCheck,
  Building2,
  Sparkles,
  Info,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { MessageStrip } from '../shared/MessageStrip';
import { signatureService, type SavedSignature } from '../../services/signatureService';
import { useAuth } from '../../context/AuthContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import './VendorSignatureSection.css';

const PEN_COLORS = [
  { name: 'Black', value: '#1a1a2e' },
  { name: 'Navy Blue', value: '#0a6ed1' },
  { name: 'Royal Blue', value: '#1e40af' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Emerald', value: '#059669' },
];

const PEN_SIZES = [1, 2, 3, 4, 6];

const SCRIPT_FONTS = [
  { name: 'Elegant Script', font: 'Dancing Script, cursive, sans-serif' },
  { name: 'Classic Signature', font: 'Great Vibes, cursive, sans-serif' },
  { name: 'Modern Cursive', font: 'Brush Script MT, cursive, sans-serif' },
  { name: 'Formal Hand', font: 'Caveat, cursive, sans-serif' },
];

export function VendorSignatureSection({ vendorName }: { vendorName?: string }) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Mode: Draw vs Type vs Upload
  const [activeMode, setActiveMode] = useState<'draw' | 'type' | 'upload'>('draw');

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#1a1a2e');
  const [penSize, setPenSize] = useState(3);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Type Signature state
  const [typedName, setTypedName] = useState(vendorName || user?.fullName || '');
  const [selectedFont, setSelectedFont] = useState(SCRIPT_FONTS[0].font);

  // Saved Signatures state
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signatureName, setSignatureName] = useState('');

  // Messages & Preview
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewSig, setPreviewSig] = useState<SavedSignature | null>(null);
  useBodyScrollLock(!!previewSig);

  // Load signatures on mount
  const loadSignatures = useCallback(async () => {
    try {
      setLoading(true);
      const sigs = await signatureService.list();
      setSavedSignatures(sigs);
    } catch (err: any) {
      console.error('Failed to load signatures:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  // Flash messages
  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg('');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const flashError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg('');
    setTimeout(() => setErrorMsg(''), 5000);
  };

  // Canvas Initialization
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
    const handleResize = () => initCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initCanvas]);

  // Save State for Undo
  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-19), imageData]);
  }, []);

  // Drawing Handlers
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

  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
    },
    [getPos, penColor, penSize, saveState]
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    },
    [isDrawing, getPos]
  );

  const stopDrawing = useCallback(() => setIsDrawing(false), []);

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

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory((h) => h.slice(0, -1));
  }, [history]);

  // Upload Image Handler
  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [saveState]
  );

  // Render Typed Signature onto Canvas
  const applyTypedSignature = useCallback(() => {
    if (!typedName.trim()) return;
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveState();
    const rect = container.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = penColor;
    ctx.font = `italic 38px ${selectedFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName.trim(), rect.width / 2, rect.height / 2);

    setHasDrawn(true);
  }, [typedName, selectedFont, penColor, saveState]);

  // Save Signature
  const handleSaveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      flashError('Please draw, type, or upload a signature first.');
      return;
    }
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const sigType = uploadedImage ? 'uploaded' : activeMode === 'type' ? 'drawn' : 'drawn';
      const name = signatureName.trim() || `Signature ${savedSignatures.length + 1}`;

      const created = await signatureService.create({
        name,
        dataUrl,
        type: sigType,
      });

      setSavedSignatures((prev) => [created, ...prev]);
      setSignatureName('');
      flashSuccess('Signature saved successfully! It is now available across your vendor portal.');
      clearCanvas();
    } catch (err: any) {
      flashError(err?.message || 'Failed to save signature');
    } finally {
      setSaving(false);
    }
  };

  // Set Default Signature
  const handleSetDefault = async (id: string | number) => {
    try {
      await signatureService.setDefault(id);
      setSavedSignatures((prev) =>
        prev.map((s) => ({ ...s, isDefault: String(s.id) === String(id) }))
      );
      flashSuccess('Default signature updated! Contracts will auto-load this signature.');
    } catch (err: any) {
      flashError(err?.message || 'Failed to update default signature');
    }
  };

  // Delete Signature
  const handleDelete = async (id: string | number) => {
    try {
      await signatureService.delete(id);
      setSavedSignatures((prev) => prev.filter((s) => String(s.id) !== String(id)));
      flashSuccess('Signature removed.');
    } catch (err: any) {
      flashError(err?.message || 'Failed to delete signature');
    }
  };

  // Download Signature
  const handleDownload = (dataUrl: string, name: string) => {
    const link = document.createElement('a');
    link.download = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="vendor-sig-container space-y-6">
      {/* Alert Messages */}
      {successMsg && (
        <MessageStrip type="success" compact onClose={() => setSuccessMsg('')} autoHideMs={4000}>
          {successMsg}
        </MessageStrip>
      )}
      {errorMsg && (
        <MessageStrip type="error" compact onClose={() => setErrorMsg('')} autoHideMs={5000}>
          {errorMsg}
        </MessageStrip>
      )}

      {/* Overview Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <FileSignature className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Digital Signature Management</h4>
            <p className="text-xs text-muted-foreground">
              Save your authorized signatory profile once. When signing Contracts, NDAs, and Orders, your default signature is auto-loaded.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone="success" className="gap-1 text-[11px] py-1 px-2.5">
            <ShieldCheck className="size-3.5" /> Multi-Tenant Encrypted
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Signature Creator Card */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="overflow-hidden border-border/80 bg-card p-5 shadow-xs space-y-4">
            {/* Header & Modes */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <PenLine className="size-4 text-primary" />
                <span className="font-semibold text-foreground text-sm">Capture New Signature</span>
              </div>
              <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/60 text-xs">
                <button
                  type="button"
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    activeMode === 'draw'
                      ? 'bg-card text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveMode('draw')}
                >
                  <PenLine className="inline size-3.5 mr-1" /> Draw
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    activeMode === 'type'
                      ? 'bg-card text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveMode('type')}
                >
                  <Type className="inline size-3.5 mr-1" /> Type
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    activeMode === 'upload'
                      ? 'bg-card text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveMode('upload')}
                >
                  <Upload className="inline size-3.5 mr-1" /> Upload
                </button>
              </div>
            </div>

            {/* Type Mode Controls */}
            {activeMode === 'type' && (
              <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="form-field">
                    <label className="text-[11px] font-semibold text-muted-foreground">Signatory Name</label>
                    <Input
                      type="text"
                      className="h-8 text-xs rounded-lg"
                      placeholder="e.g. John Doe"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label className="text-[11px] font-semibold text-muted-foreground">Signature Font Style</label>
                    <select
                      className="h-8 text-xs rounded-lg border border-input bg-card px-2 text-foreground"
                      value={selectedFont}
                      onChange={(e) => setSelectedFont(e.target.value)}
                    >
                      {SCRIPT_FONTS.map((f) => (
                        <option key={f.name} value={f.font}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={applyTypedSignature}>
                    <Sparkles className="size-3.5 text-primary" /> Render on Canvas
                  </Button>
                </div>
              </div>
            )}

            {/* Upload Mode Controls */}
            {activeMode === 'upload' && (
              <div className="p-4 rounded-xl border border-dashed border-border/80 bg-muted/10 text-center space-y-2">
                <FileImage className="size-8 mx-auto text-muted-foreground" />
                <p className="text-xs font-semibold text-foreground">Upload existing signature image</p>
                <p className="text-[11px] text-muted-foreground">Supports PNG, JPG, JPEG with transparent or light background</p>
                <label className="inline-block mt-2">
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary font-semibold text-xs cursor-pointer hover:bg-primary/20 transition">
                    <Upload className="size-3.5" /> Choose Image File
                  </span>
                </label>
              </div>
            )}

            {/* Pen Toolbar (for Draw & Type modes) */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-xl bg-muted/20 border border-border/60">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1">Ink:</span>
                {PEN_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`size-6 rounded-full border transition ${
                      penColor === c.value ? 'scale-110 ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setPenColor(c.value)}
                    title={c.name}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1">Stroke:</span>
                {PEN_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`size-6 rounded-md border flex items-center justify-center transition ${
                      penSize === s ? 'bg-primary text-white border-primary font-bold' : 'bg-card text-foreground hover:bg-muted'
                    }`}
                    onClick={() => setPenSize(s)}
                  >
                    <span className="rounded-full bg-current" style={{ width: s + 2, height: s + 2 }} />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition disabled:opacity-40"
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  title="Undo stroke"
                >
                  <Undo2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition disabled:opacity-40"
                  onClick={clearCanvas}
                  disabled={!hasDrawn}
                  title="Clear canvas"
                >
                  <Eraser className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Canvas Area */}
            <div className="sig-canvas-container" ref={canvasContainerRef}>
              <canvas
                ref={canvasRef}
                className="sig-interactive-canvas"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <div className="sig-canvas-baseline" />
              {!hasDrawn && (
                <div className="sig-placeholder-overlay">
                  <PenLine className="size-8 sig-placeholder-icon" />
                  <span className="sig-placeholder-text">
                    {activeMode === 'draw'
                      ? 'Sign with mouse, trackpad, or stylus here'
                      : activeMode === 'type'
                      ? 'Click "Render on Canvas" to preview typed signature'
                      : 'Uploaded image will appear here'}
                  </span>
                </div>
              )}
            </div>

            {/* Save Form & Action */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="w-full sm:w-64">
                <Input
                  type="text"
                  placeholder="Signature Label (e.g. Official Stamp & Sign)"
                  className="h-9 text-xs rounded-xl"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5"
                  disabled={!hasDrawn}
                  onClick={() => {
                    const canvas = canvasRef.current;
                    if (canvas) handleDownload(canvas.toDataURL('image/png'), signatureName || 'my-signature');
                  }}
                >
                  <Download className="size-3.5" /> Download
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 text-xs gap-1.5"
                  disabled={!hasDrawn || saving}
                  onClick={handleSaveSignature}
                >
                  <Save className="size-3.5" /> {saving ? 'Saving…' : 'Save to My Profile'}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Saved Signatures Gallery */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="overflow-hidden border-border/80 bg-card p-5 shadow-xs space-y-4 flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Star className="size-4 text-amber-500 fill-amber-500" />
                <span className="font-semibold text-foreground text-sm">Saved Signatures ({savedSignatures.length})</span>
              </div>
              <span className="text-[11px] text-muted-foreground">Auto-loaded on contracts</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
                Loading saved signatures...
              </div>
            ) : savedSignatures.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                <FileSignature className="size-10 opacity-30 text-primary" />
                <p className="text-xs font-semibold text-foreground">No signatures saved yet</p>
                <p className="text-[11px] max-w-xs">
                  Create your digital signature on the left and save it. It will be pre-selected when executing vendor contracts.
                </p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[480px] pr-1">
                {savedSignatures.map((sig) => (
                  <div
                    key={sig.id}
                    className={`relative p-3.5 rounded-xl border transition ${
                      sig.isDefault
                        ? 'border-primary/60 bg-primary/5 shadow-xs'
                        : 'border-border/70 bg-card hover:border-primary/30'
                    }`}
                  >
                    {sig.isDefault && (
                      <div className="absolute top-2.5 right-2.5">
                        <Badge tone="primary" className="text-[10px] gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                          <Star className="size-2.5 fill-current" /> Default Signature
                        </Badge>
                      </div>
                    )}

                    <div
                      className="h-20 flex items-center justify-center bg-white rounded-lg border border-border/50 p-2 cursor-pointer hover:border-primary/50 transition my-1"
                      onClick={() => setPreviewSig(sig)}
                      title="Click to view full preview"
                    >
                      <img src={sig.dataUrl} alt={sig.name} className="max-h-full max-w-full object-contain" />
                    </div>

                    <div className="flex items-center justify-between pt-2 mt-1">
                      <div>
                        <div className="text-xs font-semibold text-foreground">{sig.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">
                          {sig.type} · {new Date(sig.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {!sig.isDefault && (
                          <button
                            type="button"
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-amber-500 transition"
                            title="Set as Default for Contracts"
                            onClick={() => handleSetDefault(sig.id)}
                          >
                            <Star className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
                          title="Preview Signature"
                          onClick={() => setPreviewSig(sig)}
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition"
                          title="Download PNG"
                          onClick={() => handleDownload(sig.dataUrl, sig.name)}
                        >
                          <Download className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                          title="Delete Signature"
                          onClick={() => handleDelete(sig.id)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Signature Full Preview Modal */}
      {previewSig &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onClick={() => setPreviewSig(null)}>
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <FileSignature className="size-5 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">{previewSig.name}</h3>
                  {previewSig.isDefault && (
                    <Badge tone="primary" className="text-[10px] gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Star className="size-2.5 fill-current" /> Default
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setPreviewSig(null)}
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex items-center justify-center p-6 bg-white rounded-xl border border-border">
                <img src={previewSig.dataUrl} alt={previewSig.name} className="max-h-48 max-w-full object-contain" />
              </div>

              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Type: {previewSig.type}</span>
                <span>Created: {new Date(previewSig.createdAt).toLocaleDateString()}</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button variant="outline" size="sm" onClick={() => setPreviewSig(null)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    handleDownload(previewSig.dataUrl, previewSig.name);
                    setPreviewSig(null);
                  }}
                >
                  <Download className="size-3.5" /> Download PNG
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
export default VendorSignatureSection;
