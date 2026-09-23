import { useState, useRef, useMemo, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { vendorPortalService, type VendorProfileData } from '../../services/vendorPortalService';
import {
  Building, CreditCard, FileCheck,
  CheckCircle2, AlertTriangle, FileText,
  MapPin, Phone, Mail, Globe, Lock, Eye, EyeOff,
  Loader2, Upload, Edit3, Save, X,
  Paperclip, ShieldCheck, UserCheck, KeyRound,
  Building2
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { cn } from '../../lib/utils';
import '../../styles/vendor-portal.css';

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
  const { data: profile, loading, reload } = useServiceData(
    () => vendorPortalService.getProfile(),
    EMPTY_PROFILE,
  );

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

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    if (newPassword.length < 8) { setPwMsg('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwMsg('New passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await vendorService.changePassword(currentPassword, newPassword, confirmPassword);
      setPwMsg('Password updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) { setPwMsg(err instanceof Error ? err.message : 'Failed'); }
    finally { setPwLoading(false); }
  };

  const startEditBank = () => {
    setBankForm({
      bankName: profile.banking.bankName || '',
      bankBranch: profile.banking.bankBranch || '',
      bankAccountNumber: '',
      bankIfscCode: profile.banking.bankIfscCode || '',
    });
    setBankMsg('');
    setEditBank(true);
  };

  const handleSaveBank = async () => {
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
    const file = fileRef.current?.files?.[0] || selectedFile;
    if (!file) { setUploadMsg('Select a file first'); return; }
    setUploading(true); setUploadMsg('');
    const reqDocs = (profile as any).requiredDocuments as Array<{ name: string }> | undefined;
    const docOptions = (() => {
      if (reqDocs && reqDocs.length > 0) return reqDocs.map(r => r.name);
      const uploadedNames = Array.from(new Set(profile.documents.map(d => d.name || d.type).filter(Boolean)));
      if (uploadedNames.length > 0) return uploadedNames;
      return DOC_TYPES;
    })();
    const targetDocType = docOptions.includes(docType) ? docType : (docOptions[0] || DOC_TYPES[0]);
    try {
      await vendorPortalService.uploadDocument(file, targetDocType, issueDate, expirationDate, issuingAuthority);
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
      const exp = (d as any).expirationDate;
      return exp && new Date(exp).getTime() <= Date.now();
    }).length;

    const expiringSoonCount = documents.filter(d => {
      const exp = (d as any).expirationDate;
      if (!exp) return false;
      const days = Math.ceil((new Date(exp).getTime() - Date.now()) / (1000 * 3600 * 24));
      return days > 0 && days <= 30;
    }).length;

    return { expiredCount, expiringSoonCount };
  }, [documents]);

  if (loading) {
    return (
      <PageFrame>
        <Card className="p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-3">
          <Loader2 className="size-5 animate-spin text-primary" /> Loading company profile…
        </Card>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
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
          tone="info"
          value="Protected"
          label="Portal Security"
          detail="Password active"
        />
      </div>

      {/* ── Row 1: Company Information & Banking Details (50% / 50% Side-by-Side) ── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        
        {/* Company Information (50% Width) */}
        <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs flex flex-col justify-between">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Company Name</div>
                <div className="font-semibold text-foreground mt-0.5">{company.name || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">GSTIN</div>
                <div className="font-semibold text-foreground mt-0.5">{company.gstNumber || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">PAN</div>
                <div className="font-semibold text-foreground mt-0.5">{company.panNumber || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</div>
                <div className="font-semibold text-foreground mt-0.5">{company.category || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contact Person</div>
                <div className="font-semibold text-foreground mt-0.5">{company.contactPerson || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</div>
                <div className="mt-0.5">
                  <Badge tone={company.isActive ? 'success' : 'warning'}>
                    {company.isActive ? 'Active' : company.status || 'Pending'}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Member Since</div>
                <div className="font-semibold text-foreground mt-0.5">
                  {company.createdAt
                    ? new Date(company.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border/60 space-y-2 text-xs text-muted-foreground">
            {company.address && (
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5 text-primary shrink-0" />
                <span className="truncate">{company.address}</span>
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
              <span className="truncate">{company.email}</span>
            </div>
            {company.website && (
              <div className="flex items-center gap-2">
                <Globe className="size-3.5 text-primary shrink-0" />
                <a
                  href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:underline text-primary font-medium"
                >
                  {company.website}
                </a>
              </div>
            )}
          </div>
        </Card>

        {/* Banking Details (50% Width) */}
        <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs flex flex-col justify-between">
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
                <Button size="sm" variant="outline" onClick={startEditBank} className="h-8 gap-1.5 text-xs">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bank Name</div>
                  <div className="font-semibold text-foreground mt-0.5">{banking.bankName || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Branch</div>
                  <div className="font-semibold text-foreground mt-0.5">{banking.bankBranch || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Account Number</div>
                  <div className="font-semibold text-foreground mt-0.5 tracking-wider">{banking.bankAccountNumber || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">IFSC Code</div>
                  <div className="font-semibold text-foreground mt-0.5">{banking.bankIfscCode || '—'}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Bank Name', key: 'bankName' as const, ph: 'e.g. HDFC Bank' },
                  { label: 'Branch', key: 'bankBranch' as const, ph: 'e.g. Hinjewadi, Pune' },
                  { label: 'Account Number', key: 'bankAccountNumber' as const, ph: 'Full account number' },
                  { label: 'IFSC Code', key: 'bankIfscCode' as const, ph: 'e.g. HDFC0001234' },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">{f.label}</label>
                    <Input
                      type="text"
                      className="h-9 rounded-lg"
                      value={bankForm[f.key]}
                      onChange={(e) => setBankForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.ph}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={handleSaveBank} disabled={bankSaving} size="sm" className="h-9 gap-1.5">
                    {bankSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {bankSaving ? 'Saving…' : 'Save Changes'}
                  </Button>
                  <Button variant="outline" onClick={() => setEditBank(false)} size="sm" className="h-9 gap-1.5">
                    <X className="size-4" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Row 2: Compliance Documents & Portal Password (50% / 50% Side-by-Side) ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Compliance Documents (50% Width) */}
        <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs flex flex-col justify-between">
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
            {(() => {
              const reqDocs = (profile as any).requiredDocuments as Array<{ name: string; trackIssueDate?: boolean; trackExpirationDate?: boolean; trackIssuingAuthority?: boolean }> | undefined;
              const docOptions = (() => {
                if (reqDocs && reqDocs.length > 0) return reqDocs.map(r => r.name);
                const uploadedNames = Array.from(new Set(profile.documents.map(d => d.name || d.type).filter(Boolean)));
                if (uploadedNames.length > 0) return uploadedNames;
                return DOC_TYPES;
              })();

              const activeDocType = docOptions.includes(docType) ? docType : (docOptions[0] || '');
              const currentRule = reqDocs?.find(r => r.name.toLowerCase().trim() === activeDocType.toLowerCase().trim());

              const showIssueDate = currentRule ? currentRule.trackIssueDate !== false : true;
              const showExpDate = currentRule ? currentRule.trackExpirationDate !== false : true;
              const showAuthority = currentRule ? currentRule.trackIssuingAuthority !== false : true;

              return (
                <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3 mb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={activeDocType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="h-10 flex-1 min-w-[160px] rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {docOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <label className={cn(buttonVariants({ variant: 'outline' }), 'h-10 rounded-xl cursor-pointer gap-1.5 text-xs')}>
                      <Paperclip className="size-3.5" /> Choose File
                      <input
                        type="file"
                        ref={fileRef}
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                        hidden
                        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      />
                    </label>

                    <Button
                      onClick={handleUploadDoc}
                      disabled={uploading || !selectedFile}
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
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">Date of Issue</label>
                          <Input
                            type="date"
                            className="h-8 text-xs rounded-lg"
                            value={issueDate}
                            onChange={(e) => setIssueDate(e.target.value)}
                          />
                        </div>
                      )}
                      {showExpDate && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">Date of Expiration</label>
                          <Input
                            type="date"
                            className="h-8 text-xs rounded-lg"
                            value={expirationDate}
                            onChange={(e) => setExpirationDate(e.target.value)}
                          />
                        </div>
                      )}
                      {showAuthority && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">Issuing Authority</label>
                          <Input
                            type="text"
                            className="h-8 text-xs rounded-lg"
                            placeholder="e.g. Income Tax Dept"
                            value={issuingAuthority}
                            onChange={(e) => setIssuingAuthority(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* File preview chip */}
                  {selectedFile && !uploading && (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs">
                      <FileText className="size-3.5 text-primary shrink-0" />
                      <span className="font-semibold text-foreground truncate max-w-xs">{selectedFile.name}</span>
                      <span className="text-muted-foreground">({formatBytes(selectedFile.size)})</span>
                      <Button
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
              );
            })()}

            {/* Document list */}
            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const docAny = doc as any;
                  const expDays = docAny.expirationDate ? Math.ceil((new Date(docAny.expirationDate).getTime() - Date.now()) / (1000 * 3600 * 24)) : null;
                  const isExpiringSoon = expDays !== null && expDays > 0 && expDays <= 30;
                  const isExpired = expDays !== null && expDays <= 0;

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 p-3 text-xs transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg',
                          isExpired ? 'bg-destructive/10 text-destructive' : isExpiringSoon ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
                        )}>
                          <FileText className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground text-xs truncate">{doc.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
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
                          <Badge tone="success" className="text-[11px]">Valid</Badge>
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

        {/* Portal Password (50% Width) */}
        <Card className="overflow-hidden border-border/80 bg-card p-6 shadow-xs flex flex-col justify-between">
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

            <p className="text-xs text-muted-foreground mb-4">
              Signed in as <strong className="text-foreground">{user?.email}</strong>. Update your account password below.
            </p>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Current Password</label>
                <Input
                  type={showPw ? 'text' : 'password'}
                  className="h-10 rounded-xl"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">New Password (min 8 characters)</label>
                <Input
                  type={showPw ? 'text' : 'password'}
                  className="h-10 rounded-xl"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                <Input
                  type={showPw ? 'text' : 'password'}
                  className="h-10 rounded-xl"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPw((s) => !s)}
                  className="h-9 gap-1.5 text-xs text-muted-foreground"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {showPw ? 'Hide Passwords' : 'Show Passwords'}
                </Button>

                <Button type="submit" disabled={pwLoading} className="h-10 rounded-xl gap-2">
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
    </PageFrame>
  );
}