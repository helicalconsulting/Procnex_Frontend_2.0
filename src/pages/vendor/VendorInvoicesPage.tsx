import LandingTable, { type LandingColumn } from '../../components/shared/LandingTable';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, Clock, FileText, Plus, Receipt, Search, XCircle } from 'lucide-react';
import { CurrencyBadge, CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import { RecordStatusBadge } from '@/components/shared/RecordStatusBadge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { DataTableViewport } from '../../components/ui/data-table-viewport';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { useServiceData } from '../../hooks/useServiceData';
import type { VendorInvoiceMock } from '../../mocks/vendorPortal.mock';
import { vendorPortalService } from '../../services/vendorPortalService';
import { getVendorPath } from '../../utils/tenantResolver';
import { TableSkeleton } from '@/components/shared/Skeleton';

export default function VendorInvoicesPage() {
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  const { data: invoices, loading, error, forceRefresh } = useServiceData(
    () => vendorPortalService.listInvoices(),
    [] as VendorInvoiceMock[],
    [],
    { cacheKey: 'vendor:invoices' }
  );

  useEffect(() => {
    const handleRefresh = () => {
      forceRefresh();
    };
    window.addEventListener('focus', handleRefresh);
    window.addEventListener('heliflow:invoice-created', handleRefresh);
    window.addEventListener('heliflow:approval-updated', handleRefresh);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('heliflow_sync');
      bc.onmessage = () => { handleRefresh(); };
    } catch { /* BroadcastChannel is optional in older browsers. */ }

    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener('heliflow:invoice-created', handleRefresh);
      window.removeEventListener('heliflow:approval-updated', handleRefresh);
      if (bc) bc.close();
    };
  }, [forceRefresh]);
  const [search, setSearch] = useState('');
  const summary = useMemo(() => ({
    totalAmount: (invoices || []).reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0),
    paid: (invoices || []).filter((invoice) => invoice.status === 'PAID').reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0),
    pending: (invoices || []).filter((invoice) => ['PENDING', 'APPROVED'].includes(invoice.status)).reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0),
    overdue: (invoices || []).filter((invoice) => invoice.status === 'OVERDUE').reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0),
  }), [invoices]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invoices || [];
    return (invoices || []).filter((invoice) => [invoice.invoiceNumber, invoice.poNumber, invoice.description].some((field) => (field || '').toLowerCase().includes(query)));
  }, [invoices, search]);

  const amount = (value: number) => formatAmount(value, displayCurrency);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <PageFrame>
      <PageLead
        title="My Invoices"
        description="Track invoice review, due dates, and payment status."
        actions={
          <div className="flex items-center gap-2">
            <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />
            <Button
              onClick={() => navigate(getVendorPath('/vendor/create-invoice'))}
              className="gap-1.5 shadow-xs"
            >
              <Plus size={16} /> Create Invoice
            </Button>
          </div>
        }
      />
      {error && <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">{error}</Card>}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total invoiced" value={amount(summary.totalAmount)} detail={`${(invoices || []).length} invoices`} icon={Receipt} aria-pressed={true} />
        <MetricCard label="Paid" value={amount(summary.paid)} detail="Received" icon={CheckCircle2} tone="success" />
        <MetricCard label="Pending" value={amount(summary.pending)} detail="Awaiting payment" icon={Clock} tone="warning" />
        <MetricCard label="Overdue" value={amount(summary.overdue)} detail="Past due date" icon={AlertTriangle} tone="danger" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10 pr-10"
            type="text"
            placeholder="Search invoice, PO, or description..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search invoices"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear invoice search"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle size={15} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={9} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices found"
          description={search ? 'Try another search term.' : 'Your first submitted invoice will appear here.'}
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>
            ) : (
              <Button onClick={() => navigate(getVendorPath('/vendor/create-invoice'))} className="gap-1.5">
                <Plus size={16} /> Create Invoice
              </Button>
            )
          }
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <DataTableViewport label="Vendor invoices" showHint={false}>
              <LandingTable key="vendor-invoices" preferenceKey="vendor-invoices" columns={VENDOR_INVOICES_COLUMNS} className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/55 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>{['Invoice', 'PO reference', 'Description', 'Amount', 'GST', 'Total', 'Submitted', 'Due date', 'Status'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((invoice) => (
                    <tr key={invoice.id} className="transition-colors hover:bg-accent/35">
                      <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span><div><div className="font-semibold text-primary">{invoice.invoiceNumber}</div><div className="mt-0.5 text-[12px] text-muted-foreground">{invoice.rfqNumber}</div></div></div></td>
                      <td className="px-4 py-3.5 font-medium">{invoice.poNumber}</td>
                      <td className="max-w-48 truncate px-4 py-3.5 text-xs text-muted-foreground" title={invoice.description}>{invoice.description}</td>
                      <td className="px-4 py-3.5 font-medium tabular-nums">{amount(invoice.amount)}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground tabular-nums">{amount(invoice.gst)}</td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums">{amount(invoice.totalAmount)} <CurrencyBadge currency={displayCurrency} size="sm" /></td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Calendar className="size-3" />{formatDate(invoice.submittedDate)}</span></td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground"><div>{formatDate(invoice.dueDate)}</div>{invoice.paymentDate && <div className="mt-1 font-semibold text-emerald-600">Paid {formatDate(invoice.paymentDate)}</div>}</td>
                      <td className="px-4 py-3.5"><RecordStatusBadge kind="invoice" status={invoice.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </LandingTable>
            </DataTableViewport>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {filtered.map((invoice) => (
              <Card key={invoice.id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-primary">{invoice.invoiceNumber}</div><div className="mt-1 truncate text-xs text-muted-foreground">PO {invoice.poNumber} · {invoice.rfqNumber}</div></div><RecordStatusBadge kind="invoice" status={invoice.status} /></div>
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{invoice.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/45 p-3 text-xs">
                  <div><dt className="text-muted-foreground">Total</dt><dd className="mt-1 font-semibold tabular-nums">{amount(invoice.totalAmount)}</dd></div>
                  <div><dt className="text-muted-foreground">GST</dt><dd className="mt-1 font-medium tabular-nums">{amount(invoice.gst)}</dd></div>
                  <div><dt className="text-muted-foreground">Submitted</dt><dd className="mt-1 font-medium">{formatDate(invoice.submittedDate)}</dd></div>
                  <div><dt className="text-muted-foreground">Due</dt><dd className="mt-1 font-medium">{formatDate(invoice.dueDate)}</dd></div>
                </dl>
              </Card>
            ))}
          </div>
        </>
      )}
    </PageFrame>
  );
}

const VENDOR_INVOICES_COLUMNS: LandingColumn[] = [
  { key: 'invoice', label: 'Invoice', defaultVisible: true, required: true },
  { key: 'po', label: 'PO reference', defaultVisible: true },
  { key: 'description', label: 'Description', defaultVisible: true },
  { key: 'amount', label: 'Amount', defaultVisible: true },
  { key: 'gst', label: 'GST', defaultVisible: true },
  { key: 'total', label: 'Total', defaultVisible: true },
  { key: 'submitted', label: 'Submitted', defaultVisible: true },
  { key: 'due', label: 'Due date', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
];
