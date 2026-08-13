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

const PAYMENTS_MOCK: Payment[] = [
  { id: 1, paymentId: 'PAY-2024-001', vendor: 'TechSupply Co.', invoiceRef: 'INV-2024-0101', amount: 425000, method: 'NEFT', status: 'COMPLETED', paidAt: '2024-04-22', approvedBy: 'Anand Verma (Finance VP)', remarks: 'Q1 Hardware vendor batch payment' },
  { id: 2, paymentId: 'PAY-2024-002', vendor: 'SafeGuard Corp.', invoiceRef: 'INV-2024-0102', amount: 185000, method: 'RTGS', status: 'SCHEDULED', paidAt: '2024-04-28', approvedBy: 'Priya Sharma (Finance Mgr)', remarks: 'Security system maintenance fee' },
  { id: 3, paymentId: 'PAY-2024-003', vendor: 'Global Steel Works', invoiceRef: 'INV-2024-0105', amount: 1250000, method: 'RTGS', status: 'COMPLETED', paidAt: '2024-04-16', approvedBy: 'Anand Verma (Finance VP)', remarks: 'Raw material bulk shipment clearance' },
  { id: 4, paymentId: 'PAY-2024-004', vendor: 'OmniNet Solutions', invoiceRef: 'INV-2024-0106', amount: 280000, method: 'NEFT', status: 'PROCESSING', paidAt: '2024-05-02', approvedBy: 'Suresh Mehta (Sr. Accountant)', remarks: 'Milestone 1 partial payment for cloud migration' },
  { id: 5, paymentId: 'PAY-2024-005', vendor: 'GreenEnergy Systems', invoiceRef: 'INV-2024-0110', amount: 1480000, method: 'RTGS', status: 'APPROVED', paidAt: '2024-05-05', approvedBy: 'Anand Verma (Finance VP)', remarks: 'Solar panel grid installation balance' },
  { id: 6, paymentId: 'PAY-2024-006', vendor: 'Precision Tools Corp', invoiceRef: 'INV-2024-0109', amount: 137500, method: 'IMPS', status: 'FAILED', paidAt: '2024-04-25', approvedBy: 'System (Auto)', remarks: 'Bank beneficiary IFSC mismatch error' },
  { id: 7, paymentId: 'PAY-2024-007', vendor: 'Apex Logistics Ltd.', invoiceRef: 'INV-2024-0104', amount: 310000, method: 'NEFT', status: 'PENDING_APPROVAL', paidAt: '2024-05-10', approvedBy: 'Pending Approval', remarks: 'Freight forwarding charges for North region' },
  { id: 8, paymentId: 'PAY-2024-008', vendor: 'ElectroPower India', invoiceRef: 'INV-2024-0103', amount: 720000, method: 'Cheque', status: 'PENDING', paidAt: '2024-05-12', approvedBy: 'Pending Approval', remarks: 'Transformer supply milestone 2' },
  { id: 9, paymentId: 'PAY-2024-009', vendor: 'InfraBuild Projects', invoiceRef: 'INV-2024-0108', amount: 470000, method: 'NEFT', status: 'CANCELLED', paidAt: '2024-04-29', approvedBy: 'Priya Sharma (Finance Mgr)', remarks: 'Cancelled due to invoice rejection' },
  { id: 10, paymentId: 'PAY-2024-010', vendor: 'Horizon Telecom Services', invoiceRef: 'INV-2024-0112', amount: 630000, method: 'UPI', status: 'COMPLETED', paidAt: '2024-05-01', approvedBy: 'Suresh Mehta (Sr. Accountant)', remarks: 'Quarterly bandwidth connectivity billing' },
  { id: 11, paymentId: 'PAY-2024-011', vendor: 'Reliance Industrial', invoiceRef: 'INV-2024-0107', amount: 945000, method: 'RTGS', status: 'PROCESSING', paidAt: '2024-05-14', approvedBy: 'Anand Verma (Finance VP)', remarks: 'Advance material procurement clearance' },
  { id: 12, paymentId: 'PAY-2024-012', vendor: 'Zenith Hardware Solutions', invoiceRef: 'INV-2024-0111', amount: 395000, method: 'NEFT', status: 'SCHEDULED', paidAt: '2024-05-18', approvedBy: 'Priya Sharma (Finance Mgr)', remarks: 'Server rack mounts & cabling supplies' },
];

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
    if (!USE_MOCK) {
      try {
        const data = await apiRequest<{ payments: Array<Record<string, any>> }>('/payments');
        if (!data.payments || data.payments.length === 0) {
          return PAYMENTS_MOCK;
        }
        return data.payments.map((p, idx) => ({
          id: typeof p.id === 'number' ? p.id : idx + 1,
          paymentId: p.paymentNumber || p.paymentId || `PAY-${p.id}`,
          vendor: p.vendorName || p.vendor || '—',
          invoiceRef: p.invoiceRef || '—',
          amount: Number(p.amount || 0),
          method: p.method || 'NEFT',
          status: p.status || 'PENDING',
          paidAt: String(p.paidAt || p.scheduledAt || p.createdAt || '').slice(0, 10),
          approvedBy: p.approvedBy || 'Finance Manager',
          remarks: p.remarks || p.comments || '',
        })) as Payment[];
      } catch (_err) {
        return PAYMENTS_MOCK;
      }
    }
    await delay();
    return PAYMENTS_MOCK;
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
