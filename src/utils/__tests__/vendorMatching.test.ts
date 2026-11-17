import { describe, it, expect } from 'vitest';
import {
  calculateFuzzyNameMatchScore,
  calculateEmailMatchScore,
  calculatePersonMatchScore,
  calculatePhoneMatchScore,
  calculateVendorMatchAnalysis,
  normalizeCompanyName,
} from '../vendorMatching';

describe('vendorMatching utility', () => {
  describe('normalizeCompanyName', () => {
    it('normalizes case and strips legal suffixes', () => {
      expect(normalizeCompanyName('Acme Solutions Pvt Ltd')).toBe('acme solutions');
      expect(normalizeCompanyName('Helical Consulting LLC')).toBe('helical consulting');
    });
  });

  describe('calculateFuzzyNameMatchScore', () => {
    it('returns 100 for exact or legal suffix match', () => {
      expect(calculateFuzzyNameMatchScore('Acme Tech', 'Acme Tech Pvt Ltd')).toBe(100);
    });

    it('enforces word 1 positional priority', () => {
      // Word 1 matches word 1
      const scoreSameWord1 = calculateFuzzyNameMatchScore('SteelWorks India', 'SteelWorks Corp');
      expect(scoreSameWord1).toBeGreaterThanOrEqual(60);

      // Word 1 does not match word 1
      const scoreDiffWord1 = calculateFuzzyNameMatchScore('India SteelWorks', 'SteelWorks India');
      expect(scoreDiffWord1).toBe(0);
    });

    it('tolerates minor typos with Levenshtein', () => {
      const score = calculateFuzzyNameMatchScore('Systemtech Solutions', 'Systemtek Solutions');
      expect(score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('calculateEmailMatchScore', () => {
    it('detects exact email matches', () => {
      const res = calculateEmailMatchScore('vendor@acme.com', 'vendor@acme.com');
      expect(res.score).toBe(100);
    });

    it('detects corporate domain matches', () => {
      const res = calculateEmailMatchScore('alice@acme.com', 'bob@acme.com');
      expect(res.score).toBe(60);
    });

    it('ignores generic public domains for domain match', () => {
      const res = calculateEmailMatchScore('alice@gmail.com', 'bob@gmail.com');
      expect(res.score).toBe(0);
    });

    it('detects same username across different domains', () => {
      const res = calculateEmailMatchScore('jai@helical.com', 'jai@syspro.com');
      expect(res.score).toBe(75);
    });
  });

  describe('calculatePhoneMatchScore', () => {
    it('matches exact phone numbers', () => {
      const res = calculatePhoneMatchScore('+254 712 345678', '+254712345678');
      expect(res.score).toBe(100);
    });

    it('matches subscriber digits across country codes', () => {
      const res = calculatePhoneMatchScore('+254 755 809333', '+91 755 809333');
      expect(res.score).toBe(85);
    });
  });

  describe('calculateVendorMatchAnalysis', () => {
    const existingVendors = [
      {
        id: 'vnd-1',
        companyName: 'SteelWorks International',
        contactEmail: 'sales@steelworks.com',
        contactPerson: 'Rahul Sharma',
        contactPhone: '+91 98765 43210',
        vendorNo: 'VND-0001',
        status: 'approved',
      },
      {
        id: 'vnd-2',
        companyName: 'Ajabu Consulting',
        contactEmail: 'contact@ajabu.ke',
        contactPerson: 'Wanjiku Kamau',
        contactPhone: '+254 700 112233',
        vendorNo: 'VND-0002',
        status: 'approved',
      },
    ];

    it('returns high match score when target matches existing vendor', () => {
      const target = {
        id: 'queue-1',
        name: 'SteelWorks India Pvt Ltd',
        email: 'sales@steelworks.com',
        phone: '+91 98765 43210',
        contactPerson: 'Rahul Sharma',
        vendorNo: 'VND-9999',
      };

      const analysis = calculateVendorMatchAnalysis(target, existingVendors);
      expect(analysis.score).toBeGreaterThanOrEqual(70);
      expect(analysis.duplicationRisk).toBe('HIGH');
      expect(analysis.matchedVendor?.name).toBe('SteelWorks International');
      expect(analysis.breakdown.name.score).toBeGreaterThan(0);
      expect(analysis.breakdown.email.score).toBe(100);
    });

    it('returns 0% and LOW risk when target is completely unique', () => {
      const target = {
        id: 'queue-2',
        name: 'Quantum BioLabs Ltd',
        email: 'info@quantumbiolabs.com',
        phone: '+1 555 999 8888',
        contactPerson: 'Dr. Jane Smith',
        vendorNo: 'VND-0050',
      };

      const analysis = calculateVendorMatchAnalysis(target, existingVendors);
      expect(analysis.score).toBe(0);
      expect(analysis.duplicationRisk).toBe('LOW');
      expect(analysis.matchedVendor).toBeNull();
    });

    it('excludes candidate if candidate is the target vendor itself', () => {
      const target = {
        id: 'vnd-1',
        name: 'SteelWorks International',
        email: 'sales@steelworks.com',
        vendorNo: 'VND-0001',
      };

      const analysis = calculateVendorMatchAnalysis(target, existingVendors);
      expect(analysis.matchedVendor?.id).not.toBe('vnd-1');
    });

    it('detects cross-vendor match if name and email match different records', () => {
      const target = {
        id: 'queue-3',
        name: 'SteelWorks Kenya',
        email: 'billing@ajabu.ke', // domain matches Ajabu
      };

      const analysis = calculateVendorMatchAnalysis(target, existingVendors);
      expect(analysis.isMultiVendorMatch).toBe(true);
      expect(analysis.multiVendorSummary).toContain('SteelWorks');
      expect(analysis.multiVendorSummary).toContain('Ajabu');
    });
  });
});
