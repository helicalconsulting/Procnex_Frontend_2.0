import { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table, Minus, RemoveFormatting,
  Subscript, Superscript, Maximize2, Minimize2, Printer, FilePlus, Plus
} from 'lucide-react';

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

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(function RichTextEditor(
  {
    value,
    onChange,
    placeholder = 'Write content here...',
    minHeight = 750,
    maxHeight,
  },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);

  // Pagination & Multi-Page States (MS Word / Google Docs Style)
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [paperMode, setPaperMode] = useState<'theme' | 'white'>('theme');

  // Formatting States (Google Docs Style Selection Tracking)
  const [fontFamily, setFontFamily] = useState('Segoe UI');
  const [fontSize, setFontSize] = useState('15px');
  const [heading, setHeading] = useState('p');
  const [lineHeight, setLineHeight] = useState<string>('1.6');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [wordCount, setWordCount] = useState<number>(0);
  const [charCount, setCharCount] = useState<number>(0);

  // Active Toggle States
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrike, setIsStrike] = useState(false);
  const [activeAlign, setActiveAlign] = useState<'left' | 'center' | 'right' | 'justify'>('left');

  // Update Stats & Active Toolbar States
  const updateStatsAndSelection = useCallback(() => {
    if (!editorRef.current) return;

    // Stats
    const text = editorRef.current.innerText || '';
    const cleanText = text.trim();
    const words = cleanText ? cleanText.split(/\s+/).filter(Boolean).length : 0;
    setWordCount(words);
    setCharCount(text.length);

    // Selection formatting inspection
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    try {
      const range = sel.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    } catch {
      // Ignore security/range edge cases
    }

    try {
      setIsBold(document.queryCommandState('bold'));
      setIsItalic(document.queryCommandState('italic'));
      setIsUnderline(document.queryCommandState('underline'));
      setIsStrike(document.queryCommandState('strikeThrough'));

      if (document.queryCommandState('justifyCenter')) setActiveAlign('center');
      else if (document.queryCommandState('justifyRight')) setActiveAlign('right');
      else if (document.queryCommandState('justifyFull')) setActiveAlign('justify');
      else setActiveAlign('left');

      let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

      if (node && node instanceof HTMLElement) {
        const computed = window.getComputedStyle(node);
        if (computed.fontFamily) {
          const mainFont = computed.fontFamily.replace(/["']/g, '').split(',')[0].trim();
          setFontFamily(mainFont);
        }
        if (computed.fontSize) {
          const num = parseFloat(computed.fontSize);
          let norm = '15px';
          if (!isNaN(num)) {
            if (num <= 12) norm = '11px';
            else if (num <= 14) norm = '13px';
            else if (num <= 16) norm = '15px';
            else if (num <= 20) norm = '18px';
            else if (num <= 25) norm = '22px';
            else if (num <= 32) norm = '28px';
            else norm = '36px';
          }
          setFontSize(norm);
        }

        const block = node.closest('h1, h2, h3, blockquote, p') as HTMLElement;
        if (block) {
          setHeading(block.tagName.toLowerCase());
        } else {
          setHeading('p');
        }
      }
    } catch {
      // Ignore security/range edge cases
    }
  }, []);

  // Listen to selectionchange globally when editor is focused
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (
        document.activeElement === editorRef.current ||
        editorRef.current?.contains(document.activeElement) ||
        (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer))
      ) {
        updateStatsAndSelection();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updateStatsAndSelection]);

  // Set initial content & default paragraph separator
  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // Fallback
    }

    if (editorRef.current && !isInternalChange.current) {
      editorRef.current.innerHTML = value || '';
      savedRangeRef.current = null;
      updateStatsAndSelection();
    }
    isInternalChange.current = false;
  }, [value, updateStatsAndSelection]);

  // A4 Pagination & Multi-Page Engine (MS Word Style)
  const recalculatePagination = useCallback(() => {
    if (!editorRef.current) return;
    const container = editorRef.current;
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) {
      setTotalPages(1);
      return;
    }

    // A4 printable content height in px (standard A4 1123px - top 56px - bottom 56px = 1011px)
    const PAGE_CONTENT_HEIGHT = 1011;
    let pageNum = 1;

    // Reset automatic page breaks
    children.forEach((el) => {
      if (el.classList.contains('rte-auto-page-break')) {
        el.classList.remove('rte-auto-page-break');
        el.removeAttribute('data-page');
      }
    });

    let currentAccHeight = 0;
    children.forEach((child) => {
      const isManual =
        child.classList.contains('rte-manual-page-break') ||
        !!child.querySelector('.rte-manual-page-break');

      if (isManual) {
        pageNum++;
        const targetEl = child.classList.contains('rte-manual-page-break')
          ? child
          : (child.querySelector('.rte-manual-page-break') as HTMLElement);

        if (targetEl) {
          targetEl.setAttribute('data-page', String(pageNum));
          // MS Word Page Break behavior: push the next page boundary down
          const remainingOnPage = Math.max(50, PAGE_CONTENT_HEIGHT - currentAccHeight);
          targetEl.style.marginTop = `${remainingOnPage}px`;

          const lbl = targetEl.querySelector('.rte-page-break-label');
          if (lbl) {
            lbl.textContent = `Page Break • Starts Page ${pageNum}`;
          }
        }
        currentAccHeight = 0;
        return;
      }

      const childHeight = child.offsetHeight || 24;
      if (currentAccHeight > 0 && currentAccHeight + childHeight > PAGE_CONTENT_HEIGHT) {
        pageNum++;
        child.classList.add('rte-auto-page-break');
        child.setAttribute('data-page', String(pageNum));
        currentAccHeight = childHeight;
      } else {
        currentAccHeight += childHeight;
      }
    });

    setTotalPages(Math.max(1, pageNum));
  }, []);

  const handleScroll = useCallback(() => {
    if (!editorScrollRef.current) return;
    const scrollTop = editorScrollRef.current.scrollTop;
    const page = Math.min(totalPages, Math.max(1, Math.floor((scrollTop + 200) / 1050) + 1));
    setCurrentPage(page);
  }, [totalPages]);

  const insertPageBreak = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const pageBreakHtml = `<div class="rte-manual-page-break" contenteditable="false" data-page-break="true"><span class="rte-page-break-label">Page Break</span></div><p><br></p>`;
    let inserted = false;
    try {
      inserted = document.execCommand('insertHTML', false, pageBreakHtml);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const div = document.createElement('div');
        div.className = 'rte-manual-page-break';
        div.contentEditable = 'false';
        div.innerHTML = '<span class="rte-page-break-label">Page Break</span>';
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        range.insertNode(p);
        range.insertNode(div);
        range.setStart(p, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    isInternalChange.current = true;
    onChange(editorRef.current.innerHTML);
    updateStatsAndSelection();
    setTimeout(() => {
      recalculatePagination();
      const allBreaks = editorRef.current?.querySelectorAll('.rte-manual-page-break');
      if (allBreaks && allBreaks.length > 0) {
        const lastBreak = allBreaks[allBreaks.length - 1];
        lastBreak.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }, [onChange, updateStatsAndSelection, recalculatePagination]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      insertPageBreak();
    }
  }, [insertPageBreak]);

  useEffect(() => {
    recalculatePagination();
  }, [value, recalculatePagination]);

  useEffect(() => {
    if (!editorRef.current) return;
    const observer = new ResizeObserver(() => {
      recalculatePagination();
    });
    observer.observe(editorRef.current);
    return () => observer.disconnect();
  }, [recalculatePagination]);

  // Ensure scrollbar starts at the very top of Page 1
  useEffect(() => {
    if (editorScrollRef.current) {
      editorScrollRef.current.scrollTop = 0;
    }
  }, []);

  const insertText = useCallback((text: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    if (sel) {
      if (
        savedRangeRef.current &&
        editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)
      ) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      } else {
        const hasRangeInEditor =
          sel.rangeCount > 0 &&
          editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);
        if (!hasRangeInEditor) {
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      try {
        inserted = document.execCommand('insertHTML', false, text);
      } catch {
        inserted = false;
      }
    }

    if (!inserted && sel && sel.rangeCount > 0) {
      try {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
        inserted = true;
      } catch {
        editorRef.current.appendChild(document.createTextNode(text));
      }
    }

    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }

    const html = editorRef.current.innerHTML;
    const cleanHtml = html === '<br>' ? '' : html;
    isInternalChange.current = true;
    onChange(cleanHtml);
    updateStatsAndSelection();
  }, [onChange, updateStatsAndSelection]);

  const insertHtml = useCallback((html: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    if (sel) {
      if (
        savedRangeRef.current &&
        editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)
      ) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      } else {
        const hasRangeInEditor =
          sel.rangeCount > 0 &&
          editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);
        if (!hasRangeInEditor) {
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }

    let inserted = false;
    try {
      inserted = document.execCommand('insertHTML', false, html);
    } catch {
      inserted = false;
    }

    if (!inserted && sel && sel.rangeCount > 0) {
      try {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const el = document.createElement('div');
        el.innerHTML = html;
        const frag = document.createDocumentFragment();
        let node: Node | null;
        let lastNode: Node | null = null;
        while ((node = el.firstChild)) {
          lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        if (lastNode) {
          range.setStartAfter(lastNode);
          range.setEndAfter(lastNode);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {
        editorRef.current.insertAdjacentHTML('beforeend', html);
      }
    }

    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }

    const editorHtml = editorRef.current.innerHTML;
    const cleanHtml = editorHtml === '<br>' ? '' : editorHtml;
    isInternalChange.current = true;
    onChange(cleanHtml);
    updateStatsAndSelection();
  }, [onChange, updateStatsAndSelection]);

  useImperativeHandle(ref, () => ({
    insertText,
    insertHtml,
    insertPageBreak,
    focus: () => editorRef.current?.focus(),
    getEditorElement: () => editorRef.current,
  }), [insertText, insertHtml, insertPageBreak]);

  const execCmd = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      const html = editorRef.current.innerHTML;
      const cleanHtml = html === '<br>' ? '' : html;
      isInternalChange.current = true;
      onChange(cleanHtml);
      updateStatsAndSelection();
      setTimeout(recalculatePagination, 40);
    }
  }, [onChange, updateStatsAndSelection, recalculatePagination]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const cleanHtml = html === '<br>' ? '' : html;
      isInternalChange.current = true;
      onChange(cleanHtml);
      updateStatsAndSelection();
      recalculatePagination();
    }
  }, [onChange, updateStatsAndSelection, recalculatePagination]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const html = e.clipboardData.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, html);
    } else if (text) {
      const formattedHtml = text
        .split(/\n\s*\n/)
        .map((paragraph) => `<p style="margin-bottom:8px;">${paragraph.replace(/\n/g, '<br>')}</p>`)
        .join('');
      document.execCommand('insertHTML', false, formattedHtml);
    }
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
      updateStatsAndSelection();
      setTimeout(recalculatePagination, 50);
    }
  }, [onChange, updateStatsAndSelection, recalculatePagination]);

  // Capture selection before clicking dropdowns
  const captureSelectionBeforeSelect = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  // Apply custom CSS inline style (Font Size / Font Family)
  const applyInlineStyle = useCallback((styleProp: string, styleValue: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    let range: Range | null = null;

    // 1. Restore saved selection if available inside editor
    if (
      savedRangeRef.current &&
      editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)
    ) {
      range = savedRangeRef.current;
      if (sel) {
        try {
          sel.removeAllRanges();
          sel.addRange(range);
        } catch {
          // ignore restore errors
        }
      }
    } else if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0);
    }

    // 2. If text is highlighted (range is not collapsed)
    if (range && !range.collapsed) {
      try {
        const fragment = range.extractContents();
        const hasBlock = fragment.querySelector('p, div, h1, h2, h3, blockquote, table, ul, ol, li');
        const wrapper = document.createElement(hasBlock ? 'div' : 'span');
        wrapper.style.setProperty(styleProp, styleValue, 'important');

        // Clear conflicting child styles of same property so new style takes precedence
        wrapper.querySelectorAll('*').forEach((child) => {
          (child as HTMLElement).style.removeProperty(styleProp);
        });

        wrapper.appendChild(fragment);
        range.insertNode(wrapper);

        // Keep text selected after styling
        const newRange = document.createRange();
        newRange.selectNodeContents(wrapper);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
        savedRangeRef.current = newRange.cloneRange();
      } catch (err) {
        console.warn('Range wrap error:', err);
      }
    } else {
      // 3. Range is collapsed or no selection: style the current block or paragraph
      let targetNode: HTMLElement | null = null;
      if (range) {
        let node: Node | null = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        if (node && node instanceof HTMLElement && editorRef.current.contains(node)) {
          targetNode = (node.closest('span, p, h1, h2, h3, blockquote, li, td, th') as HTMLElement) || node;
        }
      }

      if (targetNode && targetNode !== editorRef.current) {
        targetNode.style.setProperty(styleProp, styleValue, 'important');
        targetNode.querySelectorAll('*').forEach((child) => {
          (child as HTMLElement).style.removeProperty(styleProp);
        });
      } else {
        // Fallback: apply to root blocks or entire content
        const blocks = editorRef.current.querySelectorAll('p, div, h1, h2, h3');
        if (blocks.length > 0) {
          blocks.forEach((b) => {
            (b as HTMLElement).style.setProperty(styleProp, styleValue, 'important');
            (b as HTMLElement).querySelectorAll('*').forEach((child) => {
              (child as HTMLElement).style.removeProperty(styleProp);
            });
          });
        } else {
          editorRef.current.style.setProperty(styleProp, styleValue, 'important');
        }
      }
    }

    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const cleanHtml = html === '<br>' ? '' : html;
      isInternalChange.current = true;
      onChange(cleanHtml);
      updateStatsAndSelection();
      setTimeout(recalculatePagination, 40);
    }
  }, [onChange, updateStatsAndSelection, recalculatePagination]);

  const handleAlign = useCallback((alignment: 'left' | 'center' | 'right' | 'justify') => {
    if (alignment === 'justify') {
      execCmd('justifyFull');
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        if (node && node instanceof HTMLElement) {
          const block = (node.closest('p, div, li, td, h1, h2, h3, blockquote') as HTMLElement) || node;
          if (block && block !== editorRef.current) {
            block.style.textAlign = 'justify';
            block.style.textJustify = 'inter-word';
          }
        }
      }
    } else if (alignment === 'left') {
      execCmd('justifyLeft');
    } else if (alignment === 'center') {
      execCmd('justifyCenter');
    } else if (alignment === 'right') {
      execCmd('justifyRight');
    }
    setActiveAlign(alignment);
  }, [execCmd]);

  const handleHeadingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setHeading(val);
    if (editorRef.current) {
      editorRef.current.focus();
      const sel = window.getSelection();
      if (savedRangeRef.current && sel && editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)) {
        try {
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current);
        } catch {}
      }
    }
    execCmd('formatBlock', val);
  };

  const handleFontFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const font = e.target.value;
    setFontFamily(font);
    applyInlineStyle('font-family', font);
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = e.target.value;
    setFontSize(size);
    applyInlineStyle('font-size', size);
  };

  const handleLineHeightChange = (val: string) => {
    setLineHeight(val);
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    let range: Range | null = null;
    if (savedRangeRef.current && sel && editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)) {
      range = savedRangeRef.current;
      try {
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {}
    } else if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0);
    }

    if (range) {
      let node: Node | null = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const block = (node?.parentElement?.closest('p, div, h1, h2, h3, blockquote, li, td') as HTMLElement) || (node as HTMLElement);
      if (block && block !== editorRef.current) {
        block.style.lineHeight = val;
      } else {
        editorRef.current.style.lineHeight = val;
      }
    } else {
      editorRef.current.style.lineHeight = val;
    }
    const html = editorRef.current.innerHTML;
    onChange(html === '<br>' ? '' : html);
    updateStatsAndSelection();
  };

  const insertTable = () => {
    const tableHtml = `
      <table style="width:100%; border-collapse:collapse; margin:12px 0; border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-weight:600;">Header 1</th>
            <th style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-weight:600;">Header 2</th>
            <th style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-weight:600;">Header 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px 12px;">Cell 1</td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px;">Cell 2</td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px;">Cell 3</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px 12px;">Cell 4</td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px;">Cell 5</td>
            <td style="border:1px solid #cbd5e1; padding:8px 12px;">Cell 6</td>
          </tr>
        </tbody>
      </table><p><br></p>`;
    execCmd('insertHTML', tableHtml);
  };

  const toggleFullScreen = () => {
    setIsFullScreen((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      className={`rte-wrapper ${isFullScreen ? 'rte-wrapper--fullscreen' : ''}`}
    >
      {/* Google Docs Toolbar */}
      <div className="rte-toolbar">
        {/* Undo / Redo */}
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('undo')}
          title="Undo (Ctrl+Z)"
          tabIndex={-1}
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('redo')}
          title="Redo (Ctrl+Y)"
          tabIndex={-1}
        >
          <Redo2 size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => window.print()}
          title="Print Document"
          tabIndex={-1}
        >
          <Printer size={14} />
        </button>

        <span className="rte-toolbar__sep" />

        {/* Headings */}
        <select
          className="rte-toolbar__select rte-toolbar__select--heading"
          value={heading}
          onMouseDown={captureSelectionBeforeSelect}
          onChange={handleHeadingChange}
          title="Text Formatting / Headings"
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1 (Title)</option>
          <option value="h2">Heading 2 (Subtitle)</option>
          <option value="h3">Heading 3 (Section)</option>
          <option value="blockquote">Quote / Highlight</option>
        </select>

        {/* Font Family */}
        <select
          className="rte-toolbar__select rte-toolbar__select--font"
          value={fontFamily}
          onMouseDown={captureSelectionBeforeSelect}
          onChange={handleFontFamilyChange}
          title="Font Family"
        >
          <option value="Segoe UI">Segoe UI</option>
          <option value="Arial">Arial</option>
          <option value="Roboto">Roboto</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Trebuchet MS">Trebuchet MS</option>
          <option value="Verdana">Verdana</option>
        </select>

        {/* Font Size Selector (Pixel precision like Google Docs) */}
        <select
          className="rte-toolbar__select rte-toolbar__select--size"
          value={fontSize}
          onMouseDown={captureSelectionBeforeSelect}
          onChange={handleFontSizeChange}
          title="Font Size"
        >
          <option value="11px">11px (Tiny)</option>
          <option value="13px">13px (Small)</option>
          <option value="15px">15px (Normal)</option>
          <option value="18px">18px (Medium)</option>
          <option value="22px">22px (Large)</option>
          <option value="28px">28px (Title)</option>
          <option value="36px">36px (Huge)</option>
        </select>

        {/* Line Spacing */}
        <select
          className="rte-toolbar__select rte-toolbar__select--spacing"
          value={lineHeight}
          onMouseDown={captureSelectionBeforeSelect}
          onChange={(e) => handleLineHeightChange(e.target.value)}
          title="Line Spacing"
        >
          <option value="1.2">Single (1.15)</option>
          <option value="1.6">1.5 Lines</option>
          <option value="2.0">Double (2.0)</option>
        </select>

        <span className="rte-toolbar__sep" />

        {/* Text Styling */}
        <button
          type="button"
          className={`rte-toolbar__btn ${isBold ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => execCmd('bold')}
          title="Bold (Ctrl+B)"
          tabIndex={-1}
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          className={`rte-toolbar__btn ${isItalic ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => execCmd('italic')}
          title="Italic (Ctrl+I)"
          tabIndex={-1}
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          className={`rte-toolbar__btn ${isUnderline ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => execCmd('underline')}
          title="Underline (Ctrl+U)"
          tabIndex={-1}
        >
          <Underline size={14} />
        </button>
        <button
          type="button"
          className={`rte-toolbar__btn ${isStrike ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => execCmd('strikeThrough')}
          title="Strikethrough"
          tabIndex={-1}
        >
          <Strikethrough size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('subscript')}
          title="Subscript"
          tabIndex={-1}
        >
          <Subscript size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('superscript')}
          title="Superscript"
          tabIndex={-1}
        >
          <Superscript size={14} />
        </button>

        <span className="rte-toolbar__sep" />

        {/* Alignments */}
        <button
          type="button"
          className={`rte-toolbar__btn ${activeAlign === 'left' ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => handleAlign('left')}
          title="Align Left"
          tabIndex={-1}
        >
          <AlignLeft size={14} />
        </button>
        <button
          type="button"
          className={`rte-toolbar__btn ${activeAlign === 'center' ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => handleAlign('center')}
          title="Align Center"
          tabIndex={-1}
        >
          <AlignCenter size={14} />
        </button>
        <button
          type="button"
          className={`rte-toolbar__btn ${activeAlign === 'right' ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => handleAlign('right')}
          title="Align Right"
          tabIndex={-1}
        >
          <AlignRight size={14} />
        </button>
        <button
          type="button"
          className={`rte-toolbar__btn ${activeAlign === 'justify' ? 'rte-toolbar__btn--active' : ''}`}
          onClick={() => handleAlign('justify')}
          title="Justify Text"
          tabIndex={-1}
        >
          <AlignJustify size={14} />
        </button>

        <span className="rte-toolbar__sep" />

        {/* Lists & Indents */}
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('insertUnorderedList')}
          title="Bulleted List"
          tabIndex={-1}
        >
          <List size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('insertOrderedList')}
          title="Numbered List"
          tabIndex={-1}
        >
          <ListOrdered size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('outdent')}
          title="Decrease Indent"
          tabIndex={-1}
        >
          <Outdent size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('indent')}
          title="Increase Indent"
          tabIndex={-1}
        >
          <Indent size={14} />
        </button>

        <span className="rte-toolbar__sep" />

        {/* Inserts & Utilities */}
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={insertTable}
          title="Insert Table"
          tabIndex={-1}
        >
          <Table size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('insertHorizontalRule')}
          title="Insert Horizontal Line"
          tabIndex={-1}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={insertPageBreak}
          title="Insert Page Break / Add Next Page (Ctrl+Enter)"
          tabIndex={-1}
        >
          <FilePlus size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => execCmd('removeFormat')}
          title="Clear Formatting"
          tabIndex={-1}
        >
          <RemoveFormatting size={14} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={toggleFullScreen}
          title={isFullScreen ? 'Exit Full Screen' : 'Full Screen Editing'}
          tabIndex={-1}
        >
          {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Main Editor Content Area (Desk Workspace) */}
      <div
        ref={editorScrollRef}
        className={`rte-editor ${paperMode === 'white' ? 'rte-editor--white-paper' : ''}`}
        onClick={(e) => {
          if (e.target === editorScrollRef.current) {
            editorRef.current?.focus();
          }
        }}
        onScroll={handleScroll}
      >
        <div className="rte-paper-container">
          <div className="rte-paper-page-header">
            <span>A4 Document • Page 1</span>
          </div>

          <div
            ref={editorRef}
            className="rte-editor__content"
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onKeyUp={updateStatsAndSelection}
            onMouseUp={updateStatsAndSelection}
            onBlur={updateStatsAndSelection}
            data-placeholder={placeholder}
            style={{ lineHeight, minHeight: `${Math.max(1, totalPages) * 1050}px` }}
          />

          <div className="rte-paper-page-footer">
            <span>Page {totalPages} of {totalPages}</span>
          </div>
        </div>
      </div>

      {/* MS Word / Google Docs Status Bar */}
      <div className="rte-statusbar">
        <div className="rte-statusbar__left">
          <span className="rte-statusbar__page-badge">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="rte-statusbar__add-page-btn"
            onClick={insertPageBreak}
            title="Add Next Page (Ctrl+Enter)"
          >
            <Plus size={13} /> Add Page
          </button>
          <span className="rte-statusbar__sep">•</span>
          <span>{wordCount} words</span>
          <span className="rte-statusbar__sep">•</span>
          <span>{charCount} characters</span>
        </div>
        <div className="rte-statusbar__right">
          <span>MS Word A4 View</span>
        </div>
      </div>
    </div>
  );
});

export default RichTextEditor;
