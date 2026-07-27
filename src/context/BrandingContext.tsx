import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { companySettingsService, type CompanyProfile } from '../services/companySettingsService';

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
  /** Company display name (defaults to "Heliflow") */
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
const DEFAULT_NAME = 'Procnex';

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

/** Apply favicon */
function applyFavicon(url: string | null) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url || '/favicon.svg';
}

/** Apply document title — persists to localStorage so it survives refreshes */
function applyTitle(name: string | null) {
  const title = name || DEFAULT_NAME;
  document.title = title;
  writeCachedTitle(title);
}

// ─── Provider ───────────────────────────────────────────────

export function BrandingProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage first so branding is immediately available
  const [profile, setProfile] = useState<CompanyProfile | null>(() => readCachedProfile());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      let p = await companySettingsService.getCompanyProfile();

      // Guard: don't let an incomplete API response overwrite richer cached data.
      // Only restore from cache when the field is truly MISSING (undefined),
      // not when it's explicitly null/empty (intentional removal by user).
      const existing = readCachedProfile();
      if (existing) {
        if (p.logoUrl === undefined && existing.logoUrl) p = { ...p, logoUrl: existing.logoUrl };
        if (p.faviconUrl === undefined && existing.faviconUrl) p = { ...p, faviconUrl: existing.faviconUrl };
        if (p.companyName === undefined && existing.companyName) p = { ...p, companyName: existing.companyName };
        if (p.primaryColor === undefined && existing.primaryColor) p = { ...p, primaryColor: existing.primaryColor };
        if (p.primaryPortalName === undefined && existing.primaryPortalName) p = { ...p, primaryPortalName: existing.primaryPortalName };
      }

      setProfile(p);
      writeCachedProfile(p); // Persist to localStorage

      const color = p.primaryColor || DEFAULT_PRIMARY;

      applyPrimaryColor(color);
      applyFavicon(p.faviconUrl || null);

      // Tab title = company name (from branding settings), falls back to "Heliflow"
      const name = p.companyName || DEFAULT_NAME;
      applyTitle(name);
    } catch {
      // Silently fall back — keep cached title if it exists, otherwise DEFAULT_NAME
      applyPrimaryColor(DEFAULT_PRIMARY);
      const savedTitle = readCachedTitle();
      document.title = savedTitle || DEFAULT_NAME;
    } finally {
      setLoaded(true);
    }
  }, []);

  // Apply cached branding to DOM immediately (before async refresh completes)
  useEffect(() => {
    // 1. Restore tab title from its dedicated cache first — ensures it persists
    //    even if the profile cache is cleared or the API temporarily drops the field.
    //    Setting `document.title` directly here (not `applyTitle`) avoids writing
    //    back to cache when restoring — refresh() will apply the freshest value.
    const savedTitle = readCachedTitle();
    if (savedTitle) {
      document.title = savedTitle;
    }

    // 2. Apply cached branding profile
    const cached = readCachedProfile();
    if (cached) {
      const color = cached.primaryColor || DEFAULT_PRIMARY;
      applyPrimaryColor(color);
      applyFavicon(cached.faviconUrl || null);

      // Apply title from cached company name if not already restored from dedicated cache
      if (!savedTitle) {
        applyTitle(cached.companyName || null);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value: BrandingContextType = {
    companyName: profile?.companyName || DEFAULT_NAME,
    companyPhone: profile?.companyPhone || null,
    companyEmail: profile?.companyEmail || null,
    logoUrl: profile?.logoUrl || null,
    faviconUrl: profile?.faviconUrl || null,
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
