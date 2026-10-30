import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { companySettingsService, type CompanyProfile } from '../services/companySettingsService';
import { getActiveCompanyCode, readCachedProfile, applyBrandingProfile, applyPrimaryColor, DEFAULT_PRIMARY } from '../lib/branding';
import procnexLogo from '../assets/procnex.png';
export { applyPrimaryColor, applyFavicon, applyTitle, generatePrimaryPalette, hexToRgb, shade, DEFAULT_PRIMARY } from '../lib/branding';

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
  applyProfile: (profile: CompanyProfile) => void;
  /** Refresh branding from backend */
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(() => readCachedProfile());
  const [loaded, setLoaded] = useState(() => !!readCachedProfile());
  const revision = useRef(0);

  const applyProfile = useCallback((next: CompanyProfile) => {
    revision.current += 1;
    applyBrandingProfile(next);
    setProfile(next);
    setLoaded(true);
  }, []);

  const setPrimaryColor = useCallback((color: string) => {
    // Preview only: do not persist an unsaved color in the tenant cache.
    applyPrimaryColor(color);
    setProfile(prev => prev ? { ...prev, primaryColor: color } : prev);
  }, []);

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    const code = getActiveCompanyCode();
    const cached = readCachedProfile(code);
    if (cached) {
      setProfile(cached);
      applyPrimaryColor(cached.primaryColor || DEFAULT_PRIMARY);
      setLoaded(true);
    }
    try {
      const next = await companySettingsService.getCompanyProfile();
      // A login, tenant navigation or settings save supersedes older requests.
      if (request !== revision.current || code !== getActiveCompanyCode()) return;
      if (code && next.companyCode?.toUpperCase() !== code) return;
      applyProfile(next);
    } catch {
      if (request === revision.current && !cached) {
        setProfile(null);
        applyPrimaryColor(DEFAULT_PRIMARY);
      }
    } finally {
      if (request === revision.current) setLoaded(true);
    }
  }, [applyProfile]);

  useEffect(() => {
    const onBranding = (event: Event) => {
      const next = (event as CustomEvent<CompanyProfile>).detail;
      if (getActiveCompanyCode() && next.companyCode?.toUpperCase() !== getActiveCompanyCode()) return;
      revision.current += 1;
      setProfile(next);
      setLoaded(true);
    };
    window.addEventListener('heliflow_branding_change', onBranding);
    window.addEventListener('heliflow_auth_change', refresh);
    void refresh();
    return () => {
      revision.current += 1;
      window.removeEventListener('heliflow_branding_change', onBranding);
      window.removeEventListener('heliflow_auth_change', refresh);
    };
  }, [refresh]);

  const value: BrandingContextType = {
    companyName: profile?.companyName || getActiveCompanyCode() || 'Organization',
    companyPhone: profile?.companyPhone || null,
    companyEmail: profile?.companyEmail || null,
    companyWebsite: profile?.companyWebsite || null,
    companyAddress: profile?.companyAddress || null,
    companyCity: profile?.companyCity || null,
    companyState: profile?.companyState || null,
    companyCountry: profile?.companyCountry || null,
    logoUrl: profile?.logoUrl || procnexLogo || '/Procnex-logo.jpeg',
    faviconUrl: profile?.faviconUrl || profile?.logoUrl || procnexLogo || '/Procnex-logo.jpeg',
    primaryColor: profile?.primaryColor || DEFAULT_PRIMARY,
    setPrimaryColor,
    loginText: profile?.loginText || null,
    supportEmail: profile?.supportEmail || null,
    primaryPortalName: profile?.primaryPortalName || 'Employee',
    profile, loaded, refresh, applyProfile,
  };
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextType {
  const context = useContext(BrandingContext);
  if (!context) throw new Error('useBranding must be used within a BrandingProvider');
  return context;
}
