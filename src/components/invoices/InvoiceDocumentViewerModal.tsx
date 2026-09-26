import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FileCheck,
  Building2,
  Calendar,
  Receipt
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

export interface DocumentAttachment {
  id: string | number;
  name: string;
  size?: string;
  type?: string;
  dataUrl?: string;
  url?: string;
}

interface InvoiceDocumentViewerModalProps {
  open: boolean;
  onClose: () => void;
  invoice?: any;
  attachments?: DocumentAttachment[];
  initialDocIndex?: number;
  initialFullscreen?: boolean;
}

export function InvoiceDocumentViewerModal({
  open,
  onClose,
  invoice,
  attachments: passedAttachments,
  initialDocIndex = 0,
  initialFullscreen = true,
}: InvoiceDocumentViewerModalProps) {
  const [activeDocIndex, setActiveDocIndex] = useState<number>(initialDocIndex);
  const [resolvedAttachments, setResolvedAttachments] = useState<DocumentAttachment[]>([]);
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(initialFullscreen);
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  // Resolve all attachments for the invoice
  useEffect(() => {
    if (!open) return;

    let list: DocumentAttachment[] = [];

    if (passedAttachments && passedAttachments.length > 0) {
      list = [...passedAttachments];
    } else if (invoice) {
      // 1. Check invoice.attachments (parsed if string)
      if (invoice.attachments) {
        if (Array.isArray(invoice.attachments)) {
          list = [...invoice.attachments];
        } else if (typeof invoice.attachments === 'string') {
          try {
            const parsed = JSON.parse(invoice.attachments);
            if (Array.isArray(parsed)) list = [...parsed];
          } catch {}
        }
      }

      // 2. Check localStorage caches
      if (list.length === 0) {
        const keys = [
          invoice.invoiceNumber ? `invoice_attachments_${invoice.invoiceNumber}` : null,
          invoice.poNumber ? `invoice_attachments_${invoice.poNumber}` : null,
          invoice.id ? `invoice_attachments_${invoice.id}` : null,
        ].filter(Boolean) as string[];

        for (const k of keys) {
          try {
            const saved = localStorage.getItem(k);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                list = parsed;
                break;
              }
            }
          } catch {}
        }
      }
    }

    setResolvedAttachments(list);
    setActiveDocIndex(0);
    setZoom(100);
  }, [open, invoice, passedAttachments]);

  if (!open) return null;

  const currentDoc: DocumentAttachment | undefined = resolvedAttachments[activeDocIndex];

  const handleDownload = (doc?: DocumentAttachment) => {
    const target = doc || currentDoc;
    if (!target) return;

    if (target.dataUrl) {
      const link = document.createElement('a');
      link.href = target.dataUrl;
      link.download = target.name || `invoice-document-${invoice?.invoiceNumber || 'file'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (target.url) {
      window.open(target.url, '_blank');
    }
  };

  const handlePrint = (doc?: DocumentAttachment) => {
    const target = doc || currentDoc;
    if (!target) return;

    if (target.dataUrl) {
      const isPdf = target.dataUrl.startsWith('data:application/pdf') || target.name.toLowerCase().endsWith('.pdf');
      const isImg = target.dataUrl.startsWith('data:image') || /\.(png|jpe?g|webp)$/i.test(target.name);

      if (isPdf) {
        const printWindow = window.open(target.dataUrl, '_blank');
        if (printWindow) {
          printWindow.focus();
          printWindow.print();
        } else {
          // Fallback iframe print
          const iframe = printIframeRef.current;
          if (iframe) {
            iframe.src = target.dataUrl;
            iframe.onload = () => {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            };
          }
        }
      } else if (isImg) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Print Document - ${target.name}</title>
                <style>
                  body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
                  img { max-width: 100%; height: auto; object-fit: contain; }
                  @page { margin: 1cm; size: auto; }
                </style>
              </head>
              <body>
                <img src="${target.dataUrl}" alt="${target.name}" />
                <script>
                  window.onload = function() {
                    window.focus();
                    setTimeout(function() { window.print(); }, 250);
                  };
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
        }
      } else {
        window.open(target.dataUrl, '_blank');
      }
    } else if (target.url) {
      window.open(target.url, '_blank');
    }
  };

  const isPdf = currentDoc?.dataUrl?.startsWith('data:application/pdf') || currentDoc?.name?.toLowerCase().endsWith('.pdf');
  const isImage = currentDoc?.dataUrl?.startsWith('data:image') || /\.(png|jpe?g|webp|gif|svg)$/i.test(currentDoc?.name || '');

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs transition-all ${
        isFullscreen ? 'p-0 w-screen h-screen overflow-hidden' : 'p-3 sm:p-5'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative flex flex-col bg-card overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'w-screen h-screen max-w-none max-h-none rounded-none border-0'
            : 'w-full max-w-6xl h-[92vh] max-h-[920px] rounded-2xl border border-border shadow-2xl'
        }`}
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-secondary/35 px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground truncate">
                  {currentDoc ? currentDoc.name : `Invoice Document — ${invoice?.invoiceNumber || 'Preview'}`}
                </h3>
                {currentDoc?.size && (
                  <Badge variant="outline" className="text-[11px] px-2 py-0.5">
                    {currentDoc.size}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Invoice #{invoice?.invoiceNumber || '—'} · PO #{invoice?.poNumber || '—'} · {invoice?.vendorName || 'Vendor Document'}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isImage && (
              <div className="hidden sm:flex items-center gap-1 mr-2 bg-muted/60 p-1 rounded-lg border border-border/60">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setZoom((z) => Math.max(50, z - 25))}
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <span className="text-[11px] font-mono px-1.5 tabular-nums text-muted-foreground">{zoom}%</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setZoom((z) => Math.min(250, z + 25))}
                  title="Zoom In"
                >
                  <ZoomIn className="size-3.5" />
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 px-3 text-xs shadow-xs"
              onClick={() => handlePrint()}
              title="Print Document"
            >
              <Printer className="size-3.5 text-primary" /> Print
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 px-3 text-xs shadow-xs"
              onClick={() => handleDownload()}
              title="Download Document"
            >
              <Download className="size-3.5 text-primary" /> Download
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={onClose}
              title="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Multi-document Tabs (if more than 1 attachment) */}
        {resolvedAttachments.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border/60 bg-muted/20 px-5 py-2">
            <span className="text-xs font-semibold text-muted-foreground shrink-0 mr-1">
              Documents ({resolvedAttachments.length}):
            </span>
            {resolvedAttachments.map((att, idx) => (
              <button
                key={att.id || idx}
                type="button"
                onClick={() => {
                  setActiveDocIndex(idx);
                  setZoom(100);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0 ${
                  activeDocIndex === idx
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Paperclip className="size-3 shrink-0" />
                <span className="max-w-44 truncate">{att.name}</span>
                {att.size && <span className="opacity-75 text-[10px]">({att.size})</span>}
              </button>
            ))}
          </div>
        )}

        {/* Document Viewer Body */}
        <div
          className={`flex-1 overflow-auto bg-muted/40 ${
            isPdf ? (isFullscreen ? 'p-0' : 'p-2 sm:p-3') : 'p-4 sm:p-6'
          } flex items-center justify-center min-h-0 relative`}
        >
          {currentDoc ? (
            isPdf ? (
              <div className="w-full h-full rounded-none overflow-hidden border-0 bg-background flex flex-col flex-1">
                <iframe
                  src={currentDoc.dataUrl || currentDoc.url}
                  title={currentDoc.name}
                  className="w-full h-full border-0 flex-1 min-h-full"
                  style={{ width: '100%', height: '100%', minHeight: '100%' }}
                />
              </div>
            ) : isImage ? (
              <div className="flex items-center justify-center p-4 overflow-auto max-h-full max-w-full">
                <img
                  src={currentDoc.dataUrl || currentDoc.url}
                  alt={currentDoc.name}
                  style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}
                  className={`${isFullscreen ? 'max-h-[88vh]' : 'max-h-[75vh]'} max-w-full object-contain rounded-lg border border-border shadow-md transition-transform duration-150`}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 p-8 text-center max-w-md bg-card rounded-2xl border border-border/80 shadow-md">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileText className="size-8" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-base">{currentDoc.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentDoc.size ? `File Size: ${currentDoc.size} · ` : ''}
                    Direct inline rendering is not supported for this file type.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => handleDownload(currentDoc)} className="gap-2">
                    <Download className="size-4" /> Download File
                  </Button>
                  <Button variant="outline" onClick={() => handlePrint(currentDoc)} className="gap-2">
                    <Printer className="size-4" /> Print Document
                  </Button>
                </div>
              </div>
            )
          ) : (
            /* Fallback: Structured digital copy of invoice if no physical attachment is attached */
            <div className="w-full max-w-2xl bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-md flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Receipt className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-lg">Vendor Tax Invoice Record</h3>
                    <p className="text-xs text-muted-foreground">Digital Electronic Copy</p>
                  </div>
                </div>
                <Badge tone="success" className="px-3 py-1">
                  Verified Copy
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold block">Vendor Details</span>
                  <span className="font-bold text-foreground text-sm mt-1 block">{invoice?.vendorName || 'Vendor Partner'}</span>
                  <span className="text-muted-foreground block mt-0.5">PO Ref: {invoice?.poNumber || '—'}</span>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold block">Invoice Details</span>
                  <span className="font-bold text-primary text-sm mt-1 block font-mono">{invoice?.invoiceNumber || '—'}</span>
                  <span className="text-muted-foreground block mt-0.5">Due: {invoice?.dueDate || '—'}</span>
                </div>
              </div>

              {invoice?.comments && (
                <div className="rounded-xl border border-border/60 bg-muted/10 p-3 text-xs">
                  <span className="font-semibold text-muted-foreground block mb-1">Invoice Notes / Vendor Remarks:</span>
                  <p className="text-foreground">{invoice.comments}</p>
                </div>
              )}

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-3">
                <FileCheck className="size-5 shrink-0 text-amber-600" />
                <div>
                  No external physical PDF was uploaded with this invoice submission. You can view the full printable breakdown via the Print button.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hidden Print Iframe */}
        <iframe ref={printIframeRef} title="print-frame" className="hidden" />
      </div>
    </div>,
    document.body
  );
}

export default InvoiceDocumentViewerModal;
