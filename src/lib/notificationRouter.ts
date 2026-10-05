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
  const qtnMatch = combined.match(/\bqtn-[a-z0-9_-]+\b/i);

  // Special: Returned for Revision (Direct to Creator edit page)
  if (lower.includes('returned for revision') || (lower.includes('returned') && !lower.includes('re-review'))) {
    if (lower.includes('form') || lower.includes('custom form')) {
      return '/forms?tab=returned';
    }
    if (lower.includes('quotation') || qtnMatch) {
      if (rfqMatch) return `/quotations?rfq=${encodeURIComponent(rfqMatch[0])}`;
      return '/quotations';
    }
    if (lower.includes('rfq') || rfqMatch) {
      if (rfqMatch) return `/rfq?search=${encodeURIComponent(rfqMatch[0])}`;
      return '/rfq';
    }
    if (lower.includes('purchase order') || lower.includes('po ') || poMatch) {
      if (poMatch) return `/procurement/purchase-orders?search=${encodeURIComponent(poMatch[0])}`;
      return '/procurement/purchase-orders';
    }
    if (lower.includes('purchase invoice') || lower.includes('invoice') || lower.includes('accounts payable') || piMatch) {
      if (piMatch) return `/accounts-payable?search=${encodeURIComponent(piMatch[0])}`;
      return '/accounts-payable';
    }
    if (lower.includes('payment') || lower.includes('voucher') || payMatch) {
      if (payMatch) return `/payments?search=${encodeURIComponent(payMatch[0])}`;
      return '/payments';
    }
  }

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

  // 3. Accounts Payable / Purchase Invoices & PI Approvals (Must be before PO because invoice notifications often mention PO references)
  if (
    lower.includes('purchase invoice') ||
    lower.includes('invoice') ||
    lower.includes('accounts payable') ||
    piMatch
  ) {
    if (piMatch) return `/accounts-payable?search=${encodeURIComponent(piMatch[0])}`;
    return '/accounts-payable';
  }

  // 4. Payment Vouchers & Payment Approvals
  if (lower.includes('payment') || lower.includes('voucher') || payMatch) {
    if (payMatch) return `/payments?search=${encodeURIComponent(payMatch[0])}`;
    return '/payments';
  }

  // 5. Purchase Orders & PO Approvals
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

  // 6. Purchase Requisitions & PR Approvals
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

  // 7. Forms & Custom Form Workflows (Must precede Contracts and Generic Approvals)
  if (
    lower.includes('form') ||
    lower.includes('forms') ||
    lower.includes('custom form') ||
    lower.includes('form response') ||
    lower.includes('form submission')
  ) {
    if (lower.includes('returned') || lower.includes('revision') || lower.includes('re-review')) {
      return '/forms?tab=returned';
    }
    if (lower.includes('submitted for approval') || lower.includes('progress update') || lower.includes('sent for level')) {
      return '/forms?tab=submitted';
    }
    if (lower.includes('fully approved') || lower.includes('form level approved') || lower.includes('approved by all levels')) {
      return '/forms?tab=completed';
    }
    if (
      lower.includes('approval required') ||
      lower.includes('requires level') ||
      lower.includes('requires your level') ||
      lower.includes('approval (level') ||
      lower.includes('level 1 approval') ||
      lower.includes('level 2 approval') ||
      lower.includes('level 3 approval') ||
      lower.includes('pending approval') ||
      lower.includes('approval chain')
    ) {
      return '/forms?tab=approval_pending';
    }
    if (lower.includes('response submitted') || lower.includes('submitted a response')) {
      return '/admin/form-responses';
    }
    if (lower.includes('assigned') || lower.includes('received a new form') || lower.includes('new form')) {
      return '/forms?tab=pending';
    }
    return '/forms';
  }

  // 8. Contracts & Digital Agreements
  const isContractSignature = /\b(signed|signature|countersigned|counter-signed)\b/i.test(combined);
  if (
    lower.includes('contract') ||
    lower.includes('agreement') ||
    lower.includes('e-signature') ||
    lower.includes('e-sign') ||
    isContractSignature ||
    contractMatch
  ) {
    if (contractMatch) return `/contracts?search=${encodeURIComponent(contractMatch[0])}`;
    return '/contracts';
  }

  // 9. Onboarding & Vendor Compliance
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

  // 10. Goods Receipt Note (GRN)
  if (lower.includes('grn') || lower.includes('goods receipt') || lower.includes('receipt')) {
    return '/procurement/goods-receipt';
  }

  // 11. Generic Approvals Fallback
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

  // 12. Vendor Management
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

  // 1. RFQ Invitations & Requests for Quotation (Always routes to "My RFQs" so vendor can view details & submit quotation)
  const isRfqInvitation =
    Boolean(rfqId) ||
    combined.includes('new rfq') ||
    combined.includes('rfq invited') ||
    combined.includes('rfq_invited') ||
    combined.includes('invited to submit') ||
    combined.includes('submit a quotation') ||
    combined.includes('submit quotation') ||
    combined.includes('submit your quotation') ||
    combined.includes('request for quotation') ||
    combined.includes('rfq invitation') ||
    combined.includes('rfq-');

  if (
    isRfqInvitation &&
    !combined.includes('quotation awarded') &&
    !combined.includes('quotation approved') &&
    !combined.includes('quotation rejected') &&
    !combined.includes('quotation under review') &&
    !combined.includes('quotation shortlisted')
  ) {
    if (rfqId) {
      return `${base}/rfqs?rfq=${encodeURIComponent(rfqId)}`;
    }
    const rfqMatch = combined.match(/\brfq-[a-z0-9_-]+\b/i);
    if (rfqMatch) {
      return `${base}/rfqs?search=${encodeURIComponent(rfqMatch[0])}`;
    }
    return `${base}/rfqs`;
  }

  // 2. Forms & Digital Agreements
  if (combined.includes('form') || combined.includes('forms')) {
    return `${base}/agreements`;
  }

  // 3. Contracts & Digital Agreements
  const isVendorSignature = /\b(signed|signature|countersigned|counter-signed)\b/i.test(combined);
  if (
    combined.includes('contract') ||
    combined.includes('agreement') ||
    combined.includes('e-signature') ||
    combined.includes('e-sign') ||
    isVendorSignature
  ) {
    return `${base}/contracts`;
  }

  // 4. Invoices & Payments
  if (combined.includes('invoice') || combined.includes('payment') || combined.includes('voucher')) {
    return `${base}/invoices`;
  }

  // 5. Purchase Orders
  if (combined.includes('purchase order') || combined.includes('po-') || combined.includes('order')) {
    return `${base}/orders`;
  }

  // 6. Existing Quotations (Awards, approvals, rejections, reviews, revisions)
  if (
    combined.includes('quotation') ||
    combined.includes('quote') ||
    combined.includes('qtn-') ||
    combined.includes('bid')
  ) {
    return `${base}/quotations`;
  }

  // 7. Vendor Profile & Compliance
  if (combined.includes('profile') || combined.includes('bank') || combined.includes('document')) {
    return `${base}/profile`;
  }

  if (rfqId) {
    return `${base}/rfqs?rfq=${encodeURIComponent(rfqId)}`;
  }
  return `${base}/rfqs`;
}
