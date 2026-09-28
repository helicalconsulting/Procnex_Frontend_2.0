import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { ColumnDef } from '../../hooks/columnPreferences';

export interface LandingColumn extends ColumnDef {
  /** Selection and row actions stay at their original outer edge. */
  pinned?: 'start' | 'end';
}

type NativeElement = ReactElement<{ children?: ReactNode; colSpan?: number; scope?: string }>;
function elements(children: ReactNode): NativeElement[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<NativeElement['props']>(child)) return [];
    return child.type === Fragment ? elements(child.props.children) : [child];
  });
}

/** Projects headers, body cells and colgroups together; never traverses cell content. */
export function projectTable(children: ReactNode, columns: LandingColumn[], visibleKeys: string[], control: ReactNode): ReactNode {
  const indices = [
    ...columns.flatMap((col, i) => col.pinned === 'start' ? [i] : []),
    ...visibleKeys.flatMap(key => {
      const i = columns.findIndex(col => col.key === key && !col.pinned);
      return i < 0 ? [] : [i];
    }),
    ...columns.flatMap((col, i) => col.pinned === 'end' ? [i] : []),
  ];
  const hasActions = columns.some(col => col.pinned === 'end');
  const count = indices.length + (hasActions ? 0 : 1);
  return elements(children).map(section => {
    if (section.type === 'colgroup') {
      const cols = elements(section.props.children);
      return cloneElement(section, {}, [
        ...indices.map(i => cols[i]),
        ...(!hasActions ? [<col key="settings" style={{ width: 52 }} />] : []),
      ]);
    }
    if (!['thead', 'tbody', 'tfoot'].includes(String(section.type))) return section;
    return cloneElement(section, {}, elements(section.props.children).map(row => {
      if (row.type !== 'tr') return row;
      const cells = elements(row.props.children);
      // Full-width empty, loading or explanatory rows remain full-width.
      if (cells.length === 1 && (cells[0].props.colSpan || 1) >= columns.length) {
        return cloneElement(row, {}, cloneElement(cells[0], { colSpan: count }));
      }
      const header = section.type === 'thead';
      const projected = indices.map(i => {
        const cell = cells[i];
        if (!cell) return null;
        return header && columns[i].pinned === 'end'
          ? cloneElement(cell, { scope: 'col' }, <div className="flex items-center justify-end gap-2 whitespace-nowrap">{cell.props.children}{control}</div>)
          : header ? cloneElement(cell, { scope: 'col' }) : cell;
      });
      if (!hasActions) projected.push(header
        ? <th key="settings" scope="col" className="w-13 px-2 text-right"><span className="sr-only">Table settings</span>{control}</th>
        : <td key="settings" />);
      return cloneElement(row, {}, projected);
    }));
  });
}

