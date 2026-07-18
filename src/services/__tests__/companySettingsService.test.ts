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
