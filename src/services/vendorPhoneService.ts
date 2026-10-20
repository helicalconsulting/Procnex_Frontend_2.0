import { apiRequest } from '../api/client';
import { isSameVendorPhone } from '../utils/vendorPhone';

/** Search every page and status, including invited and inactive suppliers. */
export async function findVendorWithPhone(phone: string, countryCode: string): Promise<{ name: string } | null> {
  if (!phone.trim()) return null;
  for (let page = 1; ; page += 1) {
    const result = await apiRequest<{ vendors: Array<{ name: string; phone?: string | null }>; total?: number; limit?: number }>(
      `/vendors?page=${page}&limit=100`, { cacheTtlMs: 0 },
    );
    if (!Array.isArray(result.vendors)) throw new Error('Unable to verify the phone number. Please try again.');
    const match = result.vendors.find(v => v.phone && isSameVendorPhone(phone, v.phone, countryCode));
    if (match) return match;
    if (result.total !== undefined ? page * (result.limit || 100) >= result.total : result.vendors.length < 100) return null;
  }
}
