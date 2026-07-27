import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Shield, Sun, Moon } from 'lucide-react';
import { API_BASE } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useBranding } from '../../context/BrandingContext';
import { PORTAL_NAMES } from '../../config/portalNames';
import heliflowLogo from '../../assets/heliflow.png';
import './LoginPage.css';

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
  const { companyName, logoUrl } = useBranding();
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
    <>
      <style>{`
        /* ── SAP Fiori tokens (scoped to right panel only) ── */
        .sp-form-panel {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 40px 24px;
          background: #f5f6f7;
          transition: background 0.3s;
        }

        [data-theme="dark"] .sp-form-panel {
          background: #1a1d23;
        }

        .sp-card {
          background: #ffffff;
          border: 1px solid #d9dee3;
          border-radius: 4px;
          box-shadow: 0 1px 4px 0 rgba(0,0,0,.12), 0 2px 8px 0 rgba(0,0,0,.06);
          width: 100%;
          max-width: 420px;
          overflow: hidden;
          font-family: 'SAP72', '72', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
        }

        [data-theme="dark"] .sp-card {
          background: #252830;
          border-color: #3a3d44;
          box-shadow: 0 1px 4px 0 rgba(0,0,0,.3), 0 2px 8px 0 rgba(0,0,0,.2);
        }

        .sp-card-header {
          background: #ffffff;
          border-bottom: 1px solid #d9dee3;
          padding: 14px 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background 0.3s, border-color 0.3s;
        }

        [data-theme="dark"] .sp-card-header {
          background: #252830;
          border-color: #3a3d44;
        }

        .sp-card-header-icon { color: #0064d9; flex-shrink: 0; }
        .sp-card-title {
          font-size: 16px;
          font-weight: 700;
          color: #1d2d3e;
          margin: 0;
          transition: color 0.3s;
        }

        [data-theme="dark"] .sp-card-title {
          color: #e4e6e8;
        }

        .sp-card-body { padding: 20px 20px 16px; }

        .sp-card-subtitle {
          font-size: 13px;
          color: #556b82;
          margin: 0 0 18px;
          line-height: 1.55;
          transition: color 0.3s;
        }

        [data-theme="dark"] .sp-card-subtitle {
          color: #9ea4a9;
        }

        .sp-status {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 4px;
          font-size: 13px;
          line-height: 1.45;
          margin-bottom: 18px;
          border-left: 3px solid;
        }
        .sp-status--success {
          background: #f1fdf1;
          border-color: #188918;
          color: #188918;
        }
        [data-theme="dark"] .sp-status--success {
          background: #1a3a2a;
          border-color: #2a5a3a;
          color: #4caf50;
        }
        .sp-status--error {
          background: #fff1f1;
          border-color: #bb0000;
          color: #bb0000;
        }
        [data-theme="dark"] .sp-status--error {
          background: #3a1a1a;
          border-color: #5a2a2a;
          color: #ef5350;
        }
        .sp-status svg { flex-shrink: 0; margin-top: 1px; }

        .sp-field { margin-bottom: 16px; }
        .sp-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #1d2d3e;
          margin-bottom: 5px;
          transition: color 0.3s;
        }
        [data-theme="dark"] .sp-label {
          color: #c8ccd0;
        }
        .sp-label--required::after { content: ' *'; color: #bb0000; }

        .sp-input-wrap { position: relative; display: flex; align-items: center; }
        .sp-input {
          width: 100%;
          height: 36px;
          padding: 0 36px 0 10px;
          font-family: inherit;
          font-size: 14px;
          color: #1d2d3e;
          background: #ffffff;
          border: 1px solid #c2cad0;
          border-radius: 4px;
          outline: none;
          box-sizing: border-box;
          transition: border-color .12s, box-shadow .12s, background 0.3s, color 0.3s;
        }
        [data-theme="dark"] .sp-input {
          color: #c8ccd0;
          background: #1a1d23;
          border-color: #4a4d54;
        }
        .sp-input--plain { padding-right: 10px; }
        .sp-input::placeholder { color: #89919a; }
        [data-theme="dark"] .sp-input::placeholder { color: #6a6d70; }
        .sp-input:hover { border-color: #8a9aa8; }
        [data-theme="dark"] .sp-input:hover { border-color: #6a6d70; }
        .sp-input:focus {
          border-color: #0064d9;
          box-shadow: 0 0 0 2px rgba(0,100,217,.16);
        }

        .sp-pw-toggle {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          color: #556b82;
          border-radius: 2px;
          transition: color .12s, background .12s;
        }
        .sp-pw-toggle:hover { color: #0064d9; background: rgba(0,100,217,.07); }
        [data-theme="dark"] .sp-pw-toggle:hover { color: #4795e8; background: rgba(71,149,232,.12); }

        .sp-btn {
          width: 100%;
          height: 36px;
          background: #0064d9;
          color: #fff;
          border: 1px solid #0064d9;
          border-radius: 4px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 6px;
          transition: background .12s, border-color .12s;
        }
        .sp-btn:hover:not(:disabled) { background: #0854b0; border-color: #0854b0; }
        .sp-btn:active:not(:disabled) { background: #0a3e82; border-color: #0a3e82; }
        .sp-btn:disabled { opacity: .55; cursor: not-allowed; }

        .sp-footer {
          padding: 12px 20px 14px;
          border-top: 1px solid #edf0f2;
          text-align: center;
          font-size: 13px;
          color: #556b82;
          font-family: inherit;
          transition: border-color 0.3s, color 0.3s;
        }
        [data-theme="dark"] .sp-footer {
          border-color: #3a3d44;
          color: #9ea4a9;
        }
        .sp-footer a { color: #0064d9; text-decoration: none; font-weight: 600; }
        [data-theme="dark"] .sp-footer a { color: #4795e8; }
        .sp-footer a:hover { text-decoration: underline; }

        .sp-validating { font-size: 13px; color: #556b82; padding: 8px 0 18px; }
        [data-theme="dark"] .sp-validating { color: #9ea4a9; }
      `}</style>

      {/* ── Outer layout: reuse existing sap-login classes for left panel ── */}
      <div className="sap-login">

        {/* LEFT PANEL — Company branding */}
        <div className="sap-login__brand-panel">
          <div className="sap-login__brand-content">
            <div className="sap-login__logo">
              <img src={logoUrl || heliflowLogo} alt={companyName} className="sap-login__logo-icon" />
            </div>
            <h1 className="sap-login__brand-title">{companyName} · {PORTAL_NAMES.secondary} Portal</h1>
            <p className="sap-login__brand-tagline">Create your secure portal password</p>
          </div>
        </div>

        {/* RIGHT PANEL — SAP Fiori styled with theme toggle */}
        <div className="sp-form-panel" style={{ position: 'relative' }}>
          {/* Theme toggle */}
          <button
            className="sap-login__theme-toggle"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="sp-card">
            <div className="sp-card-header">
              <Shield size={18} className="sp-card-header-icon" />
              <h2 className="sp-card-title">
                {validation?.hasExistingPassword ? 'Reset Password' : 'Set Your Password'}
              </h2>
            </div>

            <div className="sp-card-body">
              <p className="sp-card-subtitle">
                Choose a password only you know. Your procurement team cannot see it.
              </p>

              {validating && (
                <p className="sp-validating">Verifying your link…</p>
              )}

              {validateError && !validating && (
                <div className="sp-status sp-status--error" role="alert">
                  <AlertCircle size={15} />
                  <span>{validateError}</span>
                </div>
              )}

              {validation && !validating && (
                <>
                  <div className="sp-status sp-status--success" role="status">
                    <CheckCircle2 size={15} />
                    <span>
                      {validation.hasExistingPassword ? 'Resetting password for ' : 'Welcome, '}
                      <strong>{validation.vendorName}</strong>
                      <br />
                      <span style={{ fontWeight: 400, opacity: .85 }}>{validation.email}</span>
                    </span>
                  </div>

                  <form onSubmit={handleSubmit}>
                    <div className="sp-field">
                      <label className="sp-label sp-label--required" htmlFor="password">
                        New Password
                      </label>
                      <div className="sp-input-wrap">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          className="sp-input"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          className="sp-pw-toggle"
                          onClick={() => setShowPassword((s) => !s)}
                          tabIndex={-1}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="sp-field">
                      <label className="sp-label sp-label--required" htmlFor="confirm">
                        Confirm Password
                      </label>
                      <input
                        id="confirm"
                        type={showPassword ? 'text' : 'password'}
                        className="sp-input sp-input--plain"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                      />
                    </div>

                    {error && (
                      <div className="sp-status sp-status--error" role="alert" style={{ marginBottom: 12 }}>
                        <AlertCircle size={15} />
                        <span>{error}</span>
                      </div>
                    )}

                    <button type="submit" className="sp-btn" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving…' : 'Set Password'}
                    </button>
                  </form>
                </>
              )}
            </div>

            <div className="sp-footer">
              Already have a password? <Link to="/vendor/login">Sign In</Link>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}