/**
 * Portal name configuration.
 *
 * The primary portal name (Employee / internal-user portal) is now
 * configurable via Company Settings → General → Portal Name and
 * exposed through the BrandingContext.
 *
 * The secondary portal name is the vendor/external-user portal.
 */
export const PORTAL_NAMES = {
  /** The vendor / external-user portal name — hardcoded */
  secondary: 'Vendor',
} as const;
