import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Check, WandSparkles, FileText } from 'lucide-react';
import { vendorPortalService, type PaymentPlan } from '../../services/vendorPortalService';
import { acceptPercentageInput, allocatePercentages, percentageUnits } from './paymentPlanAllocation';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import './vendor-rfq-workspace.css';

interface MilestoneRow { id: string; title: string; percentage: string; manual: boolean }
interface CustomPaymentPlanModalProps {
  onClose: () => void;
  onSaved: (plan: PaymentPlan) => void;
  editPlan?: PaymentPlan | null;
  embedded?: boolean;
  onSavingChange?: (saving: boolean) => void;
  onSavePlan?: (name: string, milestones: Array<{ title: string; percentage: number }>, editPlanId?: string) => Promise<PaymentPlan>;
}
const emptyRow = (): MilestoneRow => ({ id: crypto.randomUUID(), title: '', percentage: '', manual: false });

export default function CustomPaymentPlanModal({ onClose, onSaved, editPlan, embedded = false, onSavingChange, onSavePlan }: CustomPaymentPlanModalProps) {
  const [planName, setPlanName] = useState(editPlan?.name || '');
  const [milestones, setMilestones] = useState<MilestoneRow[]>(() => editPlan?.milestones.length
    ? editPlan.milestones.map(m => ({ id: m.id, title: m.title, percentage: String(m.percentage), manual: true }))
    : [emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(panelRef, !embedded, () => { if (!saving) onClose(); });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    return () => { if (embedded && previous?.isConnected) previous.focus(); };
  }, [embedded]);
  const totalUnits = milestones.reduce((sum, m) => sum + (percentageUnits(m.percentage) ?? 0), 0);
  const validPercentages = milestones.every(m => percentageUnits(m.percentage) !== null);
  const titles = milestones.map(m => m.title.trim().toLowerCase());
  const validation = !planName.trim() ? 'Enter a plan name.'
    : !milestones.length ? 'Add at least one payment milestone.'
    : titles.some(t => !t) ? 'Name each payment milestone.'
    : new Set(titles).size !== titles.length ? 'Use a unique name for each milestone.'
    : !validPercentages ? 'Each allocation must be greater than 0% and no more than 100%, with up to two decimal places.'
    : totalUnits !== 10000 ? 'Allocations must total exactly 100%.' : null;
  const allocated = allocatePercentages(milestones.map(m => m.percentage), milestones.map(m => m.manual));
  const allocationChanges = allocated?.some((value, i) => value !== milestones[i].percentage) ?? false;
  const hasFlexibleAllocation = milestones.some(m => !m.manual || m.percentage === '');
  const allocationHint = !hasFlexibleAllocation && totalUnits !== 10000
    ? 'All percentages were entered manually. Clear a percentage to let Auto Allocate fill the balance.'
    : hasFlexibleAllocation && !allocated
      ? 'Reduce an entered percentage to leave at least 0.01% for each unallocated milestone.'
      : null;
  const update = (id: string, field: 'title' | 'percentage', value: string) => {
    if (field === 'percentage' && !acceptPercentageInput(value)) {
      setError('Enter a percentage greater than 0 and no more than 100, with up to two decimal places.');
      return;
    }
    setError(null);
    setMilestones(rows => rows.map(row => row.id === id ? { ...row, [field]: value, manual: field === 'percentage' ? value !== '' : row.manual } : row));
  };
  const save = async () => {
    if (saving) return;
    if (validation) { setError(validation); return; }
    setSaving(true); onSavingChange?.(true); setError(null);
    try {
      const data = milestones.map(m => ({ title: m.title.trim(), percentage: percentageUnits(m.percentage)! / 100 }));
      const plan = onSavePlan
        ? await onSavePlan(planName.trim(), data, editPlan?.id)
        : editPlan
          ? await vendorPortalService.updatePaymentPlan(editPlan.id, { name: planName.trim(), milestones: data })
          : await vendorPortalService.createPaymentPlan(planName.trim(), data);
      onSaved(plan); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save payment plan'); }
    finally { setSaving(false); onSavingChange?.(false); }
  };
  const panel = (
    <div ref={panelRef} className={embedded ? 'rfq-plan-editor' : 'vquot-modal vquot-modal--open rfq-plan-editor rfq-plan-editor--modal'}
      role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="payment-plan-title" tabIndex={-1}>
      <div className="rfq-section-heading">
        <span className="vquot-modal__header-title" id="payment-plan-title"><FileText size={14} /> {editPlan ? 'Edit Custom Payment Plan' : 'Create Custom Payment Plan'}</span>
        <button type="button" className="rfq-icon-button" aria-label="Close payment plan editor" disabled={saving} onClick={onClose}><X size={16} /></button>
      </div>
      <div className="rfq-plan-editor__body">
        <div className="vquot-modal__field">
          <label className="vquot-modal__label" htmlFor="payment-plan-name">Plan Name *</label>
          <input id="payment-plan-name" ref={nameRef} className="vquot-modal__input" placeholder="e.g. Machine Delivery Plan" value={planName} disabled={saving} onChange={e => setPlanName(e.target.value)} />
        </div>
        <div className="rfq-section-heading">
          <span className="vquot-modal__label">Payment Milestones</span>
          <button type="button" className="rfq-secondary-action" disabled={saving || !allocationChanges} onClick={() => {
            if (allocated) { setMilestones(rows => rows.map((row, i) => ({ ...row, percentage: allocated[i] }))); setError(null); }
          }}><WandSparkles size={14} /> Auto Allocate</button>
        </div>
        <p className="rfq-plan-help text-xs" id="allocation-help">Auto Allocate keeps percentages you enter and shares the remainder between blank or previously auto-filled milestones. Clear a percentage to include it again.</p>
        {allocationHint && <p className="rfq-plan-help text-xs" role="status">{allocationHint}</p>}
        <div className="rfq-milestone-head text-xs"><span>Payment term / milestone</span><span>Allocation</span><span /></div>
        {milestones.map((m, i) => (
          <div key={m.id} className="rfq-milestone-row">
            <input className="vquot-modal__input" aria-label={`Milestone ${i + 1} name`} placeholder={`Milestone ${i + 1}`} value={m.title} disabled={saving} onChange={e => update(m.id, 'title', e.target.value)} />
            <div className="rfq-percentage-input">
              <input className="vquot-modal__input" type="text" inputMode="decimal" aria-label={`Milestone ${i + 1} percentage`} aria-describedby="allocation-help" aria-invalid={m.percentage !== '' && percentageUnits(m.percentage) === null} placeholder="0.00" value={m.percentage} disabled={saving}
                onChange={e => update(m.id, 'percentage', e.target.value)} onBlur={() => {
                  const normalized = m.percentage.endsWith('.') ? m.percentage.slice(0, -1) : m.percentage;
                  if (normalized && percentageUnits(normalized) === null) {
                    update(m.id, 'percentage', '');
                    setError('Each allocation must be greater than 0% and no more than 100%.');
                  } else if (normalized !== m.percentage) {
                    update(m.id, 'percentage', normalized);
                  }
                }} /><span>%</span>
            </div>
            <button type="button" className="rfq-icon-button rfq-icon-button--danger" aria-label={`Remove milestone ${i + 1}`} disabled={saving || milestones.length <= 1} onClick={() => setMilestones(rows => rows.filter(row => row.id !== m.id))}><Trash2 size={14} /></button>
          </div>
        ))}
        <button type="button" className="rfq-secondary-action rfq-add-milestone" disabled={saving} onClick={() => setMilestones(rows => [...rows, emptyRow()])}><Plus size={14} /> Add Payment Milestone</button>
        <div className="rfq-allocation" data-valid={validPercentages && totalUnits === 10000}>
          <div className="rfq-section-heading"><span className="vquot-modal__label">Total Allocation</span><strong>{(totalUnits / 100).toFixed(2)}%</strong></div>
          <progress aria-label="Total payment allocation" max={10000} value={Math.min(totalUnits, 10000)} />
          <div className="text-xs" aria-live="polite">{validPercentages && totalUnits === 10000 ? <><Check size={14} /> Fully allocated</> : totalUnits > 10000 ? `${((totalUnits - 10000) / 100).toFixed(2)}% over allocated` : `${((10000 - totalUnits) / 100).toFixed(2)}% remaining`}</div>
        </div>
        <p className="text-xs rfq-plan-help" aria-live="polite">{validation || 'Your payment plan is ready to save.'}</p>
        {error && <p role="alert" className="rfq-error text-sm">{error}</p>}
      </div>
      <div className="rfq-plan-editor__footer">
        <button type="button" className="vendor-btn vendor-btn--secondary" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="button" className="vendor-btn vendor-btn--primary" disabled={!!validation || saving} onClick={save}>{saving ? 'Saving…' : editPlan ? 'Update Payment Plan' : 'Save Payment Plan'}</button>
      </div>
    </div>
  );
  return embedded ? panel : createPortal(<div className="vquot-modal-backdrop rfq-plan-backdrop" onClick={() => { if (!saving) onClose(); }}><div onClick={e => e.stopPropagation()}>{panel}</div></div>, document.body);
}
