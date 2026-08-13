// ─── Status Enums ───────────────────────────────────────────

export type RFQStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED' | 'REJECTED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';

// ─── User & Auth ────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  companyCode: string;
  department?: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  role?: Role;
}

export interface Role {
  id: string;
  roleName: string;
}

export interface Permission {
  id: string;
  roleId: string;
  module: string;
  canView: boolean;
  canApprove: boolean;
  canCreate: boolean;
}

export interface UserModulePermission {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canApprove: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  roles: string[];
  permissions?: UserModulePermission[];
}

export interface LoginPayload {
  username: string;
  password: string;
}

// ─── RFQ ────────────────────────────────────────────────────

export interface RFQ {
  id: string;
  rfqNumber: string;
  title: string;
  description?: string;
  createdBy: string;
  status: RFQStatus;
  closingDate?: string | null;
  createdAt: string;
  creator?: User;
  items?: RFQItem[];
  vendors?: RFQVendor[];
  quotations?: Quotation[];
  rfqType?: 'RFQ' | 'TENDER';
  customFields?: RFQCustomField[];
  evaluationParameters?: RFQEvaluationParameter[];
  supplierScores?: RFQSupplierParameterScore[];
  // Bid Security
  bidSecurityRequired?: boolean;
  bidBondRequired?: boolean;
  bidSecurityMinValue?: number;
  bidSecurityMinValidity?: number;
  bidBondMinValue?: number;
  bidBondMinValidity?: number;
  // Approval Settings
  rfqApprovalStartPoint?: 'ORIGINATOR' | 'L1_USER';
  quotationApprovalMode?: 'DIRECT_X_ONLY' | 'FULL_CHAIN';
  quotationXUserRole?: string;
}

export interface RFQItem {
  id: string;
  rfqId: string;
  itemName: string;
  description?: string;
  quantity: number;
  unit?: string;
  expectedDate?: string;
}

export interface RFQVendor {
  id: string;
  rfqId: string;
  vendorId: string;
  status: string;
  vendor?: Vendor;
}

// ─── Quotation ──────────────────────────────────────────────

export interface Quotation {
  id: string;
  rfqId: string;
  vendorId: string;
  totalPrice: number;
  currency?: string;
  leadTimeDays?: number;
  paymentTerms?: string;
  score?: number;
  status: string;
  submittedAt: string;
  vendor?: Vendor;
  items?: QuotationItem[];
  attachments?: QuotationAttachment[];
  selectedItemIds?: string[] | null;
  userAction?: string | null;
}

export interface QuotationAttachment {
  id: string;
  originalName: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  rfqItemId: string;
  unitPrice: number;
  totalPrice: number;
}

// ─── Vendor ─────────────────────────────────────────────────

export interface Vendor {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  contactPerson?: string | null;
  category?: string | null;
  location?: string | null;
  website?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankBranch?: string | null;
  createdBy: string;
  isActive: boolean;
  performance?: VendorPerformance;
}

export interface VendorPerformance {
  id: string;
  vendorId: string;
  avgQuality: number;
  avgDelivery: number;
  avgPriceScore: number;
  overallScore: number;
}

// ─── Purchase Order ─────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  rfqId: string;
  vendorId: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  rfq?: RFQ;
  vendor?: Vendor;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// ─── RFQ Type System ──────────────────────────────────────────

export interface RFQCustomField {
  id: string;
  rfqId: string;
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'attachment';
  required: boolean;
  active: boolean;
}

export interface RFQEvaluationParameter {
  id: string;
  rfqId: string;
  parameterName: string;
  parameterType: 'system' | 'custom';
  weightage: number;
  active: boolean;
  sortOrder: number;
  scores?: RFQSupplierParameterScore[];
}

export interface RFQSupplierParameterScore {
  id: string;
  rfqId: string;
  parameterId: string;
  vendorId: string;
  score: number;
  remarks?: string | null;
}

export interface RFQEvaluationData {
  rfq: {
    id: string;
    rfqNumber: string;
    title: string;
    rfqType: 'RFQ' | 'TENDER';
    status: string;
  };
  parameters: Array<{
    id: string;
    parameterName: string;
    parameterType: string;
    weightage: number;
  }>;
  suppliers: Array<{
    vendorId: string;
    vendorName: string;
    vendorEmail: string;
    scores: Array<{
      parameterId: string;
      parameterName: string;
      weightage: number;
      score: number;
    }>;
    calculatedScore: {
      totalScore: number;
      breakdown: Array<{
        parameterId: string;
        parameterName: string;
        weightage: number;
        score: number;
        weightedScore: number;
      }>;
      maxPossibleScore: number;
      normalizedScore: number;
    };
    rank: number;
    isRecommended: boolean;
  }>;
  summary: {
    totalSuppliers: number;
    recommendedVendor: {
      vendorId: string;
      vendorName: string;
      vendorEmail: string;
    } | null;
    averageScore: number;
  };
}

// ─── Bid Security ───────────────────────────────────────────

export type BidSecurityType = 'BID_BOND';
export type BidSecurityValueType = 'FIXED_AMOUNT' | 'PERCENTAGE';
export type BidSecurityValidityUnit = 'DAYS';
export type BidSecurityStatus = 'SUBMITTED' | 'VERIFIED' | 'REJECTED';

export interface RFQBidSecurity {
  required: boolean;
  type?: BidSecurityType;
  valueType?: BidSecurityValueType;
  value?: number;
  currency?: string;
  validityValue?: number;
  validityUnit?: BidSecurityValidityUnit;
  // Buyer-set minimum requirements
  minValue?: number;
  minValidity?: number;
}

export interface QuotationBidSecurity {
  id: string;
  quotationId: string;
  originalName: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  status: BidSecurityStatus;
  verifiedById?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  uploadedAt: string;
  // Bid Security details (vendor submitted)
  bidSecurityValueType?: string;
  bidSecurityValue?: number;
  bidSecurityCurrency?: string;
  bidSecurityValidityValue?: number;
  bidSecurityValidityUnit?: string;
  // Bid Bond details (vendor submitted)
  bondNumber?: string;
  issuer?: string;
  bondAmount?: number;
  bondCurrency?: string;
  issueDate?: string;
  expiryDate?: string;
  bidBondValidityValue?: number;
  bidBondValidityUnit?: string;
}

// ─── Approval ───────────────────────────────────────────────

export interface ApprovalLevel {
  id: string;
  module: string;
  levelNumber: number;
  requiredRole: string;
  timeLimitHours?: number;
  minValue?: number | null;
  maxValue?: number | null;
  currency?: string;
  createdAt?: string;
}

export interface RequestApproval {
  id: string;
  module: string;
  referenceId: string;
  levelId: string;
  status: ApprovalStatus;
  approverId?: string;
  level?: ApprovalLevel;
  approver?: User;
}

export interface ApprovalLog {
  id: string;
  requestId: string;
  levelId: string;
  approverId: string;
  action: string;
  comments?: string;
  createdAt: string;
}

// ─── Supporting ─────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message?: string;
  isRead: boolean;
}

export interface AuditTrail {
  id: string;
  userId?: string;
  action: string;
  module?: string;
  createdAt: string;
  user?: User;
}

export interface Attachment {
  id: number;
  module: string;
  referenceId: string;
  fileType: string;
  filePath: string;
}

export * from './formBuilder';
