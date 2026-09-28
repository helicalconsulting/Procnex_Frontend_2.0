import type { VendorOrderMock } from '@/mocks/vendorPortal.mock';

export type OrderFilter = 'ACTIVE' | 'RECEIVED' | 'CANCELLED' | null;
export type OrderSort = 'newest' | 'delivery' | 'value';

/** Receipt and invoicing are distinct: an invoice alone does not prove delivery. */
export function orderState(status?: string) {
  const value = (status || '').trim().toUpperCase();
  const cancelled = ['CANCELLED', 'REJECTED'].includes(value);
  const received = ['GRN_RECEIVED', 'DELIVERED', 'COMPLETED', 'CLOSED'].includes(value);
  const active = ['CONFIRMED', 'APPROVED', 'ISSUED', 'SENT', 'SENT_TO_VENDOR', 'ACKNOWLEDGED', 'PROCESSING', 'IN_PROGRESS', 'SHIPPED', 'INVOICED'].includes(value);
  const stage = ['COMPLETED', 'CLOSED'].includes(value) ? 3
    : ['GRN_RECEIVED', 'DELIVERED'].includes(value) ? 2
      : ['ACKNOWLEDGED', 'PROCESSING', 'IN_PROGRESS', 'SHIPPED'].includes(value) ? 1
        : ['CONFIRMED', 'APPROVED', 'ISSUED', 'SENT', 'SENT_TO_VENDOR'].includes(value) ? 0 : null;
  const note = value === 'GRN_RECEIVED' ? 'A goods receipt has been recorded. This does not confirm that every ordered quantity has been received.'
    : value === 'INVOICED' ? 'An invoice has been recorded. Delivery progress is not confirmed by this status.'
      : cancelled ? 'This order is no longer proceeding. You can still review its details and download the purchase order.'
        : stage === null ? 'Fulfilment progress is not available for this order status.' : null;
  return { value, cancelled, received, active, stage, note };
}

function dateValue(value?: string) {
  const date = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(date) ? date : null;
}

export function selectOrders(orders: VendorOrderMock[], query: string, filter: OrderFilter, sort: OrderSort, orderValue: (order: VendorOrderMock) => number) {
  const text = query.trim().toLowerCase();
  return orders.filter(order => {
    const state = orderState(order.status);
    if (filter === 'ACTIVE' && !state.active || filter === 'RECEIVED' && !state.received || filter === 'CANCELLED' && !state.cancelled) return false;
    return !text || [order.poNumber, order.rfqNumber, order.buyerCompany, order.buyerName, ...order.items.map(item => item.name)]
      .some(value => (value || '').toLowerCase().includes(text));
  }).sort((a, b) => {
    if (sort === 'value') return orderValue(b) - orderValue(a);
    if (sort === 'delivery') return (dateValue(a.expectedDelivery) ?? Infinity) - (dateValue(b.expectedDelivery) ?? Infinity);
    return (dateValue(b.orderDate) ?? -Infinity) - (dateValue(a.orderDate) ?? -Infinity);
  });
}
