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
  const invMatch = combined.match(/\binv-[a-z0-9_-]+\b/i);
  const payMatch = combined.match(/\b(?:pay|pv)-[a-z0-9_-]+\b/i) || combined.match(/\b(?:pay|pv)[0-9_-]+\b/i);
  const contractMatch = combined.match(/\b(?:cnt|ctr|cont)-[a-z0-9_-]+\b/i);
  const qtnMatch = combined.match(/\bqtn-[a-z0-9_-]+\b/i);

  // Special: Returned for Revision (Direct to Creator edit page)
  if (lower.includes('returned for revision') || (lower.includes('returned') && !lower.includes('re-review'))) {
    if (lower.includes('form') || lower.includes('custom form')) {
      return '/forms?tab=returned';
    }
    if (lower.includes('payment') || lower.includes('voucher') || payMatch) {
      if (payMatch) return `/procurement/create-payment-voucher?search=${encodeURIComponent(payMatch[0])}`;
      return '/procurement/create-payment-voucher';
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
  }

  // 1. Payment Vouchers & Payment Approvals (MUST BE FIRST because Payment Voucher notifications often mention approved Invoices & PO numbers)
  if (
    lower.includes('payment voucher') ||
    lower.includes('voucher') ||
    lower.includes('payment') ||
    payMatch
  ) {
    // A. Explicit Approval review / level notifications -> ALWAYS route to Payment Voucher Approval (/payments)
    const isApprovalRequest =
      lower.includes('payment voucher approval') ||
      title.toLowerCase().includes('payment voucher approval') ||
      lower.includes('approval required') ||
      lower.includes('requires approval') ||
      lower.includes('requires level') ||
      lower.includes('passed level') ||
      lower.includes('requires your level') ||
      lower.includes('pending review') ||
      lower.includes('pending approval') ||
      lower.includes('approval chain') ||
      lower.includes('approver') ||
      lower.includes('level 1') ||
      lower.includes('level 2') ||
      lower.includes('level 3') ||
      lower.includes('level 4') ||
      lower.includes('level 5') ||
      lower.includes('approval (level') ||
      (lower.includes('level') && lower.includes('approval'));

    if (isApprovalRequest) {
      if (payMatch) return `/payments?search=${encodeURIComponent(payMatch[0])}`;
      return '/payments';
    }

    // B. Explicit Creation / Draft notifications -> go to Create Payment Voucher page
    const isCreationOrDraft =
      lower.includes('payment voucher created') ||
      lower.includes('draft payment voucher') ||
      lower.includes('automatically created') ||
      lower.includes('voucher created') ||
      lower.includes('created for approved') ||
      title.toLowerCase().includes('payment voucher created') ||
      title.toLowerCase().includes('draft payment voucher');

    if (isCreationOrDraft) {
      if (payMatch) return `/procurement/create-payment-voucher?search=${encodeURIComponent(payMatch[0])}`;
      if (piMatch) return `/procurement/create-payment-voucher?search=${encodeURIComponent(piMatch[0])}`;
      if (invMatch) return `/procurement/create-payment-voucher?search=${encodeURIComponent(invMatch[0])}`;
      return '/procurement/create-payment-voucher';
    }

    // Default approval / fallback
    if (lower.includes('approval') || lower.includes('approved')) {
      if (payMatch) return `/payments?search=${encodeURIComponent(payMatch[0])}`;
      return '/payments';
    }

    if (payMatch) return `/procurement/create-payment-voucher?search=${encodeURIComponent(payMatch[0])}`;
    if (piMatch) return `/procurement/create-payment-voucher?search=${encodeURIComponent(piMatch[0])}`;
    if (invMatch) return `/procurement/create-payment-voucher?search=${encodeURIComponent(invMatch[0])}`;
    return '/procurement/create-payment-voucher';
  }

  // 2. Quotations & Quotation Approvals (Quotation Approval Module -> /quotations)
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

  // 3. RFQ & RFQ Approvals (RFQ Module -> /rfq)
  if (lower.includes('rfq') || rfqMatch) {
    if (rfqMatch) return `/rfq?search=${encodeURIComponent(rfqMatch[0])}`;
    return '/rfq';
  }

  // 4. Vendor Invoices / Dispatch Notes Received from Vendor (Redirects to Create Purchase Invoice Page)
  if (
    lower.includes('vendor invoice') ||
    lower.includes('dispatch note') ||
    lower.includes('tax invoice') ||
    lower.includes('generate grn & purchase invoice') ||
    lower.includes('new vendor invoice') ||
    (lower.includes('invoice') && (lower.includes('received') || lower.includes('submitted tax invoice') || lower.includes('dispatch')))
  ) {
    if (poMatch) return `/procurement/create-purchase-invoice?poId=${encodeURIComponent(poMatch[0])}`;
    if (invMatch) return `/procurement/create-purchase-invoice?invoiceNumber=${encodeURIComponent(invMatch[0])}`;
    return '/procurement/create-purchase-invoice';
  }

  // 5. Accounts Payable / Purchase Invoices & PI Approvals (Must be after Payment Vouchers and before POs)
  if (
    lower.includes('purchase invoice') ||
    lower.includes('invoice') ||
    lower.includes('accounts payable') ||
    piMatch
  ) {
    if (piMatch) return `/accounts-payable?search=${encodeURIComponent(piMatch[0])}`;
    return '/accounts-payable';
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
  const rawCombined = `${title} ${message}`.trim();
  const combined = rawCombined.toLowerCase();
  const base = companyCode ? `/v/${companyCode}` : '/vendor';

  // Extract RFQ/entity identifiers if present in text
  const rfqMatch = rawCombined.match(/\b(?:[a-z0-9]+-)?rfq-[a-z0-9_-]+\b/i) || rawCombined.match(/\brfq-[a-z0-9_-]+\b/i);
  const qtnMatch = rawCombined.match(/\b(?:[a-z0-9]+-)?qtn-[a-z0-9_-]+\b/i) || rawCombined.match(/\bqtn-[a-z0-9_-]+\b/i);
  const effectiveSearch = rfqMatch ? rfqMatch[0] : (rfqId || '');

  // 1. Quotations (Submitted, Awarded, Approved, Rejected, Returned, Under Review, Shortlisted, etc.)
  // If the notification relates to a quotation action, route to My Quotations (/vendor/quotations)
  const isQuotationNotification =
    combined.includes('quotation') ||
    combined.includes('quote') ||
    combined.includes('winning vendor') ||
    combined.includes('not selected') ||
    combined.includes('resubmission required') ||
    Boolean(qtnMatch);

  // Check if this is specifically an RFQ Invitation (vendor invited to submit a new quote)
  const isRfqInvitation =
    combined.includes('new rfq') ||
    combined.includes('rfq invited') ||
    combined.includes('rfq_invited') ||
    combined.includes('invited to submit') ||
    combined.includes('submit a quotation') ||
    combined.includes('submit quotation') ||
    combined.includes('submit your quotation') ||
    combined.includes('request for quotation') ||
    combined.includes('rfq invitation');

  // If it's a quotation submission/update/status notification (even if it mentions RFQ), route to My Quotations
  if (isQuotationNotification && !isRfqInvitation) {
    if (effectiveSearch) {
      return `${base}/quotations?search=${encodeURIComponent(effectiveSearch)}`;
    }
    return `${base}/quotations`;
  }

  // 2. RFQ Invitations & Requests for Quotation (Always routes to "My RFQs" so vendor can view details & submit quotation)
  if (isRfqInvitation) {
    if (rfqId) {
      return `${base}/rfqs?rfq=${encodeURIComponent(rfqId)}`;
    }
    if (rfqMatch) {
      return `${base}/rfqs?search=${encodeURIComponent(rfqMatch[0])}`;
    }
    return `${base}/rfqs`;
  }

  // 3. Forms & Digital Agreements
  if (combined.includes('form') || combined.includes('forms')) {
    return `${base}/agreements`;
  }

  // 4. Contracts & Digital Agreements
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

  // 5. Payments
  if (
    combined.includes('payment') ||
    combined.includes('voucher') ||
    combined.includes('pay-') ||
    combined.includes('pv-')
  ) {
    return `${base}/payments`;
  }

  // 6. Invoices
  if (combined.includes('invoice') || combined.includes('pi-')) {
    return `${base}/invoices`;
  }

  // 6. Purchase Orders
  if (combined.includes('purchase order') || combined.includes('po-') || combined.includes('order')) {
    return `${base}/orders`;
  }

  // 7. General Quotations Fallback
  if (
    combined.includes('quotation') ||
    combined.includes('quote') ||
    combined.includes('qtn-') ||
    combined.includes('bid')
  ) {
    if (effectiveSearch) {
      return `${base}/quotations?search=${encodeURIComponent(effectiveSearch)}`;
    }
    return `${base}/quotations`;
  }

  // 8. Vendor Profile & Compliance
  if (combined.includes('profile') || combined.includes('bank') || combined.includes('document')) {
    return `${base}/profile`;
  }

  if (rfqId) {
    return `${base}/rfqs?rfq=${encodeURIComponent(rfqId)}`;
  }
  return `${base}/rfqs`;
}
