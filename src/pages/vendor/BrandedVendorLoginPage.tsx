import { useState, useEffect, useLayoutEffect, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { applyFavicon, applyTitle } from '../../context/BrandingContext';
import { Eye, EyeOff, AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { PORTAL_NAMES } from '../../config/portalNames';
import { vendorPortalService, type CompanyBranding } from '../../services/vendorPortalService';
import { getTenantCompanyCode, setTenantCompanyCode } from '../../utils/tenantResolver';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

function getCachedTenantBranding(code: string): CompanyBranding | null {
  if (!code) return null;
  try {
    const raw = localStorage.getItem(`branding_cache_${code.toUpperCase()}`);
    if (raw) return JSON.parse(raw) as CompanyBranding;
  } catch {
    // Ignore cache error
  }
  return null;
}

function setCachedTenantBranding(code: string, branding: CompanyBranding): void {
  if (!code) return;
  try {
    localStorage.setItem(`branding_cache_${code.toUpperCase()}`, JSON.stringify(branding));
  } catch {
    // Ignore cache error
  }
}

export const BrandedVendorLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { companyCode: routeCompanyCode } = useParams<{ companyCode?: string }>();
  const [searchParams] = useSearchParams();

  const { vendorLogin } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // Resolve initial company code synchronously
  const resolvedCode = (
    routeCompanyCode?.toUpperCase() ||
    searchParams.get('company')?.toUpperCase() ||
    getTenantCompanyCode() ||
    ''
  ).trim().toUpperCase();

  const [companyCodeState, setCompanyCodeState] = useState<string>(resolvedCode);
  const [tenantBranding, setTenantBranding] = useState<CompanyBranding | null>(() =>
    getCachedTenantBranding(resolvedCode)
  );

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordSetSuccess = searchParams.get('passwordSet') === '1';

  // Synchronous title and favicon update BEFORE render to prevent master portal flash
  useLayoutEffect(() => {
    const code = resolvedCode || companyCodeState;
    if (code) {
      const activeName = tenantBranding?.companyName || `${code} Portal`;
      applyTitle(`${activeName} — Vendor Portal`);
      if (tenantBranding?.logoUrl) {
        applyFavicon(tenantBranding.logoUrl, tenantBranding.logoUrl);
      }
    }
  }, [resolvedCode, companyCodeState, tenantBranding]);

  useEffect(() => {
    let code = resolvedCode || getTenantCompanyCode() || '';
    if (code) {
      setCompanyCodeState(code);
      setTenantCompanyCode(code);

      // Async fetch fresh branding and cache locally for zero-flash future loads
      vendorPortalService
        .getCompanyBranding(code)
        .then((b) => {
          setTenantBranding(b);
          setCachedTenantBranding(code, b);
          if (b.logoUrl) {
            applyFavicon(b.logoUrl, b.logoUrl);
          }
          if (b.companyName) {
            applyTitle(`${b.companyName} — Vendor Portal`);
          }
        })
        .catch(() => {
          const fallback = {
            companyCode: code,
            companyName: `${code} Supplier Portal`,
          };
          setTenantBranding(fallback);
          applyTitle(`${code} Supplier Portal — Vendor Portal`);
        });
    }
  }, [routeCompanyCode, searchParams, resolvedCode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    setIsSubmitting(true);
    try {
      if (companyCodeState) {
        setTenantCompanyCode(companyCodeState);
      }
      await vendorLogin({ username: username.trim(), password });
      const targetPath = companyCodeState ? `/v/${companyCodeState.toLowerCase()}/dashboard` : '/vendor/dashboard';
      navigate(targetPath, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCode = companyCodeState || resolvedCode || 'VENDOR';
  const companyName = tenantBranding?.companyName || (activeCode !== 'VENDOR' ? `${activeCode} Supplier Portal` : 'Supplier Portal');
  const logoUrl = tenantBranding?.logoUrl || null;
  const supportEmail = tenantBranding?.supportEmail || null;

  return (
    <AuthLayout
      companyName={companyName}
      logoUrl={logoUrl}
      tagline="Supplier Collaboration & Order Management"
      features={[
        'Respond to RFQs & submit quotations',
        'Track purchase orders & invoices',
        'Manage your company profile',
        'Real-time notifications & updates',
      ]}
      supportEmail={supportEmail}
      portalLabel={PORTAL_NAMES.secondary}
      title="Supplier sign in"
      description="Enter your vendor credentials to access the portal."
      isDark={isDark}
      onThemeToggle={toggleTheme}
    >
      {passwordSetSuccess && !error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-[14px] leading-5 text-emerald-700 dark:text-emerald-300" role="status">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>Password set successfully. Please sign in with your new password.</span>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[14px] leading-5 text-destructive" role="alert">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <label className="text-[14px] font-semibold text-foreground" htmlFor="vlogin-email">
            Email <span className="text-destructive">*</span>
          </label>
          <Input
            id="vlogin-email"
            type="email"
            placeholder="vendor@company.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="text-[14px] font-semibold text-foreground" htmlFor="vlogin-password">
            Password <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <Input
              id="vlogin-password"
              className="pr-12"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={isSubmitting}
              required
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

        <Button type="submit" size="lg" disabled={isSubmitting} id="vlogin-submit-btn" className="mt-1 w-full">
          {isSubmitting && <LoaderCircle size={17} className="animate-spin" />}
          {isSubmitting ? 'Signing in…' : 'Sign In to Portal'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default BrandedVendorLoginPage;
