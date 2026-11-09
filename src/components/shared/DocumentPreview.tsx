import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

/** Document styles stay inside a script-free frame, never in the application DOM. */
export function DocumentPreview({ html, title, className }: { html: string; title: string; className?: string }) {
  const srcDoc = useMemo(() => {
    const sanitized = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      ADD_TAGS: ['style'],
      ADD_ATTR: ['style', 'target', 'data-sig-container'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link'],
    });
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    // Retain the existing document cleaner's scoped body rules inside the frame.
    doc.body.classList.add('vcd-doc-content', 'ctr-doc-preview-content', 'ctr-detail__doc-preview');
    const style = doc.createElement('style');
    style.textContent = `
      html { color-scheme: light; background: #ffffff; width: 100%; }
      body {
        margin: 0 !important;
        padding: 40px 52px !important;
        width: 100% !important;
        max-width: 100% !important;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Times New Roman", Georgia, serif;
        font-size: 14.5px;
        line-height: 1.75;
        overflow-wrap: anywhere;
        box-sizing: border-box;
      }
      h1 { text-align: center; font-size: 18pt; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1.2px; color: #111827; }
      h2 { font-size: 13.5pt; font-weight: 700; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; width: 100%; color: #111827; }
      p { margin-bottom: 10px; text-align: justify; color: #1f2937; }
      .parties { margin: 20px 0; padding: 18px 22px; border: 1.5px solid #e2e8f0; background: #f8fafc; border-radius: 8px; width: 100%; }
      .parties p { margin: 4px 0; }
      .signature-block { margin-top: 40px; display: flex; justify-content: space-between; width: 100%; gap: 32px; }
      .signature-side { width: 45%; flex: 1; }
      .signature-line { margin-top: 50px; border-top: 1.5px solid #334155; padding-top: 6px; font-size: 11pt; }
      .signature-img { max-height: 60px; margin-top: 8px; }
      .footer { margin-top: 40px; font-size: 10pt; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; width: 100%; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      table th, table td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; font-size: 11pt; }
      table th { background: #f1f5f9; font-weight: 700; color: #0f172a; }
      img { max-width: 100%; height: auto; }
      * { box-sizing: border-box; }
    `;
    doc.head.appendChild(style);
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline'; font-src data: https: http:";
    doc.head.prepend(policy);
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }, [html]);
  return <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={srcDoc} className={cn('block w-full min-h-[440px] h-[68vh] rounded-lg border border-border bg-white', className)} />;
}
