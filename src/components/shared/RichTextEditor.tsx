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
  'accordion',
  'advlist',
  'anchor',
  'autolink',
  'autoresize',
  'autosave',
  'charmap',
  'code',
  'codesample',
  'directionality',
  'emoticons',
  'fullscreen',
  'help',
  'image',
  'importcss',
  'insertdatetime',
  'link',
  'lists',
  'media',
  'nonbreaking',
  'pagebreak',
  'preview',
  'quickbars',
  'save',
  'searchreplace',
  'table',
  'visualblocks',
  'visualchars',
  'wordcount',
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

    const initEditor = () => {
      if (!window.tinymce || !textareaRef.current) return;

      // Remove any existing instance for this id
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
        height: minHeight,
        menubar: 'file edit view insert format tools table help',
        menu: {
          file: { title: 'File', items: 'newdocument restoredraft | preview | print' },
          edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
          view: { title: 'View', items: 'code | visualaid visualchars visualblocks | preview fullscreen' },
          insert: { title: 'Insert', items: 'image link media inserttable | charmap emoticons hr | pagebreak nonbreaking anchor | insertdatetime' },
          format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | styles blocks fontfamily fontsize align lineheight | forecolor backcolor | language | removeformat' },
          tools: { title: 'Tools', items: 'wordcount' },
          table: { title: 'Table', items: 'inserttable | cell row column | tableprops deletetable' },
          help: { title: 'Help', items: 'help' }
        },
        plugins: FREE_OPENSOURCE_PLUGINS,
        toolbar:
          'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | ' +
          'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
          'bullist numlist outdent indent | table link image media | ' +
          'accordion pagebreak emoticons charmap | searchreplace visualblocks code fullscreen preview print',
        quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote quicktable',
        toolbar_mode: 'sliding',
        contextmenu: 'link image table',
        skin: isDark ? 'oxide-dark' : 'oxide',
        content_css: isDark ? 'dark' : 'default',
        content_style: `
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
            font-size: 15px;
            line-height: 1.6;
            padding: 1.5rem;
            max-width: 900px;
            margin: 0 auto;
            background-color: ${isDark ? '#111827' : '#ffffff'};
            color: ${isDark ? '#f3f4f6' : '#1e293b'};
          }
          .mce-pagebreak {
            border: 1px dashed #64748b;
            height: 1px;
            margin: 2rem 0;
            position: relative;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 1rem 0;
          }
          table td, table th {
            border: 1px solid ${isDark ? '#374151' : '#cbd5e1'};
            padding: 8px 12px;
          }
        `,
        placeholder,
        setup: (editor: any) => {
          editorInstanceRef.current = editor;

          editor.on('init', () => {
            if (isMounted) {
              editor.setContent(value || '');
            }
          });

          editor.on('change input undo redo keyup SetContent', () => {
            if (isUpdatingFromProp.current) return;
            const content = editor.getContent();
            onChangeRef.current?.(content);
          });
        },
      });
    };

    if (!window.tinymce) {
      const existingScript = document.querySelector('script[src*="tinymce.min.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', initEditor);
      } else {
        const script = document.createElement('script');
        script.src = '/tinymce/tinymce.min.js';
        script.async = true;
        script.onload = initEditor;
        document.head.appendChild(script);
      }
    } else {
      initEditor();
    }

    return () => {
      isMounted = false;
      try {
        if (window.tinymce) {
          window.tinymce.remove(`#${editorId}`);
        }
      } catch {}
      editorInstanceRef.current = null;
    };
  }, [editorId, minHeight, placeholder]);

  // Handle external value changes (e.g. changing templates)
  useEffect(() => {
    if (editorInstanceRef.current) {
      const current = editorInstanceRef.current.getContent();
      if (value !== current) {
        isUpdatingFromProp.current = true;
        editorInstanceRef.current.setContent(value || '');
        isUpdatingFromProp.current = false;
      }
    }
  }, [value]);

  return (
    <div ref={containerRef} className="tinymce-wrapper w-full h-full min-h-[500px]">
      <textarea id={editorId} ref={textareaRef} style={{ display: 'none' }} defaultValue={value} />
    </div>
  );
});

export default RichTextEditor;
