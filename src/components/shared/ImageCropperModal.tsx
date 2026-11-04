import { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import './ImageCropperModal.css';

interface ImageCropperModalProps {
  file: File;
  cropAspectWidth: number;
  cropAspectHeight: number;
  onCrop: (blob: Blob) => void;
  onClose: () => void;
  title?: string;
}

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragMode = 'move' | 'h-tl' | 'h-tr' | 'h-bl' | 'h-br' | 'h-tm' | 'h-bm' | 'h-lm' | 'h-rm' | 'pan' | null;

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
  const [viewportSize, setViewportSize] = useState({ w: 540, h: 400 });
  const [error, setError] = useState<string | null>(null);

  // Zoom and Pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Crop Box state in viewport coordinates
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, w: 0, h: 0 });

  // Drag interaction state
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCropBox: CropBox;
    startPanX: number;
    startPanY: number;
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    startCropBox: { x: 0, y: 0, w: 0, h: 0 },
    startPanX: 0,
    startPanY: 0,
  });

  // Aspect ratio (height / width)
  const aspect = cropAspectHeight / cropAspectWidth;

  // Measure container viewport on mount and resize
  const measureViewport = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ w: rect.width, h: rect.height });
      }
    }
  }, []);

  useEffect(() => {
    measureViewport();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureViewport);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureViewport]);

  // Load image from File
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
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

      const vw = containerRef.current?.clientWidth || viewportSize.w || 540;
      const vh = containerRef.current?.clientHeight || viewportSize.h || 400;

      // Fit contained
      const baseScale = Math.min(vw / nw, vh / nh);
      const dw = nw * baseScale;
      const dh = nh * baseScale;
      const imgX = (vw - dw) / 2;
      const imgY = (vh - dh) / 2;

      // Initial crop box: 75% of min dimension centered on image
      let cbW = Math.min(dw, dh) * 0.75;
      let cbH = cbW * aspect;
      if (cbH > dh) {
        cbH = dh * 0.75;
        cbW = cbH / aspect;
      }
      const cbX = imgX + (dw - cbW) / 2;
      const cbY = imgY + (dh - cbH) / 2;

      setCropBox({ x: cbX, y: cbY, w: cbW, h: cbH });
      setImgLoaded(true);
    };

    img.onerror = () => {
      if (!cancelled) setError('Failed to load image. Please select a valid image file.');
    };
    img.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Compute displayed image geometry
  const baseScale = naturalSize.w > 0 && naturalSize.h > 0
    ? Math.min(viewportSize.w / naturalSize.w, viewportSize.h / naturalSize.h)
    : 1;
  const dw = naturalSize.w * baseScale * zoom;
  const dh = naturalSize.h * baseScale * zoom;
  const imgLeft = (viewportSize.w - dw) / 2 + panX;
  const imgTop = (viewportSize.h - dh) / 2 + panY;

  // Zoom handlers
  const handleZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.max(0.5, Math.min(4.0, newZoom));
    setZoom(clamped);
  }, []);

  const handleZoomIn = () => handleZoomChange(zoom * 1.15);
  const handleZoomOut = () => handleZoomChange(zoom / 1.15);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    handleZoomChange(zoom * factor);
  };

  // Mouse drag handlers
  const startDrag = (e: React.MouseEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCropBox: { ...cropBox },
      startPanX: panX,
      startPanY: panY,
    };

    const handleMouseMove = (me: MouseEvent) => {
      const { mode, startX, startY, startCropBox, startPanX, startPanY } = dragRef.current;
      if (!mode) return;

      const dx = me.clientX - startX;
      const dy = me.clientY - startY;

      if (mode === 'pan') {
        setPanX(startPanX + dx);
        setPanY(startPanY + dy);
        return;
      }

      if (mode === 'move') {
        // Move crop box, clamp to image bounds
        const minX = imgLeft;
        const maxX = imgLeft + dw - startCropBox.w;
        const minY = imgTop;
        const maxY = imgTop + dh - startCropBox.h;

        const newX = Math.max(minX, Math.min(maxX, startCropBox.x + dx));
        const newY = Math.max(minY, Math.min(maxY, startCropBox.y + dy));

        setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
        return;
      }

      // Handle resizing with aspect ratio preservation
      const minSize = 40;
      let newW = startCropBox.w;
      let newH = startCropBox.h;
      let newX = startCropBox.x;
      let newY = startCropBox.y;

      if (mode === 'h-br' || mode === 'h-bm' || mode === 'h-rm') {
        const delta = Math.max(dx, dy / aspect);
        newW = Math.max(minSize, Math.min(imgLeft + dw - startCropBox.x, startCropBox.w + delta));
        newH = newW * aspect;
        if (startCropBox.y + newH > imgTop + dh) {
          newH = imgTop + dh - startCropBox.y;
          newW = newH / aspect;
        }
      } else if (mode === 'h-tl') {
        const delta = Math.min(dx, dy / aspect);
        newW = Math.max(minSize, startCropBox.w - delta);
        newH = newW * aspect;
        newX = startCropBox.x + (startCropBox.w - newW);
        newY = startCropBox.y + (startCropBox.h - newH);

        if (newX < imgLeft) {
          newX = imgLeft;
          newW = startCropBox.x + startCropBox.w - newX;
          newH = newW * aspect;
          newY = startCropBox.y + startCropBox.h - newH;
        }
        if (newY < imgTop) {
          newY = imgTop;
          newH = startCropBox.y + startCropBox.h - newY;
          newW = newH / aspect;
          newX = startCropBox.x + startCropBox.w - newW;
        }
      } else if (mode === 'h-tr' || mode === 'h-tm') {
        const delta = Math.max(dx, -dy / aspect);
        newW = Math.max(minSize, Math.min(imgLeft + dw - startCropBox.x, startCropBox.w + delta));
        newH = newW * aspect;
        newY = startCropBox.y + startCropBox.h - newH;

        if (newY < imgTop) {
          newY = imgTop;
          newH = startCropBox.y + startCropBox.h - newY;
          newW = newH / aspect;
        }
      } else if (mode === 'h-bl' || mode === 'h-lm') {
        const delta = Math.max(-dx, dy / aspect);
        newW = Math.max(minSize, startCropBox.w + delta);
        newH = newW * aspect;
        newX = startCropBox.x + startCropBox.w - newW;

        if (newX < imgLeft) {
          newX = imgLeft;
          newW = startCropBox.x + startCropBox.w - newX;
          newH = newW * aspect;
        }
        if (startCropBox.y + newH > imgTop + dh) {
          newH = imgTop + dh - startCropBox.y;
          newW = newH / aspect;
          newX = startCropBox.x + startCropBox.w - newW;
        }
      }

      setCropBox({
        x: Math.round(newX),
        y: Math.round(newY),
        w: Math.round(newW),
        h: Math.round(newH),
      });
    };

    const handleMouseUp = () => {
      dragRef.current.mode = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Perform accurate crop extraction and upload
  const handleConfirmCrop = useCallback(() => {
    const imgEl = imgRef.current;
    if (!imgEl || !imgLoaded || naturalSize.w === 0 || naturalSize.h === 0) return;

    // Convert cropBox from viewport display coords to natural image coords
    const scaleX = naturalSize.w / dw;
    const scaleY = naturalSize.h / dh;

    const naturalCropX = Math.max(0, (cropBox.x - imgLeft) * scaleX);
    const naturalCropY = Math.max(0, (cropBox.y - imgTop) * scaleY);
    const naturalCropW = Math.min(naturalSize.w - naturalCropX, cropBox.w * scaleX);
    const naturalCropH = Math.min(naturalSize.h - naturalCropY, cropBox.h * scaleY);

    const outCanvas = document.createElement('canvas');
    const outW = 512;
    const outH = Math.round(outW * aspect);
    outCanvas.width = outW;
    outCanvas.height = outH;

    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      imgEl,
      naturalCropX,
      naturalCropY,
      naturalCropW,
      naturalCropH,
      0,
      0,
      outW,
      outH
    );

    outCanvas.toBlob(
      (blob) => {
        if (blob) {
          onCrop(blob);
        }
      },
      'image/png',
      1.0
    );
  }, [imgLoaded, naturalSize, dw, dh, cropBox, imgLeft, imgTop, aspect, onCrop]);

  return (
    <div className="cropper-backdrop" onClick={onClose}>
      <div className="cropper-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cropper-header">
          <h3>{title || 'Crop the photo'}</h3>
          <button
            type="button"
            className="cropper-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewport */}
        {error ? (
          <div className="cropper-error">
            <p>{error}</p>
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : !imgLoaded ? (
          <div className="cropper-loading">
            <div className="cropper-spinner" />
            <p>Loading photo…</p>
          </div>
        ) : (
          <div
            className="cropper-viewport"
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={(e) => startDrag(e, 'pan')}
          >
            {/* The Image */}
            <img
              ref={imgRef}
              src={blobUrl}
              alt="Raw preview"
              className="cropper-source-img"
              style={{
                left: `${imgLeft}px`,
                top: `${imgTop}px`,
                width: `${dw}px`,
                height: `${dh}px`,
              }}
              draggable={false}
            />

            {/* The Crop Box on top with dimming box-shadow overlay */}
            <div
              className="cropper-crop-box"
              style={{
                left: `${cropBox.x}px`,
                top: `${cropBox.y}px`,
                width: `${cropBox.w}px`,
                height: `${cropBox.h}px`,
              }}
              onMouseDown={(e) => startDrag(e, 'move')}
            >
              {/* Rule-of-Thirds Grid */}
              <div className="cropper-grid">
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
                <div className="cropper-grid-cell" />
              </div>

              {/* 8 Resize Handles */}
              <div className="cropper-handle h-tl" onMouseDown={(e) => startDrag(e, 'h-tl')} />
              <div className="cropper-handle h-tm" onMouseDown={(e) => startDrag(e, 'h-tm')} />
              <div className="cropper-handle h-tr" onMouseDown={(e) => startDrag(e, 'h-tr')} />
              <div className="cropper-handle h-rm" onMouseDown={(e) => startDrag(e, 'h-rm')} />
              <div className="cropper-handle h-br" onMouseDown={(e) => startDrag(e, 'h-br')} />
              <div className="cropper-handle h-bm" onMouseDown={(e) => startDrag(e, 'h-bm')} />
              <div className="cropper-handle h-bl" onMouseDown={(e) => startDrag(e, 'h-bl')} />
              <div className="cropper-handle h-lm" onMouseDown={(e) => startDrag(e, 'h-lm')} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="cropper-footer">
          <div className="zoom-buttons">
            <button
              type="button"
              className="zoom-btn"
              onClick={handleZoomOut}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              className="zoom-btn"
              onClick={handleZoomIn}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <div className="action-buttons">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Nevermind
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmCrop}
              disabled={!imgLoaded}
            >
              Crop and upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
