// ============================================================
// components/shared/DocumentExtractionViewer.tsx
// Interactive Layout Reconstruction & Document Extraction Viewer
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Columns,
  Eye,
  FileCode,
  Download,
  Save,
  RotateCcw,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { documentExtractionService } from '../../services/documentExtractionService';
import type {
  CanonicalPage,
  CanonicalElement,
  DocumentExtractionSummary,
  QualityValidationReport,
} from '../../types/documentExtraction';
import './DocumentExtractionViewer.css';

interface ViewerProps {
  extractionId: string;
  onClose: () => void;
  onApplyText?: (text: string) => void;
}

export default function DocumentExtractionViewer({
  extractionId,
  onClose,
  onApplyText,
}: ViewerProps) {
  const [docSummary, setDocSummary] = useState<DocumentExtractionSummary | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<CanonicalPage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [mode, setMode] = useState<'original' | 'reconstructed' | 'side-by-side'>('reconstructed');
  const [zoom, setZoom] = useState<number>(1.0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Undo / Redo history for edits
  const [history, setHistory] = useState<CanonicalElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState<boolean>(false);

  // Quality Validation report
  const [qualityReport, setQualityReport] = useState<QualityValidationReport | null>(null);
  const [showQualityPanel, setShowQualityPanel] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch document overview
  useEffect(() => {
    async function loadDoc() {
      try {
        setLoading(true);
        const doc = await documentExtractionService.getDocument(extractionId);
        setDocSummary(doc);
        if (doc.pages && doc.pages.length > 0) {
          setActivePageIndex(0);
        }
      } catch (err) {
        console.error('Failed to load document:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDoc();
  }, [extractionId]);

  // 2. Fetch page layout when page index changes
  const fetchPage = useCallback(async (pageIdx: number) => {
    try {
      setLoading(true);
      const page = await documentExtractionService.getPageLayout(extractionId, pageIdx);
      setCurrentPage(page);
      setHistory([page.elements]);
      setHistoryIndex(0);
      setHasUnsavedEdits(false);
      setSelectedElementId(null);
    } catch (err) {
      console.error('Failed to load page layout:', err);
    } finally {
      setLoading(false);
    }
  }, [extractionId]);

  useEffect(() => {
    fetchPage(activePageIndex);
  }, [activePageIndex, fetchPage]);

  // Selected element helper
  const selectedElement = currentPage?.elements.find((el) => el.id === selectedElementId);

  // Update selected element property
  const updateElement = (updates: Partial<CanonicalElement>) => {
    if (!currentPage || !selectedElementId) return;

    const newElements = currentPage.elements.map((el) => {
      if (el.id === selectedElementId) {
        return { ...el, ...updates, source: 'user_edit' as const };
      }
      return el;
    });

    setCurrentPage({ ...currentPage, elements: newElements });
    setHasUnsavedEdits(true);

    // Push history
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newElements);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Undo
  const handleUndo = () => {
    if (historyIndex > 0 && currentPage) {
      const prev = history[historyIndex - 1];
      setCurrentPage({ ...currentPage, elements: prev });
      setHistoryIndex(historyIndex - 1);
      setHasUnsavedEdits(true);
    }
  };

  // Redo
  const handleRedo = () => {
    if (historyIndex < history.length - 1 && currentPage) {
      const next = history[historyIndex + 1];
      setCurrentPage({ ...currentPage, elements: next });
      setHistoryIndex(historyIndex + 1);
      setHasUnsavedEdits(true);
    }
  };

  // Save Edits to backend
  const handleSaveEdits = async () => {
    if (!currentPage) return;
    setSaving(true);
    try {
      const updatedMap: Record<string, any> = {};
      currentPage.elements.forEach((el) => {
        if (el.source === 'user_edit') {
          updatedMap[el.id] = el;
        }
      });

      await documentExtractionService.savePageEdits(extractionId, activePageIndex, {
        updatedElements: updatedMap,
      });

      setHasUnsavedEdits(false);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // Quality Validation check
  const handleRunQualityCheck = async () => {
    try {
      const report = await documentExtractionService.getComparison(extractionId, activePageIndex);
      setQualityReport(report);
      setShowQualityPanel(true);
    } catch (err) {
      alert('Quality check report unavailable.');
    }
  };

  // Exports
  const handleDownloadPdf = () => {
    documentExtractionService.downloadReconstructedPdf(
      extractionId,
      docSummary?.originalFileName || 'document'
    );
  };

  const handleDownloadJson = () => {
    documentExtractionService.downloadJson(
      extractionId,
      docSummary?.originalFileName || 'document'
    );
  };

  if (!docSummary) {
    return (
      <div className="doc-viewer-modal">
        <div className="doc-viewer-container" style={{ padding: '3rem', textAlign: 'center' }}>
          <Loader2 className="animate-spin mx-auto text-sky-600 mb-2" size={32} />
          <p className="text-sm text-slate-600">Loading document layout...</p>
        </div>
      </div>
    );
  }

  const pageW = currentPage ? currentPage.width * zoom : 612 * zoom;
  const pageH = currentPage ? currentPage.height * zoom : 792 * zoom;

  return (
    <div className="doc-viewer-modal" onClick={() => setSelectedElementId(null)}>
      <div className="doc-viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* ── Top Header ── */}
        <div className="doc-viewer-header">
          <div className="doc-viewer-title-group">
            <span className="doc-viewer-title">{docSummary.title}</span>
            <span className="text-xs px-2 py-0.5 bg-sky-100 text-sky-700 rounded font-medium">
              Page {activePageIndex + 1} of {docSummary.pageCount || 1}
            </span>
            {hasUnsavedEdits && (
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                Unsaved Edits
              </span>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="doc-viewer-mode-tabs">
            <button
              type="button"
              className={`doc-viewer-tab-btn ${mode === 'original' ? 'active' : ''}`}
              onClick={() => setMode('original')}
            >
              <Eye size={13} style={{ display: 'inline', marginRight: 4 }} />
              Original
            </button>
            <button
              type="button"
              className={`doc-viewer-tab-btn ${mode === 'reconstructed' ? 'active' : ''}`}
              onClick={() => setMode('reconstructed')}
            >
              <Sparkles size={13} style={{ display: 'inline', marginRight: 4 }} />
              Reconstructed
            </button>
            <button
              type="button"
              className={`doc-viewer-tab-btn ${mode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setMode('side-by-side')}
            >
              <Columns size={13} style={{ display: 'inline', marginRight: 4 }} />
              Side-by-Side
            </button>
          </div>

          {/* Controls & Actions */}
          <div className="doc-viewer-actions">
            {/* Zoom Controls */}
            <button
              type="button"
              className="doc-viewer-btn"
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-xs font-semibold text-slate-600 min-w-[38px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="doc-viewer-btn"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(1))))}
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
            <button
              type="button"
              className="doc-viewer-btn"
              onClick={() => setZoom(1.0)}
              title="Reset Zoom (100%)"
            >
              <Maximize2 size={13} />
            </button>

            {/* Quality Comparison */}
            <button
              type="button"
              className="doc-viewer-btn"
              onClick={handleRunQualityCheck}
              title="Validate Extraction Quality"
            >
              <CheckCircle2 size={13} /> Quality
            </button>

            {/* Save Edits */}
            <button
              type="button"
              className="doc-viewer-btn doc-viewer-btn--primary"
              onClick={handleSaveEdits}
              disabled={saving || !hasUnsavedEdits}
            >
              <Save size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>

            {/* Exports */}
            <button
              type="button"
              className="doc-viewer-btn"
              onClick={handleDownloadPdf}
              title="Download Reconstructed PDF"
            >
              <Download size={13} /> PDF
            </button>
            <button
              type="button"
              className="doc-viewer-btn"
              onClick={handleDownloadJson}
              title="Download Canonical JSON Model"
            >
              <FileCode size={13} /> JSON
            </button>

            {/* Close */}
            <button
              type="button"
              className="doc-viewer-btn"
              onClick={onClose}
              style={{ marginLeft: 8 }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Main Workspace ── */}
        <div className="doc-viewer-workspace">
          {/* Thumbnails Sidebar */}
          {docSummary.pages && docSummary.pages.length > 1 && (
            <div className="doc-viewer-sidebar">
              {docSummary.pages.map((p, idx) => (
                <div
                  key={idx}
                  className={`doc-viewer-thumb-card ${activePageIndex === idx ? 'active' : ''}`}
                  onClick={() => setActivePageIndex(idx)}
                >
                  {p.previewImageUrl ? (
                    <img src={p.previewImageUrl} alt={`Page ${idx + 1}`} />
                  ) : (
                    <div className="h-16 bg-slate-200 rounded mb-1 flex items-center justify-center text-xs">
                      Page {idx + 1}
                    </div>
                  )}
                  <span>Page {idx + 1}</span>
                </div>
              ))}
            </div>
          )}

          {/* Canvas Scroll Area */}
          <div className="doc-viewer-canvas-scroll" ref={containerRef}>
            {/* Original Preview Mode */}
            {(mode === 'original' || mode === 'side-by-side') && currentPage && (
              <div
                className="doc-page-canvas"
                style={{
                  width: `${pageW}px`,
                  height: `${pageH}px`,
                  minWidth: `${pageW}px`,
                  minHeight: `${pageH}px`,
                }}
              >
                {currentPage.previewImageUrl ? (
                  <img
                    src={currentPage.previewImageUrl}
                    alt="Original Document Page"
                    className="doc-page-canvas__original-img"
                  />
                ) : (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    Original preview unavailable
                  </div>
                )}
              </div>
            )}

            {/* Reconstructed Layout Mode */}
            {(mode === 'reconstructed' || mode === 'side-by-side') && currentPage && (
              <div
                className="doc-page-canvas"
                style={{
                  width: `${pageW}px`,
                  height: `${pageH}px`,
                  minWidth: `${pageW}px`,
                  minHeight: `${pageH}px`,
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelectedElementId(null);
                }}
              >
                {currentPage.elements.map((el) => {
                  const isSelected = el.id === selectedElementId;
                  const elStyle: React.CSSProperties = {
                    left: `${el.bbox.x * zoom}px`,
                    top: `${el.bbox.y * zoom}px`,
                    width: `${el.bbox.width * zoom}px`,
                    height: `${el.bbox.height * zoom}px`,
                    zIndex: el.zIndex || 5,
                  };

                  if (el.type === 'text') {
                    return (
                      <div
                        key={el.id}
                        className={`doc-element doc-element--text ${isSelected ? 'selected' : ''}`}
                        style={{
                          ...elStyle,
                          textAlign: el.alignment || 'left',
                          fontFamily: el.fontFamily || 'Helvetica, sans-serif',
                          fontSize: `${(el.fontSize || 10) * zoom}px`,
                          fontWeight: el.fontWeight || 'normal',
                          fontStyle: el.fontStyle || 'normal',
                          color: el.color || '#000000',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedElementId(el.id);
                        }}
                      >
                        {el.text}
                      </div>
                    );
                  }

                  if (el.type === 'table' && el.tableData) {
                    return (
                      <div
                        key={el.id}
                        className={`doc-element doc-element--table ${isSelected ? 'selected' : ''}`}
                        style={elStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedElementId(el.id);
                        }}
                      >
                        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {Array.from({ length: el.tableData.rows }).map((_, rIdx) => (
                              <tr key={rIdx}>
                                {el.tableData!.cells
                                  .filter((c) => c.row === rIdx)
                                  .map((cell) => (
                                    <td
                                      key={cell.id || `${cell.row}-${cell.col}`}
                                      style={{
                                        border: cell.border?.width
                                          ? `1px solid ${cell.border.color || '#cbd5e1'}`
                                          : 'none',
                                        backgroundColor: cell.isHeader ? '#f8fafc' : 'transparent',
                                        fontWeight: cell.isHeader ? 'bold' : 'normal',
                                        fontSize: `${9 * zoom}px`,
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

                  if (el.type === 'image' && el.imageData) {
                    return (
                      <div
                        key={el.id}
                        className={`doc-element doc-element--image ${isSelected ? 'selected' : ''}`}
                        style={elStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedElementId(el.id);
                        }}
                      >
                        <img src={el.imageData.assetUrl} alt={el.imageData.graphicType} />
                        <span className="doc-element-badge">
                          {el.imageData.graphicType} (raster)
                        </span>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Floating Property Inspector for Selected Element ── */}
        {selectedElement && selectedElement.type === 'text' && (
          <div className="doc-edit-toolbar" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs font-semibold text-slate-500">Edit:</span>
            <input
              type="text"
              value={selectedElement.text || ''}
              onChange={(e) => updateElement({ text: e.target.value })}
              style={{ width: '220px' }}
            />

            {/* Alignment */}
            <div className="flex gap-1 border-l pl-2">
              <button
                type="button"
                className={`p-1 rounded text-xs ${selectedElement.alignment === 'left' ? 'bg-sky-100 text-sky-700' : ''}`}
                onClick={() => updateElement({ alignment: 'left' })}
              >
                <AlignLeft size={13} />
              </button>
              <button
                type="button"
                className={`p-1 rounded text-xs ${selectedElement.alignment === 'center' ? 'bg-sky-100 text-sky-700' : ''}`}
                onClick={() => updateElement({ alignment: 'center' })}
              >
                <AlignCenter size={13} />
              </button>
              <button
                type="button"
                className={`p-1 rounded text-xs ${selectedElement.alignment === 'right' ? 'bg-sky-100 text-sky-700' : ''}`}
                onClick={() => updateElement({ alignment: 'right' })}
              >
                <AlignRight size={13} />
              </button>
            </div>

            {/* Bold / Italic */}
            <div className="flex gap-1 border-l pl-2">
              <button
                type="button"
                className={`p-1 rounded text-xs ${selectedElement.fontWeight === 'bold' ? 'bg-sky-100 text-sky-700' : ''}`}
                onClick={() =>
                  updateElement({
                    fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold',
                  })
                }
              >
                <Bold size={13} />
              </button>
              <button
                type="button"
                className={`p-1 rounded text-xs ${selectedElement.fontStyle === 'italic' ? 'bg-sky-100 text-sky-700' : ''}`}
                onClick={() =>
                  updateElement({
                    fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic',
                  })
                }
              >
                <Italic size={13} />
              </button>
            </div>

            {/* Font Size */}
            <div className="flex items-center gap-1 border-l pl-2">
              <span className="text-xs text-slate-500">Size:</span>
              <input
                type="number"
                min="6"
                max="72"
                value={selectedElement.fontSize || 10}
                onChange={(e) => updateElement({ fontSize: Number(e.target.value) })}
                style={{ width: '48px' }}
              />
            </div>

            {/* Undo / Redo */}
            <div className="flex gap-1 border-l pl-2">
              <button
                type="button"
                className="p-1 text-xs text-slate-600 disabled:opacity-40"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
              >
                <RotateCcw size={13} />
              </button>
              <button
                type="button"
                className="p-1 text-xs text-slate-600 disabled:opacity-40"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
              >
                <RotateCw size={13} />
              </button>
            </div>

            {/* Source & Confidence */}
            {selectedElement.confidence !== undefined && (
              <span
                className={`doc-confidence-badge ${
                  selectedElement.confidence >= 0.8
                    ? 'doc-confidence-badge--high'
                    : 'doc-confidence-badge--low'
                }`}
              >
                {Math.round(selectedElement.confidence * 100)}%
              </span>
            )}
          </div>
        )}

        {/* ── Quality Validation Modal ── */}
        {showQualityPanel && qualityReport && (
          <div
            className="absolute top-16 right-6 bg-white p-4 rounded-lg shadow-xl border border-slate-200 z-50 w-80 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2 font-bold text-slate-800">
              <span>Quality Validation</span>
              <button type="button" onClick={() => setShowQualityPanel(false)}>
                <X size={14} />
              </button>
            </div>
            {qualityReport.visualSimilarityScore !== undefined && (
              <div className="mb-2">
                <span className="text-slate-600">Visual Similarity: </span>
                <span className="font-semibold text-sky-700">
                  {Math.round(qualityReport.visualSimilarityScore * 100)}%
                </span>
              </div>
            )}
            <div className="space-y-1 text-slate-600">
              <div>Overlapping Duplicates: {qualityReport.duplicateTextCount}</div>
              <div>Out of Bounds Overflow: {qualityReport.overflowElementCount}</div>
              <div>Low Confidence Regions: {qualityReport.lowConfidenceCount}</div>
            </div>
            {qualityReport.diffOverlayUrl && (
              <div className="mt-3">
                <span className="font-semibold text-slate-700 block mb-1">Diff Overlay:</span>
                <img
                  src={qualityReport.diffOverlayUrl}
                  alt="Diff"
                  className="w-full border rounded"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
