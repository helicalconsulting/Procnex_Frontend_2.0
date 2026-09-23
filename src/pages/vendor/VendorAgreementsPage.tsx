import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Building2, Calendar, CheckCircle2, ChevronDown, Download, Eye, FileSignature, FileText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CollapsibleContent } from '@/components/ui/collapsible-content';
import { EmptyState, MetricCard, PageFrame, PageLead } from '@/components/ui/product';
import { useServiceData } from '@/hooks/useServiceData';
import { cn } from '@/lib/utils';
import { vendorPortalService, type VendorAgreement } from '@/services/vendorPortalService';

function formatDate(date: string | null | undefined, includeTime = false) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function agreementType(documentType: string) {
  if (['NDA', 'NDA Agreement'].includes(documentType)) return { short: 'NDA', long: 'Non-disclosure agreement' };
  if (['MNDA', 'MNDA Agreement'].includes(documentType)) return { short: 'MNDA', long: 'Mutual non-disclosure agreement' };
  return { short: documentType, long: documentType };
}

export default function VendorAgreementsPage() {
  const { data: agreements, loading, error } = useServiceData(
    () => vendorPortalService.listAgreements(), [] as VendorAgreement[], [],
    { cacheKey: 'vendor:agreements', cacheTtlMs: 30_000 },
  );
  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<'NDA' | 'MNDA' | null>(null);
  const [previewDoc, setPreviewDoc] = useState<VendorAgreement | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = useMemo(() => ({
    total: agreements.length,
    nda: agreements.filter((item) => agreementType(item.selectedDocType || item.documentType).short === 'NDA').length,
    mnda: agreements.filter((item) => agreementType(item.selectedDocType || item.documentType).short === 'MNDA').length,
  }), [agreements]);

  const filtered = useMemo(() => {
    let list = agreements;
    if (kpiFilter) {
      list = list.filter((item) => agreementType(item.selectedDocType || item.documentType).short === kpiFilter);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => [item.companyName, item.selectedDocType, item.documentType].some((field) => field.toLowerCase().includes(query)));
    }
    return list;
  }, [agreements, kpiFilter, search]);

  const safeMarkup = (document: VendorAgreement) => DOMPurify.sanitize(document.contentSnapshot, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
  });

  const handleDownload = (document: VendorAgreement) => {
    const type = agreementType(document.selectedDocType || document.documentType).short;
    const body = safeMarkup(document);
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${type} agreement</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1f2937;line-height:1.6}img{max-width:100%}</style></head><body>${body}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${type}_Agreement_${document.companyName.replace(/[^a-z0-9]+/gi, '_')}_${formatDate(document.signedAt).replace(/\s+/g, '_')}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageFrame>
      <PageLead
        title="Signed Agreements"
        description="Preview and download the NDA and MNDA agreements associated with your account."
      />
      {error && <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">{error}</Card>}

      {/* KPI Metric Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: FileSignature, tone: 'primary' as const, value: summary.total, label: 'Total Agreements', detail: 'All signed documents', filter: null },
          { icon: FileText, tone: 'success' as const, value: summary.nda, label: 'NDA', detail: 'Non-disclosure', filter: 'NDA' as const },
          { icon: FileText, tone: 'violet' as const, value: summary.mnda, label: 'MNDA', detail: 'Mutual NDA', filter: 'MNDA' as const },
        ].map((c) => {
          const isActive = c.filter === null ? !kpiFilter : kpiFilter === c.filter;
          return (
            <MetricCard
              key={c.label}
              icon={c.icon}
              tone={c.tone}
              value={c.value}
              label={c.label}
              detail={c.detail}
              className={cn(
                'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                isActive &&
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
              )}
              onClick={() => setKpiFilter(isActive ? null : c.filter)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setKpiFilter(isActive ? null : c.filter);
                }
              }}
            />
          );
        })}
      </div>

      {/* Search Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search by company name or agreement type..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search agreements"
          />
        </div>
      </div>

      {/* Agreements List Cards */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading agreements…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No signed agreements found"
          description={search || kpiFilter ? 'Try another search term or filter.' : 'Signed onboarding agreements will appear here.'}
          action={
            search || kpiFilter ? (
              <Button variant="secondary" onClick={() => { setSearch(''); setKpiFilter(null); }}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {filtered.map((agreement) => {
            const expanded = expandedId === agreement.id;
            const type = agreementType(agreement.selectedDocType || agreement.documentType);
            return (
              <Card
                key={agreement.id}
                className={cn(
                  'overflow-hidden transition-all duration-200 border-border/80 hover:border-primary/30',
                  expanded && 'ring-1 ring-primary/20 shadow-md'
                )}
              >
                {/* Header */}
                <div
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-accent/25 transition-colors sm:p-5"
                  onClick={() => setExpandedId(expanded ? null : agreement.id)}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <span className="flex items-center gap-1.5 truncate text-base font-semibold text-foreground">
                      <Building2 className="size-4 shrink-0 text-primary" />
                      {agreement.companyName}
                    </span>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground shrink-0">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      Signed {formatDate(agreement.signedAt)}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" onClick={() => setPreviewDoc(agreement)}>
                      <Eye size={14} /> Preview
                    </Button>
                    <Button size="sm" onClick={() => handleDownload(agreement)}>
                      <Download size={14} /> Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setExpandedId(expanded ? null : agreement.id)}
                      aria-label="Toggle agreement details"
                    >
                      <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {/* Collapsible Body */}
                <CollapsibleContent open={expanded} className="border-t border-border/60 bg-muted/15 p-4 sm:p-5">
                  <div className="rounded-xl border border-border/50 bg-background/60 p-4">
                    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
                      {[
                        ['Agreement Type', type.long],
                        ['Company', agreement.companyName],
                        ['Signed Date', formatDate(agreement.signedAt, true)],
                        ['Status', agreement.status || 'Signed'],
                      ].map(([label, value], idx) => (
                        <div key={label} className={cn('flex flex-col gap-1', idx > 0 && 'sm:pl-4 pt-3 sm:pt-0')}>
                          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                          <dd className="text-sm font-semibold text-foreground break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </CollapsibleContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        {previewDoc && (
          <DialogContent className="max-h-[92vh] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 rounded-2xl border-border">
            <DialogHeader className="border-b border-border/60 px-5 py-4 pr-14 sm:px-6 bg-card">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                <FileText className="size-5 text-primary" />
                {agreementType(previewDoc.selectedDocType || previewDoc.documentType).long}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {previewDoc.companyName} · Signed {formatDate(previewDoc.signedAt, true)}
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto bg-muted/20 p-3 sm:p-6">
              <article
                className="mx-auto min-h-96 max-w-3xl rounded-xl border border-border bg-white p-5 text-sm leading-relaxed text-slate-800 shadow-sm sm:p-8 [&_a]:text-blue-700 [&_h1]:mb-4 [&_h1]:!text-slate-950 [&_h1]:text-2xl [&_h1]:mb-3 [&_h2]:mt-6 [&_h2]:!text-slate-900 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:!text-slate-900 [&_h4]:!text-slate-900 [&_h5]:!text-slate-900 [&_h6]:!text-slate-900 [&_img]:max-w-full [&_li]:ml-5 [&_ol]:my-3 [&_ol]:list-decimal [&_p]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_ul]:my-3 [&_ul]:list-disc"
                dangerouslySetInnerHTML={{ __html: safeMarkup(previewDoc) }}
              />
            </div>
            <DialogFooter className="border-t border-border/60 px-5 py-4 sm:px-6 bg-card flex flex-row items-center justify-between sm:justify-between">
              <Badge tone="success">
                <CheckCircle2 className="size-3" /> Signed
              </Badge>
              <Button onClick={() => handleDownload(previewDoc)}>
                <Download size={14} className="mr-1.5" /> Download copy
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
