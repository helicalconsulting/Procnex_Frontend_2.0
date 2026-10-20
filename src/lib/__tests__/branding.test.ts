import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePrimaryPalette, getActiveCompanyCode, readCachedProfile, writeCachedProfile } from '../branding';
import type { CompanyProfile } from '../../services/companySettingsService';

describe('tenant branding', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) });
    vi.stubGlobal('window', { location: { pathname: '/e/hcl/login', search: '' } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('uses the login URL company ahead of a previous user session', () => {
    storage.set('heliflow_user', JSON.stringify({ companyCode: 'HFL' }));
    expect(getActiveCompanyCode()).toBe('HCL');
  });
  it('shares saved login text and color through a company-specific cache', () => {
    const profile = { companyCode: 'HCL', primaryColor: '#f7cf08', loginText: 'HCL welcomes you' } as CompanyProfile;
    writeCachedProfile(profile);
    expect(readCachedProfile()).toEqual(profile);
    expect(readCachedProfile('HFL')).toBeNull();
  });
  it('ignores cache contents for a different tenant', () => {
    storage.set('heliflow_branding_cache_HCL', JSON.stringify({ companyCode: 'HFL', primaryColor: '#ff0000' }));
    expect(readCachedProfile()).toBeNull();
  });
  it.each(['#1234', '#12345', 'invalid'])('rejects invalid color %s', color => {
    expect(generatePrimaryPalette(color)['--primary-500']).toBe('#0a6ed1');
  });
  it('generates the selected yellow palette and readable foreground', () => {
    const palette = generatePrimaryPalette('#f7cf08');
    expect(palette['--primary-500']).toBe('#f7cf08');
    expect(palette['--vendor-primary']).toBe('#f7cf08');
    expect(palette['--brand-foreground']).toBe('#0f172a');
  });
});
