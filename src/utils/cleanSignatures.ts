import { readCachedProfile } from '../lib/branding';

export interface ContractPlaceholderContext {
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyTaxId?: string;
  vendorAddress?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorContact?: string;
}

const isPhoneNumber = (s?: string | null): boolean => !!s && /^\+?[0-9\s-]{7,15}$/.test(s.trim());

export function cleanDuplicateSignatures(
  html: string,
  buyerNameOverride?: string,
  companyAddressOverride?: string | ContractPlaceholderContext
): string {
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

  // ── Clean redundant duplicate headers & subtitles ──
  // 1. Remove duplicate consecutive <h1> tags or duplicate title wrappers
  result = result.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)\s*(?:<div[^>]*>)?\s*<h1[^>]*>[\s\S]*?<\/h1>(?:\s*<\/div>)?/gi, '$1');

  // 2. Remove outer centered header container if immediately followed by <h1>
  result = result.replace(/<div[^>]*text-align:\s*center[^>]*>\s*<h[12][^>]*>[\s\S]*?<\/h[12]>\s*(?:<p[^>]*>[\s\S]*?<\/p>\s*)?<\/div>\s*(?=<h1)/gi, '');

  // 3. Remove duplicate Contract No lines
  result = result.replace(/(<p[^>]*>\s*Contract No:[^<]+<\/p>)\s*<p[^>]*>\s*Contract No:[^<]+<\/p>/gi, '$1');

  // 4. Resolve date placeholders if unreplaced
  const todayFormatted = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  result = result.replace(/\{\{currentDate\}\}/gi, todayFormatted)
                 .replace(/\{\{current_date\}\}/gi, todayFormatted)
                 .replace(/\{\{created_date\}\}/gi, todayFormatted)
                 .replace(/\{\{createdDate\}\}/gi, todayFormatted);

  // 5. Resolve Buyer & Supplier details and placeholders
  const ctx: ContractPlaceholderContext =
    typeof companyAddressOverride === 'string'
      ? { companyAddress: companyAddressOverride }
      : (companyAddressOverride || {});

  const cachedProfile = readCachedProfile();
  const cachedAddress = [
    cachedProfile?.companyAddress,
    cachedProfile?.companyCity,
    cachedProfile?.companyState,
    cachedProfile?.companyCountry,
  ].filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(', ');

  const compAddr = (
    ctx.companyAddress ||
    cachedAddress ||
    cachedProfile?.companyAddress ||
    ''
  ).trim();

  const compEmail = (
    ctx.companyEmail ||
    cachedProfile?.companyEmail ||
    cachedProfile?.supportEmail ||
    ''
  ).trim();

  const compPhone = (
    ctx.companyPhone ||
    cachedProfile?.companyPhone ||
    ''
  ).trim();

  const compTaxId = (
    ctx.companyTaxId ||
    cachedProfile?.taxRegistrationNumber ||
    ''
  ).trim();

  const vendAddr = (ctx.vendorAddress || '').trim();
  const vendEmail = (ctx.vendorEmail || '').trim();
  const vendPhone = (ctx.vendorPhone || '').trim();
  const vendContact = (ctx.vendorContact || '').trim();

  const finalVendPhone = vendPhone || (isPhoneNumber(vendContact) ? vendContact : '');

  result = result
    .replace(/\{\{\s*(?:company_email|companyEmail)\s*\}\}/gi, compEmail || '—')
    .replace(/\{\{\s*(?:company_phone|companyPhone)\s*\}\}/gi, compPhone || '—')
    .replace(/\{\{\s*(?:company_tax_id|companyTaxId|company_tax_number|companyTaxNumber)\s*\}\}/gi, compTaxId || '—')
    .replace(/\{\{\s*(?:vendor_phone|vendorPhone)\s*\}\}/gi, finalVendPhone || '—')
    .replace(/\{\{\s*(?:vendor_email|vendorEmail)\s*\}\}/gi, vendEmail || '—')
    .replace(/\{\{\s*(?:vendor_address|vendorAddress)\s*\}\}/gi, vendAddr || '—')
    .replace(/\{\{\s*(?:vendor_contact|vendorContact)\s*\}\}/gi, vendContact || '—');

  // Buyer Address replacement in Parties or Buyer/Client section
  if (compAddr) {
    result = result
      .replace(/\{\{\s*(?:company_address|companyAddress)\s*\}\}/gi, compAddr)
      .replace(
        /((?:BUYER|CLIENT)[\s\S]*?Address:\s*)(?:&nbsp;|\s)*(?:—|-|&mdash;|&#8212;)?(?:&nbsp;|\s)*(<br\s*\/?>|<\/(?:p|div|span|td)>)/i,
        `$1${compAddr}$2`
      )
      .replace(
        /(<strong>\s*Buyer[^:]*:\s*<\/strong>[\s\S]*?<strong>\s*Address:\s*<\/strong>\s*)(?:&nbsp;|\s)*(?:—|-|&mdash;|&#8212;)?(?:&nbsp;|\s)*(<\/(?:p|div|span|td)>|<br\s*\/?>)/i,
        `$1${compAddr}$2`
      );
  }

  // Vendor Address replacement in Parties or Supplier/Vendor section
  if (vendAddr && vendAddr !== '—') {
    result = result
      .replace(
        /((?:SUPPLIER|VENDOR)[\s\S]*?Address:\s*)(?:&nbsp;|\s)*(?:—|-|&mdash;|&#8212;)?(?:&nbsp;|\s)*(<br\s*\/?>|<\/(?:p|div|span|td)>)/i,
        `$1${vendAddr}$2`
      )
      .replace(
        /(<strong>\s*Supplier[^:]*:\s*<\/strong>[\s\S]*?<strong>\s*Address:\s*<\/strong>\s*)(?:&nbsp;|\s)*(?:—|-|&mdash;|&#8212;)?(?:&nbsp;|\s)*(<\/(?:p|div|span|td)>|<br\s*\/?>)/i,
        `$1${vendAddr}$2`
      );
  }

  // Check if contract has signature section (FOR THE BUYER or signature-block)
  const buyerHeaderIdx = result.search(/FOR THE BUYER/i);
  if (buyerHeaderIdx === -1) return result;

  // Split into pre-signature HTML and signature HTML
  const preSigHtml = result.substring(0, buyerHeaderIdx);
  const sigSectionHtml = result.substring(buyerHeaderIdx);

  // Extract Buyer Company Name from "FOR THE BUYER (Company)"
  let companyName = 'Buyer';
  const companyMatch = result.match(/FOR THE BUYER\s*\(([^)]+)\)/i);
  if (companyMatch && companyMatch[1]) {
    companyName = companyMatch[1].trim();
  }
  if (companyName === 'Buyer' || companyName === 'CUSTOMER') {
    const docCompanyMatch = preSigHtml.match(/(?:Company Name|Company):\s*(?:<[^>]+>)?\s*([^<\n\r]+)/i);
    if (docCompanyMatch && docCompanyMatch[1]) {
      const c = docCompanyMatch[1].trim();
      if (c && !c.includes('___')) companyName = c;
    }
  }

  // Extract Vendor Company Name from "FOR THE SUPPLIER (Company)"
  let vendorName = 'Supplier';
  const vendorMatch = result.match(/FOR THE SUPPLIER\s*\(([^)]+)\)/i);
  if (vendorMatch && vendorMatch[1]) {
    vendorName = vendorMatch[1].trim();
  }
  if (vendorName === 'Supplier' || vendorName === 'VENDOR' || isPhoneNumber(vendorName)) {
    const docVendorMatch = preSigHtml.match(/(?:Vendor Name|Vendor):\s*(?:<[^>]+>)?\s*([^<\n\r]+)/i);
    if (docVendorMatch && docVendorMatch[1]) {
      const v = docVendorMatch[1].trim();
      if (v && !v.includes('___') && !isPhoneNumber(v)) vendorName = v;
    }
  }

  const supplierIdx = sigSectionHtml.search(/FOR THE SUPPLIER/i);
  const buyerPart = supplierIdx !== -1 ? sigSectionHtml.substring(0, supplierIdx) : sigSectionHtml;
  const supplierPart = supplierIdx !== -1 ? sigSectionHtml.substring(supplierIdx) : '';

  // Extract Buyer Signature Image tag if exists
  let buyerImgHtml = '';
  const buyerImgMatch = buyerPart.match(/<img[^>]*>/i);
  if (buyerImgMatch) {
    buyerImgHtml = buyerImgMatch[0];
  } else {
    // Check in preSigHtml for buyer signature image
    const preBuyerMatch = preSigHtml.match(/<img[^>]*(?:alt="Company Signature"|data-sig-container="signedBy"|heliflow\/contract-signatures\/[^"]+-buyer-)[^>]*>/i);
    if (preBuyerMatch) {
      buyerImgHtml = preBuyerMatch[0];
    }
  }

  // Extract Supplier Signature Image tag if exists
  let supplierImgHtml = '';
  const supplierImgMatch = supplierPart.match(/<img[^>]*>/i);
  if (supplierImgMatch) {
    supplierImgHtml = supplierImgMatch[0];
  } else {
    // Check in preSigHtml for vendor signature image
    const preSupplierMatch = preSigHtml.match(/<img[^>]*(?:alt="Vendor Signature"|alt="Supplier Signature"|data-sig-container="signedFor"|heliflow\/contract-signatures\/[^"]+-vendor-)[^>]*>/i);
    if (preSupplierMatch) {
      supplierImgHtml = preSupplierMatch[0];
    }
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
  if (buyerSignerName === 'System Administrator' || buyerSignerName === '___________________') {
    const preBuyerName = preSigHtml.match(/(?:For (?:&amp;|&) on behalf of the Buyer|For the Company)[\s\S]*?(?:Name|Authorized Signatory|Signed By):\s*(?:<[^>]+>)?\s*([^<\n\r]+)/i);
    if (preBuyerName && preBuyerName[1]) {
      const bname = preBuyerName[1].trim();
      if (bname && !bname.includes('___')) {
        buyerSignerName = bname;
      }
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
    if (matched && !matched.includes('___') && matched !== 'System Administrator' && matched !== buyerSignerName && !isPhoneNumber(matched)) {
      supplierSignerName = matched;
    }
  }
  // If still placeholder or phone number, extract vendor company name or signatory from preSigHtml
  if (supplierSignerName === '___________________' || isPhoneNumber(supplierSignerName)) {
    const docVendorName = preSigHtml.match(/(?:Vendor Name|Vendor):\s*(?:<[^>]+>)?\s*([^<\n\r]+)/i);
    const signatoryMatch = preSigHtml.match(/(?:Vendor Signatory|Contact Person):\s*(?:<[^>]+>)?\s*([^<\n\r]+)/i);
    const repMatch = preSigHtml.match(/Authorized Representative:\s*(?:<[^>]+>)?\s*([^<\n\r]+)/i);

    if (docVendorName && docVendorName[1] && !isPhoneNumber(docVendorName[1])) {
      supplierSignerName = docVendorName[1].trim();
    } else if (signatoryMatch && signatoryMatch[1] && !isPhoneNumber(signatoryMatch[1])) {
      supplierSignerName = signatoryMatch[1].trim();
    } else if (repMatch && repMatch[1] && !isPhoneNumber(repMatch[1])) {
      supplierSignerName = repMatch[1].trim();
    } else if (vendorName && vendorName !== 'Supplier' && vendorName !== 'VENDOR' && !isPhoneNumber(vendorName)) {
      supplierSignerName = vendorName;
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

  // Strip existing signature block or footer from preSigHtml, plus any misplaced in-body signature images
  let cleanPreSig = preSigHtml
    .replace(/<div class="signature-block"[\s\S]*/i, '')
    .replace(/<\/body>[\s\S]*/i, '')
    // Clean up misplaced signature containers and images from body
    .replace(/<div[^>]*data-sig-container="(?:signedBy|signedFor)"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<img[^>]*(?:alt="Vendor Signature"|alt="Company Signature"|heliflow\/contract-signatures)[^>]*>/gi, '')
    // Clean up empty signature labels in preSigHtml that had images placed in them
    .replace(/Signature:&nbsp;<span[^>]*>\s*<\/span>/gi, '')
    .replace(/<p[^>]*>\s*Signature:\s*(?:&nbsp;)?\s*<\/p>/gi, '')
    .replace(/<p[^>]*>\s*Authorized Signature:\s*(?:&nbsp;)?\s*<\/p>/gi, '')
    // Clean up raw unreplaced signature tags
    .replace(/\{\{\s*(?:vendor_signature|company_signature|companySignature|vendorSignature)\s*\}\}/gi, '');

  return cleanPreSig + formattedSigBlock + footerHtml + '\n</body>\n</html>';
}
