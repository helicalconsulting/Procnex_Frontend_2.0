import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FormField } from '../../../types/formBuilder';
import { FormResponseFields } from '../FormResponseFields';

const field = (type: FormField['type'], overrides: Partial<FormField> = {}): FormField => ({
  id: 'answer', type, label: 'Answer', required: false, readOnly: false, width: 'half', ...overrides,
});
const render = (fields: FormField[], responseData?: Record<string, unknown> | null) =>
  renderToStaticMarkup(<FormResponseFields fields={fields} responseData={responseData}/>);

describe('submitted form answers', () => {
  it('renders the selected submission currency without an out-of-scope submission reference', () => {
    const fields = [field('currency', { currency: 'USD' })];
    expect(render(fields, { answer: 5, answer_currency: 'KES' })).toContain('KES 5.00');
    expect(render(fields, { answer: 12.5, answer_currency: 'EUR' })).toContain('EUR 12.50');
    expect(render(fields, { answer: 5 })).toContain('USD 5.00');
  });
  it('uses the same default currency as the form editor and preserves zero amounts', () => {
    expect(render([field('currency')], { answer: 0 })).toContain('KES 0.00');
    expect(render([field('currency')], { answer: '0' })).toContain('KES 0.00');
  });
  it('preserves invalid legacy amounts instead of printing NaN or crashing', () => {
    expect(render([field('currency')], { answer: 'Pending valuation' })).toContain('KES Pending valuation');
  });
  it('preserves false and numeric zero answers', () => {
    expect(render([field('checkbox')], { answer: false })).toContain('>No<');
    expect(render([field('checkbox')], { answer: true })).toContain('>Yes<');
    expect(render([field('number')], { answer: 0 })).toContain('>0<');
  });
  it('renders selected choices as answers, not attachments', () => {
    const html = render([field('multiselect')], { answer: ['Goods', 'Services'] });
    expect(html).toContain('Goods, Services');
    expect(html).not.toContain('File');
  });
  it.each([null, undefined, '', []])('identifies an unanswered value (%j)', value => {
    expect(render([field('text')], { answer: value })).toContain('Not answered');
  });
  it('handles absent response data and empty field definitions', () => {
    expect(render([field('text')], null)).toContain('Not answered');
    expect(render([])).toContain('No response fields are available.');
  });
  it('retains headings, explanatory text, dividers and full-width answers', () => {
    const html = render([
      field('heading', { id: 'h', content: 'Company information' }),
      field('paragraph', { id: 'p', content: 'Submitted business details.' }),
      field('divider', { id: 'd' }),
      field('textarea', { width: 'full' }),
    ], { answer: 'First line\nSecond line' });
    expect(html).toContain('Company information');
    expect(html).toContain('Submitted business details.');
    expect(html).toContain('<hr');
    expect(html).toContain('First line\nSecond line');
    expect(html).not.toContain('Not answered');
  });
  it('shows the recorded filename honestly when no file content was saved', () => {
    for (const value of ['certificate.png', { fileName: 'certificate.png', fileType: 'image/png' }]) {
      const html = render([field('file')], { answer: value });
      expect(html).toContain('certificate.png');
      expect(html).toContain('no file is available');
      expect(html).not.toContain('View File');
      expect(html).not.toContain('Download File');
      expect(html).not.toContain('<img');
    }
  });
  it.each(['image/png', 'application/pdf'])('offers available file actions for a saved %s attachment', fileType => {
    const src = `data:${fileType};base64,YQ==`;
    const html = render([field('file')], { answer: { fileName: 'document', fileType, fileDataUrl: src } });
    if (fileType === 'image/png') expect(html).toContain('View File');
    else expect(html).not.toContain('View File');
    expect(html).toContain(`href="${src}"`);
    expect(html).toContain('download="document"');
  });
  it.each(['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'])('retains downloads for %s files accepted by the form', fileType => {
    const src = `data:${fileType};base64,YQ==`;
    expect(render([field('file')], { answer: { fileName: 'document', fileType, fileDataUrl: src } })).toContain(`href="${src}"`);
  });
  it('renders a stored attachment URL but never treats a script URL as a file', () => {
    expect(render([field('file')], { answer: { fileName: 'report.pdf', url: '/uploads/report.pdf' } })).toContain('href="/uploads/report.pdf"');
    expect(render([field('file')], { answer: { fileName: 'report', url: 'javascript:alert(1)' } })).not.toContain('href=');
  });
});
