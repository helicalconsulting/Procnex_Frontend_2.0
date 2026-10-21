// ============================================================
// components/budget/BudgetVirementModal.tsx
// Section G: Virement (Transfer between lines) & Supplement Modal
// ============================================================
import React, { useState } from 'react';
import { ArrowRightLeft, X, AlertCircle } from 'lucide-react';
import { budgetApi, type BudgetLine } from '../../api/budgetApi';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface BudgetVirementModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetId: string;
  lines: BudgetLine[];
  currency?: string;
  defaultSourceLineId?: string;
  onSuccess: () => void;
}

export const BudgetVirementModal: React.FC<BudgetVirementModalProps> = ({
  isOpen,
  onClose,
  budgetId,
  lines,
  currency = 'KES',
  defaultSourceLineId,
  onSuccess,
}) => {
  const [transferType, setTransferType] = useState<'VIREMENT' | 'SUPPLEMENT'>('VIREMENT');
  const [sourceLineId, setSourceLineId] = useState(defaultSourceLineId || '');
  const [destinationLineId, setDestinationLineId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedSource = lines.find((l) => l.id === sourceLineId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferType === 'VIREMENT' && !sourceLineId) {
      setError('Please select a source line with available funds.');
      return;
    }
    if (!destinationLineId) {
      setError('Please select a destination line.');
      return;
    }
    if (transferType === 'VIREMENT' && sourceLineId === destinationLineId) {
      setError('Source and destination lines cannot be the same.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid transfer amount greater than 0.');
      return;
    }
    if (transferType === 'VIREMENT' && selectedSource && Number(amount) > selectedSource.availableAmount) {
      setError(`Amount exceeds source line available balance (${selectedSource.availableAmount.toLocaleString()} ${currency}).`);
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a business justification for this transfer.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await budgetApi.createTransfer(budgetId, {
        transferType,
        sourceLineId: transferType === 'VIREMENT' ? sourceLineId : null,
        destinationLineId,
        amount: Number(amount),
        currency,
        reason,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit transfer request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <ArrowRightLeft className="size-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Budget Adjustment & Transfer
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Move funds between lines or inject fresh supplementary funds
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Transfer Type Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTransferType('VIREMENT')}
              className={`py-2 rounded-lg transition ${
                transferType === 'VIREMENT'
                  ? 'bg-card text-foreground shadow-xs font-bold border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Virement (Line-to-Line)
            </button>
            <button
              type="button"
              onClick={() => setTransferType('SUPPLEMENT')}
              className={`py-2 rounded-lg transition ${
                transferType === 'SUPPLEMENT'
                  ? 'bg-card text-foreground shadow-xs font-bold border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Supplement (Fresh Funds)
            </button>
          </div>

          {/* Source Line (if VIREMENT) */}
          {transferType === 'VIREMENT' && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Source Line (Deduct From) *
              </label>
              <select
                value={sourceLineId}
                onChange={(e) => setSourceLineId(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select source line with surplus funds...</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.availableAmount <= 0}>
                    {l.lineCode} — {l.lineName} (Avail: {l.availableAmount.toLocaleString()} {currency})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Destination Line */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Destination Line (Credit To) *
            </label>
            <select
              value={destinationLineId}
              onChange={(e) => setDestinationLineId(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select destination line...</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lineCode} — {l.lineName} (Current: {l.availableAmount.toLocaleString()} {currency})
                </option>
              ))}
            </select>
          </div>

          {/* Transfer Amount */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Transfer Amount ({currency}) *
            </label>
            <Input
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 150000"
              className="h-10 text-xs rounded-xl"
            />
          </div>

          {/* Reason / Justification */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Business Justification *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason for moving funds, impact on originating project, and expected utilization..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="font-semibold"
            >
              {submitting ? 'Submitting...' : 'Submit for Workflow Approval'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
