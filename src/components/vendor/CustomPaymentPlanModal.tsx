import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Check, AlertTriangle, FileText } from 'lucide-react';
import { vendorPortalService, type PaymentPlan } from '../../services/vendorPortalService';

// ─── Types ──────────────────────────────────────────────────

interface MilestoneRow {
  id: string;
  title: string;
  percentage: string; // string for controlled input
}

interface CustomPaymentPlanModalProps {
  onClose: () => void;
  onSaved: (plan: PaymentPlan) => void;
  /** If provided, the modal opens in edit mode with this plan's data pre-filled */
  editPlan?: PaymentPlan | null;
}

// ─── Helpers ────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function createEmptyRow(): MilestoneRow {
  return { id: generateId(), title: '', percentage: '' };
}

// ─── Component ──────────────────────────────────────────────


export default function CustomPaymentPlanModal({ onClose, onSaved, editPlan }: CustomPaymentPlanModalProps) {
  const isEditing = !!editPlan;
  const [planName, setPlanName] = useState(editPlan?.name || '');
  const [milestones, setMilestones] = useState<MilestoneRow[]>(
    editPlan && editPlan.milestones.length > 0
      ? editPlan.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          percentage: String(m.percentage),
        }))
      : [createEmptyRow()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus plan name input on mount
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const totalAllocation = milestones.reduce((sum, m) => {
    const val = parseFloat(m.percentage);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const isTotalValid = Math.abs(totalAllocation - 100) < 0.01;
  const remaining = 100 - totalAllocation;

  // ── Validation ──
  const validationErrors = useCallback((): string | null => {
    if (!planName.trim()) return 'Plan name is required';
    if (milestones.length < 1) return 'At least 1 payment milestone is required';
    if (milestones.some((m) => !m.title.trim())) return 'All milestone titles must be filled';
    const titles = milestones.map((m) => m.title.trim().toLowerCase());
    if (new Set(titles).size !== titles.length) return 'Duplicate milestone names are not allowed';
    if (milestones.some((m) => {
      const val = parseFloat(m.percentage);
      return isNaN(val) || val <= 0 || val > 100;
    })) return 'Each percentage must be greater than 0 and not exceed 100';
    if (!isTotalValid) return `Total allocation must equal exactly 100% (currently ${totalAllocation.toFixed(1)}%)`;
    return null;
  }, [planName, milestones, isTotalValid, totalAllocation]);

  const canSave = !validationErrors();

  // ── Add/Remove rows ──
  const addMilestone = useCallback(() => {
    setMilestones((prev) => [...prev, createEmptyRow()]);
  }, []);

  const removeMilestone = useCallback((id: string) => {
    setMilestones((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const updateMilestone = useCallback((id: string, field: 'title' | 'percentage', value: string) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  }, []);

  // ── Save ──
  const handleSave = useCallback(async () => {
    const err = validationErrors();
    if (err) { setError(err); return; }

    setSaving(true);
    setError(null);
    try {
      const milestoneData = milestones.map((m) => ({
        title: m.title.trim(),
        percentage: parseFloat(m.percentage),
      }));

      if (isEditing && editPlan) {
        // Update existing plan
        const plan = await vendorPortalService.updatePaymentPlan(editPlan.id, {
          name: planName.trim(),
          milestones: milestoneData,
        });
        onSaved(plan);
      } else {
        // Create new plan
        const plan = await vendorPortalService.createPaymentPlan(
          planName.trim(),
          milestoneData,
        );
        onSaved(plan);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save payment plan');
    } finally {
      setSaving(false);
    }
  }, [planName, milestones, validationErrors, onSaved, onClose, isEditing, editPlan]);

  return createPortal(
    <div className="vquot-modal-backdrop custom-plan-modal-backdrop" onClick={onClose} style={{ zIndex: 999998 }}>
      <div
        className="vquot-modal vquot-modal--open custom-plan-modal"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 520,
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 999999,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="vquot-modal__header" style={{ cursor: 'default' }}>
          <div className="vquot-modal__header-left">
            <span className="vquot-modal__header-icon"><FileText size={14} /></span>
            <span className="vquot-modal__header-title">{isEditing ? 'Edit Custom Payment Plan' : 'Create Custom Payment Plan'}</span>
          </div>
          <div className="vquot-modal__window-controls">
            <button type="button" className="vquot-modal__wc-btn vquot-modal__wc-btn--close" title="Close" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="vquot-modal__body" style={{ overflowY: 'auto', flex: 1, paddingBottom: 0 }}>
          {/* Plan Name */}
          <div className="vquot-modal__field" style={{ marginBottom: 16 }}>
            <label className="vquot-modal__label">Plan Name *</label>
            <input
              ref={nameInputRef}
              className="vquot-modal__input"
              type="text"
              placeholder="e.g. Machine Delivery Plan"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
            />
          </div>

          {/* Milestone Table Header */}
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Payment Milestones
          </div>

          {/* Column Headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 32px', gap: 8,
            padding: '4px 0', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            <span>Payment Term / Milestone</span>
            <span style={{ textAlign: 'right' }}>Value</span>
            <span />
          </div>

          {/* Milestone Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {milestones.map((m, idx) => (
              <div key={m.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 32px', gap: 8,
                alignItems: 'center',
              }}>
                <input
                  className="vquot-modal__input"
                  type="text"
                  placeholder={`Milestone ${idx + 1}`}
                  value={m.title}
                  onChange={(e) => updateMilestone(m.id, 'title', e.target.value)}
                  style={{ padding: '8px 10px', fontSize: 14 }}
                />
                <div style={{ position: 'relative' }}>
                  <input
                    className="vquot-modal__input"
                    type="number"
                    placeholder="0"
                    min={0}
                    max={100}
                    value={m.percentage}
                    onChange={(e) => updateMilestone(m.id, 'percentage', e.target.value)}
                    style={{ padding: '8px 10px', fontSize: 14, textAlign: 'right', paddingRight: 28 }}
                  />
                  <span style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none',
                  }}>%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeMilestone(m.id)}
                  disabled={milestones.length <= 1}
                  title="Remove milestone"
                  style={{
                    background: 'none', border: 'none', cursor: milestones.length <= 1 ? 'not-allowed' : 'pointer',
                    color: 'var(--danger-500, #bb0000)', padding: 4, opacity: milestones.length <= 1 ? 0.3 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add Row Button */}
          <button
            type="button"
            onClick={addMilestone}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', marginTop: 8, marginBottom: 16,
              background: 'var(--surface-hover, #f0f4f8)', border: '1px dashed var(--border, #d0d5dd)',
              borderRadius: 6, color: 'var(--text-secondary, #6a6d70)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <Plus size={14} /> Add Payment Milestone
          </button>

          {/* ── Live Total Allocation ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 6,
            background: isTotalValid ? 'rgba(16,126,62,0.08)' : totalAllocation > 100 ? 'rgba(187,0,0,0.08)' : 'rgba(233,115,12,0.08)',
            border: `1px solid ${
              isTotalValid ? 'rgba(16,126,62,0.2)' : totalAllocation > 100 ? 'rgba(187,0,0,0.2)' : 'rgba(233,115,12,0.2)'
            }`,
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Total Allocation</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isTotalValid ? (
                <span style={{ color: '#107e3e' }}><Check size={16} /></span>
              ) : totalAllocation > 0 ? (
                <span style={{ color: totalAllocation > 100 ? '#bb0000' : '#e9730c' }}>
                  <AlertTriangle size={16} />
                </span>
              ) : null}
              <span style={{
                fontSize: 16, fontWeight: 800,
                color: isTotalValid ? '#107e3e' : totalAllocation > 100 ? '#bb0000' : '#e9730c',
              }}>
                {totalAllocation.toFixed(1)}%
              </span>
              {!isTotalValid && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {totalAllocation > 100 ? `(exceeded by ${(totalAllocation - 100).toFixed(1)}%)` : `(remaining ${remaining.toFixed(1)}%)`}
                </span>
              )}
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, marginBottom: 12,
              background: 'rgba(187,0,0,0.08)', border: '1px solid rgba(187,0,0,0.2)',
              color: '#bb0000', fontSize: 14,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="vquot-modal__footer" style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="vendor-btn vendor-btn--secondary" onClick={onClose}>Cancel</button>
          <button
            className="vendor-btn vendor-btn--primary"
            disabled={!canSave || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : isEditing ? 'Update Payment Plan' : 'Save Payment Plan'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
