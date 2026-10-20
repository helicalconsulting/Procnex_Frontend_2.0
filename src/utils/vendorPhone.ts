export function normalizeVendorPhone(value: string, countryCode: string): string {
  const text = value.trim();
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) return `+${digits}`;
  if (text.startsWith('00')) return `+${digits.slice(2)}`;
  const country = countryCode.replace(/\D/g, '');
  // Legacy records may have the international prefix without a plus sign.
  if (!digits.startsWith('0') && digits.startsWith(country) && digits.length > 10) return `+${digits}`;
  return `+${country}${digits.replace(/^0+/, '')}`;
}

export function isSameVendorPhone(a: string, b: string, countryCode: string): boolean {
  return !!a.trim() && !!b.trim() && normalizeVendorPhone(a, countryCode) === normalizeVendorPhone(b, countryCode);
}
