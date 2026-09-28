import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import QuotationPaymentTerms, { type PaymentMilestone } from '../QuotationPaymentTerms';
const render = (terms: string | null, milestones?: PaymentMilestone[] | null) => renderToStaticMarkup(<QuotationPaymentTerms terms={terms} milestones={milestones} totalPrice={40} currency="KES" formatAmount={(n, c) => `${c} ${n}`} />);
describe('submitted payment terms', () => {
  it('shows a standard term with quotation context and no invented allocation', () => {
    const html = render('Advance');
    for (const text of ['Advance', 'KES 40', 'No milestone breakdown']) expect(html).toContain(text);
    expect(html).not.toContain('<table'); expect(html).not.toContain('100%');
  });
  it('renders a named plan without snapshot rows without guessing a schedule', () => {
    const html = render('MY PLAN', []);
    expect(html).toContain('MY PLAN'); expect(html).toContain('No milestone percentages were included'); expect(html).not.toContain('<table');
  });
  it('renders the submitted milestones, total, and calculated amounts', () => {
    const html = render('MY PLAN', [{title: 'Initially', percentage: 20}, {title: 'After purchase order', percentage: 40}, {title: 'After delivery', percentage: 40}]);
    for (const text of ['Initially', 'After purchase order', 'After delivery', '20%', '40%', '100%', 'KES 8', 'KES 16']) expect(html).toContain(text);
  });
  it.each([null, '', '—'])('explains absent terms %j', terms => {
    const html = render(terms); expect(html).toContain('Payment terms not recorded'); expect(html).not.toContain('undefined');
  });
  it('keeps historical incomplete allocations visible and flags the actual total', () => {
    const html = render('Old plan', [{title: 'Deposit', percentage: 20}, {title: 'Delivery', percentage: 70}]);
    expect(html).toContain('90%'); expect(html).toContain('does not contain a complete'); expect(html).not.toContain('quotation-allocation--complete');
  });
  it('does not print NaN or negative amounts for invalid historical percentages', () => {
    const html = render('Old plan', [{title: '', percentage: NaN}, {title: 'Delivery', percentage: -10}]);
    expect(html).toContain('Milestone 1'); expect(html).toContain('Not recorded'); expect(html).not.toContain('NaN'); expect(html).not.toContain('KES -4');
  });
  it('supports a historical single-milestone plan without changing submitted data', () => {
    const html = render('Legacy', [{title: 'Delivery', percentage: 100}]);
    expect(html).toContain('100%'); expect(html).not.toContain('does not contain a complete');
  });
});
