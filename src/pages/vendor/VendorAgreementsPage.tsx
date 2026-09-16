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
  const [previewDoc, setPreviewDoc] = useState<VendorAgreement | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const summary = useMemo(() => ({
    total: agreements.length,
    nda: agreements.filter((item) => agreementType(item.selectedDocType || item.documentType).short === 'NDA').length,
    mnda: agreements.filter((item) => agreementType(item.selectedDocType || item.documentType).short === 'MNDA').length,
  }), [agreements]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return agreements;
    return agreements.filter((item) => [item.companyName, item.selectedDocType, item.documentType].some((field) => field.toLowerCase().includes(query)));
  }, [agreements, search]);

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
      <PageLead title="Signed Agreements" description="Preview and download the NDA and MNDA agreements associated with your account." />
      {error && <Card className="mb-4 border-destructive/25 bg-destructive/8 p-4 text-sm text-destructive">{error}</Card>}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Total agreements" value={summary.total} detail="All signed documents" icon={FileSignature} aria-pressed={true} />
        <MetricCard label="NDA" value={summary.nda} detail="Non-disclosure" icon={FileText} tone="success" />
        <MetricCard label="MNDA" value={summary.mnda} detail="Mutual NDA" icon={FileText} tone="violet" />
      </div>
      <Card className="mb-4 p-3 sm:p-4">
        <div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company or agreement type" aria-label="Search agreements" /></div>
      </Card>

      {loading ? (
        <Card className="grid min-h-64 place-items-center text-sm text-muted-foreground">Loading agreements…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileSignature} title="No signed agreements" description={search ? 'Try another search term.' : 'Signed onboarding agreements will appear here.'} action={search ? <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button> : undefined} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((agreement) => {
            const expanded = expandedId === agreement.id;
            const type = agreementType(agreement.selectedDocType || agreement.documentType);
            return (
              <Card key={agreement.id} className={cn('overflow-hidden transition-shadow', expanded && 'shadow-md')}>
                <button type="button" className="flex w-full items-start justify-between gap-4 p-4 text-left outline-none transition hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:items-center sm:p-5" onClick={() => setExpandedId(expanded ? null : agreement.id)} aria-expanded={expanded}>
                  <span className="flex min-w-0 items-start gap-3 sm:items-center">
                    <span className={cn('grid h-9 min-w-14 place-items-center rounded-xl border px-2 text-xs font-semibold', type.short === 'MNDA' ? 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300' : 'border-primary/20 bg-primary/10 text-primary')}>{type.short}</span>
                    <span className="min-w-0"><span className="flex items-center gap-1.5 truncate text-sm font-semibold"><Building2 className="size-3.5 shrink-0 text-muted-foreground" />{agreement.companyName}</span><span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Calendar className="size-3" />Signed {formatDate(agreement.signedAt)}</span><span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-3" />{agreement.status}</span></span></span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3"><span className="hidden text-xs text-muted-foreground md:block">{type.long}</span><ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} /></span>
                </button>
                <CollapsibleContent open={expanded} className="border-t border-border/65 bg-secondary/25 p-4 sm:p-5">
                    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ['Type', type.long], ['Company', agreement.companyName], ['Signed on', formatDate(agreement.signedAt, true)], ['Status', 'Signed'],
                      ].map(([label, value]) => <div key={label} className="rounded-xl border border-border/60 bg-card p-3"><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => setPreviewDoc(agreement)}><Eye />Preview</Button><Button size="sm" onClick={() => handleDownload(agreement)}><Download />Download</Button></div>
                </CollapsibleContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        {previewDoc && (
          <DialogContent className="max-h-[92vh] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0">
            <DialogHeader className="border-b border-border/65 px-5 py-4 pr-14 sm:px-6">
              <DialogTitle className="flex items-center gap-2"><FileText className="size-5 text-primary" />{agreementType(previewDoc.selectedDocType || previewDoc.documentType).long}</DialogTitle>
              <DialogDescription>{previewDoc.companyName} · signed {formatDate(previewDoc.signedAt, true)}</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto bg-secondary/35 p-3 sm:p-6">
              <article className="mx-auto min-h-96 max-w-3xl rounded-xl border border-slate-300 bg-white p-5 text-sm leading-relaxed text-slate-800 shadow-sm sm:p-8 [&_a]:text-blue-700 [&_h1]:mb-4 [&_h1]:!text-slate-950 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:!text-slate-900 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:!text-slate-900 [&_h4]:!text-slate-900 [&_h5]:!text-slate-900 [&_h6]:!text-slate-900 [&_img]:max-w-full [&_li]:ml-5 [&_ol]:my-3 [&_ol]:list-decimal [&_p]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_ul]:my-3 [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: safeMarkup(previewDoc) }} />
            </div>
            <DialogFooter className="border-t border-border/65 px-5 py-4 sm:px-6"><Badge tone="success"><CheckCircle2 className="size-3" />Signed</Badge><Button onClick={() => handleDownload(previewDoc)}><Download />Download copy</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
