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
  const contractMatch = combined.match(/\b(cnt|ctr|cont|con)-[a-z0-9_-]+\b/i);
  const qtnMatch = combined.match(/\bqtn-[a-z0-9_-]+\b/i);

  // 1. Quotations & Quotation Approvals (Quotation Approval Module -> /quotations)
  if (
    lower.includes('quotation') ||
    lower.includes('quote') ||
    lower.includes('bid') ||
    lower.includes('winning quotation') ||
    qtnMatch
  ) {
    if (rfqMatch) return `/quotations?rfq=${encodeURIComponent(rfqMatch[0])}`;
    if (qtnMatch) return `/quotations?search=${encodeURIComponent(qtnMatch[0])}`;
    return '/quotations';
  }

  // 2. RFQ & RFQ Approvals (RFQ Module -> /rfq)
  if (lower.includes('rfq') || rfqMatch) {
    if (rfqMatch) return `/rfq?search=${encodeURIComponent(rfqMatch[0])}`;
    return '/rfq';
  }

  // 3. Purchase Orders & PO Approvals
  if (lower.includes('purchase order') || lower.includes('po ') || poMatch) {
    if (
      lower.includes('approval') ||
      lower.includes('approver') ||
      lower.includes('level') ||
      lower.includes('pending review')
    ) {
      if (poMatch) return `/approvals?search=${encodeURIComponent(poMatch[0])}`;
      return '/approvals';
    }
    if (poMatch) return `/procurement/purchase-orders?search=${encodeURIComponent(poMatch[0])}`;
    return '/procurement/purchase-orders';
  }

  // 4. Purchase Requisitions & PR Approvals
  if (lower.includes('purchase requisition') || lower.includes('requisition') || prMatch) {
    if (
      lower.includes('approval') ||
      lower.includes('approver') ||
      lower.includes('level') ||
      lower.includes('pending review')
    ) {
      if (prMatch) return `/approvals?search=${encodeURIComponent(prMatch[0])}`;
      return '/approvals';
    }
    if (prMatch) return `/procurement/purchase-requisitions?search=${encodeURIComponent(prMatch[0])}`;
    return '/procurement/purchase-requisitions';
  }

  // 5. Accounts Payable / Purchase Invoices & PI Approvals
  if (
    lower.includes('purchase invoice') ||
    lower.includes('invoice') ||
    lower.includes('accounts payable') ||
    piMatch
  ) {
    if (
      lower.includes('approval') ||
      lower.includes('approver') ||
      lower.includes('level') ||
      lower.includes('pending review')
    ) {
      if (piMatch) return `/approvals?search=${encodeURIComponent(piMatch[0])}`;
      return '/approvals';
    }
    if (piMatch) return `/accounts-payable?search=${encodeURIComponent(piMatch[0])}`;
    return '/accounts-payable';
  }

  // 6. Payment Vouchers & Payment Approvals
  if (lower.includes('payment') || lower.includes('voucher') || payMatch) {
    if (
      lower.includes('approval') ||
      lower.includes('approver') ||
      lower.includes('level') ||
      lower.includes('pending review')
    ) {
      if (payMatch) return `/approvals?search=${encodeURIComponent(payMatch[0])}`;
      return '/approvals';
    }
    if (payMatch) return `/payments?search=${encodeURIComponent(payMatch[0])}`;
    return '/payments';
  }

  // 7. Contracts & Digital Agreements
  if (
    lower.includes('contract') ||
    lower.includes('agreement') ||
    lower.includes('e-signature') ||
    lower.includes('signed') ||
    contractMatch
  ) {
    return '/contracts';
  }

  // 8. Onboarding & Vendor Compliance
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

  // 9. Goods Receipt Note (GRN)
  if (lower.includes('grn') || lower.includes('goods receipt') || lower.includes('receipt')) {
    return '/procurement/goods-receipt';
  }

  // 10. Generic Approvals Fallback
  if (
    lower.includes('approval') ||
    lower.includes('approver') ||
    lower.includes('level 1') ||
    lower.includes('level 2') ||
    lower.includes('level 3') ||
    lower.includes('pending review') ||
    lower.includes('approval chain')
  ) {
    return '/approvals';
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
  rfqId?: string,
  companyCode?: string
): string {
  const combined = `${title} ${message}`.toLowerCase();
  const base = companyCode ? `/v/${companyCode}` : '/vendor';

  if (combined.includes('contract') || combined.includes('agreement') || combined.includes('sign')) {
    return `${base}/contracts`;
  }
  if (combined.includes('invoice') || combined.includes('payment') || combined.includes('voucher')) {
    return `${base}/invoices`;
  }
  if (combined.includes('order') || combined.includes('po-')) {
    return `${base}/orders`;
  }
  if (combined.includes('quotation') || combined.includes('quote') || combined.includes('qtn-') || combined.includes('bid')) {
    return `${base}/quotations`;
  }
  if (combined.includes('profile') || combined.includes('bank') || combined.includes('document')) {
    return `${base}/profile`;
  }
  if (rfqId) {
    return `${base}/rfqs?rfq=${encodeURIComponent(rfqId)}`;
  }
  return `${base}/rfqs`;
}
