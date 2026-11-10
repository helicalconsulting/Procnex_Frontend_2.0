import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveSelfRegisteredVendor,
  getSelfRegisteredVendors,
  updateSelfRegisteredStatus,
  procurementService,
} from '../procurementService';

describe('Vendor Self-Registration & Approval Queue Integration', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
    };
    (globalThis as any).window = {
      localStorage: storageMock,
      dispatchEvent: () => true,
    };
    (globalThis as any).CustomEvent = class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, params: any = {}) {
        this.type = type;
        this.detail = params.detail;
      }
    };
  });

  it('saves self-registered vendor with unique vendorNo and PENDING_APPROVAL status', () => {
    const record = saveSelfRegisteredVendor({
      companyName: 'Al Zorah Construction Ltd',
      contactEmail: 'build@alzorah.ae',
      contactPerson: 'Rashid Al Maktoum',
      countryCode: '+971',
      phone: '501234567',
      category: 'Raw Materials & Construction',
      supplierType: 'Domestic Supplier',
      notes: 'Ajman Office, Building 4',
      companyCode: 'alzorah',
    });

    expect(record.vendorNo).toMatch(/^VND-\d{4}$/);
    expect(record.name).toBe('Al Zorah Construction Ltd');
    expect(record.email).toBe('build@alzorah.ae');
    expect(record.phone).toBe('+971 501234567');
    expect(record.status).toBe('PENDING_APPROVAL');
    expect(record.isSelfRegistered).toBe(true);

    const stored = getSelfRegisteredVendors();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(record.id);
  });

  it('updates self-registered vendor status to APPROVED and REJECTED', () => {
    const record = saveSelfRegisteredVendor({
      companyName: 'Global Tech Supplies',
      contactEmail: 'sales@globaltech.com',
      countryCode: '+1',
      phone: '2025550143',
    });

    const approved = updateSelfRegisteredStatus(record.id, 'APPROVED');
    expect(approved).toBe(true);

    const listAfterApproval = getSelfRegisteredVendors();
    expect(listAfterApproval[0].status).toBe('APPROVED');

    const rejected = updateSelfRegisteredStatus(record.id, 'REJECTED', 'Missing trade license');
    expect(rejected).toBe(true);

    const listAfterRejection = getSelfRegisteredVendors();
    expect(listAfterRejection[0].status).toBe('REJECTED');
    expect(listAfterRejection[0].rejectionReason).toBe('Missing trade license');
  });

  it('includes self-registered vendor in procurementService.getOnboardingQueue', async () => {
    const record = saveSelfRegisteredVendor({
      companyName: 'Emirates Catering Services',
      contactEmail: 'orders@emiratescatering.ae',
      contactPerson: 'Fatima Noor',
      countryCode: '+971',
      phone: '559876543',
    });

    const queue = await procurementService.getOnboardingQueue();
    const found = queue.find((v) => v.email === 'orders@emiratescatering.ae');

    expect(found).toBeDefined();
    expect(found?.name).toBe('Emirates Catering Services');
    expect(found?.phone).toBe('+971 559876543');
    expect(found?.contactPerson).toBe('Fatima Noor');
    expect(found?.status).toBe('PENDING_APPROVAL');
  });

  it('resolves vendor profile for self-registered vendor via getVendorProfile', async () => {
    const record = saveSelfRegisteredVendor({
      companyName: 'Ajman Logistics Fleet',
      contactEmail: 'fleet@ajmanlogistics.ae',
      countryCode: '+971',
      phone: '502233445',
      category: 'Logistics, Freight & Transportation',
      supplierType: 'Domestic Supplier',
      notes: 'Industrial Area 2, Ajman',
    });

    const profile = await procurementService.getVendorProfile(record.id);
    expect(profile).toBeDefined();
    expect(profile.name).toBe('Ajman Logistics Fleet');
    expect(profile.email).toBe('fleet@ajmanlogistics.ae');
    expect(profile.phone).toBe('+971 502233445');
    expect(profile.category).toBe('Logistics, Freight & Transportation');
    expect(profile.isSelfRegistered).toBe(true);
  });

  it('persists and maps uploaded Trade License, VAT Certificate, and Emirates ID', async () => {
    const record = saveSelfRegisteredVendor({
      companyName: 'Dubai Horizon Trading LLC',
      contactEmail: 'info@horizondubai.ae',
      countryCode: '+971',
      phone: '501122334',
      documents: [
        {
          type: 'trade_license',
          label: 'Trade License',
          fileName: 'Trade_License_2026.pdf',
          fileSize: 102400,
          mimeType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,mockPDFdata',
          uploadedAt: '2026-11-09T19:00:00Z',
        },
        {
          type: 'vat_certificate',
          label: 'VAT Certificate',
          fileName: 'VAT_Cert_TRN123.pdf',
          fileSize: 85000,
          mimeType: 'application/pdf',
          dataUrl: 'data:application/pdf;base64,mockVATdata',
          uploadedAt: '2026-11-09T19:00:00Z',
        },
        {
          type: 'emirates_id',
          label: 'Emirates ID',
          fileName: 'EmiratesID_Signatory.jpg',
          fileSize: 64000,
          mimeType: 'image/jpeg',
          dataUrl: 'data:image/jpeg;base64,mockEIDdata',
          uploadedAt: '2026-11-09T19:00:00Z',
        },
      ],
    });

    expect(record.documents).toHaveLength(3);
    expect(record.documents?.[0].label).toBe('Trade License');
    expect(record.documents?.[1].label).toBe('VAT Certificate');
    expect(record.documents?.[2].label).toBe('Emirates ID');

    const queue = await procurementService.getOnboardingQueue();
    const vendorRow = queue.find((v) => v.id === record.id);
    expect(vendorRow).toBeDefined();
    expect(vendorRow?.documents).toHaveLength(3);
    expect(vendorRow?.documents?.[0].originalName).toBe('Trade_License_2026.pdf');
    expect(vendorRow?.documents?.[1].originalName).toBe('VAT_Cert_TRN123.pdf');
    expect(vendorRow?.documents?.[2].originalName).toBe('EmiratesID_Signatory.jpg');

    const profile = await procurementService.getVendorProfile(record.id);
    expect(profile.documents).toHaveLength(3);
  });
});
