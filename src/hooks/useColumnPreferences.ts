import { useState, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
}

interface ColumnPreferences {
  columnOrder: string[];
  visibleKeys: string[];
}

interface UseColumnPreferencesReturn {
  columnOrder: string[];
  visibleKeys: Set<string>;
  visibleColumns: string[];
  handleToggle: (key: string) => void;
  handleReorder: (newOrder: string[]) => void;
  handleReset: () => void;
  colDefs: ColumnDef[];
}

// ─── Storage helpers ──────────────────────────────────────────

function loadPreferences(pageKey: string): ColumnPreferences | null {
  try {
    const raw = localStorage.getItem(`column-preferences-${pageKey}`);
    if (raw) return JSON.parse(raw) as ColumnPreferences;
  } catch {
    // ignore corrupted data
  }
  return null;
}

function savePreferences(pageKey: string, prefs: ColumnPreferences): void {
  try {
    localStorage.setItem(`column-preferences-${pageKey}`, JSON.stringify(prefs));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

// ─── Hook ─────────────────────────────────────────────────────

export function useColumnPreferences(
  pageKey: string,
  columnDefs: ColumnDef[],
): UseColumnPreferencesReturn {
  const defaultOrder = useMemo(() => columnDefs.map((d) => d.key), [columnDefs]);
  const defaultVisibleSet = useMemo(
    () => new Set(columnDefs.filter((d) => d.defaultVisible).map((d) => d.key)),
    [columnDefs],
  );

  // ── Helper: merge saved state with current defaults ──────────
  // Any column that is defaultVisible today but was missing from
  // saved preferences (e.g. a column added in a later deploy) is
  // automatically included.  Required columns are always forced on.
  const mergeWithDefaults = useCallback(
    (savedVisible: Set<string>) => {
      const merged = new Set(savedVisible);
      for (const def of columnDefs) {
        if (def.required || def.defaultVisible) merged.add(def.key);
      }
      return merged;
    },
    [columnDefs],
  );

  const initial = useMemo(() => {
    const saved = loadPreferences(pageKey);
    if (saved) {
      return {
        columnOrder: saved.columnOrder,
        visibleKeys: mergeWithDefaults(new Set<string>(saved.visibleKeys)),
      };
    }
    return {
      columnOrder: defaultOrder,
      visibleKeys: mergeWithDefaults(new Set(defaultVisibleSet)),
    };
  }, [pageKey, defaultOrder, defaultVisibleSet, mergeWithDefaults]);

  const [columnOrder, setColumnOrder] = useState<string[]>(initial.columnOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(initial.visibleKeys);

  const persist = useCallback(
    (order: string[], visible: Set<string>) => {
      savePreferences(pageKey, {
        columnOrder: order,
        visibleKeys: Array.from(mergeWithDefaults(visible)),
      });
    },
    [pageKey, mergeWithDefaults],
  );

  const handleToggle = useCallback(
    (key: string) => {
      setVisibleKeys((prev) => {
        const next = new Set(prev);
        // Don't allow hiding required columns
        const colDef = columnDefs.find((d) => d.key === key);
        if (colDef?.required) return next;
        if (next.has(key)) next.delete(key);
        else next.add(key);
        persist(columnOrder, next);
        return next;
      });
    },
    [columnOrder, persist, columnDefs],
  );

  const handleReorder = useCallback(
    (newOrder: string[]) => {
      setColumnOrder(newOrder);
      persist(newOrder, visibleKeys);
    },
    [visibleKeys, persist],
  );

  const handleReset = useCallback(() => {
    const resetVisible = mergeWithDefaults(new Set(defaultVisibleSet));
    setColumnOrder(defaultOrder);
    setVisibleKeys(resetVisible);
    persist(defaultOrder, resetVisible);
  }, [defaultOrder, defaultVisibleSet, persist, mergeWithDefaults]);

  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => visibleKeys.has(k)),
    [columnOrder, visibleKeys],
  );

  return {
    columnOrder,
    visibleKeys,
    visibleColumns,
    handleToggle,
    handleReorder,
    handleReset,
    colDefs: columnDefs,
  };
}
