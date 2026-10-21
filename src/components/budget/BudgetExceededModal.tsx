// ============================================================
// components/budget/BudgetExceededModal.tsx
// Interactive Popup Modal when PR/PO exceeds budget allocation
// ============================================================
import React, { useState } from 'react';
import { AlertOctagon, Send, ArrowRightLeft, Edit3, X, CheckCircle2 } from 'lucide-react';
import type { SpendValidationResponse } from '../../api/budgetApi';
import { Button } from '../ui/button';

interface BudgetExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  validationData: SpendValidationResponse | null;
  onSubmitExceptionRequest?: (justification: string) => Promise<void>;
  onRequestVirement?: (lineId: string) => void;
}

export const BudgetExceededModal: React.FC<BudgetExceededModalProps> = ({
  isOpen,
  onClose,
  validationData,
  onSubmitExceptionRequest,
  onRequestVirement,
}) => {
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !validationData) return null;

  const {
    lineCode,
    lineName,
    budgetName,
    budgetCurrency,
    requestedAmountOriginal,
    requestedCurrency,
    convertedAmount,
    availableAmount,
    deficit,
    exchangeRate,
    budgetLineId,
  } = validationData;

  const isFxDifferent = requestedCurrency !== budgetCurrency;

  const handleSubmitException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim() || justification.trim().length < 10) {
      setError('Please provide a meaningful business justification (at least 10 characters).');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (onSubmitExceptionRequest) {
        await onSubmitExceptionRequest(justification);
      }
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit exception approval request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-card rounded-2xl shadow-2xl border border-destructive/30 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-destructive/10 border-b border-destructive/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-destructive text-destructive-foreground shadow-sm">
              <AlertOctagon className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Budget Limit Exceeded
              </h3>
              <p className="text-xs text-muted-foreground">
                Approval or fund re-allocation required to proceed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Target Line Info */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Budget:</span>
              <span className="font-semibold text-foreground">{budgetName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Budget Line:</span>
              <span className="font-semibold text-foreground">
                {lineCode} — {lineName}
              </span>
            </div>
          </div>

          {/* Numerical Comparison Grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-muted/40 border border-border/70">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Available
              </div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {availableAmount.toLocaleString()} {budgetCurrency}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border/70">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Requested
              </div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {convertedAmount.toLocaleString()} {budgetCurrency}
              </div>
              {isFxDifferent && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  ({requestedAmountOriginal.toLocaleString()} {requestedCurrency} @ {exchangeRate})
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
              <div className="text-[11px] font-semibold text-destructive uppercase tracking-wider">
                Deficit
              </div>
              <div className="mt-1 text-sm font-bold text-destructive">
                +{deficit.toLocaleString()} {budgetCurrency}
              </div>
            </div>
          </div>

          {submitted ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="size-4.5" />
              Over-budget exception approval request submitted!
            </div>
          ) : (
            <>
              {/* Option 1: Request Over-Budget Approval Workflow */}
              <form onSubmit={handleSubmitException} className="space-y-3 pt-1 border-t border-border/60">
                <label className="block text-xs font-semibold text-foreground">
                  Option 1: Request Over-Budget Exception Approval (Level 1 &rarr; Level 2 &rarr; Level 3)
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explain why this spend is required and why it exceeds allocated budget..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={submitting}
                  variant="destructive"
                  className="w-full gap-2 font-semibold"
                >
                  <Send className="size-3.5" />
                  {submitting ? 'Submitting...' : 'Submit Over-Budget Approval Request'}
                </Button>
              </form>

              {/* Alternative Options */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60 text-xs">
                {/* Option 2: Request Virement */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (onRequestVirement && budgetLineId) {
                      onRequestVirement(budgetLineId);
                    }
                    onClose();
                  }}
                  className="gap-1.5 h-10"
                >
                  <ArrowRightLeft className="size-3.5" />
                  <span>Request Virement</span>
                </Button>

                {/* Option 3: Adjust Quantities */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="gap-1.5 h-10"
                >
                  <Edit3 className="size-3.5" />
                  <span>Adjust Quantities</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
