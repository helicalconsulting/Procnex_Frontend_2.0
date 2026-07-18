import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSignature, X, ExternalLink } from 'lucide-react';
import { sseClient } from '../../services/sseClient';
import './ToastContainer.css';

// ─── Types ──────────────────────────────────────────────────

interface Toast {
  id: string;
  title: string;
  message: string;
  vendorId: string;
  documentType: string;
  createdAt: number;
}

// ─── Component ──────────────────────────────────────────────

export default function ToastContainer() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (title: string, message: string, vendorId: string, documentType: string) => {
      const id = `toast-${++toastIdRef.current}`;
      const toast: Toast = { id, title, message, vendorId, documentType, createdAt: Date.now() };
      setToasts((prev) => [...prev, toast]);

      // Auto-remove after 8 seconds
      setTimeout(() => removeToast(id), 8000);
    },
    [removeToast]
  );

  useEffect(() => {
    // Listen for real-time notification events with type 'vendor_signed_agreement'
    const unsubscribe = sseClient.on('notification', (data: unknown) => {
      const payload = data as Record<string, unknown>;
      if (payload?.type === 'vendor_signed_agreement') {
        addToast(
          String(payload.title || 'Agreement Signed'),
          String(payload.message || ''),
          String(payload.vendorId || ''),
          String(payload.documentType || '')
        );
      }
    });

    return () => unsubscribe();
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast toast--signed-agreement"
          onClick={() => {
            removeToast(toast.id);
            navigate('/onboarding/queue');
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              removeToast(toast.id);
              navigate('/onboarding/queue');
            }
          }}
        >
          <div className="toast__icon-wrapper">
            <FileSignature size={18} />
          </div>
          <div className="toast__content">
            <div className="toast__title">{toast.title}</div>
            <div className="toast__message">{toast.message}</div>
            <div className="toast__action">
              <ExternalLink size={11} />
              <span>View in Onboarding Queue</span>
            </div>
          </div>
          <button
            type="button"
            className="toast__close"
            onClick={(e) => {
              e.stopPropagation();
              removeToast(toast.id);
            }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
