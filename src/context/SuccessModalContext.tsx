import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X, Check, Copy, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';

export interface SuccessModalDetailItem {
  label: string;
  value: string | number;
}

export interface SuccessModalOptions {
  title: string;
  badge?: string;
  message?: string;
  type?: 'success' | 'info' | 'warning';
  referenceNumber?: string;
  details?: SuccessModalDetailItem[];
  primaryBtnText?: string;
  secondaryBtnText?: string;
  onPrimaryClick?: () => void;
  onSecondaryClick?: () => void;
  onClose?: () => void;
  autoCloseMs?: number;
}

interface SuccessModalContextType {
  showSuccess: (options: SuccessModalOptions) => void;
  hideSuccess: () => void;
}

const SuccessModalContext = createContext<SuccessModalContextType | undefined>(undefined);

export function SuccessModalProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<SuccessModalOptions | null>(null);
  const [copied, setCopied] = useState(false);

  const showSuccess = useCallback((options: SuccessModalOptions) => {
    setModalState(options);
    setCopied(false);
  }, []);

  const hideSuccess = useCallback(() => {
    const onCloseCb = modalState?.onClose;
    setModalState(null);
    setCopied(false);
    if (onCloseCb) {
      onCloseCb();
    }
  }, [modalState]);

  // Listen for global custom events
  useEffect(() => {
    const handleGlobalSuccess = (e: Event) => {
      const customEvent = e as CustomEvent<SuccessModalOptions>;
      if (customEvent.detail) {
        showSuccess(customEvent.detail);
      }
    };

    window.addEventListener('heliflow:success-modal', handleGlobalSuccess);
    return () => {
      window.removeEventListener('heliflow:success-modal', handleGlobalSuccess);
    };
  }, [showSuccess]);

  // Handle ESC key
  useEffect(() => {
    if (!modalState) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideSuccess();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState, hideSuccess]);

  // Handle Auto-close if specified
  useEffect(() => {
    if (!modalState || !modalState.autoCloseMs) return;
    const timer = setTimeout(() => {
      hideSuccess();
    }, modalState.autoCloseMs);
    return () => clearTimeout(timer);
  }, [modalState, hideSuccess]);

  const handleCopyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isWarning = modalState?.type === 'warning';
  const isInfo = modalState?.type === 'info';

  return (
    <SuccessModalContext.Provider value={{ showSuccess, hideSuccess }}>
      {children}

      {modalState && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
          onClick={hideSuccess}
          role="presentation"
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-card border border-border/80 shadow-2xl p-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-250 ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={hideSuccess}
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>

            {/* Glowing Icon Circle */}
            <div className="relative mb-4 mt-2">
              <div
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center shadow-lg animate-bounce duration-700',
                  isWarning
                    ? 'bg-gradient-to-tr from-amber-600 to-amber-400 text-white shadow-amber-500/30'
                    : isInfo
                    ? 'bg-gradient-to-tr from-blue-600 to-cyan-400 text-white shadow-cyan-500/30'
                    : 'bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-emerald-500/30'
                )}
              >
                {isWarning ? (
                  <AlertTriangle className="size-8 stroke-[2.5]" />
                ) : isInfo ? (
                  <Info className="size-8 stroke-[2.5]" />
                ) : (
                  <CheckCircle2 className="size-9 stroke-[2.5]" />
                )}
              </div>
              <div
                className={cn(
                  'absolute -inset-1 rounded-full blur-md opacity-40 -z-10',
                  isWarning ? 'bg-amber-500' : isInfo ? 'bg-cyan-500' : 'bg-emerald-500'
                )}
              />
            </div>

            {/* Action Badge */}
            <Badge
              variant="outline"
              className={cn(
                'mb-2.5 px-3 py-0.5 text-[11px] font-bold tracking-wider uppercase',
                isWarning
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : isInfo
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              )}
            >
              {modalState.badge || (isWarning ? 'ATTENTION' : isInfo ? 'INFORMATION' : 'COMPLETED')}
            </Badge>

            {/* Title & Message */}
            <h3 className="text-xl font-bold text-foreground mb-1.5 leading-snug">
              {modalState.title}
            </h3>
            {modalState.message && (
              <p className="text-xs sm:text-sm text-muted-foreground mb-4 max-w-sm">
                {modalState.message}
              </p>
            )}

            {/* Details Box */}
            {(modalState.referenceNumber || (modalState.details && modalState.details.length > 0)) && (
              <div className="w-full rounded-xl bg-secondary/50 border border-border/70 p-3.5 mb-5 text-left text-xs space-y-2">
                {modalState.referenceNumber && (
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground font-medium">Reference #</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-primary">
                      <span>{modalState.referenceNumber}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyRef(modalState.referenceNumber!)}
                        className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy reference number"
                      >
                        {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                )}

                {modalState.details?.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center justify-between',
                      idx !== modalState.details!.length - 1 && 'border-b border-border/40 pb-1.5'
                    )}
                  >
                    <span className="text-muted-foreground font-medium">{item.label}</span>
                    <span className="font-semibold text-foreground text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full flex items-center justify-end gap-2.5 pt-1">
              {modalState.secondaryBtnText && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 text-xs h-9 font-medium"
                  onClick={() => {
                    const cb = modalState.onSecondaryClick;
                    setModalState(null);
                    setCopied(false);
                    if (cb) cb();
                  }}
                >
                  {modalState.secondaryBtnText}
                </Button>
              )}
              <Button
                type="button"
                className={cn(
                  'flex-1 text-xs h-9 font-semibold shadow-xs',
                  isWarning
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : isInfo
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                )}
                onClick={() => {
                  const cb = modalState.onPrimaryClick;
                  setModalState(null);
                  setCopied(false);
                  if (cb) cb();
                }}
              >
                <span>{modalState.primaryBtnText || 'Done / Got it'}</span>
                <ArrowRight size={14} className="ml-1 shrink-0" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </SuccessModalContext.Provider>
  );
}

export function useSuccessModal() {
  const context = useContext(SuccessModalContext);
  if (!context) {
    // Fallback if rendered outside provider: dispatch global custom event
    return {
      showSuccess: (options: SuccessModalOptions) => {
        window.dispatchEvent(new CustomEvent('heliflow:success-modal', { detail: options }));
      },
      hideSuccess: () => {},
    };
  }
  return context;
}
