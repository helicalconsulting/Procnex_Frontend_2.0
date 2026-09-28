import { describe, expect, it } from 'vitest';
import { orderState, selectOrders } from '../orderPresentation';
import type { VendorOrderMock } from '@/mocks/vendorPortal.mock';

describe('vendor order status semantics', () => {
  it('includes a recorded receipt in the receipt KPI without calling it fully delivered', () => {
    expect(orderState('GRN_RECEIVED')).toMatchObject({ received: true, active: false, stage: 2 });
    expect(orderState('GRN_RECEIVED').note).toContain('does not confirm');
  });
  it('does not infer receipt from an invoice', () => {
    expect(orderState('INVOICED')).toMatchObject({ received: false, active: true, stage: null });
  });
  it.each(['CANCELLED', 'REJECTED'])('stops the progress display for %s', status => {
    expect(orderState(status)).toMatchObject({ cancelled: true, active: false, received: false, stage: null });
  });
  it.each(['', 'SOMETHING_NEW', 'DRAFT', 'PENDING_APPROVAL'])('does not manufacture a first milestone for %s', status => {
    expect(orderState(status)).toMatchObject({ stage: null, active: false, received: false });
  });
  it.each(['CLOSED', 'COMPLETED'])('counts %s as completed', status => {
    expect(orderState(status)).toMatchObject({ received: true, stage: 3 });
  });
  it('normalizes case and covers acknowledgement and dispatch', () => {
    expect(orderState(' acknowledged ').stage).toBe(1);
    expect(orderState('SENT_TO_VENDOR').stage).toBe(0);
    expect(orderState('SHIPPED')).toMatchObject({ active: true, stage: 1 });
  });
});

describe('order register search and sort', () => {
  const makeOrder = (values: Partial<VendorOrderMock>): VendorOrderMock => ({ id: 1, poNumber: 'PO-1', rfqNumber: 'RFQ-1', buyerCompany: 'Acme', buyerName: 'Sam', items: [{ name: 'Fasteners', quantity: 2, unit: 'pcs', unitPrice: 5 }], totalAmount: 10, status: 'CONFIRMED', orderDate: '2026-09-20', expectedDelivery: '', paymentTerms: 'Advance', shippingAddress: '', ...values });
  const orders = [makeOrder({}), makeOrder({ id: '2', poNumber: 'PO-2', status: 'GRN_RECEIVED', orderDate: '2026-09-26', expectedDelivery: '2026-10-01', totalAmount: 20 })];
  it('searches all existing reference, buyer and item fields', () => {
    for (const query of ['PO-2', ' rfq-1 ', 'ACME', 'sam', 'fasteners']) expect(selectOrders(orders, query, null, 'newest', o => o.totalAmount).length).toBeGreaterThan(0);
  });
  it('applies search and status together without mutating the source', () => {
    expect(selectOrders(orders, 'fasteners', 'RECEIVED', 'newest', o => o.totalAmount).map(o => o.id)).toEqual(['2']);
    expect(orders.map(o => o.id)).toEqual([1, '2']);
    expect(selectOrders(orders, 'unknown', null, 'newest', o => o.totalAmount)).toEqual([]);
  });
  it('sorts newest first and places missing delivery dates last', () => {
    for (const sort of ['newest', 'delivery'] as const) expect(selectOrders(orders, '', null, sort, o => o.totalAmount)[0].id).toBe('2');
  });
  it('sorts monetary values using the supplied currency conversion', () => {
    expect(selectOrders(orders, '', null, 'value', o => o.id === 1 ? 100 : 20)[0].id).toBe(1);
  });
});
