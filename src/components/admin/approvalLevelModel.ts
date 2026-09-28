import type { ApprovalLevel } from '../../types';

export type ApprovalSystem = 'rfq' | 'heliflow';
export type MoveDirection = 'left' | 'right';
export type ApprovalLevelData = Required<Pick<ApprovalLevel, 'id' | 'module' | 'levelNumber' | 'requiredRole' | 'timeLimitHours' | 'minValue' | 'maxValue' | 'currency'>>;

export const APPROVAL_MODULES: { key: string; label: string; system: ApprovalSystem; aliases?: string[] }[] = [
  { key: 'RFQ', label: 'RFQ', system: 'rfq', aliases: ['RFQs', 'RFQ Approval', 'RFQ_APPROVAL', 'Request for Quotation'] },
  { key: 'Quotations', label: 'Quotation Approval', system: 'rfq', aliases: ['Quotation', 'Quotation Approval'] },
  { key: 'PurchaseOrders', label: 'Purchase Orders', system: 'heliflow', aliases: ['Purchase Orders', 'PurchaseOrder', 'PO Approval'] },
  { key: 'AccountsPayable', label: 'Purchase Invoice Approval', system: 'heliflow', aliases: ['Accounts Payable', 'Purchase Invoice Approval'] },
  { key: 'Payments', label: 'Payment Voucher Approval', system: 'heliflow', aliases: ['Payment', 'Payment Voucher Approval'] },
  { key: 'SalesOrders', label: 'Sales Orders', system: 'heliflow', aliases: ['Sales Orders', 'SalesOrder'] },
  { key: 'Approvals', label: 'Approvals', system: 'heliflow' },
  { key: 'CustomForms', label: 'Custom Forms', system: 'heliflow', aliases: ['CustomForm', 'Custom Form', 'CustomForms Approval'] },
];
export const APPROVAL_SYSTEM_LABELS = { rfq: 'P2P Engine', heliflow: 'Workflow Engine' };

export function normalizeApprovalModule(module: string) {
  const key = module.trim().toLowerCase();
  return APPROVAL_MODULES.find(m => [m.key, m.label, ...(m.aliases ?? [])].some(name => name.toLowerCase() === key))?.key ?? module;
}
export function mapApprovalLevel(level: ApprovalLevel): ApprovalLevelData {
  return { ...level, module: normalizeApprovalModule(level.module), timeLimitHours: level.timeLimitHours ?? 24,
    minValue: level.minValue ?? null, maxValue: level.maxValue ?? null, currency: level.currency ?? '' };
}
export function approvalModulesForSystem(system: ApprovalSystem, levels: ApprovalLevelData[]) {
  // Existing custom workflow modules must remain visible, even if not in the catalog.
  const extra = [...new Set(levels.map(level => level.module))].filter(key => !APPROVAL_MODULES.some(m => m.key === key))
    .map(key => ({ key, label: key, system: 'heliflow' as const }));
  return [...APPROVAL_MODULES, ...extra].filter(module => module.system === system);
}
export function approvalChain(levels: ApprovalLevelData[], module: string) {
  return levels.filter(level => level.module === module).sort((a, b) => a.levelNumber - b.levelNumber);
}
export function nextApprovalLevel(levels: ApprovalLevelData[], module: string) {
  return Math.max(0, ...approvalChain(levels, module).map(level => level.levelNumber)) + 1;
}
export function reorderApprovalLevels(levels: ApprovalLevelData[], id: string, direction: MoveDirection) {
  const target = levels.find(level => level.id === id);
  if (!target) return levels;
  const chain = approvalChain(levels, target.module);
  const index = chain.findIndex(level => level.id === id);
  const neighbor = chain[index + (direction === 'left' ? -1 : 1)];
  if (!neighbor) return levels;
  return levels.map(level => level.id === id ? { ...level, levelNumber: neighbor.levelNumber }
    : level.id === neighbor.id ? { ...level, levelNumber: target.levelNumber } : level);
}

/** Apply an immediate cache update; roll back on rejection without unmounting the chain. */
export async function persistApprovalMove(levels: ApprovalLevelData[], id: string, direction: MoveDirection, actions: {
  cancelRefresh: () => Promise<void>;
  setLevels: (levels: ApprovalLevelData[]) => void;
  persist: (id: string, direction: 'up' | 'down') => Promise<void>;
}) {
  const next = reorderApprovalLevels(levels, id, direction);
  if (next === levels) return false;
  await actions.cancelRefresh();
  actions.setLevels(next);
  try { await actions.persist(id, direction === 'left' ? 'up' : 'down'); }
  catch (error) { actions.setLevels(levels); throw error; }
  return true;
}

export function approvalFormErrors(form: { module: string; role: string; hours: string; min: string; max: string; currency: string }) {
  const errors: Partial<Record<'module' | 'role' | 'hours' | 'min' | 'max' | 'currency', string>> = {};
  if (!form.module) errors.module = 'Select a module.';
  if (!form.role.trim()) errors.role = 'Select a required role.';
  if (!form.hours.trim() || !Number.isInteger(Number(form.hours)) || Number(form.hours) < 1 || Number(form.hours) > 168) errors.hours = 'Enter a whole number from 1 to 168 hours.';
  if (!form.currency) errors.currency = 'Select a currency.';
  for (const key of ['min', 'max'] as const) {
    if (form[key] !== '' && (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) errors[key] = 'Enter zero or a positive amount.';
  }
  if (!errors.min && !errors.max && form.max !== '' && Number(form.max) < Number(form.min || 0)) errors.max = 'Maximum must be equal to or greater than minimum.';
  return errors;
}
export function formatApprovalTime(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d${hours % 24 ? ` ${hours % 24}h` : ''}`;
}
