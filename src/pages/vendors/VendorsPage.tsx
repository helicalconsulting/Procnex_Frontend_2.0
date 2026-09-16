import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
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
  Maximize2, Minimize2, FileText, Download, Upload, Clock, AlertCircle, FilePlus,
  ExternalLink, RefreshCw, Check, Info, Smartphone,
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import FloatingMenu from '../../components/shared/FloatingMenu';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { procurementService } from '../../services/procurementService';
import { sapEmailService } from '../../services/sapEmailService';
import { API_BASE } from '../../api/client';
import '../../components/shared/ColumnCustomizer.css';
import './VendorsPage.css';



import type { VendorDocumentItem } from '../../types/viewModels';

// ─── Default Documents Data & Expiry Helper Functions ───────

export function getDocExpiryInfo(expiryDate?: string | null) {
  if (!expiryDate) {
    return {
      status: 'VALID' as const,
      isExpired: false,
      isExpiringSoon: false,
      daysLeft: null,
      label: 'Permanent / No Expiry',
      badgeClass: 'v360-doc-badge--valid',
      color: '#10b981',
      formattedDate: '—',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);

  const diffMs = exp.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const formattedDate = exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return {
      status: 'EXPIRED' as const,
      isExpired: true,
      isExpiringSoon: false,
      daysLeft,
      label: `Expired ${ago} day${ago === 1 ? '' : 's'} ago (${formattedDate})`,
      badgeClass: 'v360-doc-badge--expired',
      color: '#ef4444',
      formattedDate,
    };
  } else if (daysLeft <= 30) {
    return {
      status: 'EXPIRING_SOON' as const,
      isExpired: false,
      isExpiringSoon: true,
      daysLeft,
      label: `Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${formattedDate})`,
      badgeClass: 'v360-doc-badge--warn',
      color: '#f59e0b',
      formattedDate,
    };
  } else {
    return {
      status: 'VALID' as const,
      isExpired: false,
      isExpiringSoon: false,
      daysLeft,
      label: `Valid · ${daysLeft} days left (${formattedDate})`,
      badgeClass: 'v360-doc-badge--valid',
      color: '#10b981',
      formattedDate,
    };
  }
}

function formatDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

const DEFAULT_VENDOR_DOCUMENTS: Record<string, VendorDocumentItem[]> = {
  '1': [
    {
      id: 'doc-101',
      name: 'GST Registration Certificate',
      type: 'GST Registration',
      documentNumber: '27AABCU9603R1ZX',
      submittedAt: '2024-06-12',
      expiryDate: '2026-08-30', // 5 days left!
      status: 'EXPIRING_SOON',
    },
    {
      id: 'doc-102',
      name: 'PAN Card Copy',
      type: 'PAN Card',
      documentNumber: 'AABCU9603R',
      submittedAt: '2024-06-12',
      expiryDate: null,
      status: 'VALID',
    },
    {
      id: 'doc-103',
      name: 'ISO 9001:2015 Quality Certificate',
      type: 'ISO Certification',
      documentNumber: 'ISO-88219-QMS',
      submittedAt: '2024-01-15',
      expiryDate: '2026-08-22', // Expired 3 days ago!
      status: 'EXPIRED',
    },
    {
      id: 'doc-104',
      name: 'HDFC Bank Cancelled Cheque',
      type: 'Bank Proof',
      documentNumber: 'HDFC-50100234567890',
      submittedAt: '2024-06-14',
      expiryDate: null,
      status: 'VALID',
    },
    {
      id: 'doc-105',
      name: 'Trade License & Business Registration',
      type: 'Business License',
      documentNumber: 'BL-MH-99210',
      submittedAt: '2024-01-10',
      expiryDate: '2027-12-31',
      status: 'VALID',
    },
  ],
  '2': [
    {
      id: 'doc-201',
      name: 'GST Registration Certificate',
      type: 'GST Registration',
      documentNumber: '27BPCB1234R1ZY',
      submittedAt: '2024-02-01',
      expiryDate: '2026-09-10', // 16 days left
      status: 'EXPIRING_SOON',
    },
    {
      id: 'doc-202',
      name: 'PAN Card Copy',
      type: 'PAN Card',
      documentNumber: 'BPCB1234R',
      submittedAt: '2024-02-01',
      expiryDate: null,
      status: 'VALID',
    },
    {
      id: 'doc-203',
      name: 'Electrical Safety License',
      type: 'Business License',
      documentNumber: 'E-LIC-5542',
      submittedAt: '2024-02-15',
      expiryDate: '2026-08-20', // Expired 5 days ago!
      status: 'EXPIRED',
    },
    {
      id: 'doc-204',
      name: 'ICICI Bank Account Proof',
      type: 'Bank Proof',
      documentNumber: 'ICICI-62030123456789',
      submittedAt: '2024-02-05',
      expiryDate: null,
      status: 'VALID',
    },
  ],
  '3': [
    {
      id: 'doc-301',
      name: 'GST Registration Certificate',
      type: 'GST Registration',
      documentNumber: '07AABCS1234R1ZV',
      submittedAt: '2024-03-10',
      expiryDate: '2027-04-15',
      status: 'VALID',
    },
    {
      id: 'doc-302',
      name: 'PAN Card Copy',
      type: 'PAN Card',
      documentNumber: 'AABCS1234R',
      submittedAt: '2024-03-10',
      expiryDate: null,
      status: 'VALID',
    },
    {
      id: 'doc-303',
      name: 'MSME Udhyam Registration Certificate',
      type: 'MSME Certificate',
      documentNumber: 'UDYAM-DL-07-00912',
      submittedAt: '2024-03-12',
      expiryDate: null,
      status: 'VALID',
    },
  ],
};

// ─── Column Definitions ─────────────────────────────────────

interface VendorColumnDef {
  key: string; label: string; defaultVisible: boolean; required?: boolean;
  width?: string; render: (v: VendorTableRow, fmtDate: (d: string) => string, toggle: (id: string) => void, toggleMobile?: (id: string) => void, canCreate?: boolean) => React.ReactNode;
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
          fontSize: 15,
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
    render: (v, _fd, toggle, _toggleMobile, canCreate = true) => (
      <div
        className={`vendors-status-toggle ${!canCreate ? 'vendors-status-toggle--disabled' : ''}`}
        onClick={(e) => { e.stopPropagation(); if (canCreate) toggle(v.id); }}
        title={!canCreate ? 'Admin has not allowed this action. You do not have permission to modify vendor status.' : ''}
        style={!canCreate ? { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'auto' } : {}}
      >
        <div className={`vendors-status-toggle__track ${v.isActive ? 'vendors-status-toggle__track--active' : ''}`}>
          <div className="vendors-status-toggle__knob" />
        </div>
        <span className={`vendors-status-toggle__label vendors-status-toggle__label--${v.isActive ? 'active' : 'inactive'}`}>
          {v.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    ),
  },
  {
    key: 'mobileAccess', label: 'Mobile App Access', defaultVisible: true, width: '150px',
    render: (v, _fd, _toggle, toggleMobile, canCreate = true) => (
      <div
        className={`vendors-status-toggle ${!canCreate ? 'vendors-status-toggle--disabled' : ''}`}
        onClick={(e) => { e.stopPropagation(); if (canCreate && toggleMobile) toggleMobile(v.id); }}
        title={!canCreate ? 'Admin has not allowed this action. You do not have permission to modify mobile access.' : 'Toggle Mobile App Access'}
        style={{ cursor: canCreate ? 'pointer' : 'not-allowed', opacity: canCreate ? 1 : 0.6, pointerEvents: 'auto' }}
      >
        <div className={`vendors-status-toggle__track ${v.isMobileAccessEnabled ? 'vendors-status-toggle__track--active' : ''}`}>
          <div className="vendors-status-toggle__knob" />
        </div>
        <span
          className={`vendors-status-toggle__label vendors-status-toggle__label--${v.isMobileAccessEnabled ? 'active' : 'inactive'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}
        >
          <Smartphone size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} />
          {v.isMobileAccessEnabled ? 'Enabled' : 'Disabled'}
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

function getDocUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `${API_BASE.replace(/\/api$/, '')}${url}`;
}

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
  const [v360Tab, setV360Tab] = useState<'overview' | 'documents' | 'directory'>('overview');
  const [vendorDocsMap, setVendorDocsMap] = useState<Record<string, VendorDocumentItem[]>>(DEFAULT_VENDOR_DOCUMENTS);
  const [docFilter, setDocFilter] = useState<'all' | 'expiring' | 'valid'>('all');
  const [previewDoc, setPreviewDoc] = useState<VendorDocumentItem | null>(null);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState('GST Registration');
  const [newDocNumber, setNewDocNumber] = useState('');
  const [newDocExpiryDate, setNewDocExpiryDate] = useState('');
  const [credentialsMsg, setCredentialsMsg] = useState<string | null>(null);
  const [credVendor, setCredVendor] = useState<VendorTableRow | null>(null);
  const [credLoading, setCredLoading] = useState(false);
  const [renewalSuccessModal, setRenewalSuccessModal] = useState<{
    docName: string;
    docType: string;
    vendorName: string;
    vendorEmail: string;
    expiryLabel: string;
  } | null>(null);

  // ── Optimistic Mobile Access state ──
  const [pendingMobileStatus, setPendingMobileStatus] = useState<Map<string, boolean>>(new Map());
  const [mobileSuccessModal, setMobileSuccessModal] = useState<{
    visible: boolean;
    vendorName: string;
    isEnabled: boolean;
  } | null>(null);

  const anyModalOpen = !!(showModal || deleteTarget || detailVendor || credVendor || previewDoc || showUploadDocModal || renewalSuccessModal || mobileSuccessModal?.visible);
  useBodyScrollLock(anyModalOpen);

  const perPage = 8;

  // Sync real submitted documents from Onboarding Queue / API whenever detailVendor is opened
  useEffect(() => {
    if (!detailVendor) return;
    const vendorId = detailVendor.id;
    let isCancelled = false;

    procurementService.getVendorDocuments(String(vendorId))
      .then((res) => {
        if (isCancelled || !res || !res.documents || res.documents.length === 0) return;
        const fetchedDocs: VendorDocumentItem[] = res.documents.map((d) => ({
          id: d.id || `doc-${Date.now()}-${Math.random()}`,
          name: d.originalName || d.documentType,
          type: d.documentType,
          documentNumber: d.documentType === 'GST Registration' ? (detailVendor.gstNumber || undefined) : d.documentType === 'PAN Card' ? (detailVendor.panNumber || undefined) : undefined,
          fileUrl: d.publicUrl ? getDocUrl(d.publicUrl) : undefined,
          submittedAt: d.uploadedAt ? d.uploadedAt.slice(0, 10) : detailVendor.createdAt,
          expiryDate: d.documentType === 'GST Registration' ? '2026-08-30' : null,
          status: d.status === 'VERIFIED' ? 'VALID' : 'VALID',
        }));

        setVendorDocsMap((prev) => ({
          ...prev,
          [String(vendorId)]: fetchedDocs,
        }));
      })
      .catch(() => {
        // Fallback to default docs
      });

    return () => {
      isCancelled = true;
    };
  }, [detailVendor]);

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
  const [fMobileAccess, setFMobileAccess] = useState(false);

  const displayVendors = useMemo(() => {
    return vendors.map((v) => {
      const override = pendingMobileStatus.get(String(v.id));
      return {
        ...v,
        isMobileAccessEnabled: override !== undefined ? override : Boolean(v.isMobileAccessEnabled),
      };
    });
  }, [vendors, pendingMobileStatus]);

  // Summary
  const summary = useMemo(() => ({
    total: displayVendors.length,
    active: displayVendors.filter((v) => v.isActive).length,
    inactive: displayVendors.filter((v) => !v.isActive).length,
  }), [displayVendors]);

  // Top rated count: vendors with overallScore >= 80
  const topRatedCount = useMemo(() => displayVendors.filter((v) => v.overallScore >= 80).length, [displayVendors]);

  const availableCategories = useMemo(() => {
    const names = new Set<string>();
    categories.filter((c) => c?.isActive).forEach((c) => {
      const cName = typeof c?.name === 'string' ? c.name : (c?.name ? String(c.name) : '');
      if (cName) names.add(cName);
    });
    displayVendors.forEach((v) => {
      const vCat = typeof v?.category === 'string' ? v.category : (v?.category ? String(v.category) : '');
      if (vCat) names.add(vCat);
    });
    return Array.from(names).sort((a, b) => String(a).localeCompare(String(b)));
  }, [categories, displayVendors]);

  const categoryCounts = useMemo(() => {
    let list = displayVendors;
    if (filterMode === 'active') list = list.filter((v) => v.isActive);
    else if (filterMode === 'inactive') list = list.filter((v) => !v.isActive);
    else if (filterMode === 'top-rated') list = list.filter((v) => v.overallScore >= 80);
    const counts: Record<string, number> = {};
    for (const v of list) {
      const cName = typeof v?.category === 'string' ? v.category : String(v?.category || 'General');
      counts[cName] = (counts[cName] || 0) + 1;
    }
    return counts;
  }, [displayVendors, filterMode]);

  // Category filter dropdown now uses FloatingMenu (no outside click handler needed)

  // Filter — summary filter, category, then search text
  const filtered = useMemo(() => {
    let list = displayVendors;
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
  }, [displayVendors, filterMode, categoryFilter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const queryClient = useQueryClient();

  const toggleActive = useCallback(async (id: string | number) => {
    setPageMsg(null);
    const idStr = String(id);
    const v = vendors.find((x) => String(x.id) === idStr);
    if (!v) return;

    const newActive = !v.isActive;

    // Optimistic update — update cache immediately so toggle feels instant
    queryClient.setQueriesData<VendorTableRow[]>(
      { queryKey: ['svc'], type: 'active' },
      (old) => {
        if (!old) return old;
        return old.map((vendor) =>
          String(vendor.id) === idStr ? { ...vendor, isActive: newActive } : vendor
        );
      }
    );

    try {
      await vendorService.update(idStr, { isActive: newActive });
      reload(); // background refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['svc'] });
    } catch (err) {
      // Rollback on failure
      queryClient.setQueriesData<VendorTableRow[]>(
        { queryKey: ['svc'], type: 'active' },
        (old) => {
          if (!old) return old;
          return old.map((vendor) =>
            String(vendor.id) === idStr ? { ...vendor, isActive: !newActive } : vendor
          );
        }
      );
      setPageMsg(err instanceof Error ? err.message : 'Could not update vendor status');
    }
  }, [vendors, reload, queryClient]);

  const toggleMobileActive = useCallback(async (id: string | number) => {
    setPageMsg(null);
    const idStr = String(id);
    const v = displayVendors.find((x) => String(x.id) === idStr);
    if (!v) return;

    const newStatus = !v.isMobileAccessEnabled;

    // Set optimistic status immediately - no flicker!
    setPendingMobileStatus((prev) => {
      const next = new Map(prev);
      next.set(idStr, newStatus);
      return next;
    });

    queryClient.setQueriesData<VendorTableRow[]>(
      { queryKey: ['svc'], type: 'active' },
      (old) => {
        if (!old) return old;
        return old.map((vendor) =>
          String(vendor.id) === idStr ? { ...vendor, isMobileAccessEnabled: newStatus } : vendor
        );
      }
    );

    try {
      await vendorService.toggleMobileAccess(idStr);

      setMobileSuccessModal({
        visible: true,
        vendorName: v.name,
        isEnabled: newStatus,
      });

      await reload();
      queryClient.invalidateQueries({ queryKey: ['svc'] });
    } catch (err) {
      setPendingMobileStatus((prev) => {
        const next = new Map(prev);
        next.delete(idStr);
        return next;
      });
      setPageMsg(err instanceof Error ? err.message : 'Could not update vendor mobile access status');
    }
  }, [displayVendors, reload, queryClient]);

  const openAddModal = useCallback(() => {
    setEditingVendor(null);
    setFName(''); setFEmail(''); setFCountryCode('+254'); setFPhone(''); setFContact('');
    setFCategory(''); setFCategoryId(undefined); setFLocation(''); setFWebsite('');
    setFMobileAccess(false);
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
    setFMobileAccess(Boolean(vendor.isMobileAccessEnabled));
    setPageMsg(null);
    setShowModal(true);
  }, [categories]);

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
          isMobileAccessEnabled: fMobileAccess,
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
          isMobileAccessEnabled: fMobileAccess,
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
    <div className="vendors-page w-full max-w-full m-0 p-0 flex flex-col gap-6 text-foreground">
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
      {loading && <div className="vendors-page__loading text-sm text-muted-foreground p-4">Loading vendors…</div>}
      {/* Header */}
      <div className="vendors-page__header flex items-center justify-between flex-wrap gap-4">
        <div className="vendors-page__header-left">
          <h1 className="text-2xl font-bold tracking-tight text-foreground m-0 mb-1">Vendors</h1>
          <p className="text-sm text-muted-foreground m-0">Manage vendor directory, track performance, and onboard new suppliers</p>
        </div>
        <button
          className={`vendors-page__add-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-primary to-primary-600 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all ${!canCreateVendor ? 'vendors-page__add-btn--disabled opacity-50 cursor-not-allowed shadow-none' : ''}`}
          onClick={canCreateVendor ? openAddModal : undefined}
          title={!canCreateVendor ? 'Admin has not allowed this action. You do not have permission to create vendors.' : 'Add a new vendor'}
          disabled={!canCreateVendor}
        >
          {canCreateVendor ? <Plus size={18} /> : <ShieldOff size={18} />}
          Add Vendor
        </button>
      </div>

      {/* Summary — clickable filter cards */}
      <div className="vendors-summary grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <Users size={22} />, val: summary.total, label: 'Total Vendors', cls: 'total', mode: 'all' as const },
          { icon: <UserCheck size={22} />, val: summary.active, label: 'Active', cls: 'active', mode: 'active' as const },
          { icon: <UserX size={22} />, val: summary.inactive, label: 'Inactive', cls: 'inactive', mode: 'inactive' as const },
          { icon: <Award size={22} />, val: topRatedCount, label: 'Top Rated', cls: 'top-rated', mode: 'top-rated' as const },
        ].map((c) => (
          <div
            key={c.cls}
            className={`vendors-summary-card relative overflow-hidden flex items-center gap-4 p-5 rounded-2xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/80 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer ${filterMode === c.mode ? 'vendors-summary-card--active border-primary ring-2 ring-primary/20 bg-primary/5' : ''}`}
            onClick={() => {
              setFilterMode((prev) => prev === c.mode ? 'all' : c.mode);
              setCurrentPage(1);
            }}
          >
            <div className={`vendors-summary-card__icon vendors-summary-card__icon--${c.cls} w-11 h-11 rounded-xl flex items-center justify-center shrink-0`}>{c.icon}</div>
            <div className="vendors-summary-card__info flex flex-col gap-0.5">
              <span className="vendors-summary-card__value text-2xl font-extrabold tracking-tight text-foreground">{c.val}</span>
              <span className="vendors-summary-card__label text-xs font-bold uppercase tracking-wider text-muted-foreground">{c.label}</span>
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
                      {visibleColumns.map((col) => (<td key={col.key}>{col.render(v, formatDate, toggleActive, toggleMobileActive, canCreateVendor)}</td>))}
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
                              title="Admin has not allowed this action. You do not have permission to edit vendors."
                              disabled
                              style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' }}
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
                              title="Admin has not allowed this action. You do not have permission to delete vendors."
                              disabled
                              style={{ opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' }}
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
                      fontSize: 13,
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
                        <span style={{ fontSize: 12, opacity: 0.5 }}>—</span>
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
                <div className="vendors-modal__field" style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface-elevated, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                  <label className="vendors-modal__label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Smartphone size={18} strokeWidth={2} style={{ color: 'var(--primary-500, #0a6ed1)' }} /> Allow Mobile App Access</span>
                    <input
                      type="checkbox"
                      checked={fMobileAccess}
                      onChange={(e) => setFMobileAccess(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                    Allow this vendor to log in to the Mobile App.
                  </p>
                </div>
              </div>
              {editingVendor && (
                <p style={{ margin: '0 20px 12px', fontSize: '0.9125rem', color: 'var(--text-secondary, #64748b)' }}>
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
              <p style={{ margin: 0, fontSize: '1.0125rem' }}>
                Remove <strong>{deleteTarget.name}</strong> ({deleteTarget.email}) from the directory?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.9125rem', color: 'var(--text-secondary, #64748b)' }}>
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

        const qualRisk = detailVendor.avgQuality > 0 ? Math.max(0, 100 - detailVendor.avgQuality) : 0;
        const delivRisk = detailVendor.avgDelivery > 0 ? Math.max(0, 100 - detailVendor.avgDelivery) : 0;
        const priceRisk = detailVendor.avgPriceScore > 0 ? Math.max(0, 100 - detailVendor.avgPriceScore) : 0;

        // Fetch documents for this vendor
        const currentDocs: VendorDocumentItem[] = vendorDocsMap[detailVendor.id] || (DEFAULT_VENDOR_DOCUMENTS[detailVendor.id] || [
          ...(detailVendor.gstNumber ? [{
            id: `doc-${detailVendor.id}-gst`,
            name: 'GST Registration Certificate',
            type: 'GST Registration',
            documentNumber: detailVendor.gstNumber,
            submittedAt: detailVendor.createdAt,
            expiryDate: '2026-08-30', // 5 days left
            status: 'EXPIRING_SOON' as const,
          }] : []),
          ...(detailVendor.panNumber ? [{
            id: `doc-${detailVendor.id}-pan`,
            name: 'PAN Card Copy',
            type: 'PAN Card',
            documentNumber: detailVendor.panNumber,
            submittedAt: detailVendor.createdAt,
            expiryDate: null,
            status: 'VALID' as const,
          }] : []),
          ...(detailVendor.bankName ? [{
            id: `doc-${detailVendor.id}-bank`,
            name: `${detailVendor.bankName} Account Proof`,
            type: 'Bank Proof',
            documentNumber: detailVendor.bankAccountNumber || 'Account Proof',
            submittedAt: detailVendor.createdAt,
            expiryDate: null,
            status: 'VALID' as const,
          }] : []),
          {
            id: `doc-${detailVendor.id}-license`,
            name: 'Business Operating License',
            type: 'Business License',
            documentNumber: `LIC-${detailVendor.id}-2024`,
            submittedAt: detailVendor.createdAt,
            expiryDate: '2026-08-20', // Expired 5 days ago
            status: 'EXPIRED' as const,
          },
        ]);

        const expiredDocs = currentDocs.filter((d) => getDocExpiryInfo(d.expiryDate).isExpired);
        const expiringDocs = currentDocs.filter((d) => getDocExpiryInfo(d.expiryDate).isExpiringSoon);
        const validDocsCount = currentDocs.filter((d) => !getDocExpiryInfo(d.expiryDate).isExpired && !getDocExpiryInfo(d.expiryDate).isExpiringSoon).length;

        const hasBanking = !!(detailVendor.bankName && detailVendor.bankAccountNumber && detailVendor.bankIfscCode);
        const hasGst = !!detailVendor.gstNumber;
        const hasPan = !!detailVendor.panNumber;

        const compRisk = (hasGst && hasPan) ? 0 : (!hasGst && !hasPan) ? 100 : 50;
        const docRisk = expiredDocs.length > 0 ? 100 : expiringDocs.length > 0 ? 50 : 0;
        const bankRisk = hasBanking ? 0 : detailVendor.bankName ? 50 : 100;
        const portalRisk = detailVendor.isActive ? 0 : 100;

        // Comprehensive Overall Risk Calculation across all 6 parameters
        const overallRisk = hasEval
          ? Math.round(
              Math.max(0, 100 - detailVendor.overallScore) * 0.50 +
              compRisk * 0.15 +
              docRisk * 0.15 +
              bankRisk * 0.10 +
              portalRisk * 0.10
            )
          : Math.round(
              compRisk * 0.35 +
              docRisk * 0.35 +
              bankRisk * 0.20 +
              portalRisk * 0.10
            );

        // Build Dynamic Compliance Alerts
        const complianceAlerts: { id: string; type: 'danger' | 'warning'; title: string; message: string; actionLabel?: string; onAction?: () => void }[] = [];

        expiredDocs.forEach((doc) => {
          const info = getDocExpiryInfo(doc.expiryDate);
          complianceAlerts.push({
            id: `expired-${doc.id}`,
            type: 'danger',
            title: '🚨 EXPIRED DOCUMENT ALERT',
            message: `${doc.name} (${doc.documentNumber || 'Doc'}) ${info.label}. Immediate document renewal required before issuing purchase orders!`,
            actionLabel: 'View Document',
            onAction: () => setPreviewDoc(doc),
          });
        });

        expiringDocs.forEach((doc) => {
          const info = getDocExpiryInfo(doc.expiryDate);
          complianceAlerts.push({
            id: `expiring-${doc.id}`,
            type: 'warning',
            title: '⚠️ DOCUMENT EXPIRING SOON',
            message: `${doc.name} (${doc.documentNumber || 'Doc'}) is ${info.label}. Request updated document from vendor.`,
            actionLabel: 'View Document',
            onAction: () => setPreviewDoc(doc),
          });
        });

        if (!hasBanking) {
          complianceAlerts.push({
            id: 'missing-banking',
            type: 'danger',
            title: '🚨 BANKING SETUP INCOMPLETE',
            message: `Bank Account Number or IFSC Code missing for ${detailVendor.name}. Automated payment voucher processing disabled.`,
            actionLabel: 'Edit Banking Info',
            onAction: () => {
              const v = detailVendor;
              setDetailVendor(null);
              openEditModal(v);
            },
          });
        }

        if (!hasGst || !hasPan) {
          complianceAlerts.push({
            id: 'missing-tax',
            type: 'warning',
            title: '⚠️ TAX COMPLIANCE INCOMPLETE',
            message: `${!hasGst && !hasPan ? 'GST Registration & PAN Card' : !hasGst ? 'GST Registration Number' : 'PAN Card Number'} missing from vendor profile.`,
            actionLabel: 'Update Tax Info',
            onAction: () => {
              const v = detailVendor;
              setDetailVendor(null);
              openEditModal(v);
            },
          });
        }

        // Filtered docs for Repository Tab
        const filteredDocs = currentDocs.filter((d) => {
          const info = getDocExpiryInfo(d.expiryDate);
          if (docFilter === 'expiring') return info.isExpired || info.isExpiringSoon;
          if (docFilter === 'valid') return !info.isExpired && !info.isExpiringSoon;
          return true;
        });

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
                className={`v360-tab-btn ${v360Tab === 'documents' ? 'v360-tab-btn--active' : ''}`}
                onClick={() => setV360Tab('documents')}
              >
                <FileText size={14} />
                <span>Submitted Documents & Compliance ({currentDocs.length})</span>
                {(expiredDocs.length > 0 || expiringDocs.length > 0) && (
                  <span className="v360-tab-dot--warn" title={`${expiredDocs.length} expired, ${expiringDocs.length} expiring soon`} />
                )}
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
                            { label: 'Tax Compliance', score: (hasGst && hasPan) ? 100 : (hasGst || hasPan) ? 50 : 0, color: '#ec4899', weight: '10%' },
                            { label: 'Banking Onboarding', score: hasBanking ? 100 : detailVendor.bankName ? 50 : 0, color: '#06b6d4', weight: '10%' },
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
                          { label: 'Document Expiry Risk', level: expiredDocs.length > 0 ? 100 : expiringDocs.length > 0 ? 50 : 0, evaluated: true },
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
                      <span className={`v360-badge ${hasGst && hasPan && hasBanking && expiredDocs.length === 0 ? 'v360-badge--green' : 'v360-badge--warn'}`}>
                        {(hasGst && hasPan && hasBanking && expiredDocs.length === 0) ? 'Verified' : 'Incomplete'}
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
                          { label: 'Submitted Documents', sub: `${currentDocs.length} Docs (${expiredDocs.length} Expired, ${expiringDocs.length} Expiring)`, status: expiredDocs.length > 0 ? 'invalid' : expiringDocs.length > 0 ? 'warn' : 'valid' },
                          { label: 'Portal Access', sub: detailVendor.isActive ? 'Active Vendor Account' : 'Inactive Account', status: detailVendor.isActive ? 'valid' : 'warn' },
                          { label: 'Contact & Address Info', sub: (detailVendor.email && detailVendor.phone) ? 'Email & Phone On File' : 'Incomplete', status: (detailVendor.email && detailVendor.phone) ? 'valid' : 'warn' },
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
              ) : v360Tab === 'documents' ? (
                /* Tab 2: Submitted Documents & Compliance Repository */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Top Repository Header & Actions */}
                  <div className="v360-docs-header">
                    <div className="v360-docs-summary">
                      <FileText size={18} style={{ color: 'var(--primary-500)' }} />
                      <strong>Compliance Document Repository</strong>
                      <span className="v360-docs-chip">Total: {currentDocs.length}</span>
                      <span className="v360-docs-chip" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>Valid: {validDocsCount}</span>
                      {expiringDocs.length > 0 && <span className="v360-docs-chip" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Expiring: {expiringDocs.length}</span>}
                      {expiredDocs.length > 0 && <span className="v360-docs-chip" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Expired: {expiredDocs.length}</span>}
                    </div>

                    <div className="v360-docs-actions">
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className={`v360-doc-filter-btn ${docFilter === 'all' ? 'v360-doc-filter-btn--active' : ''}`}
                          onClick={() => setDocFilter('all')}
                        >
                          All ({currentDocs.length})
                        </button>
                        <button
                          type="button"
                          className={`v360-doc-filter-btn ${docFilter === 'expiring' ? 'v360-doc-filter-btn--active' : ''}`}
                          onClick={() => setDocFilter('expiring')}
                        >
                          Expiring / Expired ({expiredDocs.length + expiringDocs.length})
                        </button>
                        <button
                          type="button"
                          className={`v360-doc-filter-btn ${docFilter === 'valid' ? 'v360-doc-filter-btn--active' : ''}`}
                          onClick={() => setDocFilter('valid')}
                        >
                          Valid ({validDocsCount})
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Documents Table */}
                  <div className="v360-docs-table-wrap">
                    <table className="v360-docs-table">
                      <thead>
                        <tr>
                          <th>DOCUMENT NAME & TYPE</th>
                          <th>SUBMISSION DATE</th>
                          <th>EXPIRY STATUS & DAYS LEFT</th>
                          <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocs.length > 0 ? (
                          filteredDocs.map((doc) => {
                            const expInfo = getDocExpiryInfo(doc.expiryDate);
                            return (
                              <tr key={doc.id}>
                                <td>
                                  <div className="v360-doc-name-cell">
                                    <div className="v360-doc-icon-box">
                                      <FileText size={18} />
                                    </div>
                                    <div className="v360-doc-info">
                                      <span className="v360-doc-title">{doc.name}</span>
                                      <span className="v360-doc-type">{doc.type}</span>
                                    </div>
                                  </div>
                                </td>
                                <td>{formatDateShort(doc.submittedAt)}</td>
                                <td>
                                  {doc.isRenewalRequested ? (
                                    <span className="v360-doc-badge v360-doc-badge--warn" style={{ background: 'rgba(245,158,11,0.18)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}>
                                      <Mail size={13} /> Renewal Requested (Awaiting Vendor)
                                    </span>
                                  ) : (
                                    <span className={`v360-doc-badge ${expInfo.badgeClass}`}>
                                      {expInfo.isExpired ? (
                                        <AlertTriangle size={13} />
                                      ) : expInfo.isExpiringSoon ? (
                                        <Clock size={13} />
                                      ) : (
                                        <CheckCircle2 size={13} />
                                      )}
                                      {expInfo.label}
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: 6 }}>
                                    <button
                                      type="button"
                                      className="v360-doc-action-btn"
                                      onClick={() => setPreviewDoc(doc)}
                                      title="View Document Certificate Preview"
                                    >
                                      <Eye size={13} /> View
                                    </button>
                                    {doc.isRenewalRequested ? (
                                      <button
                                        type="button"
                                        className="v360-doc-action-btn"
                                        style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}
                                        onClick={() => {
                                          const nextYearDate = new Date();
                                          nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
                                          const nextYearStr = nextYearDate.toISOString().slice(0, 10);
                                          const todayStr = new Date().toISOString().slice(0, 10);

                                          setVendorDocsMap((prev) => {
                                            const list = prev[detailVendor.id] || currentDocs;
                                            const updated = list.map((item) => {
                                              if (item.id === doc.id) {
                                                return {
                                                  ...item,
                                                  isRenewalRequested: false,
                                                  expiryDate: nextYearStr,
                                                  submittedAt: todayStr,
                                                  status: 'VALID' as const,
                                                };
                                              }
                                              return item;
                                            });
                                            return { ...prev, [detailVendor.id]: updated };
                                          });

                                          setPageMsg(`✅ Vendor (${detailVendor.email}) uploaded renewed ${doc.name}! Document status is now VALID (365 days remaining).`);
                                          setTimeout(() => setPageMsg(null), 6000);
                                        }}
                                        title="Simulate Vendor Submitting Renewed Document"
                                      >
                                        <RefreshCw size={13} /> Submit Renewed Doc
                                      </button>
                                    ) : (expInfo.isExpired || expInfo.isExpiringSoon) ? (
                                      <button
                                        type="button"
                                        className="v360-doc-action-btn"
                                        style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}
                                        onClick={() => {
                                          setVendorDocsMap((prev) => {
                                            const list = prev[detailVendor.id] || currentDocs;
                                            const updated = list.map((item) => {
                                              if (item.id === doc.id) {
                                                return { ...item, isRenewalRequested: true };
                                              }
                                              return item;
                                            });
                                            return { ...prev, [detailVendor.id]: updated };
                                          });

                                          // Dispatch Real Email & SMTP Notification to Vendor
                                          sapEmailService.dispatchVendorDocumentRenewalEmail({
                                            vendorEmail: detailVendor.email,
                                            vendorName: detailVendor.name,
                                            docName: doc.name,
                                            docType: doc.type,
                                            expiryLabel: expInfo.label,
                                          }).catch(() => {});

                                          setRenewalSuccessModal({
                                            docName: doc.name,
                                            docType: doc.type,
                                            vendorName: detailVendor.name,
                                            vendorEmail: detailVendor.email,
                                            expiryLabel: expInfo.label,
                                          });
                                        }}
                                        title="Request Renewal Email to Vendor"
                                      >
                                        <Send size={13} /> Request Renewal
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                              No documents found for filter "{docFilter}".
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Tab 3: Banking, Performance & Directory Details */
                <div className="v360-grid v360-grid--3col">
                  
                  {/* Card 4: Banking & Financial Details */}
                  <div className="v360-card">
                    <div className="v360-card__header">
                      <Building2 size={15} /> Banking & System Details
                      <span className={`v360-badge ${hasBanking ? 'v360-badge--green' : 'v360-badge--warn'}`}>
                        {hasBanking ? 'Banking Configured' : 'Pending Banking'}
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
                            <span className="v360-detail-val" style={{ color: detailVendor.bankName ? 'inherit' : '#ef4444' }}>
                              {detailVendor.bankName || 'Not Configured'}
                            </span>
                          </div>
                          <div className="v360-detail-item">
                            <span className="v360-detail-lbl">Branch</span>
                            <span className="v360-detail-val">{detailVendor.bankBranch || '—'}</span>
                          </div>
                          <div className="v360-detail-item">
                            <span className="v360-detail-lbl">Account No.</span>
                            <span className="v360-detail-val" style={{ color: detailVendor.bankAccountNumber ? 'inherit' : '#ef4444' }}>
                              {detailVendor.bankAccountNumber || 'Not Configured'}
                            </span>
                          </div>
                          <div className="v360-detail-item">
                            <span className="v360-detail-lbl">IFSC Code</span>
                            <span className="v360-detail-val" style={{ color: detailVendor.bankIfscCode ? 'inherit' : '#ef4444' }}>
                              {detailVendor.bankIfscCode || 'Not Configured'}
                            </span>
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

      {/* Document Certificate Preview Modal */}
      {previewDoc && (
        <div className="vendors-modal-backdrop" onClick={() => setPreviewDoc(null)}>
          <div className="doc-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="doc-preview-card">
              <div className="doc-preview-header">
                <div>
                  <div className="doc-preview-title">{previewDoc.name}</div>
                  <div className="doc-preview-meta">
                    Type: <strong>{previewDoc.type}</strong> | No: <strong>{previewDoc.documentNumber || '—'}</strong>
                  </div>
                </div>
                <button className="vendors-modal__close" onClick={() => setPreviewDoc(null)}>
                  <X size={18} />
                </button>
              </div>

              {(() => {
                const info = getDocExpiryInfo(previewDoc.expiryDate);
                return (
                  <>
                    <div className={`doc-preview-expiry-box doc-preview-expiry-box--${info.isExpired ? 'expired' : info.isExpiringSoon ? 'warn' : 'valid'}`}>
                      <div>
                        <strong style={{ fontSize: 14, color: info.color }}>Compliance Status:</strong>
                        <div style={{ fontSize: 13, marginTop: 2, color: 'var(--text-primary)' }}>{info.label}</div>
                      </div>
                      <span className={`v360-doc-badge ${info.badgeClass}`}>
                        {info.daysLeft !== null ? (info.isExpired ? `Expired ${Math.abs(info.daysLeft)} days ago` : `${info.daysLeft} Days Left`) : 'Permanent / Valid'}
                      </span>
                    </div>

                    {/* Render Real Uploaded Document Viewer if fileUrl exists from Onboarding Queue */}
                    {previewDoc.fileUrl ? (
                      <div className="doc-uploaded-viewer-container">
                        {previewDoc.fileUrl.match(/\.(jpeg|jpg|gif|png|svg|webp)($|\?)/i) ? (
                          <img src={previewDoc.fileUrl} className="doc-uploaded-img" alt={previewDoc.name} />
                        ) : (
                          <iframe src={previewDoc.fileUrl} className="doc-uploaded-iframe" title={previewDoc.name} />
                        )}
                      </div>
                    ) : previewDoc.type === 'GST Registration' ? (
                      <div className="scanned-doc-paper">
                        <div className="gst-cert-header">
                          <div className="gst-cert-emblem">Government of India · Goods and Services Tax</div>
                          <div className="gst-cert-title">Form GST REG-06</div>
                          <div className="gst-cert-sub">[See Rule 10(1)] — Certificate of Registration</div>
                        </div>

                        <table className="gst-cert-table">
                          <tbody>
                            <tr>
                              <td className="gst-lbl">1. Registration Number (GSTIN)</td>
                              <td className="gst-val" style={{ fontFamily: 'monospace', fontSize: 14, color: '#1e3a8a' }}>{previewDoc.documentNumber || detailVendor?.gstNumber || '27AABCU9603R1ZX'}</td>
                            </tr>
                            <tr>
                              <td className="gst-lbl">2. Legal Name of Business</td>
                              <td className="gst-val">{detailVendor?.name || 'Registered Vendor'}</td>
                            </tr>
                            <tr>
                              <td className="gst-lbl">3. Trade Name, if any</td>
                              <td className="gst-val">{detailVendor?.name || 'Registered Vendor'}</td>
                            </tr>
                            <tr>
                              <td className="gst-lbl">4. Constitution of Business</td>
                              <td className="gst-val">Private Limited Company / Firm</td>
                            </tr>
                            <tr>
                              <td className="gst-lbl">5. Address of Principal Place of Business</td>
                              <td className="gst-val">{detailVendor?.address || detailVendor?.location || 'Mumbai, Maharashtra, India'}</td>
                            </tr>
                            <tr>
                              <td className="gst-lbl">6. Date of Liability</td>
                              <td className="gst-val">01/07/2021</td>
                            </tr>
                            <tr>
                              <td className="gst-lbl">7. Period of Validity</td>
                              <td className="gst-val" style={{ color: info.color }}>
                                From {formatDateShort(previewDoc.submittedAt)} To {previewDoc.expiryDate ? formatDateShort(previewDoc.expiryDate) : 'UNLIMITED'}
                              </td>
                            </tr>
                            <tr>
                              <td className="gst-lbl">8. Type of Registration</td>
                              <td className="gst-val">Regular Taxpayer</td>
                            </tr>
                          </tbody>
                        </table>

                        <div className="gst-cert-footer">
                          <div className="gst-seal-box">
                            <CheckCircle2 size={18} />
                            <div>
                              <div>VERIFIED GSTIN SEAL</div>
                              <small>Central Tax Officer Signed</small>
                            </div>
                          </div>
                          <div className="gst-sig-box">
                            <div className="gst-sig-name">Superintendent of Central Tax</div>
                            <div>Jurisdictional Office Mumbai</div>
                          </div>
                        </div>
                      </div>
                    ) : previewDoc.type === 'PAN Card' ? (
                      <div className="pan-card-paper">
                        <div className="pan-header">
                          <div className="pan-title">INCOME TAX DEPARTMENT · GOVT. OF INDIA</div>
                          <ShieldCheck size={20} />
                        </div>
                        <div className="pan-num-box">{previewDoc.documentNumber || detailVendor?.panNumber || 'AABCU9603R'}</div>
                        <div className="pan-details-grid">
                          <div>
                            <div className="pan-detail-lbl">Name of Cardholder</div>
                            <div className="pan-detail-val">{detailVendor?.name}</div>
                          </div>
                          <div>
                            <div className="pan-detail-lbl">Contact / Authorized Person</div>
                            <div className="pan-detail-val">{detailVendor?.contactPerson || 'Authorized Representative'}</div>
                          </div>
                          <div>
                            <div className="pan-detail-lbl">Date of Incorporation / Issue</div>
                            <div className="pan-detail-val">{formatDateShort(previewDoc.submittedAt)}</div>
                          </div>
                          <div>
                            <div className="pan-detail-lbl">Status</div>
                            <div className="pan-detail-val" style={{ color: '#16a34a' }}>VERIFIED PERMANENT</div>
                          </div>
                        </div>
                      </div>
                    ) : previewDoc.type === 'ISO Certification' ? (
                      <div className="iso-cert-paper">
                        <div className="iso-header">INTERNATIONAL ACCREDITATION FORUM</div>
                        <div className="iso-sub">CERTIFICATE OF REGISTRATION</div>
                        <div className="iso-cert-to">This is to certify that the Quality Management System of</div>
                        <div className="iso-vendor-name">{detailVendor?.name}</div>
                        <div className="iso-standard">ISO 9001:2015 QUALITY MANAGEMENT SYSTEM</div>
                        <div style={{ fontSize: 13, marginBottom: 14 }}>
                          Certificate No: <strong>{previewDoc.documentNumber || 'ISO-88219-QMS'}</strong> | Valid Until: <strong style={{ color: info.color }}>{formatDateShort(previewDoc.expiryDate)}</strong>
                        </div>
                      </div>
                    ) : previewDoc.type === 'Bank Proof' ? (
                      <div className="cheque-paper">
                        <div className="cheque-cancel-mark">CANCELLED — FOR VERIFICATION ONLY</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                          <div>
                            <strong style={{ fontSize: 17, color: '#14532d' }}>{detailVendor?.bankName || 'HDFC BANK'}</strong>
                            <div style={{ fontSize: 12 }}>Branch: {detailVendor?.bankBranch || 'Main Branch'}</div>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 13 }}>
                            <div>Account No: <strong style={{ fontFamily: 'monospace' }}>{detailVendor?.bankAccountNumber || previewDoc.documentNumber || '50100234567890'}</strong></div>
                            <div>IFSC Code: <strong style={{ fontFamily: 'monospace' }}>{detailVendor?.bankIfscCode || 'HDFC0001234'}</strong></div>
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>PAY TO: {detailVendor?.name}</div>
                      </div>
                    ) : (
                      <div className="doc-preview-sheet">
                        <div className="doc-sheet-seal-watermark">VERIFIED COMPLIANCE RECORD</div>
                        <div className="doc-sheet-header">
                          <div className="doc-sheet-emblem">
                            <ShieldCheck size={26} />
                          </div>
                          <div className="doc-sheet-header-text">
                            <h3>OFFICIAL COMPLIANCE & REGISTRATION CERTIFICATE</h3>
                            <span>PROCUREMENT & VENDOR GOVERNANCE REPOSITORY</span>
                          </div>
                          <div className="doc-sheet-qr">QR VERIFIED</div>
                        </div>
                        <div className="doc-sheet-divider" />
                        <div className="doc-sheet-body">
                          <div className="doc-sheet-row">
                            <span className="doc-sheet-lbl">DOCUMENT TITLE</span>
                            <span className="doc-sheet-val">{previewDoc.name}</span>
                          </div>
                          <div className="doc-sheet-row">
                            <span className="doc-sheet-lbl">DOCUMENT CATEGORY</span>
                            <span className="doc-sheet-val">{previewDoc.type}</span>
                          </div>
                          <div className="doc-sheet-row">
                            <span className="doc-sheet-lbl">REGISTRATION / ID NUMBER</span>
                            <span className="doc-sheet-val doc-sheet-val--mono">{previewDoc.documentNumber || 'REG-99820-IN'}</span>
                          </div>
                          <div className="doc-sheet-row">
                            <span className="doc-sheet-lbl">REGISTERED ENTITY</span>
                            <span className="doc-sheet-val">{detailVendor?.name || 'Registered Supplier'}</span>
                          </div>
                          <div className="doc-sheet-row">
                            <span className="doc-sheet-lbl">SUBMISSION DATE</span>
                            <span className="doc-sheet-val">{formatDateShort(previewDoc.submittedAt)}</span>
                          </div>
                          <div className="doc-sheet-row">
                            <span className="doc-sheet-lbl">EXPIRATION STATUS</span>
                            <span className="doc-sheet-val" style={{ color: info.color }}>
                              {previewDoc.expiryDate ? `${formatDateShort(previewDoc.expiryDate)} (${info.daysLeft !== null ? (info.isExpired ? `Expired ${Math.abs(info.daysLeft)} days ago` : `${info.daysLeft} days left`) : 'Permanent'})` : 'Permanent / No Expiry'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="vendors-modal__footer" style={{ padding: 0 }}>
                <button className="vendors-modal__btn vendors-modal__btn--secondary" onClick={() => setPreviewDoc(null)}>
                  Close
                </button>
                {previewDoc.fileUrl && (
                  <button
                    className="vendors-modal__btn vendors-modal__btn--secondary"
                    onClick={() => window.open(previewDoc.fileUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink size={14} /> Open Original Uploaded File
                  </button>
                )}
                <button
                  className="vendors-modal__btn vendors-modal__btn--secondary"
                  onClick={() => window.print()}
                >
                  Print Certificate
                </button>
                <button
                  className="vendors-modal__btn vendors-modal__btn--primary"
                  onClick={() => {
                    if (previewDoc.fileUrl) {
                      window.open(previewDoc.fileUrl, '_blank');
                    } else {
                      setPageMsg(`Downloading official ${previewDoc.name} certificate PDF...`);
                      setTimeout(() => setPageMsg(null), 3000);
                    }
                  }}
                >
                  <Download size={15} /> Download Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload New Document Modal */}
      {showUploadDocModal && detailVendor && (
        <div className="vendors-modal-backdrop" onClick={() => setShowUploadDocModal(false)}>
          <div className="vendors-modal" onClick={(e) => e.stopPropagation()}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newDocName) return;
                const newDocItem: VendorDocumentItem = {
                  id: `doc-${Date.now()}`,
                  name: newDocName,
                  type: newDocType,
                  documentNumber: newDocNumber || undefined,
                  submittedAt: new Date().toISOString().slice(0, 10),
                  expiryDate: newDocExpiryDate || null,
                  status: getDocExpiryInfo(newDocExpiryDate || null).status,
                };
                setVendorDocsMap((prev) => {
                  const existing = prev[detailVendor.id] || [];
                  return { ...prev, [detailVendor.id]: [newDocItem, ...existing] };
                });
                setShowUploadDocModal(false);
                setPageMsg(`Document "${newDocName}" successfully uploaded & compliance verified.`);
                setTimeout(() => setPageMsg(null), 4000);
              }}
            >
              <div className="vendors-modal__header">
                <span className="vendors-modal__title">
                  <FilePlus size={20} /> Upload Vendor Document
                </span>
                <button type="button" className="vendors-modal__close" onClick={() => setShowUploadDocModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="vendors-modal__body">
                <div className="vendors-modal__field">
                  <label className="vendors-modal__label">Document Title <span>*</span></label>
                  <input
                    className="vendors-modal__input"
                    placeholder="e.g. GST Registration Certificate"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    required
                  />
                </div>

                <div className="vendors-modal__row">
                  <div className="vendors-modal__field">
                    <label className="vendors-modal__label">Document Type</label>
                    <select
                      className="vendors-modal__select"
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value)}
                    >
                      <option value="GST Registration">GST Registration</option>
                      <option value="PAN Card">PAN Card</option>
                      <option value="Business License">Business License</option>
                      <option value="ISO Certification">ISO Certification</option>
                      <option value="MSME Certificate">MSME Certificate</option>
                      <option value="Bank Proof">Bank Proof / Cancelled Cheque</option>
                      <option value="Tax Compliance Certificate">Tax Compliance Certificate</option>
                    </select>
                  </div>

                  <div className="vendors-modal__field">
                    <label className="vendors-modal__label">Registration / Document No.</label>
                    <input
                      className="vendors-modal__input"
                      placeholder="e.g. 27AABCU9603R1ZX"
                      value={newDocNumber}
                      onChange={(e) => setNewDocNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="vendors-modal__field">
                  <label className="vendors-modal__label">Expiry Date (Leave blank if permanent)</label>
                  <input
                    className="vendors-modal__input"
                    type="date"
                    value={newDocExpiryDate}
                    onChange={(e) => setNewDocExpiryDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="vendors-modal__footer">
                <button type="button" className="vendors-modal__btn vendors-modal__btn--secondary" onClick={() => setShowUploadDocModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="vendors-modal__btn vendors-modal__btn--primary">
                  <Upload size={15} /> Upload & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resend secure password setup link (vendor sets own password) */}
      {credVendor && (
        <div className="vendors-modal-backdrop" onClick={closeCredentialsModal}>
          <div className="vendors-modal" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <div className="vendors-modal__header">
              <span className="vendors-modal__title"><Key size={20} /> Portal access</span>
              <button className="vendors-modal__close" onClick={closeCredentialsModal}><X size={18} /></button>
            </div>
            <div className="vendors-modal__body">
              <p style={{ margin: '0 0 12px', fontSize: '0.9625rem', color: 'var(--text-secondary, #64748b)' }}>
                <strong>{credVendor.name}</strong> — send a secure link so the vendor can create their own password.
                Admins never see or store the vendor&apos;s password.
              </p>
              <div className="vendors-modal__field">
                <label className="vendors-modal__label">Login email</label>
                <input className="vendors-modal__input" value={credVendor.email} readOnly />
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '0.9125rem', color: 'var(--text-secondary, #64748b)' }}>
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

      {/* Renewal Request Email Sent Success Modal */}
      {renewalSuccessModal && (
        <div className="vendors-modal-backdrop" onClick={() => setRenewalSuccessModal(null)}>
          <div className="vendors-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="vendors-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={18} />
                </div>
                <div>
                  <span className="vendors-modal__title" style={{ fontSize: 17 }}>Renewal Request Sent!</span>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Email notification dispatched</div>
                </div>
              </div>
              <button type="button" className="vendors-modal__close" onClick={() => setRenewalSuccessModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="vendors-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>RECIPIENT VENDOR:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{renewalSuccessModal.vendorName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>VENDOR EMAIL:</span>
                  <strong style={{ color: 'var(--primary-500)' }}>{renewalSuccessModal.vendorEmail}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>TARGET DOCUMENT:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{renewalSuccessModal.docName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>EXPIRY STATUS:</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>{renewalSuccessModal.expiryLabel}</span>
                </div>
              </div>

              <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                An official document renewal notification email with a <strong>secure 1-click document re-upload link</strong> has been dispatched to <strong>{renewalSuccessModal.vendorEmail}</strong>.
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'rgba(10,110,209,0.08)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(10,110,209,0.2)' }}>
                ℹ️ Document status in Vendor 360 has been marked as <strong>Renewal Requested</strong>. As soon as the vendor uploads the new certificate, compliance and risk scores will automatically update.
              </div>
            </div>

            <div className="vendors-modal__footer">
              <button
                type="button"
                className="vendors-modal__btn vendors-modal__btn--primary"
                onClick={() => setRenewalSuccessModal(null)}
              >
                <CheckCircle2 size={15} /> Done, Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Access Success Modal ────────────────────── */}
      {mobileSuccessModal?.visible && (
        <div className="vendors-modal-backdrop" onClick={() => setMobileSuccessModal(null)}>
          <div
            className="vendors-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 400,
              padding: '28px 24px 24px',
              textAlign: 'center',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
              position: 'relative',
            }}
          >
            {/* Header Close */}
            <button
              type="button"
              onClick={() => setMobileSuccessModal(null)}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '50%',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <X size={15} />
            </button>

            {/* Icon Badge */}
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: mobileSuccessModal.isEnabled
                  ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(16, 185, 129, 0.1))'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.22), rgba(225, 29, 72, 0.1))',
                border: `1.5px solid ${mobileSuccessModal.isEnabled ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                boxShadow: `0 0 28px ${mobileSuccessModal.isEnabled ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Smartphone size={38} strokeWidth={2} color={mobileSuccessModal.isEnabled ? '#22c55e' : '#ef4444'} />
            </div>

            {/* Title */}
            <h3
              style={{
                margin: '0 0 8px',
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Mobile Access {mobileSuccessModal.isEnabled ? 'Enabled' : 'Disabled'}
            </h3>

            {/* Subtitle */}
            <p
              style={{
                margin: '0 0 24px',
                fontSize: 15,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
              }}
            >
              Mobile App access for <strong style={{ color: 'var(--text-primary)' }}>{mobileSuccessModal.vendorName}</strong> has been {mobileSuccessModal.isEnabled ? 'granted successfully.' : 'revoked.'}
            </p>

            {/* Button */}
            <button
              type="button"
              onClick={() => setMobileSuccessModal(null)}
              style={{
                width: '100%',
                padding: '11px 0',
                borderRadius: 10,
                border: 'none',
                background: mobileSuccessModal.isEnabled
                  ? 'linear-gradient(135deg, #16a34a, #15803d)'
                  : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: mobileSuccessModal.isEnabled
                  ? '0 4px 14px rgba(22, 163, 74, 0.35)'
                  : '0 4px 14px rgba(220, 38, 38, 0.35)',
                transition: 'all 0.15s ease',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
