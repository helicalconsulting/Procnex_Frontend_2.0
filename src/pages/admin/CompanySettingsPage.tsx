import { useState, useCallback, useEffect, useRef, useMemo, createElement } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { companySettingsService, ALLOWED_CONTRACT_UPLOAD_EXTENSIONS, type Department, type Category, type Unit, type Position, type PaymentTerm, type CompanyProfile, type EmailTemplate, type RequiredDocument, type DocumentTemplate, type DocumentTemplateInput, type ContractTemplate, type ContractTemplateInput } from '../../services/companySettingsService';
import { invalidateApiCache } from '../../api/client';
import {
  Plus, X, Edit3, Building2, Tag, ChevronDown, ChevronRight, ChevronUp, Search,
  Save, Settings, DollarSign, Trash2, Ruler, Users, CreditCard, Mail, FileText, RotateCcw, Clock,
  Palette, Image, FileSignature, Eye, Upload, Loader2, ArrowRight, Sparkles, AlertTriangle, CheckCircle2, Info, FileCheck,
} from 'lucide-react';
import ImageCropperModal from '../../components/shared/ImageCropperModal';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useBranding } from '../../context/BrandingContext';
import { CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import RichTextEditor from '../../components/shared/RichTextEditor';
import '../../components/shared/RichTextEditor.css';
import './CompanySettingsPage.css';
import SignatureSection from '../../components/shared/SignatureSection';
import '../../components/shared/SignatureSection.css';
import OcrPreview from '../../components/shared/OcrPreview';
import '../../components/shared/OcrPreview.css';
import ErrorBoundary from '../../components/shared/ErrorBoundary';
import { TableSkeleton, CardSkeleton, PageSkeleton, Skeleton } from '../../components/shared/Skeleton';

// ─── Predictive Match Analysis ──────────────────────────────
interface PredictiveMatchResult {
  exact: boolean;
  item: string;
  reason?: string;
  matchScore: number;
}

function analyzePredictiveMatches(
  query: string,
  existingItems: Array<{ id?: number | string; name: string; aliases?: string[] }>,
  excludeId?: number | string
): PredictiveMatchResult | null {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const normQuery = trimmed.toLowerCase();

  // 1. Check exact match
  for (const item of existingItems) {
    if (!item.name) continue;
    if (excludeId !== undefined && String(item.id) === String(excludeId)) continue;
    const normName = item.name.trim().toLowerCase();

    if (normName === normQuery) {
      return { exact: true, item: item.name, matchScore: 100 };
    }
    if (item.aliases && item.aliases.some((a) => a.trim().toLowerCase() === normQuery)) {
      return { exact: true, item: item.name, reason: `Matches alias of "${item.name}"`, matchScore: 100 };
    }
  }

  // 2. Check high similarity match (substring/contains/words)
  for (const item of existingItems) {
    if (!item.name) continue;
    if (excludeId !== undefined && String(item.id) === String(excludeId)) continue;
    const normName = item.name.trim().toLowerCase();

    if (normName.includes(normQuery) || normQuery.includes(normName)) {
      const score = Math.round((Math.min(normQuery.length, normName.length) / Math.max(normQuery.length, normName.length)) * 100);
      return { exact: false, item: item.name, matchScore: Math.max(70, score) };
    }

    if (item.aliases) {
      for (const a of item.aliases) {
        const normAlias = a.trim().toLowerCase();
        if (normAlias.includes(normQuery) || normQuery.includes(normAlias)) {
          return { exact: false, item: item.name, reason: `Similar to alias "${a}" of "${item.name}"`, matchScore: 75 };
        }
      }
    }
  }

  return null;
}

function PredictiveMatchCard({
  query,
  items,
  excludeId,
  labelName = 'item',
}: {
  query: string;
  items: Array<{ id?: number | string; name: string; aliases?: string[] }>;
  excludeId?: number | string;
  labelName?: string;
}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const result = analyzePredictiveMatches(query, items, excludeId);

  if (!result) {
    return (
      <div className="cs-predictive-card cs-predictive-card--unique">
        <CheckCircle2 size={13} className="cs-predictive-icon" />
        <span>Predictive Analysis: Name is unique &amp; available</span>
      </div>
    );
  }

  if (result.exact) {
    return (
      <div className="cs-predictive-card cs-predictive-card--exact">
        <AlertTriangle size={13} className="cs-predictive-icon" />
        <span>
          <strong>Predictive Match (100%):</strong> {labelName} <strong>"{result.item}"</strong> already exists. {result.reason || ''}
        </span>
      </div>
    );
  }

  return (
    <div className="cs-predictive-card cs-predictive-card--similar">
      <Sparkles size={13} className="cs-predictive-icon" />
      <span>
        <strong>Predictive Analysis ({result.matchScore}% Match):</strong> Similar {labelName.toLowerCase()} found: <strong>"{result.item}"</strong>. {result.reason || 'Please verify to avoid duplicates.'}
      </span>
    </div>
  );
}

// ─── Utility: Convert structured plain text to HTML ─────────
// Converts plain text with layout (indentation, spacing, line breaks)
// to HTML suitable for the RichTextEditor, preserving the original
// document structure from OCR layout reconstruction.
function textToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') {
        // Empty line → paragraph break
        return '<p><br></p>';
      }
      // Escape HTML special characters first
      let escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Count leading spaces for indentation
      const leadingMatch = escaped.match(/^ +/);
      const leadingCount = leadingMatch ? leadingMatch[0].length : 0;

      // Replace leading spaces with &nbsp; entities
      if (leadingCount > 0) {
        const indent = '&nbsp;'.repeat(leadingCount);
        escaped = indent + escaped.slice(leadingCount);
      }

      // Replace remaining runs of 2+ spaces with &nbsp; to preserve alignment
      // Single spaces stay as-is (normal word separator)
      escaped = escaped.replace(/  +/g, (match) => '&nbsp;'.repeat(match.length));

      return '<p>' + escaped + '</p>';
    })
    .join('\n');
}

// ─── Tab Definitions ────────────────────────────────────────

type TabKey = 'general' | 'branding' | 'departments' | 'positions' | 'forms' | 'form-documents' | 'email-templates' | 'documents-contracts';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { key: 'general',             label: 'General',                icon: <Settings size={15} /> },
  { key: 'branding',            label: 'Branding',               icon: <Palette size={15} /> },
  { key: 'departments',         label: 'Departments',            icon: <Building2 size={15} /> },
  { key: 'positions',           label: 'Positions',              icon: <Users size={15} /> },
  { key: 'forms',               label: 'Forms Settings',         icon: <FileText size={15} /> },
  { key: 'form-documents',      label: 'Required Documents',     icon: <FileCheck size={15} /> },
  { key: 'email-templates',     label: 'Email Templates',        icon: <Mail size={15} /> },
  { key: 'documents-contracts', label: 'Documents & Contracts',  icon: <FileSignature size={15} /> },
];

// ─── Email Template Labels & Placeholders ───────────────────

const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  vendor_onboarding_invitation: 'Supplier Onboarding Invitation',
  vendor_approval_credentials: 'Vendor Portal Credentials',
  vendor_password_setup: 'Vendor Password Setup',
  vendor_rejection_resubmit: 'Onboarding Revision Required',
  rfq_invitation: 'RFQ Invitation (Existing Vendor)',
  new_vendor_rfq_invitation: 'RFQ Invitation (New Vendor)',
  quotation_approval: 'Quotation Approval Request',
  quotation_submitted: 'Quotation Submitted Notification',
  vendor_winning: 'Vendor Winning Notification',
  vendor_not_selected: 'Vendor Not Selected',
  vendor_quotation_returned: 'Quotation Returned to Vendor',
  quotation_returned_review: 'Quotation Returned for Re-review',
  po_to_vendor: 'Purchase Order to Vendor',
  po_info_copy: 'PO Info Copy (CC Vendors)',
};

const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_LABELS);

const EMAIL_PLACEHOLDERS: Record<string, string> = {
  '{{recipient}}': 'Recipient name (contact person or vendor name)',
  '{{vendorName}}': 'Vendor company name',
  '{{company}}': 'Your company name',
  '{{rfqNumber}}': 'RFQ number',
  '{{rfqTitle}}': 'RFQ title',
  '{{poNumber}}': 'Purchase Order number',
  '{{winningVendorName}}': 'Name of the winning vendor',
  '{{returnedByLevel}}': 'Approval level number',
  '{{invitationExpiryDays}}': 'Number of days until the onboarding invitation expires (set in Company Settings > Time Limits)',
  '{{resubmissionDeadlineDays}}': 'Number of days the vendor has to resubmit after rejection (set in Company Settings > Time Limits)',
};

// ─── Component ──────────────────────────────────────────────

export default function CompanySettingsPage() {
  // Data
  const { data: departments, loading, reload } = useServiceData(
    () => companySettingsService.listDepartments(),
    [] as Department[],
    [],
    { cacheTtlMs: 60000 }
  );

  const { data: categories, reload: reloadCategories } = useServiceData(
    () => companySettingsService.listCategories(),
    [] as Category[],
    [],
    { cacheTtlMs: 60000 }
  );

  const { data: units, reload: reloadUnits } = useServiceData(
    () => companySettingsService.listUnits(),
    [] as Unit[],
    [],
    { cacheTtlMs: 60000 }
  );

  const { data: positions, reload: reloadPositions } = useServiceData(
    () => companySettingsService.listPositions(),
    [] as Position[],
    [],
    { cacheTtlMs: 60000 }
  );

  const { data: paymentTerms, reload: reloadPaymentTerms } = useServiceData(
    () => companySettingsService.listPaymentTerms(),
    [] as PaymentTerm[],
    [],
    { cacheTtlMs: 60000 }
  );

  const { data: requiredDocuments, loading: requiredDocsLoading, reload: reloadRequiredDocuments } = useServiceData(
    () => companySettingsService.listRequiredDocuments(),
    [] as RequiredDocument[],
    [],
    { cacheTtlMs: 30000 }
  );

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [docContractSubTab, setDocContractSubTab] = useState<'contracts' | 'doc-templates'>('contracts');
  const [search, setSearch] = useState('');
  const [expandedDept, setExpandedDept] = useState<Set<number>>(new Set());
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Currency default
  const { companyDefaultCurrency: ctxDefaultCurrency, setCompanyDefaultCurrency } = useCurrency();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [savingCurrency, setSavingCurrency] = useState(false);

  // Portal name
  const [portalName, setPortalName] = useState('Employee');
  const [pendingPortalName, setPendingPortalName] = useState<string | null>(null);

  // Time limit settings
  const [invitationExpiryHours, setInvitationExpiryHours] = useState(168);
  const [resubmissionDeadlineHours, setResubmissionDeadlineHours] = useState(72);
  const [pendingInvitationExpiry, setPendingInvitationExpiry] = useState<number | null>(null);
  const [pendingResubmissionDeadline, setPendingResubmissionDeadline] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await companySettingsService.getCompanyProfile();
        setProfile(p);
        setInvitationExpiryHours(p.invitationExpiryHours ?? 168);
        setResubmissionDeadlineHours(p.resubmissionDeadlineHours ?? 72);
        setPortalName(p.primaryPortalName || 'Employee');
      } catch {
        // ignore
      }
    })();
  }, []);

  // The currently saved currency from the backend
  const savedCurrency = profile?.defaultCurrency || ctxDefaultCurrency;
  // Effective display value: use pending if different from saved, else saved
  const displayCurrency = pendingCurrency !== null ? pendingCurrency : savedCurrency;
  const hasPendingChange = pendingCurrency !== null && pendingCurrency !== savedCurrency;

  const handleCurrencySelect = useCallback((code: string) => {
    // Just store the selection - don't save yet
    setPendingCurrency(code);
  }, []);

  const hasPortalNameChange = pendingPortalName !== null && pendingPortalName !== portalName;

  const hasTimeLimitChanges = (pendingInvitationExpiry !== null && pendingInvitationExpiry !== invitationExpiryHours) ||
    (pendingResubmissionDeadline !== null && pendingResubmissionDeadline !== resubmissionDeadlineHours);

  const handleSaveGeneralSettings = useCallback(async () => {
    const currencyToSave = pendingCurrency || savedCurrency;
    const invExpiry = pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours;
    const resubDeadline = pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours;
    const nameToSave = pendingPortalName !== null ? pendingPortalName : portalName;

    if (!hasPendingChange && !hasTimeLimitChanges && !hasPortalNameChange) return;

    setSavingCurrency(true);
    setPageMsg(null);
    try {
      const payload: Record<string, unknown> = {
        defaultCurrency: currencyToSave,
      };
      if (hasTimeLimitChanges) {
        payload.invitationExpiryHours = invExpiry;
        payload.resubmissionDeadlineHours = resubDeadline;
      }
      if (hasPortalNameChange) {
        payload.primaryPortalName = nameToSave;
      }
      const updated = await companySettingsService.updateCompanyProfile(payload);
      setProfile(updated);
      setCompanyDefaultCurrency(currencyToSave);
      setInvitationExpiryHours(updated.invitationExpiryHours);
      setResubmissionDeadlineHours(updated.resubmissionDeadlineHours);
      setPortalName(updated.primaryPortalName || 'Employee');
      setPendingCurrency(null);
      setPendingInvitationExpiry(null);
      setPendingResubmissionDeadline(null);
      setPendingPortalName(null);

      // Refresh branding context so login pages reflect the change immediately
      if (hasPortalNameChange) {
        refreshBranding();
      }

      const changes: string[] = [];
      if (hasPendingChange) changes.push(`currency changed to ${currencyToSave}`);
      if (hasTimeLimitChanges) changes.push('time limits updated');
      if (hasPortalNameChange) changes.push(`portal name changed to "${nameToSave}"`);
      setPageMsg(`Settings saved: ${changes.join(', ')}.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingCurrency(false);
    }
  }, [pendingCurrency, savedCurrency, pendingInvitationExpiry, invitationExpiryHours, pendingResubmissionDeadline, resubmissionDeadlineHours, hasPendingChange, hasTimeLimitChanges, hasPortalNameChange, pendingPortalName, portalName, setCompanyDefaultCurrency]);

  const handleCurrencyCancel = useCallback(() => {
    setPendingCurrency(null);
    setPendingInvitationExpiry(null);
    setPendingResubmissionDeadline(null);
    setPendingPortalName(null);
  }, []);

  // ── White Label / Branding ──
  const { refresh: refreshBranding } = useBranding();
  const [brandingName, setBrandingName] = useState('');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState('');
  const [brandingFaviconUrl, setBrandingFaviconUrl] = useState('');
  const [brandingColor, setBrandingColor] = useState('#0a6ed1');
  const [brandingLoginText, setBrandingLoginText] = useState('');
  const [brandingSupportEmail, setBrandingSupportEmail] = useState('');
  const [brandingCompanyPhone, setBrandingCompanyPhone] = useState('');
  const [brandingCompanyEmail, setBrandingCompanyEmail] = useState('');
  const [brandingDirty, setBrandingDirty] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [removingFavicon, setRemovingFavicon] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const brandingInitialized = useRef(false);

  // Load branding from profile once
  useEffect(() => {
    if (profile && !brandingInitialized.current) {
      brandingInitialized.current = true;
      setBrandingName(profile.companyName || '');
      setBrandingLogoUrl(profile.logoUrl || '');
      setBrandingFaviconUrl(profile.faviconUrl || '');
      setBrandingColor(profile.primaryColor || '#0a6ed1');
      setBrandingLoginText(profile.loginText || '');
      setBrandingSupportEmail(profile.supportEmail || '');
      setBrandingCompanyPhone(profile.companyPhone || '');
      setBrandingCompanyEmail(profile.companyEmail || '');
    }
  }, [profile]);

  const handleSaveBranding = useCallback(async () => {
    if (!brandingDirty) return;
    setSavingBranding(true);
    setPageMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      if (brandingName !== (profile?.companyName || '')) payload.companyName = brandingName;
      if (brandingLogoUrl !== (profile?.logoUrl || '')) payload.logoUrl = brandingLogoUrl;
      if (brandingFaviconUrl !== (profile?.faviconUrl || '')) payload.faviconUrl = brandingFaviconUrl;
      if (brandingColor !== (profile?.primaryColor || '#0a6ed1')) payload.primaryColor = brandingColor;
      if (brandingLoginText !== (profile?.loginText || '')) payload.loginText = brandingLoginText;
      if (brandingSupportEmail !== (profile?.supportEmail || '')) payload.supportEmail = brandingSupportEmail;
      if (brandingCompanyPhone !== (profile?.companyPhone || '')) payload.companyPhone = brandingCompanyPhone;
      if (brandingCompanyEmail !== (profile?.companyEmail || '')) payload.companyEmail = brandingCompanyEmail;

      if (Object.keys(payload).length === 0) {
        setPageMsg('No changes to save.');
        return;
      }

      const updated = await companySettingsService.updateCompanyProfile(payload);
      setProfile(updated);
      setBrandingDirty(false);
      setPageMsg('Branding settings saved successfully! Changes applied immediately.');
      refreshBranding();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save branding settings');
    } finally {
      setSavingBranding(false);
    }
  }, [brandingDirty, brandingName, brandingLogoUrl, brandingFaviconUrl, brandingColor, brandingLoginText, brandingSupportEmail, brandingCompanyPhone, brandingCompanyEmail, profile, refreshBranding]);

  const markBrandingDirty = useCallback(() => {
    if (!brandingDirty) setBrandingDirty(true);
  }, [brandingDirty]);

  // ── Image Cropper (after branding so all variables are declared) ──
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropType, setCropType] = useState<'logo' | 'favicon'>('logo');

  const handleCropAndUpload = useCallback(async (blob: Blob) => {
    const type = cropType;
    setCropFile(null);
    if (type === 'logo') setUploadingLogo(true);
    else setUploadingFavicon(true);
    try {
      const file = new File([blob], `${type}-${Date.now()}.png`, { type: 'image/png' });
      const result = await companySettingsService.uploadBrandingImage(type, file);
      if (type === 'logo') {
        setBrandingLogoUrl(result.url);
      } else {
        setBrandingFaviconUrl(result.url);
        // Apply favicon immediately to browser tab
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
        link.rel = 'icon';
        link.href = result.url;
        if (!link.parentNode) document.head.appendChild(link);
      }
      setProfile(result.profile);
      setPageMsg(`${type === 'logo' ? 'Logo' : 'Favicon'} uploaded successfully!`);
      // Bust the GET cache for /company-settings/profile so refreshBranding()
      // fetches fresh data (uploadBrandingImage uses raw fetch, not apiRequest)
      invalidateApiCache('/company-settings/profile');
      refreshBranding();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingFavicon(false);
    }
  }, [cropType, refreshBranding]);

  // Modal state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptError, setDeptError] = useState<string | null>(null);

  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catDeptId, setCatDeptId] = useState<string>('');
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catError, setCatError] = useState<string | null>(null);

  // Unit modal state
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [unitAliases, setUnitAliases] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);

  // Payment Term modal state
  const [showPaymentTermModal, setShowPaymentTermModal] = useState(false);
  const [paymentTermName, setPaymentTermName] = useState('');
  const [paymentTermError, setPaymentTermError] = useState<string | null>(null);

  // Position modal state
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [positionName, setPositionName] = useState('');
  const [positionDesc, setPositionDesc] = useState('');
  const [positionError, setPositionError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'department' | 'category' | 'unit' | 'position' | 'paymentTerm' | 'requiredDocument'; id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Custom confirmation modal state
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  // Filtered departments
  const filtered = search.trim()
    ? departments.filter(
        (d) => d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.description?.toLowerCase().includes(search.toLowerCase())
      )
    : departments;

  // Categories grouped by department
  const categoriesByDept = new Map<number, Category[]>();
  for (const cat of categories) {
    const existing = categoriesByDept.get(cat.departmentId);
    if (existing) existing.push(cat);
    else categoriesByDept.set(cat.departmentId, [cat]);
  }

  const toggleExpand = (id: number) => {
    setExpandedDept((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Email Templates ──
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [emailTemplatesLoading, setEmailTemplatesLoading] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [editedBodyHtml, setEditedBodyHtml] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  const [emailFilterType, setEmailFilterType] = useState('ALL');

  const filteredEmailTemplateKeys = useMemo(() => {
    return EMAIL_TEMPLATE_KEYS.filter(key => {
      const label = EMAIL_TEMPLATE_LABELS[key] || key;
      const matchesSearch = !emailSearchQuery.trim() ||
        label.toLowerCase().includes(emailSearchQuery.toLowerCase()) ||
        key.toLowerCase().includes(emailSearchQuery.toLowerCase());

      const saved = emailTemplates.find(t => t.templateKey === key);
      const isCustom = !!saved && saved.bodyHtml !== '' && saved.bodyHtml !== undefined;

      if (emailFilterType === 'CUSTOMIZED') return matchesSearch && isCustom;
      if (emailFilterType === 'DEFAULT') return matchesSearch && !isCustom;
      return matchesSearch;
    });
  }, [emailTemplates, emailSearchQuery, emailFilterType, EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS]);

  const selectedTemplate = emailTemplates.find((t) => t.templateKey === selectedTemplateKey);
  const isDefaultTemplate = selectedTemplate && !emailTemplates.find(
    (t) => t.templateKey === selectedTemplateKey
  )?.subject;

  const fetchEmailTemplates = useCallback(async () => {
    setEmailTemplatesLoading(true);
    try {
      const templates = await companySettingsService.listEmailTemplates();
      setEmailTemplates(templates);
    } catch {
      // ignore
    } finally {
      setEmailTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'email-templates') {
      fetchEmailTemplates();
    }
  }, [activeTab, fetchEmailTemplates]);

  const handleSelectTemplate = useCallback((key: string) => {
    const proceed = () => {
      setSelectedTemplateKey(key);
      setTemplateDirty(false);
      const tmpl = emailTemplates.find((t) => t.templateKey === key);
      setEditedBodyHtml(tmpl?.bodyHtml || '');
    };
    if (templateDirty) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: proceed,
      });
    } else {
      proceed();
    }
  }, [emailTemplates, templateDirty]);

  const handleBodyChange = useCallback((html: string) => {
    setEditedBodyHtml(html);
    setTemplateDirty(true);
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!selectedTemplateKey || !editedBodyHtml) return;
    setSavingTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.updateEmailTemplate(selectedTemplateKey, editedBodyHtml);
      setEmailTemplates((prev) =>
        prev.map((t) => (t.templateKey === selectedTemplateKey ? updated : t))
      );
      setTemplateDirty(false);
      setPageMsg(`Email template "${EMAIL_TEMPLATE_LABELS[selectedTemplateKey] || selectedTemplateKey}" updated.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  }, [selectedTemplateKey, editedBodyHtml]);

  const handleResetTemplate = useCallback(async () => {
    if (!selectedTemplateKey) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Reset Email Template?',
      message: 'Reset this template to its default content? Unsaved changes will be discarded.',
      confirmText: 'Reset Content',
      cancelText: 'Cancel',
      variant: 'warning',
      onConfirm: async () => {
        setSavingTemplate(true);
        setPageMsg(null);
        try {
          await companySettingsService.resetEmailTemplate(selectedTemplateKey);
          setEditedBodyHtml('');
          setTemplateDirty(false);
          await fetchEmailTemplates();
          setPageMsg(`Email template "${EMAIL_TEMPLATE_LABELS[selectedTemplateKey] || selectedTemplateKey}" reset to default.`);
        } catch (err) {
          setPageMsg(err instanceof Error ? err.message : 'Failed to reset template');
        } finally {
          setSavingTemplate(false);
        }
      },
    });
  }, [selectedTemplateKey, fetchEmailTemplates]);

  // ── Contract Templates (Company Settings) state ──
  const [contractTemplates, setContractTemplates] = useState<ContractTemplate[]>([]);
  const [contractTemplatesLoading, setContractTemplatesLoading] = useState(false);
  const [selectedContractType, setSelectedContractType] = useState<string | null>(null);
  const [editedContractContent, setEditedContractContent] = useState('');
  const [editedContractName, setEditedContractName] = useState('');
  const [editedContractDescription, setEditedContractDescription] = useState('');
  const [editedContractIsActive, setEditedContractIsActive] = useState(true);
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [contractTemplateDirty, setContractTemplateDirty] = useState(false);
  const [savingContractTemplate, setSavingContractTemplate] = useState(false);
  const [editingNewContractType, setEditingNewContractType] = useState(false);
  const [newContractTypeName, setNewContractTypeName] = useState('');
  const [renamingContractType, setRenamingContractType] = useState<string | null>(null);
  const [renamingContractTypeName, setRenamingContractTypeName] = useState('');
  const [deleteContractTypeTarget, setDeleteContractTypeTarget] = useState<string | null>(null);
  const [contractFileUploading, setContractFileUploading] = useState(false);
  const [contractSearchQuery, setContractSearchQuery] = useState('');
  const [contractFilterType, setContractFilterType] = useState('ALL');
  const ocrPollActiveRef = useRef(false);

  const filteredContractTemplates = useMemo(() => {
    return contractTemplates.filter(t => {
      const matchesSearch = !contractSearchQuery.trim() ||
        t.name.toLowerCase().includes(contractSearchQuery.toLowerCase()) ||
        t.type.toLowerCase().includes(contractSearchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [contractTemplates, contractSearchQuery]);

  const CONTRACT_PLACEHOLDERS: Record<string, string> = {
    '{{company_name}}': 'Company name',
    '{{vendor_name}}': 'Vendor name',
    '{{vendor_address}}': 'Vendor address',
    '{{vendor_email}}': 'Vendor email',
    '{{vendor_contact}}': 'Vendor contact',
    '{{rfq_number}}': 'RFQ number',
    '{{contract_number}}': 'Auto-generated contract number',
    '{{effective_date}}': 'Contract effective date',
    '{{expiry_date}}': 'Contract expiry date',
    '{{payment_terms}}': 'Payment terms',
    '{{delivery_terms}}': 'Delivery terms',
    '{{currency}}': 'Currency code',
    '{{contract_value}}': 'Contract value',
    '{{created_date}}': 'Creation date',
    '{{companySignature}}': 'Company signature image (auto-embedded from default signature)',
    '{{company_signature}}': 'Company signature image (auto-embedded from default signature)',
  };

  const fetchContractTemplates = useCallback(async () => {
    setContractTemplatesLoading(true);
    try {
      const templates = await companySettingsService.listContractTemplates();
      // Reset any PROCESSING status from backend — OCR should only show as
      // processing when the user explicitly clicks "Run OCR" in the preview.
      const cleaned = templates.map(t => ({
        ...t,
        ocrStatus: t.ocrStatus === 'PROCESSING' ? null : t.ocrStatus,
      }));
      setContractTemplates(cleaned);
    } catch {
      // ignore
    } finally {
      setContractTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'documents-contracts') {
      fetchContractTemplates();
    }
  }, [activeTab, fetchContractTemplates]);

  const selectedContractTemplate = contractTemplates.find(t => t.type === selectedContractType);
  const contractTemplateIsDefault = !selectedContractTemplate || selectedContractTemplate.version <= 1;

  const handleSelectContractType = useCallback(async (type: string) => {
    const proceed = async () => {
      setSelectedContractType(type);
      setContractTemplateDirty(false);
      const tmpl = contractTemplates.find(t => t.type === type);
      if (tmpl && tmpl.content) {
        setEditedContractContent(tmpl.content);
        setEditedContractName(tmpl.name || type);
        setEditedContractDescription(tmpl?.description || '');
        setEditedContractIsActive(tmpl?.isActive ?? true);
      } else {
        // No saved template with content — fetch default content from backend
        try {
          const result = await companySettingsService.getContractTemplate(type);
          if (result?.defaultContent) {
            setEditedContractContent(result.defaultContent);
          } else if (result?.template?.content) {
            setEditedContractContent(result.template.content);
          }
          if (result?.template) {
            setEditedContractName(result.template.name || type);
            setEditedContractDescription(result.template.description || '');
            setEditedContractIsActive(result.template.isActive ?? true);
          } else {
            setEditedContractName(type);
          }
        } catch { /* ignore */
          setEditedContractName(tmpl?.name || type);
        }
      }
    };
    if (contractTemplateDirty) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: proceed,
      });
    } else {
      await proceed();
    }
  }, [contractTemplates, contractTemplateDirty]);

  const handleContractContentChange = useCallback((html: string) => {
    setEditedContractContent(html);
    setContractTemplateDirty(true);
  }, []);

  const handleContractNameChange = useCallback((name: string) => {
    setEditedContractName(name);
    setContractTemplateDirty(true);
  }, []);

  const handleSaveContractTemplate = useCallback(async () => {
    if (!selectedContractType || !editedContractContent) return;
    setSavingContractTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.saveContractTemplate(selectedContractType, {
        name: editedContractName.trim(),
        content: editedContractContent,
        description: editedContractDescription.trim() || null,
        isActive: editedContractIsActive,
      });
      setContractTemplates((prev) => {
        const filtered = prev.filter(t => t.type !== selectedContractType);
        return [...filtered, updated];
      });
      setContractTemplateDirty(false);
      setPageMsg(`${selectedContractType} template saved successfully.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save contract template');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [selectedContractType, editedContractContent, editedContractName, editedContractDescription, editedContractIsActive]);

  const handleResetContractTemplate = useCallback(async () => {
    if (!selectedContractType) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Reset Contract Template?',
      message: 'Reset this template content to its default state? Unsaved changes will be discarded.',
      confirmText: 'Reset Content',
      cancelText: 'Cancel',
      variant: 'warning',
      onConfirm: async () => {
        setSavingContractTemplate(true);
        setPageMsg(null);
        try {
          const tmpl = contractTemplates.find(t => t.type === selectedContractType);
          const result = await companySettingsService.getContractTemplate(selectedContractType);
          const defaultContent = result?.defaultContent || result?.template?.content || tmpl?.content || '';
          setEditedContractContent(defaultContent);
          if (tmpl) {
            setEditedContractName(tmpl.name || selectedContractType);
            setEditedContractDescription(tmpl.description || '');
            setEditedContractIsActive(tmpl.isActive ?? true);
          }
          setContractTemplateDirty(false);
          setPageMsg('Template content reset to default.');
        } catch (err) {
          setPageMsg(err instanceof Error ? err.message : 'Failed to reset template');
        } finally {
          setSavingContractTemplate(false);
        }
      },
    });
  }, [selectedContractType, contractTemplates]);

  const handleCreateNewContractType = useCallback(async () => {
    const typeName = newContractTypeName.trim()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (!typeName) return;
    setSavingContractTemplate(true);
    setPageMsg(null);
    try {
      const created = await companySettingsService.saveContractTemplate(typeName, {
        name: newContractTypeName.trim(),
        content: '<h1>' + newContractTypeName.trim() + '</h1><p>Template for {{contractType}}.</p>',
        isActive: true,
      });
      setContractTemplates(prev => [...prev, created]);
      setSelectedContractType(typeName);
      setEditedContractContent(created.content);
      setEditedContractName(created.name);
      setEditingNewContractType(false);
      setNewContractTypeName('');
      setPageMsg('Contract type "' + newContractTypeName.trim() + '" created. Edit the content below.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to create contract type');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [newContractTypeName]);

  const handleRenameContractType = useCallback(async (type: string, newName: string) => {
    if (!newName.trim() || newName.trim() === contractTemplates.find(t => t.type === type)?.name) {
      setRenamingContractType(null);
      return;
    }
    setSavingContractTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.saveContractTemplate(type, {
        name: newName.trim(),
        content: contractTemplates.find(t => t.type === type)?.content || '',
        isActive: true,
      });
      setContractTemplates(prev => prev.map(t => t.type === type ? updated : t));
      if (selectedContractType === type) {
        setEditedContractName(updated.name);
      }
      setRenamingContractType(null);
      setPageMsg(`Contract type renamed to "${newName.trim()}".`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to rename contract type');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [contractTemplates, selectedContractType]);

  const handleDeleteContractType = useCallback((type: string) => {
    setDeleteContractTypeTarget(type);
  }, []);

  const handleDeleteContractTypeConfirm = useCallback(async () => {
    const type = deleteContractTypeTarget;
    if (!type) return;
    const template = contractTemplates.find(t => t.type === type);
    const typeLabel = template?.name || type;
    setSavingContractTemplate(true);
    setPageMsg(null);
    setDeleteContractTypeTarget(null);
    try {
      await companySettingsService.deleteContractTemplate(type);
      setContractTemplates(prev => prev.filter(t => t.type !== type));
      // Re-fetch to reload default templates from backend
      fetchContractTemplates();
      if (selectedContractType === type) {
        setSelectedContractType(null);
        setEditedContractContent('');
        setEditedContractName('');
      }
      setPageMsg(`Contract type "${typeLabel}" deleted.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete contract type');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [deleteContractTypeTarget, contractTemplates, selectedContractType]);

  const cancelDeleteContractType = useCallback(() => {
    setDeleteContractTypeTarget(null);
  }, []);

  // ── OCR Handlers ──
  const handleTriggerContractOcr = useCallback(async () => {
    if (!selectedContractType) return;
    // Cancel any previous OCR polling
    ocrPollActiveRef.current = false;

    // Show processing state inside the OCR Preview box immediately
    setContractTemplates(prev => prev.map(t =>
      t.type === selectedContractType
        ? { ...t, ocrStatus: 'PROCESSING' }
        : t
    ));
    try {
      await companySettingsService.triggerContractOcr(selectedContractType);

      // Poll for OCR status until COMPLETED, FAILED, or extended timeout (5 min for scanned PDFs)
      const typeAtTrigger = selectedContractType;
      const MAX_POLL_MS = 300000; // 5 minutes for large scanned PDFs
      const INTERVAL_MS = 3000;
      const LONG_INTERVAL_MS = 10000; // Poll less frequently after the initial timeout window
      const startTime = Date.now();
      ocrPollActiveRef.current = true;

      const poll = async () => {
        // Stop polling if cancelled (new OCR trigger or component unmount)
        if (!ocrPollActiveRef.current) return;

        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
          ocrPollActiveRef.current = false;
          // Don't call fetchContractTemplates as it resets PROCESSING to null.
          // Instead, update the message so user knows OCR is still running.
          setPageMsg('OCR is still running on the server. Refresh the page later to check the result.');
          return;
        }
        try {
          const status = await companySettingsService.getContractOcrStatus(typeAtTrigger);
          if (status.ocrStatus === 'COMPLETED' || status.ocrStatus === 'FAILED') {
            ocrPollActiveRef.current = false;
            // Bust cache so next fetchContractTemplates gets fresh data
            invalidateApiCache('/company-settings/contract-templates');
            setContractTemplates(prev => prev.map(t =>
              t.type === typeAtTrigger
                ? { ...t, ocrText: status.ocrText, ocrStatus: status.ocrStatus, ocrProcessedAt: status.ocrProcessedAt }
                : t
            ));
            if (status.ocrStatus === 'COMPLETED' && status.ocrText) {
              // Convert plain text with layout to HTML for the rich text editor
              setEditedContractContent(textToHtml(status.ocrText));
              setContractTemplateDirty(true);
              setPageMsg('OCR completed! Text extracted and applied as template content.');
            } else if (status.ocrStatus === 'FAILED') {
              setPageMsg('OCR failed. The uploaded file may contain no readable text.');
            }
          } else {
            // Use longer interval if we've already waited a while
            const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
            setTimeout(poll, interval);
          }
        } catch {
          // On API error, retry with the appropriate interval
          const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
          setTimeout(poll, interval);
        }
      };

      // Start polling after a short initial delay
      setTimeout(poll, 3000);
    } catch (err) {
      ocrPollActiveRef.current = false;
      setContractTemplates(prev => prev.map(t =>
        t.type === selectedContractType
          ? { ...t, ocrStatus: null }
          : t
      ));
      setPageMsg(err instanceof Error ? err.message : 'Failed to trigger OCR');
    }
  }, [selectedContractType]);

  // Cancel OCR polling on unmount
  useEffect(() => {
    return () => { ocrPollActiveRef.current = false; };
  }, []);

  // Cancel document OCR polling on unmount
  useEffect(() => {
    return () => { docOcrPollActiveRef.current = false; };
  }, []);

  const handleSaveContractOcrText = useCallback(async (text: string) => {
    if (!selectedContractType) return;
    try {
      await companySettingsService.saveContractOcrText(selectedContractType, text);
      setContractTemplates(prev => prev.map(t =>
        t.type === selectedContractType ? { ...t, ocrText: text } : t
      ));
      setPageMsg('OCR text saved.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save OCR text');
    }
  }, [selectedContractType]);

  // ── Document Templates (NDA / MNDA) state ──
  // Supports MULTIPLE templates per type (like Contract Templates)
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [docTemplatesLoading, setDocTemplatesLoading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [editedDocContent, setEditedDocContent] = useState('');
  const [editedDocName, setEditedDocName] = useState('');
  const [docTemplateDirty, setDocTemplateDirty] = useState(false);
  const [savingDocTemplate, setSavingDocTemplate] = useState(false);
  const [docFileUploading, setDocFileUploading] = useState(false);
  const [editingNewDoc, setEditingNewDoc] = useState<'NDA' | 'MNDA' | 'ANY_OTHER' | null>(null);
  const [newDocName, setNewDocName] = useState('');
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renamingDocName, setRenamingDocName] = useState('');
  const [deleteDocIdTarget, setDeleteDocIdTarget] = useState<string | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | 'NDA' | 'MNDA' | 'ANY_OTHER'>('ALL');
  const docOcrPollActiveRef = useRef(false);

  // Derived values for the currently selected document template
  const selectedDocTemplate = useMemo(
    () => documentTemplates.find(t => t.id === selectedDocId) || null,
    [documentTemplates, selectedDocId]
  );
  const docTemplateIsDefault = !selectedDocTemplate || selectedDocTemplate.version <= 1;

  const filteredDocTemplates = useMemo(() => {
    return documentTemplates.filter(t => {
      const matchesType = docTypeFilter === 'ALL' || t.type === docTypeFilter;
      const matchesSearch = !docSearchQuery.trim() || t.name.toLowerCase().includes(docSearchQuery.toLowerCase()) || t.type.toLowerCase().includes(docSearchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [documentTemplates, docTypeFilter, docSearchQuery]);

  const DOC_TEMPLATE_TYPES = ['NDA', 'MNDA', 'ANY_OTHER'] as const;
  const DOC_TEMPLATE_LABELS: Record<string, string> = {
    'NDA': 'Non-Disclosure Agreement',
    'MNDA': 'Mutual Non-Disclosure Agreement',
    'ANY_OTHER': 'Any Other Document',
  };

  const DOC_TEMPLATE_PLACEHOLDERS: Record<string, string> = {
    '{{companyName}}': 'Company name from Company Settings',
    '{{companyAddress}}': 'Company address from Company Settings',
    '{{companyEmail}}': 'Company support email from Company Settings',
    '{{companyPhone}}': 'Company phone number',
    '{{companySignatory}}': 'Company signatory name',
    '{{companyDesignation}}': 'Company signatory designation/title',
    '{{companySignature}}': 'Company signature image (auto-embedded)',
    '{{vendorName}}': 'Vendor/supplier company name',
    '{{vendorCompany}}': 'Vendor company name',
    '{{vendorEmail}}': 'Vendor email address',
    '{{vendorPhone}}': 'Vendor phone number',
    '{{vendorAddress}}': 'Vendor address from onboarding form',
    '{{vendorSignature}}': 'Vendor signature image',
    '{{currentDate}}': 'Current date of document generation',
    '{{effectiveDate}}': 'Effective date of the agreement',
    '{{signedBy}}': 'Name of the company signatory',
    '{{signedFor}}': 'Name of the vendor signatory',
    'Snake case variants also work (e.g. {{company_name}})': 'All placeholders accept snake_case format too',
  };

  const fetchDocumentTemplates = useCallback(async () => {
    setDocTemplatesLoading(true);
    try {
      const templates = await companySettingsService.listDocumentTemplates();
      const cleaned = templates.map(t => ({
        ...t,
        ocrStatus: t.ocrStatus === 'PROCESSING' ? null : t.ocrStatus,
      }));
      setDocumentTemplates(cleaned);
    } catch {
      // ignore
    } finally {
      setDocTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'documents-contracts') {
      fetchDocumentTemplates();
    }
  }, [activeTab, fetchDocumentTemplates]);

  const handleSelectDocTemplate = useCallback((id: string) => {
    const proceed = () => {
      setSelectedDocId(id);
      setDocTemplateDirty(false);
      const tmpl = documentTemplates.find(t => t.id === id);
      if (tmpl) {
        setEditedDocContent(tmpl.content || '');
        setEditedDocName(tmpl.name || '');
      }
    };
    if (docTemplateDirty) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: proceed,
      });
    } else {
      proceed();
    }
  }, [documentTemplates, docTemplateDirty]);

  const handleDocContentChange = useCallback((html: string) => {
    setEditedDocContent(html);
    setDocTemplateDirty(true);
  }, []);

  const handleDocNameChange = useCallback((name: string) => {
    setEditedDocName(name);
    setDocTemplateDirty(true);
  }, []);

  const handleSaveDocTemplate = useCallback(async () => {
    if (!selectedDocId || !editedDocContent) return;
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.updateDocumentTemplateById(selectedDocId, {
        name: editedDocName.trim(),
        content: editedDocContent,
        isActive: true,
      });
      setDocumentTemplates(prev => prev.map(t => t.id === selectedDocId ? updated : t));
      setDocTemplateDirty(false);
      setPageMsg(`Template "${updated.name}" saved successfully.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [selectedDocId, editedDocContent, editedDocName]);

  const handleResetDocTemplate = useCallback(async () => {
    if (!selectedDocId) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Reset Document Template?',
      message: 'Reset this document template content? Unsaved changes will be discarded.',
      confirmText: 'Reset Content',
      cancelText: 'Cancel',
      variant: 'warning',
      onConfirm: () => {
        const tmpl = documentTemplates.find(t => t.id === selectedDocId);
        if (tmpl) {
          setEditedDocContent(tmpl.content);
          setEditedDocName(tmpl.name);
          setDocTemplateDirty(false);
          setPageMsg('Document template reset to saved state.');
        }
      },
    });
  }, [selectedDocId, documentTemplates]);

  const handleCreateNewDocTemplate = useCallback(async (type: 'NDA' | 'MNDA' | 'ANY_OTHER') => {
    const name = newDocName.trim();
    if (!name) return;
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      const created = await companySettingsService.createDocumentTemplate(type, {
        name,
        content: `<h1>${name}</h1><p>Template for ${DOC_TEMPLATE_LABELS[type]}.</p>`,
        isActive: true,
      });
      setDocumentTemplates(prev => [...prev, created]);
      setSelectedDocId(created.id);
      setEditedDocContent(created.content);
      setEditedDocName(created.name);
      setEditingNewDoc(null);
      setNewDocName('');
      setPageMsg(`Document template "${name}" created.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [newDocName, DOC_TEMPLATE_LABELS]);

  const handleRenameDocTemplate = useCallback(async (id: string) => {
    const newName = renamingDocName.trim();
    if (!newName || newName === documentTemplates.find(t => t.id === id)?.name) {
      setRenamingDocId(null);
      return;
    }
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      const tmpl = documentTemplates.find(t => t.id === id);
      if (!tmpl) return;
      const updated = await companySettingsService.updateDocumentTemplateById(id, {
        name: newName,
        content: tmpl.content,
        isActive: tmpl.isActive,
      });
      setDocumentTemplates(prev => prev.map(t => t.id === id ? updated : t));
      if (selectedDocId === id) setEditedDocName(updated.name);
      setRenamingDocId(null);
      setPageMsg(`Template renamed to "${newName}".`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to rename template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [renamingDocName, documentTemplates, selectedDocId]);

  const handleDeleteDocTemplate = useCallback(async (id: string) => {
    setDeleteDocIdTarget(id);
  }, []);

  const confirmDeleteDocTemplate = useCallback(async () => {
    const id = deleteDocIdTarget;
    if (!id) return;
    const tmpl = documentTemplates.find(t => t.id === id);
    const label = tmpl?.name || 'Template';
    setSavingDocTemplate(true);
    setPageMsg(null);
    setDeleteDocIdTarget(null);
    try {
      await companySettingsService.deleteDocumentTemplateById(id);
      setDocumentTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedDocId === id) {
        setSelectedDocId(null);
        setEditedDocContent('');
        setEditedDocName('');
      }
      setPageMsg(`Template "${label}" deleted.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [deleteDocIdTarget, documentTemplates, selectedDocId]);

  const cancelDeleteDocTemplate = useCallback(() => {
    setDeleteDocIdTarget(null);
  }, []);

  // ── Document OCR Handlers ──
  const handleTriggerDocumentOcr = useCallback(async () => {
    if (!selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    docOcrPollActiveRef.current = false;

    setDocumentTemplates(prev => prev.map(t =>
      t.id === selectedDocId
        ? { ...t, ocrStatus: 'PROCESSING' }
        : t
    ));
    try {
      await companySettingsService.triggerDocumentOcr(type);
      const idAtTrigger = selectedDocId;
      const MAX_POLL_MS = 300000; // 5 minutes for large scanned PDFs
      const INTERVAL_MS = 3000;
      const LONG_INTERVAL_MS = 10000; // Poll less frequently after the initial timeout window
      const startTime = Date.now();
      docOcrPollActiveRef.current = true;

      const poll = async () => {
        if (!docOcrPollActiveRef.current) return;
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
          docOcrPollActiveRef.current = false;
          // Don't call fetchDocumentTemplates as it resets PROCESSING to null.
          // Instead, update the message so user knows OCR is still running.
          setPageMsg('OCR is still running on the server. Refresh the page later to check the result.');
          return;
        }
        try {
          const status = await companySettingsService.getDocumentOcrStatus(type);
          if (status.ocrStatus === 'COMPLETED' || status.ocrStatus === 'FAILED') {
            docOcrPollActiveRef.current = false;
            invalidateApiCache('/company-settings/document-templates');
            setDocumentTemplates(prev => prev.map(t =>
              t.id === idAtTrigger
                ? { ...t, ocrText: status.ocrText, ocrStatus: status.ocrStatus, ocrProcessedAt: status.ocrProcessedAt }
                : t
            ));
            if (status.ocrStatus === 'COMPLETED' && status.ocrText) {
              // Convert plain text with layout to HTML for the rich text editor
              setEditedDocContent(textToHtml(status.ocrText));
              setDocTemplateDirty(true);
              setPageMsg('OCR completed! Text extracted and applied as template content.');
            } else if (status.ocrStatus === 'FAILED') {
              setPageMsg('OCR failed. The uploaded file may contain no readable text.');
            }
          } else {
            // Use longer interval if we've already waited a while
            const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
            setTimeout(poll, interval);
          }
        } catch {
          // On API error, retry with the appropriate interval
          const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
          setTimeout(poll, interval);
        }
      };
      setTimeout(poll, 3000);
    } catch (err) {
      docOcrPollActiveRef.current = false;
      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId ? { ...t, ocrStatus: null } : t
      ));
      setPageMsg(err instanceof Error ? err.message : 'Failed to trigger OCR');
    }
  }, [selectedDocTemplate, selectedDocId]);

  const handleSaveDocumentOcrText = useCallback(async (text: string) => {
    if (!selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    try {
      await companySettingsService.saveDocumentOcrText(type, text);
      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId ? { ...t, ocrText: text } : t
      ));
      setPageMsg('OCR text saved.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save OCR text');
    }
  }, [selectedDocTemplate, selectedDocId]);

  const handleUploadDocumentFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    setDocFileUploading(true);
    setPageMsg(null);
    try {
      const result = await companySettingsService.uploadDocumentTemplateFile(type, file);
      // Update local state — reset OCR so user can re-run on the new file
      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId
          ? { ...t, fileUrl: result.fileUrl, fileName: result.fileName, fileType: result.fileType, ocrStatus: null, ocrText: null, ocrProcessedAt: null }
          : t
      ));
      setPageMsg('File uploaded successfully!');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDocFileUploading(false);
      e.target.value = '';
    }
  }, [selectedDocTemplate, selectedDocId]);

  const handleRemoveDocumentFile = useCallback(async () => {
    if (!selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    setDocFileUploading(true);
    setPageMsg(null);
    try {
      await companySettingsService.updateDocumentTemplateById(selectedDocId!, {
        name: editedDocName.trim(),
        content: editedDocContent,
        isActive: true,
        fileUrl: null,
        fileName: null,
        fileType: null,
      });
      // Reset OCR data when file is removed
      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId ? { ...t, fileUrl: null, fileName: null, fileType: null, ocrStatus: null, ocrText: null, ocrProcessedAt: null } : t
      ));
      setPageMsg('Uploaded file removed.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to remove file');
    } finally {
      setDocFileUploading(false);
    }
  }, [selectedDocTemplate, selectedDocId, editedDocName, editedDocContent]);

  const anyModalOpen = !!(showDeptModal || showCatModal || showUnitModal || showPositionModal || showPaymentTermModal || deleteTarget || cropFile || confirmModalConfig?.isOpen);
  useBodyScrollLock(anyModalOpen);


  // Editable docs state (for inline editing matching Mandatory Information style)
  const [editableDocs, setEditableDocs] = useState<RequiredDocument[]>([]);
  const [docsDirty, setDocsDirty] = useState(false);
  const [savingDocs, setSavingDocs] = useState(false);

  // ── Form selection state ──
  const [selectedFormKey, setSelectedFormKey] = useState<string | null>(null);

  const AVAILABLE_FORMS = [
    { key: 'vendor_onboarding', label: 'Vendor Onboarding Form' },
  ];

  const handleSelectForm = useCallback((formKey: string) => {
    setSelectedFormKey(formKey);
  }, []);

  // Sync editable docs from API data when it loads
  useEffect(() => {
    if (requiredDocuments.length > 0 && !docsDirty) {
      setEditableDocs(requiredDocuments);
    }
  }, [requiredDocuments, docsDirty]);

  const DOC_FIELD_TYPES = ['attachment', 'number', 'date', 'alphabetical', 'alphanumeric'] as const;

  const [addDocCategory, setAddDocCategory] = useState<'mandatory' | 'optional'>('mandatory');

  const addDocInline = useCallback((category: 'mandatory' | 'optional') => {
    const newDoc: RequiredDocument = {
      id: `new-${Date.now()}`,
      name: '',
      fieldType: 'attachment',
      documentCategory: category,
      isActive: true,
      expirationAlertDays: 30,
      expirationAlertFrequency: 'DAILY',
      trackIssueDate: true,
      trackExpirationDate: true,
      trackIssuingAuthority: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditableDocs(prev => [...prev, newDoc]);
    setDocsDirty(true);
  }, []);

  const removeDocInline = useCallback((id: string) => {
    setEditableDocs(prev => prev.filter(d => d.id !== id));
    setDocsDirty(true);
  }, []);

  const updateDocInline = useCallback((id: string, name: string) => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, name } : d));
    setDocsDirty(true);
  }, []);

  const updateDocFieldType = useCallback((id: string, fieldType: string) => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, fieldType } : d));
    setDocsDirty(true);
  }, []);

  const updateDocExpirationAlertDays = useCallback((id: string, days: number) => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, expirationAlertDays: days } : d));
    setDocsDirty(true);
  }, []);

  const updateDocExpirationAlertFrequency = useCallback((id: string, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY') => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, expirationAlertFrequency: frequency } : d));
    setDocsDirty(true);
  }, []);

  const handleSaveDocs = useCallback(async () => {
    setSavingDocs(true);
    setPageMsg(null);
    try {
      // Determine what was added, removed, and changed
      const originalIds = new Set(requiredDocuments.map(d => d.id));
      const currentIds = new Set(editableDocs.map(d => d.id));

      // Delete removed docs
      const removedIds = [...originalIds].filter(id => id.startsWith('new-') === false && !currentIds.has(id));
      for (const id of removedIds) {
        await companySettingsService.deleteRequiredDocument(id);
      }

      // Upsert: create new docs, update existing
      for (const doc of editableDocs) {
        if (doc.id.startsWith('new-')) {
          // New doc - create
          await companySettingsService.createRequiredDocument(
            doc.name.trim(),
            doc.documentCategory || 'mandatory',
            undefined,
            undefined,
            doc.fieldType || 'attachment',
            doc.expirationAlertDays ?? 30,
            doc.expirationAlertFrequency || 'DAILY',
            doc.trackIssueDate ?? true,
            doc.trackExpirationDate ?? true,
            doc.trackIssuingAuthority ?? true
          );
        } else {
          // Existing doc - update name, isRequired, fieldType, alertDays, alertFrequency
          const original = requiredDocuments.find(d => d.id === doc.id);
          if (
            original &&
            (original.name !== doc.name.trim() ||
              (original.documentCategory || 'mandatory') !== (doc.documentCategory || 'mandatory') ||
              (original.fieldType || 'attachment') !== (doc.fieldType || 'attachment') ||
              (original.expirationAlertDays ?? 30) !== (doc.expirationAlertDays ?? 30) ||
              (original.expirationAlertFrequency || 'DAILY') !== (doc.expirationAlertFrequency || 'DAILY'))
          ) {
            await companySettingsService.updateRequiredDocument(doc.id, {
              name: doc.name.trim(),
              documentCategory: doc.documentCategory || 'mandatory',
              fieldType: doc.fieldType || 'attachment',
              expirationAlertDays: doc.expirationAlertDays ?? 30,
              expirationAlertFrequency: doc.expirationAlertFrequency || 'DAILY',
              trackIssueDate: doc.trackIssueDate ?? true,
              trackExpirationDate: doc.trackExpirationDate ?? true,
              trackIssuingAuthority: doc.trackIssuingAuthority ?? true,
            });
          }
        }
      }

      setDocsDirty(false);
      setPageMsg('Required documents updated.');
      await reloadRequiredDocuments();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save documents');
    } finally {
      setSavingDocs(false);
    }
  }, [editableDocs, requiredDocuments, reloadRequiredDocuments]);

  const tabCounts: Record<TabKey, number | undefined> = {
    'general': undefined,
    'branding': undefined,
    'departments': undefined,
    'positions': positions.length,
    'forms': undefined,
    'form-documents': editableDocs.length,
    'email-templates': undefined,
    'documents-contracts': undefined,
  };

  // ── Department CRUD ──

  const openAddDept = useCallback(() => {
    setEditingDept(null);
    setDeptName('');
    setDeptDesc('');
    setDeptError(null);
    setShowDeptModal(true);
  }, []);

  const openEditDept = useCallback((dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptDesc(dept.description || '');
    setDeptError(null);
    setShowDeptModal(true);
  }, []);

  const handleSaveDept = useCallback(async () => {
    const trimmed = deptName.trim();
    if (!trimmed) return;
    const exists = departments.some(
      (d) => d.id !== editingDept?.id && d.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setDeptError(`Department "${trimmed}" already exists.`);
      return;
    }
    setActionLoading(true);
    setDeptError(null);
    setPageMsg(null);
    try {
      if (editingDept) {
        await companySettingsService.updateDepartment(editingDept.id, {
          name: trimmed,
          description: deptDesc.trim() || undefined,
        });
        setPageMsg(`Department "${trimmed}" updated.`);
      } else {
        await companySettingsService.createDepartment(trimmed, deptDesc.trim() || undefined);
        setPageMsg(`Department "${trimmed}" created.`);
      }
      setShowDeptModal(false);
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save department';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setDeptError(`Department "${trimmed}" already exists.`);
      } else {
        setDeptError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [editingDept, deptName, deptDesc, departments, reload]);

  // ── Category CRUD ──

  const openAddCat = useCallback((deptId?: number) => {
    setEditingCat(null);
    setCatDeptId(String(deptId || (departments[0]?.id || 0)));
    setCatName('');
    setCatDesc('');
    setCatError(null);
    setShowCatModal(true);
  }, [departments]);

  const openEditCat = useCallback((cat: Category) => {
    setEditingCat(cat);
    setCatDeptId(String(cat.departmentId));
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setCatError(null);
    setShowCatModal(true);
  }, []);

  const handleSaveCat = useCallback(async () => {
    const trimmed = catName.trim();
    if (!trimmed || !catDeptId) return;
    const exists = categories.some(
      (c) => c.id !== editingCat?.id && String(c.departmentId) === String(catDeptId) && c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setCatError(`Category "${trimmed}" already exists in this department.`);
      return;
    }
    setActionLoading(true);
    setCatError(null);
    setPageMsg(null);
    try {
      if (editingCat) {
        await companySettingsService.updateCategory(editingCat.id, {
          departmentId: String(catDeptId),
          name: trimmed,
          description: catDesc.trim() || undefined,
        });
        setPageMsg(`Category "${trimmed}" updated.`);
      } else {
        await companySettingsService.createCategory(String(catDeptId), trimmed, catDesc.trim() || undefined);
        setPageMsg(`Category "${trimmed}" created.`);
      }
      setShowCatModal(false);
      reload();
      reloadCategories();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save category';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setCatError(`Category "${trimmed}" already exists.`);
      } else {
        setCatError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [editingCat, catDeptId, catName, catDesc, categories, reload, reloadCategories]);

  const toggleDeptActive = useCallback(async (dept: Department) => {
    setPageMsg(null);
    try {
      await companySettingsService.updateDepartment(dept.id, { isActive: !dept.isActive });
      setPageMsg(`Department "${dept.name}" ${dept.isActive ? 'deactivated' : 'activated'}.`);
      reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to update department');
    }
  }, [reload]);

  // ── Payment Term handlers ──

  const openAddPaymentTerm = useCallback(() => {
    setPaymentTermName('');
    setPaymentTermError(null);
    setShowPaymentTermModal(true);
  }, []);

  const handleSavePaymentTerm = useCallback(async () => {
    const trimmed = paymentTermName.trim();
    if (!trimmed) return;
    const exists = paymentTerms.some(
      (pt) => pt.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setPaymentTermError(`Payment term "${trimmed}" already exists.`);
      return;
    }
    setActionLoading(true);
    setPaymentTermError(null);
    setPageMsg(null);
    try {
      await companySettingsService.createPaymentTerm(trimmed);
      setPageMsg(`Payment term "${trimmed}" created.`);
      setShowPaymentTermModal(false);
      reloadPaymentTerms();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save payment term';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setPaymentTermError(`Payment term "${trimmed}" already exists.`);
      } else {
        setPaymentTermError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [paymentTermName, paymentTerms, reloadPaymentTerms]);

  const requestDeletePaymentTerm = useCallback((term: PaymentTerm) => {
    setDeleteTarget({ type: 'paymentTerm', id: term.id, name: term.name });
  }, []);

  // ── Position handlers ──

  const openAddPosition = useCallback(() => {
    setPositionName('');
    setPositionDesc('');
    setPositionError(null);
    setShowPositionModal(true);
  }, []);

  const handleSavePosition = useCallback(async () => {
    const trimmed = positionName.trim();
    if (!trimmed) return;
    const exists = positions.some(
      (pos) => pos.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setPositionError(`Position "${trimmed}" already exists.`);
      return;
    }
    setActionLoading(true);
    setPositionError(null);
    setPageMsg(null);
    try {
      await companySettingsService.createPosition(trimmed, positionDesc.trim() || undefined);
      setPageMsg(`Position "${trimmed}" created.`);
      setShowPositionModal(false);
      reloadPositions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save position';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setPositionError(`Position "${trimmed}" already exists.`);
      } else {
        setPositionError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [positionName, positionDesc, positions, reloadPositions]);

  const requestDeletePosition = useCallback((position: Position) => {
    setDeleteTarget({ type: 'position', id: position.id, name: position.name });
  }, []);

  const openAddUnit = useCallback(() => {
    setUnitName('');
    setUnitAliases('');
    setUnitError(null);
    setShowUnitModal(true);
  }, []);

  const handleSaveUnit = useCallback(async () => {
    const trimmed = unitName.trim();
    if (!trimmed) return;
    const trimmedLower = trimmed.toLowerCase();
    const nameExists = units.some((u) => u.name.trim().toLowerCase() === trimmedLower);
    if (nameExists) {
      setUnitError(`Unit "${trimmed}" already exists.`);
      return;
    }
    const newAliases = unitAliases
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    for (const alias of newAliases) {
      const aliasMatch = units.find(
        (u) => u.name.trim().toLowerCase() === alias ||
               u.aliases?.some((a) => a.trim().toLowerCase() === alias)
      );
      if (aliasMatch) {
        setUnitError(`Alias "${alias}" conflicts with existing unit "${aliasMatch.name}".`);
        return;
      }
    }
    setActionLoading(true);
    setUnitError(null);
    try {
      await companySettingsService.createUnit(trimmed, unitAliases.trim() || undefined);
      setPageMsg(`Unit "${trimmed}" created.`);
      setShowUnitModal(false);
      reloadUnits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save unit';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setUnitError(`Unit "${trimmed}" already exists.`);
      } else {
        setUnitError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [unitName, unitAliases, units, reloadUnits]);

  const requestDeleteUnit = useCallback((unit: Unit) => {
    setDeleteTarget({ type: 'unit', id: unit.id, name: unit.name });
  }, []);

  // ── Delete handlers ──

  // Required document handlers






  const requestDeleteRequiredDoc = useCallback((doc: RequiredDocument) => {
    setDeleteTarget({ type: 'requiredDocument', id: doc.id, name: doc.name });
  }, []);

  const requestDeleteDept = useCallback((dept: Department) => {
    setDeleteTarget({ type: 'department', id: dept.id, name: dept.name });
  }, []);

  const requestDeleteCat = useCallback((cat: Category) => {
    setDeleteTarget({ type: 'category', id: cat.id, name: cat.name });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setPageMsg(null);
    try {
      if (deleteTarget.type === 'department') {
        await companySettingsService.deleteDepartment(deleteTarget.id);
        setPageMsg(`Department "${deleteTarget.name}" deleted.`);
        reload();
      } else if (deleteTarget.type === 'category') {
        await companySettingsService.deleteCategory(deleteTarget.id);
        setPageMsg(`Category "${deleteTarget.name}" deleted.`);
        reloadCategories();
      } else if (deleteTarget.type === 'unit') {
        await companySettingsService.deleteUnit(deleteTarget.id);
        setPageMsg(`Unit "${deleteTarget.name}" deleted.`);
        reloadUnits();
      } else if (deleteTarget.type === 'paymentTerm') {
        await companySettingsService.deletePaymentTerm(deleteTarget.id);
        setPageMsg(`Payment term "${deleteTarget.name}" deleted.`);
        reloadPaymentTerms();
      } else if (deleteTarget.type === 'position') {
        await companySettingsService.deletePosition(deleteTarget.id);
        setPageMsg(`Position "${deleteTarget.name}" deleted.`);
        reloadPositions();
      } else if (deleteTarget.type === 'requiredDocument') {
        await companySettingsService.deleteRequiredDocument(deleteTarget.id);
        setPageMsg(`Required document "${deleteTarget.name}" deleted.`);
        reloadRequiredDocuments();
      }
      setDeleteTarget(null);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, reload, reloadCategories, reloadUnits, reloadPaymentTerms, reloadPositions]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const toggleCatActive = useCallback(async (cat: Category) => {
    setPageMsg(null);
    try {
      await companySettingsService.updateCategory(cat.id, { isActive: !cat.isActive });
      setPageMsg(`Category "${cat.name}" ${cat.isActive ? 'deactivated' : 'activated'}.`);
      reloadCategories();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to update category');
    }
  }, [reloadCategories]);

  // -----------------------------------------------------------
  //  RENDER
  // -----------------------------------------------------------

  // ── Render Documents Tab (extracted for Oxc compatibility) ──
  


  return (
    <div className="company-settings-page">
      {pageMsg && (
        <MessageStrip
          type={inferMessageType(pageMsg)}
          onClose={() => setPageMsg(null)}
          autoHideMs={5000}
          className="sap-message-strip--toast"
        >
          {pageMsg}
        </MessageStrip>
      )}
      {loading && <div className="company-settings-page__loading" />}

      {/* ── Page Header ── */}
      <div className="cs-page-header">
        <h1><Settings size={22} /> Company Settings</h1>
        <p>Configure your organization's departments, categories, units, positions, and payment terms</p>
      </div>

      {/* ── Stats Summary ── */}
      <div className="cs-stats">
        <div className="cs-stat">
          <span className="cs-stat__value">{departments.length}</span>
          <span className="cs-stat__label">Departments</span>
        </div>
        <div className="cs-stat">
          <span className="cs-stat__value">{categories.length}</span>
          <span className="cs-stat__label">Categories</span>
        </div>
        <div className="cs-stat">
          <span className="cs-stat__value">{positions.length}</span>
          <span className="cs-stat__label">Positions</span>
        </div>
        <div className="cs-stat">
          <span className="cs-stat__value">{units.length}</span>
          <span className="cs-stat__label">Units</span>
        </div>
        <div className="cs-stat">
          <span className="cs-stat__value">{paymentTerms.length}</span>
          <span className="cs-stat__label">Payment Terms</span>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="cs-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`cs-tab ${activeTab === tab.key ? 'cs-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            {tab.label}
            {tabCounts[tab.key] !== undefined && (
              <span className="cs-tab__count">{tabCounts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------
          TAB: General
          ------------------------------------------------------- */}
      {activeTab === 'general' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><DollarSign size={17} /> Default Currency</h2>
                <p>Set the default currency used throughout the application for RFQs, quotations, invoices, and payments.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-currency-row">
                <CurrencySelector
                  value={displayCurrency}
                  onChange={handleCurrencySelect}
                  size="md"
                />
              </div>
            </div>
          </div>

          {/* ── Portal Name ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Settings size={17} /> Portal Name</h2>
                <p>Set the display name for the internal employee portal. This appears on the login page and in branding.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="company-settings__field">
                <label>Primary Portal Name</label>
                <input
                  value={pendingPortalName !== null ? pendingPortalName : portalName}
                  onChange={(e) => setPendingPortalName(e.target.value)}
                  placeholder="e.g. Employee"
                  className={pendingPortalName !== null && pendingPortalName !== portalName ? 'cs-input--changed' : ''}
                />
                <span className="cs-field-hint">
                  Shown on the employee login page (e.g. "Employee Sign In"). Default: "Employee".
                  The vendor portal name is fixed as "Vendor".
                </span>
              </div>
            </div>
          </div>

          {/* ── Time Limits ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Clock size={17} /> Vendor Time Limits</h2>
                <p>Configure time-based rules for vendor onboarding and resubmission. Expired vendors are automatically cleaned up by the scheduler.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-time-limits-grid">
                <div className="cs-time-limit-field">
                  <label>Invitation Expiry (hours)</label>
                  <div className="cs-time-limit-input-wrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, '');
                        if (cleaned === '') {
                          setPendingInvitationExpiry(0);
                        } else {
                          setPendingInvitationExpiry(Math.max(1, Math.min(8760, Number(cleaned))));
                        }
                      }}
                      className={pendingInvitationExpiry !== null && pendingInvitationExpiry !== invitationExpiryHours ? 'cs-input--changed' : ''}
                    />
                    <span className="cs-time-limit-hint">
                      {(pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours) >= 24
                        ? `≈ ${Math.round((pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours) / 24)} days`
                        : '< 1 day'}
                    </span>
                  </div>
                  <p className="cs-time-limit-desc">
                    How long a vendor has to accept their onboarding invitation before being automatically deleted. Default: 168 hours (7 days).
                  </p>
                </div>
                <div className="cs-time-limit-field">
                  <label>Resubmission Deadline (hours)</label>
                  <div className="cs-time-limit-input-wrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, '');
                        if (cleaned === '') {
                          setPendingResubmissionDeadline(0);
                        } else {
                          setPendingResubmissionDeadline(Math.max(1, Math.min(8760, Number(cleaned))));
                        }
                      }}
                      className={pendingResubmissionDeadline !== null && pendingResubmissionDeadline !== resubmissionDeadlineHours ? 'cs-input--changed' : ''}
                    />
                    <span className="cs-time-limit-hint">
                      {(pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours) >= 24
                        ? `≈ ${Math.round((pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours) / 24)} days`
                        : '< 1 day'}
                    </span>
                  </div>
                  <p className="cs-time-limit-desc">
                    How long a rejected vendor has to correct their information and resubmit before being automatically deleted. Default: 72 hours (3 days).
                  </p>
                </div>
              </div>

              {(hasPendingChange || hasTimeLimitChanges || hasPortalNameChange) && (
                <div className="cs-time-limit-actions">
                  <button
                    className="company-settings__btn company-settings__btn--primary"
                    onClick={handleSaveGeneralSettings}
                    disabled={savingCurrency}
                  >
                    <Save size={16} /> {savingCurrency ? 'Saving…' : 'Save All Changes'}
                  </button>
                  <button
                    className="company-settings__btn company-settings__btn--secondary"
                    onClick={handleCurrencyCancel}
                  >
                    <X size={16} /> Discard Changes
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Payment Terms ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><CreditCard size={17} /> Payment Terms</h2>
                <p>Manage payment term options for vendor quotations (e.g. Net 15, Net 30, Net 45, Advance)</p>
              </div>
              <div className="cs-section-header__actions">
                <button className="company-settings__btn company-settings__btn--primary" onClick={openAddPaymentTerm}>
                  <Plus size={16} /> Add Payment Term
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {paymentTerms.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><CreditCard size={28} /></div>
                  <p>No payment terms yet. Add your first payment term to get started.</p>
                  <button className="company-settings__btn company-settings__btn--primary" onClick={openAddPaymentTerm}>
                    <Plus size={16} /> Add Payment Term
                  </button>
                </div>
              ) : (
                <div className="cs-item-list">
                  {paymentTerms.map((term) => (
                    <div key={term.id} className={`cs-item ${!term.isActive ? 'cs-item--inactive' : ''}`}>
                      <div className="cs-item__info">
                        <span className="cs-item__name">{term.name}</span>
                      </div>
                      <div className="cs-item__actions">
                        <span className={`company-settings__badge company-settings__badge--sm ${term.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}>
                          {term.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeletePaymentTerm(term)} title="Delete payment term">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Units of Measure ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Ruler size={17} /> Units of Measure</h2>
                <p>Manage units used for line items in RFQs (e.g. Pcs, Kg, Ltr, Mtr)</p>
              </div>
              <div className="cs-section-header__actions">
                <button className="company-settings__btn company-settings__btn--primary" onClick={openAddUnit}>
                  <Plus size={16} /> Add Unit
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {units.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><Ruler size={28} /></div>
                  <p>No units yet. Add your first unit to get started.</p>
                  <button className="company-settings__btn company-settings__btn--primary" onClick={openAddUnit}>
                    <Plus size={16} /> Add Unit
                  </button>
                </div>
              ) : (
                <div className="cs-item-list">
                  {units.map((unit) => (
                    <div key={unit.id} className={`cs-item ${!unit.isActive ? 'cs-item--inactive' : ''}`}>
                      <div className="cs-item__info">
                        <span className="cs-item__name">{unit.name}</span>
                        {unit.aliases && <span className="cs-item__aliases">{unit.aliases}</span>}
                      </div>
                      <div className="cs-item__actions">
                        <span className={`company-settings__badge company-settings__badge--sm ${unit.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}>
                          {unit.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeleteUnit(unit)} title="Delete unit">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}                    </div>

                  )}

            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Branding / White Label
          ------------------------------------------------------- */}
      {activeTab === 'branding' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Palette size={17} /> White Label Branding</h2>
                <p>Customize the platform appearance for your clients - logo, colors, company name, and more. Changes apply immediately.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-branding-form">
                {/* Company Name */}
                <div className="company-settings__field">
                  <label>Company Name</label>
                  <input
                    value={brandingName}
                    onChange={(e) => { setBrandingName(e.target.value); markBrandingDirty(); }}
                    placeholder="e.g. Acme Corp"
                  />
                  <span className="cs-field-hint">Used throughout the app - sidebar, login page, browser title, and emails</span>
                </div>

                {/* Primary Color */}
                <div className="company-settings__field">
                  <label>Primary Color</label>
                  <div className="cs-color-row">
                    <input
                      type="color"
                      value={brandingColor}
                      onChange={(e) => { setBrandingColor(e.target.value); markBrandingDirty(); }}
                      className="cs-color-picker"
                    />
                    <input
                      type="text"
                      value={brandingColor}
                      onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) { setBrandingColor(v); markBrandingDirty(); } }}
                      placeholder="#0a6ed1"
                      className="cs-color-hex"
                      maxLength={7}
                    />
                    <button
                      type="button"
                      className="cs-color-reset-btn"
                      onClick={() => { setBrandingColor('#0a6ed1'); markBrandingDirty(); }}
                      title="Reset to default color"
                    >
                      <RotateCcw size={14} /> Reset
                    </button>
                  </div>
                  <span className="cs-field-hint">Applied to buttons, links, highlights, and sidebar accent. Default: #0a6ed1</span>
                </div>

                {/* Logo Upload */}
                <div className="company-settings__field">
                  <label>Logo</label>
                  <div className="cs-upload-row">
                    {brandingLogoUrl && (
                      <div className="cs-logo-preview cs-logo-preview--uploaded">
                        <img src={brandingLogoUrl} alt="Logo" className="cs-logo-preview__img" />
                      </div>
                    )}
                    <label className="cs-upload-btn">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setCropType('logo');
                          setCropFile(file);
                          e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                        id="logo-upload-input"
                      />
                      <span className="cs-upload-btn__label">
                        <Image size={16} />
                        {uploadingLogo ? 'Uploading…' : 'Choose Logo'}
                      </span>
                    </label>
                    {brandingLogoUrl && (
                      <button
                        className="company-settings__icon-btn company-settings__icon-btn--danger"
                        onClick={async () => {
                          try {
                            setRemovingLogo(true);
                            const updated = await companySettingsService.updateCompanyProfile({ logoUrl: '' });
                            setBrandingLogoUrl('');
                            setProfile(updated);
                            setPageMsg('Logo removed');
                            refreshBranding();
                          } catch (err) {
                            setPageMsg(err instanceof Error ? err.message : 'Failed to remove logo');
                          } finally {
                            setRemovingLogo(false);
                          }
                        }}
                        title="Remove logo"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <span className="cs-field-hint">Recommended: 200×60px PNG with transparent background. Max 2MB.</span>
                </div>

                {/* Favicon Upload */}
                <div className="company-settings__field">
                  <label>Favicon</label>
                  <div className="cs-upload-row">
                    {brandingFaviconUrl && (
                      <div className="cs-favicon-preview">
                        <img src={brandingFaviconUrl} alt="Favicon" className="cs-favicon-preview__img" />
                      </div>
                    )}
                    <label className="cs-upload-btn">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/x-icon"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setCropType('favicon');
                          setCropFile(file);
                          e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                        id="favicon-upload-input"
                      />
                      <span className="cs-upload-btn__label">
                        <Image size={16} />
                        {uploadingFavicon ? 'Uploading…' : 'Choose Favicon'}
                      </span>
                    </label>
                    {brandingFaviconUrl && (
                      <button
                        className="company-settings__icon-btn company-settings__icon-btn--danger"
                        onClick={async () => {
                          try {
                            setRemovingFavicon(true);
                            const updated = await companySettingsService.updateCompanyProfile({ faviconUrl: '' });
                            setBrandingFaviconUrl('');
                            setProfile(updated);
                            setPageMsg('Favicon removed');
                            const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
                            if (link) link.href = '/favicon.svg';
                            refreshBranding();
                          } catch (err) {
                            setPageMsg(err instanceof Error ? err.message : 'Failed to remove favicon');
                          } finally {
                            setRemovingFavicon(false);
                          }
                        }}
                        title="Remove favicon"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <span className="cs-field-hint">Browser tab icon. Recommended: 32×32px PNG or ICO. Max 2MB.</span>
                </div>

                {/* Login Text */}
                <div className="company-settings__field">
                  <label>Login Page Text</label>
                  <input
                    value={brandingLoginText}
                    onChange={(e) => { setBrandingLoginText(e.target.value); markBrandingDirty(); }}
                    placeholder="Digital Procurement & RFQ Workflow Platform"
                  />
                  <span className="cs-field-hint">Subtitle shown on the login page below the company name</span>
                </div>

                {/* Support Email */}
                <div className="company-settings__field">
                  <label>Support Email</label>
                  <input
                    type="email"
                    value={brandingSupportEmail}
                    onChange={(e) => { setBrandingSupportEmail(e.target.value); markBrandingDirty(); }}
                    placeholder="support@example.com"
                  />
                  <span className="cs-field-hint">Shown in the app footer and login page footer</span>
                </div>

                {/* Company Phone */}
                <div className="company-settings__field">
                  <label>Company Phone</label>
                  <input
                    type="tel"
                    value={brandingCompanyPhone}
                    onChange={(e) => { setBrandingCompanyPhone(e.target.value); markBrandingDirty(); }}
                    placeholder="+91 1234567890"
                  />
                  <span className="cs-field-hint">Shown on Purchase Order documents and contract templates</span>
                </div>

                {/* Company Email */}
                <div className="company-settings__field">
                  <label>Company Email</label>
                  <input
                    type="email"
                    value={brandingCompanyEmail}
                    onChange={(e) => { setBrandingCompanyEmail(e.target.value); markBrandingDirty(); }}
                    placeholder="info@example.com"
                  />
                  <span className="cs-field-hint">Shown on Purchase Order documents and contract templates</span>
                </div>

                {/* Save Button */}
                {brandingDirty && (
                  <div className="cs-branding-actions">
                    <button
                      className="company-settings__btn company-settings__btn--primary"
                      onClick={handleSaveBranding}
                      disabled={savingBranding}
                    >
                      <Save size={16} /> {savingBranding ? 'Saving…' : 'Save Branding'}
                    </button>
                    <button
                      className="company-settings__btn company-settings__btn--secondary"
                      onClick={() => {
                        brandingInitialized.current = false;
                        setBrandingDirty(false);
                        if (profile) {
                          setBrandingName(profile.companyName || '');
                          setBrandingLogoUrl(profile.logoUrl || '');
                          setBrandingFaviconUrl(profile.faviconUrl || '');
                          setBrandingColor(profile.primaryColor || '#0a6ed1');
                          setBrandingLoginText(profile.loginText || '');
                          setBrandingSupportEmail(profile.supportEmail || '');
                        }
                      }}
                    >
                      <X size={16} /> Discard
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Departments & Categories
          ------------------------------------------------------- */}
      {activeTab === 'departments' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Building2 size={17} /> Departments & Categories</h2>
                <p>Manage procurement departments and their vendor categories</p>
              </div>
              <div className="cs-section-header__actions">
                <button className="company-settings__btn company-settings__btn--primary" onClick={() => openAddCat()}>
                  <Plus size={16} /> Add Category
                </button>
                <button className="company-settings__btn company-settings__btn--primary" onClick={openAddDept}>
                  <Plus size={16} /> Add Department
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {/* Search */}
              <div className="cs-dept-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search departments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Department & Category Tree */}
              {filtered.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><Building2 size={28} /></div>
                  <p>No departments found. Add your first department to get started.</p>
                  <button className="company-settings__btn company-settings__btn--primary" onClick={openAddDept}>
                    <Plus size={16} /> Add Department
                  </button>
                </div>
              ) : (
                <div className="cs-dept-list">
                  {filtered.map((dept) => {
                    const deptCats = categoriesByDept.get(dept.id) || [];
                    const isExpanded = expandedDept.has(dept.id);
                    return (
                      <div key={dept.id} className={`cs-dept ${!dept.isActive ? 'cs-dept--inactive' : ''}`}>
                        {/* Department Row */}
                        <div className="cs-dept__row">
                          <button className="cs-dept__expand" onClick={() => toggleExpand(dept.id)}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <Building2 size={18} className="cs-dept__icon" />
                          <div className="cs-dept__info">
                            <span className="cs-dept__name">{dept.name}</span>
                            {dept.description && <span className="cs-dept__desc">{dept.description}</span>}
                          </div>
                          <span className="cs-dept__count">{deptCats.length} categories</span>
                          <div className="cs-dept__actions">
                            <button
                              className={`company-settings__badge ${dept.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}
                              onClick={() => toggleDeptActive(dept)}
                              title={dept.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {dept.isActive ? 'Active' : 'Inactive'}
                            </button>
                            <button className="company-settings__icon-btn" onClick={() => { openAddCat(dept.id); }} title="Add category to this department">
                              <Plus size={14} />
                            </button>
                            <button className="company-settings__icon-btn" onClick={() => openEditDept(dept)} title="Edit department">
                              <Edit3 size={14} />
                            </button>
                            <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeleteDept(dept)} title="Delete department">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Categories for this department */}
                        {isExpanded && (
                          <div className="cs-cats">
                            {deptCats.length === 0 ? (
                              <div className="cs-cats__empty">
                                <Tag size={14} /> No categories yet. Click <Plus size={12} /> to add one.
                              </div>
                            ) : (
                              deptCats.map((cat) => (
                                <div key={cat.id} className={`cs-cat ${!cat.isActive ? 'cs-cat--inactive' : ''}`}>
                                  <Tag size={14} className="cs-cat__icon" />
                                  <span className="cs-cat__name">{cat.name}</span>
                                  {cat.description && <span className="cs-cat__desc">{cat.description}</span>}
                                  <div className="cs-cat__actions">
                                    <button
                                      className={`company-settings__badge company-settings__badge--sm ${cat.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}
                                      onClick={() => toggleCatActive(cat)}
                                      title={cat.isActive ? 'Deactivate' : 'Activate'}
                                    >
                                      {cat.isActive ? 'Active' : 'Inactive'}
                                    </button>
                                    <button className="company-settings__icon-btn" onClick={() => openEditCat(cat)} title="Edit category">
                                      <Edit3 size={13} />
                                    </button>
                                    <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeleteCat(cat)} title="Delete category">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        </div>
                      )}
                  )}
                          </div>

                  )}

            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Positions
          ------------------------------------------------------- */}
      {activeTab === 'positions' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Users size={17} /> User Positions</h2>
                <p>Manage positions for internal users (e.g. Purchase Clerk, Store Keeper, Inventory Manager)</p>
              </div>
              <div className="cs-section-header__actions">
                <button className="company-settings__btn company-settings__btn--primary" onClick={openAddPosition}>
                  <Plus size={16} /> Add Position
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {positions.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><Users size={28} /></div>
                  <p>No positions yet. Add your first position to get started.</p>
                  <button className="company-settings__btn company-settings__btn--primary" onClick={openAddPosition}>
                    <Plus size={16} /> Add Position
                  </button>
                </div>
              ) : (
                <div className="cs-item-list">
                  {positions.map((position) => (
                    <div key={position.id} className={`cs-item ${!position.isActive ? 'cs-item--inactive' : ''}`}>
                      <div className="cs-item__info">
                        <span className="cs-item__name">{position.name}</span>
                        {position.description && <span className="cs-item__desc">{position.description}</span>}
                      </div>
                      <div className="cs-item__actions">
                        <span className={`company-settings__badge company-settings__badge--sm ${position.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}>
                          {position.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeletePosition(position)} title="Delete position">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}                    </div>

                  )}

            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Forms Settings
          ------------------------------------------------------- */}
      {activeTab === 'forms' && (
        <div className="cs-tab-panel cs-mandatory-section" role="tabpanel">
          {/* ── Form Selector ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><FileText size={17} /> Forms Settings</h2>
                <p>Select a form below to configure its settings and mandatory fields.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-form-selector">
                <select
                  className="cs-form-select"
                  value={selectedFormKey || ''}
                  onChange={(e) => {
                    if (e.target.value) handleSelectForm(e.target.value);
                  }}
                >
                  <option value="" disabled>- Select a form -</option>
                  {AVAILABLE_FORMS.map(form => (
                    <option key={form.key} value={form.key}>{form.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="cs-form-selector__arrow" />
              </div>

              {!selectedFormKey ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><FileText size={28} /></div>
                  <p>Select a form above to configure it.</p>
                </div>
              ) : selectedFormKey === 'vendor_onboarding' && (
                <div className="cs-empty" style={{ paddingTop: 24, paddingBottom: 24 }}>
                  <div className="cs-empty__icon"><FileCheck size={28} /></div>
                  <p style={{ fontSize: 14, color: 'var(--cs-text-secondary, #64748b)' }}>
                    Vendor Onboarding Documents configuration is now managed in the standalone <strong>Required Documents</strong> tab.
                  </p>
                  <button
                    type="button"
                    className="company-settings__btn company-settings__btn--primary"
                    style={{ marginTop: 16 }}
                    onClick={() => setActiveTab('form-documents')}
                  >
                    Go to Required Documents
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Required Documents
          ------------------------------------------------------- */}
      {activeTab === 'form-documents' && (
        <div className="cs-tab-panel cs-mandatory-section" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="cs-section-header__left">
                <h2><FileCheck size={17} /> Required Documents</h2>
                <p style={{ marginTop: 4 }}>
                  Configure document types for the vendor onboarding form. Each document can be marked as Mandatory, Optional, or Any Other via its category dropdown.
                </p>
              </div>
              <button
                className="company-settings__btn company-settings__btn--primary"
                onClick={() => addDocInline('mandatory')}
              >
                <Plus size={14} /> Add Document
              </button>
            </div>
            <div className="cs-section-body">
              {requiredDocsLoading ? (
                <TableSkeleton rows={4} />
              ) : editableDocs.length === 0 ? (
                <div className="cs-mandatory-custom-empty">
                  <FileText size={20} />
                  <p>No documents configured. Click "Add Document" to add one.</p>
                </div>
              ) : (
                <div className="cs-mandatory-custom-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Table Column Headers */}
                  <div className="cs-doc-grid-header">
                    <div>Doc Label</div>
                    <div>Document Name</div>
                    <div>Date of Issue</div>
                    <div>Date of Exp.</div>
                    <div>Issuing Auth.</div>
                    <div>Alert (Days)</div>
                    <div>Frequency</div>
                    <div>Category</div>
                    <div></div>
                  </div>

                  <div className="cs-mandatory-custom-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {editableDocs.map((doc, idx) => (
                      <div key={doc.id} className="cs-mandatory-custom-item--doc-row">
                        <div className="cs-mandatory-item-label" style={{ fontWeight: 600, fontSize: 13 }}>
                          Document {idx + 1}
                        </div>
                        <div className="company-settings__field">
                          <input
                            value={doc.name}
                            onChange={(e) => updateDocInline(doc.id, e.target.value)}
                            placeholder="e.g. Emirates ID / Trade License"
                            style={{ fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <label className={`cs-doc-toggle-pill ${(doc.trackIssueDate ?? true) ? 'cs-doc-toggle-pill--active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={doc.trackIssueDate ?? true}
                              onChange={(e) => {
                                setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, trackIssueDate: e.target.checked } : d));
                                setDocsDirty(true);
                              }}
                            />
                            {(doc.trackIssueDate ?? true) ? '✓ Enabled' : 'Disabled'}
                          </label>
                        </div>
                        <div>
                          <label className={`cs-doc-toggle-pill ${(doc.trackExpirationDate ?? true) ? 'cs-doc-toggle-pill--active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={doc.trackExpirationDate ?? true}
                              onChange={(e) => {
                                setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, trackExpirationDate: e.target.checked } : d));
                                setDocsDirty(true);
                              }}
                            />
                            {(doc.trackExpirationDate ?? true) ? '✓ Enabled' : 'Disabled'}
                          </label>
                        </div>
                        <div>
                          <label className={`cs-doc-toggle-pill ${(doc.trackIssuingAuthority ?? true) ? 'cs-doc-toggle-pill--active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={doc.trackIssuingAuthority ?? true}
                              onChange={(e) => {
                                setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, trackIssuingAuthority: e.target.checked } : d));
                                setDocsDirty(true);
                              }}
                            />
                            {(doc.trackIssuingAuthority ?? true) ? '✓ Enabled' : 'Disabled'}
                          </label>
                        </div>
                        <div>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            className="cs-doc-number-input"
                            value={doc.expirationAlertDays ?? 30}
                            onChange={(e) => updateDocExpirationAlertDays(doc.id, Number(e.target.value))}
                            placeholder="e.g. 30"
                          />
                        </div>
                        <div>
                          <select
                            className="cs-doc-field-type"
                            value={doc.expirationAlertFrequency || 'DAILY'}
                            onChange={(e) => updateDocExpirationAlertFrequency(doc.id, e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY')}
                            style={{ width: '100%', fontSize: 12 }}
                          >
                            <option value="DAILY">Daily</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="MONTHLY">Monthly</option>
                          </select>
                        </div>
                        <div>
                          <select
                            className="cs-doc-category-select"
                            value={doc.documentCategory || 'mandatory'}
                            onChange={(e) => {
                              setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, documentCategory: e.target.value as 'mandatory' | 'optional' } : d));
                              setDocsDirty(true);
                            }}
                            style={{ width: '100%', fontSize: 12 }}
                          >
                            <option value="mandatory">Mandatory</option>
                            <option value="optional">Optional</option>
                          </select>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <button
                            className="company-settings__icon-btn company-settings__icon-btn--danger"
                            onClick={() => removeDocInline(doc.id)}
                            title="Remove document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* -- Save Documents -- */}
              {docsDirty && (
                <div className="cs-mandatory-actions" style={{ marginTop: 24 }}>
                  <button
                    className="company-settings__btn company-settings__btn--primary"
                    onClick={handleSaveDocs}
                    disabled={savingDocs}
                  >
                    <Save size={16} /> {savingDocs ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    className="company-settings__btn company-settings__btn--secondary"
                    onClick={() => {
                      setDocsDirty(false);
                      setEditableDocs(requiredDocuments);
                    }}
                  >
                    <X size={16} /> Discard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Email Templates
          ------------------------------------------------------- */}
      {activeTab === 'email-templates' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Mail size={17} /> Email Templates</h2>
                <p>Customize the paragraph content of all emails sent by the system. The format and structure will remain the same.</p>
              </div>
            </div>
            <div className="cs-section-body" style={{ padding: 0 }}>
              {emailTemplatesLoading ? (
                <TableSkeleton rows={4} />
              ) : !selectedTemplateKey ? (
                /* ─── LIST VIEW: ENTERPRISE DATA TABLE ─────────── */
                <div className="cs-dt-table-wrapper">
                  <div className="cs-dt-toolbar">
                    <div className="cs-dt-toolbar__left">
                      <div className="cs-dt-type-tabs">
                        <button
                          type="button"
                          className={`cs-dt-type-tab ${emailFilterType === 'ALL' ? 'cs-dt-type-tab--active' : ''}`}
                          onClick={() => setEmailFilterType('ALL')}
                        >
                          All ({EMAIL_TEMPLATE_KEYS.length})
                        </button>
                        <button
                          type="button"
                          className={`cs-dt-type-tab ${emailFilterType === 'CUSTOMIZED' ? 'cs-dt-type-tab--active' : ''}`}
                          onClick={() => setEmailFilterType('CUSTOMIZED')}
                        >
                          Customized
                        </button>
                        <button
                          type="button"
                          className={`cs-dt-type-tab ${emailFilterType === 'DEFAULT' ? 'cs-dt-type-tab--active' : ''}`}
                          onClick={() => setEmailFilterType('DEFAULT')}
                        >
                          Default
                        </button>
                      </div>

                      <div className="cs-dt-search-box">
                        <Search size={14} className="cs-dt-search-icon" />
                        <input
                          type="text"
                          placeholder="Search email templates…"
                          value={emailSearchQuery}
                          onChange={(e) => setEmailSearchQuery(e.target.value)}
                          className="cs-dt-search-input"
                        />
                        {emailSearchQuery && (
                          <button type="button" className="cs-dt-search-clear" onClick={() => setEmailSearchQuery('')}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="cs-dt-table-container">
                    <table className="cs-dt-table">
                      <thead>
                        <tr>
                          <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
                          <th>Template Name</th>
                          <th>Template Key</th>
                          <th className="cs-dt-th--right" style={{ width: 160 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmailTemplateKeys.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="cs-dt-table-empty">
                              <Mail size={28} className="cs-dt-table-empty__icon" />
                              <p>No email templates found</p>
                            </td>
                          </tr>
                        ) : (
                          filteredEmailTemplateKeys.map(key => {
                            const saved = emailTemplates.find(t => t.templateKey === key);
                            const isCustom = !!saved && saved.bodyHtml !== '' && saved.bodyHtml !== undefined;
                            const label = EMAIL_TEMPLATE_LABELS[key] || key;

                            return (
                              <tr key={key} className="cs-dt-table-row">
                                <td className="cs-dt-table-cell cs-dt-table-cell--actions">
                                  <div className="cs-dt-action-btns">
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--edit"
                                      onClick={() => handleSelectTemplate(key)}
                                      title="Edit Email Template"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                  </div>
                                </td>

                                <td className="cs-dt-table-cell">
                                  <div
                                    className="cs-dt-name-wrapper"
                                    onClick={() => handleSelectTemplate(key)}
                                  >
                                    <Mail size={16} className="cs-dt-doc-icon" />
                                    <span className="cs-dt-template-title">{label}</span>
                                  </div>
                                </td>

                                <td className="cs-dt-table-cell">
                                  <span className="cs-dt-pill-badge">{key}</span>
                                </td>

                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  <span className={`cs-dt-status-badge ${isCustom ? 'cs-dt-status-badge--custom' : 'cs-dt-status-badge--default'}`}>
                                    {isCustom ? 'Customized' : 'Default'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ─── DETAIL VIEW: EDITOR ───────────────────────── */
                <ErrorBoundary>
                  <div className="cs-dt-detail">
                    <div className="cs-dt-detail__topbar">
                      <button
                        type="button"
                        className="cs-dt-detail__back"
                        onClick={() => {
                          if (templateDirty) {
                            setConfirmModalConfig({
                              isOpen: true,
                              title: 'Unsaved Changes',
                              message: 'Discard unsaved changes?',
                              confirmText: 'Discard',
                              cancelText: 'Cancel',
                              variant: 'warning',
                              onConfirm: () => {
                                setSelectedTemplateKey(null);
                                setEditedBodyHtml('');
                                setTemplateDirty(false);
                              },
                            });
                          } else {
                            setSelectedTemplateKey(null);
                            setEditedBodyHtml('');
                            setTemplateDirty(false);
                          }
                        }}
                      >
                        <ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} />
                        Back to Templates
                      </button>
                      <div className="cs-dt-detail__breadcrumb">
                        <span className="cs-dt-detail__breadcrumb-type">Email Template</span>
                        <span className="cs-dt-detail__breadcrumb-sep">›</span>
                        <span className="cs-dt-detail__breadcrumb-name">{EMAIL_TEMPLATE_LABELS[selectedTemplateKey] || selectedTemplateKey}</span>
                      </div>
                      <span className={templateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                        {templateDirty ? 'Unsaved changes' : isDefaultTemplate ? 'Using default' : 'Customized'}
                      </span>
                      <div className="cs-dt-detail__actions">
                        <button
                          type="button"
                          className="cs-dt-detail__sec-btn"
                          onClick={handleResetTemplate}
                          disabled={savingTemplate}
                        >
                          <RotateCcw size={14} /> Reset
                        </button>
                        <button
                          type="button"
                          className="cs-dt-detail__save-btn"
                          onClick={handleSaveTemplate}
                          disabled={savingTemplate || !templateDirty}
                        >
                          <Save size={15} />
                          {savingTemplate ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div className="cs-dt-detail__body">
                      <div className="cs-dt-detail__editor-col">
                        <div className="cs-dt-detail__editor-wrap">
                          <div className="cs-dt-detail__editor-label">
                            <Mail size={14} /> Email Body Content
                          </div>
                          <RichTextEditor
                            key={selectedTemplateKey}
                            value={editedBodyHtml}
                            onChange={handleBodyChange}
                            placeholder="Write email template content here..."
                            minHeight={320}
                          />
                        </div>

                        <div className="cs-doc-placeholders">
                          <div className="cs-doc-placeholders__title">Available Placeholders</div>
                          <div className="cs-doc-placeholders__list">
                            {Object.entries(EMAIL_PLACEHOLDERS).map(([code, desc]) => (
                              <span key={code} className="cs-doc-placeholders__item">
                                <code className="cs-doc-placeholders__code">{code}</code>
                                {' - '}{desc}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ErrorBoundary>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Documents & Contracts (Merged Tab)
          ------------------------------------------------------- */}
      {activeTab === 'documents-contracts' && (
        <div className="cs-tab-panel" role="tabpanel">

          {/* ── Sub-Navigation Pill Bar ── */}
          <div className="cs-subtab-bar">
            <button
              type="button"
              className={`cs-subtab-btn ${docContractSubTab === 'contracts' ? 'cs-subtab-btn--active' : ''}`}
              onClick={() => setDocContractSubTab('contracts')}
            >
              <FileText size={15} /> Contract Templates ({contractTemplates.length})
            </button>
            <button
              type="button"
              className={`cs-subtab-btn ${docContractSubTab === 'doc-templates' ? 'cs-subtab-btn--active' : ''}`}
              onClick={() => setDocContractSubTab('doc-templates')}
            >
              <FileSignature size={15} /> Document Templates ({documentTemplates.length})
            </button>
          </div>

          {/* ── Sub-Tab 1: Contract Templates ── */}
          {docContractSubTab === 'contracts' && (
            <div className="cs-section-card">
              <div className="cs-section-header">
                <div className="cs-section-header__left">
                  <h2><FileText size={17} /> Contract Templates</h2>
                  <p>Manage contract templates used when generating vendor contracts after RFQ final approval. Templates are selected by the final approver - not created per contract.</p>
                </div>
              </div>
              <div className="cs-section-body">
                {contractTemplatesLoading ? (
                  <TableSkeleton rows={3} />
                ) : !selectedContractType ? (
                  /* ─── LIST VIEW: ENTERPRISE DATA TABLE ─────────── */
                  <div className="cs-dt-table-wrapper">
                    <div className="cs-dt-toolbar">
                      <div className="cs-dt-toolbar__left">
                        <div className="cs-dt-type-tabs">
                          <button
                            type="button"
                            className={`cs-dt-type-tab ${contractFilterType === 'ALL' ? 'cs-dt-type-tab--active' : ''}`}
                            onClick={() => setContractFilterType('ALL')}
                          >
                            All ({contractTemplates.length})
                          </button>
                        </div>

                        <div className="cs-dt-search-box">
                          <Search size={14} className="cs-dt-search-icon" />
                          <input
                            type="text"
                            placeholder="Search contract templates…"
                            value={contractSearchQuery}
                            onChange={(e) => setContractSearchQuery(e.target.value)}
                            className="cs-dt-search-input"
                          />
                          {contractSearchQuery && (
                            <button type="button" className="cs-dt-search-clear" onClick={() => setContractSearchQuery('')}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="cs-dt-toolbar__right">
                        {editingNewContractType ? (
                          <div className="cs-dt-new-inline-form">
                            <input
                              type="text"
                              placeholder="Contract Type Name (e.g. Lease Contract)"
                              value={newContractTypeName}
                              onChange={(e) => setNewContractTypeName(e.target.value)}
                              className="cs-dt-new-input"
                              autoFocus
                            />
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--primary"
                              onClick={handleCreateNewContractType}
                              disabled={!newContractTypeName.trim() || savingContractTemplate}
                              style={{ padding: '5px 10px', fontSize: 12 }}
                            >
                              {savingContractTemplate ? 'Adding…' : 'Add'}
                            </button>
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--secondary"
                              onClick={() => { setEditingNewContractType(false); setNewContractTypeName(''); }}
                              style={{ padding: '5px 8px', fontSize: 12 }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="company-settings__btn company-settings__btn--primary"
                            onClick={() => setEditingNewContractType(true)}
                            style={{ gap: 6 }}
                          >
                            <Plus size={14} /> New Contract Template
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="cs-dt-table-container">
                      <table className="cs-dt-table">
                        <thead>
                          <tr>
                            <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
                            <th>Template Name</th>
                            <th className="cs-dt-th--right" style={{ width: 140 }}>Status</th>
                            <th className="cs-dt-th--right" style={{ width: 160 }}>Source Format</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredContractTemplates.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="cs-dt-table-empty">
                                <FileText size={28} className="cs-dt-table-empty__icon" />
                                <p>No contract templates found</p>
                              </td>
                            </tr>
                          ) : (
                            filteredContractTemplates.map(t => (
                              <tr key={t.type} className="cs-dt-table-row">
                                <td className="cs-dt-table-cell cs-dt-table-cell--actions">
                                  <div className="cs-dt-action-btns">
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--edit"
                                      onClick={() => handleSelectContractType(t.type)}
                                      title="Edit Template"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn"
                                      onClick={() => { setRenamingContractType(t.type); setRenamingContractTypeName(t.name); }}
                                      title="Rename"
                                    >
                                      <FileText size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--delete"
                                      onClick={() => handleDeleteContractType(t.type)}
                                      title="Delete"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>

                                <td className="cs-dt-table-cell">
                                  {renamingContractType === t.type ? (
                                    <div className="cs-dt-inline-rename">
                                      <input
                                        type="text"
                                        value={renamingContractTypeName}
                                        onChange={(e) => setRenamingContractTypeName(e.target.value)}
                                        className="cs-dt-inline-rename-input"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleRenameContractType(t.type, renamingContractTypeName);
                                          if (e.key === 'Escape') setRenamingContractType(null);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--primary"
                                        onClick={() => handleRenameContractType(t.type, renamingContractTypeName)}
                                        style={{ padding: '3px 8px', fontSize: 11 }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--secondary"
                                        onClick={() => setRenamingContractType(null)}
                                        style={{ padding: '3px 6px', fontSize: 11 }}
                                      >
                                        <X size={11} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      className="cs-dt-name-wrapper"
                                      onClick={() => handleSelectContractType(t.type)}
                                    >
                                      <FileText size={16} className="cs-dt-doc-icon" />
                                      <span className="cs-dt-template-title">{t.name}</span>
                                    </div>
                                  )}
                                </td>

                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  <span className={`cs-dt-status-badge ${t.version > 1 ? 'cs-dt-status-badge--custom' : 'cs-dt-status-badge--default'}`}>
                                    {t.version > 1 ? `Custom (v${t.version})` : 'Default'}
                                  </span>
                                </td>

                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  {t.fileUrl ? (
                                    <span className="cs-dt-source-badge cs-dt-source-badge--pdf">
                                      <FileText size={13} /> {t.fileName || 'PDF/DOC'}
                                    </span>
                                  ) : (
                                    <span className="cs-dt-source-badge">HTML Editor</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* ─── DETAIL VIEW: EDITOR ───────────────────────── */
                  <ErrorBoundary>
                    <div className="cs-dt-detail">
                      <div className="cs-dt-detail__topbar">
                        <button
                          type="button"
                          className="cs-dt-detail__back"
                          onClick={() => {
                            if (contractTemplateDirty) {
                              setConfirmModalConfig({
                                isOpen: true,
                                title: 'Unsaved Changes',
                                message: 'Discard unsaved changes?',
                                confirmText: 'Discard',
                                cancelText: 'Cancel',
                                variant: 'warning',
                                onConfirm: () => {
                                  setSelectedContractType(null);
                                  setEditedContractContent('');
                                  setEditedContractName('');
                                  setContractTemplateDirty(false);
                                },
                              });
                            } else {
                              setSelectedContractType(null);
                              setEditedContractContent('');
                              setEditedContractName('');
                              setContractTemplateDirty(false);
                            }
                          }}
                        >
                          <ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} />
                          Back to Templates
                        </button>
                        <div className="cs-dt-detail__breadcrumb">
                          <span className="cs-dt-detail__breadcrumb-type">{selectedContractTemplate?.name || selectedContractTemplate?.type}</span>
                          <span className="cs-dt-detail__breadcrumb-sep">›</span>
                          <span className="cs-dt-detail__breadcrumb-name">{editedContractName || selectedContractTemplate?.name}</span>
                        </div>
                        <label className="cs-dt-detail__toggle">
                          <input
                            type="checkbox"
                            checked={editedContractIsActive}
                            onChange={(e) => { setEditedContractIsActive(e.target.checked); setContractTemplateDirty(true); }}
                          />
                          {editedContractIsActive ? 'Active' : 'Inactive'}
                        </label>
                        <span className={contractTemplateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                          {contractTemplateDirty ? 'Unsaved changes' : contractTemplateIsDefault ? 'Default' : 'Customized'}
                        </span>
                        <div className="cs-dt-detail__actions">
                          <button
                            type="button"
                            className="cs-dt-detail__sec-btn"
                            onClick={handleResetContractTemplate}
                            disabled={savingContractTemplate || contractTemplateIsDefault}
                          >
                            <RotateCcw size={14} /> Reset
                          </button>
                          <button
                            type="button"
                            className="cs-dt-detail__save-btn"
                            onClick={handleSaveContractTemplate}
                            disabled={savingContractTemplate || !contractTemplateDirty}
                          >
                            <Save size={15} />
                            {savingContractTemplate ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <div className="cs-dt-detail__body">
                        <div className="cs-dt-detail__editor-col">
                          <div className="cs-dt-detail__name-row">
                            <label className="cs-dt-detail__name-label">Template Name</label>
                            <input
                              value={editedContractName || ''}
                              onChange={(e) => handleContractNameChange(e.target.value)}
                              placeholder="Template Name"
                              className="cs-dt-detail__name-input"
                            />
                          </div>

                          <div className="cs-dt-upload-strip">
                            <div className="cs-dt-upload-strip__left">
                              <FileText size={16} className="cs-dt-upload-strip__icon" />
                              <div>
                                <div className="cs-dt-upload-strip__label">Contract Document (PDF/DOC) (optional)</div>
                                <div className="cs-dt-upload-strip__desc">Upload a document file or extract text into the rich editor below</div>
                              </div>
                            </div>
                            <div className="cs-dt-upload-strip__right">
                              {selectedContractTemplate?.fileUrl ? (
                                <div className="cs-dt-upload-strip__file">
                                  <FileText size={13} />
                                  <span>{selectedContractTemplate.fileName || 'Uploaded document'}</span>
                                  <a href={selectedContractTemplate.fileUrl} target="_blank" rel="noopener noreferrer" className="cs-dt-upload-strip__view">View</a>
                                  <button
                                    type="button"
                                    className="cs-dt-upload-strip__remove"
                                    onClick={async () => {
                                      if (!selectedContractType) return;
                                      try {
                                        await companySettingsService.saveContractTemplate(selectedContractType, {
                                          name: editedContractName,
                                          content: editedContractContent,
                                          description: editedContractDescription || null,
                                          isActive: editedContractIsActive,
                                          fileUrl: null,
                                          fileName: null,
                                          fileType: null,
                                        });
                                        setContractTemplateDirty(false);
                                        await fetchContractTemplates();
                                        setPageMsg('Uploaded document removed from template.');
                                      } catch (err) {
                                        setPageMsg(err instanceof Error ? err.message : 'Failed to remove document');
                                      }
                                    }}
                                    disabled={contractFileUploading}
                                    title="Remove"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ) : (
                                <label className="cs-dt-upload-strip__btn">
                                  <input
                                    type="file"
                                    accept={ALLOWED_CONTRACT_UPLOAD_EXTENSIONS}
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file || !selectedContractType) return;
                                      setContractFileUploading(true);
                                      try {
                                        const result = await companySettingsService.uploadContractTemplateFile(selectedContractType, file);
                                        await companySettingsService.saveContractTemplate(selectedContractType, {
                                          name: editedContractName,
                                          content: editedContractContent,
                                          description: editedContractDescription || null,
                                          isActive: editedContractIsActive,
                                          fileUrl: result.fileUrl,
                                          fileName: result.fileName,
                                          fileType: result.fileType,
                                        });
                                        setContractTemplateDirty(false);
                                        await fetchContractTemplates();
                                        setContractTemplates(prev => prev.map(t =>
                                          t.type === selectedContractType ? { ...t, ocrStatus: null, ocrText: null, ocrProcessedAt: null } : t
                                        ));
                                        setPageMsg(`Document "${file.name}" uploaded and attached to template.`);
                                      } catch (err) {
                                        setPageMsg(err instanceof Error ? err.message : 'Upload failed');
                                      } finally {
                                        setContractFileUploading(false);
                                      }
                                      e.target.value = '';
                                    }}
                                  />
                                  {contractFileUploading ? <><Loader2 size={13} className="cs-spin" /> Uploading…</> : <><Upload size={13} /> Choose File</>}
                                </label>
                              )}

                              <button
                                type="button"
                                className="cs-dt-ocr-btn"
                                onClick={() => {
                                  if (!selectedContractTemplate?.fileUrl) {
                                    setPageMsg('Please upload a PDF/DOC file first before running OCR.');
                                    return;
                                  }
                                  if (selectedContractTemplate?.ocrStatus === 'COMPLETED' && selectedContractTemplate?.ocrText) {
                                    setEditedContractContent(textToHtml(selectedContractTemplate.ocrText));
                                    setContractTemplateDirty(true);
                                    setPageMsg('Extracted OCR text applied to rich editor!');
                                  } else {
                                    handleTriggerContractOcr();
                                  }
                                }}
                                disabled={selectedContractTemplate?.ocrStatus === 'PROCESSING' || contractFileUploading}
                                title="Run OCR on document and insert text into editor"
                              >
                                {selectedContractTemplate?.ocrStatus === 'PROCESSING' ? (
                                  <><Loader2 size={13} className="cs-spin" /> Processing OCR…</>
                                ) : (
                                  <><Sparkles size={13} /> Run OCR & Insert Text</>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="cs-dt-detail__editor-wrap">
                            <div className="cs-dt-detail__editor-label">
                              <FileSignature size={14} /> Contract Template Content
                            </div>
                            <RichTextEditor
                              key={selectedContractType ?? 'none'}
                              value={editedContractContent}
                              onChange={handleContractContentChange}
                              placeholder="Write contract template content here... Use {{contract_number}}, {{vendor_name}}, {{contract_value}}, etc."
                              minHeight={320}
                            />
                          </div>

                          <div className="cs-doc-placeholders">
                            <div className="cs-doc-placeholders__title">Available Placeholders</div>
                            <div className="cs-doc-placeholders__list">
                              {Object.entries(CONTRACT_PLACEHOLDERS).map(([code, desc]) => (
                                <span key={code} className="cs-doc-placeholders__item">
                                  <code className="cs-doc-placeholders__code">{code}</code>
                                  {' - '}{desc}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="cs-dt-signature-block">
                            <div className="cs-dt-signature-block__header">
                              <FileSignature size={16} />
                              <h3>Company Signature Configuration</h3>
                            </div>
                            <p className="cs-dt-signature-block__desc">
                              Draw or upload your official company signature below. It will automatically embed in generated contract agreements.
                            </p>
                            <div className="cs-dt-signature-block__content">
                              <SignatureSection />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ErrorBoundary>
                )}
              </div>
            </div>
          )}

          {/* ── Sub-Tab 2: Document Templates (NDA/MNDA) ── */}
          {docContractSubTab === 'doc-templates' && (
            <div className="cs-section-card">
              <div className="cs-section-header">
                <div className="cs-section-header__left">
                  <h2><FileSignature size={17} /> Document Templates (NDA & MNDA)</h2>
                  <p>Manage NDA and MNDA templates used during vendor onboarding. Create multiple templates per type, add, rename, and delete them as needed.</p>
                </div>
              </div>
              <div className="cs-section-body">
                {docTemplatesLoading ? (
                  <TableSkeleton rows={3} />
                ) : selectedDocId ? (
                  /* ─── DETAIL VIEW ───────────────────────────────── */
                  <ErrorBoundary>
                    <div className="cs-dt-detail">
                      <div className="cs-dt-detail__topbar">
                        <button
                          type="button"
                          className="cs-dt-detail__back"
                          onClick={() => {
                            if (docTemplateDirty) {
                              setConfirmModalConfig({
                                isOpen: true,
                                title: 'Unsaved Changes',
                                message: 'Discard unsaved changes?',
                                confirmText: 'Discard',
                                cancelText: 'Cancel',
                                variant: 'warning',
                                onConfirm: () => {
                                  setSelectedDocId(null);
                                  setEditedDocContent('');
                                  setEditedDocName('');
                                  setDocTemplateDirty(false);
                                },
                              });
                            } else {
                              setSelectedDocId(null);
                              setEditedDocContent('');
                              setEditedDocName('');
                              setDocTemplateDirty(false);
                            }
                          }}
                        >
                          <ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} />
                          Back to Templates
                        </button>
                        <div className="cs-dt-detail__breadcrumb">
                          <span className="cs-dt-detail__breadcrumb-type">{selectedDocTemplate?.type}</span>
                          <span className="cs-dt-detail__breadcrumb-sep">›</span>
                          <span className="cs-dt-detail__breadcrumb-name">{editedDocName || selectedDocTemplate?.name}</span>
                        </div>
                        <span className={docTemplateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                          {docTemplateDirty ? 'Unsaved changes' : docTemplateIsDefault ? 'Default' : 'Customized'}
                        </span>
                        <div className="cs-dt-detail__actions">
                          <button
                            type="button"
                            className="cs-dt-detail__sec-btn"
                            onClick={handleResetDocTemplate}
                            disabled={savingDocTemplate}
                          >
                            <RotateCcw size={14} /> Reset
                          </button>
                          <button
                            type="button"
                            className="cs-dt-detail__save-btn"
                            onClick={handleSaveDocTemplate}
                            disabled={savingDocTemplate || !docTemplateDirty}
                          >
                            <Save size={15} />
                            {savingDocTemplate ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <div className="cs-dt-detail__body">
                        <div className="cs-dt-detail__editor-col">
                          <div className="cs-dt-detail__name-row">
                            <label className="cs-dt-detail__name-label">Template Name</label>
                            <input
                              value={editedDocName || ''}
                              onChange={(e) => handleDocNameChange(e.target.value)}
                              placeholder="Template Name"
                              className="cs-dt-detail__name-input"
                            />
                          </div>

                          <div className="cs-dt-upload-strip">
                            <div className="cs-dt-upload-strip__left">
                              <FileText size={16} className="cs-dt-upload-strip__icon" />
                              <div>
                                <div className="cs-dt-upload-strip__label">Upload PDF/DOC (optional)</div>
                                <div className="cs-dt-upload-strip__desc">Upload a document file or extract text into the rich editor below</div>
                              </div>
                            </div>
                            <div className="cs-dt-upload-strip__right">
                              {selectedDocTemplate?.fileUrl ? (
                                <div className="cs-dt-upload-strip__file">
                                  <FileText size={13} />
                                  <span>{selectedDocTemplate.fileName || 'Uploaded document'}</span>
                                  <a href={selectedDocTemplate.fileUrl} target="_blank" rel="noopener noreferrer" className="cs-dt-upload-strip__view">View</a>
                                  <button type="button" className="cs-dt-upload-strip__remove" onClick={handleRemoveDocumentFile} disabled={docFileUploading} title="Remove">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ) : (
                                <label className="cs-dt-upload-strip__btn">
                                  <input type="file" accept={ALLOWED_CONTRACT_UPLOAD_EXTENSIONS} style={{ display: 'none' }} onChange={handleUploadDocumentFile} />
                                  {docFileUploading ? <><Loader2 size={13} className="cs-spin" /> Uploading…</> : <><Upload size={13} /> Choose File</>}
                                </label>
                              )}

                              <button
                                type="button"
                                className="cs-dt-ocr-btn"
                                onClick={() => {
                                  if (!selectedDocTemplate?.fileUrl) {
                                    setPageMsg('Please upload a PDF/DOC file first before running OCR.');
                                    return;
                                  }
                                  if (selectedDocTemplate?.ocrStatus === 'COMPLETED' && selectedDocTemplate?.ocrText) {
                                    setEditedDocContent(textToHtml(selectedDocTemplate.ocrText));
                                    setDocTemplateDirty(true);
                                    setPageMsg('Extracted OCR text applied to rich editor!');
                                  } else {
                                    handleTriggerDocumentOcr();
                                  }
                                }}
                                disabled={selectedDocTemplate?.ocrStatus === 'PROCESSING' || docFileUploading}
                                title="Run OCR on document and insert text into editor"
                              >
                                {selectedDocTemplate?.ocrStatus === 'PROCESSING' ? (
                                  <><Loader2 size={13} className="cs-spin" /> Processing OCR…</>
                                ) : (
                                  <><Sparkles size={13} /> Run OCR & Insert Text</>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="cs-dt-detail__editor-wrap">
                            <div className="cs-dt-detail__editor-label">
                              <FileSignature size={14} /> Template Content
                            </div>
                            <RichTextEditor
                              key={selectedDocId ?? 'none'}
                              value={editedDocContent}
                              onChange={handleDocContentChange}
                              placeholder="Write template content here… use {{companyName}}, {{vendorName}}, {{currentDate}}, etc."
                              minHeight={320}
                            />
                          </div>

                          {/* Signature Configuration Block inside Editor */}
                          <div className="cs-dt-signature-block">
                            <div className="cs-dt-signature-block__header">
                              <FileSignature size={16} />
                              <h3>Company Signature Configuration</h3>
                            </div>
                            <p className="cs-dt-signature-block__desc">
                              Draw or upload your official company signature below. It will automatically embed in generated agreements.
                            </p>
                            <div className="cs-dt-signature-block__content">
                              <SignatureSection />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ErrorBoundary>
                ) : (
                  /* ─── LIST VIEW ─── */
                  <div className="cs-dt-table-wrapper">
                    {/* ── Toolbar / Controls Bar ── */}
                    <div className="cs-dt-toolbar">
                      <div className="cs-dt-toolbar__left">
                        <div className="cs-dt-type-tabs">
                          <button
                            type="button"
                            className={`cs-dt-type-tab ${docTypeFilter === 'ALL' ? 'cs-dt-type-tab--active' : ''}`}
                            onClick={() => setDocTypeFilter('ALL')}
                          >
                            All ({documentTemplates.length})
                          </button>
                          {DOC_TEMPLATE_TYPES.map(type => {
                            const count = documentTemplates.filter(t => t.type === type).length;
                            const label = type === 'ANY_OTHER' ? 'Any Other' : type;
                            return (
                              <button
                                key={type}
                                type="button"
                                className={`cs-dt-type-tab ${docTypeFilter === type ? 'cs-dt-type-tab--active' : ''}`}
                                onClick={() => setDocTypeFilter(type)}
                              >
                                {label} ({count})
                              </button>
                            );
                          })}
                        </div>

                        <div className="cs-dt-search-box">
                          <Search size={14} className="cs-dt-search-icon" />
                          <input
                            type="text"
                            value={docSearchQuery}
                            onChange={(e) => setDocSearchQuery(e.target.value)}
                            placeholder="Search templates by name..."
                            className="cs-dt-search-input"
                          />
                          {docSearchQuery && (
                            <button type="button" className="cs-dt-search-clear" onClick={() => setDocSearchQuery('')}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="cs-dt-toolbar__right">
                        {editingNewDoc ? (
                          <div className="cs-dt-new-inline-form">
                            <select
                              value={editingNewDoc}
                              onChange={(e) => setEditingNewDoc(e.target.value as 'NDA' | 'MNDA' | 'ANY_OTHER')}
                              className="cs-dt-new-select"
                            >
                              <option value="NDA">NDA</option>
                              <option value="MNDA">MNDA</option>
                              <option value="ANY_OTHER">Any Other Document</option>
                            </select>
                            <input
                              type="text"
                              value={newDocName}
                              onChange={(e) => setNewDocName(e.target.value)}
                              placeholder={`New ${editingNewDoc} template name...`}
                              className="cs-dt-new-input"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateNewDocTemplate(editingNewDoc);
                                if (e.key === 'Escape') { setEditingNewDoc(null); setNewDocName(''); }
                              }}
                            />
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--primary"
                              onClick={() => handleCreateNewDocTemplate(editingNewDoc)}
                              disabled={!newDocName.trim() || savingDocTemplate}
                              style={{ padding: '6px 12px', fontSize: 12 }}
                            >
                              <Plus size={13} /> {savingDocTemplate ? 'Creating…' : 'Create'}
                            </button>
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--secondary"
                              onClick={() => { setEditingNewDoc(null); setNewDocName(''); }}
                              style={{ padding: '6px 10px', fontSize: 12 }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="company-settings__btn company-settings__btn--primary"
                            onClick={() => { setEditingNewDoc('NDA'); setNewDocName(''); }}
                          >
                            <Plus size={15} /> Add Document
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Data Table ── */}
                    <div className="cs-dt-table-container">
                      <table className="cs-dt-table">
                        <thead>
                          <tr>
                            <th style={{ width: 110, textAlign: 'center' }}>Actions</th>
                            <th>Template Name</th>
                            <th style={{ width: 100 }}>Type</th>
                            <th className="cs-dt-th--right" style={{ width: 140 }}>Status</th>
                            <th className="cs-dt-th--right" style={{ width: 160 }}>Source Format</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDocTemplates.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="cs-dt-table-empty">
                                <FileSignature size={28} className="cs-dt-table-empty__icon" />
                                <p>No document templates found</p>
                              </td>
                            </tr>
                          ) : (
                            filteredDocTemplates.map((tmpl) => (
                              <tr key={tmpl.id} className="cs-dt-table-row">
                                <td className="cs-dt-table-cell cs-dt-table-cell--actions">
                                  <div className="cs-dt-action-btns">
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--edit"
                                      onClick={() => handleSelectDocTemplate(tmpl.id)}
                                      title="Edit Template"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn"
                                      onClick={() => { setRenamingDocId(tmpl.id); setRenamingDocName(tmpl.name); }}
                                      title="Rename"
                                    >
                                      <FileText size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--delete"
                                      onClick={() => handleDeleteDocTemplate(tmpl.id)}
                                      title="Delete"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                                <td className="cs-dt-table-cell">
                                  {renamingDocId === tmpl.id ? (
                                    <div className="cs-dt-inline-rename">
                                      <input
                                        type="text"
                                        value={renamingDocName}
                                        onChange={(e) => setRenamingDocName(e.target.value)}
                                        className="cs-dt-inline-rename-input"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleRenameDocTemplate(tmpl.id, renamingDocName);
                                          if (e.key === 'Escape') setRenamingDocId(null);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--primary"
                                        onClick={() => handleRenameDocTemplate(tmpl.id, renamingDocName)}
                                        style={{ padding: '3px 8px', fontSize: 11 }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--secondary"
                                        onClick={() => setRenamingDocId(null)}
                                        style={{ padding: '3px 6px', fontSize: 11 }}
                                      >
                                        <X size={11} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      className="cs-dt-name-wrapper"
                                      onClick={() => handleSelectDocTemplate(tmpl.id)}
                                    >
                                      <FileText size={16} className="cs-dt-doc-icon" />
                                      <span className="cs-dt-template-title">{tmpl.name}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="cs-dt-table-cell">
                                  <span className={`cs-dt-type-badge cs-dt-type-badge--${tmpl.type.toLowerCase()}`}>
                                    {tmpl.type}
                                  </span>
                                </td>
                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  <span className={`cs-dt-status-badge ${tmpl.version > 1 ? 'cs-dt-status-badge--custom' : 'cs-dt-status-badge--default'}`}>
                                    {tmpl.version > 1 ? `v${tmpl.version} Customized` : 'Default'}
                                  </span>
                                </td>
                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  {tmpl.fileUrl ? (
                                    <span className="cs-dt-source-badge cs-dt-source-badge--pdf">
                                      <FileText size={12} /> PDF Document
                                    </span>
                                  ) : (
                                    <span className="cs-dt-source-badge cs-dt-source-badge--html">
                                      <FileSignature size={12} /> Rich HTML
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}



        </div>
      )}
      {/* ---- MODALS (unchanged logic) ------ */}

      {/* ── Contract Template Preview ── */}
      {contractPreviewOpen && (
        <div className="company-settings__backdrop" onClick={() => setContractPreviewOpen(false)}>
          <div className="company-settings__modal company-settings__modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Eye size={18} /> Template Preview - {editedContractName}</span>
              <button className="company-settings__icon-btn" onClick={() => setContractPreviewOpen(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <div
                className="ctr-detail__doc-preview"
                dangerouslySetInnerHTML={{ __html: editedContractContent }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Department Modal ── */}
      {showDeptModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowDeptModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Building2 size={18} /> {editingDept ? 'Edit Department' : 'Add Department'}</span>
              <button className="company-settings__icon-btn" onClick={() => setShowDeptModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {deptError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{deptError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Department Name <span>*</span></label>
                <input
                  value={deptName}
                  onChange={(e) => { setDeptName(e.target.value); setDeptError(null); }}
                  placeholder="e.g. R&D"
                  className={deptError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={deptName}
                  items={departments}
                  excludeId={editingDept?.id}
                  labelName="Department"
                />
              </div>
              <div className="company-settings__field">
                <label>Description</label>
                <textarea value={deptDesc} onChange={(e) => setDeptDesc(e.target.value)} placeholder="Optional description" rows={3} />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowDeptModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!deptName.trim() || actionLoading} onClick={handleSaveDept}>
                <Save size={16} /> {actionLoading ? 'Saving…' : editingDept ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {/* ── Delete Contract Type Confirmation Modal ── */}
      {deleteContractTypeTarget && (
        <div className="company-settings__backdrop" onClick={cancelDeleteContractType}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Trash2 size={18} style={{ color: 'var(--danger-500)' }} /> Delete Contract Type?</span>
              <button className="company-settings__icon-btn" onClick={cancelDeleteContractType}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                Permanently delete <strong>{contractTemplates.find(t => t.type === deleteContractTypeTarget)?.name || deleteContractTypeTarget}</strong>?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                This contract type and its template will be permanently removed from the system. Existing contracts using this type will not be affected. This action cannot be undone.
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={cancelDeleteContractType}>Cancel</button>
              <button
                className="company-settings__btn company-settings__btn--danger"
                disabled={savingContractTemplate}
                onClick={handleDeleteContractTypeConfirm}
              >
                <Trash2 size={16} /> {savingContractTemplate ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDocIdTarget && (
        <div className="company-settings__backdrop" onClick={cancelDeleteDocTemplate}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Trash2 size={18} style={{ color: 'var(--danger-500)' }} /> Delete Document Template?</span>
              <button className="company-settings__icon-btn" onClick={cancelDeleteDocTemplate}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                Permanently delete <strong>{documentTemplates.find(t => t.id === deleteDocIdTarget)?.name || 'this template'}</strong>?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                This template will be permanently removed. Existing onboarding documents using this template will not be affected. This action cannot be undone.
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={cancelDeleteDocTemplate}>Cancel</button>
              <button
                className="company-settings__btn company-settings__btn--danger"
                disabled={savingDocTemplate}
                onClick={confirmDeleteDocTemplate}
              >
                <Trash2 size={16} /> {savingDocTemplate ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="company-settings__backdrop" onClick={cancelDelete}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Trash2 size={18} style={{ color: 'var(--danger-500)' }} /> Delete {deleteTarget.type === 'department' ? 'Department' : deleteTarget.type === 'category' ? 'Category' : deleteTarget.type === 'unit' ? 'Unit' : deleteTarget.type === 'paymentTerm' ? 'Payment Term' : deleteTarget.type === 'requiredDocument' ? 'Required Document' : 'Position'}?</span>
              <button className="company-settings__icon-btn" onClick={cancelDelete}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                Permanently delete <strong>{deleteTarget.name}</strong>{deleteTarget.type === 'department' ? ' and all its categories' : ''}?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {deleteTarget.type === 'department'
                  ? 'All categories under this department will also be deleted. Vendors assigned to these categories will keep their profile but lose the category link. This action cannot be undone.'
                  : deleteTarget.type === 'category'
                    ? 'Vendors currently assigned to this category will keep their profile but lose the category link. This action cannot be undone.'
                    : deleteTarget.type === 'unit'
                      ? 'This unit will be removed from the system. Existing RFQ line items using this unit will not be affected. This action cannot be undone.'
                      : deleteTarget.type === 'paymentTerm'
                        ? 'This payment term will be removed. Existing quotations already using this term will not be affected. This action cannot be undone.'
                        : deleteTarget.type === 'requiredDocument'
                          ? 'This required document will be removed from the vendor onboarding form. Existing vendor documents of this type will not be affected. This action cannot be undone.'
                          : 'This position will be removed from the system. Existing users assigned to this position will not be affected. This action cannot be undone.'}
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={cancelDelete}>Cancel</button>
              <button
                className="company-settings__btn company-settings__btn--danger"
                disabled={deleting}
                onClick={confirmDelete}
              >
                <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Confirmation Modal ── */}
      {confirmModalConfig && confirmModalConfig.isOpen && (
        <div className="company-settings__backdrop" onClick={() => setConfirmModalConfig(null)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span>
                {confirmModalConfig.variant === 'danger' ? (
                  <Trash2 size={18} style={{ color: 'var(--danger-500)' }} />
                ) : confirmModalConfig.variant === 'warning' ? (
                  <AlertTriangle size={18} style={{ color: 'var(--warning-500)', marginRight: 8, verticalAlign: 'middle' }} />
                ) : (
                  <Info size={18} style={{ color: 'var(--primary-500)', marginRight: 8, verticalAlign: 'middle' }} />
                )}
                {confirmModalConfig.title}
              </span>
              <button className="company-settings__icon-btn" onClick={() => setConfirmModalConfig(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {confirmModalConfig.message}
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button
                type="button"
                className="company-settings__btn company-settings__btn--secondary"
                onClick={() => setConfirmModalConfig(null)}
              >
                {confirmModalConfig.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                className={`company-settings__btn ${
                  confirmModalConfig.variant === 'danger'
                    ? 'company-settings__btn--danger'
                    : 'company-settings__btn--primary'
                }`}
                onClick={() => {
                  const action = confirmModalConfig.onConfirm;
                  setConfirmModalConfig(null);
                  action();
                }}
              >
                {confirmModalConfig.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unit Modal ── */}
      {showUnitModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowUnitModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span>Add Unit</span>
              <button className="company-settings__icon-btn" onClick={() => setShowUnitModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {unitError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{unitError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Unit Name <span>*</span></label>
                <input
                  value={unitName}
                  onChange={(e) => { setUnitName(e.target.value); setUnitError(null); }}
                  placeholder="e.g. Pcs, Kg, Ltr, Mtr"
                  className={unitError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={unitName}
                  items={units}
                  labelName="Unit"
                />
              </div>
              <div className="company-settings__field">
                <label>Aliases / Synonyms</label>
                <input
                  value={unitAliases}
                  onChange={(e) => { setUnitAliases(e.target.value); setUnitError(null); }}
                  placeholder="e.g. piece, pieces, pc"
                />
                <span className="cs-field-hint">
                  Comma-separated list of alternative names. If any alias matches an existing unit, creation will be blocked.
                </span>
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowUnitModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!unitName.trim() || actionLoading} onClick={handleSaveUnit}>
                <Save size={16} /> {actionLoading ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Position Modal ── */}
      {showPositionModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowPositionModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span>Add Position</span>
              <button className="company-settings__icon-btn" onClick={() => setShowPositionModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {positionError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{positionError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Position Name <span>*</span></label>
                <input
                  value={positionName}
                  onChange={(e) => { setPositionName(e.target.value); setPositionError(null); }}
                  placeholder="e.g. Purchase Clerk"
                  className={positionError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={positionName}
                  items={positions}
                  labelName="Position"
                />
              </div>
              <div className="company-settings__field">
                <label>Description</label>
                <textarea value={positionDesc} onChange={(e) => setPositionDesc(e.target.value)} placeholder="Optional description" rows={3} />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowPositionModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!positionName.trim() || actionLoading} onClick={handleSavePosition}>
                <Save size={16} /> {actionLoading ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Term Modal ── */}
      {showPaymentTermModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowPaymentTermModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span>Add Payment Term</span>
              <button className="company-settings__icon-btn" onClick={() => setShowPaymentTermModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {paymentTermError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{paymentTermError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Payment Term Name <span>*</span></label>
                <input
                  value={paymentTermName}
                  onChange={(e) => { setPaymentTermName(e.target.value); setPaymentTermError(null); }}
                  placeholder="e.g. Net 30, Net 45, Advance"
                  className={paymentTermError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={paymentTermName}
                  items={paymentTerms}
                  labelName="Payment term"
                />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowPaymentTermModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!paymentTermName.trim() || actionLoading} onClick={handleSavePaymentTerm}>
                <Save size={16} /> {actionLoading ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category Modal ── */}
      {showCatModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowCatModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Tag size={18} /> {editingCat ? 'Edit Category' : 'Add Category'}</span>
              <button className="company-settings__icon-btn" onClick={() => setShowCatModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {catError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{catError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Department <span>*</span></label>
                <select value={catDeptId} onChange={(e) => setCatDeptId(e.target.value)}>
                  <option value="">Select department</option>
                  {departments.filter((d) => d.isActive).map((d) => (
                    <option key={d.id} value={String(d.id)}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="company-settings__field">
                <label>Category Name <span>*</span></label>
                <input
                  value={catName}
                  onChange={(e) => { setCatName(e.target.value); setCatError(null); }}
                  placeholder="e.g. Precision Tools"
                  className={catError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={catName}
                  items={categories.filter(c => String(c.departmentId) === String(catDeptId))}
                  excludeId={editingCat?.id}
                  labelName="Category"
                />
              </div>
              <div className="company-settings__field">
                <label>Description</label>
                <textarea value={catDesc} onChange={(e) => setCatDesc(e.target.value)} placeholder="Optional description" rows={3} />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowCatModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!catName.trim() || !catDeptId || actionLoading} onClick={handleSaveCat}>
                <Save size={16} /> {actionLoading ? 'Saving…' : editingCat ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}


      {cropFile && (
        <ImageCropperModal
          file={cropFile}
          cropAspectWidth={1}
          cropAspectHeight={1}
          onCrop={handleCropAndUpload}
          onClose={() => setCropFile(null)}
        />
      )}

    </div>
  );
}
