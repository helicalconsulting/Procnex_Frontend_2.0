import DOMPurify from 'dompurify';
import { FileText, Shield } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Contract } from '@/services/contractService';

/** Optional contract content uses the same read-only sections as the core terms. */
export function ContractTermsSections({ contract }: { contract: Contract }) {
  return <>
    {!!contract.clauses?.length && <Card className="p-5 space-y-4 lg:col-span-2">
      <h2 className="flex items-center gap-2 border-b border-border/60 pb-3 text-sm font-semibold"><FileText className="size-4 text-primary" />Contract Clauses</h2>
      <div className="divide-y divide-border">
        {[...contract.clauses].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((clause, index) => <section key={clause.id || index} className="py-3 first:pt-0 last:pb-0 space-y-2 text-xs">
          <h3 className="font-semibold">{clause.title || `Clause ${index + 1}`}</h3>
          {clause.category && <p className="text-muted-foreground">{clause.category.replaceAll('_', ' ')}</p>}
          <div className="space-y-2 break-words" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(clause.contentSnapshot || '', {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
            ALLOWED_ATTR: ['colspan', 'rowspan'],
          }) }} />
        </section>)}
      </div>
    </Card>}
    {!!contract.slaEntries?.length && <Card className="p-5 space-y-4 lg:col-span-2">
      <h2 className="flex items-center gap-2 border-b border-border/60 pb-3 text-sm font-semibold"><Shield className="size-4 text-primary" />Service Levels</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" aria-label="Contract service levels">
          <thead className="bg-muted/20 text-muted-foreground"><tr>{['Service level', 'Target', 'Measurement', 'Review', 'Penalty'].map(label => <th key={label} scope="col" className="p-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{contract.slaEntries.map((sla, index) => <tr key={index}>
            {[sla.slaName, sla.target, sla.measurementMethod, sla.reviewFrequency, sla.penaltyForBreach].map((value, i) => <td className="p-3 align-top" key={i}>{value || '—'}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </Card>}
    {[contract.warrantyPeriod, contract.supportPeriod, contract.supportResponseTime].some(Boolean) && <Card className="p-5 space-y-4 lg:col-span-2">
      <h2 className="flex items-center gap-2 border-b border-border/60 pb-3 text-sm font-semibold"><Shield className="size-4 text-primary" />Warranty & Support</h2>
      <dl className="grid grid-cols-3 gap-4 text-xs">{[
        ['Warranty period', contract.warrantyPeriod], ['Support period', contract.supportPeriod], ['Response time', contract.supportResponseTime],
      ].map(([label, value]) => <div key={label}><dt className="mb-1 font-medium text-muted-foreground">{label}</dt><dd className="font-semibold">{value || 'Not specified'}</dd></div>)}</dl>
    </Card>}
  </>;
}
