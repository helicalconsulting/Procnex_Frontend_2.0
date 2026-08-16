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

  return {
    id: String(rfq.id),
    rfqNumber: String(rfq.rfqNumber),
    title: String(rfq.title),
    description: String(rfq.description || ''),
    status: mapBackendRfqStatus(String(rfq.status)),
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

export function mapVendorToTableRow(v: Vendor & Record<string, unknown>): VendorTableRow {
  const name = v.name;
  const raw = v as Record<string, unknown>;
  const rawLocation = raw.location as string | null | undefined;
  const rawAddress = raw.address as string | null | undefined;
  // If location is empty/missing, use address as fallback
  const location = rawLocation || rawAddress || '—';
  // Extract performance data from the nested `performance` object
  const perf = raw.performance as { avgQuality?: number; avgDelivery?: number; avgPriceScore?: number; overallScore?: number } | null | undefined;
  return {
    id: v.id,
    name,
    email: v.email,
    phone: String(raw.phone || '—'),
    contactPerson: String(raw.contactPerson || name),
    category: String(raw.category || 'General'),
    location: String(location),
    website: String(raw.website || '—'),
    isActive: v.isActive,
    initials: initials(name),
    avatarMod: String((Number(v.id) % 6) + 1),
    avgQuality: perf?.avgQuality ?? 0,
    avgDelivery: perf?.avgDelivery ?? 0,
    avgPriceScore: perf?.avgPriceScore ?? 0,
    overallScore: perf?.overallScore ?? 0,
    totalOrders: Number(raw.totalOrders || 0),
    createdAt: String(raw.createdAt || new Date().toISOString()).slice(0, 10),
    hasPortalCredentials: Boolean(raw.hasPortalCredentials),
    passwordSetupPending: Boolean(raw.passwordSetupPending),
    // Additional profile fields from backend (may be null for mock)
    address: raw.address as string | undefined || undefined,
    gstNumber: raw.gstNumber as string | undefined || undefined,
    panNumber: raw.panNumber as string | undefined || undefined,
    bankName: raw.bankName as string | undefined || undefined,
    bankAccountNumber: raw.bankAccountNumber as string | undefined || undefined,
    bankIfscCode: raw.bankIfscCode as string | undefined || undefined,
    bankBranch: raw.bankBranch as string | undefined || undefined,
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
  };
  const level = a.level as { levelNumber?: number; requiredRole?: string } | undefined;
  const createdBy = a.createdBy as { fullName?: string } | undefined;
  const amount = Number(a.amount || 0);
  const currency = (a.currency as string) || 'KES';

  return {
    id: String(a.id),
    referenceId: String(a.referenceId || ''),
    module: moduleMap[String(a.module)] || 'RFQ',
    referenceNumber: String(a.referenceNumber || `#${a.referenceId}`),
    title: String(a.title || `${a.module} #${a.referenceId}`),
    requestedBy: createdBy?.fullName || 'Unknown',
    requestedByInitials: initials(createdBy?.fullName),
    avatarMod: String((Number(a.id) % 6) + 1),
    amount: amount ? formatApprovalAmount(amount, currency) : '—',
    amountNum: amount,
    currency,
    currentLevel: level?.levelNumber || 1,
    totalLevels: Number(a.totalLevels || 1),
    requiredRole: level?.requiredRole || 'Approver',
    status: String(a.status) as ApprovalTableRow['status'],
    priority: (String(a.priority || 'MEDIUM').toUpperCase() as ApprovalTableRow['priority']) || 'MEDIUM',
    submittedAt: String(a.createdAt || a.submittedAt || new Date().toISOString()),
    comments: a.comments ? String(a.comments) : undefined,
    department: String(a.department || '—'),
    canAct: Boolean(a.canAct ?? true),
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
