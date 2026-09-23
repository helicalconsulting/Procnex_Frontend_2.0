import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSignature, CheckCircle2, X, ExternalLink, Eye, ArrowRight, Pause } from 'lucide-react';
import { sseClient } from '../../services/sseClient';
import './ToastContainer.css';

// ─── Types ──────────────────────────────────────────────────

interface BaseToast {
  id: string;
  type: 'onboarding-signature' | 'contract-signed';
  createdAt: number;
}

interface OnboardingSignatureToast extends BaseToast {
  type: 'onboarding-signature';
  title: string;
  message: string;
  vendorId: string;
  documentType: string;
}

interface ContractSignedToast extends BaseToast {
  type: 'contract-signed';
  contractId: string;
  contractNumber: string;
  vendorName: string;
  signedBy: string;
  signedAt: string;
  contractValue: number;
  currency: string;
  rfqId: string | null;
  rfqNumber: string | null;
  rfqTitle: string | null;
}

type Toast = OnboardingSignatureToast | ContractSignedToast;

// ─── Helpers ──────────────────────────────────────────────────

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

// ─── ToastItem Subcomponent (Handles auto-dismiss timer, hover-pause, & close) ──

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}

function ToastItem({ toast, onRemove, navigate }: ToastItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimer = useCallback((durationMs: number = 15000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onRemove(toast.id);
    }, durationMs);
  }, [toast.id, onRemove]);

  useEffect(() => {
    // Initial display duration set to 15 seconds for maximum readability
    startTimer(15000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Give user an extra 10 seconds after mouse leaves
    startTimer(10000);
  };

  if (toast.type === 'contract-signed') {
    return (
      <div
        key={toast.id}
        className={`toast toast--contract-signed ${isHovered ? 'toast--paused' : ''}`}
        role="alert"
        aria-live="assertive"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="toast--contract-signed__ribbon">
          <CheckCircle2 size={22} />
        </div>
        <div className="toast__content">
          <div className="toast__header-row">
            <div className="toast--contract-signed__badge">CONTRACT SIGNED</div>
            {isHovered && (
              <span className="toast__paused-badge" title="Auto-dismiss paused while hovering">
                <Pause size={10} /> Paused
              </span>
            )}
          </div>
          <div className="toast--contract-signed__vendor">
            {toast.vendorName}
          </div>
          <div className="toast--contract-signed__meta">
            <span className="toast--contract-signed__contract-number">{toast.contractNumber}</span>
            <span className="toast--contract-signed__dot">·</span>
            <span className="toast--contract-signed__value">{formatCurrency(toast.contractValue, toast.currency)}</span>
            {toast.rfqNumber && (
              <>
                <span className="toast--contract-signed__dot">·</span>
                <span className="toast--contract-signed__rfq">{toast.rfqNumber}</span>
              </>
            )}
          </div>
          <div className="toast--contract-signed__actions">
            <button
              type="button"
              className="toast--contract-signed__btn toast--contract-signed__btn--primary"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(toast.id);
                navigate(`/contracts/${toast.contractId}`);
              }}
            >
              <Eye size={13} />
              <span>View</span>
            </button>
            <button
              type="button"
              className="toast--contract-signed__btn toast--contract-signed__btn--secondary"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(toast.id);
                if (toast.rfqId) {
                  navigate(`/procurement/purchase-requisition/${toast.rfqId}?contractId=${toast.contractId}`);
                } else {
                  navigate(`/contracts/${toast.contractId}`);
                }
              }}
            >
              <ArrowRight size={13} />
              <span>Create PO</span>
            </button>
            <button
              type="button"
              className="toast__close"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(toast.id);
              }}
              aria-label="Dismiss notification"
              title="Close (Dismiss)"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Onboarding signature toast
  return (
    <div
      key={toast.id}
      className={`toast toast--signed-agreement ${isHovered ? 'toast--paused' : ''}`}
      onClick={() => {
        onRemove(toast.id);
        navigate('/onboarding/queue');
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRemove(toast.id);
          navigate('/onboarding/queue');
        }
      }}
    >
      <div className="toast__icon-wrapper">
        <FileSignature size={18} />
      </div>
      <div className="toast__content">
        <div className="toast__header-row">
          <div className="toast__title">{toast.title}</div>
          {isHovered && (
            <span className="toast__paused-badge" title="Auto-dismiss paused while hovering">
              <Pause size={10} /> Paused
            </span>
          )}
        </div>
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
          onRemove(toast.id);
        }}
        aria-label="Dismiss notification"
        title="Close (Dismiss)"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Main ToastContainer Component ───────────────────────────

export default function ToastContainer() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addOnboardingToast = useCallback(
    (title: string, message: string, vendorId: string, documentType: string) => {
      const id = `toast-${++toastIdRef.current}`;
      const toast: OnboardingSignatureToast = { id, type: 'onboarding-signature', title, message, vendorId, documentType, createdAt: Date.now() };
      setToasts((prev) => [...prev, toast]);
    },
    []
  );

  const addContractSignedToast = useCallback(
    (data: Omit<ContractSignedToast, 'id' | 'type' | 'createdAt'>) => {
      const id = `toast-${++toastIdRef.current}`;
      const toast: ContractSignedToast = { id, type: 'contract-signed', ...data, createdAt: Date.now() };
      setToasts((prev) => [toast, ...prev]);
    },
    []
  );

  useEffect(() => {
    // Listen for real-time notification events with type 'vendor_signed_agreement'
    const unsubNotification = sseClient.on('notification', (data: unknown) => {
      const payload = data as Record<string, unknown>;
      if (payload?.type === 'vendor_signed_agreement') {
        addOnboardingToast(
          String(payload.title || 'Agreement Signed'),
          String(payload.message || ''),
          String(payload.vendorId || ''),
          String(payload.documentType || '')
        );
      }
    });

    // Listen for real-time contract signing events
    const unsubContractSigned = sseClient.on('contract_signed', (data: unknown) => {
      const payload = data as {
        contractId: string;
        contractNumber: string;
        vendorName: string;
        signedBy: string;
        signedAt: string;
        contractValue: number;
        currency: string;
        rfqId: string | null;
        rfqNumber: string | null;
        rfqTitle: string | null;
      };
      if (!payload?.contractId) return;
      addContractSignedToast(payload);
    });

    return () => {
      unsubNotification();
      unsubContractSigned();
    };
  }, [addOnboardingToast, addContractSignedToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} navigate={navigate} />
      ))}
    </div>
  );
}

