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

// ─── Local Storage Keys ────────────────────────────────────
const BRANDING_CACHE_KEY = 'heliflow_branding_cache';
const TITLE_CACHE_KEY = 'heliflow_tab_title';

function readCachedProfile(): CompanyProfile | null {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CompanyProfile;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: CompanyProfile): void {
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

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
  /** Company display name (defaults to "Procnex") */
  companyName: string;
  /** Company phone number from branding settings */
  companyPhone: string | null;
  /** Company email from branding settings */
  companyEmail: string | null;
  /** Logo URL (defaults to built-in logo) */
  logoUrl: string | null;
  /** Favicon URL */
  faviconUrl: string | null;
  /** Primary color hex */
  primaryColor: string;
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

const DEFAULT_PRIMARY = '#0a6ed1';
const DEFAULT_TITLE = 'Procnex — Digital Procurement Platform';

// ─── Color shade generation ─────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function shade(hex: string, mixColor: string, amount: number): string {
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

/** Generate the full primary-50..700 palette from a base color */
function generatePrimaryPalette(hex: string): Record<string, string> {
  return {
    '--primary-50': shade(hex, '#ffffff', 0.92),
    '--primary-100': shade(hex, '#ffffff', 0.8),
    '--primary-200': shade(hex, '#ffffff', 0.6),
    '--primary-300': shade(hex, '#ffffff', 0.4),
    '--primary-400': shade(hex, '#ffffff', 0.15),
    '--primary-500': hex,
    '--primary-600': shade(hex, '#000000', 0.15),
    '--primary-700': shade(hex, '#000000', 0.25),
    // Vendor-specific aliases so every page picks up the branding color
    '--vendor-primary': hex,
    '--vendor-primary-light': shade(hex, '#ffffff', 0.3),
    '--vendor-primary-dark': shade(hex, '#000000', 0.25),
    '--vendor-accent': shade(hex, '#ffffff', 0.15),
  };
}

/** Apply CSS custom properties to the document root */
function applyPrimaryColor(hex: string) {
  const palette = generatePrimaryPalette(hex);
  const root = document.documentElement;
  for (const [key, val] of Object.entries(palette)) {
    root.style.setProperty(key, val);
  }
}

/** Apply favicon — defaults to explicit faviconUrl -> logoUrl -> default logo */
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
  if (targetUrl.endsWith('.svg')) {
    link.type = 'image/svg+xml';
  } else {
    link.type = 'image/png';
  }
  link.href = targetUrl;
}

/** Apply document title — persists to localStorage so it survives refreshes */
export function applyTitle(name: string | null) {
  let title = name || DEFAULT_TITLE;
  if (!title || title === 'Heliflow Consulting' || title === 'Heliflow' || title === 'Procnex Consulting' || title === 'Procnex' || title.includes('SAP Enterprise Suite')) {
    title = DEFAULT_TITLE;
  } else if (title !== DEFAULT_TITLE && !title.includes('— Procurement Automation Software') && !title.includes('— Digital Procurement Platform') && !title.includes('— Vendor Portal')) {
    title = `${title} — Procurement Automation Software`;
  }
  document.title = title;
  writeCachedTitle(title);
}

// ─── Provider ───────────────────────────────────────────────

export function BrandingProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage first
  const [profile, setProfile] = useState<CompanyProfile | null>(() => readCachedProfile());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      let p = await companySettingsService.getCompanyProfile();

      const existing = readCachedProfile();
      if (existing) {
        if (p.logoUrl === undefined && existing.logoUrl) p = { ...p, logoUrl: existing.logoUrl };
        if (p.faviconUrl === undefined && existing.faviconUrl) p = { ...p, faviconUrl: existing.faviconUrl };
        if (p.companyName === undefined && existing.companyName) p = { ...p, companyName: existing.companyName };
        if (p.primaryColor === undefined && existing.primaryColor) p = { ...p, primaryColor: existing.primaryColor };
        if (p.primaryPortalName === undefined && existing.primaryPortalName) p = { ...p, primaryPortalName: existing.primaryPortalName };
        if (p.loginText === undefined && existing.loginText) p = { ...p, loginText: existing.loginText };
      }

      setProfile(p);
      writeCachedProfile(p); // Persist to localStorage

      const color = p.primaryColor || DEFAULT_PRIMARY;

      applyPrimaryColor(color);
      applyFavicon(p.faviconUrl || null, p.logoUrl || null);

      const name = p.companyName || DEFAULT_TITLE;
      applyTitle(name);
    } catch {
      const existing = readCachedProfile();
      if (existing) {
        setProfile(existing);
        applyPrimaryColor(existing.primaryColor || DEFAULT_PRIMARY);
        applyFavicon(existing.faviconUrl || null, existing.logoUrl || null);
        if (existing.companyName) applyTitle(existing.companyName);
      } else {
        const path = typeof window !== 'undefined' ? window.location.pathname : '';
        const isTenantRoute = path.match(/^\/v\/([a-zA-Z0-9_-]+)/);
        if (!isTenantRoute) {
          applyPrimaryColor(DEFAULT_PRIMARY);
          applyFavicon('/Procnex-logo.jpeg');
          document.title = DEFAULT_TITLE;
          writeCachedTitle(DEFAULT_TITLE);
        }
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

  const value: BrandingContextType = {
    companyName: (profile?.companyName && profile.companyName !== 'HFL') ? profile.companyName : 'Procnex',
    companyPhone: profile?.companyPhone || null,
    companyEmail: profile?.companyEmail || null,
    logoUrl: profile?.logoUrl || '/Procnex-logo.jpeg',
    faviconUrl: profile?.faviconUrl || profile?.logoUrl || '/Procnex-logo.jpeg',
    primaryColor: profile?.primaryColor || DEFAULT_PRIMARY,
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
