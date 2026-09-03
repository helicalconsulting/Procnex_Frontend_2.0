export interface VendorOrderMock {
  id: number;
  poNumber: string;
  rfqNumber: string;
  buyerName: string;
  buyerCompany: string;
  items: { name: string; quantity: number; unit: string; unitPrice: number }[];
  totalAmount: number;
  status: 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  orderDate: string;
  expectedDelivery: string;
  deliveredDate?: string;
  shippingAddress: string;
  paymentTerms: string;
  trackingId?: string;
}

export interface VendorInvoiceMock {
  id: number;
  invoiceNumber: string;
  poNumber: string;
  rfqNumber: string;
  amount: number;
  gst: number;
  totalAmount: number;
  submittedDate: string;
  dueDate: string;
  paymentDate?: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'OVERDUE';
  buyerCompany: string;
  description: string;
}

export const VENDOR_ORDERS_MOCK: VendorOrderMock[] = [];

export const VENDOR_INVOICES_MOCK: VendorInvoiceMock[] = [];
