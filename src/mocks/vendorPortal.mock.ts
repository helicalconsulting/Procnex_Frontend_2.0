export interface VendorOrderMock {
  id: number | string;
  poNumber: string;
  rfqNumber: string;
  buyerName: string;
  buyerCompany: string;
  items: { name: string; quantity: number; unit: string; unitPrice: number }[];
  totalAmount: number;
  status: string;
  currency?: string;
  orderDate: string;
  expectedDelivery: string;
  deliveredDate?: string;
  shippingAddress: string;
  paymentTerms: string;
  trackingId?: string;
  vendorFulfillmentAllowed?: 'DISPATCH_AND_INVOICE' | 'DISPATCH_ONLY' | 'INVOICE_ONLY';
}

export interface VendorInvoiceMock {
  id: number | string;
  invoiceNumber: string;
  poNumber: string;
  rfqNumber: string;
  rfqTitle?: string;
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
