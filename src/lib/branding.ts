import type { CompanyProfile } from '../services/companySettingsService';

export function getActiveCompanyCode(): string | null {
  try {
    const path = window.location.pathname;
    const match = path.match(/^\/[ev]\/([a-zA-Z0-9_-]+)/);
    if (match && !['LOGIN', 'DASHBOARD'].includes(match[1].toUpperCase())) return match[1].toUpperCase();
    const params = new URLSearchParams(window.location.search);
    const query = params.get('company') || params.get('companyCode');
    if (query?.trim()) return query.trim().toUpperCase();
    const user = JSON.parse(localStorage.getItem('heliflow_user') || 'null');
    if (user?.companyCode) return String(user.companyCode).toUpperCase();
    const key = path.startsWith('/vendor') ? 'vendor_company_code' : 'employee_company_code';
    return localStorage.getItem(key)?.toUpperCase() || null;
  } catch { return null; }
}

export function readCachedProfile(code = getActiveCompanyCode()): CompanyProfile | null {
  try {
    const raw = localStorage.getItem(`heliflow_branding_cache_${code || 'GLOBAL'}`);
    if (!raw) return null;
    const profile = JSON.parse(raw) as CompanyProfile;
    return code && profile.companyCode?.toUpperCase() !== code.toUpperCase() ? null : profile;
  } catch { return null; }
}

export function writeCachedProfile(profile: CompanyProfile): void {
  try {
    localStorage.setItem(`heliflow_branding_cache_${profile.companyCode?.toUpperCase() || 'GLOBAL'}`, JSON.stringify(profile));
  } catch { /* Storage may be unavailable. In-memory branding still applies. */ }
}

function writeCachedTitle(title: string): void {
  try { localStorage.setItem('heliflow_tab_title', title); } catch { /* Optional cache */ }
}

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
  const hex = rawHex && hexToRgb(rawHex)
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
    '--brand-foreground': getContrastForeground(hex),
    '--brand-dark-foreground': getContrastForeground(darkPrimary),
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
  if (!title.includes('— Procurement Workspace') && !title.includes('— Procurement Automation Software') && !title.includes('— Digital Procurement Platform') && !title.includes('— Vendor Portal') && !title.includes('— Enterprise Procurement Platform')) {
    title = `${title} — Digital Procurement Platform`;
  }
  document.title = title;
  writeCachedTitle(title);
}

export function applyBrandingProfile(profile: CompanyProfile): void {
  writeCachedProfile(profile);
  applyPrimaryColor(profile.primaryColor || DEFAULT_PRIMARY);
  applyFavicon(profile.faviconUrl || null, profile.logoUrl || null);
  applyTitle(profile.companyName || profile.companyCode);
  window.dispatchEvent(new CustomEvent('heliflow_branding_change', { detail: profile }));
}

// Apply a tenant's saved palette before React's first paint.
applyPrimaryColor(readCachedProfile()?.primaryColor || DEFAULT_PRIMARY);
