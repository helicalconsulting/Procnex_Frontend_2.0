import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Clock, FileText, Receipt, Search, XCircle } from 'lucide-react';
import { CurrencyBadge, CurrencySelector, useCurrency } from '@/components/shared/CurrencyMaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTableViewport } from '@/components/ui/data-table-viewport';
import { EmptyState, MetricCard, PageFrame, PageLead } from '@/components/ui/product';
import { useServiceData } from '@/hooks/useServiceData';
import type { VendorInvoiceMock } from '@/mocks/vendorPortal.mock';
import { vendorPortalService } from '@/services/vendorPortalService';

type InvStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'OVERDUE';
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_CONFIG: Record<InvStatus, { label: string; tone: Tone; icon: typeof Clock }> = {
  PENDING: { label: 'Pending', tone: 'warning', icon: Clock },
  APPROVED: { label: 'Approved', tone: 'primary', icon: CheckCircle2 },
  PAID: { label: 'Paid', tone: 'success', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: XCircle },
  OVERDUE: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
};

function StatusBadge({ status }: { status: InvStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return <Badge tone={config.tone}><Icon className="size-3" />{config.label}</Badge>;
}

export default function VendorInvoicesPage() {
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  const { data: invoices, loading, error } = useServiceData(
    () => vendorPortalService.listInvoices(), [] as VendorInvoiceMock[],
  );
  const [search, setSearch] = useState('');
  const summary = useMemo(() => ({
    totalAmount: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    paid: invoices.filter((invoice) => invoice.status === 'PAID').reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    pending: invoices.filter((invoice) => ['PENDING', 'APPROVED'].includes(invoice.status)).reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    overdue: invoices.filter((invoice) => invoice.status === 'OVERDUE').reduce((sum, invoice) => sum + invoice.totalAmount, 0),
  }), [invoices]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter((invoice) => [invoice.invoiceNumber, invoice.poNumber, invoice.description].some((field) => field.toLowerCase().includes(query)));
  }, [invoices, search]);

  const amount = (value: number) => formatAmount(value, displayCurrency);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <PageFrame>
      <PageLead title="My Invoices" description="Track invoice review, due dates, and payment status." actions={<CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />} />
      {error && <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">{error}</Card>}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total invoiced" value={amount(summary.totalAmount)} detail={`${invoices.length} invoices`} icon={Receipt} aria-pressed={true} />
        <MetricCard label="Paid" value={amount(summary.paid)} detail="Received" icon={CheckCircle2} tone="success" />
        <MetricCard label="Pending" value={amount(summary.pending)} detail="Awaiting payment" icon={Clock} tone="warning" />
        <MetricCard label="Overdue" value={amount(summary.overdue)} detail="Past due date" icon={AlertTriangle} tone="danger" />
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-10" placeholder="Search invoice, PO, or description" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search invoices" />
        </div>
      </Card>

      {loading ? (
        <Card className="grid min-h-64 place-items-center text-sm text-muted-foreground">Loading invoices…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices found" description={search ? 'Try another search term.' : 'Your first submitted invoice will appear here.'} action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button> : undefined} />
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <DataTableViewport label="Vendor invoices" showHint={false}>
              <table className="w-full min-w-[980px] text-left text-sm">
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
                      <td className="px-4 py-3.5"><StatusBadge status={invoice.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableViewport>
          </Card>

          <div className="grid gap-3 lg:hidden">
            {filtered.map((invoice) => (
              <Card key={invoice.id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-primary">{invoice.invoiceNumber}</div><div className="mt-1 truncate text-xs text-muted-foreground">PO {invoice.poNumber} · {invoice.rfqNumber}</div></div><StatusBadge status={invoice.status} /></div>
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
