import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompanyProfile } from '../companySettingsService';

// Mock the apiRequest module before importing the service
const mockApiRequest = vi.fn();
vi.mock('../../api/client', () => ({
  apiRequest: mockApiRequest,
}));

// Mock the USE_MOCK config to false so apiRequest is used
vi.mock('../../config/mock', () => ({
  USE_MOCK: false,
}));

const { companySettingsService } = await import('../companySettingsService');

describe('companySettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getCompanyProfile ─────────────────────────────────

  describe('getCompanyProfile', () => {
    it('fetches and returns the company profile', async () => {
      const mockProfile: CompanyProfile = {
        id: '1',
        companyCode: 'HFL',
        defaultCurrency: 'USD',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockApiRequest.mockResolvedValue({ profile: mockProfile });

      const result = await companySettingsService.getCompanyProfile();

      expect(mockApiRequest).toHaveBeenCalledWith('/company-settings/profile', {
        cacheTtlMs: 120000,
      });
      expect(result).toEqual(mockProfile);
    });

    it('returns KES default when API returns profile with default currency', async () => {
      const mockProfile: CompanyProfile = {
        id: '2',
        companyCode: 'HFL',
        defaultCurrency: 'KES',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockApiRequest.mockResolvedValue({ profile: mockProfile });

      const result = await companySettingsService.getCompanyProfile();

      expect(result.defaultCurrency).toBe('KES');
    });
  });

  // ─── updateCompanyProfile ──────────────────────────────

  describe('updateCompanyProfile', () => {
    it('sends PUT request with defaultCurrency and returns updated profile', async () => {
      const updatedProfile: CompanyProfile = {
        id: '1',
        companyCode: 'HFL',
        defaultCurrency: 'EUR',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      mockApiRequest.mockResolvedValue({ profile: updatedProfile });

      const result =      await companySettingsService.updateCompanyProfile({ defaultCurrency: 'EUR' });

      expect(mockApiRequest).toHaveBeenCalledWith('/company-settings/profile', {
        method: 'PUT',
        body: JSON.stringify({ defaultCurrency: 'EUR' }),
      });
      expect(result).toEqual(updatedProfile);
      expect(result.defaultCurrency).toBe('EUR');
    });

    it('accepts lowercase and passes it as-is', async () => {
      mockApiRequest.mockResolvedValue({
        profile: { defaultCurrency: 'usd' },
      });

      await companySettingsService.updateCompanyProfile({ defaultCurrency: 'usd' });

      expect(mockApiRequest).toHaveBeenCalledWith('/company-settings/profile', {
        method: 'PUT',
        body: JSON.stringify({ defaultCurrency: 'usd' }),
      });
    });
  });

  // ─── Mock mode tests (verify mock functions exist) ────

  it('has all expected mock functions', () => {
    // These should always exist regardless of USE_MOCK
    expect(companySettingsService.getCompanyProfile).toBeDefined();
    expect(companySettingsService.updateCompanyProfile).toBeDefined();
  });
});

describe('settings workspace persistence', () => {
  beforeEach(() => mockApiRequest.mockReset());
  it('propagates sequence loading errors instead of returning invented counters', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(companySettingsService.listSequenceSettings()).rejects.toThrow('Network unavailable');
  });
  it('preserves every returned counter and configuration field', async () => {
    const settings = [{ entityType: 'RFQ', prefix: 'RFQ-', suffix: 'X', nextNumber: 120, paddingLength: 6, resetFrequency: 'YEARLY', periodStartDate: '2026-04-01', periodEndDate: '2027-03-31' }];
    mockApiRequest.mockResolvedValueOnce({ settings });
    expect(await companySettingsService.listSequenceSettings()).toEqual(settings);
    mockApiRequest.mockResolvedValueOnce({ setting: settings[0] });
    expect(await companySettingsService.updateSequenceSetting(settings[0])).toEqual(settings[0]);
    expect(mockApiRequest).toHaveBeenLastCalledWith('/company-settings/sequences', { method: 'PUT', body: JSON.stringify(settings[0]) });
  });
  it('sends disabled tracking flags and zero-day alerts without coercion', async () => {
    const payload = { name: 'Certificate', trackIssueDate: false, trackExpirationDate: false, trackIssuingAuthority: false, expirationAlertDays: 0 };
    mockApiRequest.mockResolvedValueOnce({ id: 'doc', ...payload });
    await companySettingsService.updateRequiredDocument('doc', payload);
    expect(mockApiRequest).toHaveBeenCalledWith('/company-settings/required-documents/doc', { method: 'PUT', body: JSON.stringify(payload) });
  });
  it('propagates write failures so the editor can retain its draft', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('Save failed'));
    await expect(companySettingsService.updateSequenceSetting({ entityType: 'RFQ', prefix: 'RFQ-', nextNumber: 1, paddingLength: 4, resetFrequency: 'NEVER' })).rejects.toThrow('Save failed');
  });
});
