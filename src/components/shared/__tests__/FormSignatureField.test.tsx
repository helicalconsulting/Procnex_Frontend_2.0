import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormSignatureField } from '../FormSignatureField';

describe('FormSignatureField component', () => {
  it('renders interactive drawing pad when no value is provided', () => {
    const html = renderToStaticMarkup(
      <FormSignatureField id="sig1" label="Authorised Signature" />
    );
    expect(html).toContain('fsig-container');
    expect(html).toContain('Draw');
    expect(html).toContain('Type');
    expect(html).toContain('Upload');
    expect(html).toContain('fsig-canvas');
    expect(html).toContain('Sign here using your mouse');
  });

  it('renders captured signature image and Digitally Signed badge when value is an image dataUrl', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAA=';
    const html = renderToStaticMarkup(
      <FormSignatureField id="sig2" label="Authorised Signature" value={dataUrl} />
    );
    expect(html).toContain('fsig-preview-card');
    expect(html).toContain('<img');
    expect(html).toContain(`src="${dataUrl}"`);
    expect(html).toContain('Digitally Signed');
    expect(html).toContain('Change / Re-sign');
  });

  it('renders legacy typed text signature when value is plain text', () => {
    const html = renderToStaticMarkup(
      <FormSignatureField id="sig3" label="Authorised Signature" value="Khushi Singhal" />
    );
    expect(html).toContain('fsig-preview-card');
    expect(html).toContain('Khushi Singhal');
    expect(html).toContain('Digitally Signed');
    expect(html).toContain('Change / Re-sign');
  });

  it('renders clean locked/read-only view without edit controls when readOnly is true', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAA=';
    const html = renderToStaticMarkup(
      <FormSignatureField id="sig4" label="Authorised Signature" value={dataUrl} readOnly={true} />
    );
    expect(html).toContain('fsig-preview-card');
    expect(html).toContain('Digitally Signed');
    expect(html).not.toContain('Change / Re-sign');
  });

  it('renders locked empty state when readOnly and no signature value is present', () => {
    const html = renderToStaticMarkup(
      <FormSignatureField id="sig5" label="Authorised Signature" value="" readOnly={true} />
    );
    expect(html).toContain('No signature provided');
    expect(html).not.toContain('fsig-canvas');
  });
});
