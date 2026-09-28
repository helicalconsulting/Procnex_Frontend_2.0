export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
}
export interface ColumnPreferences { columnOrder: string[]; visibleKeys: string[] }

/** Preserve deliberate hiding; only genuinely new columns inherit their defaults. */
export function normalizeColumnPreferences(defs: ColumnDef[], saved?: unknown): ColumnPreferences {
  const keys = [...new Set(defs.map(d => d.key))];
  const candidate = saved as Partial<ColumnPreferences> | null;
  const valid = candidate && Array.isArray(candidate.columnOrder) && Array.isArray(candidate.visibleKeys)
    && candidate.columnOrder.every(k => typeof k === 'string') && candidate.visibleKeys.every(k => typeof k === 'string');
  const previousOrder = valid ? candidate.columnOrder! : [];
  const previousVisible = new Set(valid ? candidate.visibleKeys : []);
  const columnOrder = [...new Set([...previousOrder.filter(k => keys.includes(k)), ...keys])];
  const visibleKeys = columnOrder.filter(key => {
    const def = defs.find(d => d.key === key)!;
    return def.required || previousVisible.has(key) || (!previousOrder.includes(key) && def.defaultVisible);
  });
  return { columnOrder, visibleKeys };
}
