import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import './MessageStrip.css';

export type MessageStripType = 'success' | 'error' | 'warning' | 'information';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  information: Info,
} as const;

export function inferMessageType(message: unknown): MessageStripType {
  const str = typeof message === 'string' ? message : (message && typeof message === 'object') ? JSON.stringify(message) : String(message || '');
  const lower = str.toLowerCase();
  if (/\b(fail|failed|failure|error|cannot|can't|could not|invalid|missing|unable|denied)\b/.test(lower)) {
    return 'error';
  }
  if (/\bwarn/.test(lower)) {
    return 'warning';
  }
  if (/\b(success|created|updated|deleted|saved|sent|removed|added|marked|resent|approved|signed)\b/.test(lower)) {
    return 'success';
  }
  return 'information';
}

interface MessageStripProps {
  children: ReactNode;
  type?: MessageStripType;
  onClose?: () => void;
  autoHideMs?: number;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function MessageStrip({
  children,
  type = 'information',
  onClose,
  autoHideMs,
  compact = false,
  className = '',
  style,
}: MessageStripProps) {
  const Icon = ICONS[type];

  // Store onClose in a ref so inline callbacks don't reset the auto-hide timer on each render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!autoHideMs || !onCloseRef.current) return undefined;
    const timer = window.setTimeout(() => onCloseRef.current?.(), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [autoHideMs]);

  return (
    <div
      className={[
        'sap-message-strip',
        `sap-message-strip--${type}`,
        compact ? 'sap-message-strip--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      style={style}
    >
      <Icon size={compact ? 15 : 16} className="sap-message-strip__icon" aria-hidden />
      <span className="sap-message-strip__text">{children}</span>
      {onClose && (
        <button
          type="button"
          className="sap-message-strip__close"
          onClick={onClose}
          aria-label="Dismiss message"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default MessageStrip;
