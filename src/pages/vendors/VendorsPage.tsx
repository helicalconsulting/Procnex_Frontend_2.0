import React, { useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { companySettingsService, type Category } from '../../services/companySettingsService';
import PhoneInput from '../../components/shared/PhoneInput';
import type { VendorTableRow } from '../../types/viewModels';
import { useAuth } from '../../context/AuthContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { COUNTRY_CODES } from '../../config/countryCodes';
import {
  Search, Plus, Users, UserCheck, UserX, Eye, Edit3, Trash2, X, ShieldOff,
  Mail, Phone, Globe, MapPin, Building2, ChevronLeft, ChevronRight, ChevronDown,
  Filter, LayoutList, LayoutGrid, Send, Key, Star, Award,
  ShieldCheck, CheckCircle2, Activity, BarChart3, FileCheck, AlertTriangle, PieChart,
  Maximize2, Minimize2,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import FloatingMenu from '../../components/shared/FloatingMenu';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import '../../components/shared/ColumnCustomizer.css';
import './VendorsPage.css';



// ─── Column Definitions ─────────────────────────────────────

interface VendorColumnDef {
  key: string; label: string; defaultVisible: boolean; required?: boolean;
  width?: string; render: (v: VendorTableRow, fmtDate: (d: string) => string, toggle: (id: number) => void) => React.ReactNode;
}

const ALL_COLUMNS: VendorColumnDef[] = [
  {
    key: 'vendor', label: 'Vendor', defaultVisible: true, required: true, width: '220px',
    render: (v) => (
      <div className="vendors-table__vendor">
        <div className={`vendors-table__avatar vendors-table__avatar--${v.avatarMod}`}>{v.initials}</div>
        <div className="vendors-table__vendor-info">
          <span className="vendors-table__name">{v.name}</span>
          <span className="vendors-table__email">{v.email}</span>
        </div>
      </div>
    ),
  },
  { key: 'category', label: 'Category', defaultVisible: true, width: '140px', render: (v) => <span className="vendors-cat-badge">{v.category}</span> },
  { key: 'location', label: 'Location', defaultVisible: true, width: '130px', render: (v) => <span className="vendors-table__loc"><MapPin size={12} /> {v.location}</span> },
  { key: 'orders', label: 'Orders', defaultVisible: true, width: '80px', render: (v) => <span className="vendors-table__orders">{v.totalOrders}</span> },
  {
    key: 'score', label: 'Score', defaultVisible: true, width: '80px',
    render: (v) => {
      const score = v.overallScore;
      let color = 'var(--text-placeholder)'; // muted = no data
      if (score >= 90) color = 'var(--success-500)';
      else if (score >= 60) color = '#d97706';
      else if (score > 0) color = 'var(--danger-500)'; // poor but has data
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontWeight: 700,
          fontSize: 14,
          color,
        }}>
          <Star size={13} fill={color} style={{ opacity: score > 0 && score >= 60 ? 1 : 0.3 }} />
          {score > 0 ? `${score}%` : '—'}
        </span>
      );
    },
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: '110px',
    render: (v, _fd, toggle) => (
      <div className="vendors-status-toggle" onClick={(e) => { e.stopPropagation(); toggle(v.id); }}>
        <div className={`vendors-status-toggle__track ${v.isActive ? 'vendors-status-toggle__track--active' : ''}`}>
          <div className="vendors-status-toggle__knob" />
        </div>
        <span className={`vendors-status-toggle__label vendors-status-toggle__label--${v.isActive ? 'active' : 'inactive'}`}>
          {v.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    ),
  },
  { key: 'joined', label: 'Joined', defaultVisible: true, width: '110px', render: (v, fmtDate) => <span className="vendors-table__date">{fmtDate(v.createdAt)}</span> },
  // Extra
  { key: 'contact', label: 'Contact Person', defaultVisible: false, width: '140px', render: (v) => <span className="vendors-table__date">{v.contactPerson}</span> },
  { key: 'phone', label: 'Phone', defaultVisible: false, width: '140px', render: (v) => <span className="vendors-table__date">{v.phone}</span> },
  { key: 'website', label: 'Website', defaultVisible: false, width: '120px', render: (v) => <span className="vendors-table__date">{v.website}</span> },
];

// ─── Component ──────────────────────────────────────────────

export default function VendorsPage() {
  const { data: vendors, loading, error, reload } = useServiceData(
    () => vendorService.list(),
    [] as VendorTableRow[],
    [],
    { cacheTtlMs: 30000 }
  );

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'inactive' | 'top-rated'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const categoryFilterRef = useRef<HTMLDivElement>(null);
  const categoryFilterBtnRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const { data: categories } = useServiceData(
    () => companySettingsService.listCategories(),
    [] as Category[],
    [],
    { cacheTtlMs: 120000 }
  );

  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorTableRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorTableRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { hasPermission } = useAuth();
  const canCreateVendor = hasPermission('Vendors', 'canCreate');
  const [actionLoading, setActionLoading] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [detailVendor, setDetailVendor] = useState<VendorTableRow | null>(null);
  const [isFullScreenDetail, setIsFullScreenDetail] = useState(false);
  const [v360Tab, setV360Tab] = useState<'overview' | 'directory'>('overview');
  const [credentialsMsg, setCredentialsMsg] = useState<string | null>(null);
  const [credVendor, setCredVendor] = useState<VendorTableRow | null>(null);
  const [credLoading, setCredLoading] = useState(false);
  const anyModalOpen = !!(showModal || deleteTarget || detailVendor || credVendor);
  useBodyScrollLock(anyModalOpen);

  const perPage = 8;

  const openCredentialsModal = useCallback((vendor: VendorTableRow) => {
    if (!vendor.isActive) {
      setCredentialsMsg('Only active (approved) vendors can receive a password setup link.');
      setTimeout(() => setCredentialsMsg(null), 5000);
      return;
    }
    setCredVendor(vendor);
    setCredentialsMsg(null);
  }, []);

  const closeCredentialsModal = useCallback(() => {
    setCredVendor(null);
    setCredLoading(false);
  }, []);

  const handleResendPasswordSetup = useCallback(async () => {
    if (!credVendor) return;
    setCredLoading(true);
    setCredentialsMsg(null);
    try {
      const result = await vendorService.resendPasswordSetup(credVendor.id);
      setCredentialsMsg(
        result.emailSent
          ? `Password setup link emailed to ${credVendor.email}. The vendor chooses their own password.`
          : 'Failed to send setup email. Check SMTP settings.'
      );
      if (result.emailSent) {
        reload();
        setTimeout(closeCredentialsModal, 2500);
      }
    } catch (err) {
      setCredentialsMsg(err instanceof Error ? err.message : 'Failed to send setup email');
    } finally {
      setCredLoading(false);
    }
  }, [credVendor, closeCredentialsModal]);

  // ── Column state ──
  const defaultOrder = ALL_COLUMNS.map((c) => c.key);
  const defaultVisible = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const visibleColumns = useMemo(() => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)), [columnOrder, visibleKeys]);
  const handleToggleColumn = (key: string) => { setVisibleKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
  const handleResetColumns = () => { setColumnOrder(defaultOrder); setVisibleKeys(new Set(defaultVisible)); };

  // Form state
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fCountryCode, setFCountryCode] = useState('+254');
  const [fPhone, setFPhone] = useState('');
  const [fContact, setFContact] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fCategoryId, setFCategoryId] = useState<string | undefined>(undefined);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [fLocation, setFLocation] = useState('');
  const [fWebsite, setFWebsite] = useState('');

  // Summary
  const summary = useMemo(() => ({
    total: vendors.length,
    active: vendors.filter((v) => v.isActive).length,
    inactive: vendors.filter((v) => !v.isActive).length,
  }), [vendors]);

  // Top rated count: vendors with overallScore >= 80
  const topRatedCount = useMemo(() => vendors.filter((v) => v.overallScore >= 80).length, [vendors]);

  const availableCategories = useMemo(() => {
    const names = new Set<string>();
    categories.filter((c) => c?.isActive).forEach((c) => {
      const cName = typeof c?.name === 'string' ? c.name : (c?.name ? String(c.name) : '');
      if (cName) names.add(cName);
    });
    vendors.forEach((v) => {
      const vCat = typeof v?.category === 'string' ? v.category : (v?.category ? String(v.category) : '');
      if (vCat) names.add(vCat);
    });
    return Array.from(names).sort((a, b) => String(a).localeCompare(String(b)));
  }, [categories, vendors]);

  const categoryCounts = useMemo(() => {
    let list = vendors;
    if (filterMode === 'active') list = list.filter((v) => v.isActive);
    else if (filterMode === 'inactive') list = list.filter((v) => !v.isActive);
    else if (filterMode === 'top-rated') list = list.filter((v) => v.overallScore >= 80);
    const counts: Record<string, number> = {};
    for (const v of list) {
      const cName = typeof v?.category === 'string' ? v.category : String(v?.category || 'General');
      counts[cName] = (counts[cName] || 0) + 1;
    }
    return counts;
  }, [vendors, filterMode]);

  // Category filter dropdown now uses FloatingMenu (no outside click handler needed)

  // Filter — summary filter, category, then search text
  const filtered = useMemo(() => {
    let list = vendors;
    if (filterMode === 'active') list = list.filter((v) => v.isActive);
    else if (filterMode === 'inactive') list = list.filter((v) => !v.isActive);
    else if (filterMode === 'top-rated') {
      list = list.filter((v) => v.overallScore >= 80);
      list = [...list].sort((a, b) => b.overallScore - a.overallScore);
    }
    if (categoryFilter) list = list.filter((v) => String(v.category || '') === categoryFilter);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (v) =>
        String(v.name || '').toLowerCase().includes(q) ||
        String(v.email || '').toLowerCase().includes(q) ||
        String(v.category || '').toLowerCase().includes(q) ||
        String(v.contactPerson || '').toLowerCase().includes(q) ||
        String(v.location || '').toLowerCase().includes(q)
    );
  }, [vendors, filterMode, categoryFilter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const queryClient = useQueryClient();

  const toggleActive = useCallback(async (id: number) => {
    const v = vendors.find((x) => x.id === id);
    if (!v) return;
    setPageMsg(null);

    const newActive = !v.isActive;

    // Optimistic update — update cache immediately so toggle feels instant
    queryClient.setQueriesData<VendorTableRow[]>(
      { queryKey: ['svc'], type: 'active' },
      (old) => {
        if (!old) return old;
        return old.map((vendor) =>
          vendor.id === id ? { ...vendor, isActive: newActive } : vendor
        );
      }
    );

    try {
      await vendorService.update(id, { isActive: newActive });
      reload(); // background refetch to sync with server
      // Also invalidate vendor cache for other pages (e.g. CreateRFQPage)
      queryClient.invalidateQueries({ queryKey: ['svc'] });
    } catch (err) {
      // Rollback on failure
      queryClient.setQueriesData<VendorTableRow[]>(
        { queryKey: ['svc'], type: 'active' },
        (old) => {
          if (!old) return old;
          return old.map((vendor) =>
            vendor.id === id ? { ...vendor, isActive: !newActive } : vendor
          );
        }
      );
      setPageMsg(err instanceof Error ? err.message : 'Could not update vendor status');
    }
  }, [vendors, reload, queryClient]);

  const openAddModal = useCallback(() => {
    setEditingVendor(null);
    setFName(''); setFEmail(''); setFCountryCode('+254'); setFPhone(''); setFContact('');
    setFCategory(''); setFCategoryId(undefined); setFLocation(''); setFWebsite('');
    setPageMsg(null);
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((vendor: VendorTableRow) => {
    setEditingVendor(vendor);
    setFName(vendor.name);
    setFEmail(vendor.email);
    // Parse country code from existing phone number
    const rawPhone = vendor.phone === '—' ? '' : vendor.phone;
    const matchedCc = COUNTRY_CODES.find((cc) => rawPhone.startsWith(cc.dial));
    if (matchedCc) {
      setFCountryCode(matchedCc.dial);
      setFPhone(rawPhone.slice(matchedCc.dial.length));
    } else {
      setFCountryCode('+254');
      setFPhone(rawPhone);
    }
    setFContact(vendor.contactPerson === vendor.name ? '' : vendor.contactPerson);
    // Try to find the categoryId from the loaded categories list
    const matchedCat = categories.find((c) => c.name === (vendor.category === 'General' ? '' : vendor.category));
    setFCategory(vendor.category === 'General' ? '' : vendor.category);
    setFCategoryId(matchedCat?.id);
    setFLocation(vendor.location === '—' ? '' : vendor.location);
    setFWebsite(vendor.website === '—' ? '' : vendor.website);
    setPageMsg(null);
    setShowModal(true);
  }, []);

  // Reliably focus the name input when the modal opens
  // useLayoutEffect fires synchronously after DOM commit, before browser paint
  // — this prevents the async delay that allowed focus to be stolen
  useLayoutEffect(() => {
    if (showModal && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showModal]);

  const closeFormModal = useCallback(() => {
    setShowModal(false);
    setEditingVendor(null);
  }, []);

  const handleSaveVendor = useCallback(async () => {
    if (!fName.trim() || !fEmail.trim()) return;
    setActionLoading(true);
    setPageMsg(null);
    try {
      if (editingVendor) {
        const updated = await vendorService.update(editingVendor.id, {
          name: fName.trim(),
          email: fEmail.trim(),
          phone: fPhone.trim() ? `${fCountryCode}${fPhone.trim()}` : '',
          contactPerson: fContact.trim(),
          category: fCategory.trim(),
          categoryId: fCategoryId,
          location: fLocation.trim(),
          website: fWebsite.trim(),
        });
        if (detailVendor?.id === editingVendor.id) setDetailVendor(updated);
        setPageMsg(`Vendor "${updated.name}" updated.`);
      } else {
        await vendorService.create({
          name: fName.trim(),
          email: fEmail.trim(),
          phone: fPhone.trim() ? `${fCountryCode}${fPhone.trim()}` : '',
          contactPerson: fContact.trim(),
          category: fCategory.trim(),
          categoryId: fCategoryId,
          location: fLocation.trim(),
          website: fWebsite.trim(),
        });
        setPageMsg(`Vendor created.`);
      }
      closeFormModal();
      reload();
      // Also invalidate vendor cache for other pages (e.g. CreateRFQPage)
      queryClient.invalidateQueries({ queryKey: ['svc'] });
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setActionLoading(false);
    }
  }, [editingVendor, fName, fEmail, fPhone, fContact, fCategory, fCategoryId, fLocation, fWebsite, detailVendor, closeFormModal, reload, queryClient]);

  const openDeleteModal = useCallback((vendor: VendorTableRow) => {
    setDeleteTarget(vendor);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    setDeleteError(null);
    setPageMsg(null);
    try {
      await vendorService.remove(deleteTarget.id);
      if (detailVendor?.id === deleteTarget.id) setDetailVendor(null);
      setPageMsg(`Vendor "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await reload();
      // Also invalidate vendor cache for other pages (e.g. CreateRFQPage)
      queryClient.invalidateQueries({ queryKey: ['svc'] });
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Delete failed';
      if (msg.includes('Route not found')) {
        msg =
          'Backend is running old code (no delete route). Stop it (Ctrl+C) and run: cd Heliflow_Client_Backend && npm run dev';
      } else if (msg.includes('Transaction already closed') || msg.includes('timeout')) {
        msg = 'Delete timed out (slow database). Please try again — it usually works on the second attempt.';
      } else if (msg.includes('purchase orders') || msg.includes('invoices') || msg.includes('contracts')) {
        msg = 'This vendor has purchase orders, invoices, or contracts. Turn off Active instead of deleting.';
      }
      setDeleteError(msg);
      setPageMsg(msg);
    } finally {
      setActionLoading(false);
    }
  }, [deleteTarget, detailVendor, reload]);

  const canSave = fName.trim() && fEmail.trim();

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="vendors-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {pageMsg && (
        <MessageStrip
          type={inferMessageType(pageMsg)}
          onClose={() => setPageMsg(null)}
          autoHideMs={5000}
        >
          {pageMsg}
        </MessageStrip>
      )}
      {credentialsMsg && (
        <MessageStrip
          type={inferMessageType(credentialsMsg)}
          onClose={() => setCredentialsMsg(null)}
          autoHideMs={6000}
        >
          {credentialsMsg}
        </MessageStrip>
      )}
      {loading && <div className="vendors-page__loading">Loading vendors…</div>}
      {/* Header */}
      <div className="vendors-page__header">
        <div className="vendors-page__header-left">
          <h1>Vendors</h1>
          <p>Manage vendor directory, track performance, and onboard new suppliers</p>
        </div>
        <button
          className={`vendors-page__add-btn ${!canCreateVendor ? 'vendors-page__add-btn--disabled' : ''}`}
          onClick={canCreateVendor ? openAddModal : undefined}
          title={!canCreateVendor ? 'You do not have permission to create vendors' : 'Add a new vendor'}
          disabled={!canCreateVendor}
        >
          {canCreateVendor ? <Plus size={18} /> : <ShieldOff size={18} />}
          Add Vendor
        </button>
      </div>

      {/* Summary — clickable filter cards */}
      <div className="vendors-summary">
        {[
          { icon: <Users size={22} />, val: summary.total, label: 'Total Vendors', cls: 'total', mode: 'all' as const },
          { icon: <UserCheck size={22} />, val: summary.active, label: 'Active', cls: 'active', mode: 'active' as const },
          { icon: <UserX size={22} />, val: summary.inactive, label: 'Inactive', cls: 'inactive', mode: 'inactive' as const },
          { icon: <Award size={22} />, val: topRatedCount, label: 'Top Rated', cls: 'top-rated', mode: 'top-rated' as const },
        ].map((c) => (
          <div
            key={c.cls}
            className={`vendors-summary-card ${filterMode === c.mode ? 'vendors-summary-card--active' : ''}`}
            onClick={() => {
              setFilterMode((prev) => prev === c.mode ? 'all' : c.mode);
              setCurrentPage(1);
            }}
          >
            <div className={`vendors-summary-card__icon vendors-summary-card__icon--${c.cls}`}>{c.icon}</div>
            <div className="vendors-summary-card__info">
              <span className="vendors-summary-card__value">{c.val}</span>
              <span className="vendors-summary-card__label">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="vendors-toolbar">
        <div className="vendors-toolbar__search">
          <Search size={16} className="vendors-toolbar__search-icon" />
          <input
            id="vendor-search-input"
            name="vendor_search_query"
            type="text"
            placeholder="Search by name, email, category, contact, or location..."
            autoComplete="off"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <div className="vendors-toolbar__right">
          <div className="vendors-category-filter" ref={categoryFilterRef}>              <button
                ref={categoryFilterBtnRef}
                type="button"
                className={`vendors-toolbar__filter ${categoryFilter ? 'vendors-toolbar__filter--active' : ''} ${categoryFilterOpen ? 'vendors-toolbar__filter--open' : ''}`}
                onClick={() => setCategoryFilterOpen((v) => !v)}
                aria-expanded={categoryFilterOpen}
                aria-haspopup="listbox"
              >
              <Filter size={14} />
              <span>{categoryFilter || 'Category'}</span>
              <ChevronDown size={14} className={`vendors-category-filter__chevron ${categoryFilterOpen ? 'vendors-category-filter__chevron--open' : ''}`} />
            </button>
            {/* Category filter dropdown — using FloatingMenu */}
            <FloatingMenu
              open={categoryFilterOpen}
              onClose={() => setCategoryFilterOpen(false)}
              anchorRef={categoryFilterBtnRef}
              className="vendors-category-filter__menu"
              options={{ placement: 'bottom-start', offset: 6, viewportPadding: 8 }}
              minWidth={220}
              animation="slide"
              role="listbox"
            >
              <button
                type="button"
                role="option"
                aria-selected={!categoryFilter}
                className={`vendors-category-filter__option ${!categoryFilter ? 'vendors-category-filter__option--active' : ''}`}
                onClick={() => { setCategoryFilter(''); setCategoryFilterOpen(false); setCurrentPage(1); }}
              >
                <span>All Categories</span>
                <span className="vendors-category-filter__count">
                  {Object.values(categoryCounts).reduce((sum, n) => sum + n, 0)}
                </span>
              </button>
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="option"
                  aria-selected={categoryFilter === cat}
                  className={`vendors-category-filter__option ${categoryFilter === cat ? 'vendors-category-filter__option--active' : ''}`}
                  onClick={() => { setCategoryFilter(cat); setCategoryFilterOpen(false); setCurrentPage(1); }}
                >
                  <span>{cat}</span>
                  <span className="vendors-category-filter__count">{categoryCounts[cat] || 0}</span>
                </button>
              ))}
              {availableCategories.length === 0 && (
                <div className="vendors-category-filter__empty">No categories configured</div>
              )}
            </FloatingMenu>
          </div>
          <div className="vendors-toolbar__view-toggle">
            <button className={`vendors-toolbar__view-btn ${view === 'table' ? 'vendors-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('table')} title="Table"><LayoutList size={16} /></button>
            <button className={`vendors-toolbar__view-btn ${view === 'card' ? 'vendors-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('card')} title="Cards"><LayoutGrid size={16} /></button>
          </div>
        </div>
      </div>

      {/* Content */}
      {paginated.length > 0 ? (
        view === 'table' ? (
          <div className="vendors-table-card">
            <div className="vendors-table-wrap">
              <table className="vendors-table" style={{ tableLayout: 'fixed', minWidth: '750px' }}>
                <colgroup>
                  {visibleColumns.map((col) => (<col key={col.key} style={{ width: col.width || 'auto' }} />))}
                  <col style={{ width: '110px' }} />
                </colgroup>
                <thead>
                  <tr>
                    {visibleColumns.map((col) => (<th key={col.key}>{col.label}</th>))}
                    <th>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>Actions</span>
                        <div className="col-btn-wrap">
                          <button ref={colBtnRef} className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`} onClick={() => setShowColPanel((v) => !v)} title="Customize columns" aria-label="Customize columns" aria-expanded={showColPanel}>
                            <span /><span /><span />
                          </button>
                          {showColPanel && (
                            <ColumnCustomizer columnOrder={columnOrder} visibleKeys={visibleKeys} allColumns={ALL_COLUMNS} onToggle={handleToggleColumn} onReorder={setColumnOrder} onReset={handleResetColumns} onClose={() => setShowColPanel(false)} anchorRef={colBtnRef} />
                          )}
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((v) => (
                    <tr key={v.id} className={`vendors-table__row vendors-table__row--${v.status ? v.status.toLowerCase() : (v.isActive ? 'active' : 'inactive')}`} onClick={() => setDetailVendor(v)}>
                      {visibleColumns.map((col) => (<td key={col.key}>{col.render(v, formatDate, toggleActive)}</td>))}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="vendors-table__actions">
                          <button className="vendors-table__action-btn" title="View profile" onClick={() => setDetailVendor(v)}><Eye size={15} /></button>
                          {v.isActive && canCreateVendor && (
                            <button
                              className="vendors-table__action-btn"
                              title="Resend password setup email"
                              onClick={() => openCredentialsModal(v)}
                            >
                              <Key size={15} />
                            </button>
                          )}
                          {canCreateVendor ? (
                            <button
                              className="vendors-table__action-btn"
                              title="Edit vendor"
                              onClick={() => openEditModal(v)}
                            >
                              <Edit3 size={15} />
                            </button>
                          ) : (
                            <button
                              className="vendors-table__action-btn vendors-table__action-btn--disabled"
                              title="You do not have permission to edit vendors"
                              disabled
                            >
                              <ShieldOff size={15} />
                            </button>
                          )}
                          {canCreateVendor ? (
                            <button
                              className="vendors-table__action-btn vendors-table__action-btn--danger"
                              title="Delete vendor"
                              onClick={() => openDeleteModal(v)}
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : (
                            <button
                              className="vendors-table__action-btn vendors-table__action-btn--disabled"
                              title="You do not have permission to delete vendors"
                              disabled
                            >
                              <ShieldOff size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > perPage && (
              <div className="vendors-pagination">
                <span className="vendors-pagination__info">Showing {(currentPage-1)*perPage+1}–{Math.min(currentPage*perPage, filtered.length)} of {filtered.length}</span>
                <div className="vendors-pagination__btns">
                  <button className="vendors-pagination__btn" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)}><ChevronLeft size={14} /></button>
                  {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                    <button key={p} className={`vendors-pagination__btn ${currentPage===p?'vendors-pagination__btn--active':''}`} onClick={()=>setCurrentPage(p)}>{p}</button>
                  ))}
                  <button className="vendors-pagination__btn" disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Card View */
          <div className="vendors-cards">
            {paginated.map((v) => (
              <div key={v.id} className="vendors-card" onClick={() => setDetailVendor(v)}>
                <div className="vendors-card__top">                    <div className={`vendors-card__avatar vendors-table__avatar--${v.avatarMod}`}>{v.initials}</div>
                    <div className="vendors-card__name-block">
                      <span className="vendors-card__name">{v.name}</span>
                      <span className="vendors-card__cat">{v.category}</span>
                    </div>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 12,
                      fontWeight: 700,
                      color: v.overallScore >= 90 ? 'var(--success-500)' : v.overallScore >= 60 ? '#d97706' : v.overallScore > 0 ? 'var(--danger-500)' : 'var(--text-placeholder)',
                      background: v.overallScore >= 90 ? 'rgba(16,126,62,0.1)' : v.overallScore >= 60 ? 'rgba(245,158,11,0.1)' : v.overallScore > 0 ? 'rgba(220,38,38,0.08)' : 'transparent',
                      padding: v.overallScore > 0 ? '3px 8px' : 0,
                      borderRadius: 8,
                      flexShrink: 0,
                    }}>
                      {v.overallScore > 0 ? (
                        <><Star size={11} fill="currentColor" style={{ opacity: v.overallScore >= 60 ? 1 : 0.4 }} />{v.overallScore}%</>
                      ) : (
                        <span style={{ fontSize: 11, opacity: 0.5 }}>—</span>
                      )}
                    </span>
                    <span className={`vendors-card__status-dot ${v.isActive ? 'vendors-card__status-dot--active' : ''}`} />
                </div>
                <div className="vendors-card__details">
                  <div className="vendors-card__detail"><Mail size={12} /><span>{v.email}</span></div>
                  <div className="vendors-card__detail"><MapPin size={12} /><span>{v.location}</span></div>
                </div>
                <div className="vendors-card__footer">
                  <div className="vendors-card__orders">{v.totalOrders} orders</div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="vendors-table-card">
          <div className="vendors-empty">
            <div className="vendors-empty__icon"><Users size={48} /></div>
            <div className="vendors-empty__title">No vendors found</div>
            <div className="vendors-empty__desc">
              {search
                ? 'Try adjusting your search.'
                : categoryFilter
                  ? `No vendors found in category "${categoryFilter}".`
                  : filterMode !== 'all'
                    ? `No ${filterMode === 'active' ? 'active' : filterMode === 'inactive' ? 'inactive' : filterMode === 'top-rated' ? 'top rated' : 'active'} vendors found.`
                    : 'Add your first vendor to get started.'}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Vendor Modal */}
      {showModal && (
        <div className="vendors-modal-backdrop" onClick={closeFormModal}>
          <div className="vendors-modal" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); if (canSave && !actionLoading) handleSaveVendor(); }}>
              <div className="vendors-modal__header">
                <span className="vendors-modal__title">
                  <Building2 size={20} /> {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
                </span>
                <button type="button" className="vendors-modal__close" onClick={closeFormModal}><X size={18} /></button>
              </div>
              <div className="vendors-modal__body">
                <div className="vendors-modal__field">
                  <label htmlFor="vendor-company-name" className="vendors-modal__label">Company Name <span>*</span></label>
                  <input
                    ref={nameInputRef}
                    id="vendor-company-name"
                    name="vendor_company_name"
                    className="vendors-modal__input"
                    placeholder="e.g. TechSupply Co."
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="vendors-modal__row">
                  <div className="vendors-modal__field">
                    <label htmlFor="vendor-email" className="vendors-modal__label"><Mail size={13} style={{marginRight:4}} /> Email <span>*</span></label>
                    <input
                      id="vendor-email"
                      name="vendor_email"
                      className="vendors-modal__input"
                      type="email"
                      placeholder="vendor@company.in"
                      value={fEmail}
                      onChange={(e) => setFEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="vendors-modal__field">
                    <label className="vendors-modal__label"><Phone size={13} style={{marginRight:4}} /> Phone</label>
                    <PhoneInput
                      countryCode={fCountryCode}
                      onCountryCodeChange={setFCountryCode}
                      value={fPhone}
                      onChange={setFPhone}
                      placeholder="Type your mobile number"
                    />
                  </div>
                </div>
                <div className="vendors-modal__row">
                  <div className="vendors-modal__field">
                    <label htmlFor="vendor-contact-person" className="vendors-modal__label">Contact Person</label>
                    <input
                      id="vendor-contact-person"
                      name="vendor_contact_person"
                      className="vendors-modal__input"
                      placeholder="e.g. Arun Mehta"
                      value={fContact}
                      onChange={(e) => setFContact(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="vendors-modal__field">
                    <label htmlFor="vendor-category" className="vendors-modal__label">Category</label>
                    <select
                      id="vendor-category"
                      name="vendor_category"
                      className="vendors-modal__select"
                      value={fCategory}
                      onChange={(e) => { setFCategory(e.target.value); const matched = categories.find(c => c.name === e.target.value); setFCategoryId(matched?.id); }}
                    >
                      <option value="">Select category</option>
                      {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="vendors-modal__row">
                  <div className="vendors-modal__field">
                    <label htmlFor="vendor-location" className="vendors-modal__label"><MapPin size={13} style={{marginRight:4}} /> Location</label>
                    <input
                      id="vendor-location"
                      name="vendor_location"
                      className="vendors-modal__input"
                      placeholder="e.g. Mumbai, MH"
                      value={fLocation}
                      onChange={(e) => setFLocation(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="vendors-modal__field">
                    <label htmlFor="vendor-website" className="vendors-modal__label"><Globe size={13} style={{marginRight:4}} /> Website</label>
                    <input
                      id="vendor-website"
                      name="vendor_website"
                      className="vendors-modal__input"
                      placeholder="e.g. company.in"
                      value={fWebsite}
                      onChange={(e) => setFWebsite(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
              {editingVendor && (
                <p style={{ margin: '0 20px 12px', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                  Vendor profile fields are saved to the system. Use the Active toggle in the table for portal access.
                </p>
              )}
              <div className="vendors-modal__footer">
                <button type="button" className="vendors-modal__btn vendors-modal__btn--secondary" onClick={closeFormModal}>Cancel</button>
                <button
                  type="submit"
                  className="vendors-modal__btn vendors-modal__btn--primary"
                  disabled={!canSave || actionLoading}
                >
                  <Building2 size={16} /> {actionLoading ? 'Saving…' : editingVendor ? 'Save changes' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="vendors-modal-backdrop" onClick={() => !actionLoading && setDeleteTarget(null)}>
          <div className="vendors-modal" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <div className="vendors-modal__header">
              <span className="vendors-modal__title"><Trash2 size={20} /> Delete vendor?</span>
              <button type="button" className="vendors-modal__close" disabled={actionLoading} onClick={() => setDeleteTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="vendors-modal__body">
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                Remove <strong>{deleteTarget.name}</strong> ({deleteTarget.email}) from the directory?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                Their quotations and RFQ invites will be removed. Vendors with purchase orders or invoices must be deactivated instead.
              </p>
              {deleteError && (
                <MessageStrip type="error" compact className="sap-message-strip--flush" style={{ marginTop: 14 }}>
                  {deleteError}
                </MessageStrip>
              )}
            </div>
            <div className="vendors-modal__footer">
              <button type="button" className="vendors-modal__btn vendors-modal__btn--secondary" disabled={actionLoading} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="vendors-modal__btn vendors-modal__btn--primary"
                style={{ background: '#dc2626' }}
                disabled={actionLoading}
                onClick={handleConfirmDelete}
              >
                <Trash2 size={16} /> {actionLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal — Vendor 360 Dashboard Layout */}
      {detailVendor && (() => {
        const hasEval = detailVendor.overallScore > 0 || detailVendor.totalOrders > 0;
        const overallRisk = hasEval ? Math.max(0, 100 - detailVendor.overallScore) : 0;

        const qualRisk = detailVendor.avgQuality > 0 ? Math.max(0, 100 - detailVendor.avgQuality) : 0;
        const delivRisk = detailVendor.avgDelivery > 0 ? Math.max(0, 100 - detailVendor.avgDelivery) : 0;
        const priceRisk = detailVendor.avgPriceScore > 0 ? Math.max(0, 100 - detailVendor.avgPriceScore) : 0;
        const compRisk = (detailVendor.gstNumber && detailVendor.panNumber) ? 0 : (detailVendor.gstNumber || detailVendor.panNumber) ? 50 : 100;
        const bankRisk = (detailVendor.bankName && detailVendor.bankAccountNumber) ? 0 : detailVendor.bankName ? 50 : 100;
        const portalRisk = detailVendor.isActive ? 0 : 100;

        return (
        <div className="vendors-modal-backdrop" onClick={() => { setDetailVendor(null); setIsFullScreenDetail(false); }}>
          <div
            className={`vendors-modal vendors-modal--detail-v360 ${isFullScreenDetail ? 'vendors-modal--fullscreen' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top 360 Header Banner */}
            <div className="v360-header">
              {/* Row 1: Identity & Top Right Controls */}
              <div className="v360-header__row1">
                <div className="v360-header__identity">
                  <div className={`v360-avatar vendors-table__avatar--${detailVendor.avatarMod}`}>
                    {detailVendor.initials}
                  </div>
                  <div className="v360-identity__info">
                    <div className="v360-identity__subtitle">
                      SUPPLIER RELATIONSHIP · VENDOR 360
                    </div>
                    <div className="v360-identity__title-row">
                      <h2 className="v360-identity__title">{detailVendor.name}</h2>
                      <span className={`v360-tag v360-tag--tier ${detailVendor.overallScore >= 80 ? 'v360-tag--gold' : 'v360-tag--blue'}`}>
                        {!hasEval ? 'NEW SUPPLIER' : detailVendor.overallScore >= 80 ? 'STRATEGIC TIER' : detailVendor.overallScore >= 60 ? 'PREFERRED TIER' : 'STANDARD TIER'}
                      </span>
                      <span className={`v360-tag v360-tag--risk ${!hasEval ? 'v360-tag--blue' : overallRisk <= 25 ? 'v360-tag--low' : overallRisk <= 50 ? 'v360-tag--med' : 'v360-tag--high'}`}>
                        {!hasEval ? 'RISK: UNTESTED' : overallRisk <= 25 ? 'RISK: LOW' : overallRisk <= 50 ? 'RISK: MED' : 'RISK: HIGH'}
                      </span>
                      <span className="v360-identity__meta">
                        VN-{String(detailVendor.id).length > 10 ? String(detailVendor.id).slice(-8).toUpperCase() : String(detailVendor.id).padStart(5, '0')} · Joined {formatDate(detailVendor.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="v360-actions">
                  <button
                    type="button"
                    className="v360-action-btn"
                    onClick={() => setIsFullScreenDetail((prev) => !prev)}
                    title={isFullScreenDetail ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullScreenDetail ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                  <button
                    type="button"
                    className="v360-action-btn v360-action-btn--close"
                    onClick={() => { setDetailVendor(null); setIsFullScreenDetail(false); }}
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Row 2: Metrics Strip (Gauge & KPIs) */}
              <div className="v360-header__row2">
                <div className="v360-gauge-box">
                  <div className={`v360-gauge-ring ${!hasEval ? 'v360-gauge-ring--med' : detailVendor.overallScore >= 80 ? 'v360-gauge-ring--high' : detailVendor.overallScore >= 60 ? 'v360-gauge-ring--med' : 'v360-gauge-ring--low'}`}>
                    <span className="v360-gauge-score">{detailVendor.overallScore > 0 ? detailVendor.overallScore : '0'}</span>
                  </div>
                  <div className="v360-gauge-info">
                    <span className="v360-gauge-title">
                      {!hasEval ? 'New Vendor' : detailVendor.overallScore >= 80 ? 'Strategic Partner' : detailVendor.overallScore >= 60 ? 'Active Supplier' : 'Standard Supplier'}
                    </span>
                    <span className="v360-gauge-subtitle">Composite Score</span>
                  </div>
                </div>

                <div className="v360-kpi-strip">
                  <div className="v360-kpi-item">
                    <span className="v360-kpi-val">{detailVendor.totalOrders}</span>
                    <span className="v360-kpi-lbl">TOTAL ORDERS</span>
                  </div>
                  <div className="v360-kpi-item">
                    <span className="v360-kpi-val">{detailVendor.avgQuality > 0 ? `${detailVendor.avgQuality}%` : '—'}</span>
                    <span className="v360-kpi-lbl">QUALITY</span>
                  </div>
                  <div className="v360-kpi-item">
                    <span className="v360-kpi-val">{detailVendor.avgDelivery > 0 ? `${detailVendor.avgDelivery}%` : '—'}</span>
                    <span className="v360-kpi-lbl">DELIVERY</span>
                  </div>
                  <div className="v360-kpi-item">
                    <span className="v360-kpi-val">{detailVendor.avgPriceScore > 0 ? `${detailVendor.avgPriceScore}%` : '—'}</span>
                    <span className="v360-kpi-lbl">PRICE SCORE</span>
                  </div>
                  <div className="v360-kpi-item">
                    <span className="v360-kpi-val" style={{ color: !hasEval ? 'var(--text-secondary)' : overallRisk <= 25 ? '#10b981' : overallRisk <= 50 ? '#f59e0b' : '#ef4444' }}>
                      {hasEval ? `${overallRisk}/100` : '—'}
                    </span>
                    <span className="v360-kpi-lbl">RISK SCORE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Header Horizontal Tab Navigation */}
            <div className="v360-tab-bar">
              <button
                type="button"
                className={`v360-tab-btn ${v360Tab === 'overview' ? 'v360-tab-btn--active' : ''}`}
                onClick={() => setV360Tab('overview')}
              >
                <PieChart size={14} />
                <span>Evaluation & Risk Overview</span>
              </button>
              <button
                type="button"
                className={`v360-tab-btn ${v360Tab === 'directory' ? 'v360-tab-btn--active' : ''}`}
                onClick={() => setV360Tab('directory')}
              >
                <Building2 size={14} />
                <span>Banking, Performance & Directory</span>
              </button>
            </div>

            {/* Dashboard Scroll Body */}
            <div className="v360-body">
              {v360Tab === 'overview' ? (
                /* Tab 1: Evaluation & Risk Overview (Score Pie Chart, Risk Dashboard, Compliance Grid) */
                <div className="v360-grid v360-grid--3col">
                  
                  {/* Card 1: Donut Pie Chart Score Breakdown */}
                  <div className="v360-card">
                    <div className="v360-card__header">
                      <PieChart size={15} /> Score Breakdown (Weight Breakdown)
                      <span className="v360-badge v360-badge--green">{detailVendor.overallScore}/100</span>
                    </div>
                    <div className="v360-card__body">
                      <div className="v360-pie-layout">
                        {/* SVG Donut Chart */}
                        <div className="v360-pie-chart-wrap">
                          <svg viewBox="0 0 42 42" className="v360-pie-svg">
                            <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="var(--border)" strokeWidth="4.5" />
                            {(() => {
                              const quality = detailVendor.avgQuality || 0;
                              const delivery = detailVendor.avgDelivery || 0;
                              const price = detailVendor.avgPriceScore || 0;
                              const tax = (detailVendor.gstNumber && detailVendor.panNumber) ? 100 : (detailVendor.gstNumber || detailVendor.panNumber) ? 50 : 0;
                              const bank = (detailVendor.bankName && detailVendor.bankAccountNumber) ? 100 : detailVendor.bankName ? 50 : 0;

                              const items = [
                                { weight: 30, color: '#6366f1' },
                                { weight: 30, color: '#10b981' },
                                { weight: 20, color: '#f59e0b' },
                                { weight: 10, color: '#ec4899' },
                                { weight: 10, color: '#06b6d4' },
                              ];

                              let accum = 0;
                              return items.map((item, idx) => {
                                const dash = `${item.weight} ${100 - item.weight}`;
                                const offset = 100 - accum + 25;
                                accum += item.weight;
                                return (
                                  <circle
                                    key={idx}
                                    cx="21"
                                    cy="21"
                                    r="15.9155"
                                    fill="transparent"
                                    stroke={item.color}
                                    strokeWidth="4.5"
                                    strokeDasharray={dash}
                                    strokeDashoffset={offset}
                                  />
                                );
                              });
                            })()}
                            <text x="21" y="20" className="v360-pie-center-val" textAnchor="middle">
                              {detailVendor.overallScore > 0 ? detailVendor.overallScore : '0'}
                            </text>
                            <text x="21" y="26" className="v360-pie-center-lbl" textAnchor="middle">
                              SCORE
                            </text>
                          </svg>
                        </div>

                        {/* Pie Chart Legend & Scores */}
                        <div className="v360-pie-legend">
                          {[
                            { label: 'Quality Rating', score: detailVendor.avgQuality, color: '#6366f1', weight: '30%' },
                            { label: 'Delivery Performance', score: detailVendor.avgDelivery, color: '#10b981', weight: '30%' },
                            { label: 'Price Competitiveness', score: detailVendor.avgPriceScore, color: '#f59e0b', weight: '20%' },
                            { label: 'Tax Compliance', score: (detailVendor.gstNumber && detailVendor.panNumber) ? 100 : (detailVendor.gstNumber || detailVendor.panNumber) ? 50 : 0, color: '#ec4899', weight: '10%' },
                            { label: 'Banking Onboarding', score: (detailVendor.bankName && detailVendor.bankAccountNumber) ? 100 : detailVendor.bankName ? 50 : 0, color: '#06b6d4', weight: '10%' },
                          ].map((item) => (
                            <div key={item.label} className="v360-pie-legend-item">
                              <span className="v360-pie-dot" style={{ background: item.color }} />
                              <span className="v360-pie-label">{item.label}</span>
                              <span className="v360-pie-val">{item.score > 0 ? `${item.score}%` : 'N/A'}</span>
                              <span className="v360-pie-weight">({item.weight})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Risk Dashboard */}
                  <div className="v360-card">
                    <div className="v360-card__header">
                      <ShieldCheck size={15} /> Risk Dashboard
                      <span className={`v360-badge ${!hasEval ? 'v360-badge--blue' : overallRisk <= 25 ? 'v360-badge--green' : 'v360-badge--warn'}`}>
                        {!hasEval ? 'Untested' : overallRisk <= 25 ? 'Low Risk' : overallRisk <= 50 ? 'Medium Risk' : 'High Risk'} ({hasEval ? `${overallRisk}/100` : 'No Orders'})
                      </span>
                    </div>
                    <div className="v360-card__body">
                      <div className="v360-risk-list">
                        {[
                          { label: 'Quality Defect Risk', level: qualRisk, evaluated: detailVendor.avgQuality > 0 },
                          { label: 'Late Delivery Risk', level: delivRisk, evaluated: detailVendor.avgDelivery > 0 },
                          { label: 'Price Variance Risk', level: priceRisk, evaluated: detailVendor.avgPriceScore > 0 },
                          { label: 'Tax Compliance Risk', level: compRisk, evaluated: true },
                          { label: 'Banking Setup Risk', level: bankRisk, evaluated: true },
                          { label: 'Portal Access Risk', level: portalRisk, evaluated: true },
                        ].map((r) => (
                          <div key={r.label} className="v360-risk-item">
                            <span className="v360-risk-label">{r.label}</span>
                            <div className="v360-risk-bar-track">
                              <div
                                className="v360-risk-bar-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(0, r.level))}%`,
                                  background: !r.evaluated ? 'var(--border)' : r.level > 50 ? '#ef4444' : r.level > 25 ? '#f59e0b' : '#10b981',
                                }}
                              />
                            </div>
                            <span className="v360-risk-val">
                              <strong>{r.evaluated ? `${r.level}%` : 'N/A'}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Tax & Compliance Checklist (Compact 2-Column Grid) */}
                  <div className="v360-card">
                    <div className="v360-card__header">
                      <FileCheck size={15} /> Tax & Compliance Checklist
                      <span className="v360-badge v360-badge--green">
                        {(detailVendor.gstNumber && detailVendor.panNumber && detailVendor.bankName) ? 'Verified' : 'Incomplete'}
                      </span>
                    </div>
                    <div className="v360-card__body">
                      <div className="v360-checklist v360-checklist--2col">
                        {[
                          { label: 'GST Registration', sub: detailVendor.gstNumber ? `GST: ${detailVendor.gstNumber}` : 'Not Provided', status: detailVendor.gstNumber ? 'valid' : 'invalid' },
                          { label: 'PAN Registration', sub: detailVendor.panNumber ? `PAN: ${detailVendor.panNumber}` : 'Not Provided', status: detailVendor.panNumber ? 'valid' : 'invalid' },
                          { label: 'Bank Name', sub: detailVendor.bankName ? detailVendor.bankName : 'Not Provided', status: detailVendor.bankName ? 'valid' : 'invalid' },
                          { label: 'Bank Account Number', sub: detailVendor.bankAccountNumber ? `Account: ${detailVendor.bankAccountNumber}` : 'Not Provided', status: detailVendor.bankAccountNumber ? 'valid' : 'invalid' },
                          { label: 'Bank IFSC Code', sub: detailVendor.bankIfscCode ? `IFSC: ${detailVendor.bankIfscCode}` : 'Not Provided', status: detailVendor.bankIfscCode ? 'valid' : 'invalid' },
                          { label: 'Portal Access', sub: detailVendor.isActive ? 'Active Vendor Account' : 'Inactive Account', status: detailVendor.isActive ? 'valid' : 'warn' },
                          { label: 'Contact Info', sub: (detailVendor.email && detailVendor.phone) ? 'Email & Phone On File' : 'Incomplete', status: (detailVendor.email && detailVendor.phone) ? 'valid' : 'warn' },
                          { label: 'Address Info', sub: detailVendor.address ? detailVendor.address : 'Not Provided', status: detailVendor.address ? 'valid' : 'warn' },
                        ].map((item) => (
                          <div key={item.label} className="v360-check-item">
                            {item.status === 'valid' ? (
                              <CheckCircle2 size={15} className="v360-icon--valid" />
                            ) : item.status === 'warn' ? (
                              <AlertTriangle size={15} className="v360-icon--warn" />
                            ) : (
                              <X size={15} className="v360-icon--invalid" />
                            )}
                            <div className="v360-check-text">
                              <span className="v360-check-label">{item.label}</span>
                              <span className="v360-check-sub">{item.sub}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                /* Tab 2: Banking, Performance & Directory Details */
                <div className="v360-grid v360-grid--3col">
                  
                  {/* Card 4: Banking & Financial Details */}
                  <div className="v360-card">
                    <div className="v360-card__header">
                      <Building2 size={15} /> Banking & System Details
                      <span className="v360-badge v360-badge--blue">
                        {detailVendor.bankName ? 'Banking Configured' : 'Pending Banking'}
                      </span>
                    </div>
                    <div className="v360-card__body">
                      <div className="v360-fin-summary">
                        <div className="v360-fin-kpi">
                          <span className="v360-fin-kpi__val">{detailVendor.totalOrders}</span>
                          <span className="v360-fin-kpi__lbl">Orders</span>
                        </div>
                        <div className="v360-fin-kpi">
                          <span className="v360-fin-kpi__val">{detailVendor.avgQuality > 0 ? `${detailVendor.avgQuality}%` : '—'}</span>
                          <span className="v360-fin-kpi__lbl">Quality</span>
                        </div>
                        <div className="v360-fin-kpi">
                          <span className="v360-fin-kpi__val">{detailVendor.avgDelivery > 0 ? `${detailVendor.avgDelivery}%` : '—'}</span>
                          <span className="v360-fin-kpi__lbl">Delivery</span>
                        </div>
                        <div className="v360-fin-kpi">
                          <span className="v360-fin-kpi__val">{detailVendor.avgPriceScore > 0 ? `${detailVendor.avgPriceScore}%` : '—'}</span>
                          <span className="v360-fin-kpi__lbl">Price Score</span>
                        </div>
                      </div>

                      <div className="v360-bank-section">
                        <div className="v360-sub-title">BANKING INFORMATION</div>
                        <div className="v360-detail-grid">
                          <div className="v360-detail-item">
                            <span className="v360-detail-lbl">Bank Name</span>
                            <span className="v360-detail-val">{detailVendor.bankName || '—'}</span>
                          </div>
                          <div className="v360-detail-item">
                            <span className="v360-detail-lbl">Branch</span>
                            <span className="v360-detail-val">{detailVendor.bankBranch || '—'}</span>
                          </div>
                          <div className="v360-detail-item">
                            <span className="v360-detail-lbl">Account No.</span>
                            <span className="v360-detail-val">{detailVendor.bankAccountNumber || '—'}</span>
                          </div>
                          <div className="v360-detail-item">
                            <span className="v360-detail-lbl">IFSC Code</span>
                            <span className="v360-detail-val">{detailVendor.bankIfscCode || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Performance KPI Scorecard */}
                  <div className="v360-card">
                    <div className="v360-card__header">
                      <Activity size={15} /> Performance Scorecard
                      <span className="v360-badge v360-badge--green">{hasEval ? `${detailVendor.overallScore}% Overall` : 'No Eval'}</span>
                    </div>
                    <div className="v360-card__body" style={{ padding: 0 }}>
                      <table className="v360-kpi-table">
                        <thead>
                          <tr>
                            <th>METRIC</th>
                            <th>SCORE</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { kpi: 'Quality Score', score: detailVendor.avgQuality > 0 ? `${detailVendor.avgQuality}%` : '—', val: detailVendor.avgQuality },
                            { kpi: 'Delivery Performance', score: detailVendor.avgDelivery > 0 ? `${detailVendor.avgDelivery}%` : '—', val: detailVendor.avgDelivery },
                            { kpi: 'Price Competitiveness', score: detailVendor.avgPriceScore > 0 ? `${detailVendor.avgPriceScore}%` : '—', val: detailVendor.avgPriceScore },
                            { kpi: 'Overall Performance', score: detailVendor.overallScore > 0 ? `${detailVendor.overallScore}%` : '—', val: detailVendor.overallScore },
                          ].map((row) => {
                            const statusText = row.val >= 80 ? 'Exceeds' : row.val >= 60 ? 'Meets' : row.val > 0 ? 'Under' : 'No Data';
                            return (
                              <tr key={row.kpi}>
                                <td><strong>{row.kpi}</strong></td>
                                <td>{row.score}</td>
                                <td>
                                  <span className={`v360-pill ${row.val >= 80 ? 'v360-pill--success' : row.val >= 60 ? 'v360-badge--warn' : 'v360-badge--blue'}`}>
                                    {statusText}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Card 6: Contact Information & Directory */}
                  <div className="v360-card">
                    <div className="v360-card__header">
                      <Mail size={15} /> Contact & Directory Details
                      <span className={`v360-badge ${detailVendor.isActive ? 'v360-badge--green' : 'v360-badge--warn'}`}>
                        {detailVendor.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="v360-card__body">
                      <div className="v360-detail-grid">
                        <div className="v360-detail-item">
                          <span className="v360-detail-lbl">Email</span>
                          <span className="v360-detail-val">{detailVendor.email}</span>
                        </div>
                        <div className="v360-detail-item">
                          <span className="v360-detail-lbl">Phone</span>
                          <span className="v360-detail-val">{detailVendor.phone}</span>
                        </div>
                        <div className="v360-detail-item">
                          <span className="v360-detail-lbl">Contact Person</span>
                          <span className="v360-detail-val">{detailVendor.contactPerson}</span>
                        </div>
                        <div className="v360-detail-item">
                          <span className="v360-detail-lbl">Category</span>
                          <span className="v360-detail-val">{detailVendor.category}</span>
                        </div>
                        <div className="v360-detail-item">
                          <span className="v360-detail-lbl">Website</span>
                          <span className="v360-detail-val">{detailVendor.website}</span>
                        </div>
                        <div className="v360-detail-item">
                          <span className="v360-detail-lbl">Location</span>
                          <span className="v360-detail-val">{detailVendor.location}</span>
                        </div>
                        <div className="v360-detail-item" style={{ gridColumn: '1 / -1' }}>
                          <span className="v360-detail-lbl">Address</span>
                          <span className="v360-detail-val">{detailVendor.address || '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="vendors-modal__footer">
              <button
                className="vendors-modal__btn vendors-modal__btn--secondary"
                onClick={() => { setDetailVendor(null); setIsFullScreenDetail(false); }}
              >
                Close
              </button>
              {canCreateVendor ? (
                <button
                  className="vendors-modal__btn vendors-modal__btn--secondary"
                  onClick={() => {
                    openEditModal(detailVendor);
                    setDetailVendor(null);
                    setIsFullScreenDetail(false);
                  }}
                >
                  <Edit3 size={16} /> Edit Vendor
                </button>
              ) : (
                <button
                  className="vendors-modal__btn vendors-modal__btn--secondary"
                  disabled
                  title="You do not have permission to edit vendors"
                >
                  <ShieldOff size={16} /> Edit Vendor
                </button>
              )}
              {detailVendor.isActive && canCreateVendor && (
                <button
                  className="vendors-modal__btn vendors-modal__btn--primary"
                  onClick={() => {
                    openCredentialsModal(detailVendor);
                    setDetailVendor(null);
                    setIsFullScreenDetail(false);
                  }}
                >
                  <Send size={16} /> Password Setup Email
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Resend secure password setup link (vendor sets own password) */}
      {credVendor && (
        <div className="vendors-modal-backdrop" onClick={closeCredentialsModal}>
          <div className="vendors-modal" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <div className="vendors-modal__header">
              <span className="vendors-modal__title"><Key size={20} /> Portal access</span>
              <button className="vendors-modal__close" onClick={closeCredentialsModal}><X size={18} /></button>
            </div>
            <div className="vendors-modal__body">
              <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-secondary, #64748b)' }}>
                <strong>{credVendor.name}</strong> — send a secure link so the vendor can create their own password.
                Admins never see or store the vendor&apos;s password.
              </p>
              <div className="vendors-modal__field">
                <label className="vendors-modal__label">Login email</label>
                <input className="vendors-modal__input" value={credVendor.email} readOnly />
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                {credVendor.hasPortalCredentials
                  ? 'This vendor already has a portal password. Resending sends a new setup link (e.g. if they forgot it).'
                  : credVendor.passwordSetupPending
                    ? 'A setup link was already sent and is still valid. You can resend if they did not receive it.'
                    : 'On onboarding approval, a setup email is sent automatically. Use resend only if needed.'}
              </p>
              {credentialsMsg && credVendor && (
                <MessageStrip
                  type={inferMessageType(credentialsMsg)}
                  compact
                  className="sap-message-strip--flush"
                  style={{ marginTop: 10 }}
                >
                  {credentialsMsg}
                </MessageStrip>
              )}
            </div>
            <div className="vendors-modal__footer">
              <button className="vendors-modal__btn vendors-modal__btn--secondary" onClick={closeCredentialsModal}>Cancel</button>
              <button
                className="vendors-modal__btn vendors-modal__btn--primary"
                disabled={credLoading}
                onClick={handleResendPasswordSetup}
              >
                <Send size={16} /> {credLoading ? 'Sending…' : 'Send password setup link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
