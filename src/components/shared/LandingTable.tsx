import { projectTable, type LandingColumn } from './landingTableProjection';
export type { LandingColumn } from './landingTableProjection';
import { useMemo, useState, type TableHTMLAttributes } from 'react';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import ColumnCustomizer from './ColumnCustomizer';
import ColumnSettingsButton from './ColumnSettingsButton';
import './ColumnCustomizer.css';

/** For flat landing registers. Detail, form and nested tables opt out by default. */
export default function LandingTable({ preferenceKey, columns, children, ...props }: TableHTMLAttributes<HTMLTableElement> & {
  preferenceKey: string;
  columns: LandingColumn[];
}) {
  const configurable = useMemo(() => columns.filter(col => !col.pinned), [columns]);
  const prefs = useColumnPreferences(preferenceKey, configurable);
  const [open, setOpen] = useState(false);
  return <>
    <table {...props}>
      {projectTable(children, columns, prefs.visibleColumns, <ColumnSettingsButton open={open} onClick={() => setOpen(true)} />)}
    </table>
    {open && <ColumnCustomizer
      columnOrder={prefs.columnOrder}
      visibleKeys={prefs.visibleKeys}
      allColumns={configurable}
      onToggle={prefs.handleToggle}
      onReorder={prefs.handleReorder}
      onReset={prefs.handleReset}
      onClose={() => setOpen(false)}
    />}
  </>;
}
