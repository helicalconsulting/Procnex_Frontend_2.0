import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ArrowRight,
  Sun,
  Moon,
  Sparkles,
  Lock,
  KeyRound,
  XCircle,
  Users,
  Truck,
  Search,
  X,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Edit3,
  Ban,
  Power,
  Unlock,
} from 'lucide-react';
import { API_BASE } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import PhoneInput from '../../components/shared/PhoneInput';
import heliflowLogo from '../../assets/heliflow.png';
import './LoginPage.css';

// Master Security Passcode (Configurable in .env via VITE_PROVISIONING_PASSCODE)
const SECRET_PASSCODE = import.meta.env.VITE_PROVISIONING_PASSCODE || 'Helical2026!';
const SESSION_UNLOCK_KEY = 'helical_consulting_unlocked';

export interface CompanyOverviewItem {
  companyCode: string;
  companyName: string;
  companyPhone: string | null;
  companyEmail: string | null;
  logoUrl: string | null;
  defaultCurrency: string;
  maxUsers?: number;
  isActive?: boolean;
  createdAt: string;
  usersCount: number;
  vendorsCount: number;
  superAdmin: {
    fullName: string;
    email: string;
    username: string;
    phone?: string;
  } | null;
}

// ─── AI Predictive Similarity Matching Helpers ──────────────────────────────
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function calculateFuzzyNameMatchScore(s1: string, s2: string): number {
  const norm = (str?: string) => (str || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|llc|inc|co|corp|corporation|group|consulting|services)\b\.?/gi, '')
    .trim();

  const n1 = norm(s1);
  const n2 = norm(s2);

  if (!n1 || !n2) return 0;
  if (n1 === n2) return 100;
  if (n1.includes(n2) || n2.includes(n1)) return 85;

  const maxLen = Math.max(n1.length, n2.length);
  const dist = levenshteinDistance(n1, n2);
  const charSim = Math.max(0, Math.round(((maxLen - dist) / maxLen) * 100));

  const words1 = n1.split(' ').filter(Boolean);
  const words2 = n2.split(' ').filter(Boolean);
  let wordSimSum = 0;
  words1.forEach((w1) => {
    let maxW = 0;
    words2.forEach((w2) => {
      const wMax = Math.max(w1.length, w2.length);
      const wDist = levenshteinDistance(w1, w2);
      const wSim = Math.max(0, ((wMax - wDist) / wMax) * 100);
      if (wSim > maxW) maxW = wSim;
    });
    wordSimSum += maxW;
  });
  const wordSim = Math.round(wordSimSum / Math.max(words1.length, words2.length));

  return Math.max(charSim, wordSim);
}

export default function HelicalConsultingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDark, toggleTheme } = useTheme();

  // Security Lock State — ALWAYS prompt for password when visiting /helicalconsulting
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [accessKeyError, setAccessKeyError] = useState<string | null>(null);
  const [showAccessKey, setShowAccessKey] = useState(false);

  // Clear session lock on mount so returning to route always asks for password
  useEffect(() => {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    setIsUnlocked(false);
  }, []);

  // Registered Companies Overview State
  const [companiesList, setCompaniesList] = useState<CompanyOverviewItem[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [showCompaniesModal, setShowCompaniesModal] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Delete Modal States (Replaces browser confirm/alert)
  const [deleteConfirmCompany, setDeleteConfirmCompany] = useState<{ code: string; name: string } | null>(null);
  const [deleteSuccessCompany, setDeleteSuccessCompany] = useState<{ code: string; name: string } | null>(null);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  // Edit Max Users Limit Modal States
  const [editLimitCompany, setEditLimitCompany] = useState<{ code: string; name: string; currentMax: number } | null>(null);
  const [editMaxUsersVal, setEditMaxUsersVal] = useState<string>('50');
  const [isUpdatingLimit, setIsUpdatingLimit] = useState(false);
  const [limitUpdateError, setLimitUpdateError] = useState<string | null>(null);
  const [limitUpdateSuccess, setLimitUpdateSuccess] = useState<string | null>(null);

  const handleSaveCompanyMaxUsers = async (e: FormEvent) => {
    e.preventDefault();
    if (!editLimitCompany) return;
    const parsed = parseInt(editMaxUsersVal, 10);
    if (!parsed || parsed < 1 || parsed > 100000) {
      setLimitUpdateError('Max Users limit must be between 1 and 100,000');
      return;
    }

    setIsUpdatingLimit(true);
    setLimitUpdateError(null);
    setLimitUpdateSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/auth/company/${editLimitCompany.code}/max-users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUsers: parsed }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || json.message || 'Failed to update company user limit');
      }
      setLimitUpdateSuccess(`User limit for ${editLimitCompany.name} updated to ${parsed} active users!`);
      await fetchCompaniesOverview();
      setTimeout(() => {
        setEditLimitCompany(null);
        setLimitUpdateSuccess(null);
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLimitUpdateError(msg);
    } finally {
      setIsUpdatingLimit(false);
    }
  };

  // Toggle Company Active/Disable Status
  const [togglingCompanyCode, setTogglingCompanyCode] = useState<string | null>(null);

  const handleToggleCompanyStatus = async (compCode: string) => {
    setTogglingCompanyCode(compCode);
    try {
      const res = await fetch(`${API_BASE}/auth/company/${compCode}/toggle-status`, {
        method: 'PUT',
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || json.message || 'Failed to toggle company status');
      }
      await fetchCompaniesOverview();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setTogglingCompanyCode(null);
    }
  };

  // Form State
  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [maxUsers, setMaxUsers] = useState<string>('50');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState('Management');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');

  // Live Validations
  const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const isEmailValid = useMemo(() => {
    if (!email.trim()) return null;
    return EMAIL_REGEX.test(email.trim());
  }, [email]);

  const isPhoneValid = useMemo(() => {
    if (!phone.trim()) return null;
    return /^[0-9\s\-()]{6,20}$/.test(phone.trim());
  }, [phone]);

  // Live Predictive Analysis for Company Code
  const codeMatchAnalysis = useMemo(() => {
    const inputCode = companyCode.trim().toUpperCase();
    if (!inputCode || inputCode.length < 2) return null;

    for (const c of companiesList) {
      const existingCode = c.companyCode.toUpperCase();
      if (inputCode === existingCode) {
        return {
          type: 'EXACT_CODE',
          matchedCompany: c,
          score: 100,
          message: `Company Code '${inputCode}' is ALREADY REGISTERED for '${c.companyName}'.`,
        };
      }
    }
    return null;
  }, [companyCode, companiesList]);

  // Live Predictive Analysis for Company Name
  const nameMatchAnalysis = useMemo(() => {
    const inputName = companyName.trim();
    if (!inputName || inputName.length < 2) return null;

    let bestScore = 0;
    let bestMatch: CompanyOverviewItem | null = null;

    for (const c of companiesList) {
      const score = calculateFuzzyNameMatchScore(inputName, c.companyName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = c;
      }
    }

    if (bestMatch && bestScore >= 60) {
      const isExact = bestScore >= 95 || inputName.toLowerCase().trim() === bestMatch.companyName.toLowerCase().trim();
      return {
        matchedCompany: bestMatch,
        score: bestScore,
        isExact,
        message: isExact
          ? `Organization '${bestMatch.companyName}' is ALREADY REGISTERED under Code '${bestMatch.companyCode}'.`
          : `AI Predictive Similarity Alert: ${bestScore}% match with existing organization '${bestMatch.companyName}' (Code: ${bestMatch.companyCode}).`,
      };
    }
    return null;
  }, [companyName, companiesList]);

  // Fetch Companies Overview from Backend
  const fetchCompaniesOverview = async () => {
    setCompaniesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/companies-overview`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.companies)) {
        setCompaniesList(json.data.companies);
      }
    } catch (err) {
      console.error('Failed to fetch companies overview:', err);
    } finally {
      setCompaniesLoading(false);
    }
  };

  // Confirm and Execute Delete Company
  const handleConfirmDeleteCompany = async () => {
    if (!deleteConfirmCompany) return;
    const { code, name } = deleteConfirmCompany;
    const codeUpper = code.trim().toUpperCase();

    // Instant optimistic state update — removes card from UI immediately (0ms delay)
    setCompaniesList((prev) => prev.filter((c) => c.companyCode.toUpperCase() !== codeUpper));
    setIsDeletingCompany(true);
    try {
      const res = await fetch(`${API_BASE}/auth/company/${code}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || json.message || 'Failed to delete company');
      }
      setDeleteConfirmCompany(null);
      setDeleteSuccessCompany({ code, name });
      await fetchCompaniesOverview();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setDeleteConfirmCompany(null);
      await fetchCompaniesOverview();
    } finally {
      setIsDeletingCompany(false);
    }
  };

  useEffect(() => {
    fetchCompaniesOverview();
  }, [isUnlocked]);

  // Filtered companies based on search
  const filteredCompanies = useMemo(() => {
    if (!companySearchQuery.trim()) return companiesList;
    const q = companySearchQuery.toLowerCase();
    return companiesList.filter(
      (c) =>
        c.companyCode.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        (c.superAdmin?.fullName && c.superAdmin.fullName.toLowerCase().includes(q)) ||
        (c.superAdmin?.email && c.superAdmin.email.toLowerCase().includes(q))
    );
  }, [companiesList, companySearchQuery]);

  const totalUsersAcrossAll = useMemo(
    () => companiesList.reduce((acc, c) => acc + c.usersCount, 0),
    [companiesList]
  );

  const totalVendorsAcrossAll = useMemo(
    () => companiesList.reduce((acc, c) => acc + c.vendorsCount, 0),
    [companiesList]
  );

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdData, setCreatedData] = useState<{
    companyCode: string;
    companyName: string;
    fullName: string;
    username: string;
    email: string;
    passwordText: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Check URL query param ?key=Helical2026! for instant auto-unlock
  useEffect(() => {
    const keyInUrl = searchParams.get('key') || searchParams.get('pin');
    if (keyInUrl === SECRET_PASSCODE) {
      sessionStorage.setItem(SESSION_UNLOCK_KEY, 'true');
      setIsUnlocked(true);
    }
  }, [searchParams]);

  // Handle Unlock Submit
  const handleUnlockSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAccessKeyError(null);

    if (accessKeyInput.trim() === SECRET_PASSCODE) {
      setIsUnlocked(true);
      setAccessKeyInput('');
    } else {
      setAccessKeyError('Invalid Access Key. Permission Denied.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = companyCode.trim().toUpperCase();
    if (!cleanCode) {
      setError('Company Code is required (e.g. TATA, RELIANCE, HELI)');
      return;
    }
    if (cleanCode.length < 2 || cleanCode.length > 20) {
      setError('Company Code must be between 2 and 20 characters');
      return;
    }
    if (codeMatchAnalysis?.type === 'EXACT_CODE') {
      setError(`Cannot register company: Company Code '${cleanCode}' is already registered for organization '${codeMatchAnalysis.matchedCompany.companyName}'. Please use a unique Company Code.`);
      return;
    }
    if (!companyName.trim()) {
      setError('Company Name is required (e.g. Tata Steel Ltd)');
      return;
    }
    if (nameMatchAnalysis?.isExact) {
      setError(`Cannot register company: Company Name '${companyName.trim()}' is already registered under Company Code '${nameMatchAnalysis.matchedCompany.companyCode}'. Please use a unique Company Name.`);
      return;
    }
    if (!maxUsers.trim() || parseInt(maxUsers, 10) < 1) {
      setError('User Limit (Max Users) is required (e.g. 50)');
      return;
    }
    if (!fullName.trim()) {
      setError('Admin Full Name is required');
      return;
    }
    if (!username.trim()) {
      setError('Admin Username is required');
      return;
    }
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address (e.g. name@company.com)');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!confirmPassword) {
      setError('Confirm Password is required');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!department.trim()) {
      setError('Department is required (e.g. Management)');
      return;
    }
    if (!phone.trim()) {
      setError('Phone Number is required');
      return;
    }
    const PHONE_REGEX = /^\+?[0-9\s\-()]{7,25}$/;
    if (!PHONE_REGEX.test(phone.trim())) {
      setError('Please enter a valid phone number (e.g. 9876543210)');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyCode: cleanCode,
          companyName: companyName.trim(),
          maxUsers: parseInt(maxUsers, 10) || 50,
          fullName: fullName.trim(),
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password,
          roleName: 'Super Admin',
          department: department.trim(),
          phone: `${countryCode} ${phone.trim()}`,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error || json.success === false) {
        const errMsg = typeof json.error === 'string'
          ? json.error
          : typeof json.message === 'string'
          ? json.message
          : typeof json.error?.message === 'string'
          ? json.error.message
          : 'Failed to register company admin';
        throw new Error(errMsg);
      }

      setCreatedData({
        companyCode: cleanCode,
        companyName: companyName.trim() || cleanCode,
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordText: password,
      });

      // Refresh overview list immediately
      fetchCompaniesOverview();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdData) return;
    const text = `Company: ${createdData.companyName} (${createdData.companyCode})\nUsername: ${createdData.username}\nEmail: ${createdData.email}\nPassword: ${createdData.passwordText}\nLogin URL: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleResetForm = () => {
    setCompanyCode('');
    setCompanyName('');
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPhone('');
    setError(null);
    setCreatedData(null);
  };

  // ─── IF LOCKED: RENDER ACCESS LOCK SCREEN ──────────────────────────────────
  if (!isUnlocked) {
    return (
      <div className="sap-login" style={{ background: 'var(--surface-elevated, #0f172a)' }}>
        <button
          type="button"
          className="sap-login__theme-toggle"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div style={{
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 12px)',
            maxWidth: '420px',
            width: '100%',
            padding: '32px 28px',
            boxShadow: 'var(--shadow-lg, 0 16px 32px rgba(0,0,0,0.3))',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(10, 110, 209, 0.12)',
              border: '2px solid var(--primary-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--primary-500)'
            }}>
              <Lock size={32} />
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '4px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '10px'
            }}>
              <ShieldCheck size={14} /> Restricted Internal Tool
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 6px' }}>
              Helical Security Lock
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
              This portal is restricted to authorized Helical Administrators. Please enter your Security Access Key to unlock.
            </p>

            {accessKeyError && (
              <div className="sap-login__error" style={{ marginBottom: '16px', textAlign: 'left' }}>
                <AlertCircle size={16} />
                <span>{accessKeyError}</span>
              </div>
            )}

            <form onSubmit={handleUnlockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="sap-field" style={{ textAlign: 'left' }}>
                <label className="sap-field__label" htmlFor="access-key-input">
                  Security Access Key <span className="sap-field__required">*</span>
                </label>
                <div className="sap-field__input-wrap">
                  <input
                    id="access-key-input"
                    type={showAccessKey ? 'text' : 'password'}
                    className="sap-field__input"
                    placeholder="Enter Security Passcode"
                    value={accessKeyInput}
                    onChange={(e) => setAccessKeyInput(e.target.value)}
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    className="sap-field__eye"
                    onClick={() => setShowAccessKey(!showAccessKey)}
                    tabIndex={-1}
                  >
                    {showAccessKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="sap-login__submit"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <KeyRound size={18} />
                <span>Unlock Provisioning Portal</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── IF UNLOCKED: RENDER FULL PROVISIONING FORM ─────────────────────────────
  return (
    <div className="sap-login">
      {/* ── Left Panel: SAP Fiori Shell Branding ── */}
      <div className="sap-login__brand-panel">
        <div className="sap-login__brand-content">
          <div className="sap-login__logo">
            <img src={heliflowLogo} alt="Helical Consulting" className="sap-login__logo-icon" />
          </div>

          <h1 className="sap-login__brand-title">Helical Consulting</h1>
          <p className="sap-login__brand-tagline">
            Tenant & Super Admin Provisioning Portal
          </p>

          <div className="sap-login__brand-divider" />

          <ul className="sap-login__features">
            <li>
              <span className="sap-login__feature-icon">◆</span>
              Instant Multi-Tenant Company Isolation
            </li>
            <li>
              <span className="sap-login__feature-icon">◆</span>
              Automatic Super Admin Privileges & RBAC
            </li>
            <li>
              <span className="sap-login__feature-icon">◆</span>
              White-Label Branding & Company Settings
            </li>
            <li>
              <span className="sap-login__feature-icon">◆</span>
              Zero Postman / API Setup Required
            </li>
          </ul>
        </div>

        <div className="sap-login__brand-footer">
          <span>© {new Date().getFullYear()} Helical Consulting Suite · SAP Fiori Horizon Architecture</span>
        </div>
      </div>

      {/* ── Right Panel: SAP Fiori Form Panel ── */}
      <div className="sap-login__form-panel" style={{ overflowY: 'auto', padding: '40px 60px' }}>
        {/* Theme Toggle Button */}
        <button
          type="button"
          className="sap-login__theme-toggle"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="sap-login__form-container" style={{ maxWidth: '780px' }}>
          {/* Mobile Logo */}
          <div className="sap-login__mobile-logo">
            <img src={heliflowLogo} alt="Helical Consulting" className="sap-login__mobile-logo-icon" />
            <span className="sap-login__mobile-title">Helical Consulting</span>
          </div>

          {/* Form Header */}
          <div className="sap-login__form-header" style={{ marginBottom: '16px' }}>
            <h2 className="sap-login__form-title">Register Company Admin</h2>
            <p className="sap-login__form-subtitle">
              Set up a new isolated organization and create its primary Super Admin account.
            </p>
          </div>

          {/* Full Width Registered Companies Button */}
          <button
            type="button"
            onClick={() => {
              fetchCompaniesOverview();
              setShowCompaniesModal(true);
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 24px',
              marginBottom: '24px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--primary-50, rgba(10, 110, 209, 0.12))',
              color: 'var(--primary-500)',
              border: '1.5px solid var(--primary-500)',
              fontWeight: '700',
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={20} />
              <span>Registered Companies ({companiesList.length})</span>
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: '600',
              opacity: 0.9,
              background: 'rgba(10, 110, 209, 0.15)',
              padding: '4px 12px',
              borderRadius: '6px',
            }}>
              <span>Click to View</span>
              <ArrowRight size={14} />
            </div>
          </button>

          {/* Error Message */}
          {error && (
            <div className="sap-login__error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* SAP Fiori Styled Form */}
          <form className="sap-login__form" onSubmit={handleSubmit} style={{ gap: '20px' }}>
            {/* AI Predictive Duplicate Analysis Warning Card */}
            {(codeMatchAnalysis || nameMatchAnalysis) && (
              <div style={{
                background: (codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact)
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'rgba(245, 158, 11, 0.08)',
                border: (codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact)
                  ? '1.5px solid #ef4444'
                  : '1.5px solid #f59e0b',
                borderRadius: 'var(--radius-sm, 8px)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                animation: 'sapSlideDown 0.2s ease-out'
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: (codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact)
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(245, 158, 11, 0.15)',
                  color: (codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact)
                    ? '#ef4444'
                    : '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {(codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact) ? <AlertTriangle size={20} /> : <Sparkles size={20} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: (codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact) ? '#ef4444' : '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginBottom: '4px'
                  }}>
                    <span>
                      {(codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact)
                        ? '🚫 Registration Blocked: Duplicate Organization Detected'
                        : '⚡ AI Predictive Similarity Risk'}
                    </span>
                    {nameMatchAnalysis && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: nameMatchAnalysis.isExact ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        fontWeight: '800'
                      }}>
                        {nameMatchAnalysis.score}% Match Confidence
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                    {codeMatchAnalysis && <div>• {codeMatchAnalysis.message}</div>}
                    {nameMatchAnalysis && <div>• {nameMatchAnalysis.message}</div>}
                  </div>
                  {((codeMatchAnalysis?.matchedCompany) || (nameMatchAnalysis?.matchedCompany)) && (
                    <div style={{
                      marginTop: '8px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      background: 'var(--surface)',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)'
                    }}>
                      <strong>Registered Organization:</strong> {(codeMatchAnalysis?.matchedCompany || nameMatchAnalysis?.matchedCompany)?.companyName} | Code: <strong style={{ color: 'var(--primary-500)', fontFamily: 'var(--font-mono)' }}>{(codeMatchAnalysis?.matchedCompany || nameMatchAnalysis?.matchedCompany)?.companyCode}</strong> | Super Admin: {(codeMatchAnalysis?.matchedCompany || nameMatchAnalysis?.matchedCompany)?.superAdmin?.email || 'N/A'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card Section 1: Organization Info */}
            <div style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '18px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '10px',
                marginBottom: '14px'
              }}>
                <Building2 size={16} style={{ color: 'var(--primary-500)' }} />
                <span>1. Organization Info</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div className="sap-field">
                  <label className="sap-field__label" htmlFor="company-code">
                    Company Code <span className="sap-field__required">*</span>
                  </label>
                  <input
                    id="company-code"
                    type="text"
                    className={`sap-field__input ${codeMatchAnalysis?.type === 'EXACT_CODE' ? 'sap-field__input--error' : ''}`}
                    placeholder="e.g. TATA"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    disabled={loading}
                    required
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>Unique ID (Auto uppercase)</span>
                  {codeMatchAnalysis?.type === 'EXACT_CODE' && (
                    <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <XCircle size={12} /> Code ALREADY REGISTERED for '{codeMatchAnalysis.matchedCompany.companyName}'
                    </span>
                  )}
                </div>

                <div className="sap-field">
                  <label className="sap-field__label" htmlFor="company-name">
                    Company Name <span className="sap-field__required">*</span>
                  </label>
                  <input
                    id="company-name"
                    type="text"
                    className={`sap-field__input ${nameMatchAnalysis?.isExact ? 'sap-field__input--error' : ''}`}
                    placeholder="e.g. Tata Steel Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>Display Brand Name</span>
                  {nameMatchAnalysis && (
                    <span style={{
                      fontSize: '11px',
                      color: nameMatchAnalysis.isExact ? '#ef4444' : '#f59e0b',
                      marginTop: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: '600'
                    }}>
                      {nameMatchAnalysis.isExact ? <XCircle size={12} /> : <Sparkles size={12} />}
                      {nameMatchAnalysis.isExact
                        ? `Organization ALREADY REGISTERED (Code: ${nameMatchAnalysis.matchedCompany.companyCode})`
                        : `Predictive Match (${nameMatchAnalysis.score}%): '${nameMatchAnalysis.matchedCompany.companyName}'`}
                    </span>
                  )}
                </div>

                <div className="sap-field">
                  <label className="sap-field__label" htmlFor="max-users">
                    User Limit (Max Users) <span className="sap-field__required">*</span>
                  </label>
                  <input
                    id="max-users"
                    type="number"
                    min="1"
                    max="100000"
                    className="sap-field__input"
                    placeholder="50"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>Max allowed active staff</span>
                </div>
              </div>
            </div>

            {/* Card Section 2: Super Admin Account */}
            <div style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '18px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '10px',
                marginBottom: '14px'
              }}>
                <User size={16} style={{ color: 'var(--primary-500)' }} />
                <span>2. Super Admin Credentials</span>
              </div>

              <div className="sap-field" style={{ marginBottom: '14px' }}>
                <label className="sap-field__label" htmlFor="admin-name">
                  Admin Full Name <span className="sap-field__required">*</span>
                </label>
                <input
                  id="admin-name"
                  type="text"
                  className="sap-field__input"
                  placeholder="e.g. Ratan Tata"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div className="sap-field">
                  <label className="sap-field__label" htmlFor="admin-username">
                    Username <span className="sap-field__required">*</span>
                  </label>
                  <input
                    id="admin-username"
                    type="text"
                    className="sap-field__input"
                    placeholder="e.g. ratan_tata"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="sap-field">
                  <label className="sap-field__label" htmlFor="admin-email">
                    Email <span className="sap-field__required">*</span>
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    className={`sap-field__input ${isEmailValid === false ? 'sap-field__input--error' : ''}`}
                    placeholder="ratan@tatasteel.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                  {isEmailValid === true && (
                    <span style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <CheckCircle2 size={12} /> Valid email address
                    </span>
                  )}
                  {isEmailValid === false && (
                    <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <XCircle size={12} /> Please enter a valid email address (e.g. name@company.com)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="sap-field">
                  <label className="sap-field__label" htmlFor="admin-password">
                    Password <span className="sap-field__required">*</span>
                  </label>
                  <div className="sap-field__input-wrap">
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      className="sap-field__input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      className="sap-field__eye"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label="Toggle password"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="sap-field">
                  <label className="sap-field__label" htmlFor="admin-confirm">
                    Confirm Password <span className="sap-field__required">*</span>
                  </label>
                  <input
                    id="admin-confirm"
                    type={showPassword ? 'text' : 'password'}
                    className="sap-field__input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Mandatory Additional Fields Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="sap-field">
                <label className="sap-field__label" htmlFor="admin-dept">
                  Department <span className="sap-field__required">*</span>
                </label>
                <input
                  id="admin-dept"
                  type="text"
                  className="sap-field__input"
                  placeholder="Management"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="sap-field">
                <label className="sap-field__label" htmlFor="admin-phone">
                  Phone Number <span className="sap-field__required">*</span>
                </label>
                <PhoneInput
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                  value={phone}
                  onChange={setPhone}
                  placeholder="9876543210"
                  hasError={isPhoneValid === false}
                />
                {isPhoneValid === true && (
                  <span style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                    <CheckCircle2 size={12} /> Valid phone number
                  </span>
                )}
                {isPhoneValid === false && (
                  <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                    <XCircle size={12} /> Phone number must contain digits only
                  </span>
                )}
              </div>
            </div>

            {/* SAP Primary Blue Submit Button */}
            <button
              type="submit"
              className="sap-login__submit"
              disabled={loading || codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact}
              style={{
                marginTop: '8px',
                opacity: (codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact) ? 0.55 : 1,
                cursor: (codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact) ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? (
                <span className="sap-login__spinner" />
              ) : (
                <>
                  <span>
                    {(codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact)
                      ? 'Duplicate Company - Registration Blocked'
                      : 'Create Company & Provision Admin'}
                  </span>
                  <ArrowRight size={18} style={{ marginLeft: '8px' }} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* SAP FIORI STYLE SUCCESS MODAL BOX */}
      {createdData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 12px)',
            maxWidth: '480px',
            width: '100%',
            padding: '28px',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.3))',
            animation: 'sapSlideDown 0.25s ease-out'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--success-50, #ecfdf5)',
                border: '2px solid var(--success-500, #10b981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
                color: 'var(--success-500, #10b981)'
              }}>
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 6px' }}>
                Company Admin Created! 🎉
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                Super Admin account provisioned for <strong>{createdData.companyName}</strong>.
              </p>
            </div>

            {/* Summary Details */}
            <div style={{
              background: 'var(--surface-hover)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Company Code:</span>
                <span style={{ fontWeight: '700', color: 'var(--primary-500)', fontFamily: 'var(--font-mono)' }}>{createdData.companyCode}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Admin Name:</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{createdData.fullName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Username:</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{createdData.username}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Email:</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{createdData.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Password:</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{createdData.passwordText}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={handleCopyCredentials}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-card)',
                  color: 'var(--text-primary)',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                {copied ? <Check size={16} style={{ color: 'var(--success-500)' }} /> : <Copy size={16} />}
                <span>{copied ? 'Credentials Copied!' : 'Copy All Credentials'}</span>
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleResetForm}
                  style={{
                    padding: '11px 16px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Create Another
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  style={{
                    padding: '11px 16px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: 'none',
                    background: 'var(--primary-500)',
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Go to Login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REGISTERED COMPANIES OVERVIEW MODAL ── */}
      {showCompaniesModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isFullScreen ? '0' : '24px',
          transition: 'all 0.25s ease'
        }}>
          <div style={{
            background: 'var(--surface-card, #1e293b)',
            border: isFullScreen ? 'none' : '1px solid var(--border)',
            borderRadius: isFullScreen ? '0' : 'var(--radius-lg, 16px)',
            maxWidth: isFullScreen ? '100vw' : '960px',
            width: '100%',
            height: isFullScreen ? '100vh' : 'auto',
            maxHeight: isFullScreen ? '100vh' : '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-xl, 0 24px 48px rgba(0,0,0,0.4))',
            overflow: 'hidden',
            transition: 'all 0.25s ease',
            animation: 'sapSlideDown 0.25s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 28px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'var(--primary-50, rgba(10, 110, 209, 0.12))',
                  border: '1px solid var(--primary-500)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-500)'
                }}>
                  <Building2 size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                    Registered Organizations Directory
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                    Live breakdown of all client companies, assigned employees, and onboarded vendors.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-card)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                  title={isFullScreen ? 'Exit Full Screen' : 'Expand Full Screen'}
                >
                  {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span>{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCompaniesModal(false)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-hover)',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Summary Stats Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '8px',
                    background: 'rgba(10, 110, 209, 0.15)',
                    color: 'var(--primary-500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Building2 size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}>
                      {companiesList.length}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>
                      Registered Companies
                    </div>
                  </div>
                </div>

                <div style={{
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Users size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}>
                      {totalUsersAcrossAll}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>
                      Total Active Users
                    </div>
                  </div>
                </div>

                <div style={{
                  background: 'var(--surface-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Truck size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}>
                      {totalVendorsAcrossAll}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '600' }}>
                      Total Vendors Onboarded
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '10px 14px'
              }}>
                <Search size={16} style={{ color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search company by name, code (e.g. TATA), or Super Admin..."
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    width: '100%'
                  }}
                />
                {companySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCompanySearchQuery('')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Companies Grid List */}
              {filteredCompanies.length === 0 ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-hover)',
                  borderRadius: '10px',
                  border: '1px dashed var(--border)'
                }}>
                  <Building2 size={36} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                    {companiesList.length === 0 ? 'No registered companies found.' : 'No matching companies found for your search.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' }}>
                  {filteredCompanies.map((c) => (
                    <div
                      key={c.companyCode}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '16px',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'transform 0.2s, border-color 0.2s'
                      }}
                    >
                      {/* Top Row: Company Info */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '8px',
                              background: 'var(--primary-50, rgba(10, 110, 209, 0.15))',
                              color: 'var(--primary-500)',
                              fontWeight: '800',
                              fontSize: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid var(--border)'
                            }}>
                              {c.companyCode.slice(0, 3)}
                            </div>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {c.companyName}
                              </h4>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                Code: <strong style={{ color: 'var(--primary-500)', fontFamily: 'var(--font-mono)' }}>{c.companyCode}</strong>
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: c.isActive !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              border: c.isActive !== false ? '1px solid #10b981' : '1px solid #ef4444',
                              color: c.isActive !== false ? '#10b981' : '#ef4444',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              {c.isActive !== false ? 'Active' : 'Disabled'}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'var(--surface-hover)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              fontWeight: '600'
                            }}>
                              {c.defaultCurrency}
                            </span>
                          </div>
                        </div>

                        {/* Counts Metrics Badge */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
                          <div style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Users size={16} style={{ color: '#10b981' }} />
                              <div>
                                <div style={{ fontSize: '16px', fontWeight: '800', color: '#10b981', lineHeight: 1 }}>
                                  {c.usersCount} <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: '600' }}>/ {c.maxUsers || 50}</span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '2px' }}>
                                  Active Users Limit
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEditLimitCompany({ code: c.companyCode, name: c.companyName, currentMax: c.maxUsers || 50 });
                                setEditMaxUsersVal(String(c.maxUsers || 50));
                                setLimitUpdateError(null);
                                setLimitUpdateSuccess(null);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                              title={`Edit active user seats limit for ${c.companyName}`}
                            >
                              <Edit3 size={13} />
                              <span>Edit</span>
                            </button>
                          </div>

                          <div style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <Truck size={16} style={{ color: '#f59e0b' }} />
                            <div>
                              <div style={{ fontSize: '16px', fontWeight: '800', color: '#f59e0b', lineHeight: 1 }}>
                                {c.vendorsCount}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '2px' }}>
                                Total Vendors
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Super Admin Primary Contact */}
                        {c.superAdmin && (
                          <div style={{
                            marginTop: '14px',
                            paddingTop: '12px',
                            borderTop: '1px dashed var(--border)',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Super Admin:</span>
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{c.superAdmin.fullName}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Email:</span>
                              <span style={{ color: 'var(--text-primary)' }}>{c.superAdmin.email}</span>
                            </div>
                            {c.superAdmin.phone && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Phone:</span>
                                <span style={{ color: 'var(--text-primary)' }}>{c.superAdmin.phone}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleCompanyStatus(c.companyCode)}
                          disabled={togglingCompanyCode === c.companyCode}
                          style={{
                            padding: '9px 12px',
                            borderRadius: '6px',
                            border: c.isActive !== false ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                            background: c.isActive !== false ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: c.isActive !== false ? '#ef4444' : '#10b981',
                            fontWeight: '700',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                          title={c.isActive !== false ? `Disable organization account for ${c.companyName}` : `Re-enable organization account for ${c.companyName}`}
                        >
                          {togglingCompanyCode === c.companyCode ? (
                            <span className="sap-login__spinner" style={{ width: 14, height: 14 }} />
                          ) : c.isActive !== false ? (
                            <>
                              <Ban size={14} />
                              <span>Disable Organization</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={14} />
                              <span>Enable Organization</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmCompany({ code: c.companyCode, name: c.companyName })}
                          style={{
                            padding: '9px 12px',
                            borderRadius: '6px',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            fontWeight: '600',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                          }}
                          title={`Delete company ${c.companyCode}`}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM DELETE CONFIRMATION MODAL ── */}
      {deleteConfirmCompany && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--surface-card, #1e293b)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            maxWidth: '460px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            textAlign: 'center',
            animation: 'sapSlideDown 0.2s ease-out'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '2px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#ef4444'
            }}>
              <AlertTriangle size={32} />
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Delete Organization?
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete company <strong>{deleteConfirmCompany.name}</strong> (<strong style={{ color: 'var(--primary-500)' }}>{deleteConfirmCompany.code}</strong>)?
            </p>

            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px border-subtle rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#ef4444',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>This will remove all associated Users, Vendors, Roles, and Settings for this company code. This action <strong>cannot be undone</strong>.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmCompany(null)}
                disabled={isDeletingCompany}
                style={{
                  padding: '11px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCompany}
                disabled={isDeletingCompany}
                style={{
                  padding: '11px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                {isDeletingCompany ? (
                  <span className="sap-login__spinner" />
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM DELETE SUCCESS MODAL ── */}
      {deleteSuccessCompany && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10001,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--surface-card, #1e293b)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            textAlign: 'center',
            animation: 'sapSlideDown 0.2s ease-out'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '2px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#10b981'
            }}>
              <CheckCircle2 size={36} />
            </div>

            <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Company Deleted! 🗑️
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Company <strong>{deleteSuccessCompany.name}</strong> (<strong style={{ color: 'var(--primary-500)' }}>{deleteSuccessCompany.code}</strong>) and all its associated users & vendors have been deleted from database.
            </p>

            <button
              type="button"
              onClick={() => setDeleteSuccessCompany(null)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary-500)',
                color: '#fff',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* ── EDIT MAX USERS LIMIT MODAL ── */}
      {editLimitCompany && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10002,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--surface-card, #1e293b)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            animation: 'sapSlideDown 0.25s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Users size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Update User Limit
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {editLimitCompany.name} (<strong style={{ color: 'var(--primary-500)' }}>{editLimitCompany.code}</strong>)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditLimitCompany(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {limitUpdateError && (
              <div className="sap-login__error" style={{ marginBottom: '14px' }}>
                <AlertCircle size={16} />
                <span>{limitUpdateError}</span>
              </div>
            )}

            {limitUpdateSuccess && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid #10b981',
                color: '#10b981',
                fontSize: '13px',
                fontWeight: '600',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 size={16} />
                <span>{limitUpdateSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveCompanyMaxUsers} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="sap-field">
                <label className="sap-field__label" htmlFor="edit-max-users-input">
                  Maximum Active Users Limit <span className="sap-field__required">*</span>
                </label>
                <input
                  id="edit-max-users-input"
                  type="number"
                  min="1"
                  max="100000"
                  className="sap-field__input"
                  value={editMaxUsersVal}
                  onChange={(e) => setEditMaxUsersVal(e.target.value)}
                  placeholder="Enter user seat quota (e.g. 100)"
                  required
                  autoFocus
                />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  Current setting: <strong>{editLimitCompany.currentMax} users</strong>. Set a higher limit to allow adding more staff users.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditLimitCompany(null)}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                  disabled={isUpdatingLimit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingLimit}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isUpdatingLimit ? 'Saving...' : 'Save New Limit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
