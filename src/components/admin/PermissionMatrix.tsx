import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { Check, Minus, Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getModuleCapability, moduleSupports, type ModulePermissionRow, type PermissionField } from '../../config/modulePermissions';
import { PERMISSION_FIELDS, PERMISSION_GROUPS, PERMISSION_LABELS, permissionSelection, setPermission, setPermissionScope } from './permissionMatrixModel';

function PermissionCheckbox({ label, checked, mixed = false, disabled = false, onChange }: {
  label: string; checked: boolean; mixed?: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <span className="permission-check" title={`${label}: ${mixed ? 'partially granted' : checked ? 'granted' : 'not granted'}`}>
    <input ref={input} type="checkbox" checked={checked} aria-checked={mixed ? 'mixed' : checked} aria-label={label}
      disabled={disabled} onChange={event => onChange(event.target.checked)} />
    {mixed ? <Minus size={13} aria-hidden="true" /> : checked ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
  </span>;
}

/** The same matrix drives the role workspace and Create Role. Changes are drafts. */
export default function PermissionMatrix({ permissions, editable, busy = false, onChange, label = 'Module permissions' }: {
  permissions: ModulePermissionRow[]; editable: boolean; busy?: boolean;
  onChange?: (rows: ModulePermissionRow[]) => void; label?: string;
}) {
  const [query, setQuery] = useState('');
  const hintId = useId();
  const searchId = useId();
  const q = query.trim().toLowerCase();
  const visible = permissions.filter(row => `${row.module} ${getModuleCapability(row.module).hint}`.toLowerCase().includes(q));
  const scope = visible.map(row => row.module);
  const selection = permissionSelection(visible);
  const applyScope = (modules: string[], granted: boolean, field?: PermissionField) => {
    if (editable && !busy) onChange?.(setPermissionScope(permissions, modules, granted, field));
  };

  return (
    <div className={`permission-matrix ${editable ? 'permission-matrix--editable' : ''}`}>
      <div className="permission-matrix__toolbar">
        <div className="permission-matrix__search">
          <Search size={15} aria-hidden="true" />
          <Input
            id={searchId}
            aria-label="Filter modules"
            placeholder="Filter modules..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-9 text-xs"
          />
          {query && (
            <button type="button" aria-label="Clear module filter" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <span className="permission-matrix__counter text-xs text-muted-foreground tabular-nums">
          {visible.length} of {permissions.length} modules
        </span>
        {editable && (
          <div className="permission-matrix__bulk">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || selection.all || !selection.total}
              onClick={() => applyScope(scope, true)}
              className="h-8 text-xs font-medium"
            >
              {q ? 'Grant filtered' : 'Grant all'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !selection.granted}
              onClick={() => applyScope(scope, false)}
              className="h-8 text-xs font-medium"
            >
              {q ? 'Revoke filtered' : 'Revoke all'}
            </Button>
          </div>
        )}
      </div>

      <div id={hintId} className="permission-matrix__hint-box">
        <p className="text-[12px] text-muted-foreground m-0 leading-normal">
          {editable
            ? '⚡ Edit mode active: Create and Approve include View. Revoking View automatically unchecks both actions.'
            : 'Checked permissions are granted for this role. A dash (—) means the action is not applicable to that module.'}
          {editable && q && (
            <strong className="text-foreground"> Bulk actions apply only to the {visible.length} filtered modules.</strong>
          )}
        </p>
      </div>

      <div className="permission-matrix__scroll" tabIndex={0} role="region" aria-label={label} aria-describedby={hintId}>
        <table className="permission-matrix__table">
          <thead>
            <tr>
              <th scope="col" className="permission-matrix__th-module">
                Module
              </th>
              {PERMISSION_FIELDS.map(field => {
                const selected = permissionSelection(visible, field);
                return (
                  <th scope="col" key={field} className="permission-matrix__th-field">
                    <div className="permission-matrix__column">
                      <span>{PERMISSION_LABELS[field]}</span>
                      {editable && (
                        <PermissionCheckbox
                          label={`All ${PERMISSION_LABELS[field]} permissions in ${q ? 'filtered' : 'listed'} modules`}
                          checked={selected.all}
                          mixed={selected.mixed}
                          disabled={busy || !selected.total}
                          onChange={granted => applyScope(scope, granted, field)}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map(group => {
              const rows = visible.filter(row => group.modules.includes(row.module));
              if (!rows.length) return null;
              const granted = permissionSelection(rows);
              return (
                <Fragment key={group.name}>
                  <tr className="permission-matrix__group">
                    <th colSpan={4} scope="rowgroup">
                      <div className="permission-matrix__group-content">
                        <span className="permission-matrix__group-title">
                          {group.name}
                          <span className="permission-matrix__group-count">
                            {granted.granted}/{granted.total} granted
                          </span>
                        </span>
                        {editable && (
                          <span className="permission-matrix__group-actions">
                            <button
                              type="button"
                              disabled={busy || granted.all}
                              aria-label={`Grant all ${group.name} permissions${q ? ' in filtered modules' : ''}`}
                              onClick={() => applyScope(rows.map(row => row.module), true)}
                            >
                              Grant all
                            </button>
                            <span className="text-muted-foreground/40">·</span>
                            <button
                              type="button"
                              disabled={busy || !granted.granted}
                              aria-label={`Revoke all ${group.name} permissions${q ? ' in filtered modules' : ''}`}
                              onClick={() => applyScope(rows.map(row => row.module), false)}
                            >
                              Revoke all
                            </button>
                          </span>
                        )}
                      </div>
                    </th>
                  </tr>
                  {rows.map(row => (
                    <tr key={row.module} className="permission-matrix__row">
                      <th scope="row" className="permission-matrix__cell-module">
                        <span className="text-xs font-semibold text-foreground tracking-tight">{row.module}</span>
                        <span className="permission-matrix__module-hint text-[11px] text-muted-foreground">
                          {getModuleCapability(row.module).hint}
                        </span>
                      </th>
                      {PERMISSION_FIELDS.map(field => (
                        <td key={field} className="permission-matrix__cell-check">
                          {moduleSupports(row.module, field) ? (
                            <PermissionCheckbox
                              label={`${PERMISSION_LABELS[field]} permission for ${row.module}`}
                              checked={row[field]}
                              disabled={!editable || busy}
                              onChange={checked => {
                                if (editable && !busy) onChange?.(setPermission(permissions, row.module, field, checked));
                              }}
                            />
                          ) : (
                            <span
                              className="text-muted-foreground/70 dark:text-muted-foreground/60 text-sm select-none"
                              aria-label={`${PERMISSION_LABELS[field]} not available for ${row.module}`}
                            >
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <div className="permission-matrix__empty text-sm text-muted-foreground">
            No modules match “{query}”.{' '}
            <button type="button" onClick={() => setQuery('')} className="text-primary hover:underline font-medium">
              Clear filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
