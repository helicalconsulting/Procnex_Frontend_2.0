import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
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
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { motionTransition } from '../../lib/motion';
import { useTheme } from '../../context/ThemeContext';
import PhoneInput from '../../components/shared/PhoneInput';
import { companySettingsService, type Category } from '../../services/companySettingsService';
import {
  procurementService,
  type SelfRegisteredVendorRecord,
  type UploadedRegistrationDoc,
} from '../../services/procurementService';
import { Card } from '../../components/ui/card';
import { Input, Select, Textarea } from '../../components/ui/input';
import { Button, buttonVariants } from '../../components/ui/button';
import { cn } from '../../lib/utils';

const DEFAULT_CATEGORIES: Array<{ id: string; name: string }> = [
  { id: 'cat_materials', name: 'Raw Materials & Construction' },
  { id: 'cat_it', name: 'IT Hardware, Software & Telecommunications' },
  { id: 'cat_maint', name: 'Facilities Management & Maintenance' },
  { id: 'cat_logistics', name: 'Logistics, Freight & Transportation' },
  { id: 'cat_consulting', name: 'Professional Services & Consulting' },
  { id: 'cat_office', name: 'Office Supplies & Equipment' },
  { id: 'cat_hospitality', name: 'Hospitality, Catering & Events' },
];

interface UploadedFileItem {
  type: 'trade_license' | 'vat_certificate' | 'emirates_id';
  label: string;
  file: File | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  dataUrl?: string;
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
  const { companyCode } = useParams<{ companyCode?: string }>();
  const activeCompany = (companyCode || 'alzorah').toUpperCase();
  const companyDisplayName = activeCompany === 'ALZORAH' ? "'Al Zorah' Group" : `${activeCompany} Group`;

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
  });

  const [vatCertificate, setVatCertificate] = useState<UploadedFileItem>({
    type: 'vat_certificate',
    label: 'VAT Certificate',
    file: null,
    fileName: '',
    fileSize: 0,
    mimeType: '',
  });

  const [emiratesId, setEmiratesId] = useState<UploadedFileItem>({
    type: 'emirates_id',
    label: 'Emirates ID',
    file: null,
    fileName: '',
    fileSize: 0,
    mimeType: '',
  });

  const tradeLicenseRef = useRef<HTMLInputElement>(null);
  const vatCertificateRef = useRef<HTMLInputElement>(null);
  const emiratesIdRef = useRef<HTMLInputElement>(null);

  // Dropdown data
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>(DEFAULT_CATEGORIES);

  // Validation & Submission State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [registeredRecord, setRegisteredRecord] = useState<SelfRegisteredVendorRecord | null>(null);

  // Load Categories on mount
  useEffect(() => {
    let mounted = true;
    companySettingsService
      .listCategories()
      .then((cats) => {
        if (!mounted) return;
        const activeCats = cats.filter((c: Category) => c.isActive !== false);
        if (activeCats.length > 0) {
          setCategories(activeCats.map((c: Category) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {
        // Fallback to DEFAULT_CATEGORIES
      });
    return () => {
      mounted = false;
    };
  }, []);

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

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const docItem: UploadedFileItem = {
        type: docType,
        label:
          docType === 'trade_license'
            ? 'Trade License'
            : docType === 'vat_certificate'
            ? 'VAT Certificate'
            : 'Emirates ID',
        file,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        dataUrl,
      };

      if (docType === 'trade_license') setTradeLicense(docItem);
      else if (docType === 'vat_certificate') setVatCertificate(docItem);
      else if (docType === 'emirates_id') setEmiratesId(docItem);

      setErrors((prev) => {
        const next = { ...prev };
        delete next[docType];
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileRemove = (docType: 'trade_license' | 'vat_certificate' | 'emirates_id') => {
    if (docType === 'trade_license') {
      setTradeLicense({ type: 'trade_license', label: 'Trade License', file: null, fileName: '', fileSize: 0, mimeType: '' });
      if (tradeLicenseRef.current) tradeLicenseRef.current.value = '';
    } else if (docType === 'vat_certificate') {
      setVatCertificate({ type: 'vat_certificate', label: 'VAT Certificate', file: null, fileName: '', fileSize: 0, mimeType: '' });
      if (vatCertificateRef.current) vatCertificateRef.current.value = '';
    } else if (docType === 'emirates_id') {
      setEmiratesId({ type: 'emirates_id', label: 'Emirates ID', file: null, fileName: '', fileSize: 0, mimeType: '' });
      if (emiratesIdRef.current) emiratesIdRef.current.value = '';
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!companyName.trim()) {
      errs.companyName = 'Company name is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!contactEmail.trim()) {
      errs.contactEmail = 'Vendor email is required';
    } else if (!emailRegex.test(contactEmail.trim())) {
      errs.contactEmail = 'Please enter a valid email address';
    }
    if (contactPhone.trim()) {
      const cleanDigits = contactPhone.replace(/\D/g, '');
      if (cleanDigits.length < 7 || cleanDigits.length > 15) {
        errs.contactPhone = 'Please enter a valid phone number (7 to 15 digits)';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const documents: UploadedRegistrationDoc[] = [];
      const now = new Date().toISOString();

      if (tradeLicense.fileName) {
        documents.push({
          type: 'trade_license',
          label: 'Trade License',
          fileName: tradeLicense.fileName,
          fileSize: tradeLicense.fileSize,
          mimeType: tradeLicense.mimeType,
          dataUrl: tradeLicense.dataUrl,
          uploadedAt: now,
        });
      }

      if (vatCertificate.fileName) {
        documents.push({
          type: 'vat_certificate',
          label: 'VAT Certificate',
          fileName: vatCertificate.fileName,
          fileSize: vatCertificate.fileSize,
          mimeType: vatCertificate.mimeType,
          dataUrl: vatCertificate.dataUrl,
          uploadedAt: now,
        });
      }

      if (emiratesId.fileName) {
        documents.push({
          type: 'emirates_id',
          label: 'Emirates ID',
          fileName: emiratesId.fileName,
          fileSize: emiratesId.fileSize,
          mimeType: emiratesId.mimeType,
          dataUrl: emiratesId.dataUrl,
          uploadedAt: now,
        });
      }

      const record = await procurementService.registerVendor({
        companyName,
        contactEmail,
        contactPerson,
        countryCode: contactCountryCode,
        phone: contactPhone,
        category,
        categoryId,
        supplierType,
        notes,
        companyCode: companyCode || 'alzorah',
        documents,
      });
      setRegisteredRecord(record);
    } catch (err) {
      setErrors({ form: 'An error occurred while submitting. Please try again.' });
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
    setRegisteredRecord(null);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-foreground py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Light / Dark Mode Toggle & Vendor Login */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-30 flex items-center gap-2">
        <Link
          to="/vendor/login"
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
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {companyDisplayName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
            Submit your supplier details and required legal documents below to register as an authorized vendor.
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
                      {companyDisplayName} Procurement &lt;procurement@alzorah.com&gt;
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
                    Thank you for your interest in becoming a vendor with &apos;Al Zorah&apos; Group. You will be
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
                to="/vendor/login"
                className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full sm:w-auto gap-1.5')}
              >
                Go to Vendor Login
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Card>
        ) : (
          /* Self-Registration Form */
          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.form && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errors.form}</span>
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
                  </label>
                  <div className="relative">
                    <Mail className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      id="reg-email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => {
                        setContactEmail(e.target.value);
                        if (errors.contactEmail) setErrors((prev) => ({ ...prev, contactEmail: '' }));
                      }}
                      placeholder="vendor@company.com"
                      required
                      className={`pl-9 ${errors.contactEmail ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                  </div>
                  {errors.contactEmail && (
                    <p className="text-xs text-destructive">{errors.contactEmail}</p>
                  )}
                </div>

                {/* Contact Person */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="reg-contact">
                    Contact Person
                  </label>
                  <div className="relative">
                    <Users className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      id="reg-contact"
                      type="text"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder="Full name"
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Phone Number with Country Code */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="reg-phone">
                    Phone Number
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
                    <label className="text-xs font-semibold text-foreground" htmlFor="reg-category">
                      Vendor Category
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
                        }}
                        className="pl-9 cursor-pointer"
                      >
                        <option value="">Select Vendor Category (optional)</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  {/* Supplier Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground" htmlFor="reg-supplier-type">
                      Supplier Type
                    </label>
                    <div className="relative">
                      <Globe className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Select
                        id="reg-supplier-type"
                        value={supplierType}
                        onChange={(e) => setSupplierType(e.target.value)}
                        className="pl-9 cursor-pointer"
                      >
                        <option value="">Select Supplier Type (optional)</option>
                        <option value="Domestic Supplier">Domestic Supplier</option>
                        <option value="Overseas Supplier">Overseas Supplier</option>
                        <option value="International Supplier">International Supplier</option>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Notes / Address */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="reg-notes">
                    Notes / Business Address
                  </label>
                  <Textarea
                    id="reg-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Provide your registered office address or summary of products/services..."
                  />
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Trade License */}
                <div className="p-4 rounded-xl border border-dashed border-border/80 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">Trade License</span>
                      {tradeLicense.fileName && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" /> Ready
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
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

                  {tradeLicense.fileName ? (
                    <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <FileCheck2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-foreground truncate">{tradeLicense.fileName}</p>
                          <p className="text-[10px] text-muted-foreground">{formatBytes(tradeLicense.fileSize)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFileRemove('trade_license')}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
                      className="w-full gap-1.5 text-xs border-dashed hover:border-primary hover:text-primary"
                      onClick={() => tradeLicenseRef.current?.click()}
                    >
                      <UploadCloud className="size-3.5" /> Upload Trade License
                    </Button>
                  )}
                  {errors.trade_license && (
                    <p className="text-[11px] text-destructive">{errors.trade_license}</p>
                  )}
                </div>

                {/* 2. VAT Certificate */}
                <div className="p-4 rounded-xl border border-dashed border-border/80 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">VAT Certificate</span>
                      {vatCertificate.fileName && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" /> Ready
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
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

                  {vatCertificate.fileName ? (
                    <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <FileCheck2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-foreground truncate">{vatCertificate.fileName}</p>
                          <p className="text-[10px] text-muted-foreground">{formatBytes(vatCertificate.fileSize)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFileRemove('vat_certificate')}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
                      className="w-full gap-1.5 text-xs border-dashed hover:border-primary hover:text-primary"
                      onClick={() => vatCertificateRef.current?.click()}
                    >
                      <UploadCloud className="size-3.5" /> Upload VAT Certificate
                    </Button>
                  )}
                  {errors.vat_certificate && (
                    <p className="text-[11px] text-destructive">{errors.vat_certificate}</p>
                  )}
                </div>

                {/* 3. Emirates ID */}
                <div className="p-4 rounded-xl border border-dashed border-border/80 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">Emirates ID</span>
                      {emiratesId.fileName && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" /> Ready
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
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

                  {emiratesId.fileName ? (
                    <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <FileCheck2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-foreground truncate">{emiratesId.fileName}</p>
                          <p className="text-[10px] text-muted-foreground">{formatBytes(emiratesId.fileSize)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFileRemove('emirates_id')}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
                      className="w-full gap-1.5 text-xs border-dashed hover:border-primary hover:text-primary"
                      onClick={() => emiratesIdRef.current?.click()}
                    >
                      <UploadCloud className="size-3.5" /> Upload Emirates ID
                    </Button>
                  )}
                  {errors.emirates_id && (
                    <p className="text-[11px] text-destructive">{errors.emirates_id}</p>
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
                disabled={submitting}
                className="w-full sm:w-auto px-8 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
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
