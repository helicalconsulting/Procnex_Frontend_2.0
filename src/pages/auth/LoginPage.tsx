import { useState, useEffect, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useBranding } from '../../context/BrandingContext';
import { Eye, EyeOff, AlertCircle, LoaderCircle, Building2 } from 'lucide-react';
import { isVendor } from '../../utils/rbac';
import { getVendorPath, getEmployeeCompanyCode } from '../../utils/tenantResolver';
import { getFirstAllowedPath } from '../../utils/permissions';
import { PORTAL_NAMES } from '../../config/portalNames';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { companySettingsService, type Branch } from '../../services/companySettingsService';
import { getActiveCompanyCode } from '../../lib/branding';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, roles, permissions } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { companyName, logoUrl, loginText, supportEmail, primaryPortalName } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return localStorage.getItem('heliflow_active_branch_id') || '';
  });
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeCompany = getEmployeeCompanyCode() || getActiveCompanyCode() || 'HFL';

  useEffect(() => {
    let cancelled = false;
    setLoadingBranches(true);
    companySettingsService
      .listBranches(false, activeCompany)
      .then((list) => {
        if (cancelled) return;
        const activeList = (list || []).filter((b) => b.isActive !== false);
        setBranches(activeList);
        if (activeList.length > 0) {
          const savedBranchId = localStorage.getItem('heliflow_active_branch_id');
          const matched = activeList.find((b) => b.id === savedBranchId);
          if (matched) {
            setSelectedBranchId(matched.id);
          } else {
            const defaultBranch = activeList.find((b) => b.isDefault) || activeList[0];
            setSelectedBranchId(defaultBranch.id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCompany]);

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
      if (selectedBranchId) {
        localStorage.setItem('heliflow_active_branch_id', selectedBranchId);
      }
      await login({
        username: username.trim(),
        password,
        companyCode: activeCompany || undefined,
        branchId: selectedBranchId || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      companyName={companyName}
      logoUrl={logoUrl}
      loginText={loginText}
      tagline="A focused workspace for sourcing, approvals, contracts, vendors, and payments."
      features={['End-to-end RFQ lifecycle management', 'Clear quotation comparison and scoring', 'Multi-level approval workflows', 'Vendor collaboration and performance tracking']}
      supportEmail={supportEmail}
      portalLabel={primaryPortalName}
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
          <label className="text-[14px] font-semibold text-foreground" htmlFor="login-username">Username</label>
          <Input id="login-username" type="text" placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus disabled={isSubmitting} required />
        </div>

        <div className="grid gap-2">
          <label className="text-[14px] font-semibold text-foreground" htmlFor="login-password">Password</label>
          <div className="relative">
            <Input id="login-password" className="pr-12" type={showPassword ? 'text' : 'password'} placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={isSubmitting} required />
            <button type="button" className="absolute right-0 top-0 inline-flex size-12 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Branch Selection Dropdown */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[14px] font-semibold text-foreground flex items-center gap-1.5" htmlFor="login-branch">
              <Building2 size={15} className="text-muted-foreground" />
              <span>Branch</span>
              {branches.length > 0 && <span className="text-destructive">*</span>}
            </label>
            {loadingBranches && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <LoaderCircle size={12} className="animate-spin" /> Loading branches...
              </span>
            )}
          </div>
          <select
            id="login-branch"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            disabled={isSubmitting || loadingBranches || branches.length === 0}
            className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            required={branches.length > 0}
          >
            {branches.length === 0 ? (
              <option value="">{loadingBranches ? 'Loading branches…' : 'Main Branch / Head Office'}</option>
            ) : (
              branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code}){b.city ? ` • ${b.city}` : ''}{b.isDefault ? ' [Head Office]' : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <Button type="submit" size="lg" disabled={isSubmitting} id="login-submit-btn" className="mt-1 w-full">
          {isSubmitting && <LoaderCircle size={17} className="animate-spin" />}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}