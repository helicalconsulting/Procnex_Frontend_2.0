import { useState, useEffect, useLayoutEffect, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { applyFavicon, applyTitle } from '../../context/BrandingContext';
import { Eye, EyeOff, AlertCircle, LoaderCircle } from 'lucide-react';
import { PORTAL_NAMES } from '../../config/portalNames';
import { vendorPortalService, type CompanyBranding } from '../../services/vendorPortalService';
import { setEmployeeCompanyCode, getEmployeeCompanyCode } from '../../utils/tenantResolver';
import { getFirstAllowedPath } from '../../utils/permissions';
import { isVendor } from '../../utils/rbac';
import { getVendorPath } from '../../utils/tenantResolver';
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

export const BrandedEmployeeLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { companyCode: routeCompanyCode } = useParams<{ companyCode?: string }>();
  const [searchParams] = useSearchParams();

  const { login, isAuthenticated, isLoading, roles, permissions } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // Resolve initial company code synchronously
  const resolvedCode = (
    routeCompanyCode?.toUpperCase() ||
    searchParams.get('company')?.toUpperCase() ||
    getEmployeeCompanyCode() ||
    ''
  ).trim().toUpperCase();

  const [companyCodeState, setCompanyCodeState] = useState<string>(resolvedCode);
  const [tenantBranding, setTenantBranding] = useState<CompanyBranding | null>(() =>
    getCachedTenantBranding(resolvedCode)
  );
  const [isInvalidCode, setIsInvalidCode] = useState(false);
  const [invalidCodeError, setInvalidCodeError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Synchronous title and favicon update BEFORE render to prevent master portal flash
  useLayoutEffect(() => {
    const code = resolvedCode || companyCodeState;
    if (code) {
      const activeName = tenantBranding?.companyName || `${code} Portal`;
      applyTitle(`${activeName} — Procurement Workspace`);
      if (tenantBranding?.logoUrl) {
        applyFavicon(tenantBranding.logoUrl, tenantBranding.logoUrl);
      }
    }
  }, [resolvedCode, companyCodeState, tenantBranding]);

  useEffect(() => {
    const code = resolvedCode || getEmployeeCompanyCode() || '';
    if (code) {
      setCompanyCodeState(code);
      setEmployeeCompanyCode(code);

      // Async fetch fresh branding and validate company code registration
      vendorPortalService
        .getCompanyBranding(code)
        .then((b) => {
          setIsInvalidCode(false);
          setTenantBranding(b);
          setCachedTenantBranding(code, b);
          if (b.logoUrl) {
            applyFavicon(b.logoUrl, b.logoUrl);
          }
          if (b.companyName) {
            applyTitle(`${b.companyName} — Procurement Workspace`);
          }
        })
        .catch((err: any) => {
          const msg = err?.message || `Company code '${code}' is not registered.`;
          setIsInvalidCode(true);
          setInvalidCodeError(msg);
        });
    }
  }, [routeCompanyCode, searchParams, resolvedCode]);

  if (!isLoading && isAuthenticated) {
    const landing = isVendor(roles)
      ? getVendorPath('/vendor/dashboard')
      : getFirstAllowedPath(permissions);
    return <Navigate to={landing} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setIsSubmitting(true);
    try {
      const activeCode = (companyCodeState || resolvedCode || '').trim().toUpperCase();
      if (activeCode) {
        setEmployeeCompanyCode(activeCode);
      }
      await login({
        username: username.trim(),
        password,
        companyCode: activeCode || undefined,
      });
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInvalidCode) {
    return (
      <AuthLayout
        companyName="ProcNex Enterprise"
        tagline="Procurement Automation & Collaboration Platform"
        features={[]}
        portalLabel="Invalid URL"
        title="Invalid Organization Code"
        description={`Organization '${companyCodeState || resolvedCode}' is not registered in ProcNex.`}
        isDark={isDark}
        onThemeToggle={toggleTheme}
      >
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Invalid Organization URL</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {invalidCodeError || `Company code '${companyCodeState || resolvedCode}' is not registered.`}
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <Button variant="default" onClick={() => navigate('/helicalconsulting')} className="w-full">
              Go to Home Page
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const activeCode = companyCodeState || resolvedCode || 'EMPLOYEE';
  const companyName = tenantBranding?.companyName || (activeCode !== 'EMPLOYEE' ? `${activeCode} Procurement Workspace` : 'Procurement Workspace');
  const logoUrl = tenantBranding?.logoUrl || null;
  const supportEmail = tenantBranding?.supportEmail || null;

  return (
    <AuthLayout
      companyName={companyName}
      logoUrl={logoUrl}
      tagline="A focused workspace for sourcing, approvals, contracts, vendors, and payments."
      features={[
        'End-to-end RFQ lifecycle management',
        'Clear quotation comparison and scoring',
        'Multi-level approval workflows',
        'Vendor collaboration and performance tracking',
      ]}
      supportEmail={supportEmail}
      portalLabel={PORTAL_NAMES.primary || 'Employee'}
      title="Welcome back"
      description="Sign in to manage your procurement workspace."
      isDark={isDark}
      onThemeToggle={toggleTheme}
    >
      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[14px] leading-5 text-destructive" role="alert">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <label className="text-[14px] font-semibold text-foreground" htmlFor="elogin-username">
            Username / Email <span className="text-destructive">*</span>
          </label>
          <Input
            id="elogin-username"
            type="text"
            placeholder="Enter username or email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="text-[14px] font-semibold text-foreground" htmlFor="elogin-password">
            Password <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <Input
              id="elogin-password"
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

        <Button type="submit" size="lg" disabled={isSubmitting} id="elogin-submit-btn" className="mt-1 w-full">
          {isSubmitting && <LoaderCircle size={17} className="animate-spin" />}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default BrandedEmployeeLoginPage;
