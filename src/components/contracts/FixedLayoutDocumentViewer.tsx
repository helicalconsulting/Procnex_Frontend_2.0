// ============================================================
// components/contracts/FixedLayoutDocumentViewer.tsx
// Authoritative Fixed-Coordinate Scene Graph Document Viewer & Editor
// Preserves source geometry, aspect ratio, writing lines, checkboxes & boxes
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  FileText,
  Eye,
  Columns,
  ChevronLeft,
  ChevronRight,
  Check,
  RotateCcw,
} from 'lucide-react';
import type { CanonicalPage, CanonicalElement } from '../../types/documentExtraction';
import './FixedLayoutDocumentViewer.css';

export interface CanonicalDocument {
  version?: string;
  extractionId?: string;
  pageCount?: number;
  pages: CanonicalPage[];
  plainText?: string;
  reconstructedHtml?: string;
}

interface FixedLayoutDocumentViewerProps {
  layoutModel: CanonicalDocument;
  originalFileUrl?: string | null;
  onModelChange?: (updatedModel: CanonicalDocument) => void;
  readOnly?: boolean;
}

export const FixedLayoutDocumentViewer: React.FC<FixedLayoutDocumentViewerProps> = ({
  layoutModel,
  originalFileUrl,
  onModelChange,
  readOnly = false,
}) => {
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [mode, setMode] = useState<'reconstructed' | 'original' | 'side-by-side'>('reconstructed');
  const [zoom, setZoom] = useState<number>(1.0);
  const [model, setModel] = useState<CanonicalDocument>(layoutModel);

  // Sync internal state when parent props change
  useEffect(() => {
    setModel(layoutModel);
  }, [layoutModel]);

  const pages = model?.pages || [];
  const totalPages = pages.length > 0 ? pages.length : 1;
  const currentPage: CanonicalPage | undefined = pages[activePageIndex];

  // Page dimensions (defaults to standard 595.28 x 841.89 pt A4 if not provided, but uses source dimensions)
  const pageWidthPt = currentPage?.width || 595.28;
  const pageHeightPt = currentPage?.height || 841.89;

  // Helper to resolve asset URLs with backend server origin
  const resolveBackendUrl = (url?: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    const backendBase = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/api\/?$/, '');
    return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const normalizeFontFamily = (font?: string): string => {
    if (!font) return 'system-ui, -apple-system, sans-serif';
    const clean = font.replace(/[,_-]?(bold|italic|oblique|regular|light|medium|semibold|black|mt)+/gi, '').trim();
    const lower = clean.toLowerCase();
    if (lower.includes('times') || lower.includes('roman') || lower.includes('cambria') || lower.includes('georgia') || lower.includes('garamond') || lower.includes('serif')) {
      return '"Times New Roman", Times, Georgia, serif';
    }
    if (lower.includes('courier') || lower.includes('mono') || lower.includes('consolas') || lower.includes('menlo') || lower.includes('monospace')) {
      return '"Courier New", Courier, monospace';
    }
    if (lower.includes('calibri')) {
      return 'Calibri, Candara, Arial, sans-serif';
    }
    if (lower.includes('arial') || lower.includes('helvetica') || lower.includes('sans')) {
      return 'Arial, Helvetica, "Segoe UI", sans-serif';
    }
    return `"${clean}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  };

  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    setImageLoadError(false);
  }, [activePageIndex, originalFileUrl, currentPage?.previewImageUrl]);

  // Derive preview image/document URL for Original Mode
  const getOriginalPageSource = useCallback(
    (page?: CanonicalPage): { url: string; isPdf: boolean } | null => {
      // 1. If page has a raster preview from PDF extraction, use it directly as high-res image
      if (page?.previewImageUrl && !imageLoadError) {
        const resolvedPreview = resolveBackendUrl(page.previewImageUrl);
        if (resolvedPreview) return { url: resolvedPreview, isPdf: false };
      }

      // 2. If original file is an image, it is the highest fidelity original scan
      const resolvedFileUrl = resolveBackendUrl(originalFileUrl);
      const isFilePdf = resolvedFileUrl ? /\.pdf(\?|$)/i.test(resolvedFileUrl) : false;
      const isFileImage = resolvedFileUrl
        ? /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(resolvedFileUrl)
        : false;

      if (isFileImage && resolvedFileUrl) {
        return { url: resolvedFileUrl, isPdf: false };
      }

      // 3. Fallback to originalFileUrl (works for both images and PDFs)
      if (resolvedFileUrl) {
        return { url: resolvedFileUrl, isPdf: isFilePdf };
      }

      return null;
    },
    [originalFileUrl, imageLoadError]
  );

  const pageSource = getOriginalPageSource(currentPage);

  // Handle text edit on element
  const handleTextChange = (elementId: string, newText: string) => {
    if (readOnly) return;
    setModel((prev) => {
      const updatedPages = prev.pages.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          elements: p.elements.map((el) => {
            if (el.id === elementId) {
              return { ...el, text: newText };
            }
            return el;
          }),
        };
      });
      const updatedDoc = { ...prev, pages: updatedPages };
      if (onModelChange) {
        onModelChange(updatedDoc);
      }
      return updatedDoc;
    });
  };

  // Handle checkbox toggle
  // Handle checkbox toggle (supports tri-state: checked -> unchecked)
  const handleCheckboxToggle = (elementId: string) => {
    if (readOnly) return;
    setModel((prev) => {
      const updatedPages = prev.pages.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          elements: p.elements.map((el) => {
            if (el.id === elementId) {
              const current = el.checkboxState === 'checked' || el.checked === true;
              const nextState = current ? 'unchecked' : 'checked';
              return { ...el, checked: !current, checkboxState: nextState };
            }
            return el;
          }),
        };
      });
      const updatedDoc = { ...prev, pages: updatedPages };
      if (onModelChange) {
        onModelChange(updatedDoc);
      }
      return updatedDoc;
    });
  };

  // Handle fillable form lines (underlines)
  const handleFormLineChange = (elementId: string, value: string) => {
    if (readOnly) return;
    setModel((prev) => {
      const updatedPages = prev.pages.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          elements: p.elements.map((el) => {
            if (el.id === elementId) {
              return { ...el, fieldValue: value };
            }
            return el;
          }),
        };
      });
      const updatedDoc = { ...prev, pages: updatedPages };
      if (onModelChange) {
        onModelChange(updatedDoc);
      }
      return updatedDoc;
    });
  };

  // Handle table cell edit
  const handleTableCellChange = (elementId: string, row: number, col: number, newContent: string) => {
    if (readOnly) return;
    setModel((prev) => {
      const updatedPages = prev.pages.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          elements: p.elements.map((el) => {
            if (el.id === elementId && el.tableData) {
              const exists = el.tableData.cells.some((c) => c.row === row && c.col === col);
              const updatedCells = exists
                ? el.tableData.cells.map((c) => (c.row === row && c.col === col ? { ...c, content: newContent } : c))
                : [...el.tableData.cells, { id: `cell_${elementId}_${row}_${col}`, row, col, content: newContent }];
              return {
                ...el,
                tableData: {
                  ...el.tableData,
                  cells: updatedCells,
                },
              };
            }
            return el;
          }),
        };
      });
      const updatedDoc = { ...prev, pages: updatedPages };
      if (onModelChange) {
        onModelChange(updatedDoc);
      }
      return updatedDoc;
    });
  };

  // Handle acceptance of suggested NLP correction
  const handleAcceptCorrection = (elementId: string) => {
    if (readOnly) return;
    setModel((prev) => {
      const updatedPages = prev.pages.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          elements: p.elements.map((el) => {
            if (el.id === elementId && el.suggestedCorrection) {
              return {
                ...el,
                text: el.suggestedCorrection.suggestedText,
                suggestedCorrection: { ...el.suggestedCorrection, accepted: true },
              };
            }
            return el;
          }),
        };
      });
      const updatedDoc = { ...prev, pages: updatedPages };
      if (onModelChange) {
        onModelChange(updatedDoc);
      }
      return updatedDoc;
    });
  };

  // Render an individual element in Reconstructed Mode
  const renderReconstructedElement = (el: CanonicalElement) => {
    const { bbox } = el;
    const style: React.CSSProperties = {
      left: `${bbox.x}pt`,
      top: `${bbox.y}pt`,
      width: `${bbox.width}pt`,
      minHeight: `${bbox.height}pt`,
      zIndex: el.zIndex || 5,
    };

    // Fill-in blank form line / underline
    if (el.type === 'form_line') {
      const lineHeightPt = 16;
      return (
        <div
          key={el.id}
          className="fld-element fld-element-form-line-container"
          style={{
            left: `${bbox.x}pt`,
            top: `${Math.max(0, bbox.y - lineHeightPt + 1.5)}pt`,
            width: `${bbox.width}pt`,
            height: `${lineHeightPt}pt`,
            zIndex: el.zIndex || 5,
          }}
          title="Fill-in blank line (click to type or fill)"
        >
          <input
            type="text"
            className="fld-form-line-input"
            value={el.fieldValue ?? ''}
            disabled={readOnly}
            placeholder={readOnly ? '' : ''}
            onChange={(e) => handleFormLineChange(el.id, e.target.value)}
          />
        </div>
      );
    }

    // Source-like SVG Checkbox with tri-state support
    if (el.type === 'checkbox') {
      const isChecked = el.checkboxState === 'checked' || el.checked === true;
      const isUnknown = el.checkboxState === 'unknown';
      return (
        <div
          key={el.id}
          className={`fld-element fld-element-checkbox ${
            isChecked ? 'fld-element-checkbox--checked' : ''
          } ${isUnknown ? 'fld-element-checkbox--unknown' : ''}`}
          style={{
            left: `${bbox.x}pt`,
            top: `${bbox.y}pt`,
            width: `${bbox.width}pt`,
            height: `${bbox.height}pt`,
            zIndex: el.zIndex || 6,
          }}
          onClick={() => handleCheckboxToggle(el.id)}
          title={`Checkbox (${isUnknown ? 'Unknown / Uncertain' : isChecked ? 'Checked' : 'Unchecked'})`}
        >
          {isChecked && (
            <svg
              viewBox="0 0 16 16"
              width="100%"
              height="100%"
              fill="none"
              stroke="#1e293b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 8 7 12 13 4" />
            </svg>
          )}
          {isUnknown && !isChecked && (
            <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#f59e0b', lineHeight: 1 }}>?</span>
          )}
        </div>
      );
    }

    if (el.type === 'divider') {
      return (
        <div
          key={el.id}
          className="fld-element fld-element-divider"
          style={{
            left: `${bbox.x}pt`,
            top: `${bbox.y}pt`,
            width: `${bbox.width}pt`,
            height: '1px',
            borderTop: '1px solid #1e293b',
            zIndex: el.zIndex || 1,
            pointerEvents: 'none',
          }}
        />
      );
    }

    if (el.type === 'container_box') {
      return (
        <div
          key={el.id}
          className="fld-element fld-element-container-box"
          style={{
            ...style,
            height: `${bbox.height}pt`,
            border: '1.5px solid #1e293b',
            zIndex: el.zIndex || 2,
          }}
          title="Container / Form Box"
        />
      );
    }

    if (el.type === 'image') {
      const assetUrl = resolveBackendUrl(el.imageData?.assetUrl);
      return (
        <div
          key={el.id}
          className="fld-element fld-element-image"
          style={{
            left: `${bbox.x}pt`,
            top: `${bbox.y}pt`,
            width: `${bbox.width}pt`,
            height: `${bbox.height}pt`,
            zIndex: el.zIndex || 2,
          }}
          title={el.imageData?.graphicType || 'Graphic'}
        >
          {assetUrl ? (
            <img src={assetUrl} alt="graphic" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#e2e8f0', border: '1px dashed #94a3b8' }} />
          )}
        </div>
      );
    }

    if (el.type === 'table' && el.tableData) {
      return (
        <div key={el.id} className="fld-element" style={style}>
          <table className="fld-element-table" style={{ width: '100%', height: '100%' }}>
            {el.tableData.colWidths && el.tableData.colWidths.length > 0 && (
              <colgroup>
                {el.tableData.colWidths.map((w, cIdx) => (
                  <col key={cIdx} style={{ width: `${w}pt` }} />
                ))}
              </colgroup>
            )}
            <tbody>
              {Array.from({ length: el.tableData.rows }).map((_, rIdx) => (
                <tr key={rIdx}>
                  {el.tableData?.cells
                    .filter((c) => c.row === rIdx)
                    .map((cell) => (
                      <td
                        key={cell.id || `${cell.row}-${cell.col}`}
                        rowSpan={cell.rowspan || 1}
                        colSpan={cell.colspan || 1}
                        contentEditable={!readOnly}
                        suppressContentEditableWarning
                        onBlur={(e) => handleTableCellChange(el.id, cell.row, cell.col, e.currentTarget.innerText)}
                        style={{
                          width: `${cell.bbox.width}pt`,
                          textAlign: cell.horizontalAlign || 'left',
                          fontWeight: cell.isHeader ? 'bold' : 'normal',
                          backgroundColor: cell.backgroundColor || 'transparent',
                          cursor: readOnly ? 'default' : 'text',
                        }}
                        title={readOnly ? undefined : 'Click to type or edit cell'}
                      >
                        {cell.content}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Default: text element with optional NLP review pill
    const hasPendingCorrection = el.suggestedCorrection && !el.suggestedCorrection.accepted;
    return (
      <div
        key={el.id}
        className="fld-element fld-element-text"
        style={{
          ...style,
          fontSize: `${el.fontSize || 10}pt`,
          fontWeight: el.fontWeight || 'normal',
          fontStyle: el.fontStyle || 'normal',
          textAlign: el.alignment || 'left',
          color: el.color || '#000000',
          fontFamily: normalizeFontFamily(el.fontFamily),
          lineHeight: 1.15,
        }}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={(e) => handleTextChange(el.id, e.currentTarget.innerText)}
      >
        {el.spans && el.spans.length > 0 ? (
          el.spans.map((span, sIdx) => (
            <span
              key={sIdx}
              style={{
                fontFamily: normalizeFontFamily(span.fontFamily || el.fontFamily),
                fontSize: `${span.fontSize || el.fontSize || 10}pt`,
                fontWeight: span.fontWeight || 'normal',
                fontStyle: span.fontStyle || 'normal',
                color: span.color || el.color || '#000000',
                textDecoration: span.underline ? 'underline' : 'none',
              }}
            >
              {span.text}
            </span>
          ))
        ) : (
          el.text
        )}
        {hasPendingCorrection && !readOnly && (
          <button
            type="button"
            className="fld-suggest-pill"
            title={`Suggested normalization: "${el.suggestedCorrection?.suggestedText}" (Click to accept)`}
            onClick={(e) => {
              e.stopPropagation();
              handleAcceptCorrection(el.id);
            }}
          >
            ✓ Suggest: {el.suggestedCorrection?.suggestedText}
          </button>
        )}
      </div>
    );
  };



  // Render Page Canvas
  const renderPage = (viewMode: 'original' | 'reconstructed') => {
    if (!currentPage) {
      return (
        <div style={{ color: '#94a3b8', padding: 40, textAlign: 'center' }}>
          No page scene data available.
        </div>
      );
    }

    return (
      <div
        className="fld-page-canvas-wrapper"
        style={{
          transform: `scale(${zoom})`,
          width: `${pageWidthPt}pt`,
          height: `${pageHeightPt}pt`,
        }}
      >
        <div
          className="fld-page-canvas"
          style={{
            width: `${pageWidthPt}pt`,
            height: `${pageHeightPt}pt`,
          }}
        >
          {viewMode === 'original' ? (
            <>
              {pageSource ? (
                pageSource.isPdf ? (
                  <iframe
                    src={`${pageSource.url}#page=${activePageIndex + 1}`}
                    title={`Page ${activePageIndex + 1}`}
                    className="fld-original-img"
                    style={{ border: 'none' }}
                  />
                ) : (
                  <img
                    src={pageSource.url}
                    alt={`Page ${activePageIndex + 1}`}
                    className="fld-original-img"
                    onError={() => setImageLoadError(true)}
                  />
                )
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#64748b',
                    fontSize: 13,
                  }}
                >
                  Original document preview not available
                </div>
              )}
            </>
          ) : (
            <>
              {/* White authoritative page scene graph */}
              {currentPage.elements.map(renderReconstructedElement)}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fld-container">
      {/* Top Toolbar */}
      <div className="fld-toolbar">
        {/* Document Modes */}
        <div className="fld-toolbar-group">
          <div className="fld-mode-tabs">
            <button
              type="button"
              className={`fld-mode-tab ${mode === 'original' ? 'fld-mode-tab--active' : ''}`}
              onClick={() => setMode('original')}
              title="View original document appearance with selectable text overlay"
            >
              <Eye size={13} /> Original
            </button>
            <button
              type="button"
              className={`fld-mode-tab ${mode === 'reconstructed' ? 'fld-mode-tab--active' : ''}`}
              onClick={() => setMode('reconstructed')}
              title="Editable reconstructed document preserving exact geometry"
            >
              <FileText size={13} /> Reconstructed (Fixed)
            </button>
            <button
              type="button"
              className={`fld-mode-tab ${mode === 'side-by-side' ? 'fld-mode-tab--active' : ''}`}
              onClick={() => setMode('side-by-side')}
              title="Side-by-side comparison with original"
            >
              <Columns size={13} /> Side-by-Side
            </button>
          </div>
        </div>

        {/* Page Navigation */}
        {totalPages > 1 && (
          <div className="fld-toolbar-group fld-page-nav">
            <button
              type="button"
              className="fld-tool-btn"
              disabled={activePageIndex === 0}
              onClick={() => setActivePageIndex((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={13} />
            </button>
            <span>
              Page {activePageIndex + 1} of {totalPages}
            </span>
            <button
              type="button"
              className="fld-tool-btn"
              disabled={activePageIndex >= totalPages - 1}
              onClick={() => setActivePageIndex((p) => Math.min(totalPages - 1, p + 1))}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* Zoom Controls */}
        <div className="fld-toolbar-group">
          <button
            type="button"
            className="fld-tool-btn"
            onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: 12, minWidth: 42, textAlign: 'center', color: '#94a3b8' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="fld-tool-btn"
            onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(2))))}
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            className="fld-tool-btn"
            onClick={() => setZoom(1.0)}
            title="Reset Zoom to 100%"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Viewport Content */}
      {mode === 'side-by-side' ? (
        <div className="fld-split-viewport">
          <div className="fld-split-pane">
            <div className="fld-pane-title">
              <Eye size={13} /> Original Appearance
            </div>
            {renderPage('original')}
          </div>
          <div className="fld-split-pane">
            <div className="fld-pane-title">
              <FileText size={13} /> Reconstructed Editable View
            </div>
            {renderPage('reconstructed')}
          </div>
        </div>
      ) : (
        <div className="fld-viewport">
          {mode === 'original' ? renderPage('original') : renderPage('reconstructed')}
        </div>
      )}
    </div>
  );
};

export default FixedLayoutDocumentViewer;
