import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useBranding } from '../../context/BrandingContext';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Sun, Moon } from 'lucide-react';
import { isVendor } from '../../utils/rbac';
import { PORTAL_NAMES } from '../../config/portalNames';
import heliflowLogo from '../../assets/heliflow.png';
import './LoginPage.css';

export default function VendorLoginPage() {
  const [searchParams] = useSearchParams();
  const { vendorLogin, isAuthenticated, isLoading, roles } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { companyName, logoUrl, loginText, supportEmail, primaryPortalName } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordSetSuccess = searchParams.get('passwordSet') === '1';

  if (!isLoading && isAuthenticated) {
    const landing = isVendor(roles)
      ? '/vendor/dashboard'
      : '/dashboard';
    return <Navigate to={landing} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    setIsSubmitting(true);
    try {
      await vendorLogin({ username: username.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sap-login">
      {/* ── Left Panel: Branding ── */}
      <div className="sap-login__brand-panel">
        <div className="sap-login__brand-content">
          <div className="sap-login__logo">
            <img src={logoUrl || heliflowLogo} alt={companyName} className="sap-login__logo-icon" />
          </div>

          <h1 className="sap-login__brand-title">{companyName} · {PORTAL_NAMES.secondary} Portal</h1>
          <p className="sap-login__brand-tagline">
            {loginText || 'Supplier Collaboration & Order Management'}
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
          <span>&copy; {new Date().getFullYear()} {supportEmail ? `${companyName} · ${supportEmail}` : `${companyName} Technologies`}</span>
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
            <span className="sap-login__mobile-title">{companyName} · {PORTAL_NAMES.secondary} Portal</span>
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

          <p className="sap-login__form-footer">
            <a href="/login" style={{ color: 'var(--primary-500)', fontSize: 13, textDecoration: 'none' }}>
              {primaryPortalName}? Sign in here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
