/**
 * Utility to map notification titles, messages, and references to their target route.
 */
export function getNotificationTargetUrl(
  title: string,
  message: string = '',
  linkedRef: string = ''
): string {
  const combined = `${title} ${message} ${linkedRef}`.trim();
  const lower = combined.toLowerCase();

  // Regex patterns for entity IDs / Numbers
  const poMatch = combined.match(/\bpo-[a-z0-9_-]+\b/i);
  const prMatch = combined.match(/\bpr[q]?-[a-z0-9_-]+\b/i);
  const rfqMatch = combined.match(/\brfq-[a-z0-9_-]+\b/i);
  const piMatch = combined.match(/\bpi-[a-z0-9_-]+\b/i);
  const payMatch = combined.match(/\b(pay|pv)-[a-z0-9_-]+\b/i);
  const contractMatch = combined.match(/\b(cnt|ctr|cont)-[a-z0-9_-]+\b/i);

  // 1. Approvals (PO, PR, PI, Payment approval requests & status updates)
  if (
    lower.includes('approval') ||
    lower.includes('approver') ||
    lower.includes('level 1') ||
    lower.includes('level 2') ||
    lower.includes('level 3') ||
    lower.includes('pending review') ||
    lower.includes('approval chain')
  ) {
    if (poMatch) return `/approvals?search=${encodeURIComponent(poMatch[0])}`;
    if (prMatch) return `/approvals?search=${encodeURIComponent(prMatch[0])}`;
    if (piMatch) return `/approvals?search=${encodeURIComponent(piMatch[0])}`;
    if (payMatch) return `/approvals?search=${encodeURIComponent(payMatch[0])}`;
    return '/approvals';
  }

  // 2. Purchase Orders
  if (lower.includes('purchase order') || lower.includes('po ') || poMatch) {
    if (poMatch) return `/procurement/purchase-orders?search=${encodeURIComponent(poMatch[0])}`;
    return '/procurement/purchase-orders';
  }

  // 3. Purchase Requisitions
  if (lower.includes('purchase requisition') || lower.includes('requisition') || prMatch) {
    if (prMatch) return `/procurement/purchase-requisitions?search=${encodeURIComponent(prMatch[0])}`;
    return '/procurement/purchase-requisitions';
  }

  // 4. Accounts Payable / Purchase Invoices
  if (
    lower.includes('purchase invoice') ||
    lower.includes('invoice') ||
    lower.includes('accounts payable') ||
    piMatch
  ) {
    if (piMatch) return `/accounts-payable?search=${encodeURIComponent(piMatch[0])}`;
    return '/accounts-payable';
  }

  // 5. Payment Vouchers & Payments
  if (lower.includes('payment') || lower.includes('voucher') || payMatch) {
    if (payMatch) return `/payments?search=${encodeURIComponent(payMatch[0])}`;
    return '/payments';
  }

  // 6. Contracts & Digital Agreements
  if (
    lower.includes('contract') ||
    lower.includes('agreement') ||
    lower.includes('e-signature') ||
    lower.includes('signed') ||
    contractMatch
  ) {
    return '/contracts';
  }

  // 7. Onboarding & Vendor Compliance
  if (
    lower.includes('onboarding') ||
    lower.includes('uploaded') ||
    lower.includes('compliance') ||
    lower.includes('document') ||
    lower.includes('banking information') ||
    lower.includes('bank details')
  ) {
    return '/onboarding/queue';
  }

  // 8. Goods Receipt Note (GRN)
  if (lower.includes('grn') || lower.includes('goods receipt') || lower.includes('receipt')) {
    return '/procurement/goods-receipt';
  }

  // 9. Quotations & Vendor Bids
  if (lower.includes('quotation') || lower.includes('bid')) {
    if (rfqMatch) return `/quotations?rfq=${encodeURIComponent(rfqMatch[0])}`;
    return '/quotations';
  }

  // 10. RFQ
  if (lower.includes('rfq') || rfqMatch) {
    if (rfqMatch) return `/rfq?search=${encodeURIComponent(rfqMatch[0])}`;
    return '/rfq';
  }

  // 11. Vendor Management
  if (lower.includes('vendor') || lower.includes('supplier')) {
    return '/vendors';
  }

  // Default fallback to notifications center
  return '/notifications';
}

/**
 * Utility to map vendor notifications to vendor portal pages.
 */
export function getVendorNotificationTargetUrl(
  title: string,
  message: string = '',
  rfqId?: string
): string {
  const combined = `${title} ${message}`.toLowerCase();

  if (combined.includes('contract') || combined.includes('agreement') || combined.includes('sign')) {
    return '/vendor/contracts';
  }
  if (combined.includes('invoice') || combined.includes('payment') || combined.includes('voucher')) {
    return '/vendor/invoices';
  }
  if (combined.includes('profile') || combined.includes('bank') || combined.includes('document')) {
    return '/vendor/profile';
  }
  if (rfqId) {
    return `/vendor/rfqs?rfq=${encodeURIComponent(rfqId)}`;
  }
  return '/vendor/rfqs';
}
