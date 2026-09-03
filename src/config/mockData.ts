/**
 * Comprehensive Mock Data for Development
 * Includes users (internal + vendor), RFQ, Quotations, POs, and approvals
 */

import type {
  User,
  RFQ,
  RFQItem,
  RFQVendor,
  Quotation,
  QuotationItem,
  Vendor,
  PurchaseOrder,
  PurchaseOrderItem,
  ApprovalLevel,
  RequestApproval,
  Notification,
} from '../types';

// ─── Empty Mock Data ─────────────────────────────────────────
export const INTERNAL_USERS: (User & { password: string; roles: string[] })[] = [];
export const VENDOR_USERS: (User & { password: string; roles: string[] })[] = [];
export const ALL_MOCK_USERS: (User & { password: string; roles: string[] })[] = [];

export const MOCK_VENDORS: Vendor[] = [];
export const MOCK_RFQ_ITEMS: RFQItem[] = [];
export const MOCK_RFQ_VENDORS: RFQVendor[] = [];
export const MOCK_RFQS: RFQ[] = [];
export const MOCK_QUOTATION_ITEMS: QuotationItem[] = [];
export const MOCK_QUOTATIONS: Quotation[] = [];
export const MOCK_APPROVAL_LEVELS: ApprovalLevel[] = [];
export const MOCK_REQUEST_APPROVALS: RequestApproval[] = [];
export const MOCK_PURCHASE_ORDERS: PurchaseOrder[] = [];
export const MOCK_NOTIFICATIONS: Notification[] = [];

export const MOCK_TOKEN = 'mock-jwt-token-heliflow-2025';
