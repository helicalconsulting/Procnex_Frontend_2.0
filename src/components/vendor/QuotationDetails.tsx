import type { ReactNode } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { PREDEFINED_EVAL_CATEGORIES } from '../../mocks/rfqEvaluation.mock';
import './vendor-rfq-workspace.css';

type Scalar = string | number | boolean | null;
interface QuoteItem {
  id?: string | number; rfqItemId?: string | number; name?: string; itemName?: string;
  description?: string; quantity?: number; unit?: string; unitPrice?: number; totalPrice?: number; lineTotal?: number; currency?: string;
}
interface QuoteDocument { id?: string | number; name?: string; fileName?: string; originalName?: string; url?: string; fileUrl?: string; publicUrl?: string }
interface Milestone { id?: string; title?: string; name?: string; percentage: number }
export interface QuotationRecord {
  vendorQuotationNumber?: string; currency?: string; totalPrice?: number; totalAmount?: number;
  leadTimeDays?: number; leadTime?: number; paymentTerms?: string; notes?: string; vendorNotes?: string;
  submittedAt?: string; status?: string; versionNumber?: number; qNo?: string;
  items?: QuoteItem[]; lineItems?: QuoteItem[];
  paymentPlanSnapshot?: Milestone[] | { name?: string; milestones: Milestone[] };
  paymentPlan?: { name?: string; milestones: Milestone[] };
  customFieldValues?: Record<string, Scalar>; evalParamValues?: Record<string, Scalar>; evaluationParamValues?: Record<string, Scalar>;
  bidSecurityValueType?: string; bidSecurityValue?: number; bidSecurityCurrency?: string; bidSecurityValidityValue?: number; bidSecurityValidityUnit?: string;
  bidSecurityBondNumber?: string; bidSecurityIssuer?: string; bidSecurityDocumentUrl?: string;
  bidBondNumber?: string; bidBondIssuer?: string; bidBondAmount?: number; bidBondCurrency?: string; bidBondIssueDate?: string; bidBondExpiryDate?: string;
  bidBondValidityValue?: number; bidBondValidityUnit?: string; bidBondDocumentUrl?: string;
  attachments?: QuoteDocument[];
}
export interface QuotationRequirements {
  items: QuoteItem[]; bidSecurityRequired?: boolean; bidBondRequired?: boolean;
  customFields?: { id: string; fieldName: string }[];
  evaluationCategories?: { id: string; name: string; enabled?: boolean; subParameters: { id: string; name: string; enabled?: boolean }[] }[];
}
const present = (value: unknown) => value !== undefined && value !== null && value !== '';
const display = (value: unknown): ReactNode => present(value) ? String(value) : '—';
import { quoteDate } from './quotationFormatting';
const safeDocumentUrl = (value?: string) => value && /^(https?:\/\/|\/(?!\/))/i.test(value) ? value : undefined;

function Fields({ fields }: { fields: [string, ReactNode][] }) {
  return <dl className="rfq-facts">{fields.map(([label, value]) => <div key={label}><dt className="vquot-modal__label">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}</dl>;
}
function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="rfq-read-section" open={open}><summary className="vquot-modal__label">{title}<ChevronDown size={16} /></summary><div className="rfq-read-section__body">{children}</div></details>;
}

/** Shared document view for submitted quotations and immutable historical snapshots. */
export default function QuotationDetails({ quote, rfq, formatAmount }: {
  quote: QuotationRecord; rfq: QuotationRequirements; formatAmount: (amount: number, currency: string) => string;
}) {
  const currency = quote.currency || '';
  const money = (value: unknown, code = currency) => present(value) && Number.isFinite(Number(value)) && code ? formatAmount(Number(value), code) : '—';
  const items = quote.items?.length ? quote.items : quote.lineItems?.length ? quote.lineItems : rfq.items;
  const plan = quote.paymentPlanSnapshot ?? quote.paymentPlan;
  const milestones = Array.isArray(plan) ? plan : plan?.milestones;
  const values = quote.customFieldValues ?? {};
  const evalValues = { ...values, ...quote.evaluationParamValues, ...quote.evalParamValues };
  const used = new Set<string>();
  const configured = rfq.evaluationCategories?.length ? rfq.evaluationCategories : PREDEFINED_EVAL_CATEGORIES.map(cat => ({ ...cat, subParameters: cat.subParameters.filter(sp => [sp.id, `eval_${sp.id}`, sp.name, `eval_${sp.name}`].some(key => present(evalValues[key]))) }));
  const categories = configured.filter(cat => cat.enabled !== false).map(cat => ({ ...cat, fields: cat.subParameters.filter(sp => sp.enabled !== false).map(sp => {
    const keys = [sp.id, `eval_${sp.id}`, sp.name, `eval_${sp.name}`]; keys.forEach(key => used.add(key));
    return [sp.name, display(evalValues[keys.find(key => present(evalValues[key])) ?? sp.id])] as [string, ReactNode];
  }) })).filter(cat => cat.fields.length);
  const customFields: [string, ReactNode][] = (rfq.customFields ?? []).map(cf => {
    used.add(cf.id); used.add(cf.fieldName);
    return [cf.fieldName, display(values[cf.id] ?? values[cf.fieldName])];
  });
  Object.entries(evalValues).filter(([key]) => !used.has(key)).forEach(([key, value]) => customFields.push([key.replace(/^eval_/, '').replace(/_/g, ' '), display(value)]));
  return <div className="rfq-quote-details">
    <div className="rfq-quote-summary">
      <div><div className="vquot-modal__total-label">Total Quotation Value</div><div className="vquot-modal__total-value">{money(quote.totalPrice ?? quote.totalAmount)}</div></div>
      <div className="text-xs rfq-muted">{items.length} {items.length === 1 ? 'line item' : 'line items'}{currency && ` · ${currency}`}</div>
    </div>
    <Fields fields={[
      ['Vendor Quote Ref No', display(quote.vendorQuotationNumber)],
      ['Lead Time', present(quote.leadTimeDays ?? quote.leadTime) ? `${quote.leadTimeDays ?? quote.leadTime} ${Number(quote.leadTimeDays ?? quote.leadTime) === 1 ? 'day' : 'days'}` : '—'],
      ['Payment Terms', display(quote.paymentTerms)],
    ]} />
    {!!milestones?.length && <Section title="Payment milestones" open><ol className="rfq-payment-milestones">{milestones.map((m, i) => <li key={m.id ?? i}><span>{m.title || m.name || `Milestone ${i + 1}`}</span><strong>{m.percentage}%</strong></li>)}</ol></Section>}
    <section aria-label="Item pricing" className="rfq-pricing-section">
      <div className="rfq-section-heading"><span className="vrfq-card__items-title">Item Pricing</span><span className="text-xs rfq-muted">{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
      <div className="rfq-table-scroll" tabIndex={0} role="region" aria-label="Item pricing table, scroll for more columns">
        <table className="vquot-modal__previous-table rfq-pricing-table"><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Unit Price</th><th scope="col">Line Total</th></tr></thead>
          <tbody>{items.map((item, index) => {
            const requirement = rfq.items.find(r => String(r.id) === String(item.rfqItemId ?? item.id)) ?? rfq.items[index];
            const quantity = item.quantity ?? requirement?.quantity;
            const total = item.totalPrice ?? item.lineTotal ?? (present(item.unitPrice) && present(quantity) ? Number(item.unitPrice) * Number(quantity) : undefined);
            return <tr key={item.id ?? index}><td><div className="vquot-modal__item-name">{item.name || item.itemName || requirement?.name || `Item ${index + 1}`}</div>{(item.description || requirement?.description) && <div className="text-xs rfq-muted rfq-item-description">{item.description || requirement?.description}</div>}</td><td>{display(quantity)} {item.unit || requirement?.unit}</td><td>{money(item.unitPrice, item.currency || currency)}</td><td><strong>{money(total, item.currency || currency)}</strong></td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
    <div className="rfq-quote-notes"><div className="vquot-modal__label">Notes / Remarks</div><p className="vquot-modal__item-name">{quote.notes || quote.vendorNotes || 'No remarks provided.'}</p></div>
    {(rfq.bidSecurityRequired || present(quote.bidSecurityValue) || quote.bidSecurityBondNumber || quote.bidSecurityDocumentUrl) && <Section title="Bid security" open><Fields fields={[
      ['Value type', quote.bidSecurityValueType === 'PERCENTAGE' ? 'Percentage' : 'Fixed amount'],
      ['Value', quote.bidSecurityValueType === 'PERCENTAGE' ? `${display(quote.bidSecurityValue)}%` : money(quote.bidSecurityValue, quote.bidSecurityCurrency || currency)],
      ['Validity', present(quote.bidSecurityValidityValue) ? `${quote.bidSecurityValidityValue} ${quote.bidSecurityValidityUnit || 'days'}` : '—'],
      ['Bond / reference', display(quote.bidSecurityBondNumber)], ['Issuer / bank', display(quote.bidSecurityIssuer)],
    ]} />{safeDocumentUrl(quote.bidSecurityDocumentUrl) && <a className="rfq-document-link" href={quote.bidSecurityDocumentUrl} target="_blank" rel="noreferrer"><FileText size={14} /> View bid security document</a>}</Section>}
    {(rfq.bidBondRequired || present(quote.bidBondAmount) || quote.bidBondNumber || quote.bidBondDocumentUrl) && <Section title="Bid bond" open><Fields fields={[
      ['Bond number', display(quote.bidBondNumber)], ['Issuer / bank', display(quote.bidBondIssuer)], ['Amount', money(quote.bidBondAmount, quote.bidBondCurrency || currency)],
      ['Issue date', quoteDate(quote.bidBondIssueDate)], ['Expiry date', quoteDate(quote.bidBondExpiryDate)], ['Validity', present(quote.bidBondValidityValue) ? `${quote.bidBondValidityValue} ${quote.bidBondValidityUnit || 'days'}` : '—'],
    ]} />{safeDocumentUrl(quote.bidBondDocumentUrl) && <a className="rfq-document-link" href={quote.bidBondDocumentUrl} target="_blank" rel="noreferrer"><FileText size={14} /> View bid bond document</a>}</Section>}
    {!!customFields.length && <Section title="Additional information" open><Fields fields={customFields} /></Section>}
    {categories.map(cat => <Section key={cat.id} title={cat.name}><Fields fields={cat.fields} /></Section>)}
    {!!quote.attachments?.length && <Section title={`Attachments (${quote.attachments.length})`} open><ul className="rfq-document-list">{quote.attachments.map((file, i) => <li key={file.id ?? i}>{safeDocumentUrl(file.publicUrl || file.url || file.fileUrl) ? <a className="rfq-document-link" href={file.publicUrl || file.url || file.fileUrl} target="_blank" rel="noreferrer"><FileText size={14} />{file.originalName || file.fileName || file.name || `Attachment ${i + 1}`}</a> : <span>{file.originalName || file.fileName || file.name || `Attachment ${i + 1}`}</span>}</li>)}</ul></Section>}
  </div>;
}
