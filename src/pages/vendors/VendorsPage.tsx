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
  ExternalLink, RefreshCw, Check, Info, Smartphone, SlidersHorizontal, ArrowUpDown
} from 'lucide-react';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import FloatingMenu from '../../components/shared/FloatingMenu';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { procurementService } from '../../services/procurementService';
import { sapEmailService } from '../../services/sapEmailService';
import { API_BASE } from '../../api/client';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { TableSkeleton } from '../../components/shared/Skeleton';
import { cn } from '../../lib/utils';
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
      expiryDate: '2026-08-30',
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
      expiryDate: '2026-08-22',
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
      expiryDate: '2026-09-10',
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
      expiryDate: '2026-08-20',
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
  width?: string; align?: 'left' | 'center' | 'right';
  render: (v: VendorTableRow, fmtDate: (d: string) => string, toggle: (id: string) => void, toggleMobile?: (id: string) => void, canCreate?: boolean) => React.ReactNode;
}

const COL_META: Record<string, { width: string; align?: 'left'|'center'|'right' }> = {
  vendor:       { width: '240px', align: 'left'   },
  category:     { width: '130px', align: 'left'   },
  location:     { width: '130px', align: 'left'   },
  orders:       { width: '80px',  align: 'center' },
  score:        { width: '90px',  align: 'center' },
  status:       { width: '120px', align: 'left'   },
  mobileAccess: { width: '150px', align: 'left'   },
  joined:       { width: '110px', align: 'left'   },
  contact:      { width: '140px', align: 'left'   },
  phone:        { width: '140px', align: 'left'   },
  website:      { width: '120px', align: 'left'   },
};

const ALL_COLUMNS: VendorColumnDef[] = [
  {
    key: 'vendor', label: 'Vendor', defaultVisible: true, required: true, width: COL_META.vendor.width, align: 'left',
    render: (v) => (
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full font-semibold text-xs text-primary ring-1 ring-primary/15 vendors-table__avatar--${v.avatarMod}`}>
          {v.initials}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-semibold text-foreground hover:text-primary transition-colors">{v.name}</span>
          <span className="truncate text-xs text-muted-foreground">{v.email}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'category', label: 'Category', defaultVisible: true, width: COL_META.category.width, align: 'left',
    render: (v) => (
      <Badge tone="info" className="font-semibold">
        {v.category}
      </Badge>
    )
  },
  {
    key: 'location', label: 'Location', defaultVisible: true, width: COL_META.location.width, align: 'left',
    render: (v) => (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground truncate">
        <MapPin size={13} className="shrink-0" /> {v.location}
      </span>
    )
  },
  {
    key: 'orders', label: 'Orders', defaultVisible: true, width: COL_META.orders.width, align: 'center',
    render: (v) => <span className="tabular-nums font-semibold text-foreground">{v.totalOrders}</span>
  },
  {
    key: 'score', label: 'Score', defaultVisible: true, width: COL_META.score.width, align: 'center',
    render: (v) => {
      const score = v.overallScore;
      let tone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
      if (score >= 90) tone = 'success';
      else if (score >= 60) tone = 'warning';
      else if (score > 0) tone = 'danger';

      return (
        <Badge tone={tone} className="font-semibold tabular-nums gap-1">
          <Star size={11} fill="currentColor" className="opacity-80" />
          {score > 0 ? `${score}%` : '—'}
        </Badge>
      );
    },
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: COL_META.status.width, align: 'left',
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
    key: 'mobileAccess', label: 'Mobile Access', defaultVisible: true, width: COL_META.mobileAccess.width, align: 'left',
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
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600 }}
        >
          <Smartphone size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
          {v.isMobileAccessEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    ),
  },
  {
    key: 'joined', label: 'Joined', defaultVisible: true, width: COL_META.joined.width, align: 'left',
    render: (v, fmtDate) => <span className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(v.createdAt)}</span>
  },
  {
    key: 'contact', label: 'Contact Person', defaultVisible: false, width: COL_META.contact.width, align: 'left',
    render: (v) => <span className="text-sm text-muted-foreground">{v.contactPerson}</span>
  },
  {
    key: 'phone', label: 'Phone', defaultVisible: false, width: COL_META.phone.width, align: 'left',
    render: (v) => <span className="text-sm text-muted-foreground">{v.phone}</span>
  },
  {
    key: 'website', label: 'Website', defaultVisible: false, width: COL_META.website.width, align: 'left',
    render: (v) => <span className="text-sm text-muted-foreground">{v.website}</span>
  },
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

  const [passwordSetupSuccessModal, setPasswordSetupSuccessModal] = useState<{
    vendorName: string;
    vendorEmail: string;
  } | null>(null);

  // ── Company Vendor Limit ──
  const [maxVendorsAllowed, setMaxVendorsAllowed] = useState<number>(50);
  useEffect(() => {
    (async () => {
      try {
        const prof = await companySettingsService.getCompanyProfile();
        if (prof?.maxVendors) {
          setMaxVendorsAllowed(prof.maxVendors);
        } else if (prof?.maxUsers) {
          setMaxVendorsAllowed(prof.maxUsers);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const anyModalOpen = !!(showModal || deleteTarget || detailVendor || credVendor || previewDoc || showUploadDocModal || renewalSuccessModal || mobileSuccessModal?.visible || passwordSetupSuccessModal);
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
      if (result.emailSent) {
        const sentVendorName = credVendor.name;
        const sentVendorEmail = credVendor.email;
        closeCredentialsModal();
        setPasswordSetupSuccessModal({
          vendorName: sentVendorName,
          vendorEmail: sentVendorEmail,
        });
        reload();
      } else {
        setCredentialsMsg('Failed to send setup email. Check SMTP settings.');
      }
    } catch (err) {
      setCredentialsMsg(err instanceof Error ? err.message : 'Failed to send setup email');
    } finally {
      setCredLoading(false);
    }
  }, [credVendor, closeCredentialsModal, reload]);

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

  const isVendorLimitReached = useMemo(() => {
    return summary.active >= maxVendorsAllowed;
  }, [summary.active, maxVendorsAllowed]);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const queryClient = useQueryClient();

  const toggleActive = useCallback(async (id: string | number) => {
    setPageMsg(null);
    const idStr = String(id);
    const v = vendors.find((x) => String(x.id) === idStr);
    if (!v) return;

    const newActive = !v.isActive;

    if (newActive && isVendorLimitReached) {
      setPageMsg(`⚠️ Company Vendor Limit Reached (${summary.active} / ${maxVendorsAllowed} active vendors). Please contact Procnex Support to upgrade.`);
      return;
    }

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
  }, [vendors, isVendorLimitReached, summary.active, maxVendorsAllowed, reload, queryClient]);

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
    if (!editingVendor && isVendorLimitReached) {
      setPageMsg(`⚠️ Company Vendor Limit Reached (${summary.active} / ${maxVendorsAllowed} active vendors). Please contact Procnex Support to upgrade.`);
      return;
    }
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
      queryClient.invalidateQueries({ queryKey: ['svc'] });
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setActionLoading(false);
    }
  }, [editingVendor, isVendorLimitReached, summary.active, maxVendorsAllowed, fName, fEmail, fPhone, fCountryCode, fContact, fCategory, fCategoryId, fLocation, fWebsite, fMobileAccess, detailVendor, closeFormModal, reload, queryClient]);

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
      queryClient.invalidateQueries({ queryKey: ['svc'] });
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Delete failed';
      if (msg.includes('Route not found')) {
        msg = 'Backend is running old code (no delete route). Stop it (Ctrl+C) and run: cd Heliflow_Client_Backend && npm run dev';
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
  }, [deleteTarget, detailVendor, reload, queryClient]);

  const canSave = fName.trim() && fEmail.trim();

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <PageFrame>
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

      {/* Header */}
      <PageLead
        title="Vendors"
        description="Manage vendor directory, track performance, and onboard new suppliers."
        actions={
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all shadow-xs",
              isVendorLimitReached ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-card border-border text-foreground"
            )}>
              <Users size={15} className="text-primary shrink-0" />
              <span>Active Vendors: {summary.active} / {maxVendorsAllowed} Limit</span>
            </div>

            <Button
              onClick={(!isVendorLimitReached && canCreateVendor) ? openAddModal : undefined}
              disabled={isVendorLimitReached || !canCreateVendor}
              title={!canCreateVendor ? 'Admin has not allowed this action. You do not have permission to create vendors.' : isVendorLimitReached ? 'Company vendor limit reached. Please contact Procnex Support to upgrade.' : 'Add a new vendor'}
            >
              {canCreateVendor ? <Plus /> : <ShieldOff />} Add Vendor
            </Button>
          </div>
        }
      />

      {isVendorLimitReached && (
        <div className="mb-4">
          <MessageStrip type="warning">
            ⚠️ <strong>Company Vendor Limit Reached:</strong> Your organization has reached its maximum active vendor limit ({summary.active} / {maxVendorsAllowed} active vendors). Please contact your service provider (Procnex Support) to upgrade your vendor limit.
          </MessageStrip>
        </div>
      )}

      {/* Metric KPI Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Users, tone: 'primary' as const, value: summary.total, label: 'Total Vendors', detail: 'All registered suppliers', filter: 'all' as const },
          { icon: UserCheck, tone: 'success' as const, value: summary.active, label: 'Active Vendors', detail: 'Approved & active', filter: 'active' as const },
          { icon: UserX, tone: 'danger' as const, value: summary.inactive, label: 'Inactive Vendors', detail: 'Deactivated suppliers', filter: 'inactive' as const },
          { icon: Award, tone: 'warning' as const, value: topRatedCount, label: 'Top Rated', detail: '80%+ performance score', filter: 'top-rated' as const },
        ].map((c) => {
          const isActive = filterMode === c.filter;
          return (
            <MetricCard
              key={c.label}
              icon={c.icon}
              tone={c.tone}
              value={c.value}
              label={c.label}
              detail={c.detail}
              className={cn(
                'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                isActive &&
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
              )}
              onClick={() => {
                setFilterMode((prev) => prev === c.filter ? 'all' : c.filter);
                setCurrentPage(1);
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFilterMode((prev) => prev === c.filter ? 'all' : c.filter);
                  setCurrentPage(1);
                }
              }}
            />
          );
        })}
      </div>

      {/* Search & Category Filter Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="vendor-search-input"
            name="vendor_search_query"
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search by name, email, category, contact, or location..."
            autoComplete="off"
            aria-label="Search vendors"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="flex items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
          <div className="relative min-w-[200px]">
            <Building2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-9 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by category"
            >
              <option value="">All Categories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat} ({categoryCounts[cat] || 0})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center rounded-xl border border-input bg-card p-1 shadow-xs">
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-lg p-2 text-xs font-semibold transition-all cursor-pointer",
                view === 'table' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              onClick={() => setView('table')}
              title="Table view"
            >
              <LayoutList size={16} />
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center justify-center rounded-lg p-2 text-xs font-semibold transition-all cursor-pointer",
                view === 'card' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              onClick={() => setView('card')}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={perPage} columns={6} />
        ) : paginated.length > 0 ? (
          view === 'table' ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <colgroup>
                    {visibleColumns.map((col) => (
                      <col key={col.key} style={{ width: COL_META[col.key]?.width || 'auto' }} />
                    ))}
                    <col style={{ width: '130px' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border/75 bg-muted/45 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                      {visibleColumns.map((col) => {
                        const align = COL_META[col.key]?.align ?? 'left';
                        return (
                          <th
                            key={col.key}
                            className="px-4 py-3"
                            style={{ textAlign: align }}
                          >
                            {col.label}
                          </th>
                        );
                      })}
                      <th className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span>Actions</span>
                          <div className="relative">
                            <Button
                              ref={colBtnRef}
                              variant={showColPanel ? 'secondary' : 'ghost'}
                              size="icon-sm"
                              onClick={() => setShowColPanel((v) => !v)}
                              title="Customize columns"
                              aria-label="Customize columns"
                              aria-expanded={showColPanel}
                            >
                              <span className="flex gap-0.5"><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /></span>
                            </Button>

                            {showColPanel && (
                              <ColumnCustomizer
                                columnOrder={columnOrder}
                                visibleKeys={visibleKeys}
                                allColumns={ALL_COLUMNS}
                                onToggle={handleToggleColumn}
                                onReorder={setColumnOrder}
                                onReset={handleResetColumns}
                                onClose={() => setShowColPanel(false)}
                                anchorRef={colBtnRef}
                              />
                            )}
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginated.map((v) => (
                      <tr
                        key={v.id}
                        className="group transition-colors hover:bg-accent/35 cursor-pointer"
                        onClick={() => setDetailVendor(v)}
                      >
                        {visibleColumns.map((col) => {
                          const align = COL_META[col.key]?.align ?? 'left';
                          return (
                            <td key={col.key} className="px-4 py-3.5 align-middle" style={{ textAlign: align }}>
                              {col.render(v, formatDate, toggleActive, toggleMobileActive, canCreateVendor)}
                            </td>
                          );
                        })}

                        <td className="px-4 py-3.5 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDetailVendor(v)}
                              title="View profile"
                            >
                              <Eye className="size-4" />
                            </Button>

                            {v.isActive && canCreateVendor && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openCredentialsModal(v)}
                                title="Resend password setup email"
                              >
                                <Key className="size-4" />
                              </Button>
                            )}

                            {canCreateVendor ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEditModal(v)}
                                title="Edit vendor"
                              >
                                <Edit3 className="size-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled
                                className="opacity-50"
                                title="Admin has not allowed this action."
                              >
                                <ShieldOff className="size-4" />
                              </Button>
                            )}

                            {canCreateVendor ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => openDeleteModal(v)}
                                title="Delete vendor"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled
                                className="opacity-50"
                                title="Admin has not allowed this action."
                              >
                                <ShieldOff className="size-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* Cards View */
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:p-5">
              {paginated.map((v) => (
                <div
                  key={v.id}
                  className="group flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-md cursor-pointer"
                  onClick={() => setDetailVendor(v)}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-full font-semibold text-xs text-primary ring-1 ring-primary/15 vendors-table__avatar--${v.avatarMod}`}>
                          {v.initials}
                        </span>
                        <div className="min-w-0 flex flex-col">
                          <span className="truncate font-semibold text-foreground group-hover:text-primary transition-colors">{v.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{v.category}</span>
                        </div>
                      </div>
                      <Badge tone={v.overallScore >= 90 ? 'success' : v.overallScore >= 60 ? 'warning' : v.overallScore > 0 ? 'danger' : 'neutral'} className="shrink-0 gap-1 font-semibold">
                        <Star size={11} fill="currentColor" /> {v.overallScore > 0 ? `${v.overallScore}%` : '—'}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2 truncate">
                        <Mail size={13} className="shrink-0" />
                        <span className="truncate">{v.email}</span>
                      </div>
                      <div className="flex items-center gap-2 truncate">
                        <MapPin size={13} className="shrink-0" />
                        <span className="truncate">{v.location}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                    <span className="font-medium text-foreground">{v.totalOrders} orders</span>
                    <Badge tone={v.isActive ? 'success' : 'neutral'}>
                      {v.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <EmptyState
            className="m-4 min-h-64 border-0 shadow-none"
            icon={Search}
            title="No vendors found"
            description={
              search
                ? 'Try adjusting your search query or clear the active filter.'
                : categoryFilter
                ? `No vendors found in category "${categoryFilter}".`
                : filterMode !== 'all'
                ? `No ${filterMode === 'active' ? 'active' : filterMode === 'inactive' ? 'inactive' : 'top rated'} vendors found.`
                : 'Add your first vendor to get started.'
            }
            action={
              (search || categoryFilter || filterMode !== 'all') ? (
                <Button variant="outline" onClick={() => { setSearch(''); setCategoryFilter(''); setFilterMode('all'); }}>
                  <X /> Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* Pagination */}
      {filtered.length > perPage && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/65 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((page) => page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <Button
                key={page}
                variant={safePage === page ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={() => setCurrentPage(page)}
                aria-label={`Page ${page}`}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage((page) => page + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit Vendor Modal */}
      {showModal && (
        <div className="vendors-modal-backdrop" onClick={closeFormModal}>
          <div className="vendors-modal" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); if (canSave && !actionLoading) handleSaveVendor(); }} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              <div className="vendors-modal__header">
                <span className="vendors-modal__title">
                  <span className="vendors-modal__title-icon">
                    <Building2 size={18} />
                  </span>
                  {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
                </span>
                <button type="button" className="vendors-modal__close" onClick={closeFormModal} aria-label="Close modal"><X size={18} /></button>
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
                    <label htmlFor="vendor-email" className="vendors-modal__label"><Mail size={13} style={{marginRight:4, opacity: 0.7}} /> Email <span>*</span></label>
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
                    <label className="vendors-modal__label"><Phone size={13} style={{marginRight:4, opacity: 0.7}} /> Phone</label>
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
                    <label htmlFor="vendor-location" className="vendors-modal__label"><MapPin size={13} style={{marginRight:4, opacity: 0.7}} /> Location</label>
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
                    <label htmlFor="vendor-website" className="vendors-modal__label"><Globe size={13} style={{marginRight:4, opacity: 0.7}} /> Website</label>
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
                <div className="vendors-modal__mobile-access">
                  <div className="vendors-modal__mobile-info">
                    <span className="vendors-modal__mobile-title">
                      <Smartphone size={16} strokeWidth={2} style={{ color: 'var(--primary-500, #0a6ed1)' }} /> Allow Mobile App Access
                    </span>
                    <p className="vendors-modal__mobile-desc">
                      Allow this vendor to log in to the Mobile App.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={fMobileAccess}
                    onChange={(e) => setFMobileAccess(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary-500, #0a6ed1)' }}
                  />
                </div>
                {editingVendor && (
                  <p className="vendors-modal__edit-note">
                    Vendor profile fields are saved to the system. Use the Active toggle in the table for portal access.
                  </p>
                )}
              </div>
              <div className="vendors-modal__footer">
                <Button type="button" variant="outline" onClick={closeFormModal}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={!canSave || actionLoading}
                >
                  <Building2 size={16} /> {actionLoading ? 'Saving…' : editingVendor ? 'Save changes' : 'Add Vendor'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog matching RFQ Page */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !actionLoading) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete vendor "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>
              Remove {deleteTarget?.name} ({deleteTarget?.email}) from the vendor directory?
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Their quotations and RFQ invites will be removed. Vendors with purchase orders or invoices must be deactivated instead.</span>
          </div>

          {deleteError && (
            <MessageStrip type="error" compact className="sap-message-strip--flush mt-3">
              {deleteError}
            </MessageStrip>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={actionLoading}>Cancel</Button>
            <Button variant="destructive" loading={actionLoading} onClick={handleConfirmDelete}>
              Delete Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Credentials / Password Setup Modal */}
      {credVendor && (
        <Dialog open={Boolean(credVendor)} onOpenChange={(open) => { if (!open && !credLoading) closeCredentialsModal(); }}>
          <DialogContent>
            <DialogHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Key className="size-5" />
              </div>
              <DialogTitle>Send Password Setup Link</DialogTitle>
              <DialogDescription>
                Send a secure password setup link to <strong>{credVendor.name}</strong> at <strong>{credVendor.email}</strong>.
              </DialogDescription>
            </DialogHeader>

            {credentialsMsg && (
              <MessageStrip type={inferMessageType(credentialsMsg)} compact className="sap-message-strip--flush mt-3">
                {credentialsMsg}
              </MessageStrip>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={closeCredentialsModal} disabled={credLoading}>Cancel</Button>
              <Button loading={credLoading} onClick={handleResendPasswordSetup}>
                <Send size={16} /> Send Setup Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Password Setup Success Modal */}
      {passwordSetupSuccessModal && (
        <Dialog open={Boolean(passwordSetupSuccessModal)} onOpenChange={() => setPasswordSetupSuccessModal(null)}>
          <DialogContent>
            <DialogHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <DialogTitle>Password Setup Link Sent!</DialogTitle>
              <DialogDescription>
                An email containing secure login instructions was sent to <strong>{passwordSetupSuccessModal.vendorName}</strong> ({passwordSetupSuccessModal.vendorEmail}).
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={() => setPasswordSetupSuccessModal(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile Access Success Modal */}
      {mobileSuccessModal?.visible && (
        <Dialog open={Boolean(mobileSuccessModal?.visible)} onOpenChange={() => setMobileSuccessModal(null)}>
          <DialogContent>
            <DialogHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="size-5" />
              </div>
              <DialogTitle>Mobile App Access Updated</DialogTitle>
              <DialogDescription>
                Mobile App Access for <strong>{mobileSuccessModal.vendorName}</strong> is now <strong>{mobileSuccessModal.isEnabled ? 'Enabled' : 'Disabled'}</strong>.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={() => setMobileSuccessModal(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Document Renewal Success Modal */}
      {renewalSuccessModal && (
        <Dialog open={Boolean(renewalSuccessModal)} onOpenChange={() => setRenewalSuccessModal(null)}>
          <DialogContent>
            <DialogHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
                <Send className="size-5" />
              </div>
              <DialogTitle>Document Renewal Requested</DialogTitle>
              <DialogDescription>
                A renewal request email for <strong>{renewalSuccessModal.docName}</strong> has been sent to <strong>{renewalSuccessModal.vendorName}</strong> ({renewalSuccessModal.vendorEmail}).
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={() => setRenewalSuccessModal(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Detail Modal — Vendor 360 Dashboard Layout */}
      {detailVendor && (() => {
        const hasEval = detailVendor.overallScore > 0 || detailVendor.totalOrders > 0;

        const qualRisk = detailVendor.avgQuality > 0 ? Math.max(0, 100 - detailVendor.avgQuality) : 0;
        const delivRisk = detailVendor.avgDelivery > 0 ? Math.max(0, 100 - detailVendor.avgDelivery) : 0;
        const priceRisk = detailVendor.avgPriceScore > 0 ? Math.max(0, 100 - detailVendor.avgPriceScore) : 0;

        const currentDocs: VendorDocumentItem[] = vendorDocsMap[detailVendor.id] || (DEFAULT_VENDOR_DOCUMENTS[detailVendor.id] || [
          ...(detailVendor.gstNumber ? [{
            id: `doc-${detailVendor.id}-gst`,
            name: 'GST Registration Certificate',
            type: 'GST Registration',
            documentNumber: detailVendor.gstNumber,
            submittedAt: detailVendor.createdAt,
            expiryDate: '2026-08-30',
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
            expiryDate: '2026-08-20',
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

        const filteredDocs = currentDocs.filter((d) => {
          const info = getDocExpiryInfo(d.expiryDate);
          if (docFilter === 'expiring') return info.isExpired || info.isExpiringSoon;
          if (docFilter === 'valid') return !info.isExpired && !info.isExpiringSoon;
          return true;
        });

        return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6" onClick={() => { setDetailVendor(null); setIsFullScreenDetail(false); }}>
          <div
            className={cn(
              "flex flex-col w-full max-w-6xl max-h-[90vh] rounded-2xl border border-border/40 bg-card shadow-2xl overflow-hidden transition-all duration-200 text-foreground",
              isFullScreenDetail && "max-w-none max-h-none h-screen w-screen rounded-none border-0"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header + Summary Workspace Header */}
            <div className="flex flex-col border-b border-border/40 bg-card px-6 pt-6 pb-5 gap-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl font-bold text-base text-primary ring-1 ring-primary/20 bg-primary/5 vendors-table__avatar--${detailVendor.avatarMod}`}>
                    {detailVendor.initials}
                  </span>
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      Supplier Relationship · Vendor 360
                    </span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-2xl font-bold tracking-tight text-foreground truncate">{detailVendor.name}</h2>
                      <div className="flex items-center gap-1.5">
                        <Badge tone={detailVendor.overallScore >= 80 ? 'warning' : 'info'} className="px-2 py-0.5 text-[11px] font-semibold rounded-md border-0">
                          {!hasEval ? 'NEW SUPPLIER' : detailVendor.overallScore >= 80 ? 'STRATEGIC TIER' : detailVendor.overallScore >= 60 ? 'PREFERRED TIER' : 'STANDARD TIER'}
                        </Badge>
                        <Badge tone={!hasEval ? 'info' : overallRisk <= 25 ? 'success' : overallRisk <= 50 ? 'warning' : 'danger'} className="px-2 py-0.5 text-[11px] font-semibold rounded-md border-0">
                          {!hasEval ? 'RISK: UNTESTED' : overallRisk <= 25 ? 'RISK: LOW' : overallRisk <= 50 ? 'RISK: MED' : 'RISK: HIGH'}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      VN-{String(detailVendor.id).length > 10 ? String(detailVendor.id).slice(-8).toUpperCase() : String(detailVendor.id).padStart(5, '0')} · Joined {formatDate(detailVendor.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setIsFullScreenDetail((prev) => !prev)}
                    title={isFullScreenDetail ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullScreenDetail ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { setDetailVendor(null); setIsFullScreenDetail(false); }}
                    title="Close"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Summary Metrics Strip (No outer card box, clean horizontal strip with subtle dividers) */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-2.5 px-4 rounded-lg bg-muted/20 border border-border/30">
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn(
                    "text-2xl font-bold tabular-nums",
                    !hasEval ? "text-muted-foreground" : detailVendor.overallScore >= 80 ? "text-emerald-600" : detailVendor.overallScore >= 60 ? "text-amber-600" : "text-rose-600"
                  )}>
                    {detailVendor.overallScore > 0 ? detailVendor.overallScore : '0'}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">
                      {!hasEval ? 'New Vendor' : detailVendor.overallScore >= 80 ? 'Strategic Partner' : detailVendor.overallScore >= 60 ? 'Active Supplier' : 'Standard Supplier'}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Composite Score</span>
                  </div>
                </div>

                <div className="hidden sm:block h-6 w-px bg-border/40" />

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 flex-1 sm:max-w-2xl sm:divide-x sm:divide-border/30">
                  {[
                    { label: 'Total Orders', val: detailVendor.totalOrders },
                    { label: 'Quality', val: detailVendor.avgQuality > 0 ? `${detailVendor.avgQuality}%` : '—' },
                    { label: 'Delivery', val: detailVendor.avgDelivery > 0 ? `${detailVendor.avgDelivery}%` : '—' },
                    { label: 'Price Score', val: detailVendor.avgPriceScore > 0 ? `${detailVendor.avgPriceScore}%` : '—' },
                    { label: 'Risk Score', val: hasEval ? `${overallRisk}/100` : '—', color: !hasEval ? undefined : overallRisk <= 25 ? 'text-emerald-600' : overallRisk <= 50 ? 'text-amber-600' : 'text-rose-600' },
                  ].map((kpi, idx) => (
                    <div key={kpi.label} className={cn("flex flex-col items-center justify-center text-center", idx > 0 && "sm:pl-3")}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                        {kpi.label}
                      </span>
                      <span className={cn("text-sm font-semibold tabular-nums text-foreground mt-0.5", kpi.color)}>
                        {kpi.val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Navigation Bar (2px underline indicator, no box background) */}
            <div className="flex items-center gap-6 border-b border-border/40 bg-card px-6 text-sm font-medium">
              {[
                { id: 'overview' as const, label: 'Evaluation & Risk Overview', icon: PieChart },
                { id: 'documents' as const, label: `Submitted Documents & Compliance (${currentDocs.length})`, icon: FileText, hasWarn: expiredDocs.length > 0 || expiringDocs.length > 0 },
                { id: 'directory' as const, label: 'Banking, Performance & Directory', icon: Building2 },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = v360Tab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      "relative flex items-center gap-2 py-3.5 font-semibold text-xs sm:text-sm transition-all cursor-pointer border-b-2 -mb-px",
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setV360Tab(tab.id)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{tab.label}</span>
                    {tab.hasWarn && <span className="size-2 rounded-full bg-amber-500 shrink-0" title="Attention required" />}
                  </button>
                );
              })}
            </div>

            {/* Workspace Tab Body (Single workspace surface, no card grid) */}
            <div className="flex-1 overflow-y-auto p-6 bg-card">
              {v360Tab === 'overview' ? (
                /* Tab 1: Evaluation & Risk Overview — Left (32%) Score Breakdown | Right (68%) Risk Dashboard + Tax Checklist */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
                  {/* Left Column — Score Breakdown (~32% width) */}
                  <div className="lg:col-span-4 pr-0 lg:pr-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-border/30 pb-3">
                      <h3 className="flex items-center gap-2 font-semibold text-sm text-foreground">
                        <PieChart className="size-4 text-primary" /> Score Breakdown
                      </h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 tabular-nums">
                        {detailVendor.overallScore}/100
                      </span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className="relative size-36 my-2">
                        <svg viewBox="0 0 42 42" className="size-full -rotate-90">
                          <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="currentColor" className="text-muted/15" strokeWidth="4" />
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
                                  strokeWidth="4"
                                  strokeDasharray={dash}
                                  strokeDashoffset={offset}
                                />
                              );
                            });
                          })()}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-3xl font-bold tabular-nums text-foreground">{detailVendor.overallScore > 0 ? detailVendor.overallScore : '0'}</span>
                          <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">SCORE</span>
                        </div>
                      </div>

                      <div className="w-full space-y-2 mt-4 pt-2">
                        {[
                          { label: 'Quality Rating', score: detailVendor.avgQuality, color: '#6366f1', weight: '30%' },
                          { label: 'Delivery Performance', score: detailVendor.avgDelivery, color: '#10b981', weight: '30%' },
                          { label: 'Price Competitiveness', score: detailVendor.avgPriceScore, color: '#f59e0b', weight: '20%' },
                          { label: 'Tax Compliance', score: (hasGst && hasPan) ? 100 : (hasGst || hasPan) ? 50 : 0, color: '#ec4899', weight: '10%' },
                          { label: 'Banking Onboarding', score: hasBanking ? 100 : detailVendor.bankName ? 50 : 0, color: '#06b6d4', weight: '10%' },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="size-2 rounded-full shrink-0" style={{ background: item.color }} />
                              <span className="truncate font-medium text-foreground/90">{item.label}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 font-medium tabular-nums">
                              <span>{item.score > 0 ? `${item.score}%` : 'N/A'}</span>
                              <span className="text-muted-foreground text-[11px]">({item.weight})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column — Risk Dashboard (Top) & Tax & Compliance (Bottom) */}
                  <div className="lg:col-span-8 pt-6 lg:pt-0 pl-0 lg:pl-6 space-y-8">
                    {/* Risk Dashboard — 2 Column Compact Grid */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-border/30 pb-3">
                        <h3 className="flex items-center gap-2 font-semibold text-sm text-foreground">
                          <ShieldCheck className="size-4 text-primary" /> Risk Dashboard
                        </h3>
                        <Badge tone={!hasEval ? 'info' : overallRisk <= 25 ? 'success' : 'warning'} className="px-2 py-0.5 text-xs font-semibold rounded-md border-0">
                          {!hasEval ? 'Untested' : overallRisk <= 25 ? 'Low Risk' : overallRisk <= 50 ? 'Medium Risk' : 'High Risk'} ({hasEval ? `${overallRisk}/100` : 'No Orders'})
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {[
                          { label: 'Quality Defect Risk', level: qualRisk, evaluated: detailVendor.avgQuality > 0 },
                          { label: 'Late Delivery Risk', level: delivRisk, evaluated: detailVendor.avgDelivery > 0 },
                          { label: 'Price Variance Risk', level: priceRisk, evaluated: detailVendor.avgPriceScore > 0 },
                          { label: 'Tax Compliance Risk', level: compRisk, evaluated: true },
                          { label: 'Banking Setup Risk', level: bankRisk, evaluated: true },
                          { label: 'Document Expiry Risk', level: expiredDocs.length > 0 ? 100 : expiringDocs.length > 0 ? 50 : 0, evaluated: true },
                        ].map((r) => (
                          <div key={r.label} className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between text-foreground">
                              <span className="font-medium text-foreground/90">{r.label}</span>
                              <span className={cn("tabular-nums font-semibold", r.evaluated && r.level > 50 ? "text-rose-600" : "text-muted-foreground")}>
                                {r.evaluated ? `${r.level}%` : 'N/A'}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  !r.evaluated ? "bg-muted-foreground/20" : r.level > 50 ? "bg-rose-500" : r.level > 25 ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(100, Math.max(0, r.level))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tax & Compliance Checklist — Compact Rows with dividers */}
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between border-b border-border/30 pb-3">
                        <h3 className="flex items-center gap-2 font-semibold text-sm text-foreground">
                          <FileCheck className="size-4 text-primary" /> Tax & Compliance Checklist
                        </h3>
                        <Badge tone={hasGst && hasPan && hasBanking && expiredDocs.length === 0 ? 'success' : 'warning'} className="px-2 py-0.5 text-xs font-semibold rounded-md border-0">
                          {(hasGst && hasPan && hasBanking && expiredDocs.length === 0) ? 'Verified' : 'Incomplete'}
                        </Badge>
                      </div>

                      <div className="divide-y divide-border/20">
                        {[
                          { label: 'GST Registration', sub: detailVendor.gstNumber ? `GST: ${detailVendor.gstNumber}` : 'Not Provided', status: detailVendor.gstNumber ? 'valid' : 'invalid' },
                          { label: 'PAN Registration', sub: detailVendor.panNumber ? `PAN: ${detailVendor.panNumber}` : 'Not Provided', status: detailVendor.panNumber ? 'valid' : 'invalid' },
                          { label: 'Bank Name', sub: detailVendor.bankName ? detailVendor.bankName : 'Not Provided', status: detailVendor.bankName ? 'valid' : 'invalid' },
                          { label: 'Bank Account Number', sub: detailVendor.bankAccountNumber ? `Account: ${detailVendor.bankAccountNumber}` : 'Not Provided', status: detailVendor.bankAccountNumber ? 'valid' : 'invalid' },
                          { label: 'Bank IFSC Code', sub: detailVendor.bankIfscCode ? `IFSC: ${detailVendor.bankIfscCode}` : 'Not Provided', status: detailVendor.bankIfscCode ? 'invalid' : 'invalid' },
                          { label: 'Submitted Documents', sub: `${currentDocs.length} Docs (${expiredDocs.length} Expired, ${expiringDocs.length} Expiring)`, status: expiredDocs.length > 0 ? 'invalid' : expiringDocs.length > 0 ? 'warn' : 'valid' },
                          { label: 'Portal Access', sub: detailVendor.isActive ? 'Active Vendor Account' : 'Inactive Account', status: detailVendor.isActive ? 'valid' : 'warn' },
                          { label: 'Contact Info', sub: (detailVendor.email && detailVendor.phone) ? 'Email & Phone On File' : 'Incomplete', status: (detailVendor.email && detailVendor.phone) ? 'valid' : 'warn' },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center justify-between py-2 text-xs">
                            <div className="flex items-center gap-2.5">
                              {item.status === 'valid' ? (
                                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                              ) : item.status === 'warn' ? (
                                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                              ) : (
                                <X className="size-4 text-rose-600 shrink-0" />
                              )}
                              <span className="font-semibold text-foreground">{item.label}</span>
                            </div>
                            <span className="text-[12px] text-muted-foreground font-medium">{item.sub}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : v360Tab === 'documents' ? (
                /* Tab 2: Documents Repository (Clean table surface, no floating outer card) */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/30 pb-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <FileText className="size-4 text-primary" />
                      <span>Compliance Document Repository</span>
                    </h3>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={cn(
                          "px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                          docFilter === 'all' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setDocFilter('all')}
                      >
                        All ({currentDocs.length})
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                          docFilter === 'expiring' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setDocFilter('expiring')}
                      >
                        Expiring / Expired ({expiredDocs.length + expiringDocs.length})
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer",
                          docFilter === 'valid' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setDocFilter('valid')}
                      >
                        Valid ({validDocsCount})
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-foreground border-collapse">
                      <thead>
                        <tr className="border-b border-border/30 bg-muted/15 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-3">Document Name & Type</th>
                          <th className="px-4 py-3">Submission Date</th>
                          <th className="px-4 py-3">Expiry Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {filteredDocs.length > 0 ? (
                          filteredDocs.map((doc) => {
                            const expInfo = getDocExpiryInfo(doc.expiryDate);
                            return (
                              <tr key={doc.id} className="hover:bg-muted/15 transition-colors">
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                      <FileText className="size-4" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-semibold text-foreground truncate">{doc.name}</span>
                                      <span className="text-xs text-muted-foreground truncate">{doc.type}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDateShort(doc.submittedAt)}
                                </td>
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  {doc.isRenewalRequested ? (
                                    <Badge tone="warning" className="gap-1.5 font-medium px-2 py-0.5 rounded-md border-0">
                                      <Mail className="size-3" /> Renewal Requested
                                    </Badge>
                                  ) : (
                                    <Badge tone={expInfo.isExpired ? 'danger' : expInfo.isExpiringSoon ? 'warning' : 'success'} className="gap-1.5 font-medium px-2 py-0.5 rounded-md border-0">
                                      {expInfo.isExpired ? <AlertTriangle className="size-3" /> : expInfo.isExpiringSoon ? <Clock className="size-3" /> : <CheckCircle2 className="size-3" />}
                                      {expInfo.label}
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setPreviewDoc(doc)}
                                    >
                                      <Eye className="size-3.5" /> View
                                    </Button>
                                    {doc.isRenewalRequested ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/25"
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

                                          setPageMsg(`✅ Vendor (${detailVendor.email}) uploaded renewed ${doc.name}! Document status is now VALID.`);
                                          setTimeout(() => setPageMsg(null), 6000);
                                        }}
                                        title="Simulate Vendor Submitting Renewed Document"
                                      >
                                        <RefreshCw className="size-3.5" /> Submit Renewed Doc
                                      </Button>
                                    ) : (expInfo.isExpired || expInfo.isExpiringSoon) ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="bg-amber-500/12 text-amber-600 border-amber-500/30 hover:bg-amber-500/20"
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
                                        <Send className="size-3.5" /> Request Renewal
                                      </Button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                              No documents found for filter "{docFilter}".
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Tab 3: Banking, Performance & Directory Details — Three Clean Columns with Vertical Dividers */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
                  {/* Column 1: Banking Information */}
                  <div className="space-y-5 pr-0 lg:pr-6">
                    <div className="flex items-center justify-between border-b border-border/30 pb-3">
                      <h3 className="flex items-center gap-2 font-semibold text-sm text-foreground">
                        <Building2 className="size-4 text-primary" /> Banking & Financial Details
                      </h3>
                      <Badge tone={hasBanking ? 'success' : 'warning'} className="px-2 py-0.5 text-xs font-semibold rounded-md border-0">
                        {hasBanking ? 'Configured' : 'Pending'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-md bg-muted/15 border border-border/20 text-center">
                      <div><div className="text-sm font-semibold">{detailVendor.totalOrders}</div><div className="text-[10px] text-muted-foreground uppercase font-bold">Orders</div></div>
                      <div><div className="text-sm font-semibold">{detailVendor.avgQuality > 0 ? `${detailVendor.avgQuality}%` : '—'}</div><div className="text-[10px] text-muted-foreground uppercase font-bold">Quality</div></div>
                      <div><div className="text-sm font-semibold">{detailVendor.avgDelivery > 0 ? `${detailVendor.avgDelivery}%` : '—'}</div><div className="text-[10px] text-muted-foreground uppercase font-bold">Delivery</div></div>
                      <div><div className="text-sm font-semibold">{detailVendor.avgPriceScore > 0 ? `${detailVendor.avgPriceScore}%` : '—'}</div><div className="text-[10px] text-muted-foreground uppercase font-bold">Price</div></div>
                    </div>

                    <div className="space-y-4 text-xs pt-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Banking Details</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Bank Name</span>
                          <span className="font-semibold text-foreground truncate" style={{ color: detailVendor.bankName ? 'inherit' : 'var(--destructive)' }}>
                            {detailVendor.bankName || 'Not Configured'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Branch</span>
                          <span className="font-semibold text-foreground truncate">{detailVendor.bankBranch || '—'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Account Number</span>
                          <span className="font-semibold text-foreground truncate font-mono" style={{ color: detailVendor.bankAccountNumber ? 'inherit' : 'var(--destructive)' }}>
                            {detailVendor.bankAccountNumber || 'Not Configured'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/80">IFSC Code</span>
                          <span className="font-semibold text-foreground truncate font-mono" style={{ color: detailVendor.bankIfscCode ? 'inherit' : 'var(--destructive)' }}>
                            {detailVendor.bankIfscCode || 'Not Configured'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Performance Scorecard */}
                  <div className="pt-6 lg:pt-0 px-0 lg:px-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-border/30 pb-3">
                      <h3 className="flex items-center gap-2 font-semibold text-sm text-foreground">
                        <Activity className="size-4 text-primary" /> Performance Scorecard
                      </h3>
                      <Badge tone="success" className="px-2 py-0.5 text-xs font-semibold rounded-md border-0">
                        {hasEval ? `${detailVendor.overallScore}% Overall` : 'No Eval'}
                      </Badge>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-foreground">
                        <thead>
                          <tr className="border-b border-border/30 text-muted-foreground uppercase font-bold text-[10px]">
                            <th className="py-2">Metric</th>
                            <th className="py-2">Score</th>
                            <th className="py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {[
                            { kpi: 'Quality Score', score: detailVendor.avgQuality > 0 ? `${detailVendor.avgQuality}%` : '—', val: detailVendor.avgQuality },
                            { kpi: 'Delivery Performance', score: detailVendor.avgDelivery > 0 ? `${detailVendor.avgDelivery}%` : '—', val: detailVendor.avgDelivery },
                            { kpi: 'Price Competitiveness', score: detailVendor.avgPriceScore > 0 ? `${detailVendor.avgPriceScore}%` : '—', val: detailVendor.avgPriceScore },
                            { kpi: 'Overall Performance', score: detailVendor.overallScore > 0 ? `${detailVendor.overallScore}%` : '—', val: detailVendor.overallScore },
                          ].map((row) => (
                            <tr key={row.kpi}>
                              <td className="py-2.5 font-medium">{row.kpi}</td>
                              <td className="py-2.5 tabular-nums font-semibold">{row.score}</td>
                              <td className="py-2.5 text-right">
                                <Badge tone={row.val >= 80 ? 'success' : row.val >= 60 ? 'warning' : 'neutral'} className="px-2 py-0.5 text-[11px] font-medium rounded-md border-0">
                                  {row.val >= 80 ? 'Exceeds' : row.val >= 60 ? 'Meets' : row.val > 0 ? 'Under' : 'No Data'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Column 3: Contact & Directory Info */}
                  <div className="pt-6 lg:pt-0 pl-0 lg:pl-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-border/30 pb-3">
                      <h3 className="flex items-center gap-2 font-semibold text-sm text-foreground">
                        <Mail className="size-4 text-primary" /> Contact & Directory Info
                      </h3>
                      <Badge tone={detailVendor.isActive ? 'success' : 'neutral'} className="px-2 py-0.5 text-xs font-semibold rounded-md border-0">
                        {detailVendor.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Email</span>
                        <span className="font-semibold text-foreground truncate">{detailVendor.email}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Phone</span>
                        <span className="font-semibold text-foreground truncate">{detailVendor.phone}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Contact Person</span>
                        <span className="font-semibold text-foreground truncate">{detailVendor.contactPerson}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Category</span>
                        <span className="font-semibold text-foreground truncate">{detailVendor.category}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 col-span-2">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/80">Location & Address</span>
                        <span className="font-semibold text-foreground truncate">{detailVendor.location} · {detailVendor.address || 'Address on file'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border/30 bg-card px-6 py-4 shrink-0">
              <Button
                variant="outline"
                onClick={() => { setDetailVendor(null); setIsFullScreenDetail(false); }}
              >
                Close
              </Button>
              {canCreateVendor ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    openEditModal(detailVendor);
                    setDetailVendor(null);
                    setIsFullScreenDetail(false);
                  }}
                >
                  <Edit3 className="size-4" /> Edit Vendor
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  title="You do not have permission to edit vendors"
                >
                  <ShieldOff className="size-4" /> Edit Vendor
                </Button>
              )}
              {detailVendor.isActive && canCreateVendor && (
                <Button
                  onClick={() => {
                    openCredentialsModal(detailVendor);
                    setDetailVendor(null);
                    setIsFullScreenDetail(false);
                  }}
                >
                  <Send className="size-4" /> Password Setup Email
                </Button>
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

                    <div className="doc-preview-footer">
                      <Button variant="outline" onClick={() => setPreviewDoc(null)}>
                        Close Preview
                      </Button>
                      {previewDoc.fileUrl && (
                        <Button
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = previewDoc.fileUrl!;
                            a.target = '_blank';
                            a.download = previewDoc.name;
                            a.click();
                          }}
                        >
                          <Download size={15} /> Download Document
                        </Button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
