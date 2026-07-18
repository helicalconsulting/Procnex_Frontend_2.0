import { useState, useCallback, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { profileService, type UserProfileDocument } from '../../services/profileService';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { authService } from '../../services/authService';
import {
  User,
  Building2,
  Shield,
  FileText,
  Lock,
  Mail,
  Phone,
  Calendar,
  Loader2,
  Edit3,
  Save,
  X,
  Eye,
  ExternalLink,
  BadgeCheck,
} from 'lucide-react';
import './MyProfilePage.css';

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d?: string | null): string {
  if (!d) return 'Never';
  const date = new Date(d);
  return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MyProfilePage() {
  const { user, roles } = useAuth();
  const { data: documents, loading: docsLoading } = useServiceData(
    () => profileService.getDocuments(),
    [] as UserProfileDocument[]
  );

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(user?.phone || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const startEdit = useCallback(() => {
    setPhone(user?.phone || '');
    setDepartment(user?.department || '');
    setProfileMsg('');
    setEditing(true);
  }, [user]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setProfileMsg('');
  }, []);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const updated = await profileService.updateProfile({
        phone: phone.trim() || undefined,
        department: department.trim() || undefined,
      });
      authService.saveSession(updated);
      setProfileMsg('Profile updated successfully.');
      setEditing(false);
      window.location.reload();
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    if (newPassword.length < 8) { setPwMsg('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwMsg('New passwords do not match.'); return; }
    setPwLoading(true);
    try {
      await profileService.changePassword(currentPassword, newPassword, confirmPassword);
      setPwMsg('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="sap-profile__loading">
        <Loader2 size={22} className="spin" /> Loading profile…
      </div>
    );
  }

  const displayRoles = roles.filter((r) => r !== 'Vendor');

  return (
    <div className="sap-profile">
      {/* SAP Object Page Header */}
      <header className="sap-profile__hero">
        <div className="sap-profile__avatar">{initials(user.fullName)}</div>
        <div className="sap-profile__hero-body">
          <h1>{user.fullName}</h1>
          <p className="sap-profile__hero-sub">@{user.username} · {user.email}</p>
          <div className="sap-profile__badges">
            {displayRoles.map((role) => (
              <span key={role} className="sap-profile__badge">
                <Shield size={11} /> {role}
              </span>
            ))}
            <span className={`sap-profile__badge ${user.isActive ? 'sap-profile__badge--active' : ''}`}>
              <BadgeCheck size={11} /> {user.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <div className="sap-profile__hero-meta">
          <span>Company: {user.companyCode}</span>
          <span>Member since {formatDate(user.createdAt)}</span>
          <span>Last login: {formatDateTime(user.lastLoginAt)}</span>
        </div>
      </header>

      <div className="sap-profile__grid">
        {/* Personal Information */}
        <section className="sap-panel">
          <div className="sap-panel__header">
            <h2 className="sap-panel__title"><User size={16} /> Personal Information</h2>
            {!editing ? (
              <button type="button" className="sap-panel__action" onClick={startEdit}>
                <Edit3 size={13} /> Edit
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="sap-panel__action" onClick={cancelEdit}>
                  <X size={13} /> Cancel
                </button>
                <button type="button" className="sap-panel__action" onClick={handleSaveProfile} disabled={profileSaving}>
                  <Save size={13} /> {profileSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
          {profileMsg && (
            <MessageStrip
              type={inferMessageType(profileMsg)}
              compact
              onClose={() => setProfileMsg('')}
              autoHideMs={5000}
              style={{ margin: '0 20px 12px' }}
            >
              {profileMsg}
            </MessageStrip>
          )}
          <div className="sap-panel__body">
            <div className="sap-form-row">
              <span className="sap-form-row__label">Full Name</span>
              <span className="sap-form-row__value">{user.fullName}</span>
            </div>
            <div className="sap-form-row">
              <span className="sap-form-row__label">Username</span>
              <span className="sap-form-row__value">@{user.username}</span>
            </div>
            <div className="sap-form-row">
              <span className="sap-form-row__label">Email</span>
              <span className="sap-form-row__value"><Mail size={13} style={{ verticalAlign: -2, marginRight: 6, opacity: 0.5 }} />{user.email}</span>
            </div>
            <div className="sap-form-row">
              <span className="sap-form-row__label">Phone</span>
              {editing ? (
                <input className="sap-form-row__input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
              ) : (
                <span className="sap-form-row__value"><Phone size={13} style={{ verticalAlign: -2, marginRight: 6, opacity: 0.5 }} />{user.phone || '—'}</span>
              )}
            </div>
          </div>
        </section>

        {/* Organization & Access */}
        <section className="sap-panel">
          <div className="sap-panel__header">
            <h2 className="sap-panel__title"><Building2 size={16} /> Organization & Access</h2>
          </div>
          <div className="sap-panel__body">
            <div className="sap-form-row">
              <span className="sap-form-row__label">Company Code</span>
              <span className="sap-form-row__value">{user.companyCode}</span>
            </div>
            <div className="sap-form-row">
              <span className="sap-form-row__label">Department</span>
              {editing ? (
                <input className="sap-form-row__input" type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
              ) : (
                <span className="sap-form-row__value">{user.department || '—'}</span>
              )}
            </div>
            <div className="sap-form-row">
              <span className="sap-form-row__label">Assigned Roles</span>
              <span className="sap-form-row__value">{displayRoles.join(', ') || '—'}</span>
            </div>
            <div className="sap-form-row">
              <span className="sap-form-row__label">Account Status</span>
              <span className="sap-form-row__value" style={{ color: user.isActive ? 'var(--success-500)' : 'var(--danger-500)' }}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="sap-form-row">
              <span className="sap-form-row__label">Created On</span>
              <span className="sap-form-row__value"><Calendar size={13} style={{ verticalAlign: -2, marginRight: 6, opacity: 0.5 }} />{formatDate(user.createdAt)}</span>
            </div>
          </div>
        </section>

        {/* Onboarding Documents */}
        <section className="sap-panel sap-profile__grid--full">
          <div className="sap-panel__header">
            <h2 className="sap-panel__title"><FileText size={16} /> Onboarding Documents</h2>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {documents.length} document{documents.length !== 1 ? 's' : ''} on file
            </span>
          </div>
          <div className="sap-panel__body">
            {docsLoading ? (
              <div className="sap-doc-empty"><Loader2 size={18} className="spin" /> Loading documents…</div>
            ) : documents.length === 0 ? (
              <div className="sap-doc-empty">No onboarding documents uploaded for this account.</div>
            ) : (
              <div className="sap-doc-list">
                {documents.map((doc) => (
                  <div key={doc.id} className="sap-doc-item">
                    <div className="sap-doc-item__icon"><FileText size={18} /></div>
                    <div className="sap-doc-item__info">
                      <div className="sap-doc-item__type">{doc.documentType}</div>
                      <div className="sap-doc-item__name">{doc.originalName} · {formatFileSize(doc.fileSize)}</div>
                    </div>
                    <span className="sap-doc-item__date">{formatDate(doc.uploadedAt)}</span>
                    <a
                      href={doc.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="sap-doc-item__link"
                    >
                      <Eye size={13} /> View <ExternalLink size={11} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Security */}
        <section className="sap-panel sap-profile__grid--full">
          <div className="sap-panel__header">
            <h2 className="sap-panel__title"><Lock size={16} /> Security</h2>
          </div>
          {pwMsg && (
            <MessageStrip
              type={inferMessageType(pwMsg)}
              compact
              onClose={() => setPwMsg('')}
              autoHideMs={5000}
              style={{ margin: '0 20px 12px' }}
            >
              {pwMsg}
            </MessageStrip>
          )}
          <form className="sap-pw-form" onSubmit={handleChangePassword}>
            <div className="sap-profile__grid" style={{ gap: 14 }}>
              <div className="sap-pw-field">
                <label>Current Password</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
              </div>
              <div className="sap-pw-field">
                <label>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="Min 8 characters" required />
              </div>
              <div className="sap-pw-field">
                <label>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
              </div>
            </div>
            <div className="sap-pw-actions">
              <button type="submit" className="sap-btn-primary" disabled={pwLoading}>
                {pwLoading ? <><Loader2 size={14} className="spin" /> Updating…</> : <><Lock size={14} /> Change Password</>}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
