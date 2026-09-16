export function cleanDuplicateSignatures(html: string, buyerNameOverride?: string): string {
  if (!html) return html;

  let result = html;

  // Scope or replace global body/html/font CSS selectors inside <style> tags so they apply strictly to the document preview container and do not leak to the main application UI body font
  result = result.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, cssContent) => {
    const scopedCss = cssContent
      .replace(/(^|\}|\s)body\s*\{/gi, '$1.ctr-detail__doc-preview, .vcd-doc-content, .ctr-doc-preview-content {')
      .replace(/(^|\}|\s)html\s*\{/gi, '$1.ctr-detail__doc-preview, .vcd-doc-content, .ctr-doc-preview-content {')
      .replace(/(^|\}|\s)\*\s*\{/gi, '$1.ctr-detail__doc-preview *, .vcd-doc-content *, .ctr-doc-preview-content * {');
    return `<style>${scopedCss}</style>`;
  });

  // Safety fallback for naked body/html selector rules
  result = result
    .replace(/(^|\}|\s)body\s*\{/gi, '$1.ctr-detail__doc-preview, .vcd-doc-content, .ctr-doc-preview-content {')
    .replace(/(^|\}|\s)html\s*\{/gi, '$1.ctr-detail__doc-preview, .vcd-doc-content, .ctr-doc-preview-content {');

  // Remove any CSS border-top rules on signature lines
  result = result.replace(/border-top:\s*1px\s+solid\s+#[0-9a-fA-F]{3,6}/gi, 'border-top: none');

  // Check if contract has signature section (FOR THE BUYER or signature-block)
  const buyerHeaderIdx = result.search(/FOR THE BUYER/i);
  if (buyerHeaderIdx === -1) return result;

  // Extract Buyer Company Name from "FOR THE BUYER (Company)"
  let companyName = 'Buyer';
  const companyMatch = result.match(/FOR THE BUYER\s*\(([^)]+)\)/i);
  if (companyMatch && companyMatch[1]) {
    companyName = companyMatch[1];
  }

  // Extract Vendor Company Name from "FOR THE SUPPLIER (Company)"
  let vendorName = 'Supplier';
  const vendorMatch = result.match(/FOR THE SUPPLIER\s*\(([^)]+)\)/i);
  if (vendorMatch && vendorMatch[1]) {
    vendorName = vendorMatch[1];
  }

  // Split into pre-signature HTML and signature HTML
  const preSigHtml = result.substring(0, buyerHeaderIdx);
  const sigSectionHtml = result.substring(buyerHeaderIdx);

  const supplierIdx = sigSectionHtml.search(/FOR THE SUPPLIER/i);
  const buyerPart = supplierIdx !== -1 ? sigSectionHtml.substring(0, supplierIdx) : sigSectionHtml;
  const supplierPart = supplierIdx !== -1 ? sigSectionHtml.substring(supplierIdx) : '';

  // Extract Buyer Signature Image tag if exists
  let buyerImgHtml = '';
  const buyerImgMatch = buyerPart.match(/<img[^>]*>/i);
  if (buyerImgMatch) {
    buyerImgHtml = buyerImgMatch[0];
  }

  // Extract Supplier Signature Image tag if exists
  let supplierImgHtml = '';
  const supplierImgMatch = supplierPart.match(/<img[^>]*>/i);
  if (supplierImgMatch) {
    supplierImgHtml = supplierImgMatch[0];
  }

  // Extract Buyer Signer Name
  let buyerSignerName = buyerNameOverride || 'System Administrator';
  const buyerNameMatch = buyerPart.match(/Signed By:(?:<\/strong>)?\s*([^<\n\r]+)/i);
  if (buyerNameMatch && buyerNameMatch[1]) {
    const matched = buyerNameMatch[1].trim();
    if (matched && !matched.includes('___')) {
      buyerSignerName = matched;
    }
  }

  // Extract Date
  let dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const dateMatch = sigSectionHtml.match(/Date:(?:<\/strong>)?\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i);
  if (dateMatch && dateMatch[1]) {
    dateStr = dateMatch[1].trim();
  }

  // Extract Supplier Signer Name if vendor has signed
  let supplierSignerName = '___________________';
  const supplierNameMatch = supplierPart.match(/Signed By:(?:<\/strong>)?\s*([^<\n\r]+)/i);
  if (supplierNameMatch && supplierNameMatch[1]) {
    const matched = supplierNameMatch[1].trim();
    if (matched && !matched.includes('___') && matched !== 'System Administrator' && matched !== buyerSignerName) {
      supplierSignerName = matched;
    }
  }

  let supplierDateStr = '___________________';
  if (supplierSignerName !== '___________________' || supplierImgHtml) {
    supplierDateStr = dateStr;
  }

  // Reconstruct clean, line-free 2-column signature block
  const formattedSigBlock = `
<div class="signature-block" style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-start; clear: both;">
  <div class="signature-side" style="width: 45%; float: left;">
    <p style="margin: 0 0 12px 0;"><strong>FOR THE BUYER (${companyName})</strong></p>
    ${buyerImgHtml ? `<div style="margin: 8px 0;" data-sig-container="signedBy">${buyerImgHtml}</div>` : ''}
    <div style="margin-top: ${buyerImgHtml ? '8px' : '40px'}; font-size: 11pt; color: #1a1a1a;"><strong>Signed By:</strong> ${buyerSignerName}</div>
    <div style="margin-top: 4px; font-size: 11pt; color: #1a1a1a;"><strong>Date:</strong> ${dateStr}</div>
  </div>
  <div class="signature-side" style="width: 45%; float: right;">
    <p style="margin: 0 0 12px 0;"><strong>FOR THE SUPPLIER (${vendorName})</strong></p>
    ${supplierImgHtml ? `<div style="margin: 8px 0;" data-sig-container="signedFor">${supplierImgHtml}</div>` : ''}
    <div style="margin-top: ${supplierImgHtml ? '8px' : '40px'}; font-size: 11pt; color: #1a1a1a;"><strong>Signed By:</strong> ${supplierSignerName}</div>
    <div style="margin-top: 4px; font-size: 11pt; color: #1a1a1a;"><strong>Date:</strong> ${supplierDateStr}</div>
  </div>
  <div style="clear: both;"></div>
</div>
`;

  // Preserve any footer text
  let footerHtml = '\n<div class="footer" style="margin-top:40px;font-size:10pt;color:#666;text-align:center;border-top:1px solid #ccc;padding-top:12px;"><p>This document was generated electronically and is legally binding.</p></div>';
  if (result.includes('class="footer"') || result.includes('generated electronically')) {
    const footerMatch = result.match(/<div class="footer"[\s\S]*?<\/div>/i) || result.match(/<p[^>]*>This document was generated electronically[\s\S]*?<\/p>/i);
    if (footerMatch) {
      footerHtml = '\n' + footerMatch[0];
    }
  }

  // Strip existing signature block or footer from preSigHtml
  let cleanPreSig = preSigHtml
    .replace(/<div class="signature-block"[\s\S]*/i, '')
    .replace(/<\/body>[\s\S]*/i, '');

  return cleanPreSig + formattedSigBlock + footerHtml + '\n</body>\n</html>';
}
