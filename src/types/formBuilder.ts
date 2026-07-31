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

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  readOnly: boolean;
  defaultValue?: string;
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
