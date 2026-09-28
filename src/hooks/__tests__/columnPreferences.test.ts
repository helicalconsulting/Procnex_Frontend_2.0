import { describe, expect, it } from 'vitest';
import { normalizeColumnPreferences, type ColumnDef } from '../columnPreferences';
const defs: ColumnDef[] = [
  { key: 'status', label: 'Status', defaultVisible: true, required: true },
  { key: 'item', label: 'Item', defaultVisible: true, required: true },
  { key: 'price', label: 'Price', defaultVisible: true, required: true },
  { key: 'terms', label: 'Payment Terms', defaultVisible: true },
];
describe('saved table preferences', () => {
  it('retains only required columns after Hide Optional, including across reloads', () => {
    const saved = { columnOrder: defs.map(d => d.key), visibleKeys: ['status', 'item', 'price'] };
    expect(normalizeColumnPreferences(defs, JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it('repairs existing preferences that hid every column', () => {
    expect(normalizeColumnPreferences(defs, { columnOrder: defs.map(d => d.key), visibleKeys: [] }).visibleKeys).toEqual(['status', 'item', 'price']);
  });
  it('deduplicates and removes obsolete columns while preserving user order', () => {
    expect(normalizeColumnPreferences(defs, { columnOrder: ['price', 'status', 'status', 'gone', 'item', 'terms'], visibleKeys: ['gone', 'terms'] })).toEqual({ columnOrder: ['price', 'status', 'item', 'terms'], visibleKeys: ['price', 'status', 'item', 'terms'] });
  });
  it('adds newly introduced default columns without unhiding existing optional columns', () => {
    const updated = [...defs, { key: 'leadTime', label: 'Lead time', defaultVisible: true }];
    expect(normalizeColumnPreferences(updated, { columnOrder: defs.map(d => d.key), visibleKeys: ['item'] }).visibleKeys).toEqual(['status', 'item', 'price', 'leadTime']);
  });
  it.each([null, 'bad', {}, { columnOrder: null, visibleKeys: [] }, { columnOrder: [2], visibleKeys: 'bad' }])('recovers from malformed stored data %j', saved => {
    expect(normalizeColumnPreferences(defs, saved).visibleKeys).toEqual(defs.map(d => d.key));
  });
  it('resets the order and shows default columns while keeping non-default columns hidden', () => {
    const updated = [...defs, { key: 'internal', label: 'Internal', defaultVisible: false }];
    expect(normalizeColumnPreferences(updated).visibleKeys).toEqual(defs.map(d => d.key));
  });
});
