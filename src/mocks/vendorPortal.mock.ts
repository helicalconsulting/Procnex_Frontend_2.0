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

export const VENDOR_ORDERS_MOCK: VendorOrderMock[] = [
  {
    id: 1, poNumber: 'PO-2025-0041', rfqNumber: 'RFQ-2025-001',
    buyerName: 'Rajesh Kumar', buyerCompany: 'Heliflow Industries',
    items: [
      { name: 'LED Panel 60x60', quantity: 200, unit: 'pcs', unitPrice: 1250 },
      { name: 'LED Driver 40W', quantity: 200, unit: 'pcs', unitPrice: 480 },
    ],
    totalAmount: 410000, status: 'DELIVERED', orderDate: '2025-03-15',
    expectedDelivery: '2025-03-28', deliveredDate: '2025-03-26',
    shippingAddress: 'Plot 42, MIDC, Pune', paymentTerms: 'Net 30',
  },
  {
    id: 2, poNumber: 'PO-2025-0056', rfqNumber: 'RFQ-2025-003',
    buyerName: 'Priya Sharma', buyerCompany: 'Heliflow Industries',
    items: [{ name: 'Office Chair Ergonomic', quantity: 50, unit: 'pcs', unitPrice: 8500 }],
    totalAmount: 425000, status: 'SHIPPED', orderDate: '2025-04-01',
    expectedDelivery: '2025-04-15', shippingAddress: 'Heliflow HQ, Mumbai',
    paymentTerms: 'Net 45', trackingId: 'TRK-8849201',
  },
];

export const VENDOR_INVOICES_MOCK: VendorInvoiceMock[] = [
  { id: 1, invoiceNumber: 'INV-2026-0112', poNumber: 'PO-2025-0063', rfqNumber: 'RFQ-2025-007', amount: 750000, gst: 135000, totalAmount: 885000, submittedDate: '2026-05-10', dueDate: '2026-06-09', status: 'PENDING', buyerCompany: 'Heliflow Industries', description: 'Industrial Safety Equipment' },
  { id: 2, invoiceNumber: 'INV-2026-0098', poNumber: 'PO-2025-0056', rfqNumber: 'RFQ-2025-003', amount: 682000, gst: 122760, totalAmount: 804760, submittedDate: '2026-04-28', dueDate: '2026-06-12', status: 'APPROVED', buyerCompany: 'Heliflow Industries', description: 'Office Furniture' },
  { id: 3, invoiceNumber: 'INV-2026-0065', poNumber: 'PO-2025-0041', rfqNumber: 'RFQ-2025-001', amount: 271200, gst: 48816, totalAmount: 320016, submittedDate: '2026-03-28', dueDate: '2026-04-27', paymentDate: '2026-04-25', status: 'PAID', buyerCompany: 'Heliflow Industries', description: 'LED Panel Supply' },
];
