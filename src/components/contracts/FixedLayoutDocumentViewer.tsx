// ============================================================
// components/contracts/FixedLayoutDocumentViewer.tsx
// Authoritative Fixed-Coordinate Scene Graph Document Viewer & Editor
// Preserves source geometry, aspect ratio, writing lines, checkboxes & boxes
// Directly incorporates rich typography, formatting, element manipulation,
// and signature drop over the reconstructed fixed document.
// ============================================================

import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  ZoomIn,
  ZoomOut,
  FileText,
  Eye,
  Columns,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  PenTool,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Trash2,
  Copy,
  Move,
  CheckSquare,
  Minus,
  Table,
  FileSignature,
} from 'lucide-react';
import RichTextEditor, { type RichTextEditorRef } from '../shared/RichTextEditor';
import { canonicalModelToHtml } from '../../utils/documentModelToHtml';
import type { CanonicalPage, CanonicalElement, ElementType } from '../../types/documentExtraction';
import { API_BASE } from '../../api/client';
import './FixedLayoutDocumentViewer.css';

export interface CanonicalDocument {
  version?: string;
  extractionId?: string;
  pageCount?: number;
  pages: CanonicalPage[];
  plainText?: string;
  reconstructedHtml?: string;
}

export interface FixedLayoutDocumentViewerRef {
  insertSignature: (dataUrl: string) => void;
  insertPlaceholder: (code: string) => void;
  getSelectedElement: () => CanonicalElement | null;
}

interface FixedLayoutDocumentViewerProps {
  layoutModel: CanonicalDocument;
  originalFileUrl?: string | null;
  originalFileName?: string | null;
  fileType?: string | null;
  onModelChange?: (updatedModel: CanonicalDocument) => void;
  readOnly?: boolean;
  contentHtml?: string;
  onContentHtmlChange?: (html: string) => void;
  editorRef?: React.RefObject<RichTextEditorRef | null>;
  onSwitchToWysiwyg?: () => void;
}

export const FixedLayoutDocumentViewer = forwardRef<FixedLayoutDocumentViewerRef, FixedLayoutDocumentViewerProps>(
  (
    {
      layoutModel,
      originalFileUrl,
      originalFileName,
      fileType,
      onModelChange,
      readOnly = false,
      contentHtml,
      onContentHtmlChange,
      editorRef,
      onSwitchToWysiwyg,
    },
    ref
  ) => {
    const [activePageIndex, setActivePageIndex] = useState<number>(0);
    // Default to Reconstructed (Fixed) as requested: user wants to edit directly on the reconstructed document
    const [mode, setMode] = useState<'reconstructed' | 'original' | 'side-by-side' | 'wysiwyg'>('reconstructed');
    const [zoom, setZoom] = useState<number>(1.0);
    const [model, setModel] = useState<CanonicalDocument>(layoutModel);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [, setDraggingElementId] = useState<string | null>(null);
    const dragStartPos = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

    // Sync internal state when parent props change
    useEffect(() => {
      setModel(layoutModel);
    }, [layoutModel]);

    // Ensure contentHtml has the reconstructed document text whenever WYSIWYG is active
    useEffect(() => {
      if ((!contentHtml || !contentHtml.trim() || contentHtml === '<p></p>') && layoutModel) {
        const reconstructedHtml = canonicalModelToHtml(layoutModel);
        if (reconstructedHtml && onContentHtmlChange) {
          onContentHtmlChange(reconstructedHtml);
        }
      }
    }, [contentHtml, layoutModel, onContentHtmlChange]);

    const pages = (model?.pages && model.pages.length > 0) ? model.pages : [
      {
        pageIndex: 0,
        width: 595.28,
        height: 841.89,
        rotation: 0,
        coordinateUnit: 'pt' as const,
        previewImageUrl: originalFileUrl || null,
        processingStatus: 'COMPLETED' as const,
        extractionMethod: 'ocr' as const,
        elements: [],
      }
    ];
    const totalPages = pages.length > 0 ? pages.length : 1;
    const currentPage: CanonicalPage | undefined = pages[activePageIndex] || pages[0];

    // Page dimensions
    const pageWidthPt = currentPage?.width || 595.28;
    const pageHeightPt = currentPage?.height || 841.89;

    const selectedElement = currentPage?.elements?.find((e) => e.id === selectedElementId);

    // Helper to resolve asset URLs with backend server origin
    const resolveBackendUrl = (url?: string | null): string | null => {
      if (!url) return null;
      if (url.startsWith('blob:') || url.startsWith('data:')) {
        return url;
      }
      const backendBase = (API_BASE || 'http://localhost:3000/api').replace(/\/api\/?$/, '');

      if (
        url.startsWith('http://localhost:3000') &&
        typeof window !== 'undefined' &&
        !window.location.hostname.includes('localhost') &&
        !window.location.hostname.includes('127.0.0.1')
      ) {
        return url.replace('http://localhost:3000', backendBase);
      }

      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    const normalizeFontFamily = (font?: string): string => {
      if (!font) return 'Arial, Helvetica, sans-serif';
      const clean = font.replace(/[,_-]?(bold|italic|oblique|regular|light|medium|semibold|black|mt)+/gi, '').trim();
      const lower = clean.toLowerCase();
      if (
        lower.includes('times') ||
        lower.includes('roman') ||
        lower.includes('cambria') ||
        lower.includes('georgia') ||
        lower.includes('garamond') ||
        lower.includes('serif')
      ) {
        return '"Times New Roman", Times, Georgia, serif';
      }
      if (lower.includes('courier') || lower.includes('mono') || lower.includes('consolas') || lower.includes('menlo')) {
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
      (page?: CanonicalPage): string | null => {
        if (page?.previewImageUrl && !imageLoadError) {
          const resolvedPreview = resolveBackendUrl(page.previewImageUrl);
          if (resolvedPreview) return resolvedPreview;
        }

        const resolvedFileUrl = resolveBackendUrl(originalFileUrl);
        if (!resolvedFileUrl) return null;

        const isKnownImage = Boolean(
          (/\.(jpe?g|png|webp|gif|bmp|svg)(\?|$)/i.test(resolvedFileUrl) ||
            (fileType && fileType.startsWith('image/')) ||
            (originalFileName && /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(originalFileName))) &&
            !imageLoadError
        );

        if (isKnownImage) {
          return resolvedFileUrl;
        }

        const backendBase = (API_BASE || 'http://localhost:3000/api').replace(/\/api\/?$/, '');
        const pageNum = activePageIndex + 1;
        return `${backendBase}/api/vendors/pdf-page-image?url=${encodeURIComponent(resolvedFileUrl)}&page=${pageNum}`;
      },
      [activePageIndex, fileType, imageLoadError, originalFileName, originalFileUrl]
    );

    const pageSourceUrl = getOriginalPageSource(currentPage);

    // Update style on element
    const handleUpdateElementStyle = (elementId: string | null, updates: Partial<CanonicalElement>) => {
      if (readOnly || !elementId) return;
      setModel((prev) => {
        const updatedPages = prev.pages.map((p, pIdx) => {
          if (pIdx !== activePageIndex) return p;
          return {
            ...p,
            elements: p.elements.map((el) => {
              if (el.id === elementId) {
                return { ...el, ...updates };
              }
              return el;
            }),
          };
        });
        const updatedDoc = { ...prev, pages: updatedPages };
        if (onModelChange) onModelChange(updatedDoc);
        return updatedDoc;
      });
    };

    // Add an element to the current page
    const addElementToCurrentPage = (newEl: CanonicalElement) => {
      if (readOnly) return;
      setModel((prev) => {
        const updatedPages = prev.pages.map((p, pIdx) => {
          if (pIdx !== activePageIndex) return p;
          return {
            ...p,
            elements: [...p.elements, newEl],
          };
        });
        const updatedDoc = { ...prev, pages: updatedPages };
        if (onModelChange) onModelChange(updatedDoc);
        return updatedDoc;
      });
    };

    // Add a new element by type
    const handleAddElement = (type: ElementType) => {
      if (readOnly) return;
      const count = currentPage?.elements?.length || 0;
      const baseId = `el_new_${Date.now()}`;
      let newEl: CanonicalElement;

      if (type === 'form_line') {
        newEl = {
          id: baseId,
          pageIndex: activePageIndex,
          type: 'form_line',
          bbox: { x: 50, y: 300, width: 220, height: 16 },
          readingOrder: count + 1,
          source: 'user_edit',
          text: 'Authorized Signature',
        };
      } else if (type === 'checkbox') {
        newEl = {
          id: baseId,
          pageIndex: activePageIndex,
          type: 'checkbox',
          bbox: { x: 50, y: 340, width: 14, height: 14 },
          readingOrder: count + 1,
          source: 'user_edit',
          text: 'Agreed & Accepted',
          checked: false,
        };
      } else if (type === 'table') {
        newEl = {
          id: baseId,
          pageIndex: activePageIndex,
          type: 'table',
          bbox: { x: 50, y: 380, width: 450, height: 80 },
          readingOrder: count + 1,
          source: 'user_edit',
          tableData: {
            rows: 2,
            cols: 2,
            hasBorders: true,
            colWidths: [225, 225],
            cells: [
              { id: 'c1', row: 0, col: 0, bbox: { x: 50, y: 380, width: 225, height: 35 }, content: 'Item / Clause', isHeader: true },
              { id: 'c2', row: 0, col: 1, bbox: { x: 275, y: 380, width: 225, height: 35 }, content: 'Specifications / Details', isHeader: true },
              { id: 'c3', row: 1, col: 0, bbox: { x: 50, y: 415, width: 225, height: 45 }, content: 'Scope of Supply' },
              { id: 'c4', row: 1, col: 1, bbox: { x: 275, y: 415, width: 225, height: 45 }, content: 'As agreed in Annexure' },
            ],
          },
        };
      } else {
        // Text element
        newEl = {
          id: baseId,
          pageIndex: activePageIndex,
          type: 'text',
          bbox: { x: 50, y: 250, width: 350, height: 22 },
          readingOrder: count + 1,
          source: 'user_edit',
          text: 'Enter contract clause or text here...',
          fontSize: 11,
          fontWeight: 'normal',
          fontFamily: 'Arial, sans-serif',
          alignment: 'left',
          color: '#000000',
        };
      }

      addElementToCurrentPage(newEl);
      setSelectedElementId(newEl.id);
    };

    // Delete selected element
    const handleDeleteElement = (elementId: string) => {
      if (readOnly || !elementId) return;
      setModel((prev) => {
        const updatedPages = prev.pages.map((p, pIdx) => {
          if (pIdx !== activePageIndex) return p;
          return {
            ...p,
            elements: p.elements.filter((el) => el.id !== elementId),
          };
        });
        const updatedDoc = { ...prev, pages: updatedPages };
        if (onModelChange) onModelChange(updatedDoc);
        return updatedDoc;
      });
      setSelectedElementId(null);
    };

    // Duplicate selected element
    const handleDuplicateElement = (elementId: string) => {
      if (readOnly || !elementId) return;
      const target = currentPage?.elements?.find((e) => e.id === elementId);
      if (!target) return;
      const cloned: CanonicalElement = {
        ...target,
        id: `el_dup_${Date.now()}`,
        bbox: {
          ...target.bbox,
          y: target.bbox.y + 20,
        },
        readingOrder: (currentPage?.elements?.length || 0) + 1,
        source: 'user_edit',
      };
      addElementToCurrentPage(cloned);
      setSelectedElementId(cloned.id);
    };

    // Handle inline text editing
    const handleTextChange = (elementId: string, newText: string) => {
      if (readOnly) return;
      handleUpdateElementStyle(elementId, { text: newText });
    };

    // Handle checkbox toggle
    const handleCheckboxToggle = (elementId: string) => {
      if (readOnly) return;
      const target = currentPage?.elements?.find((e) => e.id === elementId);
      if (!target) return;
      const current = target.checkboxState === 'checked' || target.checked === true;
      handleUpdateElementStyle(elementId, {
        checked: !current,
        checkboxState: current ? 'unchecked' : 'checked',
      });
    };

    // Handle fillable form lines
    const handleFormLineChange = (elementId: string, value: string) => {
      if (readOnly) return;
      handleUpdateElementStyle(elementId, { fieldValue: value });
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
        if (onModelChange) onModelChange(updatedDoc);
        return updatedDoc;
      });
    };

    // Handle dropping signature or placeholder directly onto page canvas
    const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = Math.max(0, Math.round(((e.clientX - rect.left) / zoom) * 10) / 10);
      const dropY = Math.max(0, Math.round(((e.clientY - rect.top) / zoom) * 10) / 10);

      const htmlData = e.dataTransfer.getData('text/html');
      const plainData = e.dataTransfer.getData('text/plain');

      // Check if signature image was dropped
      const imgMatch = htmlData.match(/<img[^>]+src="([^">]+)"/i);
      if (imgMatch && imgMatch[1]) {
        const sigSrc = imgMatch[1];
        const newEl: CanonicalElement = {
          id: `sig_${Date.now()}`,
          pageIndex: activePageIndex,
          type: 'image',
          bbox: { x: dropX, y: dropY, width: 150, height: 55 },
          readingOrder: (currentPage?.elements?.length || 0) + 1,
          source: 'user_edit',
          imageData: {
            assetUrl: sigSrc,
            graphicType: 'signature',
            isEditable: true,
          },
        };
        addElementToCurrentPage(newEl);
        setSelectedElementId(newEl.id);
        return;
      }

      // Check if placeholder was dropped
      if (plainData && plainData.startsWith('{{') && plainData.endsWith('}}')) {
        const newEl: CanonicalElement = {
          id: `tag_${Date.now()}`,
          pageIndex: activePageIndex,
          type: 'text',
          bbox: { x: dropX, y: dropY, width: 200, height: 20 },
          readingOrder: (currentPage?.elements?.length || 0) + 1,
          source: 'user_edit',
          text: plainData,
          fontSize: 11,
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
          color: '#0f766e',
        };
        addElementToCurrentPage(newEl);
        setSelectedElementId(newEl.id);
      }
    };

    // Start moving element across canvas
    const startElementDrag = (e: React.MouseEvent, elId: string, initialX: number, initialY: number) => {
      e.stopPropagation();
      e.preventDefault();
      setDraggingElementId(elId);
      dragStartPos.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: initialX,
        origY: initialY,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartPos.current) return;
        const dx = (moveEvent.clientX - dragStartPos.current.startX) / zoom;
        const dy = (moveEvent.clientY - dragStartPos.current.startY) / zoom;
        const newX = Math.max(0, Math.round((dragStartPos.current.origX + dx) * 10) / 10);
        const newY = Math.max(0, Math.round((dragStartPos.current.origY + dy) * 10) / 10);

        setModel((prev) => ({
          ...prev,
          pages: prev.pages.map((p, pIdx) => {
            if (pIdx !== activePageIndex) return p;
            return {
              ...p,
              elements: p.elements.map((elem) => {
                if (elem.id === elId) {
                  return {
                    ...elem,
                    bbox: { ...elem.bbox, x: newX, y: newY },
                  };
                }
                return elem;
              }),
            };
          }),
        }));
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        setDraggingElementId(null);
        dragStartPos.current = null;
        setModel((latest) => {
          if (onModelChange) onModelChange(latest);
          return latest;
        });
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    // Expose ref methods to parent
    useImperativeHandle(ref, () => ({
      insertSignature: (dataUrl: string) => {
        const newEl: CanonicalElement = {
          id: `sig_${Date.now()}`,
          pageIndex: activePageIndex,
          type: 'image',
          bbox: { x: 330, y: Math.min(pageHeightPt - 120, 680), width: 160, height: 60 },
          readingOrder: (currentPage?.elements?.length || 0) + 1,
          source: 'user_edit',
          imageData: {
            assetUrl: dataUrl,
            graphicType: 'signature',
            isEditable: true,
          },
        };
        addElementToCurrentPage(newEl);
        setSelectedElementId(newEl.id);
      },
      insertPlaceholder: (code: string) => {
        if (selectedElementId) {
          const target = currentPage?.elements?.find((e) => e.id === selectedElementId);
          if (target && target.type === 'text') {
            handleUpdateElementStyle(selectedElementId, {
              text: `${target.text || ''} ${code} `,
            });
            return;
          }
        }
        const newEl: CanonicalElement = {
          id: `tag_${Date.now()}`,
          pageIndex: activePageIndex,
          type: 'text',
          bbox: { x: 50, y: 200, width: 220, height: 20 },
          readingOrder: (currentPage?.elements?.length || 0) + 1,
          source: 'user_edit',
          text: code,
          fontSize: 11,
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
          color: '#0f766e',
        };
        addElementToCurrentPage(newEl);
        setSelectedElementId(newEl.id);
      },
      getSelectedElement: () => selectedElement || null,
    }));

    // Render an individual element in Reconstructed Mode
    const renderReconstructedElement = (el: CanonicalElement) => {
      const { bbox } = el;
      const isSelected = selectedElementId === el.id;

      const style: React.CSSProperties = {
        left: `${bbox.x}pt`,
        top: `${bbox.y}pt`,
        width: `${bbox.width}pt`,
        minHeight: `${bbox.height}pt`,
        zIndex: isSelected ? 30 : el.zIndex || 5,
      };

      // Fill-in blank form line / underline
      if (el.type === 'form_line') {
        const lineHeightPt = 16;
        return (
          <div
            key={el.id}
            className={`fld-element fld-element-form-line-container ${isSelected ? 'fld-element--selected' : ''}`}
            style={{
              left: `${bbox.x}pt`,
              top: `${Math.max(0, bbox.y - lineHeightPt + 1.5)}pt`,
              width: `${bbox.width}pt`,
              height: `${lineHeightPt}pt`,
              zIndex: isSelected ? 30 : el.zIndex || 5,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedElementId(el.id);
            }}
            title="Fill-in blank line (click to type or select)"
          >
            {isSelected && !readOnly && (
              <div
                className="fld-element-drag-handle"
                onMouseDown={(e) => startElementDrag(e, el.id, bbox.x, bbox.y)}
                title="Drag to move"
              >
                <Move size={10} />
              </div>
            )}
            <input
              type="text"
              className="fld-form-line-input"
              value={el.fieldValue ?? ''}
              disabled={readOnly}
              placeholder={el.text || ''}
              onChange={(e) => handleFormLineChange(el.id, e.target.value)}
            />
          </div>
        );
      }

      // Checkbox with tri-state support
      if (el.type === 'checkbox') {
        const isChecked = el.checkboxState === 'checked' || el.checked === true;
        return (
          <div
            key={el.id}
            className={`fld-element fld-element-checkbox ${isChecked ? 'fld-element-checkbox--checked' : ''} ${
              isSelected ? 'fld-element--selected' : ''
            }`}
            style={{
              left: `${bbox.x}pt`,
              top: `${bbox.y}pt`,
              width: `${bbox.width}pt`,
              height: `${bbox.height}pt`,
              zIndex: isSelected ? 30 : el.zIndex || 6,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedElementId(el.id);
              handleCheckboxToggle(el.id);
            }}
            title={`Checkbox (${isChecked ? 'Checked' : 'Unchecked'})`}
          >
            {isSelected && !readOnly && (
              <div
                className="fld-element-drag-handle"
                onMouseDown={(e) => startElementDrag(e, el.id, bbox.x, bbox.y)}
                title="Drag to move"
              >
                <Move size={10} />
              </div>
            )}
            {isChecked && (
              <svg viewBox="0 0 16 16" width="100%" height="100%" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 8 7 12 13 4" />
              </svg>
            )}
          </div>
        );
      }

      // Divider line
      if (el.type === 'divider') {
        return (
          <div
            key={el.id}
            className={`fld-element fld-element-divider ${isSelected ? 'fld-element--selected' : ''}`}
            style={{
              left: `${bbox.x}pt`,
              top: `${bbox.y}pt`,
              width: `${bbox.width}pt`,
              height: '2px',
              borderTop: '1.5px solid #1e293b',
              zIndex: isSelected ? 30 : el.zIndex || 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedElementId(el.id);
            }}
          />
        );
      }

      // Image / Signature
      if (el.type === 'image') {
        const assetUrl = resolveBackendUrl(el.imageData?.assetUrl);
        return (
          <div
            key={el.id}
            className={`fld-element fld-element-image ${isSelected ? 'fld-element--selected' : ''}`}
            style={{
              left: `${bbox.x}pt`,
              top: `${bbox.y}pt`,
              width: `${bbox.width}pt`,
              height: `${bbox.height}pt`,
              zIndex: isSelected ? 30 : el.zIndex || 8,
              cursor: !readOnly ? 'move' : 'default',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedElementId(el.id);
            }}
            onMouseDown={!readOnly ? (e) => startElementDrag(e, el.id, bbox.x, bbox.y) : undefined}
            title={el.imageData?.graphicType === 'signature' ? 'Signature (Drag to move, click to select)' : el.imageData?.graphicType || 'Graphic'}
          >
            {isSelected && !readOnly && (
              <div className="fld-element-drag-handle">
                <Move size={10} />
              </div>
            )}
            {assetUrl ? (
              <img src={assetUrl} alt="graphic" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#e2e8f0', border: '1px dashed #94a3b8' }} />
            )}
          </div>
        );
      }

      // Table Element
      if (el.type === 'table' && el.tableData) {
        return (
          <div
            key={el.id}
            className={`fld-element ${isSelected ? 'fld-element--selected' : ''}`}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedElementId(el.id);
            }}
          >
            {isSelected && !readOnly && (
              <div
                className="fld-element-drag-handle"
                onMouseDown={(e) => startElementDrag(e, el.id, bbox.x, bbox.y)}
                title="Drag to move"
              >
                <Move size={10} />
              </div>
            )}
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

      // Default: Text element with in-place rich formatting
      const safeFontSize = Math.min(Math.max(el.fontSize || 10, 8.5), 18);
      return (
        <div
          key={el.id}
          className={`fld-element fld-element-text ${isSelected ? 'fld-element--selected' : ''}`}
          style={{
            ...style,
            fontSize: `${safeFontSize}pt`,
            fontWeight: el.fontWeight || 'normal',
            fontStyle: el.fontStyle || 'normal',
            textAlign: el.alignment || 'left',
            color: el.color || '#000000',
            fontFamily: normalizeFontFamily(el.fontFamily),
            lineHeight: 1.25,
            minHeight: `${Math.min(bbox.height, 24)}pt`,
          }}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onClick={(e) => {
            e.stopPropagation();
            setSelectedElementId(el.id);
          }}
          onFocus={() => setSelectedElementId(el.id)}
          onBlur={(e) => handleTextChange(el.id, e.currentTarget.innerText)}
        >
          {isSelected && !readOnly && (
            <div
              className="fld-element-drag-handle"
              onMouseDown={(e) => startElementDrag(e, el.id, bbox.x, bbox.y)}
              title="Drag to move"
            >
              <Move size={10} />
            </div>
          )}
          {el.spans && el.spans.length > 0 ? (
            el.spans.map((span, sIdx) => (
              <span
                key={sIdx}
                style={{
                  fontFamily: normalizeFontFamily(span.fontFamily || el.fontFamily),
                  fontSize: `${Math.min(Math.max(span.fontSize || safeFontSize, 8.5), 18)}pt`,
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
            onClick={() => setSelectedElementId(null)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={handleCanvasDrop}
          >
            {viewMode === 'original' ? (
              <>
                {pageSourceUrl ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#ffffff' }}>
                    <img
                      key={pageSourceUrl}
                      src={pageSourceUrl}
                      alt={`Page ${activePageIndex + 1}`}
                      className="fld-original-img"
                      onError={() => setImageLoadError(true)}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: '#64748b',
                      fontSize: 13,
                      padding: 24,
                      textAlign: 'center',
                    }}
                  >
                    <FileText size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <div>Original document preview not available</div>
                  </div>
                )}
              </>
            ) : (
              (currentPage?.elements && currentPage.elements.length > 0) ? (
                <>{currentPage.elements.map(renderReconstructedElement)}</>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#64748b',
                    fontSize: 13,
                    padding: 32,
                    textAlign: 'center',
                  }}
                >
                  <FileText size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <div>No text elements on this page yet.</div>
                  <div style={{ fontSize: 12, marginTop: 6, color: '#94a3b8' }}>
                    Use the toolbar above to add <strong>+ Text Block</strong>, <strong>+ Checkbox</strong>, or drop a signature.
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="fld-container">
        {/* Top Controls Toolbar: Modes, Pagination, Zoom, and In-Place Editors */}
        <div className="fld-toolbar flex flex-col gap-2 p-2 bg-slate-900 border-b border-slate-800">
          {/* Row 1: Mode Tabs + Page Nav + Zoom */}
          <div className="flex items-center justify-between flex-wrap gap-2 w-full">
            <div className="fld-mode-tabs">
              <button
                type="button"
                className={`fld-mode-tab ${mode === 'reconstructed' ? 'fld-mode-tab--active' : ''}`}
                onClick={() => setMode('reconstructed')}
                title="Direct in-place visual editor on the reconstructed document preserving exact PDF geometry"
              >
                <FileText size={13} /> Reconstructed (Fixed Editor)
              </button>
              <button
                type="button"
                className={`fld-mode-tab ${mode === 'side-by-side' ? 'fld-mode-tab--active' : ''}`}
                onClick={() => setMode('side-by-side')}
                title="Side-by-side comparison with original"
              >
                <Columns size={13} /> Side-by-Side
              </button>
              <button
                type="button"
                className={`fld-mode-tab ${mode === 'original' ? 'fld-mode-tab--active' : ''}`}
                onClick={() => setMode('original')}
                title="Original scanned or source PDF"
              >
                <Eye size={13} /> Original
              </button>
              <button
                type="button"
                className={`fld-mode-tab ${mode === 'wysiwyg' ? 'fld-mode-tab--active' : ''}`}
                onClick={() => {
                  setMode('wysiwyg');
                  if ((!contentHtml || !contentHtml.trim() || contentHtml === '<p></p>') && model) {
                    const html = canonicalModelToHtml(model);
                    if (html && onContentHtmlChange) onContentHtmlChange(html);
                  }
                  if (onSwitchToWysiwyg) onSwitchToWysiwyg();
                }}
                title="Full WYSIWYG HTML editor"
              >
                <PenTool size={13} /> WYSIWYG Editor (TinyMCE)
              </button>
            </div>

            {/* Page Navigation */}
            {mode !== 'wysiwyg' && totalPages > 1 && (
              <div className="fld-toolbar-group fld-page-nav">
                <button
                  type="button"
                  className="fld-tool-btn"
                  disabled={activePageIndex === 0}
                  onClick={() => setActivePageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="text-xs font-semibold px-1">
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
            {mode !== 'wysiwyg' && (
              <div className="fld-toolbar-group">
                <button
                  type="button"
                  className="fld-tool-btn"
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center', color: '#94a3b8' }}>
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
            )}
          </div>

          {/* Row 2: In-Place Document Formatting & Element Tools directly over the Reconstructed Fixed Document */}
          {mode !== 'wysiwyg' && mode !== 'original' && !readOnly && (
            <div className="fld-editor-toolbar flex items-center justify-between flex-wrap gap-2 w-full">
              <div className="flex items-center flex-wrap gap-1.5">
                {/* Font Family */}
                <select
                  className="fld-select-tool"
                  value={selectedElement?.fontFamily || 'Arial, sans-serif'}
                  onChange={(e) => handleUpdateElementStyle(selectedElementId, { fontFamily: e.target.value })}
                  title="Font Family"
                >
                  <option value="Arial, sans-serif">Arial</option>
                  <option value='"Times New Roman", Times, serif'>Times New Roman</option>
                  <option value='"Courier New", Courier, monospace'>Courier New</option>
                  <option value="Calibri, Arial, sans-serif">Calibri</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value='"Segoe UI", Tahoma, sans-serif'>Segoe UI</option>
                </select>

                {/* Font Size */}
                <select
                  className="fld-select-tool"
                  value={Math.round(selectedElement?.fontSize || 10.5)}
                  onChange={(e) => handleUpdateElementStyle(selectedElementId, { fontSize: Number(e.target.value) })}
                  title="Font Size (pt)"
                >
                  {[8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28].map((sz) => (
                    <option key={sz} value={sz}>{sz} pt</option>
                  ))}
                </select>

                {/* Bold */}
                <button
                  type="button"
                  className={`fld-tool-btn ${selectedElement?.fontWeight === 'bold' ? 'fld-tool-btn--active bg-blue-600 text-white' : ''}`}
                  onClick={() => {
                    const isBold = selectedElement?.fontWeight === 'bold';
                    handleUpdateElementStyle(selectedElementId, { fontWeight: isBold ? 'normal' : 'bold' });
                    document.execCommand('bold', false);
                  }}
                  title="Bold (Ctrl+B)"
                >
                  <Bold size={13} />
                </button>

                {/* Italic */}
                <button
                  type="button"
                  className={`fld-tool-btn ${selectedElement?.fontStyle === 'italic' ? 'fld-tool-btn--active bg-blue-600 text-white' : ''}`}
                  onClick={() => {
                    const isItalic = selectedElement?.fontStyle === 'italic';
                    handleUpdateElementStyle(selectedElementId, { fontStyle: isItalic ? 'normal' : 'italic' });
                    document.execCommand('italic', false);
                  }}
                  title="Italic (Ctrl+I)"
                >
                  <Italic size={13} />
                </button>

                {/* Underline */}
                <button
                  type="button"
                  className="fld-tool-btn"
                  onClick={() => document.execCommand('underline', false)}
                  title="Underline (Ctrl+U)"
                >
                  <Underline size={13} />
                </button>

                {/* Text Color */}
                <label className="fld-tool-btn cursor-pointer flex items-center gap-1" title="Text Color">
                  <span className="w-3 h-3 rounded-full border border-slate-600 inline-block" style={{ backgroundColor: selectedElement?.color || '#000000' }} />
                  <input
                    type="color"
                    className="sr-only"
                    value={selectedElement?.color || '#000000'}
                    onChange={(e) => handleUpdateElementStyle(selectedElementId, { color: e.target.value })}
                  />
                </label>

                {/* Alignments */}
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                  <button
                    type="button"
                    className={`p-1 rounded ${selectedElement?.alignment === 'left' || !selectedElement?.alignment ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                    onClick={() => handleUpdateElementStyle(selectedElementId, { alignment: 'left' })}
                    title="Align Left"
                  >
                    <AlignLeft size={13} />
                  </button>
                  <button
                    type="button"
                    className={`p-1 rounded ${selectedElement?.alignment === 'center' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                    onClick={() => handleUpdateElementStyle(selectedElementId, { alignment: 'center' })}
                    title="Align Center"
                  >
                    <AlignCenter size={13} />
                  </button>
                  <button
                    type="button"
                    className={`p-1 rounded ${selectedElement?.alignment === 'right' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                    onClick={() => handleUpdateElementStyle(selectedElementId, { alignment: 'right' })}
                    title="Align Right"
                  >
                    <AlignRight size={13} />
                  </button>
                </div>

                <span className="w-[1px] h-5 bg-slate-700 mx-1" />

                {/* Add New Elements */}
                <button
                  type="button"
                  className="fld-tool-btn text-xs"
                  onClick={() => handleAddElement('text')}
                  title="Add editable text block"
                >
                  <Plus size={12} /> Text
                </button>

                <button
                  type="button"
                  className="fld-tool-btn text-xs"
                  onClick={() => handleAddElement('form_line')}
                  title="Add blank fillable line"
                >
                  <Minus size={12} /> Line
                </button>

                <button
                  type="button"
                  className="fld-tool-btn text-xs"
                  onClick={() => handleAddElement('checkbox')}
                  title="Add interactive checkbox"
                >
                  <CheckSquare size={12} /> Checkbox
                </button>

                <button
                  type="button"
                  className="fld-tool-btn text-xs"
                  onClick={() => handleAddElement('table')}
                  title="Add table"
                >
                  <Table size={12} /> Table
                </button>
              </div>

              {/* Element actions & selection indicator */}
              <div className="flex items-center gap-1.5">
                {selectedElement ? (
                  <>
                    <button
                      type="button"
                      className="fld-tool-btn text-xs"
                      onClick={() => handleDuplicateElement(selectedElement.id)}
                      title="Duplicate selected element"
                    >
                      <Copy size={12} /> Duplicate
                    </button>
                    <button
                      type="button"
                      className="fld-tool-btn text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 border-red-800/60"
                      onClick={() => handleDeleteElement(selectedElement.id)}
                      title="Delete selected element"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <FileSignature size={12} className="text-blue-400" /> Click any text or drag signature onto page
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Viewport Content */}
        {mode === 'wysiwyg' ? (
          <div className="fld-workspace fld-workspace--wysiwyg p-3 bg-slate-900/60 w-full min-h-[650px] overflow-y-auto">
            <RichTextEditor
              ref={editorRef}
              value={contentHtml || ''}
              onChange={onContentHtmlChange || (() => {})}
              placeholder="Write contract template content here... Use {{contract_number}}, {{vendor_name}}, {{contract_value}}, etc."
              minHeight={650}
            />
          </div>
        ) : mode === 'side-by-side' ? (
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
  }
);

FixedLayoutDocumentViewer.displayName = 'FixedLayoutDocumentViewer';

export default FixedLayoutDocumentViewer;
