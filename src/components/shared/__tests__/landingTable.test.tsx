import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { projectTable, type LandingColumn } from '../landingTableProjection';
import ColumnSettingsButton from '../ColumnSettingsButton';

const cols: LandingColumn[] = [
  { key: 'selection', label: 'Select', defaultVisible: true, pinned: 'start' },
  { key: 'name', label: 'Name', defaultVisible: true, required: true },
  { key: 'status', label: 'Status', defaultVisible: true },
  { key: 'value', label: 'Value', defaultVisible: true },
  { key: 'actions', label: 'Actions', defaultVisible: true, pinned: 'end' },
];
const fixture = <>
  <caption>Register</caption>
  <colgroup>{cols.map(col => <col key={col.key} data-column={col.key} />)}</colgroup>
  <thead><tr>{cols.map(col => <th key={col.key}>{col.label}</th>)}</tr></thead>
  <tbody>{[1, 2].map(n => <tr key={n}><td>Select {n}</td><td>Name {n}</td><td>Status {n}</td><td>Value {n}</td><td><button>View {n}</button></td></tr>)}</tbody>
</>;
const control = <ColumnSettingsButton open={false} onClick={() => {}} />;
const render = (keys: string[]) => renderToStaticMarkup(<table>{projectTable(fixture, cols, keys, control)}</table>);

describe('landing table column projection', () => {
  it('reorders headers, cells and column widths together, retaining pinned selection/actions', () => {
    const html = render(['value', 'name']);
    expect(html).toContain('<caption>Register</caption>');
    expect(html).toContain('<td>Select 1</td><td>Value 1</td><td>Name 1</td><td><button>View 1</button></td>');
    expect(html).toContain('<td>Select 2</td><td>Value 2</td><td>Name 2</td><td><button>View 2</button></td>');
    expect(html.indexOf('data-column="value"')).toBeLessThan(html.indexOf('data-column="name"'));
    expect(html.indexOf('>Value</th>')).toBeLessThan(html.indexOf('>Name</th>'));
    expect(html).not.toContain('>Status');
    expect(html.match(/aria-label="Customize columns"/g)).toHaveLength(1);
  });
  it('keeps actions reachable with only the identifier visible', () => {
    const html = render(['name']);
    expect(html).toContain('<td>Select 1</td><td>Name 1</td><td><button>View 1</button></td>');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('lucide-ellipsis-vertical');
  });
  it('keeps empty rows spanning all visible columns', () => {
    const html = renderToStaticMarkup(<table>{projectTable(<tbody><tr><td colSpan={5}>No results</td></tr></tbody>, cols, ['name'], control)}</table>);
    expect(html).toContain('colSpan="3"');
  });
  it('adds exactly one trailing settings cell on registers without row actions', () => {
    const simple = cols.slice(1, 4);
    const html = renderToStaticMarkup(<table>{projectTable(<>
      <thead><tr><th>Name</th><th>Status</th><th>Value</th></tr></thead>
      <tbody><tr><td>Acme</td><td>Active</td><td>100</td></tr><tr><td colSpan={3}>Note</td></tr></tbody>
    </>, simple, ['name'], control)}</table>);
    expect(html.match(/aria-label="Customize columns"/g)).toHaveLength(1);
    expect(html).toContain('<td>Acme</td><td></td>');
    expect(html).toContain('colSpan="2"');
  });
  it('does not transform nested detail content inside a retained cell', () => {
    const html = renderToStaticMarkup(<table>{projectTable(<tbody><tr><td>Select</td><td><table><tbody><tr><td>Nested</td><td>Value</td></tr></tbody></table></td><td>Status</td><td>100</td><td>View</td></tr></tbody>, cols, ['name'], control)}</table>);
    expect(html).toContain('<table><tbody><tr><td>Nested</td><td>Value</td></tr></tbody></table>');
  });
  it('moves legacy leading actions to the final column without moving actions onto the wrong record', () => {
    const leading = [cols[4], cols[1], cols[2]];
    const html = renderToStaticMarkup(<table>{projectTable(<>
      <thead><tr><th>Actions</th><th>Name</th><th>Status</th></tr></thead>
      <tbody><tr><td><button data-record="a">Edit A</button></td><td>A</td><td>Active</td></tr>
        <tr><td><button data-record="b">Edit B</button></td><td>B</td><td>Inactive</td></tr></tbody>
    </>, leading, ['name'], control)}</table>);
    expect(html).toContain('<td>A</td><td><button data-record="a">Edit A</button></td>');
    expect(html).toContain('<td>B</td><td><button data-record="b">Edit B</button></td>');
    expect(html.indexOf('>Name</th>')).toBeLessThan(html.indexOf('Actions'));
  });
});
