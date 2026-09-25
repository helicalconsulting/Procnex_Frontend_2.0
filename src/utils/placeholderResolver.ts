/**
 * Heliflow — Universal Dynamic Placeholder Resolver & Metadata Engine
 * Handles click-to-insert placeholder metadata, dynamic branding binding,
 * and robust substitution for contracts & custom documents.
 */

export interface PlaceholderMeta {
  code: string;
  label: string;
  category: 'company' | 'vendor' | 'contract' | 'commercial' | 'signature' | 'custom';
  description: string;
  sampleValue: string;
  iconName?: string;
}

export const PLACEHOLDER_CATEGORIES = [
  { id: 'all', label: 'All Tags' },
  { id: 'company', label: '🏢 Company' },
  { id: 'vendor', label: '👤 Vendor' },
  { id: 'contract', label: '📜 Contract' },
  { id: 'commercial', label: '💰 Commercial' },
  { id: 'signature', label: '✍️ Signature' },
] as const;

export const ALL_PLACEHOLDERS: PlaceholderMeta[] = [
  // Company
  {
    code: '{{company_name}}',
    label: 'Company Name',
    category: 'company',
    description: 'Dynamic company name from Company Settings & Branding',
    sampleValue: 'Heliflow Consulting Pvt Ltd',
  },
  {
    code: '{{company_address}}',
    label: 'Company Address',
    category: 'company',
    description: 'Registered company office address',
    sampleValue: 'Suite 400, Innovation Tower, Nairobi, Kenya',
  },
  {
    code: '{{company_email}}',
    label: 'Company Email',
    category: 'company',
    description: 'Official corporate email',
    sampleValue: 'procurement@heliflow.com',
  },
  {
    code: '{{company_phone}}',
    label: 'Company Phone',
    category: 'company',
    description: 'Official company telephone number',
    sampleValue: '+254 700 000 000',
  },
  {
    code: '{{company_tax_id}}',
    label: 'Company Tax ID',
    category: 'company',
    description: 'Official GST / VAT / PIN tax identification number',
    sampleValue: 'P051239847Z',
  },

  // Vendor
  {
    code: '{{vendor_name}}',
    label: 'Vendor Name',
    category: 'vendor',
    description: 'Vendor supplier company name',
    sampleValue: 'Acme Global Supplies',
  },
  {
    code: '{{vendor_address}}',
    label: 'Vendor Address',
    category: 'vendor',
    description: 'Vendor supplier registered address',
    sampleValue: 'Industrial Area Phase 2, Nairobi',
  },
  {
    code: '{{vendor_email}}',
    label: 'Vendor Email',
    category: 'vendor',
    description: 'Vendor primary contact email',
    sampleValue: 'contact@acmeglobal.com',
  },
  {
    code: '{{vendor_contact}}',
    label: 'Vendor Contact Person',
    category: 'vendor',
    description: 'Vendor representative name',
    sampleValue: 'John Doe',
  },
  {
    code: '{{vendor_phone}}',
    label: 'Vendor Phone',
    category: 'vendor',
    description: 'Vendor phone contact',
    sampleValue: '+254 712 345 678',
  },

  // Contract Metadata
  {
    code: '{{contract_number}}',
    label: 'Contract Number',
    category: 'contract',
    description: 'Auto-generated unique contract reference number',
    sampleValue: 'CTR-2026-8842',
  },
  {
    code: '{{rfq_number}}',
    label: 'RFQ Number',
    category: 'contract',
    description: 'Associated Request For Quotation number',
    sampleValue: 'RFQ-2026-041',
  },
  {
    code: '{{effective_date}}',
    label: 'Effective Date',
    category: 'contract',
    description: 'Contract start / commencement date',
    sampleValue: new Date().toLocaleDateString('en-GB'),
  },
  {
    code: '{{expiry_date}}',
    label: 'Expiry Date',
    category: 'contract',
    description: 'Contract termination / expiry date',
    sampleValue: new Date(Date.now() + 365 * 86400000).toLocaleDateString('en-GB'),
  },
  {
    code: '{{created_date}}',
    label: 'Creation Date',
    category: 'contract',
    description: 'Document generation timestamp',
    sampleValue: new Date().toLocaleDateString('en-GB'),
  },

  // Commercial Terms
  {
    code: '{{contract_value}}',
    label: 'Contract Value',
    category: 'commercial',
    description: 'Total numerical contract monetary value',
    sampleValue: 'KES 1,500,000.00',
  },
  {
    code: '{{currency}}',
    label: 'Currency',
    category: 'commercial',
    description: 'Contract currency code (e.g. KES, USD, INR)',
    sampleValue: 'KES',
  },
  {
    code: '{{payment_terms}}',
    label: 'Payment Terms',
    category: 'commercial',
    description: 'Stipulated payment schedule and credit terms',
    sampleValue: 'Net 30 Days upon invoice receipt',
  },
  {
    code: '{{delivery_terms}}',
    label: 'Delivery Terms',
    category: 'commercial',
    description: 'Shipping and delivery terms (e.g. FOB Destination)',
    sampleValue: 'FOB Destination - Free Delivery',
  },

  // Signatures
  {
    code: '{{companySignature}}',
    label: 'Company Signature',
    category: 'signature',
    description: 'Official company drawn/uploaded signature image block',
    sampleValue: '[Company Signature Embedded]',
  },
  {
    code: '{{company_signature}}',
    label: 'Company Signature (Alt)',
    category: 'signature',
    description: 'Official company drawn/uploaded signature image block',
    sampleValue: '[Company Signature Embedded]',
  },
  {
    code: '{{vendor_signature}}',
    label: 'Vendor Signature',
    category: 'signature',
    description: 'Vendor authorized signee signature image block',
    sampleValue: '[Vendor Signature Embedded]',
  },
];

export interface ResolverContext {
  companyName?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyTaxId?: string;
  companySignatureUrl?: string;

  vendorName?: string;
  vendorAddress?: string;
  vendorEmail?: string;
  vendorContact?: string;
  vendorPhone?: string;
  vendorSignatureUrl?: string;

  contractNumber?: string;
  rfqNumber?: string;
  effectiveDate?: string;
  expiryDate?: string;
  createdDate?: string;

  contractValue?: number | string;
  currency?: string;
  paymentTerms?: string;
  deliveryTerms?: string;

  customData?: Record<string, string>;
}

/**
 * Universal resolution function: Replaces standard tags and any custom {{var}} in content HTML/Text
 */
export function resolvePlaceholders(templateText: string, context: ResolverContext): string {
  if (!templateText) return '';

  let result = templateText;

  const defaultCurrency = context.currency || 'KES';
  const rawValue = context.contractValue;
  const formattedValue =
    typeof rawValue === 'number'
      ? `${defaultCurrency} ${rawValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : String(rawValue || `${defaultCurrency} 0.00`);

  // Build standard replacement map
  const replacements: Record<string, string> = {
    '{{company_name}}': context.companyName || 'Procnex Consulting',
    '{{company_address}}': context.companyAddress || 'Central Headquarters',
    '{{company_email}}': context.companyEmail || 'procurement@procnex.com',
    '{{company_phone}}': context.companyPhone || '+254 700 000 000',
    '{{company_tax_id}}': context.companyTaxId || 'TAX-PROCNEX-01',

    '{{vendor_name}}': context.vendorName || 'Selected Vendor',
    '{{vendor_address}}': context.vendorAddress || 'Vendor Premises',
    '{{vendor_email}}': context.vendorEmail || 'vendor@supplier.com',
    '{{vendor_contact}}': context.vendorContact || 'Vendor Representative',
    '{{vendor_phone}}': context.vendorPhone || 'N/A',

    '{{contract_number}}': context.contractNumber || 'CTR-DRAFT',
    '{{rfq_number}}': context.rfqNumber || 'RFQ-DIRECT',
    '{{effective_date}}': context.effectiveDate || new Date().toLocaleDateString('en-GB'),
    '{{expiry_date}}': context.expiryDate || new Date(Date.now() + 365 * 86400000).toLocaleDateString('en-GB'),
    '{{created_date}}': context.createdDate || new Date().toLocaleDateString('en-GB'),

    '{{contract_value}}': formattedValue,
    '{{currency}}': defaultCurrency,
    '{{payment_terms}}': context.paymentTerms || 'Net 30',
    '{{delivery_terms}}': context.deliveryTerms || 'FOB Destination',
  };

  // Signatures replacement with HTML img blocks or styled signature badges
  const companySigHtml = context.companySignatureUrl
    ? `<div style="display:inline-block; margin-top:8px; text-align:left;">
        <img src="${context.companySignatureUrl}" alt="Company Signature" style="max-height:60px; max-width:180px; object-fit:contain; border-bottom:1px solid #0a6ed1; padding-bottom:4px;" />
        <div style="font-size:11px; color:#64748b; margin-top:2px;">Digitally Signed by ${context.companyName || 'Authorized Signatory'}</div>
       </div>`
    : `<div style="display:inline-block; padding:8px 16px; border:1px dashed #cbd5e1; border-radius:6px; background:#f8fafc; font-size:12px; color:#64748b;">
        ✍️ [Company Signature Pending]
       </div>`;

  const vendorSigHtml = context.vendorSignatureUrl
    ? `<div style="display:inline-block; margin-top:8px; text-align:left;">
        <img src="${context.vendorSignatureUrl}" alt="Vendor Signature" style="max-height:60px; max-width:180px; object-fit:contain; border-bottom:1px solid #10b981; padding-bottom:4px;" />
        <div style="font-size:11px; color:#64748b; margin-top:2px;">Digitally Signed by ${context.vendorName || 'Authorized Representative'}</div>
       </div>`
    : `<div style="display:inline-block; padding:8px 16px; border:1px dashed #cbd5e1; border-radius:6px; background:#f8fafc; font-size:12px; color:#64748b;">
        ✍️ [Vendor Signature Pending]
       </div>`;

  replacements['{{companySignature}}'] = companySigHtml;
  replacements['{{company_signature}}'] = companySigHtml;
  replacements['{{vendor_signature}}'] = vendorSigHtml;

  // Apply custom context variables if provided
  if (context.customData) {
    Object.entries(context.customData).forEach(([key, val]) => {
      const tag = key.startsWith('{{') ? key : `{{${key}}}`;
      replacements[tag] = val;
    });
  }

  // Replace all keys
  Object.entries(replacements).forEach(([key, value]) => {
    // Regex escape
    const escapedKey = key.replace(/[{}]/g, '\\$&');
    result = result.replace(new RegExp(escapedKey, 'g'), value);
  });

  return result;
}
