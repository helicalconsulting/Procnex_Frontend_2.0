import { beforeEach, describe, expect, it, vi } from 'vitest';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../api/client', () => ({ apiRequest: request }));
import { findVendorWithPhone } from '../vendorPhoneService';

describe('vendor phone verification', () => {
  beforeEach(() => { request.mockReset(); });
  it('finds an existing phone beyond the first 100 vendors', async () => {
    request.mockResolvedValueOnce({ vendors: Array.from({ length: 100 }, () => ({ name: 'Other', phone: '+254700000000' })), total: 101, limit: 100 });
    request.mockResolvedValueOnce({ vendors: [{ name: 'Existing supplier', phone: '+91 98765 43210', status: 'INVITED', isActive: false }], total: 101, limit: 100 });
    expect(await findVendorWithPhone('9876543210', '+91')).toEqual(expect.objectContaining({ name: 'Existing supplier' }));
    expect(request).toHaveBeenLastCalledWith('/vendors?page=2&limit=100', { cacheTtlMs: 0 });
  });
  it('fails closed when the database lookup fails', async () => {
    request.mockRejectedValue(new Error('Database unavailable'));
    await expect(findVendorWithPhone('9876543210', '+91')).rejects.toThrow('Database unavailable');
  });
  it('rejects malformed responses instead of treating them as no duplicates', async () => {
    request.mockResolvedValue({});
    await expect(findVendorWithPhone('9876543210', '+91')).rejects.toThrow('Unable to verify');
  });
  it('allows a unique number after checking the complete list', async () => {
    request.mockResolvedValue({ vendors: [{ name: 'Other', phone: '+254755809333' }], total: 1 });
    expect(await findVendorWithPhone('755809333', '+91')).toBeNull();
  });
  it('allows an omitted optional phone without fetching', async () => {
    expect(await findVendorWithPhone('', '+91')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
