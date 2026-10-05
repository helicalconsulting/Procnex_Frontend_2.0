// ============================================================
// tenantResolver.ts — Multi-Tenant Company Code Resolver
// ============================================================

const SYSTEM_SUBDOMAINS = ['srm', 'app', 'www', 'api', 'dev', 'staging', 'procnexapi', 'localhost'];

/**
 * Resolves the client company code for the stealth vendor portal.
 * Precedence:
 * 1. Explicit path parameter (e.g., /v/helical/login -> HELICAL)
 * 2. Query parameter (?company=helical or ?companyCode=helical)
 * 3. LocalStorage cached company code ('vendor_company_code')
 * 4. Subdomain (e.g. helical.procnex.com -> HELICAL)
 */
export function getTenantCompanyCode(): string | null {
  // 1. Path check (/v/:companyCode/*)
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const match = path.match(/^\/v\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    const codeFromPath = match[1].toUpperCase();
    if (codeFromPath !== 'LOGIN' && codeFromPath !== 'DASHBOARD') {
      localStorage.setItem('vendor_company_code', codeFromPath);
      return codeFromPath;
    }
  }

  // 2. Query param check (?company=helical or ?companyCode=helical)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const qCompany = params.get('company') || params.get('companyCode');
    if (qCompany?.trim()) {
      const codeFromQuery = qCompany.trim().toUpperCase();
      localStorage.setItem('vendor_company_code', codeFromQuery);
      return codeFromQuery;
    }
  }

  // 3. Active user session check
  if (typeof window !== 'undefined') {
    try {
      const userStr = localStorage.getItem('heliflow_user');
      if (userStr) {
        const userObj = JSON.parse(userStr);
        if (userObj?.companyCode?.trim()) {
          const uCode = userObj.companyCode.trim().toUpperCase();
          localStorage.setItem('vendor_company_code', uCode);
          return uCode;
        }
      }
    } catch {
      // ignore JSON parse errors
    }

    const storedCode = localStorage.getItem('vendor_company_code');
    if (storedCode?.trim()) {
      return storedCode.trim().toUpperCase();
    }
  }

  // 4. Subdomain check
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const parts = host.split('.');
    if (parts.length >= 3) {
      const sub = parts[0].toLowerCase();
      if (!SYSTEM_SUBDOMAINS.includes(sub)) {
        const codeFromSub = sub.toUpperCase();
        localStorage.setItem('vendor_company_code', codeFromSub);
        return codeFromSub;
      }
    }
  }

  return null;
}

export function setTenantCompanyCode(companyCode: string): void {
  if (companyCode?.trim()) {
    localStorage.setItem('vendor_company_code', companyCode.trim().toUpperCase());
  }
}

export function clearTenantCompanyCode(): void {
  localStorage.removeItem('vendor_company_code');
}

/**
 * Resolves a vendor route path with active company code isolation.
 * e.g., getVendorPath('/vendor/contracts') -> '/v/hfl/contracts'
 */
export function getVendorPath(path: string): string {
  const companyCode = getTenantCompanyCode();
  if (!companyCode) return path;

  const code = companyCode.toLowerCase();
  if (path.startsWith(`/v/${code}`) || path.startsWith(`/v/${companyCode.toUpperCase()}`)) {
    return path;
  }
  if (path.startsWith('/vendor')) {
    return path.replace('/vendor', `/v/${code}`);
  }
  return `/v/${code}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Resolves the client company code for the employee portal.
 */
export function getEmployeeCompanyCode(): string | null {
  // 1. Path check (/e/:companyCode/*)
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const match = path.match(/^\/e\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    const codeFromPath = match[1].toUpperCase();
    if (codeFromPath !== 'LOGIN' && codeFromPath !== 'DASHBOARD') {
      localStorage.setItem('employee_company_code', codeFromPath);
      return codeFromPath;
    }
  }

  // 2. Query param check (?company=... or ?companyCode=...)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const qCompany = params.get('company') || params.get('companyCode');
    if (qCompany?.trim()) {
      const codeFromQuery = qCompany.trim().toUpperCase();
      localStorage.setItem('employee_company_code', codeFromQuery);
      return codeFromQuery;
    }
  }

  // 3. Active user session check (prioritize logged-in user over stale cache)
  if (typeof window !== 'undefined') {
    try {
      const userStr = localStorage.getItem('heliflow_user');
      if (userStr) {
        const userObj = JSON.parse(userStr);
        if (userObj?.companyCode?.trim()) {
          const uCode = userObj.companyCode.trim().toUpperCase();
          localStorage.setItem('employee_company_code', uCode);
          return uCode;
        }
      }
    } catch {
      // ignore JSON parse errors
    }

    const storedCode = localStorage.getItem('employee_company_code');
    if (storedCode?.trim()) {
      return storedCode.trim().toUpperCase();
    }
  }

  return null;
}

export function setEmployeeCompanyCode(companyCode: string): void {
  if (companyCode?.trim()) {
    localStorage.setItem('employee_company_code', companyCode.trim().toUpperCase());
  }
}

export function clearEmployeeCompanyCode(): void {
  localStorage.removeItem('employee_company_code');
}

