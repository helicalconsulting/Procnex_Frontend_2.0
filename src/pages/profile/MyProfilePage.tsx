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
  Download,
  PenTool,
  FileSignature,
  Star,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signatureService, type SavedSignature } from '../../services/signatureService';
import { downloadDocument } from '../../utils/download';
import { PageFrame, PageLead } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

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
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { data: documents, loading: docsLoading } = useServiceData(
    () => profileService.getDocuments(),
    [] as UserProfileDocument[]
  );
  const { data: savedSignatures, loading: sigsLoading } = useServiceData(
    () => signatureService.list(),
    [] as SavedSignature[]
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
      <PageFrame className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-5 animate-spin text-primary" /> Loading profile…
        </div>
      </PageFrame>
    );
  }

  const displayRoles = roles.filter((r) => r !== 'Vendor');

  return (
    <PageFrame>
      {/* Hero Header */}
      <Card className="mb-6 overflow-hidden p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary/10 font-bold text-2xl text-primary ring-1 ring-primary/20">
              {initials(user.fullName)}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">{user.fullName}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">@{user.username} · {user.email}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {displayRoles.map((role) => (
                  <Badge key={role} variant="secondary" className="gap-1 text-[11px]">
                    <Shield className="size-3" /> {role}
                  </Badge>
                ))}
                <Badge variant={user.isActive ? 'default' : 'destructive'} className="gap-1 text-[11px]">
                  <BadgeCheck className="size-3" /> {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-border/60 pt-4 text-xs text-muted-foreground sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <span>Company Code: <strong className="text-foreground font-mono">{user.companyCode}</strong></span>
            <span>Member since: <strong className="text-foreground">{formatDate(user.createdAt)}</strong></span>
            <span>Last login: <strong className="text-foreground">{formatDateTime(user.lastLoginAt)}</strong></span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Personal Information */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <User className="size-4 text-primary" /> Personal Information
            </h2>
            {!editing ? (
              <Button variant="ghost" size="sm" onClick={startEdit} className="h-8 gap-1.5 text-xs">
                <Edit3 className="size-3.5" /> Edit
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-8 gap-1 text-xs">
                  <X className="size-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving} className="h-8 gap-1 text-xs">
                  <Save className="size-3.5" /> {profileSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}
          </div>

          {profileMsg && (
            <MessageStrip
              type={inferMessageType(profileMsg)}
              compact
              onClose={() => setProfileMsg('')}
              autoHideMs={5000}
              className="mb-4"
            >
              {profileMsg}
            </MessageStrip>
          )}

          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Full Name</span>
              <span className="font-semibold text-foreground">{user.fullName}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Username</span>
              <span className="font-mono text-foreground">@{user.username}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Email</span>
              <span className="flex items-center gap-1.5 text-foreground">
                <Mail className="size-3.5 text-muted-foreground" /> {user.email}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Phone</span>
              {editing ? (
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="h-8 text-xs max-w-[200px]"
                />
              ) : (
                <span className="flex items-center gap-1.5 text-foreground">
                  <Phone className="size-3.5 text-muted-foreground" /> {user.phone || '—'}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Organization & Access */}
        <Card className="p-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="size-4 text-primary" /> Organization & Access
            </h2>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Company Code</span>
              <span className="font-mono font-semibold text-foreground">{user.companyCode}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Department</span>
              {editing ? (
                <Input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Department"
                  className="h-8 text-xs max-w-[200px]"
                />
              ) : (
                <span className="font-medium text-foreground">{user.department || '—'}</span>
              )}
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Assigned Roles</span>
              <span className="font-medium text-foreground">{displayRoles.join(', ') || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Account Status</span>
              <Badge variant={user.isActive ? 'default' : 'destructive'} className="text-[11px]">
                {user.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/40">
              <span className="text-muted-foreground font-medium">Created On</span>
              <span className="flex items-center gap-1.5 text-foreground">
                <Calendar className="size-3.5 text-muted-foreground" /> {formatDate(user.createdAt)}
              </span>
            </div>
          </div>
        </Card>

        {/* Onboarding Documents */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-primary" /> Onboarding Documents
            </h2>
            <span className="text-xs text-muted-foreground">
              {documents.length} document{documents.length !== 1 ? 's' : ''} on file
            </span>
          </div>

          {docsLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin text-primary" /> Loading documents…
            </div>
          ) : documents.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No onboarding documents uploaded for this account.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {documents.map((doc) => (
                <div key={doc.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                      <FileText className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-foreground">{doc.documentType}</div>
                      <div className="text-[12px] text-muted-foreground">{doc.originalName} · {formatFileSize(doc.fileSize)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <Eye className="size-3.5" /> View <ExternalLink className="size-3" />
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => downloadDocument(doc.publicUrl, doc.originalName)}
                      >
                        <Download className="size-3.5" /> Download
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Digital E-Signatures */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <FileSignature className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Digital E-Signatures</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/signature')}
              className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
            >
              <PenTool className="size-3.5" /> Manage &amp; Draw Signatures
            </Button>
          </div>

          {sigsLoading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin text-primary" /> Loading saved signatures…
            </div>
          ) : savedSignatures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <PenTool className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-xs font-semibold text-foreground">No digital signatures saved</p>
              <p className="text-[12px] text-muted-foreground max-w-sm mt-0.5">
                Draw or upload your signature once so it can be dynamically applied with 1-click on contracts and official procurement documents.
              </p>
              <Button
                size="sm"
                onClick={() => navigate('/signature')}
                className="mt-3 h-8 gap-1.5 text-xs"
              >
                <FileSignature className="size-3.5" /> Capture Your Signature
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground mb-2">
                Your account has <strong>{savedSignatures.length}</strong> saved digital signature{savedSignatures.length > 1 ? 's' : ''}. Signatures are dynamically linked to your user profile for contract execution.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {savedSignatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="relative flex flex-col items-center justify-center p-3 rounded-xl border border-border/70 bg-surface-elevated/40 hover:border-primary/40 transition"
                  >
                    {sig.isDefault && (
                      <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        <Star className="size-2.5 fill-amber-500" /> Default
                      </Badge>
                    )}
                    <img
                      src={sig.dataUrl}
                      alt={sig.name}
                      className="max-h-14 max-w-full object-contain my-2"
                    />
                    <div className="text-xs font-semibold text-foreground">{sig.name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">
                      {sig.type} signature · {formatDate(sig.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Security */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lock className="size-4 text-primary" /> Security
            </h2>
          </div>

          {pwMsg && (
            <MessageStrip
              type={inferMessageType(pwMsg)}
              compact
              onClose={() => setPwMsg('')}
              autoHideMs={5000}
              className="mb-4"
            >
              {pwMsg}
            </MessageStrip>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Current Password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Min 8 characters"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={pwLoading}>
                {pwLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Updating…
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 size-4" /> Change Password
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </PageFrame>
  );
}
