import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Ban, Building2, Calendar, CheckCircle2, ChevronDown, Clock,
  Download, Eye, FileSignature, FileText, Search, XCircle, Shield,
} from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyMaster';
import { MessageStrip } from '@/components/shared/MessageStrip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '@/components/ui/product';
import { useServiceData } from '@/hooks/useServiceData';
import { cn } from '@/lib/utils';
import { contractService, type Contract } from '@/services/contractService';
import { sseClient } from '@/services/sseClient';
import { downloadContractAsPdf } from '@/utils/pdfDownload';
import { getVendorPath } from '@/utils/tenantResolver';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
type ContractFilter = 'PENDING_SIGNATURE' | 'ACTIVE' | 'TOTAL' | null;

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
  return (
    <Badge tone={config.tone}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}

export default function VendorContractsPage() {
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { data: contracts, loading, error, reload } = useServiceData(
    () => contractService.listVendorContracts().then((result) => result.contracts),
    [] as Contract[],
    [],
    { cacheKey: 'vendor:contracts', cacheTtlMs: 30_000 }
  );

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<ContractFilter>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeSigned = sseClient.on('contract_signed', reload);
    const unsubscribePurchaseOrder = sseClient.on('po_created', reload);
    return () => {
      unsubscribeSigned();
      unsubscribePurchaseOrder();
    };
  }, [reload]);

  const summary = useMemo(
    () => ({
      total: contracts.length,
      pendingSignature: contracts.filter((contract) =>
        ['AWAITING_VENDOR_SIGNATURE', 'PENDING_VENDOR_SIGNATURE'].includes(contract.status)
      ).length,
      active: contracts.filter((contract) =>
        ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(contract.status)
      ).length,
      totalValue: contracts.reduce((sum, contract) => sum + contract.contractValue, 0),
    }),
    [contracts]
  );

  const filtered = useMemo(() => {
    let list = contracts;

    if (kpiFilter === 'PENDING_SIGNATURE') {
      list = list.filter((c) => ['AWAITING_VENDOR_SIGNATURE', 'PENDING_VENDOR_SIGNATURE'].includes(c.status));
    } else if (kpiFilter === 'ACTIVE') {
      list = list.filter((c) => ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(c.status));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((contract) =>
        [contract.contractNumber, contract.title, contract.rfq?.rfqNumber ?? '', contract.contractOwner?.fullName ?? '']
          .some((field) => field.toLowerCase().includes(q))
      );
    }
    return list;
  }, [contracts, kpiFilter, search]);

  const formatDate = (date: string | null | undefined) =>
    date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const formatCurrency = (value: number, currency?: string) =>
    formatAmount(value, currency || companyDefaultCurrency);
  const needsVendorSignature = (contract: Contract) =>
    ['AWAITING_VENDOR_SIGNATURE', 'PENDING_VENDOR_SIGNATURE'].includes(contract.status);

  return (
    <PageFrame>
      {error && <MessageStrip type="error">{error}</MessageStrip>}

      {/* ── Page Lead Header ────────────────────────── */}
      <PageLead
        title="My Contracts"
        description="Review, download, and sign contracts awarded to your company."
      />

      {/* ── KPI Metric Cards ────────────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: FileText,
            tone: 'primary' as const,
            value: summary.total,
            label: 'Total contracts',
            detail: 'All awarded contracts',
            filter: null as ContractFilter,
          },
          {
            icon: FileSignature,
            tone: 'warning' as const,
            value: summary.pendingSignature,
            label: 'Need signature',
            detail: 'Action required',
            filter: 'PENDING_SIGNATURE' as ContractFilter,
          },
          {
            icon: CheckCircle2,
            tone: 'success' as const,
            value: summary.active,
            label: 'Active',
            detail: 'Signed or completed',
            filter: 'ACTIVE' as ContractFilter,
          },
          {
            icon: Building2,
            tone: 'violet' as const,
            value: formatAmount(summary.totalValue, companyDefaultCurrency),
            label: 'Total value',
            detail: 'Across all contracts',
            filter: null as ContractFilter,
            isTotalValue: true,
          },
        ].map((c) => {
          const isActive = c.isTotalValue ? false : c.filter === null ? !kpiFilter : kpiFilter === c.filter;
          return (
            <MetricCard
              key={c.label}
              icon={c.icon}
              tone={c.tone}
              value={c.value}
              label={c.label}
              detail={c.detail}
              className={cn(
                !c.isTotalValue && 'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                isActive &&
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
              )}
              onClick={() => {
                if (!c.isTotalValue) setKpiFilter(isActive ? null : c.filter);
              }}
              role={c.isTotalValue ? undefined : 'button'}
              tabIndex={c.isTotalValue ? undefined : 0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (!c.isTotalValue && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setKpiFilter(isActive ? null : c.filter);
                }
              }}
            />
          );
        })}
      </div>

      {/* ── Search Toolbar ──────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search by contract number, title, RFQ, or buyer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search contracts"
          />
        </div>
      </div>

      {/* ── Contracts List Cards ────────────────────── */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading contracts…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No contracts found"
          description={search || kpiFilter ? 'Try clearing your search filter.' : 'Awarded contracts will appear here for review and signing.'}
          action={
            search || kpiFilter ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setKpiFilter(null);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {filtered.map((contract) => {
            const isExpanded = expandedId === contract.id;
            return (
              <Card
                key={contract.id}
                className={cn(
                  'overflow-hidden transition-all duration-200 border-border/80 hover:border-primary/30',
                  isExpanded && 'ring-1 ring-primary/20 shadow-md'
                )}
              >
                {/* Header */}
                <div
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-accent/25 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : contract.id)}
                >
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText size={18} className="text-primary shrink-0" />
                      <span className="font-bold text-foreground text-base tracking-tight">{contract.contractNumber}</span>
                      <StatusBadge status={contract.status} />
                    </div>
                    <div className="text-xs font-medium text-muted-foreground truncate">
                      {contract.title.replace(new RegExp(`\\s*[-·—]?\\s*${contract.rfq?.rfqNumber || ''}`, 'gi'), '').trim()}
                      {contract.rfq?.rfqNumber && (
                        <>
                          <span className="mx-1.5 opacity-40">·</span>
                          <span className="text-foreground/80 font-medium">RFQ: {contract.rfq.rfqNumber}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Prominent Price Display */}
                    <div className="text-right mr-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Contract Amount</div>
                      <div className="text-lg font-bold tabular-nums text-foreground">
                        {formatCurrency(contract.contractValue, contract.currency)}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(getVendorPath(`/vendor/contracts/${contract.id}`))}>
                      <Eye size={14} /> View Details
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => downloadContractAsPdf(contract.contentSnapshot, contract.contractNumber, contract.title)}>
                      <Download size={14} /> Download
                    </Button>

                    {needsVendorSignature(contract) && (
                      <Button
                        size="sm"
                        className="border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => navigate(getVendorPath(`/vendor/contracts/${contract.id}?action=sign`))}>
                        <FileSignature size={14} /> Sign Contract
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setExpandedId(isExpanded ? null : contract.id)}
                      aria-label="Toggle contract details">
                      <ChevronDown className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-muted/10 p-5 space-y-4 text-sm">
                    {/* Key Dates Badge Grid */}
                    <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border/50 text-xs">
                      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 font-medium text-foreground">
                        <Calendar size={14} className="text-primary shrink-0" />
                        <span>Effective Date: <strong>{formatDate(contract.effectiveDate)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 font-medium text-foreground">
                        <Clock size={14} className="text-muted-foreground shrink-0" />
                        <span>End Date: <strong>{formatDate(contract.endDate)}</strong></span>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 sm:grid-cols-4 text-xs">
                      {[
                        ['Contract Type', contract.contractType?.replaceAll('_', ' ') || '—'],
                        ['Currency', contract.currency || companyDefaultCurrency],
                        ['Priority', contract.priority || 'Medium'],
                        ['Buyer Contact', contract.contractOwner?.fullName || '—'],
                        ['Source RFQ', contract.rfq?.rfqNumber || '—'],
                        ['RFQ Title', contract.rfq?.title || '—'],
                        ['Payment Terms', contract.paymentTerms || '—'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <div className="text-muted-foreground font-medium mb-0.5 text-[11px]">{label}</div>
                          <div className="font-semibold text-foreground text-xs">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}

