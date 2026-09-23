import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, Pause } from 'lucide-react';
import './MessageStrip.css';

export type MessageStripType = 'success' | 'error' | 'warning' | 'information' | 'info' | 'primary' | 'danger';

const ICONS: Record<string, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  information: Info,
  info: Info,
  primary: Info,
  danger: AlertCircle,
};

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
  const Icon = ICONS[type] || Info;
  const [isHovered, setIsHovered] = useState(false);

  // Store onClose in a ref so inline callbacks don't reset the auto-hide timer on each render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Default duration extended to 12 seconds minimum if autoHideMs is provided
  const effectiveAutoHideMs = autoHideMs ? Math.max(autoHideMs, 12000) : undefined;

  const startTimer = useCallback((durationMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onCloseRef.current?.();
    }, durationMs);
  }, []);

  useEffect(() => {
    if (!effectiveAutoHideMs || !onCloseRef.current) return undefined;

    // Start timer with 12s minimum
    startTimer(effectiveAutoHideMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [effectiveAutoHideMs, startTimer]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (effectiveAutoHideMs && onCloseRef.current) {
      // Resume timer with 10s grace period when mouse leaves
      startTimer(10000);
    }
  };

  return (
    <div
      className={[
        'sap-message-strip',
        `sap-message-strip--${type}`,
        compact ? 'sap-message-strip--compact' : '',
        isHovered ? 'sap-message-strip--paused' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Icon size={compact ? 15 : 16} className="sap-message-strip__icon" aria-hidden />
      <span className="sap-message-strip__text">{children}</span>
      {isHovered && effectiveAutoHideMs && (
        <span className="sap-message-strip__paused-badge" title="Auto-dismiss paused on hover">
          <Pause size={10} /> Paused
        </span>
      )}
      {onClose && (
        <button
          type="button"
          className="sap-message-strip__close"
          onClick={onClose}
          aria-label="Dismiss message"
          title="Dismiss notification ('X')"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default MessageStrip;
