import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import QuotationDetails, { type QuotationRecord, type QuotationRequirements } from '../QuotationDetails';
const formatAmount = (value: number, currency: string) => `${currency} ${value}`;
const rfq: QuotationRequirements = { items: [{ id: 'a', name: 'Pump', description: 'Industrial pump', quantity: 2, unit: 'pcs' }] };
const render = (quote: QuotationRecord, requirements = rfq) => renderToStaticMarkup(<QuotationDetails quote={quote} rfq={requirements} formatAmount={formatAmount} />);

describe('read-only quotation and snapshot views', () => {
  it('renders prices, terms and quantities without form controls', () => {
    const html = render({ currency: 'KES', totalPrice: 40, leadTimeDays: 2, paymentTerms: 'Advance', items: [{ rfqItemId: 'a', unitPrice: 20, totalPrice: 40 }] });
    expect(html).toContain('KES 40'); expect(html).toContain('Pump'); expect(html).toContain('2 days');
    expect(html).not.toMatch(/<(input|textarea|select)\b/);
  });
  it('uses item ids when a historical quote has a different item order', () => {
    const html = render({ currency: 'KES', items: [{ rfqItemId: 'b', unitPrice: 30 }] }, { items: [...rfq.items, { id: 'b', name: 'Valve', quantity: 3 }] });
    expect(html).toContain('Valve'); expect(html).toContain('KES 90'); expect(html).not.toContain('Industrial pump');
  });
  it('never invents prices or dates when a historical value is missing', () => {
    const html = render({}); expect(html).not.toContain('KES'); expect(html).toContain('—');
  });
  it('renders custom milestones, zero values, evaluation answers, and security separately', () => {
    const html = render({ currency: 'KES', paymentPlanSnapshot: [{ title: 'Delivery', percentage: 60 }, { title: 'Inspection', percentage: 40 }], customFieldValues: { warranty: 0, eval_quality: 'ISO 9001' }, bidSecurityValue: 5, bidSecurityValueType: 'PERCENTAGE', bidSecurityIssuer: 'Bank', bidBondAmount: 300, bidBondNumber: 'B-123' }, { ...rfq, customFields: [{ id: 'warranty', fieldName: 'Warranty' }], evaluationCategories: [{ id: 'quality', name: 'Quality', subParameters: [{ id: 'quality', name: 'Certification' }] }] });
    for (const text of ['Delivery', '60%', 'Warranty', 'ISO 9001', '5%', 'KES 300', 'B-123']) expect(html).toContain(text);
    expect(html).not.toMatch(/<(input|textarea|select)\b/);
  });
  it('supports attachment public URLs and rejects executable links', () => {
    const html = render({ attachments: [{ originalName: 'terms.pdf', publicUrl: '/uploads/terms.pdf' }, { name: 'unsafe', url: 'javascript:alert(1)' }] });
    expect(html).toContain('href="/uploads/terms.pdf"'); expect(html).not.toContain('javascript:');
  });
  it('renders a large pricing matrix without dropping rows', () => {
    const html = render({ currency: 'KES', items: Array.from({ length: 250 }, (_, i) => ({ id: String(i), name: `Part ${i}`, quantity: 2, unitPrice: 5 })) });
    expect((html.match(/<tr>/g) || []).length).toBe(251); expect(html).toContain('Part 249');
  });
});
