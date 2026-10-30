import LandingTable, { type LandingColumn } from '../../components/shared/LandingTable';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, Clock, CreditCard, FileText, Plus, Receipt, Search, Truck, XCircle, Printer, Eye } from 'lucide-react';
import { CurrencyBadge, CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import { RecordStatusBadge } from '@/components/shared/RecordStatusBadge';
import { TablePagination } from '@/components/shared/TablePagination';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { DataTableViewport } from '../../components/ui/data-table-viewport';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { useServiceData } from '../../hooks/useServiceData';
import type { VendorInvoiceMock } from '../../mocks/vendorPortal.mock';
import { vendorPortalService } from '../../services/vendorPortalService';
import { dispatchNoteService, type DispatchNote } from '../../services/dispatchNoteService';
import { getVendorPath } from '../../utils/tenantResolver';
import { TableSkeleton } from '@/components/shared/Skeleton';
import { PrintDispatchNoteModal } from '../../components/dispatch-notes/PrintDispatchNoteModal';
import { extractCleanInvoiceNumber } from './VendorPaymentsPage';

export default function VendorInvoicesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const initialTab = (searchParams.get('tab') === 'dispatches' || location.pathname.includes('dispatch-notes')) ? 'dispatches' : 'invoices';
  const [activeTab, setActiveTab] = useState<'invoices' | 'dispatches'>(initialTab);

  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState(companyDefaultCurrency);
  const [selectedDispatchForPrint, setSelectedDispatchForPrint] = useState<DispatchNote | null>(null);
  const { data: invoices, loading: invLoading, error: invError, forceRefresh: forceRefreshInvoices } = useServiceData(
    () => vendorPortalService.listInvoices(),
    [] as VendorInvoiceMock[],
    [],
    { cacheKey: 'vendor:invoices' }
  );

  const { data: dnData, loading: dnLoading, error: dnError, forceRefresh: forceRefreshDN } = useServiceData(
    () => dispatchNoteService.list({ limit: 100 }),
    { dispatchNotes: [] as DispatchNote[], total: 0 },
    [],
    { cacheKey: 'vendor:dns', cacheTtlMs: 30000 }
  );

  const dispatchNotes = useMemo(() => {
    if (Array.isArray(dnData)) return dnData;
    if (dnData && Array.isArray((dnData as any).dispatchNotes)) return (dnData as any).dispatchNotes;
    return [];
  }, [dnData]);

  useEffect(() => {
    const handleRefresh = () => {
      forceRefreshInvoices();
      forceRefreshDN();
    };
    window.addEventListener('focus', handleRefresh);
    window.addEventListener('heliflow:invoice-created', handleRefresh);
    window.addEventListener('heliflow:dispatch-note-created', handleRefresh);
    window.addEventListener('heliflow:approval-updated', handleRefresh);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('heliflow_sync');
      bc.onmessage = () => { handleRefresh(); };
    } catch { /* BroadcastChannel is optional in older browsers. */ }

    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener('heliflow:invoice-created', handleRefresh);
      window.removeEventListener('heliflow:dispatch-note-created', handleRefresh);
      window.removeEventListener('heliflow:approval-updated', handleRefresh);
      if (bc) bc.close();
    };
  }, [forceRefreshInvoices, forceRefreshDN]);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const normalizedInvoices = useMemo(() => {
    const rawList = invoices || [];
    const isInternalPattern = (num: string) =>
      /^[A-Za-z0-9]+-INV-\d+/i.test(num) || /^COMP-INV/i.test(num) || /^[A-Za-z]{2,5}-INV-/i.test(num);

    const poGroups = new Map<string, any[]>();
    const nonPoInvoices: any[] = [];

    rawList.forEach((inv) => {
      const poKey = (inv.poNumber && inv.poNumber !== '—') ? inv.poNumber : (inv.poId && String(inv.poId) !== '—' ? String(inv.poId) : null);
      if (poKey) {
        if (!poGroups.has(poKey)) poGroups.set(poKey, []);
        poGroups.get(poKey)!.push(inv);
      } else {
        nonPoInvoices.push(inv);
      }
    });

    const result: any[] = [];

    for (const [poKey, group] of poGroups.entries()) {
      let bestVendorInvoiceNumber = '';
      const withErpRef = group.find((i) => i.erpInvoiceRef && !isInternalPattern(i.erpInvoiceRef));
      if (withErpRef) bestVendorInvoiceNumber = withErpRef.erpInvoiceRef;

      if (!bestVendorInvoiceNumber) {
        const vendorInv = group.find((i) => i.invoiceNumber && !isInternalPattern(i.invoiceNumber));
        if (vendorInv) bestVendorInvoiceNumber = vendorInv.invoiceNumber;
      }

      if (!bestVendorInvoiceNumber) {
        const anyRef = group.find((i) => i.erpInvoiceRef);
        if (anyRef) bestVendorInvoiceNumber = anyRef.erpInvoiceRef;
      }

      if (!bestVendorInvoiceNumber) {
        bestVendorInvoiceNumber = group[0].invoiceNumber;
      }

      const hasPaid = group.some((i) => ['PAID', 'COMPLETED', 'CONFIRMED', 'SETTLED'].includes(String(i.status || '').toUpperCase()));
      const hasApproved = group.some((i) => ['APPROVED', 'POSTED', 'REGISTERED'].includes(String(i.status || '').toUpperCase()));
      const hasRejected = group.some((i) => ['REJECTED', 'CANCELLED'].includes(String(i.status || '').toUpperCase()));

      let resolvedStatus = 'PENDING';
      if (hasPaid) resolvedStatus = 'PAID';
      else if (hasApproved) resolvedStatus = 'APPROVED';
      else if (hasRejected) resolvedStatus = 'REJECTED';
      else if (group.some((i) => i.status)) resolvedStatus = group.find((i) => i.status)?.status || 'PENDING';

      const primary =
        group.find((i) => ['PAID', 'COMPLETED', 'CONFIRMED'].includes(String(i.status || '').toUpperCase())) ||
        group.find((i) => ['APPROVED', 'POSTED'].includes(String(i.status || '').toUpperCase())) ||
        group[0];

      result.push({
        ...primary,
        invoiceNumber: bestVendorInvoiceNumber,
        status: resolvedStatus,
      });
    }

    nonPoInvoices.forEach((inv) => {
      const invNum = inv.erpInvoiceRef && !isInternalPattern(inv.erpInvoiceRef)
        ? inv.erpInvoiceRef
        : inv.invoiceNumber;
      result.push({
        ...inv,
        invoiceNumber: invNum,
      });
    });

    return result;
  }, [invoices]);

  const summary = useMemo(() => ({
    totalAmount: normalizedInvoices.reduce((sum, invoice) => sum + convert(invoice.totalAmount || 0, (invoice as any).currency || companyDefaultCurrency, displayCurrency), 0),
    paid: normalizedInvoices.filter((invoice) => invoice.status === 'PAID').reduce((sum, invoice) => sum + convert(invoice.totalAmount || 0, (invoice as any).currency || companyDefaultCurrency, displayCurrency), 0),
    pending: normalizedInvoices.filter((invoice) => ['PENDING', 'APPROVED'].includes(invoice.status)).reduce((sum, invoice) => sum + convert(invoice.totalAmount || 0, (invoice as any).currency || companyDefaultCurrency, displayCurrency), 0),
    overdue: normalizedInvoices.filter((invoice) => invoice.status === 'OVERDUE').reduce((sum, invoice) => sum + convert(invoice.totalAmount || 0, (invoice as any).currency || companyDefaultCurrency, displayCurrency), 0),
  }), [normalizedInvoices, displayCurrency, companyDefaultCurrency, convert]);

  const dispatchSummary = useMemo(() => {
    const list = Array.isArray(dispatchNotes) ? dispatchNotes : [];
    const received = list.filter((d) => String(d.status || '').toUpperCase() === 'RECEIVED').length;
    const inTransit = list.filter((d) => ['DISPATCHED', 'IN_TRANSIT', 'SUBMITTED'].includes(String(d.status || '').toUpperCase())).length;
    const totalPackages = list.reduce((sum, d) => sum + (Number(d.totalPackages) || 1), 0);
    return {
      total: list.length,
      received,
      inTransit,
      totalPackages,
    };
  }, [dispatchNotes]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return normalizedInvoices;
    return normalizedInvoices.filter((invoice) => [invoice.invoiceNumber, invoice.poNumber, invoice.description].some((field) => (field || '').toLowerCase().includes(query)));
  }, [normalizedInvoices, search]);

  const filteredDispatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = Array.isArray(dispatchNotes) ? dispatchNotes : [];
    if (!query) return list;
    return list.filter((dn) =>
      [dn.dispatchNoteNumber, dn.poNumber, dn.poId, dn.transporterName, dn.carrierName, dn.vehicleNumber, dn.trackingNumber]
        .some((field) => (field || '').toLowerCase().includes(query))
    );
  }, [dispatchNotes, search]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / itemsPerPage));
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(start, start + itemsPerPage);
  }, [filteredInvoices, currentPage, itemsPerPage]);

  const totalDispatchPages = Math.max(1, Math.ceil(filteredDispatches.length / itemsPerPage));
  const paginatedDispatches = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDispatches.slice(start, start + itemsPerPage);
  }, [filteredDispatches, currentPage, itemsPerPage]);

  const amount = (value: number, fromCurrency?: string) => {
    const v = Number(value || 0);
    return formatAmount(convert(v, fromCurrency || companyDefaultCurrency, displayCurrency), displayCurrency);
  };
  const formatDate = (date: string) => {
    if (!date) return '—';
    const d = new Date(date);
    return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const loading = activeTab === 'invoices' ? invLoading : dnLoading;
  const error = activeTab === 'invoices' ? invError : dnError;

  return (
    <PageFrame>
      <PageLead
        title={activeTab === 'invoices' ? "My Invoices" : "Dispatch Notes & Delivery Challans"}
        description={
          activeTab === 'invoices'
            ? "Track invoice review, due dates, and payment status."
            : "Track dispatched goods, delivery challans, and buyer receipt verification."
        }
        actions={
          <div className="flex items-center gap-2">
            {activeTab === 'invoices' && (
              <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} size="sm" />
            )}
            <Button
              variant="outline"
              onClick={() => navigate(getVendorPath('/vendor/payments'))}
              className="gap-1.5 shadow-xs"
            >
              <CreditCard size={16} /> Payments Received
            </Button>
            <Button
              variant={activeTab === 'dispatches' ? 'default' : 'outline'}
              onClick={() => navigate(getVendorPath('/vendor/create-dispatch-note'))}
              className="gap-1.5 shadow-xs"
            >
              <Truck size={16} /> Create Dispatch Note
            </Button>
            <Button
              variant={activeTab === 'invoices' ? 'default' : 'outline'}
              onClick={() => navigate(getVendorPath('/vendor/create-invoice'))}
              className="gap-1.5 shadow-xs"
            >
              <Plus size={16} /> Create Invoice
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-border/70 mb-5 gap-4">
        <button
          type="button"
          onClick={() => { setActiveTab('invoices'); setSearch(''); setCurrentPage(1); }}
          className={`flex items-center gap-2 pb-3 px-1 text-sm font-semibold transition border-b-2 -mb-px ${
            activeTab === 'invoices'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt size={16} /> Tax Invoices ({normalizedInvoices.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('dispatches'); setSearch(''); setCurrentPage(1); }}
          className={`flex items-center gap-2 pb-3 px-1 text-sm font-semibold transition border-b-2 -mb-px ${
            activeTab === 'dispatches'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Truck size={16} /> Dispatch Notes & Challans ({(dispatchNotes || []).length})
        </button>
      </div>

      {error && <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">{error}</Card>}

      {/* Metrics */}
      {activeTab === 'invoices' ? (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total invoiced" value={formatAmount(summary.totalAmount, displayCurrency)} detail={`${(invoices || []).length} invoices`} icon={Receipt} aria-pressed={true} />
          <MetricCard label="Paid" value={formatAmount(summary.paid, displayCurrency)} detail="Received" icon={CheckCircle2} tone="success" />
          <MetricCard label="Pending" value={formatAmount(summary.pending, displayCurrency)} detail="Awaiting payment" icon={Clock} tone="warning" />
          <MetricCard label="Overdue" value={formatAmount(summary.overdue, displayCurrency)} detail="Past due date" icon={AlertTriangle} tone="danger" />
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Dispatches" value={String(dispatchSummary.total)} detail="Recorded shipments" icon={Truck} aria-pressed={true} />
          <MetricCard label="In Transit" value={String(dispatchSummary.inTransit)} detail="Awaiting receipt" icon={Clock} tone="warning" />
          <MetricCard label="Received by Buyer" value={String(dispatchSummary.received)} detail="GRN verified" icon={CheckCircle2} tone="success" />
          <MetricCard label="Total Packages" value={`${dispatchSummary.totalPackages} pkgs`} detail="Dispatched volume" icon={FileText} />
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10 pr-10"
            type="text"
            placeholder={activeTab === 'invoices' ? "Search invoice, PO, or description..." : "Search dispatch note, PO, vehicle, or transporter..."}
            value={search}
            onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }}
            aria-label={activeTab === 'invoices' ? "Search invoices" : "Search dispatch notes"}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setSearch(''); setCurrentPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'invoices' ? (
        loading ? (
          <TableSkeleton rows={5} columns={9} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices found"
            description={search ? 'Try another search term.' : 'Your first submitted invoice will appear here.'}
            action={
              search ? (
                <Button variant="secondary" onClick={() => { setSearch(''); setCurrentPage(1); }}>Clear search</Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => navigate(getVendorPath('/vendor/create-dispatch-note'))} className="gap-1.5">
                    <Truck size={16} /> Create Dispatch Note
                  </Button>
                  <Button onClick={() => navigate(getVendorPath('/vendor/create-invoice'))} className="gap-1.5">
                    <Plus size={16} /> Create Invoice
                  </Button>
                </div>
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
                    {paginatedInvoices.map((invoice) => (
                      <tr key={invoice.id} className="transition-colors hover:bg-accent/35">
                        <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span><div><div className="font-semibold text-primary">{extractCleanInvoiceNumber(invoice.invoiceNumber)}</div><div className="mt-0.5 text-[12px] text-muted-foreground truncate max-w-[200px]" title={invoice.rfqTitle || invoice.rfqNumber}>{invoice.rfqTitle || invoice.rfqNumber}</div></div></div></td>
                        <td className="px-4 py-3.5 font-medium">{invoice.poNumber}</td>
                        <td className="max-w-48 truncate px-4 py-3.5 text-xs text-muted-foreground" title={invoice.description}>{invoice.description}</td>
                        <td className="px-4 py-3.5 font-medium tabular-nums">{amount(invoice.amount, (invoice as any).currency)}</td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground tabular-nums">{amount(invoice.gst, (invoice as any).currency)}</td>
                        <td className="px-4 py-3.5 font-semibold tabular-nums">{amount(invoice.totalAmount, (invoice as any).currency)} <CurrencyBadge currency={displayCurrency} size="sm" /></td>
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
              {paginatedInvoices.map((invoice) => (
                <Card key={invoice.id} className="p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-primary">{extractCleanInvoiceNumber(invoice.invoiceNumber)}</div><div className="mt-1 truncate text-xs text-muted-foreground">PO {invoice.poNumber} · {invoice.rfqTitle || invoice.rfqNumber}</div></div><RecordStatusBadge kind="invoice" status={invoice.status} /></div>
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{invoice.description}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/45 p-3 text-xs">
                    <div><dt className="text-muted-foreground">Total</dt><dd className="mt-1 font-semibold tabular-nums">{amount(invoice.totalAmount, (invoice as any).currency)}</dd></div>
                    <div><dt className="text-muted-foreground">GST</dt><dd className="mt-1 font-medium tabular-nums">{amount(invoice.gst, (invoice as any).currency)}</dd></div>
                    <div><dt className="text-muted-foreground">Submitted</dt><dd className="mt-1 font-medium">{formatDate(invoice.submittedDate)}</dd></div>
                    <div><dt className="text-muted-foreground">Due</dt><dd className="mt-1 font-medium">{formatDate(invoice.dueDate)}</dd></div>
                  </dl>
                </Card>
              ))}
            </div>

            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredInvoices.length}
              perPage={itemsPerPage}
              className="mt-4"
            />
          </>
        )
      ) : (
        /* Dispatch Notes Table */
        loading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : filteredDispatches.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No dispatch notes found"
            description={search ? 'Try another search term.' : 'Dispatched shipments and delivery challans will appear here.'}
            action={
              search ? (
                <Button variant="secondary" onClick={() => { setSearch(''); setCurrentPage(1); }}>Clear search</Button>
              ) : (
                <Button onClick={() => navigate(getVendorPath('/vendor/create-dispatch-note'))} className="gap-1.5">
                  <Truck size={16} /> Create Dispatch Note
                </Button>
              )
            }
          />
        ) : (
          <>
            <Card className="hidden overflow-hidden lg:block">
              <DataTableViewport label="Vendor dispatch notes" showHint={false}>
                <LandingTable key="vendor-dispatches" preferenceKey="vendor-dispatches" columns={VENDOR_DISPATCH_COLUMNS} className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-border/70 bg-secondary/55 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>{['Dispatch Note', 'PO Reference', 'Transporter & Vehicle', 'Dispatched Date', 'Packages / Items', 'Receipt Status', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginatedDispatches.map((dn) => {
                      const isReceived = String(dn.status || '').toUpperCase() === 'RECEIVED';
                      const poRef = dn.poNumber || dn.purchaseOrder?.poNumber || (dn.poId ? `PO-${String(dn.poId).slice(-6).toUpperCase()}` : '—');
                      return (
                        <tr key={dn.id} className="transition-colors hover:bg-accent/35">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-600">
                                <Truck className="size-4" />
                              </span>
                              <div>
                                <div className="font-semibold text-foreground">{dn.dispatchNoteNumber}</div>
                                {dn.trackingNumber && (
                                  <div className="mt-0.5 text-[11px] text-muted-foreground font-mono">LR #{dn.trackingNumber}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-medium">{poRef}</td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-foreground">{dn.transporterName || dn.carrierName || 'Direct Delivery'}</div>
                            {dn.vehicleNumber && (
                              <div className="text-xs text-muted-foreground font-mono mt-0.5">{dn.vehicleNumber}</div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {formatDate(dn.dispatchDate)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            <span className="font-medium text-foreground">{dn.totalPackages || 1} pkg</span>
                            <span className="text-muted-foreground ml-1">({(dn.items || []).length} items)</span>
                          </td>
                          <td className="px-4 py-3.5">
                            {isReceived ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle2 className="size-3" /> Received by Buyer
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                                <Clock className="size-3" /> Dispatched / Inbound
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedDispatchForPrint(dn)}
                              className="h-8 gap-1.5 px-3.5 text-xs font-semibold rounded-lg bg-sky-50/80 hover:bg-sky-100 text-sky-700 hover:text-sky-800 border-sky-200/90 hover:border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/70 dark:hover:bg-sky-900/50 shadow-xs transition-all group"
                              title="View and print delivery challan"
                            >
                              <Printer className="size-3.5 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform" />
                              <span>View Challan</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </LandingTable>
              </DataTableViewport>
            </Card>

            <div className="grid gap-3 lg:hidden">
              {paginatedDispatches.map((dn) => {
                const isReceived = String(dn.status || '').toUpperCase() === 'RECEIVED';
                const poRef = dn.poNumber || dn.purchaseOrder?.poNumber || (dn.poId ? `PO-${String(dn.poId).slice(-6).toUpperCase()}` : '—');
                return (
                  <Card key={dn.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <Truck className="size-4 text-sky-600" /> {dn.dispatchNoteNumber}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">PO: {poRef}</div>
                      </div>
                      {isReceived ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Received
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                          Dispatched
                        </span>
                      )}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/45 p-3 text-xs">
                      <div><dt className="text-muted-foreground">Transporter</dt><dd className="mt-1 font-medium">{dn.transporterName || 'Direct'}</dd></div>
                      <div><dt className="text-muted-foreground">Vehicle</dt><dd className="mt-1 font-mono">{dn.vehicleNumber || '—'}</dd></div>
                      <div><dt className="text-muted-foreground">Dispatched Date</dt><dd className="mt-1 font-medium">{formatDate(dn.dispatchDate)}</dd></div>
                      <div><dt className="text-muted-foreground">Packages</dt><dd className="mt-1 font-medium">{dn.totalPackages || 1} pkg</dd></div>
                    </dl>
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedDispatchForPrint(dn)}
                        className="h-8 gap-1.5 px-3.5 text-xs font-semibold rounded-lg bg-sky-50/80 hover:bg-sky-100 text-sky-700 hover:text-sky-800 border-sky-200/90 hover:border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/70 dark:hover:bg-sky-900/50 shadow-xs transition-all group"
                      >
                        <Printer className="size-3.5 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform" />
                        <span>View Challan</span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            <TablePagination
              currentPage={currentPage}
              totalPages={totalDispatchPages}
              onPageChange={setCurrentPage}
              totalItems={filteredDispatches.length}
              perPage={itemsPerPage}
              className="mt-4"
            />
          </>
        )
      )}

      {selectedDispatchForPrint && (
        <PrintDispatchNoteModal
          data={selectedDispatchForPrint}
          onClose={() => setSelectedDispatchForPrint(null)}
        />
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

const VENDOR_DISPATCH_COLUMNS: LandingColumn[] = [
  { key: 'dispatchNoteNumber', label: 'Dispatch note', defaultVisible: true, required: true },
  { key: 'poNumber', label: 'PO reference', defaultVisible: true },
  { key: 'carrier', label: 'Transporter & Vehicle', defaultVisible: true },
  { key: 'dispatchDate', label: 'Dispatched date', defaultVisible: true },
  { key: 'packages', label: 'Packages / Items', defaultVisible: true },
  { key: 'status', label: 'Receipt status', defaultVisible: true },
  { key: 'actions', label: 'Actions', defaultVisible: true },
];
