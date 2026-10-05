import LandingTable, { type LandingColumn } from '../../components/shared/LandingTable';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileSignature, FileText, Search, Wallet,
} from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyMaster';
import { MessageStrip } from '@/components/shared/MessageStrip';
import { RecordStatusBadge } from '@/components/shared/RecordStatusBadge';
import { TablePagination } from '@/components/shared/TablePagination';
import { quoteDate } from '@/components/vendor/quotationFormatting';
import './vendor-contract-workspace.css';
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
import { TableSkeleton } from '@/components/shared/Skeleton';

type ContractFilter = 'PENDING_SIGNATURE' | 'ACTIVE' | null;

export default function VendorContractsPage() {
  const navigate = useNavigate();
  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();
  const { data: contracts, loading, error, reload } = useServiceData(
    () => contractService.listVendorContracts().then((result) => result.contracts),
    [] as Contract[],
    [],
    { cacheKey: 'vendor:contracts', cacheTtlMs: 30_000 }
  );

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<ContractFilter>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

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
      totalValue: contracts.reduce((sum, contract) => sum + convert(contract.contractValue, contract.currency || companyDefaultCurrency, companyDefaultCurrency), 0),
    }),
    [contracts, convert, companyDefaultCurrency]
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
        [contract.contractNumber, contract.title, contract.rfq?.rfqNumber ?? '', contract.rfq?.title ?? '', contract.contractOwner?.fullName ?? '']
          .some((field) => field.toLowerCase().includes(q))
      );
    }
    return list;
  }, [contracts, kpiFilter, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleContracts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const formatDate = (date?: string | null) => quoteDate(date || undefined);
  const formatCurrency = (value: number, currency?: string) =>
    formatAmount(value, currency || companyDefaultCurrency);
  const needsVendorSignature = (contract: Contract) =>
    ['AWAITING_VENDOR_SIGNATURE', 'PENDING_VENDOR_SIGNATURE'].includes(contract.status);

  return (
    <PageFrame className="contract-workspace">
      {error && <MessageStrip type="error">{error}</MessageStrip>}

      {/* ── Page Lead Header ────────────────────────── */}
      <PageLead
        title="My Contracts"
        description="Review, download, and sign contracts awarded to your company."
      />

      {/* ── KPI Metric Cards ────────────────────────── */}
      <div className="contract-metrics mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            icon: Wallet,
            tone: 'violet' as const,
            value: formatAmount(summary.totalValue, companyDefaultCurrency),
            label: 'Total value',
            detail: `Across all contracts · ${companyDefaultCurrency}`,
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
                  'border-primary/45 bg-primary/[0.08] dark:bg-primary/20'
              )}
              onClick={() => {
                if (!c.isTotalValue) { setKpiFilter(isActive ? null : c.filter); setPage(1); }
              }}
              role={c.isTotalValue ? undefined : 'button'}
              tabIndex={c.isTotalValue ? undefined : 0}
              aria-pressed={c.isTotalValue ? undefined : isActive}
              onKeyDown={(e) => {
                if (!c.isTotalValue && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setKpiFilter(isActive ? null : c.filter);
                  setPage(1);
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search contracts"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span role="status">{filtered.length} of {contracts.length} contracts</span>
          {(search || kpiFilter) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setKpiFilter(null); setPage(1); }}>Clear filters</Button>}
        </div>
      </div>

      {/* ── Contracts List Cards ────────────────────── */}
      {loading ? (
        <TableSkeleton rows={5} columnWidths={['25%', '15%', '20%', '15%', '25%']} />
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
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="contract-register overflow-hidden">
          <div className="overflow-x-auto">
            <LandingTable key="vendor-contracts" preferenceKey="vendor-contracts" columns={VENDOR_CONTRACTS_COLUMNS} className="w-full text-left text-xs" aria-label="Contracts">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground">
                  <th scope="col">Contract & source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Effective / expires</th>
                  <th scope="col" className="text-right">Contract value</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleContracts.map((contract) => (
                  <tr key={contract.id}>
                    <td>
                      <div className="flex items-center gap-2 font-bold text-base tracking-tight text-foreground">
                        <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />{contract.contractNumber}
                      </div>
                      <div className="mt-1 font-medium text-foreground">{contract.rfq?.title || contract.title}</div>
                      <div className="mt-1 text-muted-foreground">{contract.rfq?.rfqNumber || 'Direct contract'}{contract.contractOwner?.fullName && ` · ${contract.contractOwner.fullName}`}</div>
                    </td>
                    <td><RecordStatusBadge kind="contract" status={contract.status} /></td>
                    <td>
                      <div className="font-semibold">{formatDate(contract.effectiveDate)}</div>
                      <div className="mt-1 text-muted-foreground">Expires {formatDate(contract.expirationDate)}</div>
                    </td>
                    <td className="text-right">
                      <div className="text-lg font-bold tabular-nums whitespace-nowrap">{formatCurrency(contract.contractValue, contract.currency)}</div>
                      <div className="mt-1 text-muted-foreground">{contract.currency || companyDefaultCurrency}</div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => navigate(getVendorPath(`/vendor/contracts/${contract.id}`))}>
                          <Eye className="size-4" /> View Details
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`Download PDF for ${contract.contractNumber}`} title="Download PDF" onClick={() => downloadContractAsPdf(contract.contentSnapshot, contract.contractNumber, contract.title)}>
                          <Download className="size-4" />
                        </Button>
                      </div>
                      {needsVendorSignature(contract) && (
                        <Button size="sm" className="mt-2 w-full whitespace-nowrap" onClick={() => navigate(getVendorPath(`/vendor/contracts/${contract.id}?action=sign`))}>
                          <FileSignature className="size-4" /> Sign Contract
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </LandingTable>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalPages={pages}
            onPageChange={setPage}
            totalItems={filtered.length}
            perPage={pageSize}
            className="border-t border-border rounded-none"
          />
        </Card>
      )}
    </PageFrame>
  );
}

const VENDOR_CONTRACTS_COLUMNS: LandingColumn[] = [
  { key: 'contract', label: 'Contract & source', defaultVisible: true, required: true },
  { key: 'status', label: 'Status', defaultVisible: true },
  { key: 'dates', label: 'Effective / expires', defaultVisible: true },
  { key: 'value', label: 'Contract value', defaultVisible: true },
  { key: 'actions', label: 'Actions', defaultVisible: true, pinned: 'end' },
];
