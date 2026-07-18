import { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Check, Image as ImageIcon } from 'lucide-react';
import './ImageCropperModal.css';

interface ImageCropperModalProps {
  file: File;
  cropAspectWidth: number;
  cropAspectHeight: number;
  onCrop: (blob: Blob) => void;
  onClose: () => void;
  title?: string;
}

export default function ImageCropperModal({
  file,
  cropAspectWidth,
  cropAspectHeight,
  onCrop,
  onClose,
  title,
}: ImageCropperModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [containerSize, setContainerSize] = useState({ w: 560, h: 320 });
  const [error, setError] = useState<string | null>(null);

  // Zoom & pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Dragging
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ sx: 0, sy: 0, px: 0, py: 0 });

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load image off-screen using useEffect + new Image()
  // This avoids circular dependency: img rendered only when loaded,
  // but we load it off-screen first
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setBlobUrl(url); // triggers re-render so visible img gets the src
    setImgLoaded(false);
    setError(null);
    setZoom(1);
    setPanX(0);
    setPanY(0);

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      setNaturalSize({ w: nw, h: nh });

      // Auto-fit
      const cw = containerSize.w;
      const ch = containerSize.h;
      if (cw > 0 && ch > 0 && nw > 0 && nh > 0) {
        const s = Math.min(cw / nw, ch / nh) * 0.9;
        setZoom(s);
        setPanX((cw - nw * s) / 2);
        setPanY((ch - nh * s) / 2);
      }
      setImgLoaded(true);
    };
    img.onerror = () => {
      if (!cancelled) setError('Failed to load image. Try a different file.');
    };
    img.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // ── Drag handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!imgLoaded) return;
    e.preventDefault();
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panX, py: panY };
  }, [imgLoaded, panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPanX(dragRef.current.px + (e.clientX - dragRef.current.sx));
    setPanY(dragRef.current.py + (e.clientY - dragRef.current.sy));
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // ── Zoom ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!imgLoaded) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => {
      const newZ = Math.max(0.1, Math.min(10, z * factor));
      const ratio = newZ / z;
      setPanX((px) => mx - ratio * (mx - px));
      setPanY((py) => my - ratio * (my - py));
      return newZ;
    });
  }, [imgLoaded]);

  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const ratio = val / zoom;
    setZoom(val);
    setPanX((px) => containerSize.w / 2 - ratio * (containerSize.w / 2 - px));
    setPanY((py) => containerSize.h / 2 - ratio * (containerSize.h / 2 - py));
  }, [zoom, containerSize]);

  // ── Crop dimensions in container coords ──
  const cropBoxW = Math.min(containerSize.w * 0.8, (naturalSize.w || 1) * zoom);
  const cropBoxH = cropBoxW * (cropAspectHeight / cropAspectWidth);
  const cropBoxX = (containerSize.w - cropBoxW) / 2;
  const cropBoxY = (containerSize.h - cropBoxH) / 2;

  // ── Confirm: extract crop from image ──
  const handleConfirm = useCallback(() => {
    if (!imgLoaded || naturalSize.w === 0) return;

    const imgCropX = (cropBoxX - panX) / zoom;
    const imgCropY = (cropBoxY - panY) / zoom;
    const imgCropW = cropBoxW / zoom;
    const imgCropH = cropBoxH / zoom;

    const outW = 400;
    const outH = Math.round(outW * (cropAspectHeight / cropAspectWidth));
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;

    const imgEl = imgRef.current;
    if (!imgEl) return;
    outCtx.drawImage(imgEl, imgCropX, imgCropY, imgCropW, imgCropH, 0, 0, outW, outH);
    outCanvas.toBlob((blob) => {
      if (blob) onCrop(blob);
    }, 'image/png');
  }, [imgLoaded, naturalSize, zoom, panX, panY, cropBoxX, cropBoxY, cropBoxW, cropBoxH, cropAspectWidth, cropAspectHeight, onCrop]);

  return (
    <div className="icm-backdrop" onClick={onClose}>
      <div className="icm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="icm-header">
          <span className="icm-title">
            <ImageIcon size={18} />
            {title || 'Crop Image'}
          </span>
          <button className="icm-close" onClick={onClose}><X size={18} /></button>
        </div>

        {error ? (
          <div className="icm-error">
            <ImageIcon size={28} />
            <p>{error}</p>
            <button className="icm-btn icm-btn--secondary" onClick={onClose}>Close</button>
          </div>
        ) : !imgLoaded ? (
          <div className="icm-loading">
            <ImageIcon size={32} />
            <p>Loading image...</p>
          </div>
        ) : (
          <>
            {/* Preview area */}
            <div
              className="icm-canvas-wrap"
              ref={containerRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            >
              <img
                ref={imgRef}
                src={blobUrl}
                alt="Crop preview"
                className="icm-image"
                style={{
                  transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
                draggable={false}
              />

              {/* Crop overlay */}
              <div className="icm-overlay">
                <div className="icm-overlay-bar" style={{ height: cropBoxY }} />
                <div className="icm-overlay-middle">
                  <div className="icm-overlay-side" style={{ width: cropBoxX }} />
                  <div className="icm-crop-box" style={{ width: cropBoxW, height: cropBoxH }}>
                    <div className="icm-crop-grid">
                      {[0, 1, 2].map((row) =>
                        [0, 1, 2].map((col) => (
                          <div key={`${row}-${col}`} className="icm-grid-cell" />
                        ))
                      )}
                    </div>
                    <div className="icm-handle icm-handle--tl" />
                    <div className="icm-handle icm-handle--tr" />
                    <div className="icm-handle icm-handle--bl" />
                    <div className="icm-handle icm-handle--br" />
                  </div>
                  <div className="icm-overlay-side" style={{ flex: 1 }} />
                </div>
                <div className="icm-overlay-bar" style={{ flex: 1 }} />
              </div>

              <div className="icm-size-label">
                {cropAspectWidth} × {cropAspectHeight} px
              </div>
            </div>

            {/* Controls */}
            <div className="icm-controls">
              <div className="icm-zoom-control">
                <ZoomOut size={16} />
                <input
                  type="range"
                  min={0.1}
                  max={5}
                  step={0.01}
                  value={zoom}
                  onChange={handleZoomSlider}
                  className="icm-zoom-slider"
                />
                <ZoomIn size={16} />
                <span className="icm-zoom-value">{Math.round(zoom * 100)}%</span>
              </div>
              <p className="icm-hint">Drag to position · Scroll or slider to zoom</p>
            </div>

            {/* Actions */}
            <div className="icm-actions">
              <button className="icm-btn icm-btn--secondary" onClick={onClose}>Cancel</button>
              <button className="icm-btn icm-btn--primary" onClick={handleConfirm}>
                <Check size={16} /> Crop & Upload
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
