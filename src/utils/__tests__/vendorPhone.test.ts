import { describe, expect, it } from 'vitest';
import { isSameVendorPhone, normalizeVendorPhone } from '../vendorPhone';

describe('vendor phone uniqueness', () => {
  it.each([
    ['755809333', '+254 755 809 333', '+254'],
    ['0755809333', '00254755809333', '+254'],
    ['9876543210', '+91 (98765) 43210', '+91'],
    ['9876543210', '919876543210', '+91'],
    ['4155550123', '+1 415-555-0123', '+1'],
  ])('matches %s and %s within %s', (a, b, country) => {
    expect(isSameVendorPhone(a, b, country)).toBe(true);
  });
  it('does not conflate the same subscriber in different countries', () => {
    expect(isSameVendorPhone('+254755809333', '+91755809333', '+254')).toBe(false);
  });
  it('does not match only a common suffix', () => {
    expect(isSameVendorPhone('+919875580933', '+254755809333', '+91')).toBe(false);
  });
  it('does not consider empty numbers duplicates', () => {
    expect(isSameVendorPhone('', '', '+91')).toBe(false);
    expect(normalizeVendorPhone('', '+91')).toBe('');
  });
});
