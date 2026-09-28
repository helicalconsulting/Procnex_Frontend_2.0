import { useEffect, useMemo, useRef, useState } from 'react';
import { Shield, Search, Plus, Lock, Users, ShieldCheck, ShieldAlert, Edit3, Trash2, X, Save, Check, Info } from 'lucide-react';
import { useServiceData } from '../../hooks/useServiceData';
import { useAuth } from '../../context/AuthContext';
import { adminService, type AdminRoleRecord } from '../../services/adminService';
import { MODULE_CAPABILITIES, PERMISSION_MODULE_NAMES, buildDefaultPermissions, type ModulePermissionRow } from '../../config/modulePermissions';
import { duplicateRoleName, normalizePermissions, permissionChanges, permissionSelection, rolePermissionRows } from '../../components/admin/permissionMatrixModel';
import PermissionMatrix from '../../components/admin/PermissionMatrix';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { CardSkeleton } from '../../components/shared/Skeleton';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import './roles-workspace.css';

interface RoleData extends Omit<AdminRoleRecord, 'permissions'> {
  permissions: ModulePermissionRow[];
  extraPermissions: ModulePermissionRow[];
  protected: boolean;
}
interface RoleDraft { base: ModulePermissionRow[]; permissions: ModulePermissionRow[] }

function mapRole(role: AdminRoleRecord): RoleData {
  const protectedRole = role.roleName === 'Super Admin';
  return { ...role, protected: protectedRole,
    permissions: rolePermissionRows(role.permissions, protectedRole),
    extraPermissions: (role.permissions ?? []).filter(row => !PERMISSION_MODULE_NAMES.includes(row.module)),
  };
}

export default function RolesPermissionsPage() {
  const { roles: authRoles, hasPermission } = useAuth();
  const canManage = hasPermission('Roles & Permissions', 'canCreate');
  const canDelete = canManage && authRoles.includes('Super Admin');
  const { data: roles, loading, error, forceRefresh } = useServiceData(
    () => adminService.listRoles().then(list => list.map(mapRole)), [] as RoleData[], [], { cacheKey: 'roles:list' });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'system' | 'custom'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RoleDraft>>({});
  const [busy, setBusy] = useState(false);
  const requestPending = useRef(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newPermissions, setNewPermissions] = useState(buildDefaultPermissions);
  const [createError, setCreateError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RoleData | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [showModules, setShowModules] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const roleNameInput = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => ({ total: roles.length, system: roles.filter(r => r.isSystem).length, custom: roles.filter(r => !r.isSystem).length }), [roles]);
  const filtered = roles.filter(role => (filter === 'all' || (filter === 'system' ? role.isSystem : !role.isSystem))
    && `${role.displayRoleName || role.roleName} ${role.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = filtered.find(role => role.id === selectedId) ?? filtered[0];
  const draft = selected ? drafts[selected.id] : undefined;
  const permissions = draft?.permissions ?? selected?.permissions ?? [];
  const changed = draft ? permissionChanges(draft.base, draft.permissions) : 0;
  const dirtyRoles = Object.values(drafts).filter(d => permissionChanges(d.base, d.permissions) > 0).length;
  const conflict = Boolean(draft && selected && permissionChanges(draft.base, selected.permissions));
  const editable = Boolean(draft && canManage && selected && !selected.protected);
  const counts = permissionSelection(permissions);
  const duplicateName = Boolean(name.trim() && duplicateRoleName(name, roles.flatMap(role => [role.roleName, role.displayRoleName || role.roleName])));
  const createDirty = showCreate && Boolean(name || description || permissionSelection(newPermissions).granted);
  const removesOwnManagement = Boolean(editable && selected && authRoles.includes(selected.roleName)
    && !permissions.find(p => p.module === 'Roles & Permissions')?.canCreate);

  useEffect(() => {
    if (!dirtyRoles && !createDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyRoles, createDirty]);

  function discardDraft(id: string) {
    setDrafts(current => { const next = { ...current }; delete next[id]; return next; });
    setMessage(null);
  }
  function startEditing() {
    if (!selected || selected.protected || !canManage || busy) return;
    setMessage(null);
    setDrafts(current => ({ ...current, [selected.id]: { base: selected.permissions.map(p => ({ ...p })), permissions: normalizePermissions(selected.permissions) } }));
  }
  async function savePermissions() {
    if (!selected || selected.protected || !editable || !draft || !changed || conflict || requestPending.current) return;
    requestPending.current = true;
    setBusy(true); setMessage(null);
    try {
      await adminService.updateRolePermissions(selected.id, [...normalizePermissions(draft.permissions), ...selected.extraPermissions]);
      await forceRefresh();
      discardDraft(selected.id);
      setMessage({ type: 'success', text: `Permissions saved for ${selected.displayRoleName || selected.roleName}.` });
      window.dispatchEvent(new Event('heliflow_auth_change'));
    } catch (failure) {
      setMessage({ type: 'error', text: failure instanceof Error ? failure.message : 'Could not save permissions. Your changes are retained.' });
    } finally { requestPending.current = false; setBusy(false); }
  }
  function openCreate() {
    if (!canManage || busy) return;
    setName(''); setDescription(''); setNewPermissions(buildDefaultPermissions()); setCreateError(''); setShowCreate(true);
  }
  async function createRole() {
    if (!canManage || !name.trim() || duplicateName || requestPending.current) return;
    requestPending.current = true;
    setBusy(true); setCreateError('');
    try {
      const role = await adminService.createRole({ roleName: name.trim(), description: description.trim() || `Custom role: ${name.trim()}`, permissions: normalizePermissions(newPermissions) });
      await forceRefresh();
      setShowCreate(false); setSelectedId(role.id); setSearch(''); setFilter('all');
      setMessage({ type: 'success', text: `Role ${role.displayRoleName || role.roleName} created.` });
    } catch (failure) { setCreateError(failure instanceof Error ? failure.message : 'Could not create role. Your draft is retained.'); }
    finally { requestPending.current = false; setBusy(false); }
  }
  async function deleteRole() {
    if (!canDelete || !deleteTarget || deleteTarget.protected || requestPending.current) return;
    requestPending.current = true;
    setBusy(true); setDeleteError('');
    try {
      await adminService.deleteRole(deleteTarget.id);
      await forceRefresh(); discardDraft(deleteTarget.id); setDeleteTarget(null);
      setMessage({ type: 'success', text: `Role ${deleteTarget.displayRoleName || deleteTarget.roleName} deleted.` });
    } catch (failure) { setDeleteError(failure instanceof Error ? failure.message : 'Could not delete role.'); }
    finally { requestPending.current = false; setBusy(false); }
  }

  return <PageFrame className="roles-workspace space-y-6">
    <PageLead title="Roles & Permissions" description="Manage roles, define access levels, and configure module permissions"
      actions={<Button ref={createTrigger} onClick={openCreate} disabled={!canManage || busy}><Plus size={16} />Create Role</Button>} />
    {error && <MessageStrip type="error">{error}</MessageStrip>}
    {message && <MessageStrip type={message.type} onClose={() => setMessage(null)}>{message.text}</MessageStrip>}
    <div className="roles-metrics grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {([
        { key: 'all', label: 'Total Roles', value: summary.total, icon: Shield, tone: 'primary' },
        { key: 'modules', label: 'Modules', value: PERMISSION_MODULE_NAMES.length, icon: Lock, tone: 'warning' },
        { key: 'system', label: 'System Roles', value: summary.system, icon: ShieldCheck, tone: 'success' },
        { key: 'custom', label: 'Custom Roles', value: summary.custom, icon: ShieldAlert, tone: 'violet' },
      ] as const).map(metric => <MetricCard key={metric.key} label={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone}
        role="button" tabIndex={0} aria-pressed={metric.key === 'modules' ? showModules : filter === metric.key && !showModules}
        onClick={() => { if (metric.key === 'modules') setShowModules(v => !v); else { setFilter(metric.key); setShowModules(false); } }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} />)}
    </div>
    {showModules && <div className="roles-module-catalog text-xs"><strong>{PERMISSION_MODULE_NAMES.length} modules · {permissionSelection(buildDefaultPermissions()).total} supported permissions</strong><p>Create and Approve are offered only where the module supports them.</p><div>{MODULE_CAPABILITIES.map(module => <span key={module.module}>{module.module}</span>)}</div></div>}
    {loading ? <CardSkeleton count={3} /> : <div className="roles-split">
      <aside className="roles-picker" aria-label="Roles">
        <div className="roles-picker__header"><div className="text-xs font-semibold"><span>Roles</span><span className="text-muted-foreground">{filtered.length} of {roles.length}</span></div>
          <div className="roles-picker__search"><Search size={15} /><Input aria-label="Search roles and permissions" placeholder="Find a role..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
        <div className="roles-picker__list">
          {filtered.map(role => {
            const pending = drafts[role.id];
            const dirty = pending ? permissionChanges(pending.base, pending.permissions) : 0;
            const tally = permissionSelection(pending?.permissions ?? role.permissions);
            return <button key={role.id} type="button" className="roles-picker__item" aria-pressed={selected?.id === role.id} disabled={busy}
              onClick={() => { setSelectedId(role.id); setMessage(null); }}>
              <span className="roles-picker__name text-base font-semibold">{role.displayRoleName || role.roleName}{role.protected && <Lock size={13} />}</span>
              <span className="text-xs text-muted-foreground">{role.userCount ?? 0} user{role.userCount === 1 ? '' : 's'} · {tally.granted}/{tally.total} granted</span>
              {dirty > 0 && <span className="roles-unsaved text-[11px]">Unsaved changes</span>}
            </button>;
          })}
          {!filtered.length && <p className="roles-picker__empty text-xs text-muted-foreground">No roles match this filter.</p>}
        </div>
        {dirtyRoles > 0 && <p className="roles-picker__note text-[11px]">{dirtyRoles} role{dirtyRoles === 1 ? '' : 's'} with unsaved changes. Drafts stay available when switching roles.</p>}
      </aside>
      {selected ? <section className="roles-detail" aria-label={`Permissions for ${selected.displayRoleName || selected.roleName}`}>
        <header className="roles-detail__header">
          <div><h2 className="text-base font-semibold">{selected.displayRoleName || selected.roleName}</h2>
            <p className="text-xs text-muted-foreground">{selected.description || 'Configure this role’s access to application modules.'}</p>
            <div className="roles-detail__meta text-xs text-muted-foreground"><span><Users size={13} />{selected.userCount ?? 0} assigned user{selected.userCount === 1 ? '' : 's'}</span><span>{counts.granted} of {counts.total} permissions granted</span>{selected.isSystem && <span><Shield size={13} />System role</span>}</div>
          </div>
          <div className="roles-detail__actions">
            {selected.protected ? <span className="roles-protected text-xs"><Lock size={13} />Full access · protected</span>
              : !draft ? <Button variant="outline" size="sm" onClick={startEditing} disabled={!canManage || busy}><Edit3 size={14} />Edit permissions</Button>
                : <span className="roles-editing text-xs"><Edit3 size={13} />Editing</span>}
            {canDelete && !selected.protected && <Button variant="ghost" size="icon-sm" aria-label={`Delete ${selected.displayRoleName || selected.roleName}`} disabled={busy || Boolean(draft)} onClick={() => { setDeleteError(''); setDeleteTarget(selected); }}><Trash2 size={15} /></Button>}
          </div>
        </header>
        <PermissionMatrix key={selected.id} permissions={permissions} editable={editable} busy={busy}
          onChange={next => setDrafts(current => ({ ...current, [selected.id]: { base: current[selected.id].base, permissions: next } }))} />
        <footer className="roles-detail__footer">
          <div className="text-xs text-muted-foreground" role="status">
            {conflict ? <span className="roles-error">This role changed while you were editing. Cancel to load its latest permissions.</span>
              : draft ? <><strong className="roles-change-count">{changed} unsaved permission change{changed === 1 ? '' : 's'}</strong><span>Applies to {selected.userCount ?? 0} assigned user{selected.userCount === 1 ? '' : 's'} after saving.</span></>
                : <span><Info size={13} />{selected.protected ? 'Super Admin permissions are fixed to full access.' : canManage ? 'View mode. Choose Edit permissions to make changes.' : 'You have read-only access to role permissions.'}</span>}
            {removesOwnManagement && <span className="roles-error">Saving removes this role’s ability to manage permissions, including your own access through this role.</span>}
            {selected.extraPermissions.length > 0 && <span>{selected.extraPermissions.length} permissions outside this module list are unchanged.</span>}
          </div>
          {draft && <div className="roles-detail__actions"><Button variant="outline" onClick={() => discardDraft(selected.id)} disabled={busy}>Cancel changes</Button><Button onClick={savePermissions} disabled={busy || !editable || !changed || conflict}><Save size={14} />{busy ? 'Saving…' : 'Save changes'}</Button></div>}
        </footer>
      </section> : <div className="roles-detail roles-detail--empty"><EmptyState icon={Shield} title="No roles found" description="Try another search or role filter." /></div>}
    </div>}

    <Dialog open={showCreate} onOpenChange={open => { if (!busy) setShowCreate(open); }}>
      <DialogContent className="roles-workspace role-create-dialog" hideClose onOpenAutoFocus={event => { event.preventDefault(); roleNameInput.current?.focus(); }} onInteractOutside={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); createTrigger.current?.focus(); }}>
        <header className="role-create-dialog__header"><div><DialogTitle>Create New Role</DialogTitle><DialogDescription className="text-xs">Define the role, then choose its module permissions.</DialogDescription></div><Button variant="ghost" size="icon-sm" aria-label="Close create role" disabled={busy} onClick={() => setShowCreate(false)}><X size={18} /></Button></header>
        <div className="role-create-dialog__fields">
          {createError && <MessageStrip type="error">{createError}</MessageStrip>}
          <div className="role-create-dialog__field-grid"><div><label htmlFor="role-name" className="text-xs font-semibold">Role Name <span aria-hidden="true">*</span></label><Input ref={roleNameInput} id="role-name" required placeholder="e.g. Regional Procurement Officer" value={name} disabled={busy} aria-invalid={duplicateName} aria-describedby={duplicateName ? 'role-name-error' : undefined} onChange={e => setName(e.target.value)} />{duplicateName && <p id="role-name-error" className="roles-error text-xs">A role with this name already exists.</p>}</div>
            <div><label htmlFor="role-description" className="text-xs font-semibold">Description</label><Input id="role-description" placeholder="Role responsibilities overview..." value={description} disabled={busy} onChange={e => setDescription(e.target.value)} /></div></div>
        </div>
        <PermissionMatrix permissions={newPermissions} editable busy={busy} onChange={setNewPermissions} label="New role permissions" />
        <footer className="role-create-dialog__footer"><p className="text-xs text-muted-foreground" role="status">{permissionSelection(newPermissions).granted} of {permissionSelection(newPermissions).total} permissions granted{!permissionSelection(newPermissions).granted && <span>No module access until permissions are granted.</span>}</p><div className="roles-detail__actions"><Button variant="outline" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</Button><Button onClick={createRole} disabled={busy || !canManage || !name.trim() || duplicateName}><Check size={14} />{busy ? 'Creating…' : 'Create Role'}</Button></div></footer>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}>
      <DialogContent className="roles-workspace" hideClose><DialogTitle>Delete role?</DialogTitle><DialogDescription>This removes “{deleteTarget?.displayRoleName || deleteTarget?.roleName}” and its assignments from {deleteTarget?.userCount ?? 0} users. This action cannot be undone.</DialogDescription>{deleteError && <MessageStrip type="error">{deleteError}</MessageStrip>}<div className="roles-detail__actions justify-end mt-4"><Button variant="outline" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={deleteRole}>{busy ? 'Deleting…' : 'Delete Role'}</Button></div></DialogContent>
    </Dialog>
  </PageFrame>;
}
