import React, { useState, useRef, useMemo, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { vendorPortalService, type VendorProfileData } from '../../services/vendorPortalService';
import {
  Building, CreditCard, FileCheck,
  CheckCircle2, FileText,
  MapPin, Phone, Mail, Globe, Lock, Eye, EyeOff,
  Loader2, Upload, Edit3, Save, X,
  Paperclip, ShieldCheck, UserCheck, KeyRound,
  PenLine, Layers, Star,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Select } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { cn } from '../../lib/utils';
import { passwordValidation, bankingFormValues } from '../../components/vendor/profileValidation';
import { DetailSkeleton } from '../../components/shared/Skeleton';
import '../../styles/vendor-portal.css';
import './vendor-profile-workspace.css';

const DOC_TYPES = [
  'GST Registration Certificate',
  'PAN Card',
  'Company Incorporation Certificate',
  'Cancelled Cheque / Bank Letter',
  'ISO 9001 Certificate',
  'MSME Registration',
  'Insurance Certificate',
  'Trade License',
  'Other',
];

const EMPTY_PROFILE: VendorProfileData = {
  company: { name: '', email: '', phone: null, address: null, location: null, website: null, category: null, contactPerson: null, gstNumber: null, panNumber: null, status: '', isActive: false, createdAt: '' },
  banking: { bankName: null, bankBranch: null, bankAccountNumber: null, bankIfscCode: null },
  documents: [],
  performance: { avgQuality: 0, avgDelivery: 0, avgPriceScore: 0, overallScore: 0, quotationWinRate: 0, totalQuotations: 0, totalOrders: 0, deliveredOrders: 0 },
};

export default function VendorProfilePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'all';
  const initialTab = ['all', 'company', 'documents', 'banking', 'security'].includes(rawTab)
    ? (rawTab as 'all' | 'company' | 'documents' | 'banking' | 'security')
    : 'all';
  const [activeTab, setActiveTab] = useState<'all' | 'company' | 'documents' | 'banking' | 'security'>(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['all', 'company', 'documents', 'banking', 'security'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'all') {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('tab');
      setSearchParams(newParams, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  const { data: profile, loading, reload } = useServiceData(
    () => vendorPortalService.getProfile(),
    EMPTY_PROFILE,
  );

  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setCheckedAt(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Banking edit
  const [editBank, setEditBank] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: '', bankBranch: '', bankAccountNumber: '', bankIfscCode: '' });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState('');

  // Doc upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  const passwordErrors = passwordValidation(currentPassword, newPassword, confirmPassword);
  const canUpdatePassword = !pwLoading && !Object.values(passwordErrors).some(Boolean);
  const bankChanged = Object.entries(bankForm).some(([key, value]) => value !== (profile.banking[key as keyof typeof bankForm] ?? ''));
  const docOptions = profile.requiredDocuments?.length
    ? profile.requiredDocuments.map(rule => rule.name)
    : [...new Set(profile.documents.map(doc => doc.name || doc.type).filter(Boolean))];
  if (!docOptions.length) docOptions.push(...DOC_TYPES);
  const activeDocType = docOptions.includes(docType) ? docType : docOptions[0];
  const currentRule = profile.requiredDocuments?.find(rule => rule.name.toLowerCase().trim() === activeDocType.toLowerCase().trim());
  const showIssueDate = currentRule?.trackIssueDate !== false;
  const showExpDate = currentRule?.trackExpirationDate !== false;
  const showAuthority = currentRule?.trackIssuingAuthority !== false;
  const invalidDocumentDates = showIssueDate && showExpDate && Boolean(issueDate && expirationDate && expirationDate < issueDate);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!canUpdatePassword) return;
    setPwMsg('');
    setPwLoading(true);
    try {
      await vendorService.changePassword(currentPassword, newPassword, confirmPassword);
      setPwMsg('Password updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) { setPwMsg(err instanceof Error ? err.message : 'Failed'); }
    finally { setPwLoading(false); }
  };

  const startEditBank = () => {
    setBankForm(bankingFormValues(profile.banking));
    setBankMsg('');
    setEditBank(true);
  };

  const handleSaveBank = async () => {
    if (bankSaving || !bankChanged) return;
    setBankSaving(true); setBankMsg('');
    try {
      await vendorPortalService.updateBanking(bankForm);
      setBankMsg('Banking details updated!');
      setEditBank(false);
      reload();
      setTimeout(() => setBankMsg(''), 4000);
    } catch (err) { setBankMsg(err instanceof Error ? err.message : 'Failed'); }
    finally { setBankSaving(false); }
  };

  const handleUploadDoc = async () => {
    if (uploading || invalidDocumentDates) return;
    const file = fileRef.current?.files?.[0] || selectedFile;
    if (!file) { setUploadMsg('Select a file first'); return; }
    setUploading(true); setUploadMsg('');
    try {
      await vendorPortalService.uploadDocument(file, activeDocType, showIssueDate ? issueDate : '', showExpDate ? expirationDate : '', showAuthority ? issuingAuthority : '');
      setUploadMsg('Document uploaded successfully! Admin will verify it shortly.');
      if (fileRef.current) fileRef.current.value = '';
      setSelectedFile(null);
      setIssueDate('');
      setExpirationDate('');
      setIssuingAuthority('');
      reload();
      setTimeout(() => setUploadMsg(''), 5000);
    } catch (err) { setUploadMsg(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setUploading(false); }
  };

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const { company, banking, documents } = profile;

  const docSummary = useMemo(() => {
    const expiredCount = documents.filter(d => {
      const exp = d.expirationDate;
      return exp && new Date(exp).getTime() <= checkedAt;
    }).length;

    const expiringSoonCount = documents.filter(d => {
      const exp = d.expirationDate;
      if (!exp) return false;
      const days = Math.ceil((new Date(exp).getTime() - checkedAt) / (1000 * 3600 * 24));
      return days > 0 && days <= 30;
    }).length;

    return { expiredCount, expiringSoonCount };
  }, [documents, checkedAt]);

  if (loading) {
    return (
      <PageFrame className="profile-workspace">
        <DetailSkeleton />
      </PageFrame>
    );
  }

  return (
    <PageFrame className="profile-workspace">
      <PageLead
        title="Company Profile"
        description="Manage your company information, compliance documents, banking details, and security"
      />

      {/* ── Top Metric Cards ──────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={UserCheck}
          tone={company.isActive ? 'success' : 'warning'}
          value={company.isActive ? 'Active' : company.status || 'Pending'}
          label="Account Status"
          detail={company.isActive ? 'Verified vendor' : 'Verification pending'}
        />
        <MetricCard
          icon={FileCheck}
          tone={docSummary.expiredCount > 0 ? 'danger' : docSummary.expiringSoonCount > 0 ? 'warning' : 'primary'}
          value={documents.length}
          label="Compliance Documents"
          detail={docSummary.expiredCount > 0 ? `${docSummary.expiredCount} expired` : `${documents.length} uploaded`}
        />
        <MetricCard
          icon={CreditCard}
          tone={banking.bankAccountNumber ? 'success' : 'warning'}
          value={banking.bankAccountNumber ? 'Configured' : 'Incomplete'}
          label="Banking Details"
          detail={banking.bankName || 'Not configured'}
        />
        <MetricCard
          icon={ShieldCheck}
          tone="cyan"
          value="Protected"
          label="Portal Security"
          detail="Password active"
        />
      </div>

      {/* ── Profile Tabs Navigation ──────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5 border-b border-border/80 pb-2">
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
            activeTab === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          onClick={() => handleTabChange('all')}
        >
          <Layers className="size-3.5" /> All Overview
        </button>

        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
            activeTab === 'company'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          onClick={() => handleTabChange('company')}
        >
          <Building className="size-3.5" /> Company Profile
        </button>

        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
            activeTab === 'documents'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          onClick={() => handleTabChange('documents')}
        >
          <FileCheck className="size-3.5" /> Compliance Documents
          <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-bold text-foreground">
            {documents.length}
          </span>
        </button>

        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
            activeTab === 'banking'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          onClick={() => handleTabChange('banking')}
        >
          <CreditCard className="size-3.5" /> Banking Details
        </button>

        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all',
            activeTab === 'security'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          onClick={() => handleTabChange('security')}
        >
          <Lock className="size-3.5" /> Security & Password
        </button>
      </div>

      {/* ── Company Dedicated Tab ── */}
      {activeTab === 'company' && (
        <div className="max-w-4xl">
          {/* Company Information */}
          <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
            <div>
              <div className="flex items-center gap-3 pb-4 border-b border-border/60 mb-5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Company Information</h3>
                  <p className="text-xs text-muted-foreground">Official business details on record</p>
                </div>
              </div>

              <dl className="profile-facts grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Company Name</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{company.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{profile.gstNumberLabel || 'GSTIN'}</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{company.gstNumber || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{profile.panNumberLabel || 'PAN'}</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{company.panNumber || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{company.category || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contact Person</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{company.contactPerson || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</dt>
                  <dd className="mt-0.5">
                    <Badge tone={company.isActive ? 'success' : 'warning'} className={company.isActive ? "text-emerald-700 dark:text-emerald-300" : undefined}>
                      {company.isActive && <CheckCircle2 className="size-3.5" />}
                      {company.isActive ? 'Active' : company.status || 'Pending'}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Member Since</dt>
                  <dd className="font-semibold text-foreground mt-0.5">
                    {company.createdAt
                      ? new Date(company.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="profile-contact pt-4 mt-4 border-t border-border/60 text-xs text-muted-foreground">
              {company.address && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <MapPin className="size-3.5 text-primary shrink-0" />
                  <span className="break-words min-w-0">{company.address}</span>
                </div>
              )}
              {company.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-primary shrink-0" />
                  <span>{company.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-primary shrink-0" />
                <span className="break-words min-w-0">{company.email}</span>
              </div>
              {company.website && (
                <div className="flex items-center gap-2">
                  <Globe className="size-3.5 text-primary shrink-0" />
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="break-words min-w-0 hover:underline text-primary font-medium"
                  >
                    {company.website}
                  </a>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Compliance Documents Dedicated Tab ── */}
      {activeTab === 'documents' && (
        <div className="max-w-4xl">
          <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileCheck className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Compliance Documents</h3>
                    <p className="text-xs text-muted-foreground">Statutory certifications and compliance records</p>
                  </div>
                </div>
                <Badge tone="neutral" className="gap-1 font-normal text-xs">
                  <FileText className="size-3" />
                  {documents.length} Uploaded
                </Badge>
              </div>

              {/* Expiration Alert Banner */}
              {(docSummary.expiredCount > 0 || docSummary.expiringSoonCount > 0) && (
                <div className="mb-4">
                  <MessageStrip type={docSummary.expiredCount > 0 ? 'error' : 'warning'}>
                    <strong>Action Required: </strong>
                    {docSummary.expiredCount > 0 && <span>{docSummary.expiredCount} document{docSummary.expiredCount > 1 ? 's have' : ' has'} <strong>expired</strong>. </span>}
                    {docSummary.expiringSoonCount > 0 && <span>{docSummary.expiringSoonCount} document{docSummary.expiringSoonCount > 1 ? 's are' : ' is'} <strong>expiring soon</strong>. </span>}
                    Please upload updated copies to remain compliant.
                  </MessageStrip>
                </div>
              )}

              {/* Upload Area */}
              <div className="space-y-4 mb-5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="form-field flex-1 min-w-[160px]">
                    <label htmlFor="profile-document-type" className="text-xs font-semibold text-foreground">Document Type</label>
                    <Select
                      id="profile-document-type"
                      disabled={uploading}
                      value={activeDocType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="h-10 rounded-xl"
                    >
                      {docOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>

                  <label className={cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-xl cursor-pointer gap-1.5 text-xs focus-within:ring-2 focus-within:ring-ring')}>
                    <Paperclip className="size-3.5" /> Choose File
                    <input
                      type="file"
                      ref={fileRef}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      aria-label="Choose compliance document"
                      className="sr-only"
                      disabled={uploading}
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                  </label>

                  <Button
                    onClick={handleUploadDoc}
                    disabled={uploading || !selectedFile || invalidDocumentDates}
                    className="h-10 rounded-xl gap-1.5 text-xs"
                  >
                    {uploading
                      ? <><Loader2 className="size-3.5 animate-spin" /> Uploading…</>
                      : <><Upload className="size-3.5" /> Upload</>}
                  </Button>
                </div>

                {/* Metadata Fields */}
                {(showIssueDate || showExpDate || showAuthority) && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1">
                    {showIssueDate && (
                      <div className="form-field">
                        <label htmlFor="profile-issue-date" className="text-[11px] font-semibold text-muted-foreground">Date of Issue</label>
                        <Input
                          type="date"
                          className="h-8 text-xs rounded-lg"
                          id="profile-issue-date"
                          disabled={uploading}
                          value={issueDate ? String(issueDate).slice(0, 10) : ''}
                          onChange={(e) => setIssueDate(e.target.value)}
                        />
                      </div>
                    )}
                    {showExpDate && (
                      <div className="form-field">
                        <label htmlFor="profile-expiration-date" className="text-[11px] font-semibold text-muted-foreground">Date of Expiration</label>
                        <Input
                          type="date"
                          className="h-8 text-xs rounded-lg"
                          id="profile-expiration-date"
                          disabled={uploading}
                          min={showIssueDate && issueDate ? String(issueDate).slice(0, 10) : undefined}
                          aria-invalid={invalidDocumentDates}
                          aria-describedby={invalidDocumentDates ? "profile-date-error" : undefined}
                          value={expirationDate ? String(expirationDate).slice(0, 10) : ''}
                          onChange={(e) => setExpirationDate(e.target.value)}
                        />
                      </div>
                    )}
                    {showAuthority && (
                      <div className="form-field">
                        <label htmlFor="profile-authority" className="text-[11px] font-semibold text-muted-foreground">Issuing Authority</label>
                        <Input
                          type="text"
                          className="h-8 text-xs rounded-lg"
                          placeholder="e.g. Income Tax Dept"
                          id="profile-authority"
                          disabled={uploading}
                          value={issuingAuthority}
                          onChange={(e) => setIssuingAuthority(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {invalidDocumentDates && <p id="profile-date-error" role="status" className="text-xs profile-error">Expiration date must be on or after the issue date.</p>}

                {/* File preview chip */}
                {selectedFile && !uploading && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs">
                    <FileText className="size-3.5 text-primary shrink-0" />
                    <span className="font-semibold text-foreground truncate max-w-xs">{selectedFile.name}</span>
                    <span className="text-muted-foreground">({formatBytes(selectedFile.size)})</span>
                    <Button
                      aria-label="Remove selected document"
                      size="icon-sm"
                      variant="ghost"
                      className="ml-auto size-5 rounded-md hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                )}

                {uploadMsg && (
                  <MessageStrip type={uploadMsg.includes('uploaded') ? 'success' : 'error'}>
                    {uploadMsg}
                  </MessageStrip>
                )}
              </div>

              {/* Document list */}
              {documents.length > 0 ? (
                <div className="divide-y divide-border border-t border-border">
                  {documents.map((doc) => {
                    const expDays = doc.expirationDate ? Math.ceil((new Date(doc.expirationDate).getTime() - checkedAt) / (1000 * 3600 * 24)) : null;
                    const isExpiringSoon = expDays !== null && expDays > 0 && expDays <= 30;
                    const isExpired = expDays !== null && expDays <= 0;

                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-3 py-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg',
                            isExpired ? 'bg-destructive/10 text-destructive' : isExpiringSoon ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                          )}>
                            <FileText className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground text-xs break-words">{doc.name}</div>
                            <div className="text-[11px] text-muted-foreground break-words">
                              {doc.type} · {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 ml-2">
                          {isExpired ? (
                            <Badge tone="danger" className="text-[11px]">Expired</Badge>
                          ) : isExpiringSoon ? (
                            <Badge tone="warning" className="text-[11px]">Expires in {expDays}d</Badge>
                          ) : (
                            <Badge tone="success" className="text-[11px] text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-3" /> Valid</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No documents uploaded"
                  description="Upload statutory certificates to maintain compliance."
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Banking Details Dedicated Tab ── */}
      {activeTab === 'banking' && (
        <div className="max-w-4xl">
          <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CreditCard className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Banking Details</h3>
                    <p className="text-xs text-muted-foreground">Account info for settlement and payouts</p>
                  </div>
                </div>
                {!editBank && (
                  <Button size="sm" variant="outline" onClick={startEditBank} aria-label="Edit banking details" className="h-8 gap-1.5 text-xs">
                    <Edit3 className="size-3.5" /> Edit
                  </Button>
                )}
              </div>

              {bankMsg && (
                <div className="mb-4">
                  <MessageStrip type={bankMsg.includes('updated') ? 'success' : 'error'}>
                    {bankMsg}
                  </MessageStrip>
                </div>
              )}

              {!editBank ? (
                <dl className="profile-facts grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bank Name</dt>
                    <dd className="font-semibold text-foreground mt-0.5">{banking.bankName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Branch</dt>
                    <dd className="font-semibold text-foreground mt-0.5">{banking.bankBranch || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Account Number</dt>
                    <dd className="font-semibold text-foreground mt-0.5 tracking-wider">{banking.bankAccountNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">IFSC Code</dt>
                    <dd className="font-semibold text-foreground mt-0.5">{banking.bankIfscCode || '—'}</dd>
                  </div>
                </dl>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Bank Name', key: 'bankName' as const, ph: 'e.g. HDFC Bank' },
                    { label: 'Branch', key: 'bankBranch' as const, ph: 'e.g. Hinjewadi, Pune' },
                    { label: 'Account Number', key: 'bankAccountNumber' as const, ph: 'Full account number' },
                    { label: 'IFSC Code', key: 'bankIfscCode' as const, ph: 'e.g. HDFC0001234' },
                  ].map((f) => (
                    <div key={f.key} className="form-field">
                      <label htmlFor={`profile-${f.key}`} className="text-xs font-semibold text-foreground">{f.label}</label>
                      <Input
                        id={`profile-${f.key}`}
                        disabled={bankSaving}
                        type="text"
                        className="h-9 rounded-lg"
                        value={bankForm[f.key]}
                        onChange={(e) => setBankForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.ph}
                      />
                    </div>
                  ))}
                  <div className="col-span-2 flex items-center justify-end gap-2 pt-2">
                    <Button onClick={handleSaveBank} disabled={bankSaving || !bankChanged} size="sm" className="h-9 gap-1.5">
                      {bankSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {bankSaving ? 'Saving…' : 'Save Changes'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditBank(false)} disabled={bankSaving} size="sm" className="h-9 gap-1.5">
                      <X className="size-4" /> Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Security Dedicated Tab ── */}
      {activeTab === 'security' && (
        <div className="max-w-2xl">
          <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
            <div>
              <div className="flex items-center gap-3 pb-4 border-b border-border/60 mb-5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Lock className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Portal Password</h3>
                  <p className="text-xs text-muted-foreground">Manage your credentials and login password</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4 break-words">
                Signed in as <strong className="text-foreground">{user?.email}</strong>. Update your account password below.
              </p>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="form-field">
                  <label htmlFor="profile-password-current" className="text-xs font-semibold text-foreground">Current Password</label>
                  <Input
                    type={showPw ? 'text' : 'password'}
                    className="h-10 rounded-xl"
                    id="profile-password-current"
                    autoComplete="current-password"
                    disabled={pwLoading}
                    aria-describedby="profile-password-guidance"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPwMsg(''); }}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="profile-password-new" className="text-xs font-semibold text-foreground">New Password (min 8 characters)</label>
                  <Input
                    type={showPw ? 'text' : 'password'}
                    className="h-10 rounded-xl"
                    id="profile-password-new"
                    autoComplete="new-password"
                    disabled={pwLoading}
                    aria-describedby="profile-password-guidance"
                    maxLength={128}
                    aria-invalid={Boolean(newPassword && passwordErrors.next)}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPwMsg(''); }}
                    required
                    minLength={8}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="profile-password-confirm" className="text-xs font-semibold text-foreground">Confirm New Password</label>
                  <Input
                    type={showPw ? 'text' : 'password'}
                    className="h-10 rounded-xl"
                    id="profile-password-confirm"
                    autoComplete="new-password"
                    disabled={pwLoading}
                    aria-describedby="profile-password-guidance"
                    maxLength={128}
                    aria-invalid={Boolean(confirmPassword && passwordErrors.confirmation)}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPwMsg(''); }}
                    required
                    minLength={8}
                  />
                </div>

                <p id="profile-password-guidance" aria-live="polite" className={cn('text-xs', (newPassword && passwordErrors.next) || (confirmPassword && passwordErrors.confirmation) ? 'profile-error' : 'text-muted-foreground')}>
                  {(newPassword && passwordErrors.next) || (confirmPassword && passwordErrors.confirmation) || 'Enter your current password and confirm a new password of 8–128 characters.'}
                </p>
                <div className="flex flex-wrap gap-2 items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={showPw}
                    onClick={() => setShowPw((s) => !s)}
                    className="h-9 gap-1.5 text-xs text-muted-foreground"
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {showPw ? 'Hide Passwords' : 'Show Passwords'}
                  </Button>

                  <Button type="submit" disabled={!canUpdatePassword} className="h-10 rounded-xl gap-2">
                    {pwLoading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                    {pwLoading ? 'Updating…' : 'Update Password'}
                  </Button>
                </div>

                {pwMsg && (
                  <MessageStrip type={pwMsg.includes('successfully') ? 'success' : 'error'}>
                    {pwMsg}
                  </MessageStrip>
                )}
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* ── All Overview Tab ── */}
      {activeTab === 'all' && (
        <div className="space-y-6">
          <div className="profile-columns">
            <div className="profile-column">
              {/* Company Information */}
              <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
                <div>
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60 mb-5">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-base">Company Information</h3>
                      <p className="text-xs text-muted-foreground">Official business details on record</p>
                    </div>
                  </div>

                  <dl className="profile-facts grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Company Name</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{company.name || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{profile.gstNumberLabel || 'GSTIN'}</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{company.gstNumber || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{profile.panNumberLabel || 'PAN'}</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{company.panNumber || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{company.category || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contact Person</dt>
                      <dd className="font-semibold text-foreground mt-0.5">{company.contactPerson || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</dt>
                      <dd className="mt-0.5">
                        <Badge tone={company.isActive ? 'success' : 'warning'} className={company.isActive ? "text-emerald-700 dark:text-emerald-300" : undefined}>
                          {company.isActive && <CheckCircle2 className="size-3.5" />}
                          {company.isActive ? 'Active' : company.status || 'Pending'}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Member Since</dt>
                      <dd className="font-semibold text-foreground mt-0.5">
                        {company.createdAt
                          ? new Date(company.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="profile-contact pt-4 mt-4 border-t border-border/60 text-xs text-muted-foreground">
                  {company.address && (
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <MapPin className="size-3.5 text-primary shrink-0" />
                      <span className="break-words min-w-0">{company.address}</span>
                    </div>
                  )}
                  {company.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="size-3.5 text-primary shrink-0" />
                      <span>{company.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 text-primary shrink-0" />
                    <span className="break-words min-w-0">{company.email}</span>
                  </div>
                  {company.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="size-3.5 text-primary shrink-0" />
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="break-words min-w-0 hover:underline text-primary font-medium"
                      >
                        {company.website}
                      </a>
                    </div>
                  )}
                </div>
              </Card>

              {/* Compliance Documents */}
              <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileCheck className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-base">Compliance Documents</h3>
                        <p className="text-xs text-muted-foreground">Statutory certifications and compliance records</p>
                      </div>
                    </div>
                    <Badge tone="neutral" className="gap-1 font-normal text-xs">
                      <FileText className="size-3" />
                      {documents.length} Uploaded
                    </Badge>
                  </div>

                  {/* Expiration Alert Banner */}
                  {(docSummary.expiredCount > 0 || docSummary.expiringSoonCount > 0) && (
                    <div className="mb-4">
                      <MessageStrip type={docSummary.expiredCount > 0 ? 'error' : 'warning'}>
                        <strong>Action Required: </strong>
                        {docSummary.expiredCount > 0 && <span>{docSummary.expiredCount} document{docSummary.expiredCount > 1 ? 's have' : ' has'} <strong>expired</strong>. </span>}
                        {docSummary.expiringSoonCount > 0 && <span>{docSummary.expiringSoonCount} document{docSummary.expiringSoonCount > 1 ? 's are' : ' is'} <strong>expiring soon</strong>. </span>}
                        Please upload updated copies to remain compliant.
                      </MessageStrip>
                    </div>
                  )}

                  {/* Upload Area */}
                  <div className="space-y-4 mb-5">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="form-field flex-1 min-w-[160px]">
                        <label htmlFor="profile-document-type-all" className="text-xs font-semibold text-foreground">Document Type</label>
                        <Select
                          id="profile-document-type-all"
                          disabled={uploading}
                          value={activeDocType}
                          onChange={(e) => setDocType(e.target.value)}
                          className="h-10 rounded-xl"
                        >
                          {docOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                        </Select>
                      </div>

                      <label className={cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-xl cursor-pointer gap-1.5 text-xs focus-within:ring-2 focus-within:ring-ring')}>
                        <Paperclip className="size-3.5" /> Choose File
                        <input
                          type="file"
                          ref={fileRef}
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                          aria-label="Choose compliance document"
                          className="sr-only"
                          disabled={uploading}
                          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                        />
                      </label>

                      <Button
                        onClick={handleUploadDoc}
                        disabled={uploading || !selectedFile || invalidDocumentDates}
                        className="h-10 rounded-xl gap-1.5 text-xs"
                      >
                        {uploading
                          ? <><Loader2 className="size-3.5 animate-spin" /> Uploading…</>
                          : <><Upload className="size-3.5" /> Upload</>}
                      </Button>
                    </div>

                    {/* Metadata Fields */}
                    {(showIssueDate || showExpDate || showAuthority) && (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1">
                        {showIssueDate && (
                          <div className="form-field">
                            <label htmlFor="profile-issue-date-all" className="text-[11px] font-semibold text-muted-foreground">Date of Issue</label>
                            <Input
                              type="date"
                              className="h-8 text-xs rounded-lg"
                              id="profile-issue-date-all"
                              disabled={uploading}
                              value={issueDate ? String(issueDate).slice(0, 10) : ''}
                              onChange={(e) => setIssueDate(e.target.value)}
                            />
                          </div>
                        )}
                        {showExpDate && (
                          <div className="form-field">
                            <label htmlFor="profile-expiration-date-all" className="text-[11px] font-semibold text-muted-foreground">Date of Expiration</label>
                            <Input
                              type="date"
                              className="h-8 text-xs rounded-lg"
                              id="profile-expiration-date-all"
                              disabled={uploading}
                              min={showIssueDate && issueDate ? String(issueDate).slice(0, 10) : undefined}
                              aria-invalid={invalidDocumentDates}
                              aria-describedby={invalidDocumentDates ? "profile-date-error-all" : undefined}
                              value={expirationDate ? String(expirationDate).slice(0, 10) : ''}
                              onChange={(e) => setExpirationDate(e.target.value)}
                            />
                          </div>
                        )}
                        {showAuthority && (
                          <div className="form-field">
                            <label htmlFor="profile-authority-all" className="text-[11px] font-semibold text-muted-foreground">Issuing Authority</label>
                            <Input
                              type="text"
                              className="h-8 text-xs rounded-lg"
                              placeholder="e.g. Income Tax Dept"
                              id="profile-authority-all"
                              disabled={uploading}
                              value={issuingAuthority}
                              onChange={(e) => setIssuingAuthority(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {invalidDocumentDates && <p id="profile-date-error-all" role="status" className="text-xs profile-error">Expiration date must be on or after the issue date.</p>}

                    {/* File preview chip */}
                    {selectedFile && !uploading && (
                      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs">
                        <FileText className="size-3.5 text-primary shrink-0" />
                        <span className="font-semibold text-foreground truncate max-w-xs">{selectedFile.name}</span>
                        <span className="text-muted-foreground">({formatBytes(selectedFile.size)})</span>
                        <Button
                          aria-label="Remove selected document"
                          size="icon-sm"
                          variant="ghost"
                          className="ml-auto size-5 rounded-md hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileRef.current) fileRef.current.value = '';
                          }}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    )}

                    {uploadMsg && (
                      <MessageStrip type={uploadMsg.includes('uploaded') ? 'success' : 'error'}>
                        {uploadMsg}
                      </MessageStrip>
                    )}
                  </div>

                  {/* Document list */}
                  {documents.length > 0 ? (
                    <div className="divide-y divide-border border-t border-border">
                      {documents.map((doc) => {
                        const expDays = doc.expirationDate ? Math.ceil((new Date(doc.expirationDate).getTime() - checkedAt) / (1000 * 3600 * 24)) : null;
                        const isExpiringSoon = expDays !== null && expDays > 0 && expDays <= 30;
                        const isExpired = expDays !== null && expDays <= 0;

                        return (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-3 py-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn(
                                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                                isExpired ? 'bg-destructive/10 text-destructive' : isExpiringSoon ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                              )}>
                                <FileText className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground text-xs break-words">{doc.name}</div>
                                <div className="text-[11px] text-muted-foreground break-words">
                                  {doc.type} · {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 ml-2">
                              {isExpired ? (
                                <Badge tone="danger" className="text-[11px]">Expired</Badge>
                              ) : isExpiringSoon ? (
                                <Badge tone="warning" className="text-[11px]">Expires in {expDays}d</Badge>
                              ) : (
                                <Badge tone="success" className="text-[11px] text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-3" /> Valid</Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title="No documents uploaded"
                      description="Upload statutory certificates to maintain compliance."
                    />
                  )}
                </div>
              </Card>
            </div>

            <div className="profile-column">
              {/* Banking Details */}
              <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CreditCard className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-base">Banking Details</h3>
                        <p className="text-xs text-muted-foreground">Account info for settlement and payouts</p>
                      </div>
                    </div>
                    {!editBank && (
                      <Button size="sm" variant="outline" onClick={startEditBank} aria-label="Edit banking details" className="h-8 gap-1.5 text-xs">
                        <Edit3 className="size-3.5" /> Edit
                      </Button>
                    )}
                  </div>

                  {bankMsg && (
                    <div className="mb-4">
                      <MessageStrip type={bankMsg.includes('updated') ? 'success' : 'error'}>
                        {bankMsg}
                      </MessageStrip>
                    </div>
                  )}

                  {!editBank ? (
                    <dl className="profile-facts grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bank Name</dt>
                        <dd className="font-semibold text-foreground mt-0.5">{banking.bankName || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Branch</dt>
                        <dd className="font-semibold text-foreground mt-0.5">{banking.bankBranch || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Account Number</dt>
                        <dd className="font-semibold text-foreground mt-0.5 tracking-wider">{banking.bankAccountNumber || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">IFSC Code</dt>
                        <dd className="font-semibold text-foreground mt-0.5">{banking.bankIfscCode || '—'}</dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Bank Name', key: 'bankName' as const, ph: 'e.g. HDFC Bank' },
                        { label: 'Branch', key: 'bankBranch' as const, ph: 'e.g. Hinjewadi, Pune' },
                        { label: 'Account Number', key: 'bankAccountNumber' as const, ph: 'Full account number' },
                        { label: 'IFSC Code', key: 'bankIfscCode' as const, ph: 'e.g. HDFC0001234' },
                      ].map((f) => (
                        <div key={f.key} className="form-field">
                          <label htmlFor={`profile-${f.key}-all`} className="text-xs font-semibold text-foreground">{f.label}</label>
                          <Input
                            id={`profile-${f.key}-all`}
                            disabled={bankSaving}
                            type="text"
                            className="h-9 rounded-lg"
                            value={bankForm[f.key]}
                            onChange={(e) => setBankForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.ph}
                          />
                        </div>
                      ))}
                      <div className="col-span-2 flex items-center justify-end gap-2 pt-2">
                        <Button onClick={handleSaveBank} disabled={bankSaving || !bankChanged} size="sm" className="h-9 gap-1.5">
                          {bankSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                          {bankSaving ? 'Saving…' : 'Save Changes'}
                        </Button>
                        <Button variant="outline" onClick={() => setEditBank(false)} disabled={bankSaving} size="sm" className="h-9 gap-1.5">
                          <X className="size-4" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Portal Password */}
              <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs profile-section">
                <div>
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60 mb-5">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Lock className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-base">Portal Password</h3>
                      <p className="text-xs text-muted-foreground">Manage your credentials and login password</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-4 break-words">
                    Signed in as <strong className="text-foreground">{user?.email}</strong>. Update your account password below.
                  </p>

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="form-field">
                      <label htmlFor="profile-password-current-all" className="text-xs font-semibold text-foreground">Current Password</label>
                      <Input
                        type={showPw ? 'text' : 'password'}
                        className="h-10 rounded-xl"
                        id="profile-password-current-all"
                        autoComplete="current-password"
                        disabled={pwLoading}
                        aria-describedby="profile-password-guidance-all"
                        value={currentPassword}
                        onChange={(e) => { setCurrentPassword(e.target.value); setPwMsg(''); }}
                        required
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="profile-password-new-all" className="text-xs font-semibold text-foreground">New Password (min 8 characters)</label>
                      <Input
                        type={showPw ? 'text' : 'password'}
                        className="h-10 rounded-xl"
                        id="profile-password-new-all"
                        autoComplete="new-password"
                        disabled={pwLoading}
                        aria-describedby="profile-password-guidance-all"
                        maxLength={128}
                        aria-invalid={Boolean(newPassword && passwordErrors.next)}
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setPwMsg(''); }}
                        required
                        minLength={8}
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="profile-password-confirm-all" className="text-xs font-semibold text-foreground">Confirm New Password</label>
                      <Input
                        type={showPw ? 'text' : 'password'}
                        className="h-10 rounded-xl"
                        id="profile-password-confirm-all"
                        autoComplete="new-password"
                        disabled={pwLoading}
                        aria-describedby="profile-password-guidance-all"
                        maxLength={128}
                        aria-invalid={Boolean(confirmPassword && passwordErrors.confirmation)}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setPwMsg(''); }}
                        required
                        minLength={8}
                      />
                    </div>

                    <p id="profile-password-guidance-all" aria-live="polite" className={cn('text-xs', (newPassword && passwordErrors.next) || (confirmPassword && passwordErrors.confirmation) ? 'profile-error' : 'text-muted-foreground')}>
                      {(newPassword && passwordErrors.next) || (confirmPassword && passwordErrors.confirmation) || 'Enter your current password and confirm a new password of 8–128 characters.'}
                    </p>
                    <div className="flex flex-wrap gap-2 items-center justify-between pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={showPw}
                        onClick={() => setShowPw((s) => !s)}
                        className="h-9 gap-1.5 text-xs text-muted-foreground"
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        {showPw ? 'Hide Passwords' : 'Show Passwords'}
                      </Button>

                      <Button type="submit" disabled={!canUpdatePassword} className="h-10 rounded-xl gap-2">
                        {pwLoading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                        {pwLoading ? 'Updating…' : 'Update Password'}
                      </Button>
                    </div>

                    {pwMsg && (
                      <MessageStrip type={pwMsg.includes('successfully') ? 'success' : 'error'}>
                        {pwMsg}
                      </MessageStrip>
                    )}
                  </form>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}