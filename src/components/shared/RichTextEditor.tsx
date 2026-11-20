import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';

export interface RichTextEditorRef {
  insertText: (text: string) => void;
  insertHtml: (html: string) => void;
  insertPageBreak: () => void;
  focus: () => void;
  getEditorElement: () => HTMLDivElement | null;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number | string;
}

declare global {
  interface Window {
    tinymce?: any;
  }
}

const FREE_OPENSOURCE_PLUGINS = [
  'advlist',
  'autolink',
  'lists',
  'link',
  'image',
  'charmap',
  'preview',
  'anchor',
  'searchreplace',
  'visualblocks',
  'code',
  'fullscreen',
  'insertdatetime',
  'media',
  'table',
  'help',
  'wordcount',
  'emoticons',
  'accordion',
  'directionality',
  'nonbreaking',
  'pagebreak',
  'quickbars',
  'visualchars',
];

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(function RichTextEditor(
  {
    value,
    onChange,
    placeholder = 'Write content here...',
    minHeight = 650,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorInstanceRef = useRef<any>(null);
  const [editorId] = useState(() => `tinymce_${Math.random().toString(36).substring(2, 9)}`);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const isUpdatingFromProp = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.insertContent(text);
      }
    },
    insertHtml: (html: string) => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.insertContent(html);
      }
    },
    insertPageBreak: () => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.execCommand('mcePageBreak');
      }
    },
    focus: () => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.focus();
      }
    },
    getEditorElement: () => containerRef.current,
  }));

  useEffect(() => {
    let isMounted = true;
    let pollTimer: any = null;

    const initTinyMCE = () => {
      if (!isMounted || !textareaRef.current || !window.tinymce) return;

      try {
        window.tinymce.remove(`#${editorId}`);
      } catch {}

      const isDark = document.documentElement.classList.contains('dark');

      window.tinymce.init({
        selector: `#${editorId}`,
        base_url: '/tinymce',
        suffix: '.min',
        license_key: 'gpl',
        promotion: false,
        branding: false,
        height: minHeight || 650,
        menubar: 'file edit view insert format tools table help',
        menu: {
          file: { title: 'File', items: 'newdocument | preview | print' },
          edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
          view: { title: 'View', items: 'code | visualaid visualchars visualblocks | preview fullscreen' },
          insert: { title: 'Insert', items: 'image link media inserttable | charmap emoticons | pagebreak nonbreaking anchor | insertdatetime' },
          format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript | styles blocks fontfamily fontsize align lineheight | forecolor backcolor | removeformat' },
          tools: { title: 'Tools', items: 'wordcount' },
          table: { title: 'Table', items: 'inserttable | cell row column | tableprops deletetable' },
          help: { title: 'Help', items: 'help' }
        },
        plugins: FREE_OPENSOURCE_PLUGINS,
        toolbar_mode: 'wrap',
        toolbar: [
          'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough superscript subscript | forecolor backcolor | removeformat',
          'alignleft aligncenter alignright alignjustify | lineheight | bullist numlist outdent indent | hr pagebreak',
          'table inserttable | link image media | emoticons charmap anchor insertdatetime | accordion | searchreplace visualchars visualblocks code fullscreen preview print help',
        ],
        quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote quicktable',
        contextmenu: 'link image table',
        table_default_attributes: {
          border: '1',
        },
        table_default_styles: {
          'border-collapse': 'collapse',
          width: '100%',
        },
        table_grid: true,
        table_appearance_options: true,
        skin: isDark ? 'oxide-dark' : 'oxide',
        content_css: isDark ? 'dark' : 'default',
        content_style: `
          html {
            background-color: ${isDark ? '#0b0f19' : '#f1f5f9'};
            padding: 20px 12px;
            min-height: 100%;
          }
          body {
            font-family: Arial, Helvetica, "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            padding: 2rem 2.5rem;
            max-width: 820px;
            margin: 0 auto;
            background-color: #ffffff;
            color: #1e293b;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
            min-height: 100%;
            border-radius: 4px;
            box-sizing: border-box;
          }
          body:has(.contract-ocr-page) {
            max-width: none;
            min-height: 0;
            padding: 0;
            background: transparent;
            box-shadow: none;
          }
          .mce-pagebreak {
            border: none;
            border-top: 1.5px dashed #94a3b8;
            margin: 1.25rem 0;
            position: relative;
            text-align: center;
            height: 18px;
            line-height: 18px;
            background: transparent;
            font-size: 11px;
            color: #64748b;
          }
          table:not(.contract-ocr-table) {
            border-collapse: collapse !important;
            width: 100% !important;
            margin: 1.25rem 0 !important;
            border: 1.5px solid #64748b !important;
          }
          table:not(.contract-ocr-table) th {
            background-color: #f1f5f9 !important;
            border: 1px solid #94a3b8 !important;
            padding: 8px 12px !important;
            font-weight: 700 !important;
            text-align: left;
            color: #0f172a !important;
          }
          table:not(.contract-ocr-table) td {
            border: 1px solid #cbd5e1 !important;
            padding: 8px 12px !important;
            vertical-align: top;
            color: #1e293b !important;
          }
          table:not(.contract-ocr-table) tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          .contract-signature-wrapper {
            display: inline-block;
            margin: 16px 0;
          }
          .contract-checkbox {
            display: inline-block !important;
            width: 16px !important;
            height: 16px !important;
            border: 1.5px solid #2563eb !important;
            border-radius: 3px !important;
            vertical-align: -2px !important;
            margin-right: 8px !important;
            text-align: center !important;
            line-height: 14px !important;
            font-size: 11px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            user-select: none !important;
            box-sizing: border-box !important;
            transition: all 0.12s ease !important;
          }
          .contract-checkbox:hover {
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25) !important;
            transform: scale(1.08);
          }
        `,
        placeholder,
        setup: (editor: any) => {
          editorInstanceRef.current = editor;

          // Interactive Checkbox Toggle on Click & Mousedown (Capturing Phase)
          const toggleCheckbox = (target: any) => {
            if (!target) return false;
            const cb = target.closest?.('.contract-checkbox') || (target.classList?.contains('contract-checkbox') ? target : null);
            if (cb) {
              const currentVal = cb.getAttribute('data-checked');
              const wasChecked = currentVal === 'true' || cb.getAttribute('aria-checked') === 'true' || cb.innerHTML.indexOf('&#10003;') !== -1 || (cb.textContent && cb.textContent.indexOf('\u2713') !== -1);
              const nowChecked = !wasChecked;
              cb.setAttribute('data-checked', nowChecked ? 'true' : 'false');
              cb.setAttribute('aria-checked', nowChecked ? 'true' : 'false');
              cb.style.backgroundColor = nowChecked ? '#2563eb' : '#ffffff';
              cb.style.color = nowChecked ? '#ffffff' : 'transparent';
              cb.innerHTML = nowChecked ? '&#10003;' : '&nbsp;';
              editor.setDirty(true);
              editor.fire('change');
              return true;
            }
            return false;
          };

          editor.on('init', () => {
            if (isMounted) {
              setIsEditorReady(true);
              try {
                editor.setContent(value || '');
              } catch {}
            }
            try {
              const body = editor.getBody();
              if (body) {
                body.addEventListener('click', (e: MouseEvent) => {
                  if (toggleCheckbox(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }, true);
                body.addEventListener('mousedown', (e: MouseEvent) => {
                  const cb = (e.target as any)?.closest?.('.contract-checkbox') || ((e.target as any)?.classList?.contains('contract-checkbox') ? e.target : null);
                  if (cb) {
                    e.preventDefault();
                    toggleCheckbox(cb);
                  }
                }, true);
              }
            } catch {}
          });

          editor.on('click mousedown', (e: any) => {
            toggleCheckbox(e.target);
          });

          editor.on('change input undo redo keyup', () => {
            if (isUpdatingFromProp.current || !editor || !editor.initialized || editor.destroyed || !editor.serializer || typeof editor.getContent !== 'function') return;
            try {
              const content = editor.getContent();
              onChangeRef.current?.(content);
            } catch {
              // Ignore serialization errors during editor lifecycle transitions
            }
          });
        },
      });
    };

    if (window.tinymce) {
      setTimeout(initTinyMCE, 40);
    } else {
      const existingScript = document.querySelector('script[src*="tinymce.min.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => setTimeout(initTinyMCE, 40));
      } else {
        const script = document.createElement('script');
        script.src = '/tinymce/tinymce.min.js';
        script.async = true;
        script.onload = () => setTimeout(initTinyMCE, 40);
        document.head.appendChild(script);
      }

      pollTimer = setInterval(() => {
        if (window.tinymce) {
          clearInterval(pollTimer);
          setTimeout(initTinyMCE, 40);
        }
      }, 80);
      setTimeout(() => clearInterval(pollTimer), 6000);
    }

    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
      try {
        if (window.tinymce) {
          window.tinymce.remove(`#${editorId}`);
        }
      } catch {}
      editorInstanceRef.current = null;
    };
  }, [editorId, minHeight, placeholder]);

  useEffect(() => {
    if (editorInstanceRef.current && isEditorReady) {
      try {
        const editor = editorInstanceRef.current;
        if (!editor || !editor.initialized || editor.destroyed || !editor.serializer || typeof editor.getContent !== 'function') return;
        const current = editor.getContent();
        if (value !== current) {
          isUpdatingFromProp.current = true;
          editor.setContent(value || '');
          isUpdatingFromProp.current = false;
        }
      } catch {
        // Prevent unhandled serialize error during editor lifecycle transitions
      }
    }
  }, [value, isEditorReady]);

  return (
    <div ref={containerRef} className="tinymce-wrapper w-full h-full min-h-[550px] relative">
      <textarea
        id={editorId}
        ref={textareaRef}
        defaultValue={value}
        className="w-full h-96 p-4 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 font-mono text-sm resize-y"
      />
    </div>
  );
});

export default RichTextEditor;
