import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { companySettingsService, type CompanyProfile } from '../services/companySettingsService';
import heliflowLogo from '../assets/heliflow.png';
import procnexLogo from '../assets/procnex.png';

// ─── Local Storage Keys ────────────────────────────────────
function getActiveCompanyCode(): string | null {
  try {
    const userRaw = localStorage.getItem('heliflow_user');
    if (userRaw) {
      const u = JSON.parse(userRaw);
      if (u?.companyCode) return String(u.companyCode).toUpperCase();
    }
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const empMatch = path.match(/^\/e\/([a-zA-Z0-9_-]+)/);
    if (empMatch && empMatch[1] && empMatch[1].toUpperCase() !== 'LOGIN') {
      return empMatch[1].toUpperCase();
    }
    const vendorMatch = path.match(/^\/v\/([a-zA-Z0-9_-]+)/);
    if (vendorMatch && vendorMatch[1] && vendorMatch[1].toUpperCase() !== 'LOGIN') {
      return vendorMatch[1].toUpperCase();
    }
    const employeeCode = localStorage.getItem('employee_company_code');
    if (employeeCode) return String(employeeCode).toUpperCase();
    const vendorCode = localStorage.getItem('vendor_company_code');
    if (vendorCode) return String(vendorCode).toUpperCase();
  } catch {}
  return null;
}

function getCacheKey(): string {
  const cc = getActiveCompanyCode();
  return cc ? `heliflow_branding_cache_${cc}` : 'heliflow_branding_cache_GLOBAL';
}

function readCachedProfile(): CompanyProfile | null {
  try {
    const raw = localStorage.getItem(getCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanyProfile;
    const currentCc = getActiveCompanyCode();
    if (currentCc && parsed.companyCode && parsed.companyCode.toUpperCase() !== currentCc) {
      return null; // Stale cache from different company
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: CompanyProfile): void {
  try {
    const key = profile.companyCode
      ? `heliflow_branding_cache_${profile.companyCode.toUpperCase()}`
      : getCacheKey();
    localStorage.setItem(key, JSON.stringify(profile));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

const TITLE_CACHE_KEY = 'heliflow_tab_title';

function readCachedTitle(): string | null {
  try {
    return localStorage.getItem(TITLE_CACHE_KEY);
  } catch {
    return null;
  }
}

function writeCachedTitle(title: string): void {
  try {
    localStorage.setItem(TITLE_CACHE_KEY, title);
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ─── Types ──────────────────────────────────────────────────

interface BrandingContextType {
  /** Company display name */
  companyName: string;
  /** Company phone number from branding settings */
  companyPhone: string | null;
  /** Company email from branding settings */
  companyEmail: string | null;
  /** Company website from branding settings */
  companyWebsite: string | null;
  /** Company address from branding settings */
  companyAddress: string | null;
  /** Company city from branding settings */
  companyCity: string | null;
  /** Company state / province from branding settings */
  companyState: string | null;
  /** Company country from branding settings */
  companyCountry: string | null;
  /** Logo URL */
  logoUrl: string | null;
  /** Favicon URL */
  faviconUrl: string | null;
  /** Primary color hex */
  primaryColor: string;
  /** Dynamically set and preview/apply the primary branding color */
  setPrimaryColor: (color: string) => void;
  /** Login page heading / subtitle text */
  loginText: string | null;
  /** Support email */
  supportEmail: string | null;
  /** Primary portal display name (e.g. "Employee") */
  primaryPortalName: string;
  /** Full profile from backend */
  profile: CompanyProfile | null;
  /** Whether branding has been loaded */
  loaded: boolean;
  /** Refresh branding from backend */
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

// ─── Defaults ───────────────────────────────────────────────

export const DEFAULT_PRIMARY = '#0a6ed1';
const DEFAULT_TITLE = 'Enterprise Procurement Platform';

// ─── Color shade generation ─────────────────────────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '');
  let fullHex = clean;
  if (clean.length === 3) {
    fullHex = clean.split('').map((c) => c + c).join('');
  }
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fullHex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

export function shade(hex: string, mixColor: string, amount: number): string {
  const c = hexToRgb(hex);
  const m = hexToRgb(mixColor);
  if (!c || !m) return hex;
  return `#${['r', 'g', 'b']
    .map((ch) => {
      const val = Math.round(
        c[ch as keyof typeof c] + (m[ch as keyof typeof m] - c[ch as keyof typeof c]) * amount
      );
      return Math.max(0, Math.min(255, val)).toString(16).padStart(2, '0');
    })
    .join('')}`;
}

/** Check contrast luminance and pick accessible text color (#ffffff or #0f172a) */
function getContrastForeground(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  // Standard relative luminance
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.65 ? '#0f172a' : '#ffffff';
}

/** Generate the full application-wide design token palette from a base primary hex */
export function generatePrimaryPalette(rawHex: string): Record<string, string> {
  const hex = rawHex && /^#?[0-9a-fA-F]{3,6}$/.test(rawHex.trim())
    ? (rawHex.trim().startsWith('#') ? rawHex.trim() : `#${rawHex.trim()}`)
    : DEFAULT_PRIMARY;

  const rgb = hexToRgb(hex) || { r: 10, g: 110, b: 209 };
  const rgbStr = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

  const p50 = shade(hex, '#ffffff', 0.94);
  const p100 = shade(hex, '#ffffff', 0.84);
  const p200 = shade(hex, '#ffffff', 0.68);
  const p300 = shade(hex, '#ffffff', 0.46);
  const p400 = shade(hex, '#ffffff', 0.22);
  const p500 = hex;
  const p600 = shade(hex, '#000000', 0.16);
  const p700 = shade(hex, '#000000', 0.28);
  const p800 = shade(hex, '#000000', 0.44);
  const p900 = shade(hex, '#000000', 0.62);

  const lightRgb = hexToRgb(p300) || { r: 77, g: 177, b: 255 };
  const lightRgbStr = `${lightRgb.r}, ${lightRgb.g}, ${lightRgb.b}`;

  // Dark mode primary: tune for contrast against dark background (#0b111b)
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const darkPrimary = lum < 0.45 ? shade(hex, '#ffffff', 0.32) : hex;
  const darkRing = shade(hex, '#ffffff', 0.42);

  return {
    '--primary-50': p50,
    '--primary-100': p100,
    '--primary-200': p200,
    '--primary-300': p300,
    '--primary-400': p400,
    '--primary-500': p500,
    '--primary-600': p600,
    '--primary-700': p700,
    '--primary-800': p800,
    '--primary-900': p900,

    '--primary-rgb': rgbStr,
    '--primary-light-rgb': lightRgbStr,

    // Primary action variants
    '--primary-hover': p600,
    '--primary-active': p700,
    '--primary-focus': p400,
    '--primary-subtle': p50,

    // Vendor portal aliases
    '--vendor-primary': p500,
    '--vendor-primary-light': p300,
    '--vendor-primary-dark': p700,
    '--vendor-accent': p400,

    // Dark mode adaptive tokens
    '--primary-dark': darkPrimary,
    '--primary-dark-accent': `rgba(${rgbStr}, 0.22)`,
    '--primary-dark-ring': darkRing,

    // Shell sidebar backgrounds (mode-specific)
    '--shell-bg-light': 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    '--shell-bg-dark': `linear-gradient(175deg, #0d1b2a 0%, #101b27 45%, ${shade(hex, '#000000', 0.7)} 100%)`,

    // Card Selection & Interactive Glow System
    '--card-glow-border': `rgba(${rgbStr}, 0.38)`,
    '--card-glow-shadow': `0 0 0 1.5px rgba(${rgbStr}, 0.2), 0 4px 14px rgba(${rgbStr}, 0.08)`,
    '--card-glow-bg': `rgba(${rgbStr}, 0.05)`,
    '--card-glow-border-light': `rgba(${rgbStr}, 0.38)`,
    '--card-glow-shadow-light': `0 0 0 1.5px rgba(${rgbStr}, 0.2), 0 4px 14px rgba(${rgbStr}, 0.08)`,
    '--card-glow-bg-light': `rgba(${rgbStr}, 0.05)`,
    '--card-glow-border-dark': `rgba(${rgbStr}, 0.45)`,
    '--card-glow-shadow-dark': `0 0 0 1px rgba(${rgbStr}, 0.3), 0 2px 8px rgba(0, 0, 0, 0.35)`,
    '--card-glow-bg-dark': `rgba(${rgbStr}, 0.06)`,

    // Reusable interactive glow system tokens
    '--interactive-glow-focus': `0 0 0 2px rgba(${rgbStr}, 0.22)`,
    '--interactive-glow-subtle': `0 0 8px rgba(${rgbStr}, 0.12)`,
    '--interactive-glow-button': `0 2px 8px rgba(${rgbStr}, 0.25)`,
  };
}

/** Apply CSS custom properties to documentElement synchronously */
export function applyPrimaryColor(hex: string) {
  if (typeof document === 'undefined') return;
  const palette = generatePrimaryPalette(hex);
  const root = document.documentElement;

  // Clean up any stale inline theme overrides so CSS [data-theme="dark"] and [data-theme="light"] rules work correctly
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-foreground');
  root.style.removeProperty('--primary');
  root.style.removeProperty('--primary-foreground');
  root.style.removeProperty('--ring');
  root.style.removeProperty('--border-focus');
  root.style.removeProperty('--shell-bg');
  root.style.removeProperty('--shell-accent');
  root.style.removeProperty('--shell-text');
  root.style.removeProperty('--shell-text-secondary');
  root.style.removeProperty('--shell-border');

  for (const [key, val] of Object.entries(palette)) {
    root.style.setProperty(key, val);
  }
}

// ─── Immediate Synchronous Initialization ───────────────────
// Guarantees no flash of default blue on page refresh or navigation
try {
  const initialCache = readCachedProfile();
  applyPrimaryColor(initialCache?.primaryColor || DEFAULT_PRIMARY);
} catch {
  applyPrimaryColor(DEFAULT_PRIMARY);
}

/** Apply favicon — defaults to explicit faviconUrl -> logoUrl -> default icon */
export function applyFavicon(faviconUrl: string | null, logoUrl: string | null = null) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  const rawTarget = faviconUrl || logoUrl;
  const isValidUrl = rawTarget && (rawTarget.startsWith('http://') || rawTarget.startsWith('https://') || rawTarget.startsWith('data:') || rawTarget.startsWith('/'));
  const targetUrl = isValidUrl ? rawTarget : '/Procnex-logo.jpeg';
  if (link.getAttribute('href') === targetUrl) {
    return;
  }
  if (targetUrl.endsWith('.svg')) {
    link.type = 'image/svg+xml';
  } else if (targetUrl.endsWith('.jpeg') || targetUrl.endsWith('.jpg')) {
    link.type = 'image/jpeg';
  } else if (targetUrl.endsWith('.ico')) {
    link.type = 'image/x-icon';
  } else {
    link.type = 'image/png';
  }
  link.crossOrigin = 'anonymous';
  link.referrerPolicy = 'no-referrer';
  link.href = targetUrl;
}

/** Apply document title — persists to localStorage so it survives refreshes */
export function applyTitle(name: string | null) {
  let title = name || DEFAULT_TITLE;
  if (!title.includes('— Procurement Automation Software') && !title.includes('— Digital Procurement Platform') && !title.includes('— Vendor Portal') && !title.includes('— Enterprise Procurement Platform')) {
    title = `${title} — Digital Procurement Platform`;
  }
  document.title = title;
  writeCachedTitle(title);
}

// ─── Provider ───────────────────────────────────────────────

export function BrandingProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage first
  const [profile, setProfile] = useState<CompanyProfile | null>(() => {
    const cached = readCachedProfile();
    if (cached?.primaryColor) {
      applyPrimaryColor(cached.primaryColor);
    }
    return cached;
  });
  const [loaded, setLoaded] = useState(false);

  const setPrimaryColor = useCallback((color: string) => {
    applyPrimaryColor(color);
    setProfile((prev) => {
      const updated = prev ? { ...prev, primaryColor: color } : ({ primaryColor: color } as CompanyProfile);
      writeCachedProfile(updated);
      return updated;
    });
    window.dispatchEvent(new CustomEvent('heliflow_primary_color_change', { detail: { color } }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      let p = await companySettingsService.getCompanyProfile();

      const existing = readCachedProfile();
      if (existing && (!existing.companyCode || !p.companyCode || existing.companyCode.toUpperCase() === p.companyCode.toUpperCase())) {
        if (p.logoUrl === undefined && existing.logoUrl) p = { ...p, logoUrl: existing.logoUrl };
        if (p.faviconUrl === undefined && existing.faviconUrl) p = { ...p, faviconUrl: existing.faviconUrl };
        if (p.companyName === undefined && existing.companyName) p = { ...p, companyName: existing.companyName };
        if (p.companyWebsite === undefined && existing.companyWebsite) p = { ...p, companyWebsite: existing.companyWebsite };
        if (p.companyAddress === undefined && existing.companyAddress) p = { ...p, companyAddress: existing.companyAddress };
        if (p.companyCity === undefined && existing.companyCity) p = { ...p, companyCity: existing.companyCity };
        if (p.companyState === undefined && existing.companyState) p = { ...p, companyState: existing.companyState };
        if (p.companyCountry === undefined && existing.companyCountry) p = { ...p, companyCountry: existing.companyCountry };
        if (p.primaryColor === undefined && existing.primaryColor) p = { ...p, primaryColor: existing.primaryColor };
        if (p.primaryPortalName === undefined && existing.primaryPortalName) p = { ...p, primaryPortalName: existing.primaryPortalName };
        if (p.loginText === undefined && existing.loginText) p = { ...p, loginText: existing.loginText };
      }

      setProfile(p);
      writeCachedProfile(p); // Persist to localStorage

      const color = p.primaryColor || DEFAULT_PRIMARY;

      applyPrimaryColor(color);
      applyFavicon(p.faviconUrl || null, p.logoUrl || null);

      const resolvedName = p.companyName || p.companyCode || DEFAULT_TITLE;
      applyTitle(resolvedName);
    } catch {
      const existing = readCachedProfile();
      if (existing) {
        setProfile(existing);
        applyPrimaryColor(existing.primaryColor || DEFAULT_PRIMARY);
        applyFavicon(existing.faviconUrl || null, existing.logoUrl || null);
        if (existing.companyName) applyTitle(existing.companyName);
      } else {
        applyPrimaryColor(DEFAULT_PRIMARY);
        applyFavicon(null);
        document.title = DEFAULT_TITLE;
        writeCachedTitle(DEFAULT_TITLE);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  // Sync initial state and listen for login/logout events for instant updating without page reload
  useEffect(() => {
    refresh();

    const handleAuthChange = () => {
      refresh();
    };

    window.addEventListener('heliflow_auth_change', handleAuthChange);
    return () => {
      window.removeEventListener('heliflow_auth_change', handleAuthChange);
    };
  }, [refresh]);

  const activeCc = getActiveCompanyCode();
  const dynamicName = profile?.companyName || activeCc || 'Organization';

  const value: BrandingContextType = {
    companyName: dynamicName,
    companyPhone: profile?.companyPhone || null,
    companyEmail: profile?.companyEmail || null,
    companyWebsite: profile?.companyWebsite || null,
    companyAddress: profile?.companyAddress || null,
    companyCity: profile?.companyCity || null,
    companyState: profile?.companyState || null,
    companyCountry: profile?.companyCountry || null,
    logoUrl: profile?.logoUrl || '/Procnex-logo.jpeg' || procnexLogo || heliflowLogo,
    faviconUrl: profile?.faviconUrl || profile?.logoUrl || '/Procnex-logo.jpeg' || null,
    primaryColor: profile?.primaryColor || DEFAULT_PRIMARY,
    setPrimaryColor,
    loginText: profile?.loginText || null,
    supportEmail: profile?.supportEmail || null,
    primaryPortalName: profile?.primaryPortalName || 'Employee',
    profile,
    loaded,
    refresh,
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────

export function useBranding(): BrandingContextType {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}
