import { useRef, useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, PenLine } from 'lucide-react';
import type { FormField } from '../../types/formBuilder';
import { Button, buttonVariants } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

type Attachment = { fileName: string; src: string; isImage: boolean };

function attachmentSource(value: unknown): string {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  return /^(https?:\/\/|blob:|\/(?!\/)|data:(image\/[^;,]+|text\/plain|application\/(pdf|msword|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.[a-z.]+|octet-stream))[;,])/i.test(source) ? source : '';
}

function attachment(field: FormField, value: unknown): Attachment | null {
  const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const fileField = ['file', 'file_upload'].includes(field.type);
  if (!fileField && !(metadata && ('fileName' in metadata || 'fileDataUrl' in metadata))) return null;
  const src = attachmentSource(metadata ? metadata.fileDataUrl || metadata.url : value);
  const fileName = String(metadata?.fileName || (typeof value === 'string' && !src ? value : field.label || 'Attachment'));
  const fileType = String(metadata?.fileType || '');
  return {
    fileName, src,
    isImage: fileType.startsWith('image/') || /^data:image\//i.test(src) || /\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(src || fileName),
  };
}

function answerText(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(answerText).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

/** Render each answer against its own submission, including its selected currency. */
export function FormResponseFields({ fields, responseData = {} }: { fields: FormField[]; responseData?: Record<string, unknown> | null }) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const answers = responseData || {};

  const renderAnswer = (field: FormField) => {
    const value = answers[field.id];
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      return <span className="italic text-muted-foreground">Not answered</span>;
    }
    if (field.type === 'currency') {
      const currency = answers[`${field.id}_currency`] || field.currency || 'KES';
      const amount = typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      return <span className="font-semibold">{String(currency)} {Number.isFinite(amount) ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : answerText(value)}</span>;
    }
    const file = attachment(field, value);
    if (file) return <div className="space-y-3">
      <div className="flex items-start gap-2"><FileText size={17} className="mt-0.5 shrink-0 text-primary"/><span className="break-all">{file.fileName}</span></div>
      {file.src ? <div className="flex flex-wrap gap-2">
        {file.isImage && <Button type="button" variant="outline" size="sm" onClick={event => { previewTrigger.current = event.currentTarget; setPreview(file); }}><Eye size={14}/>View File</Button>}
        <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={file.src} download={file.fileName}><Download size={14}/>Download File</a>
      </div> : <p className="text-xs font-normal text-muted-foreground">The file name was recorded, but no file is available to preview or download.</p>}
    </div>;
    if (field.type === 'signature') {
      const sigSrc = typeof value === 'string' && /^(data:image\/|https?:\/\/|blob:|\/)/i.test(value.trim()) ? value.trim() : typeof value === 'object' && value !== null ? ((value as any).signatureDataUrl || (value as any).dataUrl || (value as any).fileDataUrl || '') : '';
      return <div className="space-y-2">
        {sigSrc ? (
          <div className="max-w-xs rounded-lg border border-border/80 bg-white p-2">
            <img src={sigSrc} alt={field.label || 'Digital Signature'} className="max-h-20 max-w-full object-contain" />
          </div>
        ) : (
          <span className="flex items-start gap-2"><PenLine size={16} className="mt-0.5 shrink-0 text-muted-foreground"/>{answerText(value)}</span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={14}/>Digital Signature</span>
      </div>;
    }
    return answerText(value);
  };

  return <>
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">No response fields are available.</p>}
      {fields.map(field => {
        if (field.type === 'divider') return <hr key={field.id} className="border-border sm:col-span-2"/>;
        if (field.type === 'heading') return <h3 key={field.id} className="text-base font-semibold sm:col-span-2">{field.content || field.label}</h3>;
        if (field.type === 'paragraph') return <p key={field.id} className="whitespace-pre-wrap text-sm text-muted-foreground sm:col-span-2">{field.content || field.label}</p>;
        return <div key={field.id} className={`min-w-0 rounded-xl border border-border/70 p-3.5 ${field.width === 'full' ? 'sm:col-span-2' : ''}`}>
          <h3 className="text-xs font-semibold text-muted-foreground">{field.label}</h3>
          <div className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-foreground">{renderAnswer(field)}</div>
        </div>;
      })}
    </div>
    {preview && <Dialog open onOpenChange={open => { if (!open) setPreview(null); }}>
      <DialogContent className="max-w-4xl" onCloseAutoFocus={event => { event.preventDefault(); previewTrigger.current?.focus(); }}>
        <DialogTitle>{preview.fileName}</DialogTitle>
        <DialogDescription>Submitted attachment preview</DialogDescription>
        <img src={preview.src} alt={preview.fileName} className="mt-4 max-h-[60vh] w-full object-contain"/>
      </DialogContent>
    </Dialog>}
  </>;
}
