import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronDown, MapPin, Check, Plus, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { companySettingsService, type Branch } from '../../services/companySettingsService';
import { clearAllApiCache } from '../../api/client';
import { cn } from '../../lib/utils';

export const ACTIVE_BRANCH_KEY = 'heliflow_active_branch_id';

export const BranchSwitcher: React.FC = () => {
  const { user, roles } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_BRANCH_KEY) || '';
  });
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Create Branch Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isGlobalAdmin = roles.some((r) => {
    const roleLower = String(r).toLowerCase().trim();
    return (
      roleLower === 'super admin' ||
      roleLower === 'admin' ||
      roleLower === 'administrator' ||
      roleLower === 'company_admin'
    );
  });

  const loadBranches = async () => {
    try {
      const list = await companySettingsService.listBranches();
      const activeList = list.filter((b) => b.isActive !== false);
      setBranches(activeList);

      if (activeList.length > 0) {
        const savedBranchId = localStorage.getItem(ACTIVE_BRANCH_KEY);
        const isValidSaved = savedBranchId === 'ALL' || activeList.some((b) => b.id === savedBranchId);

        if (!isValidSaved) {
          const defaultBr = activeList.find((b) => b.isDefault) || activeList[0];
          const initialId = defaultBr ? defaultBr.id : 'ALL';
          setSelectedBranchId(initialId);
          localStorage.setItem(ACTIVE_BRANCH_KEY, initialId);
          clearAllApiCache();
          window.dispatchEvent(new CustomEvent('branchScopeChanged', { detail: { branchId: initialId } }));
        }
      }
    } catch (err) {
      // Fallback silently if branches endpoint not loaded yet
    }
  };

  useEffect(() => {
    if (user) {
      loadBranches();
    }
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectBranch = (branchId: string) => {
    if (!branchId || branchId === selectedBranchId) {
      setIsOpen(false);
      return;
    }
    setSelectedBranchId(branchId);
    localStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
    clearAllApiCache();
    setIsOpen(false);

    window.dispatchEvent(new CustomEvent('branchScopeChanged', { detail: { branchId } }));
    window.location.reload();
  };

  const handleOpenCreateModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setNewCode('');
    setNewName('');
    setNewCity('');
    setNewAddress('');
    setNewIsDefault(branches.length === 0);
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      setCreateError('Branch Code and Branch Name are required');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const created = await companySettingsService.createBranch({
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        city: newCity.trim() || null,
        address: newAddress.trim() || null,
        isDefault: newIsDefault,
      });

      setShowCreateModal(false);
      clearAllApiCache();

      // Refresh branches list and switch to the newly created branch
      const list = await companySettingsService.listBranches();
      const activeList = list.filter((b) => b.isActive !== false);
      setBranches(activeList);

      const createdId = created?.id || activeList.find((b) => b.code === newCode.trim().toUpperCase())?.id;
      if (createdId) {
        setSelectedBranchId(createdId);
        localStorage.setItem(ACTIVE_BRANCH_KEY, createdId);
        window.dispatchEvent(new CustomEvent('branchScopeChanged', { detail: { branchId: createdId } }));
        window.location.reload();
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create branch. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  // 1. If not a Super Admin, show fixed badge of assigned branch
  if (!isGlobalAdmin) {
    if (!user?.branchId) return null;
    const userBranch = branches.find((b) => b.id === user.branchId);
    const branchLabel = userBranch ? `${userBranch.name} (${userBranch.code})` : 'Assigned Branch';

    return (
      <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
        <MapPin size={13} className="text-primary-600 dark:text-primary-400 shrink-0" />
        <span className="truncate max-w-[130px]">{branchLabel}</span>
      </div>
    );
  }

  // 2. Only Super Admin gets the interactive switcher & creation button
  const isAllBranches = selectedBranchId === 'ALL' || !selectedBranchId;
  const currentBranch = branches.find((b) => b.id === selectedBranchId);
  const currentLabel = isAllBranches
    ? 'All Branches'
    : currentBranch
    ? `${currentBranch.name} (${currentBranch.code})`
    : 'All Branches';

  return (
    <>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all shadow-xs border border-transparent bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700 dark:text-white"
          title="Super Admin: Switch Active Branch"
        >
          <span className="max-w-[140px] truncate">{currentLabel}</span>
          <ChevronDown size={12} className={cn("transition-transform duration-200 opacity-90 text-white", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute left-0 sm:right-0 sm:left-auto mt-1.5 w-64 rounded-xl bg-card border border-border shadow-xl py-1.5 z-50 text-xs">
            <div className="px-3 py-1.5 border-b border-border/60 text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Switch Branch</span>
              <span className="text-[9px] bg-primary/10 text-primary-600 font-semibold px-1.5 py-0.5 rounded">Super Admin</span>
            </div>

            {/* 1. All Branches option */}
            <div className="p-1 border-b border-border/50">
              <button
                type="button"
                onClick={() => handleSelectBranch('ALL')}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors",
                  isAllBranches
                    ? "bg-primary/10 text-primary-600 dark:text-primary-400 font-bold"
                    : "hover:bg-muted/70 text-foreground"
                )}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <div className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md",
                    isAllBranches ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <Building2 size={13} />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="font-semibold truncate">All Branches</span>
                    <span className="text-[10px] text-muted-foreground">Consolidated company-wide view</span>
                  </div>
                </div>
                {isAllBranches && <Check size={14} className="text-primary-600 dark:text-primary-400 shrink-0" />}
              </button>
            </div>

            {/* 2. Specific Branches List */}
            <div className="max-h-56 overflow-y-auto p-1 space-y-0.5">
              {branches.length === 0 ? (
                <div className="px-3 py-3 text-muted-foreground text-center">No branches configured</div>
              ) : (
                branches.map((b) => {
                  const isSelected = selectedBranchId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBranch(b.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary-600 dark:text-primary-400 font-bold"
                          : "hover:bg-muted/70 text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <div className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                          <Building2 size={13} />
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="truncate font-medium">{b.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {b.code} {b.city ? `• ${b.city}` : ''} {b.isDefault ? '• Default' : ''}
                          </span>
                        </div>
                      </div>
                      {isSelected && <Check size={14} className="text-primary-600 dark:text-primary-400 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Super Admin Action: Create New Branch */}
            <div className="p-1.5 border-t border-border/60 bg-muted/30">
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus size={13} />
                <span>Create New Branch</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create Branch Dialog Modal ── */}
      {showCreateModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => !createLoading && setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 text-foreground overflow-hidden animate-in zoom-in-95 duration-150 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary-600">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold">Create New Branch</h3>
                  <p className="text-xs text-muted-foreground">Add a new operational location for your company</p>
                </div>
              </div>
              <button
                type="button"
                disabled={createLoading}
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateBranch} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    Branch Code <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BR-DEL-01"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden uppercase font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    City <span className="text-muted-foreground font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Delhi, Bareilly"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Branch Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Connaught Place Office"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Address <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Street address, building, postal code..."
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-hidden resize-none text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="newIsDefault"
                  checked={newIsDefault}
                  onChange={(e) => setNewIsDefault(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
                <label htmlFor="newIsDefault" className="text-xs font-medium cursor-pointer">
                  Set as Default Branch
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/60">
                <button
                  type="button"
                  disabled={createLoading}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {createLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={13} />
                      <span>Create Branch</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default BranchSwitcher;
