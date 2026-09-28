import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, Package, Plus, Receipt, Search } from 'lucide-react';
import { CurrencyBadge, CurrencySelector, useCurrency } from '@/components/shared/CurrencyMaster';
import { RecordStatusBadge } from '@/components/shared/RecordStatusBadge';
import { MessageStrip } from '@/components/shared/MessageStrip';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DetailTabs, DetailTabPanel } from '@/components/ui/detail-tabs';
import { Input } from '@/components/ui/input';
import { PageLead } from '@/components/ui/product';
import type { VendorOrderMock } from '@/mocks/vendorPortal.mock';
import { downloadPurchaseOrderAsPdf } from '@/utils/pdfDownload';
import { getVendorPath } from '@/utils/tenantResolver';
import { orderState } from './orderPresentation';
import { quoteDate } from './quotationFormatting';

const stages = ['Order placed', 'Fulfilment', 'Goods receipt', 'Closed'];

export function VendorOrderDetails({ order, currency, onCurrencyChange, onBack, onPrevious, onNext, position }: {
  order: VendorOrderMock;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: string;
}) {
  const { formatAmount, convert, companyDefaultCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState('overview');
  const [itemSearch, setItemSearch] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const state = orderState(order.status);
  const sourceCurrency = order.currency || companyDefaultCurrency;
  const amount = (value: number) => formatAmount(convert(value, sourceCurrency, currency), currency);
  const items = useMemo(() => order.items.filter(item => item.name.toLowerCase().includes(itemSearch.trim().toLowerCase())), [order.items, itemSearch]);
  const download = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadPurchaseOrderAsPdf(order, value => amount(value), currency);
    } catch {
      setDownloadError('The purchase order could not be downloaded. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return <>
    <div className="mb-5 flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" />Back to orders</Button>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {position && <span>{position}</span>}
        <Button variant="outline" size="icon-sm" aria-label="Previous order" disabled={!onPrevious} onClick={onPrevious}><ChevronLeft className="size-4" /></Button>
        <Button variant="outline" size="icon-sm" aria-label="Next order" disabled={!onNext} onClick={onNext}><ChevronRight className="size-4" /></Button>
      </div>
    </div>
    <PageLead title={order.poNumber} description={`${order.buyerCompany || order.buyerName || 'Buyer not specified'} · Ordered ${quoteDate(order.orderDate)}`}
      actions={<>
        <RecordStatusBadge kind="order" status={order.status} />
        <Button size="sm" variant="outline" onClick={download} disabled={downloading}><Download className="size-3.5" />{downloading ? 'Downloading…' : 'Download PO'}</Button>
        {!state.cancelled && <Link className={buttonVariants({ size: 'sm' })} to={getVendorPath(`/vendor/create-invoice?poId=${encodeURIComponent(order.id || order.poNumber)}`)}><Plus className="size-3.5" />Create Invoice</Link>}
        {(state.received || state.value === 'INVOICED') && <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to={getVendorPath('/vendor/invoices')}><Receipt className="size-3.5" />View Invoices</Link>}
      </>} />
    {downloadError && <MessageStrip type="error" onClose={() => setDownloadError('')}>{downloadError}</MessageStrip>}

    <Card className={`order-progress mb-5 p-5 ${state.stage === null ? 'order-progress--no-stages' : ''}`}>
      <div className="order-progress__summary">
        <div><div className="text-xs text-muted-foreground">Order value</div><div className="mt-1 text-lg font-bold tabular-nums">{amount(order.totalAmount)}</div></div>
        <CurrencySelector value={currency} onChange={onCurrencyChange} size="sm" />
      </div>
      {state.stage !== null && <ol className="order-progress__steps" aria-label="Order progress">
        {stages.map((label, index) => <li key={label} aria-current={index === state.stage ? 'step' : undefined} data-reached={index <= state.stage!} className="order-progress__step">
          <span className="order-progress__marker text-[10px]">{index < state.stage! ? <Check className="size-3" aria-hidden="true" /> : index + 1}</span>
          <span className="text-[11px] font-medium">{label}</span>
          {index === state.stage && <span className="sr-only">Current stage</span>}
        </li>)}
      </ol>}
      {state.note && <p className={`order-progress__note text-xs ${state.cancelled ? 'text-destructive' : 'text-muted-foreground'}`}><AlertCircle className="size-4 shrink-0" aria-hidden="true" />{state.note}</p>}
    </Card>

    <DetailTabs id="order-details" label="Order details" activeTab={activeTab} onChange={setActiveTab} tabs={[
      { id: 'overview', label: 'Overview', icon: FileText },
      { id: 'items', label: 'Ordered items', icon: Package, count: order.items.length },
    ]} />
    {activeTab === 'overview' ? <DetailTabPanel id="order-details" tabId="overview">
      <Card className="order-overview p-5">
        <section aria-labelledby="order-summary-title">
          <h2 id="order-summary-title" className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Order summary</h2>
          <dl className="order-facts text-xs">
            <div><dt>Buyer / Company</dt><dd>{order.buyerCompany || order.buyerName || '—'}</dd></div>
            <div><dt>RFQ Number</dt><dd className="font-mono">{order.rfqNumber || '—'}</dd></div>
            <div><dt>Order Date</dt><dd>{quoteDate(order.orderDate)}</dd></div>
            <div><dt>Total Items</dt><dd>{order.items.length} {order.items.length === 1 ? 'line item' : 'line items'}</dd></div>
            <div><dt>Order currency</dt><dd><CurrencyBadge currency={sourceCurrency} size="sm" /></dd></div>
            {order.trackingId && <div><dt>Tracking reference</dt><dd>{order.trackingId}</dd></div>}
          </dl>
        </section>
        <section aria-labelledby="order-delivery-title">
          <h2 id="order-delivery-title" className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Delivery & payment</h2>
          <dl className="order-facts text-xs">
            <div className="order-facts__wide"><dt>Delivery Address</dt><dd>{order.shippingAddress || 'Not specified'}</dd></div>
            <div><dt>Expected Delivery</dt><dd>{quoteDate(order.expectedDelivery)}</dd></div>
            <div><dt>Payment Terms</dt><dd>{order.paymentTerms || 'Not specified'}</dd></div>
            {order.deliveredDate && <div><dt>Delivered Date</dt><dd>{quoteDate(order.deliveredDate)}</dd></div>}
          </dl>
        </section>
      </Card>
    </DetailTabPanel> : <DetailTabPanel id="order-details" tabId="items">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ordered items</h2>
          <div className="relative w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 pl-9" aria-label="Search ordered items" placeholder="Find an item…" value={itemSearch} onChange={event => setItemSearch(event.target.value)} /></div>
        </div>
        <div className="order-items-scroll" role="region" aria-label="Ordered item pricing" tabIndex={0}>
          <table className="order-items-table w-full text-left text-xs">
            <caption className="sr-only">Ordered item quantities and pricing in {currency}</caption>
            <colgroup><col style={{width:'46%'}} /><col style={{width:'18%'}} /><col style={{width:'18%'}} /><col style={{width:'18%'}} /></colgroup>
            <thead><tr><th scope="col">Item</th><th scope="col" className="text-right">Quantity</th><th scope="col" className="text-right">Unit Price</th><th scope="col" className="text-right">Total</th></tr></thead>
            <tbody>{items.length ? items.map((item, index) => <tr key={`${item.name}-${index}`}>
              <td className="font-medium break-words">{item.name || 'Unnamed item'}</td>
              <td className="text-right tabular-nums">{item.quantity} {item.unit}</td>
              <td className="text-right tabular-nums">{amount(item.unitPrice)}</td>
              <td className="text-right font-semibold tabular-nums">{amount(item.quantity * item.unitPrice)}</td>
            </tr>) : <tr><td colSpan={4} className="text-center text-muted-foreground">{itemSearch ? 'No matching items.' : 'No line items are available for this order.'}{itemSearch && <Button variant="ghost" size="sm" onClick={() => setItemSearch('')}>Clear search</Button>}</td></tr>}</tbody>
          </table>
        </div>
        <div className="order-items-footer flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
          <span role="status" className="text-xs text-muted-foreground">{items.length} of {order.items.length} items</span>
          <div className="flex items-center gap-3"><span className="text-xs font-semibold">Order total</span><strong className="text-sm tabular-nums">{amount(order.totalAmount)}</strong><CurrencyBadge currency={currency} size="sm" /></div>
        </div>
      </Card>
    </DetailTabPanel>}
  </>;
}
