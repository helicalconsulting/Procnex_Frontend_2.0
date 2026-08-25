import type { RFQStatus } from './index';

/** RFQ list row — used by RFQPage table */
export interface RFQTableRow {
  id: string;
  rfqNumber: string;
  title: string;
  description: string;
  status: RFQStatus;
  createdAt: string;
  creator: string;
  creatorInitials: string;
  vendorCount: number;
  itemCount: number;
  totalEstimate: string;
  priority: string;
  department: string;
  closingDate: string;
  currency: string;
  lineItems: {
    id: string;
    itemName: string;
    description: string;
    quantity: string;
    unit: string;
    expectedDate: string;
  }[];
  vendors: {
    id: string;
    name: string;
    email: string;
    initials: string;
    avatarMod: string;
    score: number;
  }[];
  quotationCount: number;
  quotations: RFQQuotationSummary[];
  rfqType?: 'RFQ' | 'TENDER';
  // Bid Security
  bidSecurityRequired?: boolean;
  bidBondRequired?: boolean;
  bidSecurityType?: string;
  bidSecurityValueType?: string;
  bidSecurityValue?: number;
  bidSecurityCurrency?: string;
  bidSecurityValidityValue?: number;
  bidSecurityValidityUnit?: string;
  // Buyer-set minimum requirements
  bidSecurityMinValue?: number;
  bidSecurityMinValidity?: number;
  bidBondMinValue?: number;
  bidBondMinValidity?: number;
  // Raw backend fields passed through for edit page
  customFields?: Array<Record<string, unknown>>;
  evaluationParameters?: Array<Record<string, unknown>>;
}

/** Quotation row on RFQ detail (admin view) */
export interface RFQQuotationSummary {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  totalPrice: number;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  paymentPlanSnapshot?: Array<{ title: string; percentage: number }> | null;
  status: string;
  submittedAt: string;
  /** Currency the vendor submitted the quotation in */
  currency?: string;
}

export interface VendorDocumentItem {
  id: string;
  name: string;
  type: string;
  documentNumber?: string;
  fileUrl?: string;
  submittedAt: string;
  expiryDate?: string | null;
  status?: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'PENDING_VERIFICATION' | 'NOT_PROVIDED';
  isRenewalRequested?: boolean;
}

export interface VendorTableRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  contactPerson: string;
  category: string;
  location: string;
  website: string;
  isActive: boolean;
  initials: string;
  avatarMod: string;
  avgQuality: number;
  avgDelivery: number;
  avgPriceScore: number;
  overallScore: number;
  totalOrders: number;
  createdAt: string;
  hasPortalCredentials?: boolean;
  passwordSetupPending?: boolean;
  /** Address — captured during onboarding; admin may want to see it */
  address?: string;
  gstNumber?: string;
  panNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankBranch?: string;
  documents?: VendorDocumentItem[];
}

export interface ApprovalTableRow {
  id: string;
  /** The ID of the referenced document (quotation / PO / RFQ) */
  referenceId: string;
  module: 'RFQ' | 'Purchase Order' | 'Quotation' | 'Contract';
  referenceNumber: string;
  title: string;
  requestedBy: string;
  requestedByInitials: string;
  avatarMod: string;
  amount: string;
  amountNum: number;
  currentLevel: number;
  totalLevels: number;
  requiredRole: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  submittedAt: string;
  comments?: string;
  department: string;
  canAct?: boolean;
}

export interface NotificationRow {
  id: string;
  type: 'APPROVAL' | 'ORDER' | 'RFQ' | 'SYSTEM' | 'VENDOR' | 'ALERT';
  title: string;
  message: string;
  isRead: boolean;
  linkedRef: string;
  createdAt: string;
  from: string;
}

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  trend: string;
  direction: 'up' | 'down' | 'neutral';
  modifier: string;
}

export interface DashboardPipelineItem {
  status: string;
  label: string;
  count: number;
}

export interface DashboardRecentRfq {
  id: string;
  rfqNumber: string;
  title: string;
  status: string;
  creator: string;
  quotations: number;
  createdAt: string;
}
