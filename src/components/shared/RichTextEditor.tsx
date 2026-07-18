import { useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your email content here...',
  minHeight = 200,
  maxHeight = 500,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Set initial content when mounted or value changes externally
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      editorRef.current.innerHTML = value || '';
    }
    isInternalChange.current = false;
  }, [value]);

  const execCmd = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
      const html = editorRef.current.innerHTML;

      // If empty or just <br>, set to empty
      const cleanHtml = html === '<br>' ? '' : html;
      isInternalChange.current = true;
      onChange(cleanHtml);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const cleanHtml = html === '<br>' ? '' : html;
      isInternalChange.current = true;
      onChange(cleanHtml);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleToolbarAction = useCallback((action: string) => {
    switch (action) {
      case 'bold':
        execCmd('bold');
        break;
      case 'italic':
        execCmd('italic');
        break;
      case 'underline':
        execCmd('underline');
        break;
      case 'ul':
        execCmd('insertUnorderedList');
        break;
      case 'ol':
        execCmd('insertOrderedList');
        break;
      case 'left':
        execCmd('justifyLeft');
        break;
    }
  }, [execCmd]);

  return (
    <div className="rte-wrapper">
      <div className="rte-toolbar">
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => handleToolbarAction('bold')}
          title="Bold"
          tabIndex={-1}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => handleToolbarAction('italic')}
          title="Italic"
          tabIndex={-1}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => handleToolbarAction('underline')}
          title="Underline"
          tabIndex={-1}
        >
          <Underline size={15} />
        </button>
        <span className="rte-toolbar__sep" />
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => handleToolbarAction('ul')}
          title="Bullet List"
          tabIndex={-1}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => handleToolbarAction('ol')}
          title="Numbered List"
          tabIndex={-1}
        >
          <ListOrdered size={15} />
        </button>
        <span className="rte-toolbar__sep" />
        <button
          type="button"
          className="rte-toolbar__btn"
          onClick={() => handleToolbarAction('left')}
          title="Align Left"
          tabIndex={-1}
        >
          <AlignLeft size={15} />
        </button>
      </div>
      <div
        className="rte-editor"
        style={{ minHeight, maxHeight }}
      >
        <div
          ref={editorRef}
          className="rte-editor__content"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          data-placeholder={placeholder}
        />
      </div>
    </div>
  );
}
