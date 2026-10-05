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
  Server,
  Globe,
  Activity,
  RefreshCw,
  ExternalLink,
  Plus,
  Mail,
  Phone,
  Radio,
  SlidersHorizontal,
  ChevronRight,
  Terminal,
  LogOut,
} from 'lucide-react';
import { API_BASE } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import PhoneInput from '../../components/shared/PhoneInput';
import heliflowLogo from '../../assets/heliflow.png';
import { motionTransition } from '../../lib/motion';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { PageFrame, PageLead, MetricCard, EmptyState } from '../../components/ui/product';

// Master Security Passcode
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

export interface StandaloneDeploymentItem {
  id: string;
  licenseKey: string;
  companyName: string;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  serverIp: string | null;
  domainUrl: string | null;
  appVersion: string | null;
  usersCount: number;
  vendorsCount: number;
  status: string; // 'ACTIVE' | 'SUSPENDED' | 'EXPIRED'
  lastPingAt: string | null;
  isOnline: boolean;
  notes: string | null;
  createdAt: string;
  lastPingAgoMs: number | null;
}

function formatTimeAgo(dateString?: string | null): string {
  if (!dateString) return 'Never pinged';
  const diffMs = Date.now() - new Date(dateString).getTime();
  if (diffMs < 0) return 'Just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HelicalConsultingPage() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  // Mode Selection: 'saas_multitenant' (Default) | 'standalone_deployments' | 'provision_tenant'
  const [activeTab, setActiveTab] = useState<'saas_multitenant' | 'standalone_deployments' | 'provision_tenant'>('saas_multitenant');

  // Security Lock State
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [accessKeyError, setAccessKeyError] = useState<string | null>(null);
  const [showAccessKey, setShowAccessKey] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    setIsUnlocked(false);
  }, []);

  // ── Standalone Deployments State ──────────────────────────────────────────
  const [standaloneList, setStandaloneList] = useState<StandaloneDeploymentItem[]>([]);
  const [standaloneSummary, setStandaloneSummary] = useState({
    total: 0,
    online: 0,
    offline: 0,
    suspended: 0,
  });
  const [standaloneLoading, setStandaloneLoading] = useState(false);
  const [standaloneSearchQuery, setStandaloneSearchQuery] = useState('');
  const [standaloneFilter, setStandaloneFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'SUSPENDED'>('ALL');
  const [showNewDeploymentModal, setShowNewDeploymentModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [togglingDeploymentId, setTogglingDeploymentId] = useState<string | null>(null);
  const [deleteConfirmDeployment, setDeleteConfirmDeployment] = useState<StandaloneDeploymentItem | null>(null);

  // New Deployment Form State
  const [newCompName, setNewCompName] = useState('');
  const [newLicenseKey, setNewLicenseKey] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newServerIp, setNewServerIp] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isCreatingDeployment, setIsCreatingDeployment] = useState(false);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [deploymentSuccess, setDeploymentSuccess] = useState<StandaloneDeploymentItem | null>(null);

  // ── Multi-Tenant State ────────────────────────────────────────────────────
  const [companiesList, setCompaniesList] = useState<CompanyOverviewItem[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [deleteConfirmCompany, setDeleteConfirmCompany] = useState<{ code: string; name: string } | null>(null);
  const [deleteSuccessCompany, setDeleteSuccessCompany] = useState<{ code: string; name: string } | null>(null);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);
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
  const [togglingCompanyCode, setTogglingCompanyCode] = useState<string | null>(null);

  // Provision Form State
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [createdData, setCreatedData] = useState<{
    companyCode: string;
    companyName: string;
    fullName: string;
    username: string;
    email: string;
    passwordText: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const fetchCompaniesOverview = async () => {
    setCompaniesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/companies-overview`);
      const json = await res.json();
      const list = Array.isArray(json?.data?.companies)
        ? json.data.companies
        : Array.isArray(json?.companies)
        ? json.companies
        : Array.isArray(json?.data)
        ? json.data
        : [];
      setCompaniesList(list);
    } catch {
      // Ignore background errors
    } finally {
      setCompaniesLoading(false);
    }
  };

  const fetchStandaloneDeployments = async () => {
    setStandaloneLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/standalone-deployments`);
      const json = await res.json();
      if (json.success && json.data) {
        setStandaloneList(json.data.deployments || []);
        if (json.data.summary) {
          setStandaloneSummary(json.data.summary);
        }
      }
    } catch {
      // Ignore background error
    } finally {
      setStandaloneLoading(false);
    }
  };

  useEffect(() => {
    if (isUnlocked) {
      fetchCompaniesOverview();
      fetchStandaloneDeployments();
    }
  }, [isUnlocked, activeTab]);

  // ── Standalone Handlers ───────────────────────────────────────────────────
  const handleToggleDeploymentStatus = async (id: string) => {
    setTogglingDeploymentId(id);
    try {
      const res = await fetch(`${API_BASE}/admin/standalone-deployments/${id}/toggle-status`, {
        method: 'PUT',
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Failed to toggle deployment status');
      }
      await fetchStandaloneDeployments();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingDeploymentId(null);
    }
  };

  const handleDeleteDeployment = async () => {
    if (!deleteConfirmDeployment) return;
    try {
      const res = await fetch(`${API_BASE}/admin/standalone-deployments/${deleteConfirmDeployment.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Failed to delete deployment');
      }
      setDeleteConfirmDeployment(null);
      await fetchStandaloneDeployments();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateDeployment = async (e: FormEvent) => {
    e.preventDefault();
    setDeploymentError(null);
    if (!newCompName.trim()) {
      setDeploymentError('Company Name is required');
      return;
    }

    setIsCreatingDeployment(true);
    try {
      const res = await fetch(`${API_BASE}/admin/standalone-deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: newCompName.trim(),
          licenseKey: newLicenseKey.trim() || undefined,
          domainUrl: newDomain.trim() || undefined,
          serverIp: newServerIp.trim() || undefined,
          contactPerson: newContactPerson.trim() || undefined,
          contactEmail: newContactEmail.trim() || undefined,
          contactPhone: newContactPhone.trim() || undefined,
          notes: newNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.error || 'Failed to register buyout');
      }
      setDeploymentSuccess(json.data);
      await fetchStandaloneDeployments();
    } catch (err) {
      setDeploymentError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreatingDeployment(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ── Multi-Tenant Handlers ──────────────────────────────────────────────────
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
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingCompanyCode(null);
    }
  };

  const handleConfirmDeleteCompany = async () => {
    if (!deleteConfirmCompany) return;
    setIsDeletingCompany(true);
    try {
      const res = await fetch(`${API_BASE}/auth/company/${deleteConfirmCompany.code}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || json.message || 'Failed to delete company');
      }
      setDeleteSuccessCompany(deleteConfirmCompany);
      setDeleteConfirmCompany(null);
      await fetchCompaniesOverview();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeletingCompany(false);
    }
  };

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
      setLimitUpdateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdatingLimit(false);
    }
  };

  // Filtered Standalone List
  const filteredStandaloneList = useMemo(() => {
    return standaloneList.filter((item) => {
      if (standaloneFilter === 'ONLINE' && !item.isOnline) return false;
      if (standaloneFilter === 'OFFLINE' && (item.isOnline || item.status === 'SUSPENDED')) return false;
      if (standaloneFilter === 'SUSPENDED' && item.status !== 'SUSPENDED') return false;

      if (!standaloneSearchQuery.trim()) return true;
      const q = standaloneSearchQuery.toLowerCase();
      return (
        item.companyName.toLowerCase().includes(q) ||
        item.licenseKey.toLowerCase().includes(q) ||
        (item.serverIp && item.serverIp.toLowerCase().includes(q)) ||
        (item.domainUrl && item.domainUrl.toLowerCase().includes(q)) ||
        (item.contactPerson && item.contactPerson.toLowerCase().includes(q))
      );
    });
  }, [standaloneList, standaloneFilter, standaloneSearchQuery]);

  // Filtered Multi-Tenant List
  const filteredCompaniesList = useMemo(() => {
    if (!companySearchQuery.trim()) return companiesList;
    const q = companySearchQuery.toLowerCase();
    return companiesList.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.companyCode.toLowerCase().includes(q) ||
        (c.superAdmin?.email && c.superAdmin.email.toLowerCase().includes(q))
    );
  }, [companiesList, companySearchQuery]);

  const totalCloudUsers = useMemo(
    () => companiesList.reduce((acc, c) => acc + (c.usersCount || 0), 0),
    [companiesList]
  );
  const totalCloudVendors = useMemo(
    () => companiesList.reduce((acc, c) => acc + (c.vendorsCount || 0), 0),
    [companiesList]
  );
  const activeCompaniesCount = useMemo(
    () => companiesList.filter((c) => c.isActive !== false).length,
    [companiesList]
  );
  const disabledCompaniesCount = useMemo(
    () => companiesList.filter((c) => c.isActive === false).length,
    [companiesList]
  );

  // ─── LOCK SCREEN (Fiori Styled Auth Dialog) ────────────────────────────────
  if (!isUnlocked) {
    return (
      <main className="grid min-h-svh bg-background text-foreground place-items-center relative overflow-hidden p-4 sm:p-6">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(37,99,235,0.09),transparent_30%),radial-gradient(circle_at_16%_92%,rgba(14,165,233,0.06),transparent_34%)] pointer-events-none" />

        {/* Top Right Theme Toggle */}
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
              <ShieldCheck size={13} /> SAP Enterprise Access Gate
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Helical Fleet Cockpit</h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Restricted to authorized system administrators. Enter Security Key to unlock the global fleet console.
            </p>
          </div>

          {accessKeyError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs font-medium text-destructive text-left" role="alert">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{accessKeyError}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAccessKeyError(null);
              if (accessKeyInput.trim() === SECRET_PASSCODE) {
                setIsUnlocked(true);
                setAccessKeyInput('');
              } else {
                setAccessKeyError('Invalid Access Key. Permission Denied.');
              }
            }}
            className="grid gap-4 text-left"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="access-key-input">
                Master Security Key <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  id="access-key-input"
                  type={showAccessKey ? 'text' : 'password'}
                  className="w-full h-11 px-4 pr-12 rounded-xl border border-border bg-background/60 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                  placeholder="Enter Passcode"
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

            <Button type="submit" size="lg" className="w-full h-11 font-bold text-sm">
              <KeyRound size={17} />
              <span>Unlock Fleet Cockpit</span>
            </Button>
          </form>
        </motion.div>
      </main>
    );
  }

  // ─── MAIN FULL-WIDTH SAP FIORI ENTERPRISE CONSOLE ─────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── 1. SAP FIORI HORIZON SHELL BAR (TOP HEADER) ── */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-card/90 backdrop-blur-xl shadow-xs">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand & System Title */}
          <div className="flex items-center gap-3.5">
            <img src={heliflowLogo} alt="Helical Consulting" className="size-9 rounded-xl object-contain ring-1 ring-border shadow-xs" />
            <div className="flex items-center gap-2.5">
              <span className="font-bold tracking-tight text-foreground text-base sm:text-lg">Helical Consulting</span>
              <span className="hidden sm:inline-block text-border font-light">|</span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
                <Radio size={12} className="animate-pulse text-emerald-500" /> Enterprise Fleet Cockpit
              </span>
            </div>
          </div>

          {/* Right Shell Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                fetchStandaloneDeployments();
                fetchCompaniesOverview();
              }}
              disabled={standaloneLoading || companiesLoading}
              className="h-9 px-3 rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Sync Telemetry & Fleet State"
            >
              <RefreshCw size={13} className={standaloneLoading || companiesLoading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Sync Fleet</span>
            </button>

            <button
              type="button"
              onClick={(event) => toggleTheme({ x: event.clientX, y: event.clientY })}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
              className="size-9 inline-flex items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground shadow-xs transition-colors"
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={isDark ? 'sun' : 'moon'}
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.75 }}
                >
                  {isDark ? <Sun size={15} /> : <Moon size={15} />}
                </motion.span>
              </AnimatePresence>
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(SESSION_UNLOCK_KEY);
                setIsUnlocked(false);
              }}
              className="h-9 px-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Lock Cockpit Session"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. OBJECT PAGE CONTENT CONTAINER ── */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Lead & Header */}
        <PageLead
          title="Enterprise Deployment Fleet Management"
          description="Centralized telemetry, server IP discovery, live heartbeats, and remote killswitch control across all buyout instances and cloud tenants."
          actions={
            activeTab === 'standalone_deployments' ? (
              <Button
                size="default"
                onClick={() => {
                  setDeploymentError(null);
                  setDeploymentSuccess(null);
                  setNewCompName('');
                  setNewLicenseKey(`HLF-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
                  setNewDomain('');
                  setNewServerIp('');
                  setNewContactPerson('');
                  setNewContactEmail('');
                  setNewContactPhone('');
                  setNewNotes('');
                  setShowNewDeploymentModal(true);
                }}
                className="font-bold text-xs shadow-sm gap-2"
              >
                <Plus size={16} />
                <span>Register New Buyout</span>
              </Button>
            ) : activeTab === 'saas_multitenant' ? (
              <Button
                size="default"
                onClick={() => setActiveTab('provision_tenant')}
                className="font-bold text-xs shadow-sm gap-2"
              >
                <Plus size={16} />
                <span>Provision Cloud Tenant</span>
              </Button>
            ) : null
          }
        />

        {/* ── 3. SAP HORIZON KPI ANALYTICAL CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Registered Cloud Orgs"
            value={companiesList.length}
            detail={`${activeCompaniesCount} Active Organizations`}
            icon={Building2}
            tone="primary"
          />

          <MetricCard
            label="Active Users & Seats"
            value={totalCloudUsers}
            detail={`${totalCloudVendors} Connected Vendors`}
            icon={Users}
            tone="success"
          />

          <MetricCard
            label="Dedicated Buyouts (IPs)"
            value={standaloneList.length}
            detail={`${standaloneSummary.online} Online • ${standaloneSummary.offline} Offline`}
            icon={Server}
            tone="cyan"
          />

          <MetricCard
            label="Restricted / Suspended"
            value={disabledCompaniesCount + standaloneSummary.suspended}
            detail="Disabled Orgs & Killswitches"
            icon={Ban}
            tone="danger"
          />
        </div>

        {/* ── 4. SAP FIORI ICON TAB BAR (SEGMENTED NAVIGATION) ── */}
        <div className="flex items-center gap-2 border-b border-border/80 overflow-x-auto pb-px">
          <button
            type="button"
            onClick={() => setActiveTab('saas_multitenant')}
            className={`flex items-center gap-2.5 px-4 py-3 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'saas_multitenant'
                ? 'border-primary text-primary bg-primary/[0.04]'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Building2 size={16} />
            <span>Registered Cloud Organizations</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-primary/10 text-primary">
              {companiesList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('standalone_deployments')}
            className={`flex items-center gap-2.5 px-4 py-3 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'standalone_deployments'
                ? 'border-primary text-primary bg-primary/[0.04]'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Server size={16} />
            <span>Dedicated Buyouts & Server IPs</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-muted text-muted-foreground">
              {standaloneList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('provision_tenant')}
            className={`flex items-center gap-2.5 px-4 py-3 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'provision_tenant'
                ? 'border-primary text-primary bg-primary/[0.04]'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Plus size={16} />
            <span>Provision New Cloud Tenant</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: DEDICATED STANDALONE BUYOUTS & LIVE SERVER IPS (SAP SMART TABLE)
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'standalone_deployments' && (
          <Card className="overflow-hidden border border-border/80 shadow-sm bg-card">
            {/* Table Toolbar */}
            <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col md:flex-row gap-4 items-center justify-between bg-card/50">
              <div className="relative w-full md:w-96">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by Company, Server IP, Domain, or License..."
                  value={standaloneSearchQuery}
                  onChange={(e) => setStandaloneSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs w-full md:w-auto overflow-x-auto">
                {(['ALL', 'ONLINE', 'OFFLINE', 'SUSPENDED'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStandaloneFilter(mode)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                      standaloneFilter === mode
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'ALL' && `All (${standaloneList.length})`}
                    {mode === 'ONLINE' && `🟢 Online (${standaloneSummary.online})`}
                    {mode === 'OFFLINE' && `🔴 Offline (${standaloneSummary.offline})`}
                    {mode === 'SUSPENDED' && `⛔ Suspended (${standaloneSummary.suspended})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Responsive Table */}
            {filteredStandaloneList.length === 0 ? (
              <EmptyState
                icon={Server}
                title="No Standalone Deployments Found"
                description={
                  standaloneList.length === 0
                    ? 'No client buyouts have been registered yet. Click "Register New Buyout" to issue a dedicated license.'
                    : 'No deployments match your search or filter criteria.'
                }
                action={
                  standaloneList.length === 0 ? (
                    <Button
                      size="default"
                      onClick={() => setShowNewDeploymentModal(true)}
                      className="font-bold text-xs"
                    >
                      <Plus size={16} /> Register First Buyout
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="py-3.5 px-4 sm:px-6">Company & Client</th>
                      <th className="py-3.5 px-4">License Key</th>
                      <th className="py-3.5 px-4">Server Public IP</th>
                      <th className="py-3.5 px-4">Custom Domain</th>
                      <th className="py-3.5 px-4">Telemetry & Heartbeat</th>
                      <th className="py-3.5 px-4 text-center">Users / Vendors</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs">
                    {filteredStandaloneList.map((item) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-muted/40 transition-colors ${
                          item.status === 'SUSPENDED' ? 'bg-destructive/[0.02]' : ''
                        }`}
                      >
                        {/* Company & Client */}
                        <td className="py-4 px-4 sm:px-6">
                          <div className="font-bold text-foreground text-sm">{item.companyName}</div>
                          {item.contactPerson && (
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <User size={12} className="shrink-0" />
                              <span>{item.contactPerson}</span>
                              {item.contactEmail && <span>({item.contactEmail})</span>}
                            </div>
                          )}
                        </td>

                        {/* License Key */}
                        <td className="py-4 px-4">
                          <div className="inline-flex items-center gap-1.5">
                            <code className="px-2 py-1 rounded-md bg-muted font-mono font-bold text-primary text-xs border border-border/60">
                              {item.licenseKey}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyText(item.licenseKey, item.id)}
                              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                              title="Copy License Key"
                            >
                              {copiedKey === item.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>

                        {/* Server Public IP */}
                        <td className="py-4 px-4">
                          {item.serverIp ? (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-bold text-xs border border-blue-500/20">
                                {item.serverIp}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(item.serverIp!, `ip-${item.id}`)}
                                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                                title="Copy IP Address"
                              >
                                {copiedKey === `ip-${item.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">Awaiting ping...</span>
                          )}
                        </td>

                        {/* Custom Domain */}
                        <td className="py-4 px-4">
                          {item.domainUrl ? (
                            <a
                              href={item.domainUrl.startsWith('http') ? item.domainUrl : `https://${item.domainUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                            >
                              <span>{item.domainUrl.replace(/^https?:\/\//, '')}</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">Not configured</span>
                          )}
                        </td>

                        {/* Telemetry Heartbeat */}
                        <td className="py-4 px-4">
                          <div className="font-semibold text-foreground">{formatTimeAgo(item.lastPingAt)}</div>
                          <div className="text-[11px] text-muted-foreground">v{item.appVersion || '3.0.0'}</div>
                        </td>

                        {/* Users / Vendors */}
                        <td className="py-4 px-4 text-center">
                          <div className="font-bold text-foreground">
                            {item.usersCount || 0} <span className="text-muted-foreground font-normal">users</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {item.vendorsCount || 0} vendors
                          </div>
                        </td>

                        {/* Live Status Badge */}
                        <td className="py-4 px-4">
                          {item.status === 'SUSPENDED' ? (
                            <Badge tone="danger">
                              <Ban size={12} /> SUSPENDED
                            </Badge>
                          ) : item.isOnline ? (
                            <Badge tone="success">
                              <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                              ONLINE
                            </Badge>
                          ) : (
                            <Badge tone="neutral">
                              OFFLINE
                            </Badge>
                          )}
                        </td>

                        {/* Remote Actions */}
                        <td className="py-4 px-4 sm:px-6 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleDeploymentStatus(item.id)}
                              disabled={togglingDeploymentId === item.id}
                              className={`h-8 px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                item.status === 'ACTIVE'
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                              }`}
                              title={item.status === 'ACTIVE' ? 'Remotely Suspend/Lock License' : 'Activate License'}
                            >
                              {togglingDeploymentId === item.id ? (
                                <LoaderCircle size={13} className="animate-spin" />
                              ) : item.status === 'ACTIVE' ? (
                                <>
                                  <Ban size={13} />
                                  <span>Suspend</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={13} />
                                  <span>Activate</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteConfirmDeployment(item)}
                              className="size-8 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete Deployment"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: CLOUD MULTI-TENANT ORGANIZATIONS (DIRECTORY VIEW)
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'saas_multitenant' && (
          <Card className="overflow-hidden border border-border/80 shadow-sm bg-card">
            {/* Toolbar */}
            <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col md:flex-row gap-4 items-center justify-between bg-card/50">
              <div className="relative w-full md:w-96">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search organization by name or code..."
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>

              <div className="text-xs text-muted-foreground font-semibold">
                Showing {filteredCompaniesList.length} of {companiesList.length} organizations
              </div>
            </div>

            {/* Table */}
            {filteredCompaniesList.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No Organizations Found"
                description="No multi-tenant organizations found matching your search."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="py-3.5 px-4 sm:px-6">Company Name</th>
                      <th className="py-3.5 px-4">Company Code</th>
                      <th className="py-3.5 px-4">Primary Super Admin</th>
                      <th className="py-3.5 px-4 text-center">User Quota</th>
                      <th className="py-3.5 px-4 text-center">Vendor Quota</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs">
                    {filteredCompaniesList.map((c) => (
                      <tr key={c.companyCode} className="hover:bg-muted/40 transition-colors">
                        <td className="py-4 px-4 sm:px-6">
                          <div className="font-bold text-foreground text-sm">{c.companyName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Created {new Date(c.createdAt).toLocaleDateString()}
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <code className="px-2 py-1 rounded-md bg-muted font-mono font-bold text-primary text-xs border border-border/60">
                            {c.companyCode}
                          </code>
                        </td>

                        <td className="py-4 px-4">
                          {c.superAdmin ? (
                            <div>
                              <div className="font-semibold text-foreground">{c.superAdmin.fullName}</div>
                              <div className="text-[11px] text-muted-foreground">{c.superAdmin.email}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">None</span>
                          )}
                        </td>

                        <td className="py-4 px-4 text-center">
                          <span className="font-bold text-foreground">{c.usersCount || 0}</span>
                          <span className="text-muted-foreground"> / {c.maxUsers || 50}</span>
                        </td>

                        <td className="py-4 px-4 text-center">
                          <span className="font-bold text-foreground">{c.vendorsCount || 0}</span>
                          <span className="text-muted-foreground"> / {c.maxVendors || 50}</span>
                        </td>

                        <td className="py-4 px-4">
                          <Badge tone={c.isActive !== false ? 'success' : 'danger'}>
                            {c.isActive !== false ? 'Active' : 'Disabled'}
                          </Badge>
                        </td>

                        <td className="py-4 px-4 sm:px-6 text-right">
                          <div className="inline-flex items-center gap-2">
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
                              className="h-8 px-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                              title="Edit Limits"
                            >
                              <Edit3 size={12} />
                              <span>Limits</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleCompanyStatus(c.companyCode)}
                              disabled={togglingCompanyCode === c.companyCode}
                              className={`h-8 px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                                c.isActive !== false
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                              }`}
                            >
                              {togglingCompanyCode === c.companyCode ? (
                                <LoaderCircle size={12} className="animate-spin" />
                              ) : c.isActive !== false ? (
                                <>
                                  <Ban size={12} />
                                  <span>Disable</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={12} />
                                  <span>Enable</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteConfirmCompany({ code: c.companyCode, name: c.companyName })}
                              className="size-8 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete Organization"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: PROVISION NEW CLOUD TENANT (PROVISIONING FORM)
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'provision_tenant' && (
          <Card className="max-w-4xl mx-auto p-6 sm:p-8 border border-border/80 shadow-md bg-card space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="text-xl font-bold text-foreground">Provision Cloud Tenant Organization</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Creates an isolated multi-tenant organization database partition and provisions initial Super Admin credentials.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-medium text-destructive">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form
              className="grid gap-6"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                const cleanCode = companyCode.trim().toUpperCase();
                if (!cleanCode || cleanCode.length < 2) {
                  setError('Company Code must be at least 2 characters.');
                  return;
                }
                if (!companyName.trim()) {
                  setError('Company Name is required.');
                  return;
                }
                if (!fullName.trim() || !username.trim() || !email.trim() || !password) {
                  setError('Please fill in all Super Admin credentials.');
                  return;
                }
                if (password.length < 8) {
                  setError('Password must be at least 8 characters long.');
                  return;
                }
                if (password !== confirmPassword) {
                  setError('Password and Confirm Password do not match.');
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
                    throw new Error(json.error || json.message || 'Failed to register company admin');
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
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {/* Section 1 */}
              <div className="space-y-4">
                <div className="text-sm font-bold text-foreground border-b border-border/60 pb-2 flex items-center gap-2">
                  <Building2 size={16} className="text-primary" />
                  <span>1. Organization Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Company Code *</label>
                    <input
                      type="text"
                      placeholder="e.g. TATA"
                      value={companyCode}
                      onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs uppercase focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Company Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Tata Steel Limited"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">User Quota</label>
                    <input
                      type="number"
                      value={maxUsers}
                      onChange={(e) => setMaxUsers(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Vendor Quota</label>
                    <input
                      type="number"
                      value={maxVendors}
                      onChange={(e) => setMaxVendors(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Section 2 */}
              <div className="space-y-4">
                <div className="text-sm font-bold text-foreground border-b border-border/60 pb-2 flex items-center gap-2">
                  <User size={16} className="text-primary" />
                  <span>2. Super Admin Account</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Admin Full Name *</label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Username *</label>
                    <input
                      type="text"
                      placeholder="johndoe"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Email Address *</label>
                    <input
                      type="email"
                      placeholder="admin@client.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Password *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-10 px-3.5 pr-10 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-0 top-0 inline-flex size-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Confirm Password *</label>
                    <input
                      type="password"
                      placeholder="Repeat password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-10 px-3.5 rounded-xl border border-border bg-background text-xs focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border/80">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab('saas_multitenant')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="font-bold">
                  {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  <span>{loading ? 'Provisioning...' : 'Provision Tenant'}</span>
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>

      {/* ── REGISTER STANDALONE MODAL (SAP FIORI DIALOG) ── */}
      {showNewDeploymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-2xl space-y-5 my-8"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <Server size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Register Dedicated Buyout</h3>
                  <p className="text-xs text-muted-foreground">Issue dedicated instance license & domain binding</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewDeploymentModal(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X size={18} />
              </button>
            </div>

            {deploymentError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs font-medium text-destructive">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{deploymentError}</span>
              </div>
            )}

            {deploymentSuccess ? (
              <div className="space-y-4 text-center py-2">
                <div className="size-14 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={30} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-foreground">Buyout Registered Successfully! 🚀</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add the License Key to the client's `.env` file on their server.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-muted/60 border border-border text-left font-mono text-xs space-y-2">
                  <div><strong>Company:</strong> {deploymentSuccess.companyName}</div>
                  <div><strong>License Key:</strong> <span className="text-primary font-bold">{deploymentSuccess.licenseKey}</span></div>
                  {deploymentSuccess.domainUrl && <div><strong>Domain:</strong> {deploymentSuccess.domainUrl}</div>}
                  {deploymentSuccess.serverIp && <div><strong>Server IP:</strong> {deploymentSuccess.serverIp}</div>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const envSnippet = `# Client Server .env configuration\nLICENSE_KEY="${deploymentSuccess.licenseKey}"\nCOMPANY_NAME="${deploymentSuccess.companyName}"\nHELICAL_MASTER_URL="https://api.helicalconsulting.com"\nCLIENT_URL="${deploymentSuccess.domainUrl || 'https://erp.client.com'}"`;
                      navigator.clipboard.writeText(envSnippet);
                      setCopiedKey('env-snippet');
                      setTimeout(() => setCopiedKey(null), 2000);
                    }}
                    className="font-bold text-xs"
                  >
                    {copiedKey === 'env-snippet' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    <span>{copiedKey === 'env-snippet' ? 'Copied .env!' : 'Copy .env Config'}</span>
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      setShowNewDeploymentModal(false);
                      setDeploymentSuccess(null);
                    }}
                    className="font-bold text-xs"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateDeployment} className="grid gap-3.5">
                <div className="grid gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Client Company Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corporation Pvt Ltd"
                    value={newCompName}
                    onChange={(e) => setNewCompName(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/50"
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      License Key
                    </label>
                    <input
                      type="text"
                      placeholder="Auto-generated if empty"
                      value={newLicenseKey}
                      onChange={(e) => setNewLicenseKey(e.target.value.toUpperCase())}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground font-mono text-xs focus:ring-2 focus:ring-primary/50 uppercase"
                    />
                  </div>

                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Client Custom Domain
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. erp.clientcorp.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Server Static IP (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Auto-detected on heartbeat"
                      value={newServerIp}
                      onChange={(e) => setNewServerIp(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground font-mono text-xs focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rajesh Kumar (CTO)"
                      value={newContactPerson}
                      onChange={(e) => setNewContactPerson(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      placeholder="rajesh@clientcorp.com"
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div className="grid gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="+91 9876543210"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      className="w-full h-10 px-3.5 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

                <div className="grid gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Deal / License Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. 1-Year AMC included, deployed on AWS Mumbai EC2"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewDeploymentModal(false)}
                    className="font-semibold text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isCreatingDeployment}
                    className="font-bold text-xs"
                  >
                    {isCreatingDeployment ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
                    <span>{isCreatingDeployment ? 'Registering...' : 'Register Buyout'}</span>
                  </Button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* ── DELETE STANDALONE DEPLOYMENT MODAL ── */}
      {deleteConfirmDeployment && (
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
              <h3 className="text-xl font-bold tracking-tight text-foreground">Remove Standalone Deployment?</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Are you sure you want to remove deployment record for <strong>{deleteConfirmDeployment.companyName}</strong> (License: <code className="text-primary font-bold">{deleteConfirmDeployment.licenseKey}</code>)?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmDeployment(null)}
                className="font-semibold text-sm"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteDeployment}
                className="font-bold text-sm"
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </Button>
            </div>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditLimitCompany(null)}
                  className="font-semibold text-sm"
                  disabled={isUpdatingLimit}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isUpdatingLimit}
                  className="font-bold text-sm"
                >
                  {isUpdatingLimit ? 'Saving...' : 'Save Limits'}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ── DELETE MULTI-TENANT CONFIRMATION MODAL ── */}
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

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirmCompany(null)}
                disabled={isDeletingCompany}
                className="font-semibold text-sm"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmDeleteCompany}
                disabled={isDeletingCompany}
                className="font-bold text-sm"
              >
                {isDeletingCompany ? <LoaderCircle size={18} className="animate-spin" /> : <Trash2 size={16} />}
                <span>Delete</span>
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── PROVISION SUCCESS MODAL ── */}
      {createdData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-2xl space-y-5"
          >
            <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 size={34} />
            </div>

            <div className="text-center">
              <h3 className="text-2xl font-bold text-foreground">Organization Provisioned! 🎉</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {createdData.companyName} (<strong className="text-primary">{createdData.companyCode}</strong>) is ready.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-muted/60 border border-border/80 text-xs space-y-2 font-mono">
              <div><strong>Company Code:</strong> {createdData.companyCode}</div>
              <div><strong>Username:</strong> {createdData.username}</div>
              <div><strong>Email:</strong> {createdData.email}</div>
              <div><strong>Password:</strong> {createdData.passwordText}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const text = `Company: ${createdData.companyName} (${createdData.companyCode})\nUsername: ${createdData.username}\nEmail: ${createdData.email}\nPassword: ${createdData.passwordText}\nLogin URL: ${window.location.origin}/login`;
                  navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="font-bold text-xs"
              >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                <span>{copied ? 'Copied!' : 'Copy Credentials'}</span>
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setCreatedData(null);
                  setActiveTab('saas_multitenant');
                }}
                className="font-bold text-xs"
              >
                Done
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
