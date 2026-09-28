import { unitAliases } from '../unitAliases';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sequenceChanges, sequenceErrors, sequencePreview, SEQUENCE_TYPES } from '../serializationModel';
import { requiredDocumentChanged, requiredDocumentErrors, requiredDocumentPayload } from '../requiredDocumentModel';
import { SerializationWorkspace } from '../SerializationWorkspace';
import { SettingsField } from '../SettingsField';
import { Input, Select, Textarea } from '../../../ui/input';
import type { SequenceSetting } from '../../../../services/companySettingsService';

const sequence: SequenceSetting = { entityType: 'SUPPLIER_CODE', prefix: 'SUP-{YYYY}-{YY}-{MM}-{DD}-', suffix: '{MM}', nextNumber: 7, paddingLength: 4, resetFrequency: 'NEVER' };
const date = new Date(2026, 8, 28);
const document = { name: 'Tax certificate', documentCategory: 'mandatory' as const, fieldType: 'attachment' };

describe('document number format validation', () => {
  it('matches server token, padding and suffix formatting without truncating large counters', () => {
    expect(sequencePreview(sequence, date)).toBe('SUP-2026-26-09-28-0007-09');
    expect(sequencePreview({ ...sequence, prefix: '', suffix: '', nextNumber: 12345, paddingLength: 3 }, date)).toBe('12345');
    expect(sequencePreview({ ...sequence, suffix: '-END' }, date).endsWith('--END')).toBe(true);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid counter %s', nextNumber => {
    expect(sequenceErrors({ ...sequence, nextNumber })).not.toEqual([]);
  });
  it('does not display NaN as a generated document code', () => {
    expect(sequencePreview({ ...sequence, nextNumber: NaN })).toBe('Enter a valid counter');
  });
  it('validates paired financial-year dates and their ordering', () => {
    expect(sequenceErrors({ ...sequence, resetFrequency: 'YEARLY' })).toEqual([]);
    expect(sequenceErrors({ ...sequence, resetFrequency: 'YEARLY', periodStartDate: '2026-04-01' })).not.toEqual([]);
    expect(sequenceErrors({ ...sequence, resetFrequency: 'YEARLY', periodStartDate: '2026-04-01', periodEndDate: '2026-04-01' })).not.toEqual([]);
    expect(sequenceErrors({ ...sequence, resetFrequency: 'FISCAL_YEAR', periodStartDate: '2026-04-01', periodEndDate: '2027-03-31' })).toEqual([]);
    expect(sequenceErrors({ ...sequence, resetFrequency: 'CUSTOM_PERIOD', periodStartDate: 'invalid', periodEndDate: 'invalid' })).not.toEqual([]);
  });
  it('detects all editable settings but ignores server metadata and empty/null equivalence', () => {
    expect(sequenceChanges(sequence, { ...sequence, id: 'server-id' })).toBe(false);
    expect(sequenceChanges({ ...sequence, suffix: null }, { ...sequence, suffix: '' })).toBe(false);
    for (const change of [{ prefix: 'PO-' }, { suffix: 'END' }, { nextNumber: 8 }, { paddingLength: 6 }, { resetFrequency: 'MONTHLY' }, { periodStartDate: '2026-01-01' }, { periodEndDate: '2026-12-31' }]) {
      expect(sequenceChanges(sequence, { ...sequence, ...change })).toBe(true);
    }
  });
});

describe('required-document edits', () => {
  it.each(['trackIssueDate', 'trackExpirationDate', 'trackIssuingAuthority'] as const)('saves a change to %s even when all other fields are unchanged', key => {
    const draft = { ...document, [key]: false };
    expect(requiredDocumentChanged(document, draft)).toBe(true);
    expect(requiredDocumentPayload(draft)[key]).toBe(false);
  });
  it('preserves zero-day alerts, existing categories and unchanged defaults', () => {
    expect(requiredDocumentPayload({ ...document, expirationAlertDays: 0, documentCategory: 'any_other' })).toMatchObject({ expirationAlertDays: 0, documentCategory: 'any_other' });
    expect(requiredDocumentChanged(document, { ...document, trackIssueDate: true, expirationAlertDays: 30, expirationAlertFrequency: 'DAILY' })).toBe(false);
  });
  it('blocks blank/duplicate names and invalid alerts before any persistence', () => {
    expect(requiredDocumentErrors([{ ...document, name: ' ' }])).toHaveLength(1);
    expect(requiredDocumentErrors([document, { ...document, name: ' TAX CERTIFICATE ' }])).toHaveLength(1);
    for (const expirationAlertDays of [-1, 366, 1.5, NaN]) expect(requiredDocumentErrors([{ ...document, expirationAlertDays }])).toHaveLength(1);
    expect(requiredDocumentErrors([document])).toEqual([]);
  });
});

describe('settings control contracts', () => {
  const props = { sequences: SEQUENCE_TYPES.map(type => ({ ...sequence, entityType: type.key })), edits: { SUPPLIER_CODE: sequence }, loading: false, saving: null, error: null, canManage: true, assigning: false, onChange: () => {}, onSave: () => {}, onDiscard: () => {}, onAssignSuppliers: () => {}, onRetry: () => {} };
  it('retains all six formats and every supplier setting in the overview/editor', () => {
    const html = renderToStaticMarkup(<SerializationWorkspace {...props}/>);
    for (const { label } of SEQUENCE_TYPES) expect(html).toContain(label);
    for (const label of ['Prefix', 'Suffix', 'Digit Padding', 'Reset Frequency', 'Next Counter Number', 'Assign Existing Vendors']) expect(html).toContain(label);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Save Supplier Code/s);
  });
  it('disables the entire editor for a viewer and provides retry on load failure', () => {
    expect(renderToStaticMarkup(<SerializationWorkspace {...props} canManage={false}/>)).toContain('<fieldset disabled=""');
    const html = renderToStaticMarkup(<SerializationWorkspace {...props} sequences={[]} edits={{}} error="Could not load formats"/>);
    expect(html).toContain('Retry');
    expect(html).not.toContain('Save Supplier Code');
    expect(html).not.toContain('SUP-2026');
  });
  it('associates labels with unique controls, including explicitly supplied IDs', () => {
    const html = renderToStaticMarkup(<><SettingsField><label>Name</label><Input/></SettingsField><SettingsField><label>Type</label><Select/></SettingsField><SettingsField><label>Notes</label><Textarea id="notes"/></SettingsField></>);
    const labels = [...html.matchAll(/for="([^"]+)"/g)].map(match => match[1]);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
    expect(labels).toEqual(ids);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain('notes');
  });
});

describe('legacy unit aliases', () => {
  it('normalizes arrays, stored lists, JSON arrays and empty values for duplicate detection', () => {
    expect(unitAliases(['kg', ' kgs ', ''])).toEqual(['kg', 'kgs']);
    expect(unitAliases('kg, kgs; kilo|kilogram')).toEqual(['kg', 'kgs', 'kilo', 'kilogram']);
    expect(unitAliases('["kg", "kgs"]')).toEqual(['kg', 'kgs']);
    expect(unitAliases(null)).toEqual([]);
  });
});
