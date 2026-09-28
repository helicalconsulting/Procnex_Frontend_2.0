import { useState, useCallback, useMemo, useEffect } from 'react';
import { normalizeColumnPreferences, type ColumnDef } from './columnPreferences';
export type { ColumnDef } from './columnPreferences';

function loadPreferences(pageKey: string): unknown {
  try { return JSON.parse(localStorage.getItem(`column-preferences-${pageKey}`) || 'null'); }
  catch { return null; }
}

export function useColumnPreferences(pageKey: string, columnDefs: ColumnDef[]) {
  const [preferences, setPreferences] = useState(() => normalizeColumnPreferences(columnDefs, loadPreferences(pageKey)));
  const { columnOrder } = preferences;
  const visibleKeys = useMemo(() => new Set(preferences.visibleKeys), [preferences.visibleKeys]);
  useEffect(() => {
    try { localStorage.setItem(`column-preferences-${pageKey}`, JSON.stringify(preferences)); }
    catch { /* Preferences still work when storage is unavailable. */ }
  }, [pageKey, preferences]);

  const handleToggle = useCallback((key: string) => {
    const def = columnDefs.find(d => d.key === key);
    if (!def || def.required) return;
    setPreferences(prev => normalizeColumnPreferences(columnDefs, {
      ...prev,
      visibleKeys: prev.visibleKeys.includes(key) ? prev.visibleKeys.filter(k => k !== key) : [...prev.visibleKeys, key],
    }));
  }, [columnDefs]);
  const handleReorder = useCallback((newOrder: string[]) => {
    setPreferences(prev => ({ ...prev, columnOrder: normalizeColumnPreferences(columnDefs, { ...prev, columnOrder: newOrder }).columnOrder }));
  }, [columnDefs]);
  const handleReset = useCallback(() => setPreferences(normalizeColumnPreferences(columnDefs)), [columnDefs]);
  const visibleColumns = useMemo(() => columnOrder.filter(k => visibleKeys.has(k)), [columnOrder, visibleKeys]);
  return { columnOrder, visibleKeys, visibleColumns, handleToggle, handleReorder, handleReset, colDefs: columnDefs };
}
