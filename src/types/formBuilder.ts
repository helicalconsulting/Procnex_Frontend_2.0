export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'dropdown'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'signature'
  | 'currency'
  | 'divider'
  | 'heading'
  | 'paragraph'
  | 'user_picker'
  | 'vendor_picker';

export interface FieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  customError?: string;
}

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCY_LIST: CurrencyOption[] = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'INR', symbol: '₹', label: 'INR (₹)' },
  { code: 'KES', symbol: 'KSh', label: 'KES (KSh)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'AED', symbol: 'AED', label: 'AED (AED)' },
  { code: 'SAR', symbol: 'SAR', label: 'SAR (SAR)' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
];

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  readOnly: boolean;
  defaultValue?: string;
  currency?: string;
  validation?: FieldValidation;
  width: 'full' | 'half';
  helpText?: string;
  options?: string[];
  content?: string; // For heading / paragraph
}

export interface FormDefinition {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'published';
  approvalConfigured?: boolean;
}

export interface PaletteCategory {
  category: string;
  items: {
    type: FieldType;
    label: string;
    icon: string; // Lucide icon name or indicator
    description: string;
    defaultConfig: Partial<FormField>;
  }[];
}
