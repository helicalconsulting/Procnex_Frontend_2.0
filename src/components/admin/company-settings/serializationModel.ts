import type { SequenceSetting } from '../../../services/companySettingsService';

export const SEQUENCE_TYPES = [
  { key: 'SUPPLIER_CODE', label: 'Supplier Code', description: 'Auto-generated code assigned when a new supplier is created.' },
  { key: 'PURCHASE_ORDER', label: 'Purchase Order No.', description: 'Sequential number assigned to each new Purchase Order.' },
  { key: 'RFQ', label: 'RFQ Number', description: 'Sequential number assigned to each new Request for Quotation.' },
  { key: 'INVOICE', label: 'Invoice Number', description: 'Sequential number assigned to each new Purchase Invoice.' },
  { key: 'CONTRACT', label: 'Contract Number', description: 'Sequential number assigned to each new Contract.' },
  { key: 'PAYMENT_VOUCHER', label: 'Payment Voucher No.', description: 'Sequential number assigned to each new Payment Voucher.' },
];
export function resolveSequenceTokens(value: string, now = new Date()) {
  return value.replace(/\{YYYY\}/g, String(now.getFullYear())).replace(/\{YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, '0')).replace(/\{DD\}/g, String(now.getDate()).padStart(2, '0'));
}
export function sequencePreview(value: Partial<SequenceSetting>, now = new Date()) {
  if (!Number.isSafeInteger(value.nextNumber) || Number(value.nextNumber) < 1) return 'Enter a valid counter';
  const suffix = resolveSequenceTokens(value.suffix || '', now);
  return `${resolveSequenceTokens(value.prefix || '', now)}${String(value.nextNumber ?? 1).padStart(value.paddingLength ?? 4, '0')}${suffix ? '-' + suffix : ''}`;
}
export function sequenceChanges(saved: SequenceSetting | undefined, draft: Partial<SequenceSetting>) {
  if (!saved) return false;
  return (['prefix', 'suffix', 'nextNumber', 'paddingLength', 'resetFrequency', 'periodStartDate', 'periodEndDate'] as const).some(key => (saved[key] ?? '') !== (draft[key] ?? ''));
}
export function sequenceErrors(draft: Partial<SequenceSetting>) {
  const errors: string[] = [];
  if (!Number.isSafeInteger(draft.nextNumber) || Number(draft.nextNumber) < 1) errors.push('Next counter must be a positive whole number.');
  if (!Number.isInteger(draft.paddingLength) || Number(draft.paddingLength) < 1 || Number(draft.paddingLength) > 12) errors.push('Digit padding must be between 1 and 12.');
  if (['YEARLY', 'FISCAL_YEAR', 'CUSTOM_PERIOD'].includes(draft.resetFrequency || '')) {
    const start = draft.periodStartDate, end = draft.periodEndDate;
    if (Boolean(start) !== Boolean(end)) errors.push('Set both opening and closing dates, or leave both empty for calendar-year reset.');
    else if (start && end && (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || start >= end)) errors.push('Closing date must be after opening date.');
  }
  return errors;
}
export function resetFrequencyLabel(value: string) {
  return ({ NEVER: 'Never reset', MONTHLY: 'Monthly', YEARLY: 'Yearly / financial year', FISCAL_YEAR: 'Financial year', CUSTOM_PERIOD: 'Custom period' } as Record<string, string>)[value] || value;
}
