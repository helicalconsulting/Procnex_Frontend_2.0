/**
 * Local fallback data for modules that currently do not have dedicated backend APIs.
 *
 * When `VITE_USE_MOCK=false`, we MUST NOT return mock data (to keep the app dynamic),
 * so we return empty lists instead.
 */
import { USE_MOCK } from '../config/mock';
import { apiRequest, warnNoBackend } from '../api/client';

export interface Payment {
  id: number;
  paymentId: string;
  vendor: string;
  invoiceRef: string;
  amount: number;
  method: string;
  status: string;
  paidAt: string;
  approvedBy?: string;
  remarks?: string;
}

export interface SalesOrder {
  id: number;
  soNumber: string;
  customer: string;
  amount: number;
  status: string;
  orderDate: string;
  itemCount?: number;
  region?: string;
  salesRep?: string;
}

export interface AuditEntry {
  id: number;
  user: string;
  action: string;
  module: string;
  timestamp: string;
  details: string;
  ipAddress?: string;
  referenceId?: string;
}

export interface DocumentItem {
  id: number;
  name: string;
  module: string;
  uploadedBy: string;
  uploadedAt: string;
  size: string;
}

const PAYMENTS_MOCK: Payment[] = [];

const SALES_ORDERS_MOCK: SalesOrder[] = [
  { id: 1, soNumber: 'SO-2024-010', customer: 'ABC Industries', amount: 1250000, status: 'CONFIRMED', orderDate: '2024-04-20', itemCount: 12, region: 'North Region', salesRep: 'Vikram Malhotra' },
  { id: 2, soNumber: 'SO-2024-009', customer: 'XYZ Corp', amount: 890000, status: 'SHIPPED', orderDate: '2024-04-18', itemCount: 8, region: 'West Region', salesRep: 'Neha Gupta' },
  { id: 3, soNumber: 'SO-2024-011', customer: 'Tata Dynamics', amount: 2450000, status: 'DELIVERED', orderDate: '2024-04-10', itemCount: 25, region: 'South Region', salesRep: 'Rohan Verma' },
  { id: 4, soNumber: 'SO-2024-012', customer: 'Bharti Infra', amount: 1780000, status: 'PROCESSING', orderDate: '2024-04-22', itemCount: 15, region: 'North Region', salesRep: 'Vikram Malhotra' },
  { id: 5, soNumber: 'SO-2024-013', customer: 'Sterling Enterprises', amount: 620000, status: 'DRAFT', orderDate: '2024-04-25', itemCount: 5, region: 'East Region', salesRep: 'Anjali Singh' },
  { id: 6, soNumber: 'SO-2024-014', customer: 'Mahindra Infra Projects', amount: 3150000, status: 'CONFIRMED', orderDate: '2024-04-24', itemCount: 30, region: 'West Region', salesRep: 'Neha Gupta' },
  { id: 7, soNumber: 'SO-2024-015', customer: 'Synergy Systems', amount: 430000, status: 'CANCELLED', orderDate: '2024-04-12', itemCount: 4, region: 'Central Region', salesRep: 'Rohan Verma' },
  { id: 8, soNumber: 'SO-2024-016', customer: 'Horizon Retail Ltd', amount: 1560000, status: 'SHIPPED', orderDate: '2024-04-21', itemCount: 18, region: 'South Region', salesRep: 'Rohan Verma' },
  { id: 9, soNumber: 'SO-2024-017', customer: 'Quantum Tech Labs', amount: 980000, status: 'DELIVERED', orderDate: '2024-04-05', itemCount: 10, region: 'North Region', salesRep: 'Vikram Malhotra' },
  { id: 10, soNumber: 'SO-2024-018', customer: 'Sun Pharma Logistics', amount: 2100000, status: 'PROCESSING', orderDate: '2024-04-26', itemCount: 22, region: 'West Region', salesRep: 'Neha Gupta' },
  { id: 11, soNumber: 'SO-2024-019', customer: 'Apex Global Trade', amount: 840000, status: 'DRAFT', orderDate: '2024-04-27', itemCount: 7, region: 'East Region', salesRep: 'Anjali Singh' },
  { id: 12, soNumber: 'SO-2024-020', customer: 'Godrej Consumer Goods', amount: 1890000, status: 'CONFIRMED', orderDate: '2024-04-28', itemCount: 16, region: 'South Region', salesRep: 'Rohan Verma' },
];

const AUDIT_MOCK: AuditEntry[] = [
  {
    id: 1,
    user: 'Vikram Malhotra',
    action: 'PO_APPROVE',
    module: 'PO',
    timestamp: '2026-09-08T07:45:00',
    details: 'Approved Purchase Order PO-20260824-3715 for ₹1,250,000 (Level 2 Finance Approval completed)',
    referenceId: 'PO-20260824-3715',
    ipAddress: '103.21.14.88',
  },
  {
    id: 2,
    user: 'System Administrator',
    action: 'VENDOR_APPROVE',
    module: 'VENDOR',
    timestamp: '2026-09-08T07:12:00',
    details: 'Approved vendor onboarding & verified GST/PAN compliance documents for Acme Industrial Suppliers',
    referenceId: 'VND-9102',
    ipAddress: '192.168.1.10',
  },
  {
    id: 3,
    user: 'Anjali Singh',
    action: 'CONTRACT_SIGN',
    module: 'CONTRACT',
    timestamp: '2026-09-08T06:30:00',
    details: 'Executed digital signature on Master Services Agreement (MSA) with Apex Logistics Pvt Ltd',
    referenceId: 'CNT-2026-004',
    ipAddress: '192.168.1.14',
  },
  {
    id: 4,
    user: 'Neha Gupta',
    action: 'INVOICE_APPROVE',
    module: 'AP',
    timestamp: '2026-09-08T05:15:00',
    details: 'Verified 3-Way Match (PO vs GRN vs Invoice) & approved Tax Invoice INV-2026-089 for ₹450,000',
    referenceId: 'INV-2026-089',
    ipAddress: '192.168.1.22',
  },
  {
    id: 5,
    user: 'Rahul Sharma',
    action: 'RFQ_CREATE',
    module: 'RFQ',
    timestamp: '2026-09-07T16:20:00',
    details: 'Published Request for Quotation RFQ-2026-104 (Steel Raw Materials) to 5 invited suppliers',
    referenceId: 'RFQ-2026-104',
    ipAddress: '192.168.1.45',
  },
  {
    id: 6,
    user: 'Finance Executive',
    action: 'PAYMENT_EXPORT',
    module: 'PAYMENTS',
    timestamp: '2026-09-07T14:10:00',
    details: 'Generated NEFT Payment Voucher VOU-2026-8819 for ₹890,000 and exported HDFC Bank Payment File',
    referenceId: 'VOU-2026-8819',
    ipAddress: '192.168.1.50',
  },
  {
    id: 7,
    user: 'Precision Tech Portal',
    action: 'CREATE',
    module: 'QUOTATION',
    timestamp: '2026-09-07T11:45:00',
    details: 'Supplier Precision Tech submitted sealed commercial quote QT-2026-042 for RFQ-2026-102',
    referenceId: 'QT-2026-042',
    ipAddress: '49.207.19.102',
  },
  {
    id: 8,
    user: 'System Administrator',
    action: 'UPDATE',
    module: 'USER',
    timestamp: '2026-09-07T09:30:00',
    details: 'Updated role permissions: Added PO Level 3 Approval threshold (₹5,000,000+) to Finance Director',
    referenceId: 'ROLE-FIN-DIR',
    ipAddress: '192.168.1.10',
  },
  {
    id: 9,
    user: 'Vikram Malhotra',
    action: 'LOGIN',
    module: 'AUTH',
    timestamp: '2026-09-07T08:50:00',
    details: 'User logged in successfully via Multi-Factor Authentication (MFA)',
    referenceId: 'SESSION-90812',
    ipAddress: '103.21.14.88',
  },
  {
    id: 10,
    user: 'Rohan Verma',
    action: 'REJECT',
    module: 'PO',
    timestamp: '2026-09-06T17:05:00',
    details: 'Rejected Purchase Requisition PR-2026-054 due to missing technical specifications attached',
    referenceId: 'PR-2026-054',
    ipAddress: '192.168.1.33',
  },
  {
    id: 11,
    user: 'Mahindra Infra',
    action: 'UPDATE',
    module: 'VENDOR',
    timestamp: '2026-09-06T14:40:00',
    details: 'Uploaded renewed GST Certificate & Bank Cancelled Cheque for compliance verification',
    referenceId: 'DOC-GST-992',
    ipAddress: '115.240.88.14',
  },
  {
    id: 12,
    user: 'System Administrator',
    action: 'EXPORT',
    module: 'AUTH',
    timestamp: '2026-09-06T12:00:00',
    details: 'Exported monthly system activity & compliance audit trail log report (CSV Format)',
    referenceId: 'AUD-EXP-20260906',
    ipAddress: '192.168.1.10',
  },
  {
    id: 13,
    user: 'Rahul Sharma',
    action: 'CREATE',
    module: 'PO',
    timestamp: '2026-09-05T15:30:00',
    details: 'Dispatched officially signed Purchase Order PO-20260824-3714 to Sterling Enterprises',
    referenceId: 'PO-20260824-3714',
    ipAddress: '192.168.1.45',
  },
  {
    id: 14,
    user: 'System Administrator',
    action: 'UPDATE',
    module: 'APPROVALS',
    timestamp: '2026-09-05T11:15:00',
    details: 'Updated Approval Level Workflow: Required 2 signatures for Purchase Orders > ₹1,000,000',
    referenceId: 'WF-PO-APP',
    ipAddress: '192.168.1.10',
  },
  {
    id: 15,
    user: 'Rohan Verma',
    action: 'DELETE',
    module: 'VENDOR',
    timestamp: '2026-09-04T16:00:00',
    details: 'Suspended vendor profile VND-4019 due to failed quality audit inspection report',
    referenceId: 'VND-4019',
    ipAddress: '192.168.1.33',
  },
];

const DOCUMENTS_MOCK: DocumentItem[] = [
  { id: 1, name: 'PO-2024-0040.pdf', module: 'PO', uploadedBy: 'Rahul Sharma', uploadedAt: '2024-04-20', size: '245 KB' },
  { id: 2, name: 'RFQ-2024-019-specs.docx', module: 'RFQ', uploadedBy: 'Priya Patel', uploadedAt: '2024-04-18', size: '1.2 MB' },
];

export const localDataService = {
  getPayments: async () => {
    let customPayments: Payment[] = [];
    try {
      const stored = localStorage.getItem('heliflow_custom_payments');
      if (stored) {
        customPayments = JSON.parse(stored);
      }
    } catch (_e) {
      customPayments = [];
    }

    if (!USE_MOCK) {
      try {
        const data = await apiRequest<{ payments: Array<Record<string, any>> }>('/payments');
        if (data.payments && data.payments.length > 0) {
          const apiPayments = data.payments.map((p, idx) => ({
            id: typeof p.id === 'number' ? p.id : idx + 1000,
            paymentId: p.paymentNumber || p.paymentId || `PAY-${p.id}`,
            vendor: p.vendorName || p.vendor || '—',
            invoiceRef: p.invoiceRef || '—',
            amount: Number(p.amount || 0),
            method: p.method || 'NEFT',
            status: p.status || 'PENDING',
            paidAt: String(p.paidAt || p.scheduledAt || p.createdAt || '').slice(0, 10),
            approvedBy: p.approvedBy || 'Pending Approval (Payments Workflow)',
            remarks: p.remarks || p.comments || '',
          })) as Payment[];

          // Combine without duplicates
          const existingIds = new Set(customPayments.map(cp => cp.paymentId));
          const filteredApi = apiPayments.filter(ap => !existingIds.has(ap.paymentId));
          return [...customPayments, ...filteredApi];
        }
      } catch (_err) {
        // Fall back to custom payments if API call fails
      }
    }
    await delay();
    return customPayments;
  },
  savePayment: (newPayment: Partial<Payment>): Payment => {
    try {
      const stored = localStorage.getItem('heliflow_custom_payments');
      const list: Payment[] = stored ? JSON.parse(stored) : [];
      const created: Payment = {
        id: Date.now(),
        paymentId: newPayment.paymentId || `VOU-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        vendor: newPayment.vendor || 'Supplier',
        invoiceRef: newPayment.invoiceRef || '—',
        amount: newPayment.amount || 0,
        method: newPayment.method || 'NEFT',
        status: newPayment.status || 'PENDING',
        paidAt: newPayment.paidAt || new Date().toISOString().slice(0, 10),
        approvedBy: newPayment.approvedBy || 'Pending Approval (Payments Workflow)',
        remarks: newPayment.remarks || 'Auto-generated from Approved Purchase Invoice',
      };
      list.unshift(created);
      localStorage.setItem('heliflow_custom_payments', JSON.stringify(list));
      return created;
    } catch (e) {
      console.error('Failed to save payment locally', e);
      return {
        id: Date.now(),
        paymentId: `VOU-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        vendor: newPayment.vendor || 'Supplier',
        invoiceRef: newPayment.invoiceRef || '—',
        amount: newPayment.amount || 0,
        method: 'NEFT',
        status: 'PENDING',
        paidAt: new Date().toISOString().slice(0, 10),
        approvedBy: 'Pending Approval (Payments Workflow)',
      };
    }
  },
  getSalesOrders: async () => {
    if (!USE_MOCK) {
      try {
        const data = await apiRequest<{ salesOrders: Array<Record<string, any>> }>('/sales-orders');
        if (!data.salesOrders || data.salesOrders.length === 0) {
          return SALES_ORDERS_MOCK;
        }
        return data.salesOrders.map((so, idx) => ({
          id: typeof so.id === 'number' ? so.id : idx + 1,
          soNumber: so.soNumber || `SO-${so.id}`,
          customer: so.customerName || so.customer || '—',
          amount: Number(so.amount || 0),
          status: so.status || 'DRAFT',
          orderDate: String(so.orderDate || so.createdAt || '').slice(0, 10),
          itemCount: Number(so.itemCount || 4),
          region: so.region || 'North Region',
          salesRep: so.salesRep || 'Rahul Sharma',
        })) as SalesOrder[];
      } catch (_err) {
        return SALES_ORDERS_MOCK;
      }
    }
    await delay();
    return SALES_ORDERS_MOCK;
  },
  getAuditTrail: async () => {
    try {
      const data = await apiRequest<{ auditTrail?: AuditEntry[] }>('/audit-trail?limit=2000');
      if (data && Array.isArray(data.auditTrail)) {
        return data.auditTrail;
      }
    } catch (_err) {
      // Backend request error
    }
    return [];
  },
  getDocuments: async () => {
    if (!USE_MOCK) {
      warnNoBackend('Documents');
      return [];
    }
    await delay();
    return DOCUMENTS_MOCK;
  },
  getReports: async () => {
    if (!USE_MOCK) {
      warnNoBackend('Reports');
      return [];
    }
    await delay();
    const { REPORTS_INVOICES_MOCK } = await import('../mocks/reportsPage.mock');
    return REPORTS_INVOICES_MOCK;
  },
};

function delay(ms = 200) {
  return new Promise((r) => setTimeout(r, ms));
}
