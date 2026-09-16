import { useState, useRef, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { vendorPortalService, type VendorProfileData } from '../../services/vendorPortalService';
import {
  Building, CreditCard, FileCheck,
  CheckCircle2, AlertTriangle, FileText,
  MapPin, Phone, Mail, Globe, Lock, Eye, EyeOff,
  Loader2, Upload, Edit3, Save, X,
  Paperclip,
} from 'lucide-react';
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

  // Doc upload — added selectedFile state & metadata fields
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

  // Format bytes helper
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const { company, banking, documents } = profile;



  if (loading) {
    return (
      <div className="vendor-portal">
        <div className="vendor-portal__container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: 'var(--text-secondary)' }}>
          <Loader2 size={20} className="spin" /> Loading profile…
        </div>
      </div>
    );
  }

  return (
    <div className="vendor-portal">
      <div className="vendor-portal__container">

        {/* Header */}
        <div className="vendor-header">
          <div className="vendor-header__content">
            <h1>Company Profile 🏢</h1>
            <p>Manage your company information, documents, and banking details</p>
          </div>
        </div>

        {/* ── Company & Banking ────────────── */}
        <div className="vprof-grid">
          <div className="vprof-card">
            <div className="vprof-card__header">
              <Building size={18} style={{ color: 'var(--vendor-primary)' }} />
              Company Information
            </div>
            <div className="vprof-card__body">
              {[
                { label: 'Company Name', value: company.name || '—' },
                { label: 'GSTIN', value: company.gstNumber || '—' },
                { label: 'PAN', value: company.panNumber || '—' },
                { label: 'Category', value: company.category || '—' },
                { label: 'Contact Person', value: company.contactPerson || '—' },
                { label: 'Status', value: company.isActive ? 'Active' : company.status || '—' },
                { label: 'Member Since', value: company.createdAt ? new Date(company.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
              ].map(f => (
                <div key={f.label} className="vprof-field">
                  <span className="vprof-field__label">{f.label}</span>
                  <span className="vprof-field__value">{f.value}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {company.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                    <MapPin size={14} style={{ color: 'var(--vendor-primary)', flexShrink: 0 }} /> {company.address}
                  </div>
                )}
                {company.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                    <Phone size={14} style={{ color: 'var(--vendor-primary)', flexShrink: 0 }} /> {company.phone}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                  <Mail size={14} style={{ color: 'var(--vendor-primary)', flexShrink: 0 }} /> {company.email}
                </div>
                {company.website && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                    <Globe size={14} style={{ color: 'var(--vendor-primary)', flexShrink: 0 }} /> {company.website}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Banking — Editable */}
          <div className="vprof-card">
            <div className="vprof-card__header">
              <CreditCard size={18} style={{ color: 'var(--vendor-primary)' }} />
              Banking Details
              {!editBank && (
                <button onClick={startEditBank} className="vprof-edit-btn" title="Edit banking details">
                  <Edit3 size={14} /> Edit
                </button>
              )}
            </div>
            <div className="vprof-card__body">
              {bankMsg && (
                <div className={`vprof-msg ${bankMsg.includes('updated') ? 'vprof-msg--ok' : 'vprof-msg--err'}`}>
                  {bankMsg.includes('updated') ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {bankMsg}
                </div>
              )}
              {!editBank ? (
                <>
                  {[
                    { label: 'Bank Name', value: banking.bankName || '—' },
                    { label: 'Branch', value: banking.bankBranch || '—' },
                    { label: 'Account Number', value: banking.bankAccountNumber || '—' },
                    { label: 'IFSC Code', value: banking.bankIfscCode || '—' },
                  ].map(f => (
                    <div key={f.label} className="vprof-field">
                      <span className="vprof-field__label">{f.label}</span>
                      <span className="vprof-field__value">{f.value}</span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="vprof-bank-form">
                  {[
                    { label: 'Bank Name', key: 'bankName' as const, ph: 'e.g. HDFC Bank' },
                    { label: 'Branch', key: 'bankBranch' as const, ph: 'e.g. Hinjewadi, Pune' },
                    { label: 'Account Number', key: 'bankAccountNumber' as const, ph: 'Full account number' },
                    { label: 'IFSC Code', key: 'bankIfscCode' as const, ph: 'e.g. HDFC0001234' },
                  ].map(f => (
                    <div key={f.key} className="vprof-bank-form__field">
                      <label>{f.label}</label>
                      <input
                        type="text"
                        value={bankForm[f.key]}
                        onChange={e => setBankForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.ph}
                      />
                    </div>
                  ))}
                  <div className="vprof-bank-form__actions">
                    <button className="vprof-bank-form__save" onClick={handleSaveBank} disabled={bankSaving}>
                      {bankSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                      {bankSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button className="vprof-bank-form__cancel" onClick={() => setEditBank(false)}>
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Compliance Documents ─────────── */}
        <div className="vprof-grid">
          <div className="vprof-card vprof-card--full">
            <div className="vprof-card__header">
              <FileCheck size={18} style={{ color: 'var(--vendor-primary)' }} />
              Compliance Documents
              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                <FileText size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                {documents.length} Document{documents.length !== 1 ? 's' : ''} Uploaded
              </span>
            </div>
            <div className="vprof-card__body">

              {/* ── Expiration Alert Banner ── */}
              {(() => {
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

                if (expiredCount === 0 && expiringSoonCount === 0) return null;

                return (
                  <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: expiredCount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', border: `1px solid ${expiredCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <AlertTriangle size={20} style={{ color: expiredCount > 0 ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                    <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                      <strong>Action Required: </strong>
                      {expiredCount > 0 && <span>{expiredCount} document{expiredCount > 1 ? 's have' : ' has'} <strong>expired</strong>. </span>}
                      {expiringSoonCount > 0 && <span>{expiringSoonCount} document{expiringSoonCount > 1 ? 's are' : ' is'} <strong>expiring within 30 days</strong>. </span>}
                      Please upload updated document copies to remain compliant and avoid portal restrictions.
                    </div>
                  </div>
                );
              })()}

              {/* ── Upload area ── */}
              {(() => {
                const reqDocs = (profile as any).requiredDocuments as Array<{ name: string; trackIssueDate?: boolean; trackExpirationDate?: boolean; trackIssuingAuthority?: boolean }> | undefined;
                const docOptions = (() => {
                  if (reqDocs && reqDocs.length > 0) {
                    return reqDocs.map(r => r.name);
                  }
                  const uploadedNames = Array.from(new Set(profile.documents.map(d => d.name || d.type).filter(Boolean)));
                  if (uploadedNames.length > 0) {
                    return uploadedNames;
                  }
                  return DOC_TYPES;
                })();

                const activeDocType = docOptions.includes(docType) ? docType : (docOptions[0] || '');
                const currentRule = reqDocs?.find(r => r.name.toLowerCase().trim() === activeDocType.toLowerCase().trim());

                const showIssueDate = currentRule ? currentRule.trackIssueDate !== false : true;
                const showExpDate = currentRule ? currentRule.trackExpirationDate !== false : true;
                const showAuthority = currentRule ? currentRule.trackIssuingAuthority !== false : true;

                return (
                  <div className="vprof-upload">
                    <div className="vprof-upload__row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      <select value={activeDocType} onChange={e => setDocType(e.target.value)} className="vprof-upload__select" style={{ flex: '1 1 200px' }}>
                        {docOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>

                      <label className="vprof-upload__file-btn">
                        <Paperclip size={14} /> Choose File
                        <input
                          type="file"
                          ref={fileRef}
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                          hidden
                          onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                        />
                      </label>

                      <button
                        className="vprof-upload__submit"
                        onClick={handleUploadDoc}
                        disabled={uploading || !selectedFile}
                      >
                        {uploading
                          ? <><Loader2 size={14} className="spin" /> Uploading…</>
                          : <><Upload size={14} /> Upload</>}
                      </button>
                    </div>

                    {/* ── Document Metadata Fields (Date of Issue, Expiration, Issuing Authority) ── */}
                    {(showIssueDate || showExpDate || showAuthority) && (
                      <div className="vprof-upload__metadata-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12, padding: 12, background: 'var(--surface-hover, rgba(255, 255, 255, 0.03))', borderRadius: 8, border: '1px solid var(--border)' }}>
                        {showIssueDate && (
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date of Issue</label>
                            <input
                              type="date"
                              value={issueDate}
                              onChange={e => setIssueDate(e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        )}
                        {showExpDate && (
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date of Expiration</label>
                            <input
                              type="date"
                              value={expirationDate}
                              onChange={e => setExpirationDate(e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        )}
                        {showAuthority && (
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Issuing Authority</label>
                            <input
                              type="text"
                              placeholder="e.g. Govt of UAE / Income Tax Dept"
                              value={issuingAuthority}
                              onChange={e => setIssuingAuthority(e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── File preview chip ── */}
                    {selectedFile && !uploading && (
                      <div className="vprof-upload__file-preview" style={{ marginTop: 8 }}>
                        <FileText size={14} className="vprof-upload__file-preview-icon" />
                        <span className="vprof-upload__file-preview-name">{selectedFile.name}</span>
                        <span className="vprof-upload__file-preview-size">{formatBytes(selectedFile.size)}</span>
                        <button
                          className="vprof-upload__file-preview-clear"
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileRef.current) fileRef.current.value = '';
                          }}
                          title="Remove selected file"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}

                    {uploadMsg && (
                      <div className={`vprof-msg ${uploadMsg.includes('uploaded') ? 'vprof-msg--ok' : 'vprof-msg--err'}`} style={{ marginTop: 8 }}>
                        {uploadMsg.includes('uploaded') ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {uploadMsg}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Document list with Expiration Alert Badges */}
              {documents.length > 0 ? documents.map(doc => {
                const docAny = doc as any;
                const expDays = docAny.expirationDate ? Math.ceil((new Date(docAny.expirationDate).getTime() - Date.now()) / (1000 * 3600 * 24)) : null;
                const isExpiringSoon = expDays !== null && expDays > 0 && expDays <= 30;
                const isExpired = expDays !== null && expDays <= 0;

                return (
                  <div key={doc.id} className="vprof-doc" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8 }}>
                    <div className="vprof-doc__left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <FileText size={18} className="vprof-doc__icon" style={{ color: isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : 'var(--vendor-primary)' }} />
                      <div>
                        <div className="vprof-doc__name" style={{ fontWeight: 600 }}>{doc.name}</div>
                        <div className="vprof-doc__date" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {doc.type} · Uploaded: {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {docAny.issueDate && ` · Issued: ${new Date(docAny.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                          {docAny.expirationDate && ` · Expires: ${new Date(docAny.expirationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                          {docAny.issuingAuthority && ` · Authority: ${docAny.issuingAuthority}`}
                        </div>
                      </div>
                    </div>

                    {/* Expiration Alert Badge */}
                    <div>
                      {isExpired ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                          <AlertTriangle size={12} /> Expired ({Math.abs(expDays!)}d ago)
                        </span>
                      ) : isExpiringSoon ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                          <AlertTriangle size={12} /> Alert: Expires in {expDays}d
                        </span>
                      ) : docAny.expirationDate ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                          <CheckCircle2 size={12} /> Valid ({expDays}d left)
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                          <CheckCircle2 size={12} /> Valid
                        </span>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
                  No documents uploaded yet. Upload your first document above.
                </div>
              )}
            </div>
          </div>
        </div>



        {/* ── Change Password ─────────────── */}
        <div className="vprof-grid">
          <div className="vprof-card vprof-card--full">
            <div className="vprof-card__header">
              <Lock size={18} style={{ color: 'var(--vendor-primary)' }} />
              Portal Password
            </div>
            <div className="vprof-card__body">
              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)' }}>
                Signed in as <strong>{user?.email}</strong>. Change your portal password below.
              </p>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Current password</label>
                <input type={showPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                <label style={{ fontSize: 13, fontWeight: 600 }}>New password (min 8 characters)</label>
                <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                <label style={{ fontSize: 13, fontWeight: 600 }}>Confirm new password</label>
                <input type={showPw ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setShowPw(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />} {showPw ? 'Hide' : 'Show'}
                  </button>
                  <button type="submit" disabled={pwLoading} style={{ padding: '10px 20px', background: 'var(--vendor-primary)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: pwLoading ? 'wait' : 'pointer' }}>
                    {pwLoading ? 'Updating…' : 'Update password'}
                  </button>
                </div>
                {pwMsg && <p style={{ margin: 0, fontSize: 14, color: pwMsg.includes('success') ? '#059669' : '#dc2626' }}>{pwMsg}</p>}
              </form>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}