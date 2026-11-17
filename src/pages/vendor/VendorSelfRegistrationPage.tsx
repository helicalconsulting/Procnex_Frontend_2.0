import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Mail,
  Users,
  Tag,
  Globe,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowRight,
  Send,
  UploadCloud,
  FileCheck2,
  Trash2,
  File,
  Sun,
  Moon,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { motionTransition } from '../../lib/motion';
import { useTheme } from '../../context/ThemeContext';
import { useBranding, applyTitle, applyFavicon } from '../../context/BrandingContext';
import { getTenantCompanyCode, getVendorPath } from '../../utils/tenantResolver';
import { getActiveCompanyCode, readCachedProfile } from '../../lib/branding';
import PhoneInput from '../../components/shared/PhoneInput';
import { companySettingsService, type Category, type CompanyProfile } from '../../services/companySettingsService';
import {
  procurementService,
  type SelfRegisteredVendorRecord,
  type UploadedRegistrationDoc,
} from '../../services/procurementService';
import { scanDocumentWithOcr } from '../../services/ocrService';
import { Card } from '../../components/ui/card';
import { Input, Select, Textarea } from '../../components/ui/input';
import { Button, buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { API_BASE } from '../../api/client';

interface UploadedFileItem {
  type: 'trade_license' | 'vat_certificate' | 'emirates_id';
  label: string;
  file: File | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  dataUrl?: string;
  issueDate?: string;
  expiryDate?: string;
  issuedAuthority?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function VendorSelfRegistrationPage() {
  const { isDark, toggleTheme } = useTheme();
  const { companyCode: routeCompanyCode } = useParams<{ companyCode?: string }>();
  const [searchParams] = useSearchParams();
  const branding = useBranding();

  // Resolve active company code from all available tenant signals
  const resolvedCompanyCode = (
    routeCompanyCode?.toUpperCase() ||
    searchParams.get('company')?.toUpperCase() ||
    searchParams.get('companyCode')?.toUpperCase() ||
    getTenantCompanyCode() ||
    getActiveCompanyCode() ||
    'HFL'
  ).trim().toUpperCase();

  const [activeCompany, setActiveCompany] = useState<string>(resolvedCompanyCode);
  const [tenantProfile, setTenantProfile] = useState<CompanyProfile | null>(() => readCachedProfile(resolvedCompanyCode));

  useEffect(() => {
    let mounted = true;
    const code = resolvedCompanyCode;
    setActiveCompany(code);

    const fetchProfile = async () => {
      try {
        const prof = await companySettingsService.getPublicCompanyProfile(code);
        if (mounted && prof) {
          setTenantProfile(prof);
          return;
        }
      } catch {
        try {
          const prof = await companySettingsService.getCompanyProfile();
          if (mounted && prof) {
            setTenantProfile(prof);
          }
        } catch {
          // ignore
        }
      }
    };

    void fetchProfile();

    const handleBrandingChange = (event: Event) => {
      const updated = (event as CustomEvent<CompanyProfile>).detail;
      if (updated && (!code || updated.companyCode?.toUpperCase() === code)) {
        setTenantProfile(updated);
      }
    };

    window.addEventListener('heliflow_branding_change', handleBrandingChange);
    return () => {
      mounted = false;
      window.removeEventListener('heliflow_branding_change', handleBrandingChange);
    };
  }, [resolvedCompanyCode]);

  // Dynamic company display name derived from configured company settings
  const rawCompanyName =
    tenantProfile?.companyName?.trim() ||
    (branding.companyName && branding.companyName !== 'Organization' && branding.companyName.trim()) ||
    '';

  const companyDisplayName =
    rawCompanyName ||
    (activeCompany === 'HFL' ? 'Helical Consulting' : activeCompany === 'ALZORAH' ? "'Al Zorah' Group" : `${activeCompany} Group`);

  const companyLogoUrl = tenantProfile?.logoUrl || branding.logoUrl || null;

  const supportEmail =
    tenantProfile?.supportEmail?.trim() ||
    tenantProfile?.companyEmail?.trim() ||
    branding.supportEmail?.trim() ||
    (activeCompany === 'HFL' ? 'admin@helical.consulting' : `procurement@${activeCompany.toLowerCase()}.com`);

  // Dynamically update document title & favicon
  useEffect(() => {
    applyTitle(`${companyDisplayName} — Vendor Registration`);
    if (tenantProfile?.faviconUrl || tenantProfile?.logoUrl) {
      applyFavicon(tenantProfile.faviconUrl, tenantProfile.logoUrl);
    }
  }, [companyDisplayName, tenantProfile]);

  // Form Fields
  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactCountryCode, setContactCountryCode] = useState('+971');
  const [contactPhone, setContactPhone] = useState('');
  const [category, setCategory] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierType, setSupplierType] = useState('');
  const [notes, setNotes] = useState('');

  // Uploaded Documents: Trade License, VAT Certificate, Emirates ID
  const [tradeLicense, setTradeLicense] = useState<UploadedFileItem>({
    type: 'trade_license',
    label: 'Trade License',
    file: null,
    fileName: '',
    fileSize: 0,
    mimeType: '',
    issueDate: '',
    expiryDate: '',
    issuedAuthority: '',
  });

  const [vatCertificate, setVatCertificate] = useState<UploadedFileItem>({
    type: 'vat_certificate',
    label: 'VAT Certificate',
    file: null,
    fileName: '',
    fileSize: 0,
    mimeType: '',
    issueDate: '',
    expiryDate: '',
    issuedAuthority: '',
  });

  const [emiratesId, setEmiratesId] = useState<UploadedFileItem>({
    type: 'emirates_id',
    label: 'Emirates ID',
    file: null,
    fileName: '',
    fileSize: 0,
    mimeType: '',
    issueDate: '',
    expiryDate: '',
    issuedAuthority: '',
  });

  const tradeLicenseRef = useRef<HTMLInputElement>(null);
  const vatCertificateRef = useRef<HTMLInputElement>(null);
  const emiratesIdRef = useRef<HTMLInputElement>(null);

  // OCR scanning and detection status per document
  const [scanningDocs, setScanningDocs] = useState<Record<string, boolean>>({});
  const [ocrMsg, setOcrMsg] = useState<Record<string, string>>({});

  // Dropdown data
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Validation & Submission State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [registeredRecord, setRegisteredRecord] = useState<SelfRegisteredVendorRecord | null>(null);

  // Email Availability Check State
  const [emailCheckLoading, setEmailCheckLoading] = useState(false);
  const [emailExistsWarning, setEmailExistsWarning] = useState<string | null>(null);
  const [emailAvailableSuccess, setEmailAvailableSuccess] = useState(false);

  // Load Categories on mount (dynamically fetched from Company Settings)
  useEffect(() => {
    let mounted = true;
    setCategoriesLoading(true);

    const loadCategories = async () => {
      try {
        const sClasses = await companySettingsService.listSupplierClasses(false);
        if (!mounted) return;
        const activeClasses = (sClasses || []).filter((c: any) => c.isActive !== false);
        if (activeClasses.length > 0) {
          setCategories(activeClasses.map((c: any) => ({ id: c.id, name: c.name })));
          return;
        }
      } catch {
        // fallback to categories
      }

      try {
        const cats = await companySettingsService.listCategories(undefined, activeCompany);
        if (!mounted) return;
        const activeCats = (cats || []).filter((c: Category) => c.isActive !== false);
        if (activeCats.length > 0) {
          setCategories(activeCats.map((c: Category) => ({ id: c.id, name: c.name })));
          return;
        }
      } catch (err) {
        console.warn('companySettingsService.listCategories failed, trying direct public endpoint:', err);
      }

      // Direct fallback to public API endpoint without any middleware hurdles
      try {
        const res = await fetch(`${API_BASE}/public/categories?companyCode=${encodeURIComponent(activeCompany)}`, {
          cache: 'no-store',
          headers: { 'X-Company-Code': activeCompany },
        });
        if (res.ok) {
          const json = await res.json();
          const apiCats = json.data?.categories || [];
          const active = apiCats.filter((c: any) => c.isActive !== false);
          if (mounted && active.length > 0) {
            setCategories(active.map((c: any) => ({ id: c.id, name: c.name })));
            return;
          }
        }
      } catch (directErr) {
        console.error('Direct categories fetch failed:', directErr);
      }
    };

    loadCategories().finally(() => {
      if (mounted) {
        setCategoriesLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [activeCompany]);

  // Email check helper
  const checkEmailAvailability = async (emailToCheck: string) => {
    const trimmed = emailToCheck.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      setEmailCheckLoading(false);
      setEmailExistsWarning(null);
      setEmailAvailableSuccess(false);
      return;
    }

    setEmailCheckLoading(true);
    try {
      const res = await procurementService.checkVendorEmail(trimmed, activeCompany);
      if (res.exists || !res.available) {
        const msg = res.message || 'A vendor with this email is already registered. Please sign in or use another email.';
        setEmailExistsWarning(msg);
        setEmailAvailableSuccess(false);
        setErrors((prev) => ({ ...prev, contactEmail: msg, form: msg }));
      } else {
        setEmailExistsWarning(null);
        setEmailAvailableSuccess(true);
        setErrors((prev) => {
          const next = { ...prev };
          if (next.contactEmail && next.contactEmail.toLowerCase().includes('already')) {
            delete next.contactEmail;
          }
          if (next.form && next.form.toLowerCase().includes('already')) {
            delete next.form;
          }
          return next;
        });
      }
    } catch (err: any) {
      const msg = err?.message || 'A vendor with this email already exists.';
      setEmailExistsWarning(msg);
      setEmailAvailableSuccess(false);
      setErrors((prev) => ({ ...prev, contactEmail: msg, form: msg }));
    } finally {
      setEmailCheckLoading(false);
    }
  };

  // Real-time debounced check as user types
  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmed = contactEmail.trim().toLowerCase();

    if (!trimmed) {
      setEmailCheckLoading(false);
      setEmailExistsWarning(null);
      setEmailAvailableSuccess(false);
      return;
    }

    if (!emailRegex.test(trimmed)) {
      setEmailCheckLoading(false);
      setEmailExistsWarning(null);
      setEmailAvailableSuccess(false);
      return;
    }

    const timer = setTimeout(() => {
      checkEmailAvailability(trimmed);
    }, 400);

    return () => clearTimeout(timer);
  }, [contactEmail, activeCompany]);

  const handleDocMetaChange = (
    docType: 'trade_license' | 'vat_certificate' | 'emirates_id',
    field: 'issueDate' | 'expiryDate' | 'issuedAuthority',
    value: string
  ) => {
    const updater = (prev: UploadedFileItem) => ({ ...prev, [field]: value });
    if (docType === 'trade_license') setTradeLicense(updater);
    else if (docType === 'vat_certificate') setVatCertificate(updater);
    else if (docType === 'emirates_id') setEmiratesId(updater);
  };

  const handleFileChange = (
    docType: 'trade_license' | 'vat_certificate' | 'emirates_id',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, [docType]: 'File size must be under 5MB' }));
      return;
    }

    const label =
      docType === 'trade_license'
        ? 'Trade License'
        : docType === 'vat_certificate'
        ? 'VAT Certificate'
        : 'Emirates ID';

    const currentDoc =
      docType === 'trade_license'
        ? tradeLicense
        : docType === 'vat_certificate'
        ? vatCertificate
        : emiratesId;

    // Synchronously set initial doc item so fileName is instantly available for validation
    const docItem: UploadedFileItem = {
      type: docType,
      label,
      file,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      dataUrl: '',
      issueDate: currentDoc.issueDate || '',
      expiryDate: currentDoc.expiryDate || '',
      issuedAuthority: currentDoc.issuedAuthority || '',
    };

    if (docType === 'trade_license') setTradeLicense(docItem);
    else if (docType === 'vat_certificate') setVatCertificate(docItem);
    else if (docType === 'emirates_id') setEmiratesId(docItem);

    setErrors((prev) => {
      const next = { ...prev };
      delete next[docType];
      if (next.form && !next.trade_license && !next.vat_certificate && !next.emirates_id) {
        delete next.form;
      }
      return next;
    });

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const fullItem: UploadedFileItem = {
        ...docItem,
        dataUrl,
      };
      if (docType === 'trade_license') {
        setTradeLicense((prev) => ({ ...prev, ...fullItem, issueDate: prev.issueDate || docItem.issueDate, expiryDate: prev.expiryDate || docItem.expiryDate, issuedAuthority: prev.issuedAuthority || docItem.issuedAuthority }));
      } else if (docType === 'vat_certificate') {
        setVatCertificate((prev) => ({ ...prev, ...fullItem, issueDate: prev.issueDate || docItem.issueDate, expiryDate: prev.expiryDate || docItem.expiryDate, issuedAuthority: prev.issuedAuthority || docItem.issuedAuthority }));
      } else if (docType === 'emirates_id') {
        setEmiratesId((prev) => ({ ...prev, ...fullItem, issueDate: prev.issueDate || docItem.issueDate, expiryDate: prev.expiryDate || docItem.expiryDate, issuedAuthority: prev.issuedAuthority || docItem.issuedAuthority }));
      }
    };
    reader.readAsDataURL(file);

    // Run client-side OCR (with server fallback for PDFs & complex documents)
    setScanningDocs((prev) => ({ ...prev, [docType]: true }));
    setOcrMsg((prev) => ({ ...prev, [docType]: '' }));

    scanDocumentWithOcr(file)
      .then((result) => {
        let detectedCount = 0;
        const updater = (prev: UploadedFileItem) => {
          const nextIssue = result.issueDate || prev.issueDate || '';
          const nextExpiry = result.expirationDate || prev.expiryDate || '';
          const nextAuth = result.issuingAuthority || prev.issuedAuthority || '';
          if (result.issueDate && !prev.issueDate) detectedCount++;
          if (result.expirationDate && !prev.expiryDate) detectedCount++;
          if (result.issuingAuthority && !prev.issuedAuthority) detectedCount++;
          return {
            ...prev,
            issueDate: nextIssue,
            expiryDate: nextExpiry,
            issuedAuthority: nextAuth,
          };
        };
        if (docType === 'trade_license') setTradeLicense(updater);
        else if (docType === 'vat_certificate') setVatCertificate(updater);
        else if (docType === 'emirates_id') setEmiratesId(updater);

        if (result.issueDate || result.expirationDate || result.issuingAuthority) {
          const fieldsFound: string[] = [];
          if (result.issueDate) fieldsFound.push('Issue Date');
          if (result.expirationDate) fieldsFound.push('Expiry Date');
          if (result.issuingAuthority) fieldsFound.push('Authority');
          setOcrMsg((prev) => ({
            ...prev,
            [docType]: `✨ Auto-detected ${fieldsFound.join(' & ')} from document. Please review.`,
          }));
          setTimeout(() => {
            setOcrMsg((prev) => ({ ...prev, [docType]: '' }));
          }, 8000);
        }
      })
      .catch((ocrErr) => {
        console.warn('Document OCR scan skipped or failed:', ocrErr);
      })
      .finally(() => {
        setScanningDocs((prev) => ({ ...prev, [docType]: false }));
      });
  };

  const handleFileRemove = (docType: 'trade_license' | 'vat_certificate' | 'emirates_id') => {
    setScanningDocs((prev) => ({ ...prev, [docType]: false }));
    setOcrMsg((prev) => ({ ...prev, [docType]: '' }));
    if (docType === 'trade_license') {
      setTradeLicense({ type: 'trade_license', label: 'Trade License', file: null, fileName: '', fileSize: 0, mimeType: '', issueDate: '', expiryDate: '', issuedAuthority: '' });
      if (tradeLicenseRef.current) tradeLicenseRef.current.value = '';
    } else if (docType === 'vat_certificate') {
      setVatCertificate({ type: 'vat_certificate', label: 'VAT Certificate', file: null, fileName: '', fileSize: 0, mimeType: '', issueDate: '', expiryDate: '', issuedAuthority: '' });
      if (vatCertificateRef.current) vatCertificateRef.current.value = '';
    } else if (docType === 'emirates_id') {
      setEmiratesId({ type: 'emirates_id', label: 'Emirates ID', file: null, fileName: '', fileSize: 0, mimeType: '', issueDate: '', expiryDate: '', issuedAuthority: '' });
      if (emiratesIdRef.current) emiratesIdRef.current.value = '';
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    // 1. Company Name (Mandatory)
    if (!companyName.trim()) {
      errs.companyName = 'Company name is required';
    }

    // 2. Vendor Email (Mandatory)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!contactEmail.trim()) {
      errs.contactEmail = 'Vendor email is required';
    } else if (!emailRegex.test(contactEmail.trim())) {
      errs.contactEmail = 'Please enter a valid email address';
    } else if (emailExistsWarning) {
      errs.contactEmail = emailExistsWarning;
    }

    // 3. Contact Person (Mandatory)
    if (!contactPerson.trim()) {
      errs.contactPerson = 'Contact person is required';
    }

    // 4. Phone Number (Mandatory)
    if (!contactPhone.trim()) {
      errs.contactPhone = 'Phone number is required';
    } else {
      const cleanDigits = contactPhone.replace(/\D/g, '');
      if (cleanDigits.length < 7 || cleanDigits.length > 15) {
        errs.contactPhone = 'Please enter a valid phone number (7 to 15 digits)';
      }
    }

    // 5. Vendor Category (Mandatory)
    if (!categoryId && !category.trim()) {
      errs.category = 'Vendor category is required';
    }

    // 6. Supplier Type (Mandatory)
    if (!supplierType.trim()) {
      errs.supplierType = 'Supplier type is required';
    }

    // 7. Notes / Business Address (Mandatory)
    if (!notes.trim()) {
      errs.notes = 'Business address is required';
    }

    // 8. Documents (Mandatory) - Trade License, VAT Certificate, Emirates ID
    if (!tradeLicense.fileName || !tradeLicense.fileName.trim()) {
      errs.trade_license = 'Trade License document is mandatory. Please upload a file.';
    }
    if (!vatCertificate.fileName || !vatCertificate.fileName.trim()) {
      errs.vat_certificate = 'VAT Certificate document is mandatory. Please upload a file.';
    }
    if (!emiratesId.fileName || !emiratesId.fileName.trim()) {
      errs.emirates_id = 'Emirates ID document is mandatory. Please upload a file.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = contactEmail.trim().toLowerCase();

    // 1. Guard against pre-flagged duplicate email
    if (emailExistsWarning) {
      setErrors((prev) => ({
        ...prev,
        contactEmail: emailExistsWarning,
        form: emailExistsWarning,
      }));
      return;
    }

    // 2. Validate mandatory form inputs and document uploads
    const isValid = validate();
    if (!isValid) {
      setErrors((prev) => ({
        ...prev,
        form: 'Please complete all required fields and upload all 3 mandatory documents (Trade License, VAT Certificate, Emirates ID).',
      }));
      const firstError = document.querySelector('.border-destructive');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // 3. Strict Document Existence Check
    if (!tradeLicense.fileName || !vatCertificate.fileName || !emiratesId.fileName) {
      setErrors((prev) => ({
        ...prev,
        trade_license: !tradeLicense.fileName ? 'Trade License document is mandatory' : prev.trade_license,
        vat_certificate: !vatCertificate.fileName ? 'VAT Certificate document is mandatory' : prev.vat_certificate,
        emirates_id: !emiratesId.fileName ? 'Emirates ID document is mandatory' : prev.emirates_id,
        form: 'Submission blocked: All 3 documents (Trade License, VAT Certificate, Emirates ID) are required.',
      }));
      return;
    }

    // 4. Pre-flight backend email verification directly before submission
    setSubmitting(true);
    try {
      const emailCheck = await procurementService.checkVendorEmail(cleanEmail, activeCompany);
      if (emailCheck.exists || !emailCheck.available) {
        const msg = emailCheck.message || 'A vendor with this email is already registered. Please sign in or use another email.';
        setEmailExistsWarning(msg);
        setEmailAvailableSuccess(false);
        setErrors((prev) => ({
          ...prev,
          contactEmail: msg,
          form: msg,
        }));
        setSubmitting(false);
        return;
      }
    } catch (checkErr: any) {
      const msg = checkErr?.message || 'Email verification failed. Unable to verify duplicate status.';
      setEmailExistsWarning(msg);
      setEmailAvailableSuccess(false);
      setErrors((prev) => ({
        ...prev,
        contactEmail: msg,
        form: msg,
      }));
      setSubmitting(false);
      return;
    }

    // 5. Submit Registration
    try {
      const documents: UploadedRegistrationDoc[] = [
        {
          type: 'trade_license',
          label: 'Trade License',
          fileName: tradeLicense.fileName,
          fileSize: tradeLicense.fileSize,
          mimeType: tradeLicense.mimeType,
          dataUrl: tradeLicense.dataUrl,
          issueDate: tradeLicense.issueDate?.trim() || undefined,
          expiryDate: tradeLicense.expiryDate?.trim() || undefined,
          issuedAuthority: tradeLicense.issuedAuthority?.trim() || undefined,
          uploadedAt: new Date().toISOString(),
        },
        {
          type: 'vat_certificate',
          label: 'VAT Certificate',
          fileName: vatCertificate.fileName,
          fileSize: vatCertificate.fileSize,
          mimeType: vatCertificate.mimeType,
          dataUrl: vatCertificate.dataUrl,
          issueDate: vatCertificate.issueDate?.trim() || undefined,
          expiryDate: vatCertificate.expiryDate?.trim() || undefined,
          issuedAuthority: vatCertificate.issuedAuthority?.trim() || undefined,
          uploadedAt: new Date().toISOString(),
        },
        {
          type: 'emirates_id',
          label: 'Emirates ID',
          fileName: emiratesId.fileName,
          fileSize: emiratesId.fileSize,
          mimeType: emiratesId.mimeType,
          dataUrl: emiratesId.dataUrl,
          issueDate: emiratesId.issueDate?.trim() || undefined,
          expiryDate: emiratesId.expiryDate?.trim() || undefined,
          issuedAuthority: emiratesId.issuedAuthority?.trim() || undefined,
          uploadedAt: new Date().toISOString(),
        },
      ];

      const record = await procurementService.registerVendor({
        companyName,
        contactEmail: cleanEmail,
        contactPerson,
        countryCode: contactCountryCode,
        phone: contactPhone,
        category,
        categoryId,
        supplierType,
        notes,
        companyCode: activeCompany,
        documents,
      });
      setRegisteredRecord(record);
    } catch (err: any) {
      const msg = err?.message || err?.error || 'An error occurred while submitting. Please try again.';
      const isAlreadyRegistered =
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already exists') ||
        msg.toLowerCase().includes('already submitted') ||
        msg.toLowerCase().includes('pending review') ||
        err?.code === 'VENDOR_ALREADY_EXISTS' ||
        err?.code === 'VENDOR_APPLICATION_PENDING' ||
        err?.code === 'USER_ALREADY_EXISTS' ||
        err?.status === 409;

      if (isAlreadyRegistered) {
        setEmailExistsWarning(msg);
        setEmailAvailableSuccess(false);
        setErrors({
          form: msg,
          contactEmail: msg,
        });
      } else {
        setErrors({ form: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCompanyName('');
    setContactEmail('');
    setContactPerson('');
    setContactPhone('');
    setCategory('');
    setCategoryId('');
    setSupplierType('');
    setNotes('');
    handleFileRemove('trade_license');
    handleFileRemove('vat_certificate');
    handleFileRemove('emirates_id');
    setErrors({});
    setEmailCheckLoading(false);
    setEmailExistsWarning(null);
    setEmailAvailableSuccess(false);
    setRegisteredRecord(null);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-foreground py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Light / Dark Mode Toggle & Vendor Login */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-30 flex items-center gap-2">
        <Link
          to={getVendorPath('/vendor/login')}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-border/80 bg-card/90 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/80 shadow-sm backdrop-blur-md transition-all"
        >
          Sign In
        </Link>
        <button
          type="button"
          onClick={(e) => toggleTheme(e)}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-border/80 bg-card/90 text-foreground shadow-md backdrop-blur-xl hover:bg-muted/80 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-xs font-semibold cursor-pointer"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={isDark ? 'sun' : 'moon'}
              className="grid place-items-center text-primary"
              initial={{ opacity: 0, rotate: -24, scale: 0.75 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 24, scale: 0.75 }}
              transition={motionTransition.fast}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </motion.span>
          </AnimatePresence>
          <span className="font-medium text-xs">
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>
      </div>

      <div className="max-w-3xl mx-auto space-y-6 pt-2">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          {companyLogoUrl && (
            <div className="flex justify-center mb-3">
              <img
                src={companyLogoUrl}
                alt={companyDisplayName}
                className="h-10 sm:h-12 max-h-14 w-auto object-contain rounded-md"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {companyDisplayName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
            Submit your supplier details and required legal documents below to register as an authorized vendor for {companyDisplayName}.
          </p>
        </div>

        {/* Success Confirmation & Informatory Email Card */}
        {registeredRecord ? (
          <Card className="p-6 sm:p-8 border-emerald-500/30 bg-card shadow-lg space-y-6 animate-in fade-in zoom-in-95 duration-300">
            {/* Confirmation Banner */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
              <div className="p-2 rounded-full bg-emerald-500 text-white shrink-0 shadow-sm">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="space-y-1 text-center sm:text-left">
                <h2 className="text-base sm:text-lg font-bold">
                  Thank you for registering, you will receive an email shortly from us
                </h2>
                <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                  Your vendor registration reference number is{' '}
                  <span className="font-mono font-bold bg-white/70 dark:bg-slate-900/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                    {registeredRecord.vendorNo}
                  </span>
                </p>
              </div>
            </div>

            {/* Informatory Email Simulation Card */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                <span>Confirmation Email Sent</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium normal-case">
                  <Send className="size-3" /> Sent to {registeredRecord.email}
                </span>
              </div>

              <div className="rounded-xl border border-border/80 bg-slate-50 dark:bg-slate-900/60 p-5 space-y-4 shadow-inner">
                {/* Email Header */}
                <div className="border-b border-border/70 pb-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">From:</span>
                    <span className="font-medium text-foreground">
                      {companyDisplayName} Procurement &lt;{supportEmail}&gt;
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">To:</span>
                    <span className="font-medium text-foreground">{registeredRecord.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subject:</span>
                    <span className="font-semibold text-foreground">
                      Vendor Registration Received — {companyDisplayName}
                    </span>
                  </div>
                </div>

                {/* Email Body */}
                <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed space-y-3">
                  <p className="font-medium">Dear {registeredRecord.contactPerson || registeredRecord.name},</p>
                  <p className="p-3.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 font-medium">
                    Thank you for your interest in becoming a vendor with {companyDisplayName}. You will be
                    notified after evaluation is completed by our team via email with login details.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    If you have any urgent queries regarding this application, please quote reference{' '}
                    <strong className="text-foreground">{registeredRecord.vendorNo}</strong> when contacting our procurement desk.
                  </p>
                </div>
              </div>
            </div>

            {/* Uploaded Documents Confirmation */}
            {registeredRecord.documents && registeredRecord.documents.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileCheck2 className="size-4 text-emerald-600" /> Uploaded Documents Acknowledged
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {registeredRecord.documents.map((d, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg border border-border/60 bg-muted/30 text-xs flex items-center gap-2"
                    >
                      <FileText className="size-4 text-primary shrink-0" />
                      <div className="min-w-0 flex-1 truncate">
                        <div className="font-semibold text-foreground truncate">{d.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{d.fileName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-border/60">
              <Button variant="outline" size="sm" onClick={handleReset} className="w-full sm:w-auto">
                Register Another Vendor
              </Button>
              <Link
                to={getVendorPath('/vendor/login')}
                className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full sm:w-auto gap-1.5')}
              >
                Go to Vendor Login
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Card>
        ) : (
          /* Self-Registration Form */
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {errors.form && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-5 shrink-0" />
                  <span className="font-medium">{errors.form}</span>
                </div>
                {errors.contactEmail && (
                  <Link
                    to="/vendor/login"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold shrink-0 transition-colors w-fit"
                  >
                    Go to Sign In
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            )}

            {/* 1. Supplier Details Section */}
            <Card className="p-5 sm:p-6 border-border/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 text-sm font-semibold text-foreground">
                <Building2 className="size-4 text-primary" />
                <span>Supplier Details</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Company Name */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="reg-company">
                    <span>
                      Company Name <span className="text-rose-500">*</span>
                    </span>
                  </label>
                  <div className="relative">
                    <Building2 className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      id="reg-company"
                      type="text"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        if (errors.companyName) setErrors((prev) => ({ ...prev, companyName: '' }));
                      }}
                      placeholder="e.g. Aztech Components Ltd"
                      required
                      className={`pl-9 ${errors.companyName ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                  </div>
                  {errors.companyName && (
                    <p className="text-xs text-destructive">{errors.companyName}</p>
                  )}
                </div>

                {/* Vendor Email */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="reg-email">
                    <span>
                      Vendor Email <span className="text-rose-500">*</span>
                    </span>
                    {emailCheckLoading && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground animate-pulse">
                        <Loader2 className="size-3 animate-spin" /> Checking availability…
                      </span>
                    )}
                    {!emailCheckLoading && emailAvailableSuccess && !errors.contactEmail && !emailExistsWarning && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" /> Email available
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Mail className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      id="reg-email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setContactEmail(val);
                        if (emailExistsWarning) setEmailExistsWarning(null);
                        if (emailAvailableSuccess) setEmailAvailableSuccess(false);
                        if (errors.contactEmail) setErrors((prev) => ({ ...prev, contactEmail: '' }));
                      }}
                      onBlur={() => checkEmailAvailability(contactEmail)}
                      placeholder="vendor@company.com"
                      required
                      className={`pl-9 pr-9 ${
                        emailExistsWarning || errors.contactEmail
                          ? 'border-destructive focus-visible:ring-destructive'
                          : emailAvailableSuccess
                          ? 'border-emerald-500/50 focus-visible:ring-emerald-500'
                          : ''
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      {emailCheckLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      {!emailCheckLoading && emailExistsWarning && <AlertCircle className="size-4 text-rose-500" />}
                      {!emailCheckLoading && emailAvailableSuccess && !errors.contactEmail && !emailExistsWarning && (
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </div>
                  </div>

                  {/* Immediate inline warning when email already exists */}
                  {emailExistsWarning ? (
                    <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2.5 animate-in fade-in duration-200">
                      <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                      <div className="flex-1 space-y-1.5">
                        <p className="font-semibold text-rose-700 dark:text-rose-300">
                          {emailExistsWarning}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          An account or vendor application with this email address already exists. Duplicate submissions are not permitted.
                        </p>
                        <div className="pt-0.5">
                          <Link
                            to="/vendor/login"
                            className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline"
                          >
                            Go to Vendor Portal Sign In
                            <ArrowRight className="size-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : errors.contactEmail ? (
                    <p className="text-xs text-destructive">{errors.contactEmail}</p>
                  ) : null}
                </div>

                {/* Contact Person */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="reg-contact">
                    <span>
                      Contact Person <span className="text-rose-500">*</span>
                    </span>
                  </label>
                  <div className="relative">
                    <Users className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      id="reg-contact"
                      type="text"
                      value={contactPerson}
                      onChange={(e) => {
                        setContactPerson(e.target.value);
                        if (errors.contactPerson) setErrors((prev) => ({ ...prev, contactPerson: '' }));
                      }}
                      placeholder="Full name"
                      required
                      className={`pl-9 ${errors.contactPerson ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                  </div>
                  {errors.contactPerson && (
                    <p className="text-xs text-destructive">{errors.contactPerson}</p>
                  )}
                </div>

                {/* Phone Number with Country Code */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="reg-phone">
                    <span>
                      Phone Number <span className="text-rose-500">*</span>
                    </span>
                  </label>
                  <PhoneInput
                    id="reg-phone"
                    countryCode={contactCountryCode}
                    onCountryCodeChange={setContactCountryCode}
                    value={contactPhone}
                    onChange={(val) => {
                      setContactPhone(val);
                      if (errors.contactPhone) setErrors((prev) => ({ ...prev, contactPhone: '' }));
                    }}
                    hasError={Boolean(errors.contactPhone)}
                    placeholder="Type your mobile number"
                  />
                  {errors.contactPhone && (
                    <p className="text-xs text-destructive">{errors.contactPhone}</p>
                  )}
                </div>
              </div>
            </Card>

            {/* 2. Supplier Information Section */}
            <Card className="p-5 sm:p-6 border-border/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 text-sm font-semibold text-foreground">
                <Tag className="size-4 text-primary" />
                <span>Supplier Information</span>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Vendor Category */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="reg-category">
                      <span>
                        Supplier Class <span className="text-rose-500">*</span>
                      </span>
                    </label>
                    <div className="relative">
                      <Tag className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Select
                        id="reg-category"
                        value={categoryId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCategoryId(val);
                          const found = categories.find((c) => c.id === val);
                          setCategory(found ? found.name : '');
                          if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
                        }}
                        className={`pl-9 cursor-pointer ${errors.category ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      >
                        <option value="">{categoriesLoading ? 'Loading classes...' : 'Select Supplier Class *'}</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {errors.category && (
                      <p className="text-xs text-destructive">{errors.category}</p>
                    )}
                  </div>

                  {/* Supplier Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="reg-supplier-type">
                      <span>
                        Supplier Type <span className="text-rose-500">*</span>
                      </span>
                    </label>
                    <div className="relative">
                      <Globe className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Select
                        id="reg-supplier-type"
                        value={supplierType}
                        onChange={(e) => {
                          setSupplierType(e.target.value);
                          if (errors.supplierType) setErrors((prev) => ({ ...prev, supplierType: '' }));
                        }}
                        className={`pl-9 cursor-pointer ${errors.supplierType ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      >
                        <option value="">Select Supplier Type *</option>
                        <option value="Domestic Supplier">Domestic Supplier</option>
                        <option value="Overseas Supplier">Overseas Supplier</option>
                        <option value="International Supplier">International Supplier</option>
                      </Select>
                    </div>
                    {errors.supplierType && (
                      <p className="text-xs text-destructive">{errors.supplierType}</p>
                    )}
                  </div>
                </div>

                {/* Notes / Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="reg-notes">
                    <span>
                      Notes / Business Address <span className="text-rose-500">*</span>
                    </span>
                  </label>
                  <Textarea
                    id="reg-notes"
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      if (errors.notes) setErrors((prev) => ({ ...prev, notes: '' }));
                    }}
                    rows={3}
                    placeholder="Provide your registered office address or summary of products/services..."
                    required
                    className={errors.notes ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {errors.notes && (
                    <p className="text-xs text-destructive">{errors.notes}</p>
                  )}
                </div>
              </div>
            </Card>

            {/* 3. Document Upload Section (Trade License, VAT Certificate, Emirates ID) */}
            <Card className="p-5 sm:p-6 border-border/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="size-4 text-primary" />
                  <span>Required Documents</span>
                </div>
                <span className="text-[11px] text-muted-foreground">PDF, JPG, or PNG (Max 5MB each)</span>
              </div>

              <div className="space-y-3.5">
                {/* 1. Trade License */}
                <div className={`p-4 sm:p-5 rounded-xl border border-dashed transition-colors ${
                  errors.trade_license
                    ? 'border-destructive/80 bg-destructive/5'
                    : 'border-border/80 bg-slate-50/50 dark:bg-slate-900/40'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-foreground">
                          Trade License <span className="text-rose-500">*</span>
                        </span>
                        {tradeLicense.fileName && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" /> Ready
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Valid Trade License or Commercial Registry
                      </p>
                    </div>

                    <input
                      ref={tradeLicenseRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => handleFileChange('trade_license', e)}
                    />

                    <div className="shrink-0">
                      {tradeLicense.fileName ? (
                        <div className="p-2 sm:px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-2.5">
                          <FileCheck2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div className="truncate max-w-[200px] sm:max-w-[280px]">
                            <p className="text-xs font-semibold text-foreground truncate">{tradeLicense.fileName}</p>
                            <p className="text-[10px] text-muted-foreground">{formatBytes(tradeLicense.fileSize)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFileRemove('trade_license')}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1"
                            title="Remove file"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto gap-1.5 text-xs border-dashed hover:border-primary hover:text-primary"
                          onClick={() => tradeLicenseRef.current?.click()}
                        >
                          <UploadCloud className="size-3.5" /> Upload Trade License
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* OCR Scanning indicator */}
                  {scanningDocs.trade_license && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-primary animate-pulse">
                      <Loader2 className="size-3.5 animate-spin shrink-0" />
                      <span>Scanning document with OCR to detect Date of Issue & Expiry...</span>
                    </div>
                  )}

                  {/* OCR Auto-detected success badge */}
                  {ocrMsg.trade_license && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                      <Sparkles className="size-3.5 shrink-0" />
                      <span>{ocrMsg.trade_license}</span>
                    </div>
                  )}

                  {/* Metadata fields in a 3-column horizontal row */}
                  {tradeLicense.fileName && (
                    <div className="mt-3.5 pt-3 border-t border-border/60">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Issue Date
                          </label>
                          <Input
                            type="date"
                            value={tradeLicense.issueDate || ''}
                            onChange={(e) => handleDocMetaChange('trade_license', 'issueDate', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Expiry Date
                          </label>
                          <Input
                            type="date"
                            value={tradeLicense.expiryDate || ''}
                            onChange={(e) => handleDocMetaChange('trade_license', 'expiryDate', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Issued Authority
                          </label>
                          <Input
                            type="text"
                            placeholder="e.g. DED / Economy Dept"
                            value={tradeLicense.issuedAuthority || ''}
                            onChange={(e) => handleDocMetaChange('trade_license', 'issuedAuthority', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                      </div>
                      {tradeLicense.issueDate && tradeLicense.expiryDate && tradeLicense.expiryDate <= tradeLicense.issueDate && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-2">
                          Warning: Expiry date should be after issue date.
                        </p>
                      )}
                    </div>
                  )}

                  {errors.trade_license && (
                    <p className="text-[11px] text-destructive flex items-center gap-1.5 font-medium animate-in fade-in mt-2">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {errors.trade_license}
                    </p>
                  )}
                </div>

                {/* 2. VAT Certificate */}
                <div className={`p-4 sm:p-5 rounded-xl border border-dashed transition-colors ${
                  errors.vat_certificate
                    ? 'border-destructive/80 bg-destructive/5'
                    : 'border-border/80 bg-slate-50/50 dark:bg-slate-900/40'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-foreground">
                          VAT Certificate <span className="text-rose-500">*</span>
                        </span>
                        {vatCertificate.fileName && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" /> Ready
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Tax Registration Number (TRN) / VAT Certificate
                      </p>
                    </div>

                    <input
                      ref={vatCertificateRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => handleFileChange('vat_certificate', e)}
                    />

                    <div className="shrink-0">
                      {vatCertificate.fileName ? (
                        <div className="p-2 sm:px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-2.5">
                          <FileCheck2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div className="truncate max-w-[200px] sm:max-w-[280px]">
                            <p className="text-xs font-semibold text-foreground truncate">{vatCertificate.fileName}</p>
                            <p className="text-[10px] text-muted-foreground">{formatBytes(vatCertificate.fileSize)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFileRemove('vat_certificate')}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1"
                            title="Remove file"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto gap-1.5 text-xs border-dashed hover:border-primary hover:text-primary"
                          onClick={() => vatCertificateRef.current?.click()}
                        >
                          <UploadCloud className="size-3.5" /> Upload VAT Certificate
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* OCR Scanning indicator */}
                  {scanningDocs.vat_certificate && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-primary animate-pulse">
                      <Loader2 className="size-3.5 animate-spin shrink-0" />
                      <span>Scanning document with OCR to detect Date of Issue & Expiry...</span>
                    </div>
                  )}

                  {/* OCR Auto-detected success badge */}
                  {ocrMsg.vat_certificate && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                      <Sparkles className="size-3.5 shrink-0" />
                      <span>{ocrMsg.vat_certificate}</span>
                    </div>
                  )}

                  {/* Metadata fields in a 3-column horizontal row */}
                  {vatCertificate.fileName && (
                    <div className="mt-3.5 pt-3 border-t border-border/60">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Issue Date
                          </label>
                          <Input
                            type="date"
                            value={vatCertificate.issueDate || ''}
                            onChange={(e) => handleDocMetaChange('vat_certificate', 'issueDate', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Expiry Date
                          </label>
                          <Input
                            type="date"
                            value={vatCertificate.expiryDate || ''}
                            onChange={(e) => handleDocMetaChange('vat_certificate', 'expiryDate', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Issued Authority
                          </label>
                          <Input
                            type="text"
                            placeholder="e.g. Federal Tax Authority (FTA)"
                            value={vatCertificate.issuedAuthority || ''}
                            onChange={(e) => handleDocMetaChange('vat_certificate', 'issuedAuthority', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                      </div>
                      {vatCertificate.issueDate && vatCertificate.expiryDate && vatCertificate.expiryDate <= vatCertificate.issueDate && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-2">
                          Warning: Expiry date should be after issue date.
                        </p>
                      )}
                    </div>
                  )}

                  {errors.vat_certificate && (
                    <p className="text-[11px] text-destructive flex items-center gap-1.5 font-medium animate-in fade-in mt-2">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {errors.vat_certificate}
                    </p>
                  )}
                </div>

                {/* 3. Emirates ID */}
                <div className={`p-4 sm:p-5 rounded-xl border border-dashed transition-colors ${
                  errors.emirates_id
                    ? 'border-destructive/80 bg-destructive/5'
                    : 'border-border/80 bg-slate-50/50 dark:bg-slate-900/40'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-foreground">
                          Emirates ID <span className="text-rose-500">*</span>
                        </span>
                        {emiratesId.fileName && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" /> Ready
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Emirates ID of authorized signatory or owner
                      </p>
                    </div>

                    <input
                      ref={emiratesIdRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => handleFileChange('emirates_id', e)}
                    />

                    <div className="shrink-0">
                      {emiratesId.fileName ? (
                        <div className="p-2 sm:px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-2.5">
                          <FileCheck2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div className="truncate max-w-[200px] sm:max-w-[280px]">
                            <p className="text-xs font-semibold text-foreground truncate">{emiratesId.fileName}</p>
                            <p className="text-[10px] text-muted-foreground">{formatBytes(emiratesId.fileSize)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFileRemove('emirates_id')}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1"
                            title="Remove file"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto gap-1.5 text-xs border-dashed hover:border-primary hover:text-primary"
                          onClick={() => emiratesIdRef.current?.click()}
                        >
                          <UploadCloud className="size-3.5" /> Upload Emirates ID
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* OCR Scanning indicator */}
                  {scanningDocs.emirates_id && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-primary animate-pulse">
                      <Loader2 className="size-3.5 animate-spin shrink-0" />
                      <span>Scanning document with OCR to detect Date of Issue & Expiry...</span>
                    </div>
                  )}

                  {/* OCR Auto-detected success badge */}
                  {ocrMsg.emirates_id && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                      <Sparkles className="size-3.5 shrink-0" />
                      <span>{ocrMsg.emirates_id}</span>
                    </div>
                  )}

                  {/* Metadata fields in a 3-column horizontal row */}
                  {emiratesId.fileName && (
                    <div className="mt-3.5 pt-3 border-t border-border/60">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Issue Date
                          </label>
                          <Input
                            type="date"
                            value={emiratesId.issueDate || ''}
                            onChange={(e) => handleDocMetaChange('emirates_id', 'issueDate', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Expiry Date
                          </label>
                          <Input
                            type="date"
                            value={emiratesId.expiryDate || ''}
                            onChange={(e) => handleDocMetaChange('emirates_id', 'expiryDate', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Issued Authority
                          </label>
                          <Input
                            type="text"
                            placeholder="e.g. ICP / Federal Authority"
                            value={emiratesId.issuedAuthority || ''}
                            onChange={(e) => handleDocMetaChange('emirates_id', 'issuedAuthority', e.target.value)}
                            className="h-9 text-xs bg-background/80"
                          />
                        </div>
                      </div>
                      {emiratesId.issueDate && emiratesId.expiryDate && emiratesId.expiryDate <= emiratesId.issueDate && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-2">
                          Warning: Expiry date should be after issue date.
                        </p>
                      )}
                    </div>
                  )}

                  {errors.emirates_id && (
                    <p className="text-[11px] text-destructive flex items-center gap-1.5 font-medium animate-in fade-in mt-2">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {errors.emirates_id}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Submit Action */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <p className="text-xs text-muted-foreground text-center sm:text-left">
                By submitting, you agree to allow {companyDisplayName} to evaluate your vendor profile and documents.
              </p>
              <Button
                type="submit"
                size="lg"
                disabled={submitting || emailCheckLoading || !!emailExistsWarning}
                title={
                  emailExistsWarning
                    ? 'Vendor email already exists. Please sign in or use another email.'
                    : emailCheckLoading
                    ? 'Checking email availability…'
                    : undefined
                }
                className="w-full sm:w-auto px-8 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <span className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    Submit Registration
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
