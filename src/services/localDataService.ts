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
}

export interface SalesOrder {
  id: number;
  soNumber: string;
  customer: string;
  amount: number;
  status: string;
  orderDate: string;
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

const PAYMENTS_MOCK: Payment[] = [
  { id: 1, paymentId: 'PAY-2024-001', vendor: 'TechSupply Co.', invoiceRef: 'INV-2024-0101', amount: 425000, method: 'NEFT', status: 'COMPLETED', paidAt: '2024-04-22' },
  { id: 2, paymentId: 'PAY-2024-002', vendor: 'SafeGuard Corp.', invoiceRef: 'INV-2024-0102', amount: 185000, method: 'RTGS', status: 'SCHEDULED', paidAt: '2024-04-28' },
];

const SALES_ORDERS_MOCK: SalesOrder[] = [
  { id: 1, soNumber: 'SO-2024-010', customer: 'ABC Industries', amount: 1250000, status: 'CONFIRMED', orderDate: '2024-04-20' },
  { id: 2, soNumber: 'SO-2024-009', customer: 'XYZ Corp', amount: 890000, status: 'SHIPPED', orderDate: '2024-04-18' },
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
    if (!USE_MOCK) {
      const data = await apiRequest<{ payments: Array<Record<string, any>> }>('/payments');
      return (data.payments || []).map((p) => ({
        id: p.id,
        paymentId: p.paymentNumber,
        vendor: p.vendorName,
        invoiceRef: p.invoiceRef || '',
        amount: Number(p.amount || 0),
        method: p.method || 'NEFT',
        status: p.status,
        paidAt: p.paidAt || p.scheduledAt || p.createdAt,
      })) as Payment[];
    }
    await delay();
    return PAYMENTS_MOCK;
  },
  getSalesOrders: async () => {
    if (!USE_MOCK) {
      const data = await apiRequest<{ salesOrders: Array<Record<string, any>> }>('/sales-orders');
      return (data.salesOrders || []).map((so) => ({
        id: so.id,
        soNumber: so.soNumber,
        customer: so.customerName,
        amount: Number(so.amount || 0),
        status: so.status,
        orderDate: so.orderDate || so.createdAt,
      })) as SalesOrder[];
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
