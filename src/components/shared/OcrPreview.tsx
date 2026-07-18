import { useState, useEffect, useCallback } from 'react';
import { FileText, ScanEye, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Edit3, Save, X } from 'lucide-react';

type OcrStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;

interface OcrPreviewProps {
  ocrText?: string | null;
  ocrStatus?: OcrStatus;
  ocrProcessedAt?: string | null;
  /** Called when user saves edited OCR text */
  onSaveOcrText?: (text: string) => Promise<void>;
  /** Called to trigger OCR processing */
  onTriggerOcr?: () => Promise<void>;
  /** Whether a file is uploaded (shows trigger button) */
  hasFile?: boolean;
}

export default function OcrPreview({
  ocrText,
  ocrStatus,
  ocrProcessedAt,
  onSaveOcrText,
  onTriggerOcr,
  hasFile,
}: OcrPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Reset editing state when OCR text changes
  useEffect(() => {
    setEditedText(ocrText || '');
    setEditing(false);
  }, [ocrText]);

  const handleSave = useCallback(async () => {
    if (!onSaveOcrText) return;
    setSaving(true);
    try {
      await onSaveOcrText(editedText);
      setEditing(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [editedText, onSaveOcrText]);

  const handleTriggerOcr = useCallback(async () => {
    if (!onTriggerOcr) return;
    setTriggering(true);
    try {
      await onTriggerOcr();
    } catch {
      // ignore
    } finally {
      setTriggering(false);
    }
  }, [onTriggerOcr]);

  const statusIcon = () => {
    switch (ocrStatus) {
      case 'COMPLETED':
        return <CheckCircle2 size={14} className="ocr-status-icon ocr-status-icon--completed" />;
      case 'PROCESSING':
        return <Loader2 size={14} className="ocr-status-icon ocr-status-icon--processing" />;
      case 'FAILED':
        return <AlertCircle size={14} className="ocr-status-icon ocr-status-icon--failed" />;
      default:
        return <ScanEye size={14} className="ocr-status-icon ocr-status-icon--pending" />;
    }
  };

  const statusLabel = () => {
    switch (ocrStatus) {
      case 'COMPLETED':
        return 'OCR Completed';
      case 'PROCESSING':
        return 'Processing OCR…';
      case 'FAILED':
        return 'OCR Failed';
      default:
        return 'OCR Pending';
    }
  };

  const hasOcrData = ocrStatus === 'COMPLETED' && ocrText;
  const canTrigger = hasFile && ocrStatus !== 'PROCESSING';

  return (
    <div className="ocr-preview">
      <button
        type="button"
        className="ocr-preview__header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="ocr-preview__header-left">
          <FileText size={15} />
          <span>OCR Preview</span>
          {ocrStatus && (
            <span className={`ocr-badge ocr-badge--${ocrStatus.toLowerCase()}`}>
              {statusIcon()}
              {statusLabel()}
            </span>
          )}
        </div>
        <div className="ocr-preview__header-right">
          {ocrProcessedAt && (
            <span className="ocr-preview__timestamp">
              {new Date(ocrProcessedAt).toLocaleString()}
            </span>
          )}
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="ocr-preview__body">
          {hasOcrData ? (
            <>
              {editing ? (
                <textarea
                  className="ocr-preview__textarea"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={8}
                  placeholder="Extracted text will appear here..."
                />
              ) : (
                <div className="ocr-preview__text">
                  {ocrText?.split('\n').map((line, i) => (
                    <p key={i}>{line || '\u00A0'}</p>
                  ))}
                </div>
              )}

              <div className="ocr-preview__actions">
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="ocr-preview__btn ocr-preview__btn--save"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      <Save size={14} />
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="ocr-preview__btn ocr-preview__btn--cancel"
                      onClick={() => { setEditing(false); setEditedText(ocrText || ''); }}
                    >
                      <X size={14} />
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ocr-preview__btn ocr-preview__btn--edit"
                    onClick={() => setEditing(true)}
                  >
                    <Edit3 size={14} />
                    Edit Text
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="ocr-preview__empty">
              <ScanEye size={28} className="ocr-preview__empty-icon" />
              <p className="ocr-preview__empty-title">
                {ocrStatus === 'FAILED'
                  ? 'OCR could not extract readable text.'
                  : ocrStatus === 'PROCESSING'
                    ? 'OCR is currently processing…'
                    : 'No OCR data available.'}
              </p>
              <p className="ocr-preview__empty-text">
                {ocrStatus === 'FAILED'
                  ? 'The uploaded file may contain no readable text, or the format is not supported.'
                  : ocrStatus === 'PROCESSING'
                    ? 'This may take a few moments depending on file size.'
                    : canTrigger
                      ? 'Click "Run OCR" to extract text from the uploaded file.'
                      : 'Upload a PDF or image file first to enable OCR.'}
              </p>
              {canTrigger && (
                <button
                  type="button"
                  className="ocr-preview__btn ocr-preview__btn--trigger"
                  onClick={handleTriggerOcr}
                  disabled={triggering}
                >
                  {triggering ? (
                    <><Loader2 size={14} className="ocr-spin" /> Running…</>
                  ) : (
                    <><ScanEye size={14} /> Run OCR</>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
