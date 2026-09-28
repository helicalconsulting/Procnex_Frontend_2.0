import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

/** Document styles stay inside a script-free frame, never in the application DOM. */
export function DocumentPreview({ html, title, className }: { html: string; title: string; className?: string }) {
  const srcDoc = useMemo(() => {
    const sanitized = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      ADD_TAGS: ['style'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta'],
    });
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    // Retain the existing document cleaner's scoped body rules inside the frame.
    doc.body.classList.add('vcd-doc-content');
    const style = doc.createElement('style');
    style.textContent = 'html{color-scheme:light;background:white}body{margin:0;padding:36px 44px;color:#111827;font-family:"Times New Roman",Georgia,serif;font-size:14px;line-height:1.7;overflow-wrap:anywhere}img{max-width:100%;height:auto}*{box-sizing:border-box}';
    doc.head.prepend(style);
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline'; font-src data: https: http:";
    doc.head.prepend(policy);
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }, [html]);
  return <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={srcDoc} className={cn('block w-full min-h-[440px] h-[68vh] rounded-lg border border-border bg-white', className)} />;
}
