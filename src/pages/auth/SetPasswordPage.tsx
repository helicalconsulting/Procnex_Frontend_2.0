import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { API_BASE } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useBranding } from '../../context/BrandingContext';
import { PORTAL_NAMES } from '../../config/portalNames';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

interface SetupValidation {
  valid: boolean;
  email: string;
  vendorName: string;
  hasExistingPassword: boolean;
}

async function fetchSetupValidation(token: string): Promise<SetupValidation> {
  const res = await fetch(
    `${API_BASE}/vendors/password-setup/validate?token=${encodeURIComponent(token)}`
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Invalid or expired link');
  return (json.data ?? json) as SetupValidation;
}

async function submitPasswordSetup(
  token: string,
  password: string,
  confirmPassword: string
): Promise<{ token: string; vendor: { id: number; name: string; email: string } }> {
  const res = await fetch(`${API_BASE}/vendors/password-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, confirmPassword }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to set password');
  return (json.data ?? json) as { token: string; vendor: { id: number; name: string; email: string } };
}

export default function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, roles } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { companyName, logoUrl, supportEmail } = useBranding();
  const token = searchParams.get('token')?.trim() || '';

  const [validation, setValidation] = useState<SetupValidation | null>(null);
  const [validateError, setValidateError] = useState('');
  const [validating, setValidating] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidateError('Missing setup link. Open the link from your approval email.');
      setValidating(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSetupValidation(token);
        if (!cancelled) setValidation(data);
      } catch (err) {
        if (!cancelled) setValidateError(err instanceof Error ? err.message : 'Invalid link');
      } finally {
        if (!cancelled) setValidating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setIsSubmitting(true);
    try {
      await submitPasswordSetup(token, password, confirmPassword);
      navigate('/vendor/login?passwordSet=1', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthenticated && roles.includes('Vendor')) {
    navigate('/vendor/dashboard', { replace: true });
    return null;
  }

  return (
    <AuthLayout
      companyName={companyName}
      logoUrl={logoUrl}
      tagline="Create your secure portal password"
      features={[
        'End-to-end RFQ lifecycle management',
        'Direct supplier collaboration & bidding',
        'Order tracking and electronic invoicing',
        'Secure multi-factor authentication & portal encryption',
      ]}
      supportEmail={supportEmail}
      portalLabel={PORTAL_NAMES.secondary}
      title={validation?.hasExistingPassword ? 'Reset Your Password' : 'Set Your Password'}
      description="Choose a password only you know. Your procurement team cannot see it."
      isDark={isDark}
      onThemeToggle={toggleTheme}
    >
      {validating && (
        <div className="mb-5 text-sm text-muted-foreground">Verifying your link…</div>
      )}

      {validateError && !validating && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[14px] leading-5 text-destructive" role="alert">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{validateError}</span>
        </div>
      )}

      {validation && !validating && (
        <>
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-[14px] leading-5 text-emerald-700 dark:text-emerald-300" role="status">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
            <div>
              <span>{validation.hasExistingPassword ? 'Resetting password for ' : 'Welcome, '}</span>
              <strong>{validation.vendorName}</strong>
              <div className="text-xs opacity-85">{validation.email}</div>
            </div>
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <label className="text-[14px] font-semibold text-foreground" htmlFor="password">
                New Password <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={isSubmitting}
                  className="pr-12"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 inline-flex size-12 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-[14px] font-semibold text-foreground" htmlFor="confirm">
                Confirm Password <span className="text-destructive">*</span>
              </label>
              <Input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[14px] leading-5 text-destructive" role="alert">
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 w-full">
              {isSubmitting && <LoaderCircle size={17} className="animate-spin" />}
              {isSubmitting ? 'Saving…' : 'Set Password'}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}