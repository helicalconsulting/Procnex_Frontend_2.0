import type { RFQ, RFQStatus, Vendor, Notification } from '../types';
import type {
  RFQTableRow,
  RFQQuotationSummary,
  VendorTableRow,
  ApprovalTableRow,
  NotificationRow,
} from '../types/viewModels';
import { formatCurrency } from '../components/shared/CurrencyMaster';

const BACKEND_TO_UI_RFQ_STATUS: Record<string, RFQStatus> = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED',
  RE_REVIEW: 'RETURNED',
  RETURN_FOR_RE_REVIEW: 'RETURNED',
  RETURNED_TO_ORIGINATOR: 'RETURNED',
  SENT: 'ACCEPTED',
  QUOTATIONS_RECEIVED: 'ACCEPTED',
  UNDER_EVALUATION: 'ACCEPTED',
  PO_CREATED: 'CLOSED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
  IN_PROGRESS: 'ACCEPTED',
  ACCEPTED: 'ACCEPTED',
};

export function mapBackendRfqStatus(status: string): RFQStatus {
  return BACKEND_TO_UI_RFQ_STATUS[status] || (status as RFQStatus) || 'DRAFT';
}

function initials(name?: string): string {
  if (!name) return '??';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Map API RFQ list item to table row */
export function mapApiRfqToTableRow(rfq: Record<string, unknown>): RFQTableRow {
  const creator = rfq.creator as { fullName?: string; department?: string } | undefined;
  const counts = rfq._count as { items?: number; vendors?: number; quotations?: number } | undefined;
  const items = (rfq.items as Array<Record<string, unknown>>) || [];
  const vendors = (rfq.vendors as Array<Record<string, unknown>>) || [];
  const quotationsRaw = (rfq.quotations as Array<Record<string, unknown>>) || [];

  const quotations: RFQQuotationSummary[] = quotationsRaw.map((q) => {
    const vendor = (q.vendor || {}) as Record<string, unknown>;
    const rawSnapshot = q.paymentPlanSnapshot;
    let snapshot: Array<{ title: string; percentage: number }> | null = null;
    if (rawSnapshot && Array.isArray(rawSnapshot)) {
      snapshot = (rawSnapshot as Array<Record<string, unknown>>).map((s) => ({
        title: String(s.title || ''),
        percentage: Number(s.percentage) || 0,
      }));
    }
    return {
      id: String(q.id),
      vendorId: String(q.vendorId),
      vendorName: String(vendor.name || 'Vendor'),
      vendorEmail: String(vendor.email || ''),
      totalPrice: Number(q.totalPrice),
      leadTimeDays: q.leadTimeDays != null ? Number(q.leadTimeDays) : null,
      paymentTerms: q.paymentTerms ? String(q.paymentTerms) : null,
      paymentPlanSnapshot: snapshot,
      currency: q.currency ? String(q.currency) : undefined,
      status: String(q.status || 'SUBMITTED'),
      submittedAt: String(q.submittedAt || '').slice(0, 10),
    };
  });

  const rawStatus = String(rfq.status || '');
  const isDocReturned = rawStatus === 'RETURNED' || rawStatus === 'RE_REVIEW' || rawStatus === 'RETURN_FOR_RE_REVIEW' || rawStatus === 'RETURNED_TO_ORIGINATOR' || Boolean(rfq.isReturnedByMe) || rfq.userAction === 'RETURNED';
  const isDocRejected = rawStatus === 'REJECTED' || Boolean(rfq.isRejectedByMe) || rfq.userAction === 'REJECTED';
  const isDocApproved = !isDocReturned && !isDocRejected && (rawStatus === 'APPROVED' || rawStatus === 'SENT' || rawStatus === 'ACCEPTED' || Boolean(rfq.isApprovedByMe) || rfq.userAction === 'APPROVED');

  const finalStatus: RFQStatus = isDocReturned
    ? 'RETURNED'
    : isDocRejected
    ? 'REJECTED'
    : isDocApproved
    ? 'APPROVED'
    : mapBackendRfqStatus(rawStatus);

  return {
    id: String(rfq.id),
    rfqNumber: String(rfq.rfqNumber),
    title: String(rfq.title),
    description: String(rfq.description || ''),
    status: finalStatus,
    _isApprovedByMe: Boolean(isDocApproved && (rfq.isApprovedByMe || rfq.userAction === 'APPROVED')),
    _isReturnedByMe: Boolean(isDocReturned),
    _isRejectedByMe: Boolean(isDocRejected),
    canUserAct: Boolean(rfq.canUserAct),
    createdAt: String(rfq.createdAt).slice(0, 10),
    creator: creator?.fullName || 'Unknown',
    creatorInitials: initials(creator?.fullName),
    vendorCount: counts?.vendors ?? vendors.length,
    itemCount: counts?.items ?? items.length,
    totalEstimate: rfq.totalEstimate ? String(rfq.totalEstimate) : '—',
    priority: String(rfq.priority || 'Medium'),
    department: String(rfq.department || creator?.department || '—'),
    closingDate: rfq.closingDate ? String(rfq.closingDate).slice(0, 10) : String(rfq.createdAt).slice(0, 10),
    currency: String(rfq.currency || 'KES'),
    lineItems: items.map((item) => ({
      id: String(item.id),
      itemName: String(item.itemName),
      description: String(item.description || ''),
      quantity: String(item.quantity),
      unit: String(item.unit || '—'),
      expectedDate: item.expectedDate ? String(item.expectedDate).slice(0, 10) : '',
    })),
    vendors: vendors.map((v) => {
      const vendor = (v.vendor || v) as Record<string, unknown>;
      const name = String(vendor.name || '');
      const perf = (vendor.performance as Record<string, unknown>) || {};
      return {
        id: String(vendor.id || v.vendorId),
        name,
        email: String(vendor.email || ''),
        initials: initials(name),
        avatarMod: String((Number(vendor.id) || 1) % 6),
        score: (perf.overallScore as number) ?? (vendor.score as number) ?? 0,
      };
    }),    quotationCount: counts?.quotations ?? quotations.length,
    quotations,
    rfqType: (rfq.rfqType as 'RFQ' | 'TENDER') || 'RFQ',
    customFields: Array.isArray(rfq.customFields)
      ? (rfq.customFields as Array<Record<string, unknown>>).map((cf: any) => {
          let parsed: any = {};
          if (typeof cf.value === 'string' && cf.value.trim().startsWith('{')) {
            try { parsed = JSON.parse(cf.value); } catch {}
          }
          return {
            id: parsed.id || cf.id,
            fieldName: parsed.fieldName || cf.fieldName || cf.key,
            fieldType: parsed.fieldType || cf.fieldType || 'text',
            required: parsed.required ?? cf.required ?? false,
            weightage: parsed.weightage ?? cf.weightage ?? 0,
          };
        })
      : undefined,
    evaluationParameters: rfq.evaluationParameters as Array<Record<string, unknown>> | undefined,
    // Bid Security
    bidSecurityRequired: rfq.bidSecurityRequired as boolean | undefined,
    bidBondRequired: rfq.bidBondRequired as boolean | undefined,
    bidSecurityType: rfq.bidSecurityType as string | undefined,
    bidSecurityValueType: rfq.bidSecurityValueType as string | undefined,
    bidSecurityValue: rfq.bidSecurityValue as number | undefined,
    bidSecurityCurrency: rfq.bidSecurityCurrency as string | undefined,
    bidSecurityValidityValue: rfq.bidSecurityValidityValue as number | undefined,
    bidSecurityValidityUnit: rfq.bidSecurityValidityUnit as string | undefined,
    // Raw backend fields needed by the edit page (CreateRFQPage)
  };
}

export function mapApiRfqDetailToTableRow(rfq: Record<string, unknown>): RFQTableRow {
  return mapApiRfqToTableRow(rfq);
}

function safeString(val: unknown, fallback = '—'): string {
  if (val == null) return fallback;
  if (typeof val === 'string') return val || fallback;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.name === 'string' && obj.name) return obj.name;
    if (typeof obj.label === 'string' && obj.label) return obj.label;
    if (typeof obj.title === 'string' && obj.title) return obj.title;
    try {
      const str = String(val);
      return str === '[object Object]' ? fallback : str;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function mapVendorToTableRow(v: Vendor & Record<string, unknown>): VendorTableRow {
  const raw = v as Record<string, unknown>;
  const name = safeString(raw.name || raw.companyName || raw.vendorName || raw.contactPerson, 'Vendor');
  const email = safeString(raw.email, '');
  const phone = safeString(raw.phone, '—');
  const contactPerson = safeString(raw.contactPerson, name);
  const category = safeString(raw.category, 'General');
  const location = safeString(raw.location || raw.address, '—');
  const website = safeString(raw.website, '—');
  const perf = raw.performance as { avgQuality?: number; avgDelivery?: number; avgPriceScore?: number; overallScore?: number } | null | undefined;
  const idStr = safeString(raw.id, String(Math.random()));

  return {
    id: idStr,
    name,
    email,
    supplierCode: raw.supplierCode ? String(raw.supplierCode) : undefined,
    phone,
    contactPerson,
    category,
    location,
    website,
    isActive: Boolean(raw.isActive),
    isMobileAccessEnabled: Boolean(raw.isMobileAccessEnabled),
    initials: initials(name),
    avgQuality: perf?.avgQuality ?? (typeof raw.avgQuality === 'number' ? raw.avgQuality : 0),
    avgDelivery: perf?.avgDelivery ?? (typeof raw.avgDelivery === 'number' ? raw.avgDelivery : 0),
    avgPriceScore: perf?.avgPriceScore ?? (typeof raw.avgPriceScore === 'number' ? raw.avgPriceScore : 0),
    overallScore: perf?.overallScore ?? (typeof raw.overallScore === 'number' ? raw.overallScore : 0),
    totalOrders: Number(raw.totalOrders || 0),
    createdAt: safeString(raw.createdAt, new Date().toISOString()).slice(0, 10),
    hasPortalCredentials: Boolean(raw.hasPortalCredentials),
    passwordSetupPending: Boolean(raw.passwordSetupPending),
    // Additional profile fields from backend (may be null for mock)
    address: raw.address ? safeString(raw.address, undefined as any) : undefined,
    gstNumber: raw.gstNumber ? safeString(raw.gstNumber, undefined as any) : undefined,
    panNumber: raw.panNumber ? safeString(raw.panNumber, undefined as any) : undefined,
    bankName: raw.bankName ? safeString(raw.bankName, undefined as any) : undefined,
    bankAccountNumber: raw.bankAccountNumber ? safeString(raw.bankAccountNumber, undefined as any) : undefined,
    bankIfscCode: raw.bankIfscCode ? safeString(raw.bankIfscCode, undefined as any) : undefined,
    bankBranch: raw.bankBranch ? safeString(raw.bankBranch, undefined as any) : undefined,
  };
}

function formatApprovalAmount(amount: number, currency?: string): string {
  const curr = currency || 'KES';
  try {
    return formatCurrency(amount, curr);
  } catch {
    return `${curr} ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

export function mapApprovalToTableRow(a: Record<string, unknown>): ApprovalTableRow {
  const moduleMap: Record<string, ApprovalTableRow['module']> = {
    RFQ: 'RFQ',
    PO: 'Purchase Order',
    Quotations: 'Quotation',
    Quotation: 'Quotation',
    QUOTATION: 'Quotation',
    'Quotation Approval': 'Quotation',
    PurchaseOrders: 'Purchase Order',
    PurchaseOrder: 'Purchase Order',
    'Purchase Orders': 'Purchase Order',
    'PO Approval': 'Purchase Order',
    Contract: 'Contract',
    Contracts: 'Contract',
    AccountsPayable: 'Purchase Invoice',
    'Accounts Payable': 'Purchase Invoice',
    'AccountsPayable Approval': 'Purchase Invoice',
    PurchaseInvoice: 'Purchase Invoice',
    'Purchase Invoice': 'Purchase Invoice',
    'PurchaseInvoice Approval': 'Purchase Invoice',
    'Purchase Invoice Approval': 'Purchase Invoice',
    'PO Invoice': 'Purchase Invoice',
    Payments: 'Payment',
    Payment: 'Payment',
    'Payment Voucher': 'Payment',
    'Payment Voucher Approval': 'Payment',
    'Payment Approval': 'Payment',
    PAYMENT: 'Payment',
  };
  const level = a.level as { levelNumber?: number; requiredRole?: string } | undefined;
  const createdBy = a.createdBy as { fullName?: string } | undefined;
  const amount = Number(a.amount || 0);
  const currency = (a.currency as string) || 'KES';

  const rawLevelNum = Number(
    (a.currentLevel as number) ?? (a.current_level as number) ?? level?.levelNumber ?? 1
  );
  const rawTotalLevels = Number(
    (a.totalLevels as number) ?? (a.maxLevels as number) ?? (a.max_levels as number) ?? 2
  );
  const rawRole =
    (a.requiredRole as string) ||
    (a.required_role as string) ||
    level?.requiredRole ||
    (rawLevelNum === 2 ? 'Purchase Clerk' : 'Purchase Manager');

  return {
    id: String(a.id),
    referenceId: String(a.referenceId || a.entityId || ''),
    module: moduleMap[String(a.module || a.entityType)] || 'RFQ',
    referenceNumber: String(a.referenceNumber || a.referenceId || `#${a.id}`),
    title: String(a.title || `${a.module} #${a.referenceId}`),
    requestedBy: createdBy?.fullName || String(a.createdBy || 'Unknown'),
    requestedByInitials: initials(createdBy?.fullName || String(a.createdBy || 'Unknown')),
    avatarMod: String((Number(a.id) % 6) + 1),
    amount: amount ? formatApprovalAmount(amount, currency) : '—',
    amountNum: amount,
    currency,
    currentLevel: rawLevelNum,
    totalLevels: rawTotalLevels,
    requiredRole: rawRole,
    status: String(a.status) as ApprovalTableRow['status'],
    priority: (String(a.priority || 'MEDIUM').toUpperCase() as ApprovalTableRow['priority']) || 'MEDIUM',
    submittedAt: String(a.createdAt || a.submittedAt || new Date().toISOString()),
    comments: a.comments ? String(a.comments) : undefined,
    department: String(a.department || '—'),
    canAct: Boolean(a.canAct ?? false),
    isReturned: Boolean(a.isReturned || (a as any).isReReview || a.status === 'RETURNED' || (a.comments && /return/i.test(String(a.comments)))),
  };
}

export function mapNotificationToRow(n: Notification & Record<string, unknown>): NotificationRow {
  const msg = n.message || '';
  let type: NotificationRow['type'] = 'SYSTEM';
  if (msg.toLowerCase().includes('approval') || n.title.toLowerCase().includes('approval')) type = 'APPROVAL';
  else if (msg.toLowerCase().includes('rfq') || n.title.toLowerCase().includes('rfq')) type = 'RFQ';
  else if (msg.toLowerCase().includes('order') || n.title.toLowerCase().includes('order')) type = 'ORDER';
  else if (msg.toLowerCase().includes('vendor')) type = 'VENDOR';
  else if (msg.toLowerCase().includes('alert') || msg.toLowerCase().includes('overdue')) type = 'ALERT';

  return {
    id: n.id,
    type,
    title: n.title,
    message: msg,
    isRead: n.isRead,
    linkedRef: String((n as Record<string, unknown>).linkedRef || '—'),
    createdAt: String((n as Record<string, unknown>).createdAt || new Date().toISOString()),
    from: String((n as Record<string, unknown>).from || 'System'),
  };
}

export function mapRfqFromTypes(rfq: RFQ): RFQTableRow {
  return mapApiRfqToTableRow(rfq as unknown as Record<string, unknown>);
}

export { MOCK_RFQS } from '../config/mockData';
export { MOCK_VENDORS, MOCK_QUOTATIONS, MOCK_PURCHASE_ORDERS, MOCK_REQUEST_APPROVALS, MOCK_APPROVAL_LEVELS, MOCK_NOTIFICATIONS } from '../config/mockData';
