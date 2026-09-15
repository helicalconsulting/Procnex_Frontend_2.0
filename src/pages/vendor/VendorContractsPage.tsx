import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Ban, Building2, Calendar, CheckCircle2, ChevronDown, Clock,
  Download, Eye, FileSignature, FileText, Search, XCircle,
} from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyMaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CollapsibleContent } from '@/components/ui/collapsible-content';
import { EmptyState, MetricCard, PageFrame, PageLead } from '@/components/ui/product';
import { useServiceData } from '@/hooks/useServiceData';
import { cn } from '@/lib/utils';
import { contractService, type Contract } from '@/services/contractService';
import { sseClient } from '@/services/sseClient';
import { downloadContractAsPdf } from '@/utils/pdfDownload';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
const STATUS: Record<string, { label: string; tone: Tone; icon: typeof FileText }> = {
  DRAFT: { label: 'Draft', tone: 'neutral', icon: FileText },
  PENDING_VENDOR_SIGNATURE: { label: 'Awaiting your signature', tone: 'warning', icon: Clock },
  AWAITING_CUSTOMER_SIGNATURE: { label: 'Awaiting buyer signature', tone: 'info', icon: Clock },
  AWAITING_VENDOR_SIGNATURE: { label: 'Awaiting your signature', tone: 'warning', icon: Clock },
  VENDOR_SIGNED: { label: 'Vendor signed', tone: 'success', icon: CheckCircle2 },
  ACCEPTED: { label: 'Accepted', tone: 'success', icon: CheckCircle2 },
  COMPLETED: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  ACTIVE: { label: 'Active', tone: 'success', icon: CheckCircle2 },
  EXPIRING_SOON: { label: 'Expiring soon', tone: 'warning', icon: AlertTriangle },
  EXPIRED: { label: 'Expired', tone: 'danger', icon: XCircle },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: Ban },
  TERMINATED: { label: 'Terminated', tone: 'danger', icon: Ban },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS[status] ?? { label: status.replaceAll('_', ' '), tone: 'neutral' as Tone, icon: FileText };
  const Icon = config.icon;
  return <Badge tone={config.tone}><Icon className="size-3" />{config.label}</Badge>;
}

export default function VendorContractsPage() {
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { data: contracts, loading, error, reload } = useServiceData(
    () => contractService.listVendorContracts().then((result) => result.contracts), [] as Contract[], [],
    { cacheKey: 'vendor:contracts', cacheTtlMs: 30_000 },
  );
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeSigned = sseClient.on('contract_signed', reload);
    const unsubscribePurchaseOrder = sseClient.on('po_created', reload);
    return () => { unsubscribeSigned(); unsubscribePurchaseOrder(); };
  }, [reload]);

  const summary = useMemo(() => ({
    total: contracts.length,
    pendingSignature: contracts.filter((contract) => ['AWAITING_VENDOR_SIGNATURE', 'PENDING_VENDOR_SIGNATURE'].includes(contract.status)).length,
    active: contracts.filter((contract) => ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(contract.status)).length,
    totalValue: contracts.reduce((sum, contract) => sum + contract.contractValue, 0),
  }), [contracts]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contracts;
    return contracts.filter((contract) => [contract.contractNumber, contract.title, contract.rfq?.rfqNumber ?? ''].some((field) => field.toLowerCase().includes(query)));
  }, [contracts, search]);
  const formatDate = (date: string | null | undefined) => date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const formatCurrency = (value: number, currency?: string) => formatAmount(value, currency || companyDefaultCurrency);
  const needsVendorSignature = (contract: Contract) => ['AWAITING_VENDOR_SIGNATURE', 'PENDING_VENDOR_SIGNATURE'].includes(contract.status);

  return (
    <PageFrame>
      <PageLead title="My Contracts" description="Review, download, and sign contracts awarded to your company." />
      {error && <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">{error}</Card>}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Total contracts" value={summary.total} detail="All awarded contracts" icon={FileText} />
        <MetricCard label="Need signature" value={summary.pendingSignature} detail="Action required" icon={FileSignature} tone="warning" />
        <MetricCard label="Active" value={summary.active} detail="Signed or completed" icon={CheckCircle2} tone="success" />
        <MetricCard label="Total value" value={formatAmount(summary.totalValue, companyDefaultCurrency)} detail="Across all contracts" icon={Building2} tone="violet" />
      </div>
      <Card className="mb-4 p-3 sm:p-4"><div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, title, or RFQ" aria-label="Search contracts" /></div></Card>

      {loading ? (
        <Card className="grid min-h-64 place-items-center text-sm text-muted-foreground">Loading contracts…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No contracts found" description={search ? 'Try another search term.' : 'Awarded contracts will appear here for review and signing.'} action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button> : undefined} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((contract) => {
            const expanded = expandedId === contract.id;
            return (
              <Card key={contract.id} className={cn('overflow-hidden transition-shadow', expanded && 'shadow-md')}>
                <button type="button" className="flex w-full flex-col gap-3 p-4 text-left outline-none transition hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:flex-row sm:items-center sm:justify-between sm:p-5" onClick={() => setExpandedId(expanded ? null : contract.id)} aria-expanded={expanded}>
                  <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-primary">{contract.contractNumber}</span><span className="truncate text-sm font-medium">{contract.title}</span></span><span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Building2 className="size-3" />{contract.rfq?.rfqNumber || 'No RFQ reference'}</span><span className="flex items-center gap-1"><Calendar className="size-3" />{formatDate(contract.effectiveDate)}</span></span></span>
                  <span className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end"><span className="font-semibold tabular-nums">{formatCurrency(contract.contractValue, contract.currency)}</span><StatusBadge status={contract.status} /><ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} /></span>
                </button>
                <CollapsibleContent open={expanded} className="border-t border-border/65 bg-secondary/20 p-4 sm:p-5">
                    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ['Contract type', contract.contractType?.replaceAll('_', ' ') || '—'],
                        ['Value', formatCurrency(contract.contractValue, contract.currency)],
                        ['Currency', contract.currency || companyDefaultCurrency],
                        ['Priority', contract.priority || 'Medium'],
                        ['Buyer contact', contract.contractOwner?.fullName || '—'],
                        ['Source RFQ', contract.rfq?.rfqNumber || '—'],
                        ['RFQ title', contract.rfq?.title || '—'],
                        ['Payment terms', contract.paymentTerms || '—'],
                      ].map(([label, value]) => <div key={label} className="rounded-xl border border-border/60 bg-card p-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                      <Button size="sm" onClick={() => navigate(`/vendor/contracts/${contract.id}`)}><Eye />View details</Button>
                      <Button variant="secondary" size="sm" onClick={() => downloadContractAsPdf(contract.contentSnapshot, contract.contractNumber, contract.title)}><Download />Download</Button>
                      {needsVendorSignature(contract) && <Button size="sm" className="border-emerald-600 bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate(`/vendor/contracts/${contract.id}?action=sign`)}><FileSignature />Sign contract</Button>}
                    </div>
                </CollapsibleContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
