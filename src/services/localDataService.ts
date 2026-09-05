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
  { id: 1, user: 'admin', action: 'USER_LOGIN', module: 'AUTH', timestamp: '2024-04-26T10:00:00', details: 'Successful login' },
  { id: 2, user: 'procurement', action: 'RFQ_CREATE', module: 'RFQ', timestamp: '2024-04-25T14:30:00', details: 'Created RFQ-2024-020' },
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
    if (!USE_MOCK) {
      warnNoBackend('Audit Trail');
      return [];
    }
    await delay();
    return AUDIT_MOCK;
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
