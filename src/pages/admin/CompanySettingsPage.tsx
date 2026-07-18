import { useState, useCallback, useEffect, useRef, useMemo, createElement } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { companySettingsService, ALLOWED_CONTRACT_UPLOAD_EXTENSIONS, type Department, type Category, type Unit, type Position, type PaymentTerm, type CompanyProfile, type EmailTemplate, type RequiredDocument, type DocumentTemplate, type DocumentTemplateInput, type ContractTemplate, type ContractTemplateInput } from '../../services/companySettingsService';
import { invalidateApiCache } from '../../api/client';
import {
  Plus, X, Edit3, Building2, Tag, ChevronDown, ChevronRight, ChevronUp, Search,
  Save, Settings, DollarSign, Trash2, Ruler, Users, CreditCard, Mail, FileText, RotateCcw, Clock,
  Palette, Image, FileSignature, Eye, Upload, Loader2,
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

// ─── Tab Definitions ────────────────────────────────────────

type TabKey = 'general' | 'branding' | 'departments' | 'positions' | 'forms' | 'email-templates' | 'documents' | 'contracts';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { key: 'general',           label: 'General',                icon: <Settings size={15} /> },
  { key: 'branding',          label: 'Branding',               icon: <Palette size={15} /> },
  { key: 'departments',       label: 'Departments',            icon: <Building2 size={15} /> },
  { key: 'positions',         label: 'Positions',              icon: <Users size={15} /> },
  { key: 'forms',           label: 'Forms Settings',          icon: <FileText size={15} /> },
  { key: 'email-templates',   label: 'Email Templates',        icon: <Mail size={15} /> },
  { key: 'documents',         label: 'Documents',              icon: <FileSignature size={15} /> },
  { key: 'contracts',         label: 'Contracts',              icon: <FileText size={15} /> },
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
  }, [brandingDirty, brandingName, brandingLogoUrl, brandingFaviconUrl, brandingColor, brandingLoginText, brandingSupportEmail, profile, refreshBranding]);

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

  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catDeptId, setCatDeptId] = useState<string>('');
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Unit modal state
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [unitAliases, setUnitAliases] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);

  // Payment Term modal state
  const [showPaymentTermModal, setShowPaymentTermModal] = useState(false);
  const [paymentTermName, setPaymentTermName] = useState('');

  // Position modal state
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [positionName, setPositionName] = useState('');
  const [positionDesc, setPositionDesc] = useState('');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'department' | 'category' | 'unit' | 'position' | 'paymentTerm' | 'requiredDocument'; id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    if (templateDirty) {
      const confirm = window.confirm('You have unsaved changes. Discard them?');
      if (!confirm) return;
    }
    setSelectedTemplateKey(key);
    setTemplateDirty(false);
    const tmpl = emailTemplates.find((t) => t.templateKey === key);
    setEditedBodyHtml(tmpl?.bodyHtml || '');
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
    const confirm = window.confirm('Reset this template to its default content?');
    if (!confirm) return;
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
  const ocrPollActiveRef = useRef(false);

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
    if (activeTab === 'contracts') {
      fetchContractTemplates();
    }
  }, [activeTab, fetchContractTemplates]);

  const selectedContractTemplate = contractTemplates.find(t => t.type === selectedContractType);
  const contractTemplateIsDefault = !selectedContractTemplate || selectedContractTemplate.version <= 1;

  const handleSelectContractType = useCallback(async (type: string) => {
    if (contractTemplateDirty) {
      const confirm = window.confirm('You have unsaved changes. Discard them?');
      if (!confirm) return;
    }
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
    const confirm = window.confirm(`Reset the ${selectedContractType} template to its default content? This cannot be undone.`);
    if (!confirm) return;
    setSavingContractTemplate(true);
    setPageMsg(null);
    try {
      await companySettingsService.deleteContractTemplate(selectedContractType);
      setEditedContractContent('');
      setContractTemplateDirty(false);
      setSelectedContractType(null);
      await fetchContractTemplates();
      setPageMsg(`${selectedContractType} template reset to default.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to reset template');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [selectedContractType, fetchContractTemplates]);

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

      // Poll for OCR status until COMPLETED, FAILED, or timeout (120s for scanned PDFs)
      const typeAtTrigger = selectedContractType;
      const MAX_POLL_MS = 120000;
      const INTERVAL_MS = 3000;
      const startTime = Date.now();
      ocrPollActiveRef.current = true;

      const poll = async () => {
        // Stop polling if cancelled (new OCR trigger or component unmount)
        if (!ocrPollActiveRef.current) return;

        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
          ocrPollActiveRef.current = false;
          // Bust cache and re-fetch to get the actual status from backend
          invalidateApiCache('/company-settings/contract-templates');
          fetchContractTemplates();
          setPageMsg('OCR is taking longer than expected. Refreshing status from server...');
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
              setPageMsg('OCR completed! Text extracted from uploaded file.');
            } else if (status.ocrStatus === 'FAILED') {
              setPageMsg('OCR failed. The uploaded file may contain no readable text.');
            }
          } else {
            setTimeout(poll, INTERVAL_MS);
          }
        } catch {
          setTimeout(poll, INTERVAL_MS);
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
  // Per-template independent state so switching NDA/MNDA preserves unsaved changes
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [docTemplatesLoading, setDocTemplatesLoading] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<'NDA' | 'MNDA' | null>(null);
  const [docDrafts, setDocDrafts] = useState<Record<string, { content: string; name: string }>>({});
  const [docDirty, setDocDirty] = useState<Record<string, boolean>>({});
  const [savingDocTemplate, setSavingDocTemplate] = useState(false);
  const [docFileUploading, setDocFileUploading] = useState(false);
  const docOcrPollActiveRef = useRef(false);

  // Derived values for the currently selected document template
  const selectedDocTemplate = useMemo(
    () => documentTemplates.find(t => t.type === selectedDocType) || null,
    [documentTemplates, selectedDocType]
  );
  const docTemplateIsDefault = !selectedDocTemplate || selectedDocTemplate.version <= 1;
  const editedDocContent = (selectedDocType && docDrafts[selectedDocType]?.content) ?? '';
  const editedDocName = (selectedDocType && docDrafts[selectedDocType]?.name) ?? '';
  const docTemplateDirty = (selectedDocType && docDirty[selectedDocType]) ?? false;

  const DOC_TEMPLATE_TYPES = ['NDA', 'MNDA'] as const;
  const DOC_TEMPLATE_LABELS: Record<string, string> = {
    'NDA': 'Non-Disclosure Agreement',
    'MNDA': 'Mutual Non-Disclosure Agreement',
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
      // Reset any PROCESSING status from backend — OCR should only show as
      // processing when the user explicitly clicks "Run OCR" in the preview.
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
    if (activeTab === 'documents') {
      fetchDocumentTemplates();
    }
  }, [activeTab, fetchDocumentTemplates]);

  const handleSelectDocType = useCallback(async (type: 'NDA' | 'MNDA') => {
    if (docTemplateDirty) {
      const confirm = window.confirm('You have unsaved changes. Discard them?');
      if (!confirm) return;
    }
    setSelectedDocType(type);
    // Clear dirty state for this type when switching TO it
    setDocDirty(prev => ({ ...prev, [type]: false }));
    const tmpl = documentTemplates.find(t => t.type === type);
    if (tmpl && tmpl.content) {
      setDocDrafts(prev => ({ ...prev, [type]: { content: tmpl.content, name: tmpl.name || DOC_TEMPLATE_LABELS[type] } }));
    } else {
      // No saved template with content - fetch default content from backend
      try {
        const result = await companySettingsService.getDocumentTemplate(type);
        if (result) {
          setDocDrafts(prev => ({ ...prev, [type]: { content: result?.defaultContent || '', name: tmpl?.name || DOC_TEMPLATE_LABELS[type] } }));
        } else {
          setDocDrafts(prev => ({ ...prev, [type]: { content: '', name: tmpl?.name || DOC_TEMPLATE_LABELS[type] } }));
        }
      } catch {
        setDocDrafts(prev => ({ ...prev, [type]: { content: '', name: tmpl?.name || DOC_TEMPLATE_LABELS[type] } }));
      }
    }
  }, [documentTemplates, docTemplateDirty, DOC_TEMPLATE_LABELS]);

  const handleDocContentChange = useCallback((html: string) => {
    if (!selectedDocType) return;
    setDocDrafts(prev => ({
      ...prev,
      [selectedDocType]: { content: html, name: prev[selectedDocType]?.name || '' }
    }));
    setDocDirty(prev => ({ ...prev, [selectedDocType]: true }));
  }, [selectedDocType]);

  const handleDocNameChange = useCallback((name: string) => {
    if (!selectedDocType) return;
    setDocDrafts(prev => ({
      ...prev,
      [selectedDocType]: { content: prev[selectedDocType]?.content || '', name }
    }));
    setDocDirty(prev => ({ ...prev, [selectedDocType]: true }));
  }, [selectedDocType]);

  const handleSaveDocTemplate = useCallback(async () => {
    if (!selectedDocType || !editedDocContent) return;
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.saveDocumentTemplate(selectedDocType, {
        name: editedDocName.trim(),
        content: editedDocContent,
        isActive: true,
      });
      setDocumentTemplates((prev) => {
        const filtered = prev.filter(t => t.type !== selectedDocType);
        return [...filtered, updated];
      });
      setDocDirty(prev => ({ ...prev, [selectedDocType]: false }));
      setPageMsg(`${DOC_TEMPLATE_LABELS[selectedDocType] || selectedDocType} template saved successfully.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save document template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [selectedDocType, editedDocContent, editedDocName, DOC_TEMPLATE_LABELS]);

  const handleResetDocTemplate = useCallback(async () => {
    if (!selectedDocType) return;
    const type = selectedDocType;
    const label = DOC_TEMPLATE_LABELS[type] || type;
    if (!window.confirm(`Reset the ${label} template to its default content? This cannot be undone.`)) return;
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      await companySettingsService.deleteDocumentTemplate(type);
      // Re-fetch so auto-seed creates fresh default template in DB
      await fetchDocumentTemplates();
      // Re-select the same type to load default content into drafts
      try {
        const result = await companySettingsService.getDocumentTemplate(type);
        if (result?.defaultContent) {
          setDocDrafts(prev => ({ ...prev, [type]: { content: result.defaultContent, name: label } }));
        } else {
          setDocDrafts(prev => ({ ...prev, [type]: { content: '', name: label } }));
        }
      } catch {
        setDocDrafts(prev => ({ ...prev, [type]: { content: '', name: label } }));
      }
      setDocDirty(prev => ({ ...prev, [type]: false }));
      setPageMsg(`${label} template reset to default.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to reset template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [selectedDocType, DOC_TEMPLATE_LABELS, fetchDocumentTemplates]);

  // ── Document OCR Handlers ──
  const handleTriggerDocumentOcr = useCallback(async () => {
    if (!selectedDocType) return;
    // Cancel any previous OCR polling
    docOcrPollActiveRef.current = false;

    // Show processing state inside the OCR Preview box immediately
    setDocumentTemplates(prev => prev.map(t =>
      t.type === selectedDocType
        ? { ...t, ocrStatus: 'PROCESSING' }
        : t
    ));
    try {
      await companySettingsService.triggerDocumentOcr(selectedDocType);

      const typeAtTrigger = selectedDocType;
      const MAX_POLL_MS = 120000;
      const INTERVAL_MS = 3000;
      const startTime = Date.now();
      docOcrPollActiveRef.current = true;

      const poll = async () => {
        if (!docOcrPollActiveRef.current) return;

        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
          docOcrPollActiveRef.current = false;
          invalidateApiCache('/company-settings/document-templates');
          fetchDocumentTemplates();
          setPageMsg('OCR is taking longer than expected. Refreshing status from server...');
          return;
        }
        try {
          const status = await companySettingsService.getDocumentOcrStatus(typeAtTrigger);
          if (status.ocrStatus === 'COMPLETED' || status.ocrStatus === 'FAILED') {
            docOcrPollActiveRef.current = false;
            invalidateApiCache('/company-settings/document-templates');
            setDocumentTemplates(prev => prev.map(t =>
              t.type === typeAtTrigger
                ? { ...t, ocrText: status.ocrText, ocrStatus: status.ocrStatus, ocrProcessedAt: status.ocrProcessedAt }
                : t
            ));
            if (status.ocrStatus === 'COMPLETED' && status.ocrText) {
              setPageMsg('OCR completed! Text extracted from uploaded file.');
            } else if (status.ocrStatus === 'FAILED') {
              setPageMsg('OCR failed. The uploaded file may contain no readable text.');
            }
          } else {
            setTimeout(poll, INTERVAL_MS);
          }
        } catch {
          setTimeout(poll, INTERVAL_MS);
        }
      };

      setTimeout(poll, 3000);
    } catch (err) {
      docOcrPollActiveRef.current = false;
      setDocumentTemplates(prev => prev.map(t =>
        t.type === selectedDocType
          ? { ...t, ocrStatus: null }
          : t
      ));
      setPageMsg(err instanceof Error ? err.message : 'Failed to trigger OCR');
    }
  }, [selectedDocType]);

  const handleSaveDocumentOcrText = useCallback(async (text: string) => {
    if (!selectedDocType) return;
    try {
      await companySettingsService.saveDocumentOcrText(selectedDocType, text);
      setDocumentTemplates(prev => prev.map(t =>
        t.type === selectedDocType ? { ...t, ocrText: text } : t
      ));
      setPageMsg('OCR text saved.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save OCR text');
    }
  }, [selectedDocType]);

  const handleUploadDocumentFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDocType) return;
    setDocFileUploading(true);
    setPageMsg(null);
    try {
      const result = await companySettingsService.uploadDocumentTemplateFile(selectedDocType, file);
      // Update local state — handle BOTH cases:
      // 1) Template already exists in array: update it with file info
      // 2) Template NOT in array (e.g. DB has no seeded NDA/MNDA yet): add a new entry
      setDocumentTemplates(prev => {
        const idx = prev.findIndex(t => t.type === selectedDocType);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            fileUrl: result.fileUrl,
            fileName: result.fileName,
            fileType: result.fileType,
          };
          return updated;
        }
        // Template not in array — create a minimal entry so selectedDocTemplate exists
        return [...prev, {
          id: '',
          companyCode: '',
          type: selectedDocType,
          name: DOC_TEMPLATE_LABELS[selectedDocType] || selectedDocType,
          content: '',
          fileUrl: result.fileUrl,
          fileName: result.fileName,
          fileType: result.fileType,
          isActive: true,
          version: 0,
          createdAt: '',
          updatedAt: '',
        } as DocumentTemplate];
      });
      setPageMsg('File uploaded successfully!');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDocFileUploading(false);
      // Reset the input
      e.target.value = '';
    }
  }, [selectedDocType]);

  const handleRemoveDocumentFile = useCallback(async () => {
    if (!selectedDocType) return;
    setDocFileUploading(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.saveDocumentTemplate(selectedDocType, {
        name: editedDocName.trim(),
        content: editedDocContent,
        isActive: true,
        fileUrl: null,
        fileName: null,
        fileType: null,
      });
      setDocumentTemplates(prev => prev.map(t =>
        t.type === selectedDocType
          ? { ...t, fileUrl: null, fileName: null, fileType: null }
          : t
      ));
      setPageMsg('Document file removed.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to remove file');
    } finally {
      setDocFileUploading(false);
    }
  }, [selectedDocType, editedDocName, editedDocContent]);

  const anyModalOpen = !!(showDeptModal || showCatModal || showUnitModal || showPositionModal || showPaymentTermModal || deleteTarget || cropFile);
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
          await companySettingsService.createRequiredDocument(doc.name.trim(), doc.documentCategory || 'mandatory', undefined, undefined, doc.fieldType || 'attachment');
        } else {
          // Existing doc - update name, isRequired, and fieldType
          const original = requiredDocuments.find(d => d.id === doc.id);
          if (original && (original.name !== doc.name.trim() || (original.documentCategory || 'mandatory') !== (doc.documentCategory || 'mandatory') || (original.fieldType || 'attachment') !== (doc.fieldType || 'attachment'))) {
            await companySettingsService.updateRequiredDocument(doc.id, {
              name: doc.name.trim(),
              documentCategory: doc.documentCategory || 'mandatory',
              fieldType: doc.fieldType || 'attachment',
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
    'email-templates': undefined,
  'documents': undefined,
  'contracts': undefined,
};

  // ── Department CRUD ──

  const openAddDept = useCallback(() => {
    setEditingDept(null);
    setDeptName('');
    setDeptDesc('');
    setShowDeptModal(true);
  }, []);

  const openEditDept = useCallback((dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptDesc(dept.description || '');
    setShowDeptModal(true);
  }, []);

  const handleSaveDept = useCallback(async () => {
    if (!deptName.trim()) return;
    setActionLoading(true);
    setPageMsg(null);
    try {
      if (editingDept) {
        await companySettingsService.updateDepartment(editingDept.id, {
          name: deptName.trim(),
          description: deptDesc.trim() || undefined,
        });
        setPageMsg(`Department "${deptName.trim()}" updated.`);
      } else {
        await companySettingsService.createDepartment(deptName.trim(), deptDesc.trim() || undefined);
        setPageMsg(`Department "${deptName.trim()}" created.`);
      }
      setShowDeptModal(false);
      reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save department');
    } finally {
      setActionLoading(false);
    }
  }, [editingDept, deptName, deptDesc, reload]);

  // ── Category CRUD ──

  const openAddCat = useCallback((deptId?: number) => {
    setEditingCat(null);
    setCatDeptId(deptId || (departments[0]?.id || 0));
    setCatName('');
    setCatDesc('');
    setShowCatModal(true);
  }, [departments]);

  const openEditCat = useCallback((cat: Category) => {
    setEditingCat(cat);
    setCatDeptId(cat.departmentId);
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setShowCatModal(true);
  }, []);

  const handleSaveCat = useCallback(async () => {
    if (!catName.trim() || !catDeptId) return;
    setActionLoading(true);
    setPageMsg(null);
    try {
      if (editingCat) {
        await companySettingsService.updateCategory(editingCat.id, {
          departmentId: catDeptId,
          name: catName.trim(),
          description: catDesc.trim() || undefined,
        });
        setPageMsg(`Category "${catName.trim()}" updated.`);
      } else {
        await companySettingsService.createCategory(catDeptId, catName.trim(), catDesc.trim() || undefined);
        setPageMsg(`Category "${catName.trim()}" created.`);
      }
      setShowCatModal(false);
      reload();
      reloadCategories();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setActionLoading(false);
    }
  }, [editingCat, catDeptId, catName, catDesc, reload, reloadCategories]);

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
    setShowPaymentTermModal(true);
  }, []);

  const handleSavePaymentTerm = useCallback(async () => {
    if (!paymentTermName.trim()) return;
    setActionLoading(true);
    setPageMsg(null);
    try {
      await companySettingsService.createPaymentTerm(paymentTermName.trim());
      setPageMsg(`Payment term "${paymentTermName.trim()}" created.`);
      setShowPaymentTermModal(false);
      reloadPaymentTerms();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save payment term');
    } finally {
      setActionLoading(false);
    }
  }, [paymentTermName, reloadPaymentTerms]);

  const requestDeletePaymentTerm = useCallback((term: PaymentTerm) => {
    setDeleteTarget({ type: 'paymentTerm', id: term.id, name: term.name });
  }, []);

  // ── Position handlers ──

  const openAddPosition = useCallback(() => {
    setPositionName('');
    setPositionDesc('');
    setShowPositionModal(true);
  }, []);

  const handleSavePosition = useCallback(async () => {
    if (!positionName.trim()) return;
    setActionLoading(true);
    setPageMsg(null);
    try {
      await companySettingsService.createPosition(positionName.trim(), positionDesc.trim() || undefined);
      setPageMsg(`Position "${positionName.trim()}" created.`);
      setShowPositionModal(false);
      reloadPositions();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save position');
    } finally {
      setActionLoading(false);
    }
  }, [positionName, positionDesc, reloadPositions]);

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
    if (!unitName.trim()) return;
    setActionLoading(true);
    setUnitError(null);
    try {
      await companySettingsService.createUnit(unitName.trim(), unitAliases.trim() || undefined);
      setPageMsg(`Unit "${unitName.trim()}" created.`);
      setShowUnitModal(false);
      reloadUnits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save unit';
      // Check if it's a 409 conflict - show in modal, don't close
      if (msg.toLowerCase().includes('already exists')) {
        setUnitError(msg);
      } else {
        setPageMsg(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [unitName, unitAliases, reloadUnits]);

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
        <MessageStrip type={inferMessageType(pageMsg)} onClose={() => setPageMsg(null)} autoHideMs={5000}>
          {pageMsg}
        </MessageStrip>
      )}
      {loading && <div className="company-settings-page__loading">Loading…</div>}

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
                <h2><FileText size={17} /> Forms</h2>
                <p>Select a form below to configure its documents and mandatory information fields.</p>
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
                <>
                  <div className="cs-mandatory-defaults" style={{ marginBottom: 24 }}>
                    <div className="cs-mandatory-custom-header">
                      <h3>Documents</h3>
                      <button
                        className="company-settings__btn company-settings__btn--primary"
                        onClick={() => addDocInline('mandatory')}
                      >
                        <Plus size={14} /> Add Document
                      </button>
                    </div>
                    <p className="cs-field-hint" style={{ marginBottom: 12 }}>
                      Configure document types for the vendor onboarding form. Each document can be marked as Mandatory, Optional, or Any Other via its category dropdown.
                    </p>
                    {editableDocs.length === 0 ? (
                      <div className="cs-mandatory-custom-empty">
                        <FileText size={20} />
                        <p>No documents configured. Click "Add Document" to add one.</p>
                      </div>
                    ) : (
                      <div className="cs-mandatory-custom-list">
                        {editableDocs.map((doc, idx) => (
                          <div key={doc.id} className="cs-mandatory-custom-item">
                            <div className="cs-mandatory-item-label">Document {idx + 1}</div>
                            <div className="company-settings__field" style={{ flex: 0.7 }}>
                              <input
                                value={doc.name}
                                onChange={(e) => updateDocInline(doc.id, e.target.value)}
                                placeholder="e.g. GST Registration Certificate"
                              />
                            </div>
                            <select
                              className="cs-doc-field-type"
                              value={doc.fieldType || 'attachment'}
                              onChange={(e) => updateDocFieldType(doc.id, e.target.value)}
                              style={{ width: 140 }}
                            >
                              {DOC_FIELD_TYPES.map(ft => (
                                <option key={ft} value={ft}>{ft.charAt(0).toUpperCase() + ft.slice(1)}</option>
                              ))}
                            </select>
                            <select
                              className="cs-doc-category-select"
                              value={doc.documentCategory || 'mandatory'}
                              onChange={(e) => {
                                setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, documentCategory: e.target.value as 'mandatory' | 'optional' } : d));
                                setDocsDirty(true);
                              }}
                            >
                              <option value="mandatory">Mandatory</option>
                              <option value="optional">Optional</option>
                            </select>
                            <button
                              className="company-settings__icon-btn company-settings__icon-btn--danger"
                              onClick={() => removeDocInline(doc.id)}
                              title="Remove document"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

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
                      </button>                    </div>

                  )}
                </>

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
            <div className="cs-section-body cs-email-templates">
              {emailTemplatesLoading ? (
                <div className="cs-empty">
                  <p>Loading email templates...</p>
                </div>
              ) : emailTemplates.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><Mail size={28} /></div>
                  <p>No email templates configured. They will use system defaults.</p>
                </div>
              ) : (
                <>
                  {/* Sidebar - template selector */}
                  <div className="cs-email-templates__sidebar">
                    {EMAIL_TEMPLATE_KEYS.map((key) => {
                      const saved = emailTemplates.find((t) => t.templateKey === key);
                      const isCustom = !!saved && saved.bodyHtml !== '' && saved.bodyHtml !== undefined;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`cs-email-templates__sidebar-btn ${selectedTemplateKey === key ? 'cs-email-templates__sidebar-btn--active' : ''}`}
                          onClick={() => handleSelectTemplate(key)}
                        >
                          <span className={`cs-email-sidebar-dot ${isCustom ? 'cs-email-sidebar-dot--custom' : 'cs-email-sidebar-dot--default'}`} />
                          {EMAIL_TEMPLATE_LABELS[key] || key}
                        </button>
                      );
                    })}
                  </div>

                  {/* Editor */}
                  <div className="cs-email-templates__editor">
                    {selectedTemplate ? (
                      <>
                        <div className="cs-email-templates__editor-header">
                          <div>
                            <h3 className="cs-email-templates__editor-title">
                              {EMAIL_TEMPLATE_LABELS[selectedTemplate.templateKey] || selectedTemplate.templateKey}
                            </h3>
                            <span className={templateDirty ? 'cs-email-badge cs-email-badge--custom' : 'cs-email-badge cs-email-badge--default'}>
                              {templateDirty ? 'Unsaved changes' : isDefaultTemplate ? 'Using default' : 'Customized'}
                            </span>
                          </div>
                          <div className="cs-email-templates__editor-actions">
                            <button
                              type="button"
                              className="cs-email-templates__editor-reset"
                              onClick={handleResetTemplate}
                              disabled={savingTemplate || (!isDefaultTemplate && !templateDirty)}
                            >
                              <RotateCcw size={14} /> Reset
                            </button>
                            <button
                              type="button"
                              className="cs-email-templates__editor-save"
                              onClick={handleSaveTemplate}
                              disabled={savingTemplate || !templateDirty}
                            >
                              <Save size={15} /> {savingTemplate ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>

                        <RichTextEditor
                          value={editedBodyHtml}
                          onChange={handleBodyChange}
                          placeholder="Write the email content here..."
                        />

                        {/* Placeholders Info */}
                        <div className="cs-email-placeholders">
                          <div className="cs-email-placeholders__title">Available Placeholders</div>
                          <div className="cs-email-placeholders__list">
                            {Object.entries(EMAIL_PLACEHOLDERS).map(([code, desc]) => (
                              <span key={code} className="cs-email-placeholders__item">
                                <code className="cs-email-placeholders__code">{code}</code>
                                {' - '}{desc}
                              </span>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="cs-email-templates__placeholder">
                        <Mail size={40} className="cs-email-templates__placeholder-icon" />
                        <div className="cs-email-templates__placeholder-title">Select a template</div>
                        <div className="cs-email-templates__placeholder-text">
                          Choose an email template from the list above to customize its content.
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
            )}

      {/* ------------------------------------------------------- */}
          {/* -------------------------------------------------------
          TAB: Contracts - Contract Templates
          ------------------------------------------------------- */}
      {activeTab === 'contracts' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><FileText size={17} /> Contract Templates</h2>
                <p>Manage contract templates used when generating vendor contracts after RFQ final approval. Templates are selected by the final approver - not created per contract.</p>
              </div>
            </div>
            <div className="cs-section-body cs-doc-templates">
              {contractTemplatesLoading ? (
                <div className="cs-empty">
                  <p>Loading contract templates...</p>
                </div>
              ) : (
                <>
                  {/* Sidebar - template type selector */}
                  <div className="cs-doc-templates__sidebar">
                    {contractTemplates.map((t) => (
                      <div
                        key={t.type}
                        className={'cs-doc-templates__sidebar-item ' + (selectedContractType === t.type ? 'cs-doc-templates__sidebar-item--active' : '')}
                      >
                        {renamingContractType === t.type ? (
                          <div className="cs-doc-rename-form">
                            <input
                              type="text"
                              value={renamingContractTypeName}
                              onChange={(e) => setRenamingContractTypeName(e.target.value)}
                              className="cs-doc-rename-input"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameContractType(t.type, renamingContractTypeName);
                                if (e.key === 'Escape') setRenamingContractType(null);
                              }}
                            />
                            <div className="cs-doc-rename-actions">
                              <button
                                type="button"
                                className="company-settings__btn company-settings__btn--primary"
                                onClick={() => handleRenameContractType(t.type, renamingContractTypeName)}
                                disabled={!renamingContractTypeName.trim() || savingContractTemplate}
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="company-settings__btn company-settings__btn--secondary"
                                onClick={() => setRenamingContractType(null)}
                                style={{ padding: '4px 8px', fontSize: 11 }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={'cs-doc-templates__sidebar-btn ' + (selectedContractType === t.type ? 'cs-doc-templates__sidebar-btn--active' : '')}
                              onClick={() => handleSelectContractType(t.type)}
                            >
                              <span className={'cs-doc-sidebar-dot ' + (t.version > 1 ? 'cs-doc-sidebar-dot--custom' : 'cs-doc-sidebar-dot--default')} />
                              <span className="cs-doc-sidebar-name">{t.name}</span>
                            </button>
                            <div className="cs-doc-sidebar-item-actions">
                              <button
                                type="button"
                                className="company-settings__icon-btn"
                                onClick={(e) => { e.stopPropagation(); setRenamingContractType(t.type); setRenamingContractTypeName(t.name); }}
                                title="Rename"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                type="button"
                                className="company-settings__icon-btn company-settings__icon-btn--danger"
                                onClick={(e) => { e.stopPropagation(); handleDeleteContractType(t.type); }}
                                title="Delete contract type"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {editingNewContractType ? (
                      <div className="cs-doc-new-type-form">
                        <input
                          type="text"
                          value={newContractTypeName}
                          onChange={(e) => setNewContractTypeName(e.target.value)}
                          placeholder="e.g. Lease Contract"
                          className="cs-doc-new-type-input"
                          autoFocus
                        />
                        <div className="cs-doc-new-type-actions">
                          <button
                            type="button"
                            className="company-settings__btn company-settings__btn--primary"
                            onClick={handleCreateNewContractType}
                            disabled={!newContractTypeName.trim() || savingContractTemplate}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                          >
                            <Plus size={12} /> {savingContractTemplate ? 'Adding...' : 'Add'}
                          </button>
                          <button
                            type="button"
                            className="company-settings__btn company-settings__btn--secondary"
                            onClick={() => { setEditingNewContractType(false); setNewContractTypeName(''); }}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="cs-doc-templates__sidebar-btn cs-doc-templates__sidebar-btn--add"
                        onClick={() => setEditingNewContractType(true)}
                      >
                        <Plus size={14} /> New Type
                      </button>
                    )}
                  </div>

                  {/* Editor */}
                  <div className="cs-doc-templates__main">
                    {/* Editor */}
                    <div className="cs-doc-templates__editor">
                    {selectedContractType ? (
                      <>
                        <div className="cs-doc-templates__editor-header">
                          <div className="cs-doc-templates__editor-title-row">
                            <div className="company-settings__field cs-doc-templates__name-field">
                              <input
                                value={editedContractName}
                                onChange={(e) => handleContractNameChange(e.target.value)}
                                placeholder="Template Name"
                                className="cs-doc-templates__name-input"
                              />
                            </div>
                            <label className="cs-doc-templates__active-toggle">
                              <input
                                type="checkbox"
                                checked={editedContractIsActive}
                                onChange={(e) => { setEditedContractIsActive(e.target.checked); setContractTemplateDirty(true); }}
                              />
                              {editedContractIsActive ? 'Active' : 'Inactive'}
                            </label>
                            <span className={contractTemplateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                              {contractTemplateDirty ? 'Unsaved changes' : contractTemplateIsDefault ? 'Default template' : 'Customized'}
                            </span>
                          </div>

                          <div className="cs-doc-templates__editor-actions">
                            <button
                              type="button"
                              className="cs-doc-templates__editor-reset"
                              onClick={() => setContractPreviewOpen(true)}
                              disabled={!editedContractContent}
                            >
                              <Eye size={14} /> Preview
                            </button>
                            <button
                              type="button"
                              className="cs-doc-templates__editor-reset"
                              onClick={handleResetContractTemplate}
                              disabled={savingContractTemplate || contractTemplateIsDefault}
                            >
                              <RotateCcw size={14} /> Reset
                            </button>
                            <button
                              type="button"
                              className="cs-doc-templates__editor-save"
                              onClick={handleSaveContractTemplate}
                              disabled={savingContractTemplate || !contractTemplateDirty}
                            >
                              <Save size={15} /> {savingContractTemplate ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>

                        {/* Template Content Editor */}
                        <div className="cs-doc-templates__editor-body">
                          <RichTextEditor
                            value={editedContractContent}
                            onChange={handleContractContentChange}
                            placeholder="Write the contract template content here... Use HTML with placeholders like {{contractNumber}}, {{vendorName}}, {{awardValue}}, etc."
                          />
                        </div>

                        {/* ── Upload Contract Document ── */}
                        <div className="cs-contract-upload">
                          <div className="cs-contract-upload__row">
                            <FileText size={18} className="cs-contract-upload__icon" />
                            <div className="cs-contract-upload__info">
                              <div className="cs-contract-upload__label">Contract Document (PDF/DOC)</div>
                              <div className="cs-contract-upload__desc">
                                Upload a pre-signed contract document instead of using the HTML editor above.
                                When generating a contract, the uploaded file will be used.
                              </div>
                            </div>
                            {selectedContractTemplate?.fileUrl ? (
                              <div className="cs-contract-upload__file">
                                <FileText size={14} className="cs-contract-upload__file-icon" />
                                <span className="cs-contract-upload__file-name">
                                  {selectedContractTemplate.fileName || 'Uploaded document'}
                                </span>
                                <a
                                  href={selectedContractTemplate.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cs-contract-upload__view-link"
                                >
                                  View
                                </a>
                                <button
                                  type="button"
                                  className="cs-contract-upload__remove-btn"
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
                                  title="Remove uploaded document"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ) : (
                              <label className="cs-contract-upload__btn">
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
                                      setPageMsg(`Document "${file.name}" uploaded and attached to template.`);
                                    } catch (err) {
                                      setPageMsg(err instanceof Error ? err.message : 'Upload failed');
                                    } finally {
                                      setContractFileUploading(false);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                                {contractFileUploading ? (
                                  <><Loader2 size={14} className="cs-spin" /> Uploading…</>
                                ) : (
                                  <><Upload size={14} /> Choose File</>
                                )}
                              </label>
                            )}
                          </div>
                        </div>
                        

                        {/* OCR Preview */}                        {selectedContractTemplate && (
                          <OcrPreview
                            ocrText={selectedContractTemplate.ocrText}                            ocrStatus={selectedContractTemplate.ocrStatus as any}                            ocrProcessedAt={selectedContractTemplate.ocrProcessedAt}                            onTriggerOcr={handleTriggerContractOcr}                            onSaveOcrText={handleSaveContractOcrText}                            hasFile={!!selectedContractTemplate.fileUrl}                          />
                        )}{/* Placeholders Info */}
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

                        {/* Preview Note */}
                        <div className="cs-doc-preview-note">
                          <FileText size={14} />
                          <span>When a contract is generated after RFQ finalization, the template content is rendered with the RFQ, supplier, and commercial details filled in. Each generated contract saves an immutable content snapshot - editing this template later will not modify already-generated contracts.</span>
                        </div>
                      </>
                    ) : (
                      <div className="cs-doc-templates__placeholder">
                        <FileText size={40} className="cs-doc-templates__placeholder-icon" />
                        <div className="cs-doc-templates__placeholder-title">Select a contract type</div>
                        <div className="cs-doc-templates__placeholder-text">
                          Choose a contract type from the sidebar to edit its template content. Supported types: Purchase Contract, Service Contract, AMC, and Binding Contract.
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="cs-doc-templates__signature">
                    <SignatureSection />
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
        </div>


      )}




      {/* -------------------------------------------------------
          TAB: Documents - NDA/MNDA Templates
          ------------------------------------------------------- */}
      {activeTab === 'documents' && <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><FileSignature size={17} /> Document Templates</h2>
                <p>Manage NDA (Non-Disclosure Agreement) and MNDA (Mutual Non-Disclosure Agreement) templates used during vendor onboarding. Use placeholders to dynamically insert company and vendor details.</p>
              </div>
            </div>
            <div className="cs-section-body cs-doc-templates">
              {docTemplatesLoading ? (
                <div className="cs-empty">
                  <p>Loading document templates...</p>
                </div>
              ) : (
                <>
                  {/* Sidebar - template type selector */}
                  <div className="cs-doc-templates__sidebar">
                    {DOC_TEMPLATE_TYPES.map((type) => {
                      const saved = documentTemplates.find((t) => t.type === type);
                      const isCustom = !!saved && saved.version > 1;
                      return (
                        <button
                          key={type}
                          type="button"
                          className={'cs-doc-templates__sidebar-btn ' + (selectedDocType === type ? 'cs-doc-templates__sidebar-btn--active' : '')}
                          onClick={() => handleSelectDocType(type)}
                        >
                          <span className={'cs-doc-sidebar-dot ' + (isCustom ? 'cs-doc-sidebar-dot--custom' : 'cs-doc-sidebar-dot--default')} />
                          {DOC_TEMPLATE_LABELS[type]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="cs-doc-templates__main">
                    {/* Editor */}
                    <div className="cs-doc-templates__editor">
                    {selectedDocType ? (
                      <ErrorBoundary>
                        <div className="cs-doc-templates__editor-header">
                          <div className="cs-doc-templates__editor-title-row">
                            <div className="company-settings__field cs-doc-templates__name-field">
                              <input
                                value={editedDocName || ''}
                                onChange={(e) => handleDocNameChange(e.target.value)}
                                placeholder="Template Name"
                                className="cs-doc-templates__name-input"
                              />
                            </div>
                            <span className={docTemplateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                              {docTemplateDirty ? 'Unsaved changes' : docTemplateIsDefault ? 'Default template' : 'Customized'}
                            </span>
                          </div>
                          <div className="cs-doc-templates__editor-actions">
                            <button
                              type="button"
                              className="cs-doc-templates__editor-reset"
                              onClick={handleResetDocTemplate}
                              disabled={savingDocTemplate}
                            >
                              <RotateCcw size={14} /> Reset
                            </button>
                            <button
                              type="button"
                              className="cs-doc-templates__editor-save"
                              onClick={handleSaveDocTemplate}
                              disabled={savingDocTemplate || !docTemplateDirty}
                            >
                              <Save size={15} /> {savingDocTemplate ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>

                        {/* ── Upload Area ── */}
                        <div className="cs-contract-upload">
                          <div className="cs-contract-upload__row">
                            <FileText size={18} className="cs-contract-upload__icon" />
                            <div className="cs-contract-upload__info">
                              <div className="cs-contract-upload__label">Upload Document File (PDF/DOC)</div>
                              <div className="cs-contract-upload__desc">
                                Upload a signed PDF/DOC/Image version of this document instead of using the HTML editor.
                              </div>
                            </div>
                            {selectedDocTemplate?.fileUrl ? (
                              <div className="cs-contract-upload__file">
                                <FileText size={14} className="cs-contract-upload__file-icon" />
                                <span className="cs-contract-upload__file-name">
                                  {selectedDocTemplate.fileName || 'Uploaded document'}
                                </span>
                                <a
                                  href={selectedDocTemplate.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cs-contract-upload__view-link"
                                >
                                  View
                                </a>
                                <button
                                  type="button"
                                  className="cs-contract-upload__remove-btn"
                                  onClick={handleRemoveDocumentFile}
                                  disabled={docFileUploading}
                                  title="Remove uploaded file"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ) : (
                              <label className="cs-contract-upload__btn">
                                <input
                                  type="file"
                                  accept={ALLOWED_CONTRACT_UPLOAD_EXTENSIONS}
                                  style={{ display: 'none' }}
                                  onChange={handleUploadDocumentFile}
                                />
                                {docFileUploading ? (
                                  <><Loader2 size={14} className="cs-spin" /> Uploading…</>
                                ) : (
                                  <><Upload size={14} /> Choose File</>
                                )}
                              </label>
                            )}
                          </div>
                        </div>

                        {/* ── OCR Preview ── */}
                        <OcrPreview
                          ocrText={selectedDocTemplate?.ocrText}
                          ocrStatus={selectedDocTemplate?.ocrStatus as any}
                          ocrProcessedAt={selectedDocTemplate?.ocrProcessedAt}
                          onTriggerOcr={handleTriggerDocumentOcr}
                          onSaveOcrText={handleSaveDocumentOcrText}
                          hasFile={!!selectedDocTemplate?.fileUrl}
                        />

                        {/* Template Content Editor */}
                        <div className="cs-doc-templates__editor-body">
                          <RichTextEditor
                            value={editedDocContent}
                            onChange={handleDocContentChange}
                            placeholder="Write the document template content here... Use placeholders like {{companyName}}, {{vendorName}}, {{currentDate}}, etc."
                          />
                        </div>

                        {/* Placeholders Info */}
                        <div className="cs-email-placeholders">
                          <div className="cs-email-placeholders__title">Available Placeholders</div>
                          <div className="cs-email-placeholders__list">
                            {Object.entries(DOC_TEMPLATE_PLACEHOLDERS).map(([code, desc]) => (
                              <span key={code} className="cs-email-placeholders__item">
                                <code className="cs-email-placeholders__code">{code}</code>
                                {' \u2014 '}{desc}
                              </span>
                            ))}
                          </div>
                        </div>
                      </ErrorBoundary>
                    ) : (
                      <div className="cs-doc-templates__placeholder">
                        <FileText size={40} className="cs-doc-templates__placeholder-icon" />
                        <div className="cs-doc-templates__placeholder-title">Select a document type</div>
                        <div className="cs-doc-templates__placeholder-text">
                          Choose NDA or MNDA from the sidebar to edit its template content.
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="cs-doc-templates__signature">
                    <SignatureSection />
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
      </div>
      }
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
      {(showDeptModal) && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowDeptModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Building2 size={18} /> {editingDept ? 'Edit Department' : 'Add Department'}</span>
              <button className="company-settings__icon-btn" onClick={() => setShowDeptModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <div className="company-settings__field">
                <label>Department Name <span>*</span></label>
                <input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="e.g. R&D" />
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
                <div className="cs-unit-modal-error">
                  {unitError}
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
              <div className="company-settings__field">
                <label>Position Name <span>*</span></label>
                <input value={positionName} onChange={(e) => setPositionName(e.target.value)} placeholder="e.g. Purchase Clerk" />
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
              <div className="company-settings__field">
                <label>Payment Term Name <span>*</span></label>
                <input value={paymentTermName} onChange={(e) => setPaymentTermName(e.target.value)} placeholder="e.g. Net 30, Net 45, Advance" />
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
              <div className="company-settings__field">
                <label>Department <span>*</span></label>
                <select value={catDeptId} onChange={(e) => setCatDeptId(Number(e.target.value))}>
                  <option value={0}>Select department</option>
                  {departments.filter((d) => d.isActive).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="company-settings__field">
                <label>Category Name <span>*</span></label>
                <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Precision Tools" />
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
