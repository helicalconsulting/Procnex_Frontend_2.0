import { useRef, useCallback, useEffect, useState } from 'react';
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Palette, Highlighter, Table, Minus, RemoveFormatting,
  Subscript, Superscript, Maximize2, Minimize2, Printer
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number | string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write content here...',
  minHeight = 200,
  maxHeight,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

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
      if (
        document.activeElement === editorRef.current ||
        editorRef.current?.contains(document.activeElement)
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
      updateStatsAndSelection();
    }
    isInternalChange.current = false;
  }, [value, updateStatsAndSelection]);

  const execCmd = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      const html = editorRef.current.innerHTML;
      const cleanHtml = html === '<br>' ? '' : html;
      isInternalChange.current = true;
      onChange(cleanHtml);
      updateStatsAndSelection();
    }
  }, [onChange, updateStatsAndSelection]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const cleanHtml = html === '<br>' ? '' : html;
      isInternalChange.current = true;
      onChange(cleanHtml);
      updateStatsAndSelection();
    }
  }, [onChange, updateStatsAndSelection]);

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
    }
  }, [onChange, updateStatsAndSelection]);

  // Apply custom CSS inline style (Font Size / Font Family)
  const applyInlineStyle = (styleProp: string, styleValue: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    execCmd('fontSize', '7');
    if (editorRef.current) {
      const fontTags = editorRef.current.querySelectorAll('font[size="7"]');
      fontTags.forEach((el) => {
        (el as HTMLElement).removeAttribute('size');
        (el as HTMLElement).style.setProperty(styleProp, styleValue);
      });
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
      updateStatsAndSelection();
    }
  };

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
          className="rte-toolbar__select"
          value={heading}
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
          onChange={(e) => setLineHeight(e.target.value)}
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

        {/* Colors */}
        <label className="rte-toolbar__btn rte-toolbar__color-btn" title="Text Color">
          <Palette size={14} />
          <input
            type="color"
            className="rte-toolbar__color-input"
            onChange={(e) => applyInlineStyle('color', e.target.value)}
          />
        </label>
        <label className="rte-toolbar__btn rte-toolbar__color-btn" title="Highlight / Background Color">
          <Highlighter size={14} />
          <input
            type="color"
            className="rte-toolbar__color-input"
            defaultValue="#fef08a"
            onChange={(e) => applyInlineStyle('background-color', e.target.value)}
          />
        </label>

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

      {/* Main Editor Content Area */}
      <div
        className="rte-editor"
        style={{ minHeight: minHeight || undefined, maxHeight: maxHeight || '100%' }}
        onClick={() => editorRef.current?.focus()}
      >
        <div
          ref={editorRef}
          className="rte-editor__content"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyUp={updateStatsAndSelection}
          onMouseUp={updateStatsAndSelection}
          data-placeholder={placeholder}
          style={{ lineHeight }}
        />
      </div>

      {/* Google Docs Status Bar */}
      <div className="rte-statusbar">
        <div className="rte-statusbar__left">
          <span>{wordCount} words</span>
          <span className="rte-statusbar__sep">•</span>
          <span>{charCount} characters</span>
        </div>
        <div className="rte-statusbar__right">
          <span>Live Google Docs Mode</span>
        </div>
      </div>
    </div>
  );
}
