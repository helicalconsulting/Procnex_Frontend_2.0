import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
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
  Trash2,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Edit3,
  Ban,
  LoaderCircle,
} from 'lucide-react';
import { API_BASE } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import PhoneInput from '../../components/shared/PhoneInput';
import heliflowLogo from '../../assets/heliflow.png';
import { motionTransition } from '../../lib/motion';

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
  maxVendors?: number;
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
  const [, setCompaniesLoading] = useState(false);
  const [showCompaniesModal, setShowCompaniesModal] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Delete Modal States
  const [deleteConfirmCompany, setDeleteConfirmCompany] = useState<{ code: string; name: string } | null>(null);
  const [deleteSuccessCompany, setDeleteSuccessCompany] = useState<{ code: string; name: string } | null>(null);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  // Edit Limits Modal States (Max Users & Max Vendors)
  const [editLimitCompany, setEditLimitCompany] = useState<{
    code: string;
    name: string;
    currentMaxUsers: number;
    currentMaxVendors: number;
  } | null>(null);
  const [editMaxUsersVal, setEditMaxUsersVal] = useState<string>('50');
  const [editMaxVendorsVal, setEditMaxVendorsVal] = useState<string>('50');
  const [isUpdatingLimit, setIsUpdatingLimit] = useState(false);
  const [limitUpdateError, setLimitUpdateError] = useState<string | null>(null);
  const [limitUpdateSuccess, setLimitUpdateSuccess] = useState<string | null>(null);

  const handleSaveCompanyLimits = async (e: FormEvent) => {
    e.preventDefault();
    if (!editLimitCompany) return;
    const parsedUsers = parseInt(editMaxUsersVal, 10);
    const parsedVendors = parseInt(editMaxVendorsVal, 10);
    if (!parsedUsers || parsedUsers < 1 || parsedUsers > 100000) {
      setLimitUpdateError('Max Users limit must be between 1 and 100,000');
      return;
    }
    if (!parsedVendors || parsedVendors < 1 || parsedVendors > 100000) {
      setLimitUpdateError('Max Vendors limit must be between 1 and 100,000');
      return;
    }

    setIsUpdatingLimit(true);
    setLimitUpdateError(null);
    setLimitUpdateSuccess(null);
    try {
      const promises = [];
      if (parsedUsers !== editLimitCompany.currentMaxUsers) {
        promises.push(
          fetch(`${API_BASE}/auth/company/${editLimitCompany.code}/max-users`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxUsers: parsedUsers }),
          })
        );
      }
      if (parsedVendors !== editLimitCompany.currentMaxVendors) {
        promises.push(
          fetch(`${API_BASE}/auth/company/${editLimitCompany.code}/max-vendors`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxVendors: parsedVendors }),
          })
        );
      }

      if (promises.length === 0) {
        setEditLimitCompany(null);
        return;
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        const json = await res.json();
        if (!res.ok || json.success === false) {
          throw new Error(json.error || json.message || 'Failed to update company limits');
        }
      }
      setLimitUpdateSuccess(`Limits for ${editLimitCompany.name} updated successfully!`);
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
  const [maxVendors, setMaxVendors] = useState<string>('50');
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

    // Instant optimistic state update
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
    if (!maxVendors.trim() || parseInt(maxVendors, 10) < 1) {
      setError('Vendor Limit (Max Vendors) is required (e.g. 50)');
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
          maxVendors: parseInt(maxVendors, 10) || 50,
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
    setMaxUsers('50');
    setMaxVendors('50');
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
      <main className="grid min-h-svh bg-background text-foreground place-items-center relative overflow-hidden p-4 sm:p-6">
        {/* Subtle decorative background lights matching AuthLayout */}
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(37,99,235,0.09),transparent_30%),radial-gradient(circle_at_16%_92%,rgba(14,165,233,0.06),transparent_34%)] pointer-events-none" />

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={(event) => toggleTheme({ x: event.clientX, y: event.clientY })}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
          className="absolute right-4 top-4 sm:right-6 sm:top-6 z-10 inline-flex size-11 items-center justify-center rounded-xl border border-border/80 bg-card/75 text-muted-foreground shadow-sm backdrop-blur-xl outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={isDark ? 'sun' : 'moon'}
              className="grid place-items-center"
              initial={{ opacity: 0, rotate: -24, scale: 0.75 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 24, scale: 0.75 }}
              transition={motionTransition.fast}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Security Lock Glass Box */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={motionTransition.softSpring}
          className="relative z-10 w-full max-w-md rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-8 shadow-2xl shadow-slate-950/[0.1] backdrop-blur-xl text-center space-y-6"
        >
          <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto shadow-inner">
            <Lock size={30} />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-[11px] font-bold uppercase tracking-wider mb-2">
              <ShieldCheck size={13} /> Restricted Internal Tool
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Helical Security Lock</h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              This portal is restricted to authorized Helical Administrators. Please enter your Security Access Key to unlock.
            </p>
          </div>

          {accessKeyError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs font-medium text-destructive text-left" role="alert">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{accessKeyError}</span>
            </div>
          )}

          <form onSubmit={handleUnlockSubmit} className="grid gap-4 text-left">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="access-key-input">
                Security Access Key <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  id="access-key-input"
                  type={showAccessKey ? 'text' : 'password'}
                  className="w-full h-11 px-4 pr-12 rounded-xl border border-border bg-background/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                  placeholder="Enter Security Passcode"
                  value={accessKeyInput}
                  onChange={(e) => setAccessKeyInput(e.target.value)}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowAccessKey(!showAccessKey)}
                  tabIndex={-1}
                  aria-label={showAccessKey ? 'Hide passcode' : 'Show passcode'}
                >
                  {showAccessKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-md active:scale-[0.99] text-sm mt-1"
            >
              <KeyRound size={17} />
              <span>Unlock Provisioning Portal</span>
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  // ─── IF UNLOCKED: RENDER FULL PROVISIONING FORM ─────────────────────────────
  return (
    <main className="grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(360px,0.85fr)_minmax(520px,1.15fr)]">
      {/* ── Left Panel: Helical Shell Branding ── */}
      <section className="relative hidden min-h-svh overflow-hidden [background:var(--shell-bg)] p-10 text-white lg:flex lg:flex-col xl:p-14 justify-between border-r border-white/10">
        <div aria-hidden="true" className="absolute -right-28 -top-24 size-96 rounded-full border border-white/[0.06]" />
        <div aria-hidden="true" className="absolute -bottom-48 -left-36 size-[34rem] rounded-full border border-white/[0.05]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(74,144,226,0.16),transparent_32%),radial-gradient(circle_at_18%_88%,rgba(45,212,191,0.08),transparent_30%)]" />

        <div className="relative z-10 flex items-center gap-3.5">
          <img src={heliflowLogo} alt="Helical Consulting" className="size-12 rounded-xl object-contain ring-1 ring-white/15" />
          <span className="text-2xl font-bold tracking-tight text-white">Helical Consulting</span>
        </div>

        <div className="relative z-10 my-auto max-w-lg py-12">
          <h2 className="text-3xl font-bold tracking-tight text-white xl:text-4xl leading-snug">
            Tenant & Super Admin Provisioning Portal
          </h2>
          <p className="mt-4 text-base text-white/60 leading-relaxed">
            Instantly spin up isolated client tenant environments, set up user limits, and issue primary Super Admin credentials.
          </p>

          <ul className="mt-8 grid gap-3.5" aria-label="Portal capabilities">
            {[
              'Instant Multi-Tenant Company Isolation & Routing',
              'Automatic Super Admin Privileges & Enterprise RBAC',
              'Custom User Seat Limits & Seat Management',
              'Live Registered Organization Directory & Analytics',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-white/80 font-medium">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-blue-400/20 text-blue-300 ring-1 ring-blue-300/20">
                  <CheckCircle2 size={15} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} Helical Consulting Suite · Multi-Tenant Architecture
        </p>
      </section>

      {/* ── Right Panel: Provisioning Form Panel ── */}
      <section className="relative flex min-h-svh flex-col p-6 sm:p-8 lg:p-10 pb-24 sm:pb-32 overflow-y-auto max-w-5xl mx-auto w-full">
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={(event) => toggleTheme({ x: event.clientX, y: event.clientY })}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
          className="absolute right-4 top-4 sm:right-6 sm:top-6 z-10 inline-flex size-11 items-center justify-center rounded-xl border border-border/80 bg-card/75 text-muted-foreground shadow-sm backdrop-blur-xl outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={isDark ? 'sun' : 'moon'}
              className="grid place-items-center"
              initial={{ opacity: 0, rotate: -24, scale: 0.75 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 24, scale: 0.75 }}
              transition={motionTransition.fast}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </motion.span>
          </AnimatePresence>
        </button>

        <div className="w-full pb-8">
          {/* Mobile Brand Logo */}
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <img src={heliflowLogo} alt="Helical Consulting" className="size-10 rounded-xl object-contain ring-1 ring-border" />
            <span className="text-xl font-bold tracking-tight text-foreground">Helical Consulting</span>
          </div>

          {/* Form Header */}
          <div className="mb-5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Register Company Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up a new isolated organization and create its primary Super Admin account.
            </p>
          </div>

          {/* Full Width Registered Companies Directory Button */}
          <button
            type="button"
            onClick={() => {
              fetchCompaniesOverview();
              setShowCompaniesModal(true);
            }}
            className="w-full flex items-center justify-between p-3.5 px-5 sm:px-6 rounded-2xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 transition-all shadow-sm group mb-5 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-base sm:text-lg font-bold">
              <Building2 size={22} className="shrink-0" />
              <span>Registered Companies ({companiesList.length})</span>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/20 text-primary group-hover:translate-x-0.5 transition-transform">
              <span>Click to View Directory</span>
              <ArrowRight size={14} />
            </div>
          </button>

          {/* Error Message Alert */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive" role="alert">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Provisioning Form */}
          <form className="grid gap-5" onSubmit={handleSubmit}>
            {/* AI Predictive Duplicate Analysis Warning Card */}
            {(codeMatchAnalysis || nameMatchAnalysis) && (
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all ${
                  codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact
                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                }`}
              >
                <div
                  className={`size-9 rounded-full flex items-center justify-center shrink-0 ${
                    codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-amber-500/20 text-amber-500'
                  }`}
                >
                  {codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact ? <AlertTriangle size={18} /> : <Sparkles size={18} />}
                </div>
                <div className="flex-1 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span>
                      {codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact
                        ? '🚫 Registration Blocked: Duplicate Organization Detected'
                        : '⚡ AI Predictive Similarity Risk'}
                    </span>
                    {nameMatchAnalysis && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 font-extrabold">
                        {nameMatchAnalysis.score}% Match Confidence
                      </span>
                    )}
                  </div>
                  <div className="text-xs leading-relaxed opacity-90">
                    {codeMatchAnalysis && <div>• {codeMatchAnalysis.message}</div>}
                    {nameMatchAnalysis && <div>• {nameMatchAnalysis.message}</div>}
                  </div>
                  {((codeMatchAnalysis?.matchedCompany) || (nameMatchAnalysis?.matchedCompany)) && (
                    <div className="mt-2 text-xs p-2 rounded-lg bg-background/60 border border-border/60 text-muted-foreground">
                      <strong>Registered Organization:</strong> {(codeMatchAnalysis?.matchedCompany || nameMatchAnalysis?.matchedCompany)?.companyName} | Code: <strong className="text-primary font-mono font-bold">{(codeMatchAnalysis?.matchedCompany || nameMatchAnalysis?.matchedCompany)?.companyCode}</strong> | Super Admin: {(codeMatchAnalysis?.matchedCompany || nameMatchAnalysis?.matchedCompany)?.superAdmin?.email || 'N/A'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 1: Organization Info */}
            <div className="rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-sm backdrop-blur-sm space-y-3.5">
              <div className="flex items-center gap-2 text-base font-bold text-foreground border-b border-border/60 pb-2.5">
                <Building2 size={18} className="text-primary" />
                <span>1. Organization Info</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="company-code">
                    Company Code <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="company-code"
                    type="text"
                    className={`w-full h-10 px-3.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                      codeMatchAnalysis?.type === 'EXACT_CODE' ? 'border-destructive focus:ring-destructive/50' : 'border-border'
                    }`}
                    placeholder="e.g. TATA"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    disabled={loading}
                    required
                  />
                  <span className="text-[11px] text-muted-foreground">Unique ID (Auto uppercase)</span>
                  {codeMatchAnalysis?.type === 'EXACT_CODE' && (
                    <span className="text-xs text-destructive flex items-center gap-1 font-semibold mt-0.5">
                      <XCircle size={13} /> Code ALREADY REGISTERED for '{codeMatchAnalysis.matchedCompany.companyName}'
                    </span>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="company-name">
                    Company Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="company-name"
                    type="text"
                    className={`w-full h-10 px-3.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                      nameMatchAnalysis?.isExact ? 'border-destructive focus:ring-destructive/50' : 'border-border'
                    }`}
                    placeholder="e.g. Tata Steel Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <span className="text-[11px] text-muted-foreground">Display Brand Name</span>
                  {nameMatchAnalysis && (
                    <span className={`text-xs flex items-center gap-1 font-semibold mt-0.5 ${nameMatchAnalysis.isExact ? 'text-destructive' : 'text-amber-500'}`}>
                      {nameMatchAnalysis.isExact ? <XCircle size={13} /> : <Sparkles size={13} />}
                      {nameMatchAnalysis.isExact
                        ? `Organization ALREADY REGISTERED (Code: ${nameMatchAnalysis.matchedCompany.companyCode})`
                        : `Predictive Match (${nameMatchAnalysis.score}%): '${nameMatchAnalysis.matchedCompany.companyName}'`}
                    </span>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <label className="text-[11px] xl:text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 whitespace-nowrap" htmlFor="max-users">
                    <span>User Limit (Max Users)</span>
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="max-users"
                    type="number"
                    min="1"
                    max="100000"
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    placeholder="50"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <span className="text-[11px] text-muted-foreground">Max allowed active staff</span>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-[11px] xl:text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 whitespace-nowrap" htmlFor="max-vendors">
                    <span>Vendor Limit (Max Vendors)</span>
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="max-vendors"
                    type="number"
                    min="1"
                    max="100000"
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    placeholder="50"
                    value={maxVendors}
                    onChange={(e) => setMaxVendors(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <span className="text-[11px] text-muted-foreground">Max allowed vendors</span>
                </div>
              </div>
            </div>

            {/* Section 2: Super Admin Account Credentials */}
            <div className="rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-sm backdrop-blur-sm space-y-3.5">
              <div className="flex items-center gap-2 text-base font-bold text-foreground border-b border-border/60 pb-2.5">
                <User size={18} className="text-primary" />
                <span>2. Super Admin Credentials</span>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="admin-name">
                  Admin Full Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="admin-name"
                  type="text"
                  className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  placeholder="e.g. Ratan Tata"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="admin-username">
                    Username <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="admin-username"
                    type="text"
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    placeholder="e.g. ratan_tata"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="admin-email">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    className={`w-full h-10 px-3.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                      isEmailValid === false ? 'border-destructive focus:ring-destructive/50' : 'border-border'
                    }`}
                    placeholder="ratan@tatasteel.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                  {isEmailValid === true && (
                    <span className="text-xs text-emerald-500 flex items-center gap-1 font-semibold mt-0.5">
                      <CheckCircle2 size={13} /> Valid email address
                    </span>
                  )}
                  {isEmailValid === false && (
                    <span className="text-xs text-destructive flex items-center gap-1 font-semibold mt-0.5">
                      <XCircle size={13} /> Please enter a valid email address (e.g. name@company.com)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="admin-password">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      className="w-full h-10 px-3.5 pr-10 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-0 inline-flex size-10 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="admin-confirm">
                    Confirm Password <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="admin-confirm"
                    type={showPassword ? 'text' : 'password'}
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Department & Phone Input Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="admin-dept">
                  Department <span className="text-destructive">*</span>
                </label>
                <input
                  id="admin-dept"
                  type="text"
                  className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  placeholder="Management"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="admin-phone">
                  Phone Number <span className="text-destructive">*</span>
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
                  <span className="text-xs text-emerald-500 flex items-center gap-1 font-semibold mt-0.5">
                    <CheckCircle2 size={13} /> Valid phone number
                  </span>
                )}
                {isPhoneValid === false && (
                  <span className="text-xs text-destructive flex items-center gap-1 font-semibold mt-0.5">
                    <XCircle size={13} /> Phone number must contain digits only
                  </span>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed text-base mt-2 mb-6"
            >
              {loading ? (
                <LoaderCircle size={20} className="animate-spin" />
              ) : (
                <>
                  <span>
                    {(codeMatchAnalysis?.type === 'EXACT_CODE' || nameMatchAnalysis?.isExact)
                      ? 'Duplicate Company - Registration Blocked'
                      : 'Create Company & Provision Admin'}
                  </span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      {/* ── SUCCESS CREATED MODAL DIALOG ── */}
      {createdData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-2xl space-y-6 text-center"
          >
            <div>
              <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-foreground">Company Admin Created! 🎉</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Super Admin account provisioned for <strong>{createdData.companyName}</strong>.
              </p>
            </div>

            <div className="rounded-2xl bg-muted/60 border border-border p-4 text-sm text-left space-y-2 font-medium">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Company Code:</span>
                <span className="font-bold text-primary font-mono">{createdData.companyCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Admin Name:</span>
                <span className="font-semibold text-foreground">{createdData.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Username:</span>
                <span className="font-semibold text-foreground font-mono">{createdData.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-semibold text-foreground">{createdData.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Password:</span>
                <span className="font-semibold text-foreground font-mono">{createdData.passwordText}</span>
              </div>
            </div>

            <div className="grid gap-2.5">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="w-full h-11 rounded-xl border border-border bg-card text-foreground font-semibold flex items-center justify-center gap-2 hover:bg-muted transition-colors text-sm"
              >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                <span>{copied ? 'Credentials Copied!' : 'Copy All Credentials'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="h-11 rounded-xl border border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted font-semibold text-sm transition-colors"
                >
                  Create Another
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Go to Login
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── REGISTERED COMPANIES OVERVIEW MODAL ── */}
      {showCompaniesModal && (
        <div
          className={`fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center transition-all ${
            isFullScreen ? 'p-0' : 'p-4 sm:p-6'
          }`}
        >
          <div
            className={`w-full bg-card shadow-2xl flex flex-col overflow-hidden transition-all ${
              isFullScreen
                ? 'h-full w-full max-w-none rounded-none border-0'
                : 'max-w-5xl max-h-[90vh] rounded-3xl border border-border/80'
            }`}
          >
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-border/80 flex items-center justify-between bg-muted/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
                  <Building2 size={22} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-foreground">Registered Organizations Directory</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Live breakdown of all client companies, assigned employees, and onboarded vendors.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground text-xs font-semibold transition-colors"
                  title={isFullScreen ? 'Exit Full Screen' : 'Expand Full Screen'}
                >
                  {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span>{isFullScreen ? 'Exit' : 'Full Screen'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCompaniesModal(false)}
                  className="size-9 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                  aria-label="Close directory"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Summary Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-muted/50 border border-border/60 flex items-center gap-3.5">
                  <div className="size-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-foreground">{companiesList.length}</div>
                    <div className="text-xs font-semibold text-muted-foreground">Registered Companies</div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-muted/50 border border-border/60 flex items-center gap-3.5">
                  <div className="size-11 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                    <Users size={22} />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-foreground">{totalUsersAcrossAll}</div>
                    <div className="text-xs font-semibold text-muted-foreground">Total Active Users</div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-muted/50 border border-border/60 flex items-center gap-3.5">
                  <div className="size-11 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
                    <Truck size={22} />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-foreground">{totalVendorsAcrossAll}</div>
                    <div className="text-xs font-semibold text-muted-foreground">Total Vendors Onboarded</div>
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative flex items-center">
                <Search size={17} className="absolute left-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search company by name, code (e.g. TATA), or Super Admin..."
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-10 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                {companySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCompanySearchQuery('')}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Companies Grid List */}
              {filteredCompanies.length === 0 ? (
                <div className="p-10 text-center rounded-2xl bg-muted/30 border border-dashed border-border text-muted-foreground">
                  <Building2 size={36} className="mx-auto opacity-40 mb-2" />
                  <p className="text-sm font-semibold">
                    {companiesList.length === 0 ? 'No registered companies found.' : 'No matching companies found for your search.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredCompanies.map((c) => (
                    <div
                      key={c.companyCode}
                      className="rounded-2xl border border-border/80 bg-background/80 p-5 flex flex-col justify-between gap-4 shadow-sm hover:border-border transition-all"
                    >
                      {/* Top Row: Company Info & Badges */}
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 text-primary font-black text-sm flex items-center justify-center shrink-0">
                              {c.companyCode.slice(0, 3)}
                            </div>
                            <div>
                              <h4 className="text-base font-bold text-foreground leading-tight">{c.companyName}</h4>
                              <span className="text-xs text-muted-foreground">
                                Code: <strong className="text-primary font-mono">{c.companyCode}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                                c.isActive !== false
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                                  : 'bg-destructive/10 border-destructive/30 text-destructive'
                              }`}
                            >
                              {c.isActive !== false ? 'Active' : 'Disabled'}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold border border-border bg-muted/50 text-muted-foreground">
                              {c.defaultCurrency}
                            </span>
                          </div>
                        </div>

                        {/* Counts Metrics Badge */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Users size={16} className="text-emerald-500 shrink-0" />
                              <div>
                                <div className="text-base font-black text-emerald-500 leading-tight">
                                  {c.usersCount} <span className="text-xs opacity-75 font-semibold">/ {c.maxUsers || 50}</span>
                                </div>
                                <div className="text-[11px] font-semibold text-muted-foreground">Users Limit</div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEditLimitCompany({
                                  code: c.companyCode,
                                  name: c.companyName,
                                  currentMaxUsers: c.maxUsers || 50,
                                  currentMaxVendors: c.maxVendors || 50,
                                });
                                setEditMaxUsersVal(String(c.maxUsers || 50));
                                setEditMaxVendorsVal(String(c.maxVendors || 50));
                                setLimitUpdateError(null);
                                setLimitUpdateSuccess(null);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/20 text-emerald-500 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                              title={`Edit quotas for ${c.companyName}`}
                            >
                              <Edit3 size={12} />
                              <span>Edit</span>
                            </button>
                          </div>

                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Truck size={16} className="text-amber-500 shrink-0" />
                              <div>
                                <div className="text-base font-black text-amber-500 leading-tight">
                                  {c.vendorsCount} <span className="text-xs opacity-75 font-semibold">/ {c.maxVendors || 50}</span>
                                </div>
                                <div className="text-[11px] font-semibold text-muted-foreground">Vendors Limit</div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEditLimitCompany({
                                  code: c.companyCode,
                                  name: c.companyName,
                                  currentMaxUsers: c.maxUsers || 50,
                                  currentMaxVendors: c.maxVendors || 50,
                                });
                                setEditMaxUsersVal(String(c.maxUsers || 50));
                                setEditMaxVendorsVal(String(c.maxVendors || 50));
                                setLimitUpdateError(null);
                                setLimitUpdateSuccess(null);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/20 text-amber-500 text-xs font-bold hover:bg-amber-500/30 transition-colors"
                              title={`Edit quotas for ${c.companyName}`}
                            >
                              <Edit3 size={12} />
                              <span>Edit</span>
                            </button>
                          </div>
                        </div>

                        {/* Super Admin Primary Contact */}
                        {c.superAdmin && (
                          <div className="pt-2.5 border-t border-dashed border-border/60 text-xs text-muted-foreground space-y-1">
                            <div className="flex justify-between">
                              <span className="font-bold text-foreground">Super Admin:</span>
                              <span className="font-semibold text-foreground">{c.superAdmin.fullName}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Email:</span>
                              <span className="text-foreground">{c.superAdmin.email}</span>
                            </div>
                            {c.superAdmin.phone && (
                              <div className="flex justify-between">
                                <span>Phone:</span>
                                <span className="text-foreground">{c.superAdmin.phone}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="grid grid-cols-[1fr_auto] gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleToggleCompanyStatus(c.companyCode)}
                          disabled={togglingCompanyCode === c.companyCode}
                          className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                            c.isActive !== false
                              ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                          }`}
                        >
                          {togglingCompanyCode === c.companyCode ? (
                            <LoaderCircle size={14} className="animate-spin" />
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
                          className="h-9 px-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
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

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {deleteConfirmCompany && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-2xl text-center space-y-5"
          >
            <div className="size-16 rounded-full bg-destructive/10 border border-destructive/30 text-destructive flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>

            <div>
              <h3 className="text-xl font-bold tracking-tight text-foreground">Delete Organization?</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Are you sure you want to permanently delete company <strong>{deleteConfirmCompany.name}</strong> (<strong className="text-primary">{deleteConfirmCompany.code}</strong>)?
              </p>
            </div>

            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs text-destructive text-left flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>This will remove all associated Users, Vendors, Roles, and Settings for this company code. This action <strong>cannot be undone</strong>.</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmCompany(null)}
                disabled={isDeletingCompany}
                className="h-11 rounded-xl border border-border bg-transparent text-muted-foreground hover:text-foreground font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCompany}
                disabled={isDeletingCompany}
                className="h-11 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-destructive/90 transition-colors shadow-sm"
              >
                {isDeletingCompany ? <LoaderCircle size={18} className="animate-spin" /> : <Trash2 size={16} />}
                <span>Delete</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── DELETE SUCCESS MODAL ── */}
      {deleteSuccessCompany && (
        <div className="fixed inset-0 z-[61] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-2xl text-center space-y-5"
          >
            <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 size={34} />
            </div>

            <div>
              <h3 className="text-2xl font-bold tracking-tight text-foreground">Company Deleted! 🗑️</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Company <strong>{deleteSuccessCompany.name}</strong> (<strong className="text-primary">{deleteSuccessCompany.code}</strong>) and all its associated data have been permanently removed.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDeleteSuccessCompany(null)}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm"
            >
              Got it!
            </button>
          </motion.div>
        </div>
      )}

      {/* ── EDIT COMPANY LIMITS MODAL ── */}
      {editLimitCompany && (
        <div className="fixed inset-0 z-[62] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Update Organization Limits</h3>
                  <span className="text-xs text-muted-foreground">
                    {editLimitCompany.name} (<strong className="text-primary">{editLimitCompany.code}</strong>)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditLimitCompany(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {limitUpdateError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs font-medium text-destructive">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{limitUpdateError}</span>
              </div>
            )}

            {limitUpdateSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-500">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{limitUpdateSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveCompanyLimits} className="grid gap-4">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="edit-max-users-input">
                  User Limit (Max Users) <span className="text-destructive">*</span>
                </label>
                <input
                  id="edit-max-users-input"
                  type="number"
                  min="1"
                  max="100000"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={editMaxUsersVal}
                  onChange={(e) => setEditMaxUsersVal(e.target.value)}
                  placeholder="e.g. 50"
                  required
                  autoFocus
                />
                <span className="text-[11px] text-muted-foreground">
                  Current user quota: <strong>{editLimitCompany.currentMaxUsers} users</strong>
                </span>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="edit-max-vendors-input">
                  Vendor Limit (Max Vendors) <span className="text-destructive">*</span>
                </label>
                <input
                  id="edit-max-vendors-input"
                  type="number"
                  min="1"
                  max="100000"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={editMaxVendorsVal}
                  onChange={(e) => setEditMaxVendorsVal(e.target.value)}
                  placeholder="e.g. 50"
                  required
                />
                <span className="text-[11px] text-muted-foreground">
                  Current vendor quota: <strong>{editLimitCompany.currentMaxVendors} vendors</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setEditLimitCompany(null)}
                  className="h-11 rounded-xl border border-border bg-transparent text-muted-foreground hover:text-foreground font-semibold text-sm transition-colors"
                  disabled={isUpdatingLimit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingLimit}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {isUpdatingLimit ? 'Saving...' : 'Save Limits'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </main>
  );
}
