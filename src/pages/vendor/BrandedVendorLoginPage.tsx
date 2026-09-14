import { useState, useEffect, useLayoutEffect, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { applyFavicon, applyTitle } from '../../context/BrandingContext';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Sun, Moon } from 'lucide-react';
import { PORTAL_NAMES } from '../../config/portalNames';
import { vendorPortalService, type CompanyBranding } from '../../services/vendorPortalService';
import { getTenantCompanyCode, setTenantCompanyCode } from '../../utils/tenantResolver';
import heliflowLogo from '../../assets/heliflow.png';
import '../auth/LoginPage.css';

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

  // Stealth fallback — NEVER show Procnex or Heliflow default branding on tenant URLs
  const activeCode = companyCodeState || resolvedCode || 'VENDOR';
  const companyName = tenantBranding?.companyName || (activeCode !== 'VENDOR' ? `${activeCode} Supplier Portal` : 'Supplier Portal');
  const logoUrl = tenantBranding?.logoUrl || null;
  const supportEmail = tenantBranding?.supportEmail || null;
  const primaryColor = tenantBranding?.primaryColor || '#0a6ed1';

  return (
    <div
      className="sap-login"
      style={primaryColor ? ({ '--primary-500': primaryColor, '--primary-600': primaryColor } as React.CSSProperties) : undefined}
    >
      {/* ── Left Panel: Branding ── */}
      <div className="sap-login__brand-panel">
        <div className="sap-login__brand-content">
          <div className="sap-login__logo">
            <img
              src={logoUrl || heliflowLogo}
              alt={companyName}
              className="sap-login__logo-icon"
              style={{ width: '48px', height: '48px', objectFit: 'contain' }}
            />
          </div>

          <h1 className="sap-login__brand-title">{companyName}</h1>
          <p className="sap-login__brand-tagline">
            Supplier Collaboration & Order Management
          </p>

          <div className="sap-login__brand-divider" />

          <ul className="sap-login__features">
            <li>
              <span className="sap-login__feature-icon">&loz;</span>
              Respond to RFQs & submit quotations
            </li>
            <li>
              <span className="sap-login__feature-icon">&loz;</span>
              Track purchase orders & invoices
            </li>
            <li>
              <span className="sap-login__feature-icon">&loz;</span>
              Manage your company profile
            </li>
            <li>
              <span className="sap-login__feature-icon">&loz;</span>
              Real-time notifications & updates
            </li>
          </ul>
        </div>

        <div className="sap-login__brand-footer">
          <span>
            &copy; {new Date().getFullYear()} {supportEmail ? `${companyName} · ${supportEmail}` : `${companyName}`}
          </span>
        </div>
      </div>

      {/* ── Right Panel: Login Form ── */}
      <div className="sap-login__form-panel">
        {/* Theme toggle */}
        <button
          className="sap-login__theme-toggle"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="sap-login__form-container">
          {/* Mobile logo */}
          <div className="sap-login__mobile-logo">
            <img src={logoUrl || heliflowLogo} alt={companyName} className="sap-login__mobile-logo-icon" />
            <span className="sap-login__mobile-title">{companyName}</span>
          </div>

          <div className="sap-login__form-header">
            <h2 className="sap-login__form-title">
              {PORTAL_NAMES.secondary} Sign In
            </h2>
            <p className="sap-login__form-subtitle">
              Enter your vendor credentials to access the portal
            </p>
          </div>

          {/* Success message after password setup */}
          {passwordSetSuccess && !error && (
            <div className="sap-login__success" role="status">
              <CheckCircle2 size={16} />
              <span>Password set successfully. Please sign in with your new password.</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="sap-login__error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form className="sap-login__form" onSubmit={handleSubmit}>
            <div className="sap-field">
              <label className="sap-field__label" htmlFor="vlogin-email">
                Email <span className="sap-field__required">*</span>
              </label>
              <input
                id="vlogin-email"
                className="sap-field__input"
                type="email"
                placeholder="vendor@company.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            <div className="sap-field">
              <label className="sap-field__label" htmlFor="vlogin-password">
                Password <span className="sap-field__required">*</span>
              </label>
              <div className="sap-field__input-wrap">
                <input
                  id="vlogin-password"
                  className="sap-field__input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="sap-field__eye"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="sap-login__submit"
              disabled={isSubmitting}
              id="vlogin-submit-btn"
            >
              {isSubmitting ? <span className="sap-login__spinner" /> : 'Sign In to Portal'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BrandedVendorLoginPage;
