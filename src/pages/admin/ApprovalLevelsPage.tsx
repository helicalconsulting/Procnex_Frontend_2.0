import { useMemo, useRef, useState } from 'react';
import { Layers, Plus, X, Shield, FileText, ShoppingCart, ClipboardList, CheckSquare, Wallet, CreditCard, Info, Zap, GitBranch } from 'lucide-react';
import { useServiceData } from '../../hooks/useServiceData';
import { adminService, type AdminRoleRecord } from '../../services/adminService';
import { companySettingsService, type Position } from '../../services/companySettingsService';
import { useAuth } from '../../context/AuthContext';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { CardSkeleton } from '../../components/shared/Skeleton';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { Button } from '../../components/ui/button';
import { Input, Select } from '../../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { DetailTabs, DetailTabPanel } from '../../components/ui/detail-tabs';
import ApprovalChain from '../../components/admin/ApprovalChain';
import { APPROVAL_SYSTEM_LABELS, approvalChain, approvalFormErrors, approvalModulesForSystem, mapApprovalLevel, nextApprovalLevel, persistApprovalMove, type ApprovalLevelData, type ApprovalSystem, type MoveDirection } from '../../components/admin/approvalLevelModel';
import './approval-level-workspace.css';

const MODULE_ICONS = { RFQ: FileText, Quotations: ClipboardList, PurchaseOrders: ShoppingCart, AccountsPayable: Wallet, Payments: CreditCard, CustomForms: ClipboardList };
const TIME_PRESETS = [2, 4, 8, 12, 24, 48, 72];

export default function ApprovalLevelsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('Approval Levels', 'canCreate');
  const { companyDefaultCurrency, currencies } = useCurrency();
  const { data: levels, loading, error, reload, setData, cancelRefresh } = useServiceData(
    () => adminService.listApprovalLevels().then(list => list.map(mapApprovalLevel)),
    [] as ApprovalLevelData[], [], { cacheKey: 'approvalLevels:list' });
  const { data: positions } = useServiceData(() => companySettingsService.listPositions(), [] as Position[], [], { cacheKey: 'approvalLevels:positions' });
  const { data: roles } = useServiceData(() => adminService.listRoles(), [] as AdminRoleRecord[], [], { cacheKey: 'approvalLevels:dbRoles' });
  const roleOptions = useMemo(() => [...new Set(['Super Admin', ...roles.map(role => role.roleName), ...positions.filter(position => position.isActive).map(position => position.name)].filter(Boolean))].sort(), [positions, roles]);

  const [system, setSystem] = useState<ApprovalSystem>('heliflow');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [activeMetric, setActiveMetric] = useState('Total Levels');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestPending = useRef(false);
  const busy = saving || Boolean(pendingId);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ApprovalLevelData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalLevelData | null>(null);
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [form, setForm] = useState({ module: '', role: '', hours: '24', min: '', max: '', currency: companyDefaultCurrency });
  const returnFocus = useRef<HTMLElement | null>(null);
  const moduleInput = useRef<HTMLSelectElement>(null);
  const roleInput = useRef<HTMLSelectElement>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);

  const modules = approvalModulesForSystem(system, levels);
  const scopedLevels = levels.filter(level => modules.some(module => module.key === level.module));
  const visibleModules = moduleFilter === 'ALL' ? modules : modules.filter(module => module.key === moduleFilter);
  const configuredModules = new Set(scopedLevels.map(level => level.module)).size;
  const errors = approvalFormErrors(form);
  const nextLevel = editing?.levelNumber ?? nextApprovalLevel(levels, form.module);
  const moduleLabel = (key: string) => modules.find(module => module.key === key)?.label ?? key;
  const formChanged = !editing || form.role !== editing.requiredRole || Number(form.hours) !== editing.timeLimitHours
    || (form.min === '' ? null : Number(form.min)) !== editing.minValue
    || (form.max === '' ? null : Number(form.max)) !== editing.maxValue
    || form.currency !== (editing.currency || companyDefaultCurrency);

  function rememberFocus() { returnFocus.current = document.activeElement as HTMLElement; }
  function restoreFocus(event: Event) {
    event.preventDefault();
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
    else addTrigger.current?.focus();
  }
  function openAdd(module = moduleFilter === 'ALL' ? '' : moduleFilter) {
    if (!canManage || requestPending.current) return;
    rememberFocus(); setEditing(null); setFormError('');
    setForm({ module, role: '', hours: '24', min: '', max: '', currency: companyDefaultCurrency });
    setShowForm(true);
  }
  function openEdit(level: ApprovalLevelData) {
    if (!canManage || requestPending.current) return;
    rememberFocus(); setEditing(level); setFormError('');
    setForm({ module: level.module, role: level.requiredRole, hours: String(level.timeLimitHours), min: level.minValue === null ? '' : String(level.minValue), max: level.maxValue === null ? '' : String(level.maxValue), currency: level.currency || companyDefaultCurrency });
    setShowForm(true);
  }
  async function saveLevel() {
    if (!canManage || requestPending.current || Object.keys(errors).length || !formChanged || !modules.some(module => module.key === form.module)) return;
    requestPending.current = true; setSaving(true); setFormError('');
    try {
      const payload = { requiredRole: form.role, timeLimitHours: Number(form.hours), minValue: form.min === '' ? null : Number(form.min), maxValue: form.max === '' ? null : Number(form.max), currency: form.currency };
      const saved = mapApprovalLevel(editing
        ? await adminService.updateApprovalLevel(editing.id, payload)
        : await adminService.createApprovalLevel({ module: form.module, ...payload }));
      await cancelRefresh();
      setData(previous => editing ? previous.map(level => level.id === editing.id ? saved : level) : [...previous, saved]);
      setShowForm(false); setMessage({ type: 'success', text: `${moduleLabel(saved.module)} level ${saved.levelNumber} ${editing ? 'updated' : 'added'}.` });
      reload();
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not save this level. Your changes are retained.'); }
    finally { requestPending.current = false; setSaving(false); }
  }
  async function moveLevel(level: ApprovalLevelData, direction: MoveDirection) {
    if (!canManage || requestPending.current) return;
    requestPending.current = true; setPendingId(level.id); setMessage(null);
    setAnnouncement(`Saving ${moduleLabel(level.module)} approval order…`);
    try {
      const moved = await persistApprovalMove(levels, level.id, direction, { cancelRefresh, setLevels: setData, persist: adminService.reorderApprovalLevel });
      setAnnouncement(moved ? `${level.requiredRole} moved ${direction}. Approval order saved.` : 'This level is already at the end of the chain.');
      if (moved) reload();
    } catch (failure) {
      setAnnouncement('The previous order has been restored.');
      setMessage({ type: 'error', text: failure instanceof Error ? failure.message : 'Could not save the new approval order. Please try again.' });
    } finally { requestPending.current = false; setPendingId(null); }
  }
  async function removeLevel() {
    if (!canManage || !deleteTarget || requestPending.current) return;
    requestPending.current = true; setSaving(true); setDeleteError('');
    try {
      await adminService.deleteApprovalLevel(deleteTarget.id);
      await cancelRefresh();
      setData(previous => {
        const remaining = previous.filter(level => level.id !== deleteTarget.id);
        const chain = approvalChain(remaining, deleteTarget.module);
        return remaining.map(level => level.module === deleteTarget.module ? { ...level, levelNumber: chain.findIndex(row => row.id === level.id) + 1 } : level);
      });
      setDeleteTarget(null); setMessage({ type: 'success', text: 'Approval level removed. Remaining levels have been renumbered.' }); reload();
    } catch (failure) { setDeleteError(failure instanceof Error ? failure.message : 'Could not remove this level.'); }
    finally { requestPending.current = false; setSaving(false); }
  }

  return <div className="approval-workspace flex w-full flex-col gap-6 pb-10">
    <div className="flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Approval Levels</h1><p className="mt-1 text-sm text-muted-foreground">Configure multi-level approval chains for each module</p></div>
      <Button ref={addTrigger} onClick={() => openAdd()} disabled={!canManage || busy}><Plus size={16} />Add Level</Button>
    </div>
    {error && <MessageStrip type="error">{error}</MessageStrip>}
    {message && <MessageStrip type={message.type} onClose={() => setMessage(null)}>{message.text}</MessageStrip>}
    <div className="approval-engine-tabs">
      <DetailTabs id="approval-engine" label="Approval engine" activeTab={system} onChange={id => { setSystem(id as ApprovalSystem); setModuleFilter('ALL'); }}
        tabs={[
          { id: 'rfq', label: 'P2P Engine', icon: ShoppingCart, count: levels.filter(level => approvalModulesForSystem('rfq', levels).some(module => module.key === level.module)).length },
          { id: 'heliflow', label: 'Workflow Engine', icon: Zap, count: levels.filter(level => approvalModulesForSystem('heliflow', levels).some(module => module.key === level.module)).length },
        ]} />
    </div>
    <DetailTabPanel id="approval-engine" tabId={system} className="approval-engine-panel">
      <div className="approval-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Layers, value: scopedLevels.length, label: 'Total Levels', tone: 'primary' },
          { icon: CheckSquare, value: configuredModules, label: 'Modules', tone: 'success' },
          { icon: GitBranch, value: configuredModules ? (scopedLevels.length / configuredModules).toFixed(1) : '0', label: 'Avg. Depth', tone: 'violet' },
          { icon: Shield, value: Math.max(0, ...modules.map(module => approvalChain(levels, module.key).length)), label: 'Max Chain', tone: 'warning' },
        ].map(({ icon: Icon, value, label, tone }) => <div key={label}
          className={`approval-metric cursor-pointer transition-all duration-200 ${activeMetric === label ? 'approval-metric--active active' : ''}`}
          onClick={() => setActiveMetric(label)}>
          <span className={`approval-metric__icon approval-metric__icon--${tone}`}><Icon size={22} /></span><div><span className="text-2xl font-semibold tracking-tight">{value}</span><span className="text-sm text-muted-foreground">{label}</span></div>
        </div>)}
      </div>
      <div className="approval-filter-row">
        <div className="approval-module-filter"><label htmlFor="approval-module-filter" className="text-xs font-semibold">Module</label><Select id="approval-module-filter" value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}><option value="ALL">All modules ({scopedLevels.length} levels)</option>{modules.map(module => <option key={module.key} value={module.key}>{module.label} ({approvalChain(levels, module.key).length})</option>)}</Select></div>
        <div className="text-xs text-muted-foreground"><p>{APPROVAL_SYSTEM_LABELS[system]} · Approvals run from left to right.</p><p className="approval-save-status" role="status" aria-live="polite">{announcement || (canManage ? 'Use the arrows to change the approval order.' : 'You have read-only access to approval levels.')}</p></div>
      </div>
      {loading ? <CardSkeleton count={3} /> : <div className="approval-chains">
        {visibleModules.map(module => {
          const chain = approvalChain(levels, module.key);
          const Icon = MODULE_ICONS[module.key as keyof typeof MODULE_ICONS] ?? Layers;
          return <section key={module.key} className="approval-module" aria-labelledby={`approval-module-${module.key}`}>
            <header className="approval-module__header"><div><span className="approval-module__icon"><Icon size={18} /></span><div><h2 id={`approval-module-${module.key}`} className="text-base font-semibold">{module.label}</h2><p className="text-xs text-muted-foreground">{chain.length} approval level{chain.length === 1 ? '' : 's'}</p></div></div>
              <Button variant="outline" size="sm" aria-label={`Add level to ${module.label}`} onClick={() => openAdd(module.key)} disabled={!canManage || busy}><Plus size={14} />Add Level</Button>
            </header>
            {chain.length ? <ApprovalChain label={module.label} chain={chain} canManage={canManage} busy={busy} pendingId={pendingId} currency={companyDefaultCurrency}
              onMove={moveLevel} onEdit={openEdit} onDelete={level => { rememberFocus(); setDeleteError(''); setDeleteTarget(level); }} />
              : <div className="approval-module__empty text-xs text-muted-foreground"><Info size={17} /><span>No approval levels configured for this module.</span></div>}
          </section>;
        })}
      </div>}
    </DetailTabPanel>

    <Dialog open={showForm} onOpenChange={open => { if (!saving) setShowForm(open); }}>
      <DialogContent className="approval-workspace approval-level-dialog" hideClose onInteractOutside={event => event.preventDefault()} onOpenAutoFocus={event => { event.preventDefault(); (editing ? roleInput : moduleInput).current?.focus(); }} onCloseAutoFocus={restoreFocus}>
        <header className="approval-level-dialog__header"><div><DialogTitle>{editing ? 'Edit Approval Level' : 'Add Approval Level'}</DialogTitle><DialogDescription className="text-xs">{APPROVAL_SYSTEM_LABELS[system]} · {form.module ? `Level ${nextLevel} · ${moduleLabel(form.module)}` : 'Choose a module and required approver.'}</DialogDescription></div><Button variant="ghost" size="icon-sm" aria-label="Close approval level form" disabled={saving} onClick={() => setShowForm(false)}><X size={18} /></Button></header>
        <form onSubmit={event => event.preventDefault()}>
          <div className="approval-level-dialog__body">
            {formError && <MessageStrip type="error">{formError}</MessageStrip>}
            {editing ? <dl className="approval-form-module text-xs"><div><dt className="text-muted-foreground">Module</dt><dd className="font-semibold">{moduleLabel(form.module)}</dd></div><div><dt className="text-muted-foreground">Sequence</dt><dd className="font-semibold">Level {nextLevel}</dd></div></dl>
              : <div className="form-field"><label htmlFor="approval-module" className="text-xs font-semibold">Module <span aria-hidden="true">*</span></label><Select id="approval-module" ref={moduleInput} required value={form.module} disabled={saving} onChange={event => setForm({ ...form, module: event.target.value })}><option value="">Select module</option>{modules.map(module => <option key={module.key} value={module.key}>{module.label}</option>)}</Select>{form.module && <p className="text-xs text-muted-foreground">Added after the existing approvals as level {nextLevel}.</p>}</div>}
            <div className="form-field"><label htmlFor="approval-role" className="text-xs font-semibold">Required Role <span aria-hidden="true">*</span></label><Select id="approval-role" ref={roleInput} required value={form.role} disabled={saving} onChange={event => setForm({ ...form, role: event.target.value })}><option value="">Select role</option>{editing && !roleOptions.includes(editing.requiredRole) && <option value={editing.requiredRole}>{editing.requiredRole} (current role)</option>}{roleOptions.map(role => <option key={role} value={role}>{role}</option>)}</Select></div>
            <div className="form-field"><label htmlFor="approval-hours" className="text-xs font-semibold">Time Limit (Hours) <span aria-hidden="true">*</span></label><Input id="approval-hours" type="number" required min={1} max={168} step={1} value={form.hours} disabled={saving} aria-invalid={Boolean(errors.hours)} aria-describedby={errors.hours ? 'approval-hours-error' : undefined} onChange={event => setForm({ ...form, hours: event.target.value })} />
              <div className="approval-time-presets" aria-label="Time limit presets">{TIME_PRESETS.map(hours => <button type="button" key={hours} aria-pressed={Number(form.hours) === hours} disabled={saving} onClick={() => setForm({ ...form, hours: String(hours) })} className="text-xs">{hours}h</button>)}</div>
              {errors.hours && <p id="approval-hours-error" className="approval-form-error text-xs">{errors.hours}</p>}
            </div>
            <fieldset className="approval-value-fields"><legend className="text-xs font-semibold">Value Threshold Range <span className="text-muted-foreground font-normal">(optional)</span></legend>
              <div className="form-field"><label htmlFor="approval-currency" className="text-xs">Currency</label><Select id="approval-currency" value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })} disabled={saving}>{!currencies.some(currency => currency.code === form.currency) && <option value={form.currency}>{form.currency || 'Select currency'}</option>}{currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code} · {currency.symbol} — {currency.countryName || currency.name}</option>)}</Select></div>
              <div className="approval-value-grid">{(['min', 'max'] as const).map(key => <div className="form-field" key={key}><label htmlFor={`approval-${key}`} className="text-xs">{key === 'min' ? 'Minimum amount' : 'Maximum amount'}</label><Input id={`approval-${key}`} type="number" min={0} step="any" placeholder={key === 'min' ? 'No minimum' : 'No maximum'} value={form[key]} disabled={saving} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `approval-${key}-error` : undefined} onChange={event => setForm({ ...form, [key]: event.target.value })} />{errors[key] && <p id={`approval-${key}-error`} className="approval-form-error text-xs">{errors[key]}</p>}</div>)}</div>
              <p className="text-xs text-muted-foreground">Leave both amounts empty to apply this level to all values.</p>
            </fieldset>
          </div>
          <footer className="approval-level-dialog__footer"><Button type="button" variant="outline" disabled={saving} onClick={() => setShowForm(false)}>Cancel</Button><Button type="button" onClick={saveLevel} disabled={saving || !canManage || Object.keys(errors).length > 0 || !formChanged}>{saving ? 'Saving…' : editing ? 'Update Level' : 'Add Level'}</Button></footer>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !saving) setDeleteTarget(null); }}>
      <DialogContent className="approval-workspace" hideClose onCloseAutoFocus={restoreFocus}><DialogTitle>Remove Approval Level?</DialogTitle><DialogDescription>Remove level {deleteTarget?.levelNumber} ({deleteTarget?.requiredRole}) from {deleteTarget ? moduleLabel(deleteTarget.module) : ''}? Remaining levels will be renumbered.</DialogDescription>{deleteError && <MessageStrip type="error">{deleteError}</MessageStrip>}<div className="approval-delete-actions"><Button variant="outline" disabled={saving} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={removeLevel}>{saving ? 'Removing…' : 'Remove Level'}</Button></div></DialogContent>
    </Dialog>
  </div>;
}
