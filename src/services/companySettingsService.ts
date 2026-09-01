import { USE_MOCK } from '../config/mock';
import { apiRequest, API_BASE, ApiError } from '../api/client';

export interface Department {
  id: string;
  companyCode: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  categories?: Category[];
}

export interface Position {
  id: string;
  companyCode: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  companyCode: string;
  name: string;
  abbreviation?: string;
  aliases?: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  companyCode: string;
  departmentId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  department?: { id: string; name: string };
}

// ─── Mock Data ──────────────────────────────────────────────

const MOCK_DEPARTMENTS: Department[] = [];
const MOCK_CATEGORIES: Category[] = [];

// ─── Service ────────────────────────────────────────────────

async function mockListDepartments(): Promise<Department[]> {
  await new Promise((r) => setTimeout(r, 200));
  return MOCK_DEPARTMENTS;
}

async function apiListDepartments(): Promise<Department[]> {
  const data = await apiRequest<{ departments: Department[] }>('/company-settings/departments', { cacheTtlMs: 60000 });
  return data.departments || [];
}

async function mockListCategories(departmentId?: string): Promise<Category[]> {
  await new Promise((r) => setTimeout(r, 200));
  if (departmentId) return MOCK_CATEGORIES.filter((c) => c.departmentId === departmentId);
  return MOCK_CATEGORIES;
}

async function apiListCategories(departmentId?: string): Promise<Category[]> {
  const query = departmentId ? `?departmentId=${departmentId}` : '';
  const data = await apiRequest<{ categories: Category[] }>(`/company-settings/categories${query}`, { cacheTtlMs: 60000 });
  return data.categories || [];
}

// ─── Create/Update/Delete ─────────────────────────────────

async function mockCreateDepartment(name: string, description?: string): Promise<Department> {
  await new Promise((r) => setTimeout(r, 200));
  const newDept: Department = {
    id: String(Date.now()),
    companyCode: 'HFL',
    name,
    description: description || null,
    isActive: true,
    createdBy: String(Date.now()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  MOCK_DEPARTMENTS.push(newDept);
  return newDept;
}

async function apiCreateDepartment(name: string, description?: string): Promise<Department> {
  return apiRequest<Department>('/company-settings/departments', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

async function mockUpdateDepartment(id: string, data: { name?: string; description?: string; isActive?: boolean }): Promise<Department> {
  await new Promise((r) => setTimeout(r, 200));
  const idx = MOCK_DEPARTMENTS.findIndex((d) => d.id === id);
  if (idx === -1) throw new Error('Department not found');
  MOCK_DEPARTMENTS[idx] = { ...MOCK_DEPARTMENTS[idx], ...data };
  return MOCK_DEPARTMENTS[idx];
}

async function apiUpdateDepartment(id: string, data: { name?: string; description?: string; isActive?: boolean }): Promise<Department> {
  return apiRequest<Department>(`/company-settings/departments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function mockCreateCategory(departmentId: string, name: string, description?: string): Promise<Category> {
  await new Promise((r) => setTimeout(r, 200));
  const dept = MOCK_DEPARTMENTS.find((d) => d.id === departmentId);
  const newCat: Category = {
    id: String(Date.now()),
    companyCode: 'HFL',
    departmentId,
    name,
    description: description || null,
    isActive: true,
    createdBy: String(Date.now()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    department: dept ? { id: dept.id, name: dept.name } : undefined,
  };
  MOCK_CATEGORIES.push(newCat);
  return newCat;
}

async function apiCreateCategory(departmentId: string, name: string, description?: string): Promise<Category> {
  return apiRequest<Category>('/company-settings/categories', {
    method: 'POST',
    body: JSON.stringify({ departmentId, name, description }),
  });
}

async function mockUpdateCategory(id: string, data: { departmentId?: string; name?: string; description?: string; isActive?: boolean }): Promise<Category> {
  await new Promise((r) => setTimeout(r, 200));
  const idx = MOCK_CATEGORIES.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error('Category not found');
  MOCK_CATEGORIES[idx] = { ...MOCK_CATEGORIES[idx], ...data };
  if (data.departmentId) {
    const dept = MOCK_DEPARTMENTS.find((d) => d.id === data.departmentId);
    if (dept) MOCK_CATEGORIES[idx].department = { id: dept.id, name: dept.name };
  }
  return MOCK_CATEGORIES[idx];
}

async function apiUpdateCategory(id: string, data: { departmentId?: string; name?: string; description?: string; isActive?: boolean }): Promise<Category> {
  return apiRequest<Category>(`/company-settings/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Positions mock/API ─────────────────────────────────────

const MOCK_POSITIONS: Position[] = [];

async function mockListPositions(): Promise<Position[]> {
  await new Promise((r) => setTimeout(r, 150));
  return [...MOCK_POSITIONS];
}

async function apiListPositions(): Promise<Position[]> {
  const data = await apiRequest<{ positions: Position[] }>('/company-settings/positions', { cacheTtlMs: 60000 });
  return data.positions || [];
}

async function mockCreatePosition(name: string, description?: string): Promise<Position> {
  await new Promise((r) => setTimeout(r, 200));
  const position: Position = {
    id: String(Date.now()),
    companyCode: 'HFL',
    name,
    description: description || null,
    isActive: true,
    createdBy: String(Date.now()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  MOCK_POSITIONS.push(position);
  return position;
}

async function apiCreatePosition(name: string, description?: string): Promise<Position> {
  return apiRequest<Position>('/company-settings/positions', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

async function mockDeletePosition(id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
  const idx = MOCK_POSITIONS.findIndex((p) => p.id === id);
  if (idx >= 0) MOCK_POSITIONS.splice(idx, 1);
}

async function apiDeletePosition(id: string): Promise<void> {
  await apiRequest(`/company-settings/positions/${id}`, { method: 'DELETE' });
}

// ─── Company Profile ───────────────────────────────────

export interface CompanyProfile {
  id: string;
  companyCode: string;
  defaultCurrency: string;
  invitationExpiryHours: number;
  resubmissionDeadlineHours: number;
  createdAt: string;
  updatedAt: string;
  // White Label / Branding fields
  companyName?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  loginText?: string | null;
  supportEmail?: string | null;
  primaryPortalName?: string | null;
  requireNdaMnda?: boolean;
}

export interface UpdateBrandingPayload {
  companyName?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  loginText?: string;
  supportEmail?: string;
  primaryPortalName?: string;
}

async function mockGetCompanyProfile(): Promise<CompanyProfile> {
  await new Promise((r) => setTimeout(r, 200));
  return {
    id: '1', companyCode: 'HFL', defaultCurrency: 'KES',
    invitationExpiryHours: 168, resubmissionDeadlineHours: 72,
    createdAt: '', updatedAt: '',
    companyName: null, logoUrl: '/Procnex-logo.jpeg', faviconUrl: '/Procnex-logo.jpeg',
    primaryColor: '#0a6ed1', loginText: null, supportEmail: null,
  };
}

/**
 * Try authenticated profile first. If 401 (stale/invalid token),
 * fall back to the public endpoint (no auth required).
 * Company code defaults to 'HFL' for the public endpoint.
 */
async function apiGetCompanyProfile(): Promise<CompanyProfile> {
  const token = localStorage.getItem('heliflow_token');
  
  // If no token at all, go straight to public endpoint
  if (!token) {
    return apiGetPublicCompanyProfile();
  }
  
  // Try authenticated endpoint first
  try {
    const data = await apiRequest<{ profile: CompanyProfile }>('/company-settings/profile', { cacheTtlMs: 120000 });
    return data.profile;
  } catch (err) {
    // On 401 (stale token), use public endpoint instead
    if (err instanceof ApiError && err.status === 401) {
      localStorage.removeItem('heliflow_token'); // Clear stale token silently
      return apiGetPublicCompanyProfile();
    }
    throw err;
  }
}

/**
 * Public endpoint — no auth required. Always returns profile data.
 * Never throws 401 errors.
 */
async function apiGetPublicCompanyProfile(): Promise<CompanyProfile> {
  const data = await apiRequest<{ profile: CompanyProfile }>('/company-settings/profile/public?companyCode=HFL', { cacheTtlMs: 300000 });
  return data.profile;
}

async function mockGetDefaultCurrency(): Promise<string> {
  await new Promise((r) => setTimeout(r, 200));
  return 'KES';
}

async function apiGetDefaultCurrency(): Promise<string> {
  try {
    const data = await apiRequest<{ defaultCurrency: string }>('/company-settings/default-currency', { cacheTtlMs: 60000 });
    return data.defaultCurrency || 'KES';
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[CompanySettings] Auth required for default-currency — falling back to KES');
      return 'KES';
    }
    throw err;
  }
}

type UpdateCompanyProfilePayload = {
  defaultCurrency?: string;
  invitationExpiryHours?: number;
  resubmissionDeadlineHours?: number;
  requireNdaMnda?: boolean;
} & UpdateBrandingPayload;

async function mockUpdateCompanyProfile(payload: UpdateCompanyProfilePayload): Promise<CompanyProfile> {
  await new Promise((r) => setTimeout(r, 200));
  return {
    id: '1',
    companyCode: 'HFL',
    defaultCurrency: payload.defaultCurrency || 'KES',
    invitationExpiryHours: payload.invitationExpiryHours ?? 168,
    resubmissionDeadlineHours: payload.resubmissionDeadlineHours ?? 72,
    createdAt: '',
    updatedAt: '',
    companyName: payload.companyName || null,
    logoUrl: payload.logoUrl || null,
    faviconUrl: payload.faviconUrl || null,
    primaryColor: payload.primaryColor || '#0a6ed1',
    loginText: payload.loginText || null,
    supportEmail: payload.supportEmail || null,
  };
}

async function apiUpdateCompanyProfile(payload: UpdateCompanyProfilePayload): Promise<CompanyProfile> {
  const data = await apiRequest<{ profile: CompanyProfile }>('/company-settings/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return data.profile;
}

// ─── Delete ─────────────────────────────────────────────────

async function mockDeleteDepartment(id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  const idx = MOCK_DEPARTMENTS.findIndex((d) => d.id === id);
  if (idx >= 0) MOCK_DEPARTMENTS.splice(idx, 1);
}

async function apiDeleteDepartment(id: string): Promise<void> {
  await apiRequest(`/company-settings/departments/${id}`, { method: 'DELETE' });
}

async function mockDeleteCategory(id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  const idx = MOCK_CATEGORIES.findIndex((c) => c.id === id);
  if (idx >= 0) MOCK_CATEGORIES.splice(idx, 1);
}

async function apiDeleteCategory(id: string): Promise<void> {
  await apiRequest(`/company-settings/categories/${id}`, { method: 'DELETE' });
}

// ─── Units mock/API ────────────────────────────────────────

const MOCK_UNITS: Unit[] = [];

async function mockListUnits(): Promise<Unit[]> {
  await new Promise((r) => setTimeout(r, 150));
  return [...MOCK_UNITS];
}

async function apiListUnits(): Promise<Unit[]> {
  const data = await apiRequest<{ units: Unit[] }>('/company-settings/units', { cacheTtlMs: 60000 });
  return data.units || [];
}

async function mockCreateUnit(name: string, abbreviation?: string, aliases?: string): Promise<Unit> {
  await new Promise((r) => setTimeout(r, 200));
  const unit: Unit = {
    id: String(Date.now()),
    companyCode: 'HFL',
    name,
    abbreviation,
    aliases,
    isActive: true,
    createdBy: String(Date.now()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  MOCK_UNITS.push(unit);
  return unit;
}

async function apiCreateUnit(name: string, abbreviation?: string, aliases?: string): Promise<Unit> {
  return apiRequest<Unit>('/company-settings/units', {
    method: 'POST',
    body: JSON.stringify({ name, abbreviation, aliases }),
  });
}

async function mockDeleteUnit(id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
  const idx = MOCK_UNITS.findIndex((u) => u.id === id);
  if (idx >= 0) MOCK_UNITS.splice(idx, 1);
}

async function apiDeleteUnit(id: string): Promise<void> {
  await apiRequest(`/company-settings/units/${id}`, { method: 'DELETE' });
}

// ─── Payment Terms ──────────────────────────────────────────────────────────

export interface PaymentTerm {
  id: string;
  companyCode: string;
  name: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const MOCK_PAYMENT_TERMS: PaymentTerm[] = [];

async function mockListPaymentTerms(): Promise<PaymentTerm[]> {
  await new Promise((r) => setTimeout(r, 150));
  return [...MOCK_PAYMENT_TERMS];
}

async function apiListPaymentTerms(): Promise<PaymentTerm[]> {
  const data = await apiRequest<{ paymentTerms: PaymentTerm[] }>('/company-settings/payment-terms', { cacheTtlMs: 60000 });
  return data.paymentTerms || [];
}

async function mockCreatePaymentTerm(name: string): Promise<PaymentTerm> {
  await new Promise((r) => setTimeout(r, 200));
  const term: PaymentTerm = {
    id: String(Date.now()),
    companyCode: 'HFL',
    name,
    isActive: true,
    createdBy: String(Date.now()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  MOCK_PAYMENT_TERMS.push(term);
  return term;
}

async function apiCreatePaymentTerm(name: string): Promise<PaymentTerm> {
  return apiRequest<PaymentTerm>('/company-settings/payment-terms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

async function mockDeletePaymentTerm(id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
  const idx = MOCK_PAYMENT_TERMS.findIndex((t) => t.id === id);
  if (idx >= 0) MOCK_PAYMENT_TERMS.splice(idx, 1);
}

async function apiDeletePaymentTerm(id: string): Promise<void> {
  await apiRequest(`/company-settings/payment-terms/${id}`, { method: 'DELETE' });
}

// ─── Email Templates ───────────────────────────────────────────────────────

export interface RequiredDocument {
  id: string;
  companyCode: string;
  name: string;
  fieldType: string;
  description?: string | null;
  acceptedFileTypes?: string;
  documentCategory: 'mandatory' | 'optional' | 'any_other';
  isActive: boolean;
  expirationAlertDays?: number;
  expirationAlertFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  trackIssueDate?: boolean;
  trackExpirationDate?: boolean;
  trackIssuingAuthority?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplate {
  templateKey: string;
  subject: string | null;
  bodyHtml: string;
}

async function mockListEmailTemplates(): Promise<EmailTemplate[]> {
  await new Promise((r) => setTimeout(r, 200));
  return [];
}

async function apiListEmailTemplates(): Promise<EmailTemplate[]> {
  const data = await apiRequest<{ templates: EmailTemplate[] }>('/company-settings/email-templates');
  return data.templates || [];
}

async function mockUpdateEmailTemplate(key: string, bodyHtml: string, subject?: string): Promise<EmailTemplate> {
  await new Promise((r) => setTimeout(r, 200));
  return { templateKey: key, subject: subject || null, bodyHtml };
}

async function apiUpdateEmailTemplate(key: string, bodyHtml: string, subject?: string): Promise<EmailTemplate> {
  const data = await apiRequest<{ template: EmailTemplate }>(`/company-settings/email-templates/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ subject, bodyHtml }),
  });
  return data.template;
}

async function mockGetEmailTemplate(key: string): Promise<EmailTemplate> {
  await new Promise((r) => setTimeout(r, 200));
  return { templateKey: key, subject: null, bodyHtml: '' };
}

async function apiGetEmailTemplate(key: string): Promise<EmailTemplate> {
  const data = await apiRequest<{ template: EmailTemplate }>(`/company-settings/email-templates/${encodeURIComponent(key)}`);
  return data.template;
}

async function mockResetEmailTemplate(key: string): Promise<EmailTemplate> {
  await new Promise((r) => setTimeout(r, 200));
  return { templateKey: key, subject: null, bodyHtml: '' };
}

async function apiResetEmailTemplate(key: string): Promise<EmailTemplate> {
  const data = await apiRequest<{ template: EmailTemplate }>(`/company-settings/email-templates/${encodeURIComponent(key)}/reset`, {
    method: 'DELETE',
  });
  return data.template;
}

// ─── Required Documents ─────────────────────────────────────────────────────

async function mockListRequiredDocuments(): Promise<RequiredDocument[]> {
  await new Promise((r) => setTimeout(r, 150));
  return [];
}

async function apiListRequiredDocuments(): Promise<RequiredDocument[]> {
  const data = await apiRequest<{ documents: RequiredDocument[] }>('/company-settings/required-documents', { cacheTtlMs: 60000 });
  return data.documents || [];
}

async function mockListRequiredDocumentsByCategory(category: 'mandatory' | 'optional' | 'any_other'): Promise<RequiredDocument[]> {
  await new Promise((r) => setTimeout(r, 150));
  return [];
}

async function apiListRequiredDocumentsByCategory(category: 'mandatory' | 'optional' | 'any_other'): Promise<RequiredDocument[]> {
  const data = await apiRequest<{ documents: RequiredDocument[] }>(`/company-settings/required-documents?category=${category}`, { cacheTtlMs: 60000 });
  return data.documents || [];
}

async function mockCreateRequiredDocument(
  name: string,
  documentCategory?: string,
  description?: string,
  acceptedFileTypes?: string,
  fieldType?: string,
  expirationAlertDays?: number,
  expirationAlertFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  trackIssueDate?: boolean,
  trackExpirationDate?: boolean,
  trackIssuingAuthority?: boolean
): Promise<RequiredDocument> {
  await new Promise((r) => setTimeout(r, 200));
  const category = (documentCategory || 'mandatory') as 'mandatory' | 'optional' | 'any_other';
  return {
    id: String(Date.now()),
    companyCode: 'HFL',
    name,
    fieldType: fieldType || 'attachment',
    description: description || null,
    acceptedFileTypes: acceptedFileTypes || 'pdf,jpg,jpeg,png,doc,docx,xls,xlsx',
    documentCategory: category,
    isActive: true,
    expirationAlertDays: expirationAlertDays ?? 30,
    expirationAlertFrequency: expirationAlertFrequency || 'DAILY',
    trackIssueDate: trackIssueDate ?? true,
    trackExpirationDate: trackExpirationDate ?? true,
    trackIssuingAuthority: trackIssuingAuthority ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function apiCreateRequiredDocument(
  name: string,
  documentCategory?: string,
  description?: string,
  acceptedFileTypes?: string,
  fieldType?: string,
  expirationAlertDays?: number,
  expirationAlertFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  trackIssueDate?: boolean,
  trackExpirationDate?: boolean,
  trackIssuingAuthority?: boolean
): Promise<RequiredDocument> {
  return apiRequest<RequiredDocument>('/company-settings/required-documents', {
    method: 'POST',
    body: JSON.stringify({
      name,
      documentCategory,
      description,
      acceptedFileTypes,
      fieldType,
      expirationAlertDays,
      expirationAlertFrequency,
      trackIssueDate,
      trackExpirationDate,
      trackIssuingAuthority,
    }),
  });
}

async function mockUpdateRequiredDocument(
  id: string,
  data: {
    name?: string;
    documentCategory?: string;
    description?: string | null;
    acceptedFileTypes?: string;
    fieldType?: string;
    expirationAlertDays?: number;
    expirationAlertFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    trackIssueDate?: boolean;
    trackExpirationDate?: boolean;
    trackIssuingAuthority?: boolean;
  }
): Promise<RequiredDocument> {
  await new Promise((r) => setTimeout(r, 150));
  const category = (data.documentCategory || 'mandatory') as 'mandatory' | 'optional' | 'any_other';
  return {
    id,
    companyCode: 'HFL',
    name: data.name || 'Updated Document',
    fieldType: data.fieldType || 'attachment',
    description: data.description !== undefined ? data.description : null,
    acceptedFileTypes: data.acceptedFileTypes !== undefined ? data.acceptedFileTypes : 'pdf,jpg,jpeg,png,doc,docx,xls,xlsx',
    documentCategory: category,
    isActive: true,
    expirationAlertDays: data.expirationAlertDays ?? 30,
    expirationAlertFrequency: data.expirationAlertFrequency || 'DAILY',
    trackIssueDate: data.trackIssueDate ?? true,
    trackExpirationDate: data.trackExpirationDate ?? true,
    trackIssuingAuthority: data.trackIssuingAuthority ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function apiUpdateRequiredDocument(
  id: string,
  data: {
    name?: string;
    documentCategory?: string;
    description?: string | null;
    acceptedFileTypes?: string;
    fieldType?: string;
    expirationAlertDays?: number;
    expirationAlertFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    trackIssueDate?: boolean;
    trackExpirationDate?: boolean;
    trackIssuingAuthority?: boolean;
  }
): Promise<RequiredDocument> {
  return apiRequest<RequiredDocument>(`/company-settings/required-documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function mockDeleteRequiredDocument(_id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
}

async function apiDeleteRequiredDocument(id: string): Promise<void> {
  await apiRequest(`/company-settings/required-documents/${id}`, { method: 'DELETE' });
}

// ─── Mandatory Information Fields ────────────────────────────────────────

export interface MandatoryFieldConfig {
  gstNumberLabel: string;
  panNumberLabel: string;
  customFields: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
}

async function mockGetMandatoryFields(): Promise<MandatoryFieldConfig> {
  await new Promise((r) => setTimeout(r, 150));
  return {
    gstNumberLabel: 'VAT Number',
    panNumberLabel: 'PIN Number',
    customFields: [],
  };
}

async function apiGetMandatoryFields(): Promise<MandatoryFieldConfig> {
  const data = await apiRequest<{ fields: MandatoryFieldConfig | null }>('/company-settings/mandatory-fields');
  return data.fields || {
    gstNumberLabel: 'VAT Number',
    panNumberLabel: 'PIN Number',
    customFields: [],
  };
}

async function mockUpdateMandatoryFields(payload: MandatoryFieldConfig): Promise<MandatoryFieldConfig> {
  await new Promise((r) => setTimeout(r, 200));
  return payload;
}

async function apiUpdateMandatoryFields(payload: MandatoryFieldConfig): Promise<MandatoryFieldConfig> {
  const data = await apiRequest<{ fields: MandatoryFieldConfig }>('/company-settings/mandatory-fields', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return data.fields;
}

// ─── Form Field Configurations (Form Builder) ────────────────────

export interface FormFieldConfig {
  id?: string;
  companyCode?: string;
  formKey: string;
  fieldKey: string;
  sectionKey: string;
  sectionLabel: string;
  label: string;
  fieldType: string;
  isVisible: boolean;
  sortOrder: number;
}

const MOCK_FORM_FIELDS: Record<string, FormFieldConfig[]> = {};

async function mockGetFormConfig(formKey: string): Promise<FormFieldConfig[]> {
  await new Promise((r) => setTimeout(r, 200));
  const existing = MOCK_FORM_FIELDS[formKey];
  if (existing) return [...existing];
  // Return defaults for vendor onboarding
  MOCK_FORM_FIELDS[formKey] = DEFAULT_VENDOR_FORM_FIELDS.map(f => ({ ...f, isVisible: true }));
  return [...MOCK_FORM_FIELDS[formKey]];
}

async function apiGetFormConfig(formKey: string): Promise<FormFieldConfig[]> {
  const data = await apiRequest<{ fields: FormFieldConfig[] }>(`/company-settings/form-config/${formKey}`, { cacheTtlMs: 30000 });
  return data.fields || [];
}

async function mockUpdateFormConfig(formKey: string, fields: FormFieldConfig[]): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  MOCK_FORM_FIELDS[formKey] = fields.map(f => ({ ...f }));
}

async function apiUpdateFormConfig(formKey: string, fields: FormFieldConfig[]): Promise<void> {
  await apiRequest(`/company-settings/form-config/${formKey}`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  });
}

async function mockSeedFormConfig(formKey: string): Promise<FormFieldConfig[]> {
  await new Promise((r) => setTimeout(r, 200));
  MOCK_FORM_FIELDS[formKey] = DEFAULT_VENDOR_FORM_FIELDS.map(f => ({ ...f, isVisible: true }));
  return [...MOCK_FORM_FIELDS[formKey]];
}

async function apiSeedFormConfig(formKey: string): Promise<FormFieldConfig[]> {
  const data = await apiRequest<{ fields: FormFieldConfig[] }>(`/company-settings/form-config/${formKey}/seed`, {
    method: 'POST',
  });
  return data.fields || [];
}

// Default vendor onboarding form fields
const DEFAULT_VENDOR_FORM_FIELDS: Array<Omit<FormFieldConfig, 'formKey'>> = [
  // Company Information
  { fieldKey: 'company_name', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Company Name', fieldType: 'readonly', isVisible: true, sortOrder: 0 },
  { fieldKey: 'category', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Category', fieldType: 'readonly', isVisible: true, sortOrder: 1 },
  { fieldKey: 'contact_person', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Contact Person', fieldType: 'readonly', isVisible: true, sortOrder: 2 },
  { fieldKey: 'status', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Status', fieldType: 'readonly', isVisible: true, sortOrder: 3 },
  { fieldKey: 'member_since', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Member Since', fieldType: 'readonly', isVisible: true, sortOrder: 4 },
  { fieldKey: 'address', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Address', fieldType: 'readonly', isVisible: true, sortOrder: 5 },
  { fieldKey: 'phone', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Phone', fieldType: 'readonly', isVisible: true, sortOrder: 6 },
  { fieldKey: 'email', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Email', fieldType: 'readonly', isVisible: true, sortOrder: 7 },
  { fieldKey: 'website', sectionKey: 'company_info', sectionLabel: 'Company Information', label: 'Website', fieldType: 'readonly', isVisible: true, sortOrder: 8 },
  // Banking
  { fieldKey: 'bank_name', sectionKey: 'banking', sectionLabel: 'Banking Details', label: 'Bank Name', fieldType: 'text', isVisible: true, sortOrder: 0 },
  { fieldKey: 'bank_branch', sectionKey: 'banking', sectionLabel: 'Banking Details', label: 'Branch', fieldType: 'text', isVisible: true, sortOrder: 1 },
  { fieldKey: 'bank_account_number', sectionKey: 'banking', sectionLabel: 'Banking Details', label: 'Account Number', fieldType: 'text', isVisible: true, sortOrder: 2 },
  { fieldKey: 'bank_ifsc_code', sectionKey: 'banking', sectionLabel: 'Banking Details', label: 'IFSC Code', fieldType: 'text', isVisible: true, sortOrder: 3 },
  // Documents
  { fieldKey: 'compliance_documents', sectionKey: 'documents', sectionLabel: 'Compliance Documents', label: 'Upload Compliance Documents', fieldType: 'file', isVisible: true, sortOrder: 0 },
  // Performance
  { fieldKey: 'quality_score', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Quality Score', fieldType: 'readonly', isVisible: true, sortOrder: 0 },
  { fieldKey: 'delivery_score', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Delivery Score', fieldType: 'readonly', isVisible: true, sortOrder: 1 },
  { fieldKey: 'price_score', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Price Score', fieldType: 'readonly', isVisible: true, sortOrder: 2 },
  { fieldKey: 'overall_score', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Overall Score', fieldType: 'readonly', isVisible: true, sortOrder: 3 },
  { fieldKey: 'win_rate', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Quotation Win Rate', fieldType: 'readonly', isVisible: true, sortOrder: 4 },
  { fieldKey: 'total_quotations', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Total Quotations', fieldType: 'readonly', isVisible: true, sortOrder: 5 },
  { fieldKey: 'total_orders', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Total Orders', fieldType: 'readonly', isVisible: true, sortOrder: 6 },
  { fieldKey: 'delivered_orders', sectionKey: 'performance', sectionLabel: 'Performance Metrics', label: 'Delivered Orders', fieldType: 'readonly', isVisible: true, sortOrder: 7 },
];

// ─── Branding Image Upload ────────────────────────────────

export interface UploadBrandingImageResult {
  url: string;
  profile: CompanyProfile;
}

async function apiUploadBrandingImage(type: 'logo' | 'favicon', file: File): Promise<UploadBrandingImageResult> {
  const formData = new FormData();
  formData.append('image', file);

  const token = localStorage.getItem('heliflow_token');
  const res = await fetch(`${API_BASE}/company-settings/upload-branding-image/${type}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type — let browser set it with boundary for multipart
    },
    body: formData,
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || json.message || 'Upload failed');
  }

  const data = json.data as { url: string; profile: CompanyProfile };
  return { url: data.url, profile: data.profile };
}

// ─── Document Templates (NDA / MNDA) ─────────────────────────────────────

export interface DocumentTemplate {
  id: string;
  companyCode: string;
  type: 'NDA' | 'MNDA' | 'ANY_OTHER';
  name: string;
  content: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  ocrText?: string | null;
  ocrStatus?: string | null;
  ocrProcessedAt?: string | null;
}

export interface DocumentTemplateInput {
  name: string;
  content: string;
  isActive?: boolean;
}

const MOCK_DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: '1', companyCode: 'HFL', type: 'NDA',
    name: 'Non-Disclosure Agreement',
    content: '<h1>NDA Template</h1><p>Default NDA content for {{companyName}} and {{vendorName}}.</p>',
    isActive: true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: '2', companyCode: 'HFL', type: 'MNDA',
    name: 'Mutual Non-Disclosure Agreement',
    content: '<h1>MNDA Template</h1><p>Default MNDA content for {{companyName}} and {{vendorName}}.</p>',
    isActive: true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: '3', companyCode: 'HFL', type: 'ANY_OTHER',
    name: 'General Agreement',
    content: '<h1>General Agreement</h1><p>This agreement is between {{companyName}} and {{vendorName}}.</p>',
    isActive: true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
];

async function mockListDocumentTemplates(): Promise<DocumentTemplate[]> {
  await new Promise(r => setTimeout(r, 200));
  return [...MOCK_DOCUMENT_TEMPLATES];
}

async function apiListDocumentTemplates(): Promise<DocumentTemplate[]> {
  const data = await apiRequest<{ templates: DocumentTemplate[] }>('/company-settings/document-templates', { cacheTtlMs: 60000 });
  return data.templates || [];
}

async function mockGetDocumentTemplate(type: 'NDA' | 'MNDA'): Promise<{ template: DocumentTemplate | null; defaultContent?: string }> {
  await new Promise(r => setTimeout(r, 150));
  const template = MOCK_DOCUMENT_TEMPLATES.find(t => t.type === type) || null;
  return {
    template,
    defaultContent: template ? undefined : (type === 'NDA'
      ? '<h1>Non-Disclosure Agreement</h1><p>This NDA is between {{companyName}} and {{vendorName}}.</p>'
      : '<h1>Mutual Non-Disclosure Agreement</h1><p>This MNDA is between {{companyName}} and {{vendorName}}.</p>'),
  };
}

async function apiGetDocumentTemplate(type: 'NDA' | 'MNDA'): Promise<{ template: DocumentTemplate | null; defaultContent?: string }> {
  return apiRequest<{ template: DocumentTemplate | null; defaultContent?: string }>(`/company-settings/document-templates/${type}`);
}

async function mockSaveDocumentTemplate(type: 'NDA' | 'MNDA', input: DocumentTemplateInput): Promise<DocumentTemplate> {
  await new Promise(r => setTimeout(r, 200));
  const idx = MOCK_DOCUMENT_TEMPLATES.findIndex(t => t.type === type);
  if (idx >= 0) {
    MOCK_DOCUMENT_TEMPLATES[idx] = {
      ...MOCK_DOCUMENT_TEMPLATES[idx],
      ...input,
      version: MOCK_DOCUMENT_TEMPLATES[idx].version + 1,
      updatedAt: new Date().toISOString(),
    };
    return MOCK_DOCUMENT_TEMPLATES[idx];
  }
  const newTemplate: DocumentTemplate = {
    id: String(Date.now()), companyCode: 'HFL', type,
    name: input.name,
    content: input.content,
    isActive: input.isActive ?? true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  MOCK_DOCUMENT_TEMPLATES.push(newTemplate);
  return newTemplate;
}

async function apiSaveDocumentTemplate(type: 'NDA' | 'MNDA', input: DocumentTemplateInput): Promise<DocumentTemplate> {
  const data = await apiRequest<{ template: DocumentTemplate }>(`/company-settings/document-templates/${type}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.template;
}

async function mockDeleteDocumentTemplate(type: 'NDA' | 'MNDA'): Promise<void> {
  await new Promise(r => setTimeout(r, 150));
  const idx = MOCK_DOCUMENT_TEMPLATES.findIndex(t => t.type === type);
  if (idx >= 0) MOCK_DOCUMENT_TEMPLATES.splice(idx, 1);
}

async function apiDeleteDocumentTemplate(type: 'NDA' | 'MNDA'): Promise<void> {
  await apiRequest(`/company-settings/document-templates/${type}`, { method: 'DELETE' });
}

// ─── New Document Template API (ID-based, supports multiple per type) ──

async function mockCreateDocumentTemplate(type: 'NDA' | 'MNDA' | 'ANY_OTHER', input: DocumentTemplateInput): Promise<DocumentTemplate> {
  await new Promise(r => setTimeout(r, 200));
  const newTemplate: DocumentTemplate = {
    id: String(Date.now()), companyCode: 'HFL', type,
    name: input.name,
    content: input.content,
    isActive: input.isActive ?? true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  MOCK_DOCUMENT_TEMPLATES.push(newTemplate);
  return newTemplate;
}

async function apiCreateDocumentTemplate(type: 'NDA' | 'MNDA' | 'ANY_OTHER', input: DocumentTemplateInput): Promise<DocumentTemplate> {
  const data = await apiRequest<{ template: DocumentTemplate }>('/company-settings/document-templates', {
    method: 'POST',
    body: JSON.stringify({ type, ...input }),
  });
  return data.template;
}

async function mockUpdateDocumentTemplateById(id: string, input: DocumentTemplateInput & { fileUrl?: string | null; fileName?: string | null; fileType?: string | null }): Promise<DocumentTemplate> {
  await new Promise(r => setTimeout(r, 200));
  const idx = MOCK_DOCUMENT_TEMPLATES.findIndex(t => t.id === id);
  if (idx >= 0) {
    MOCK_DOCUMENT_TEMPLATES[idx] = {
      ...MOCK_DOCUMENT_TEMPLATES[idx],
      ...input,
      version: MOCK_DOCUMENT_TEMPLATES[idx].version + 1,
      updatedAt: new Date().toISOString(),
    };
    return MOCK_DOCUMENT_TEMPLATES[idx];
  }
  throw new Error('Template not found');
}

async function apiUpdateDocumentTemplateById(id: string, input: DocumentTemplateInput & { fileUrl?: string | null; fileName?: string | null; fileType?: string | null }): Promise<DocumentTemplate> {
  const data = await apiRequest<{ template: DocumentTemplate }>(`/company-settings/document-templates/by-id/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.template;
}

async function mockDeleteDocumentTemplateById(id: string): Promise<void> {
  await new Promise(r => setTimeout(r, 150));
  const idx = MOCK_DOCUMENT_TEMPLATES.findIndex(t => t.id === id);
  if (idx >= 0) MOCK_DOCUMENT_TEMPLATES.splice(idx, 1);
}

async function apiDeleteDocumentTemplateById(id: string): Promise<void> {
  await apiRequest(`/company-settings/document-templates/by-id/${id}`, { method: 'DELETE' });
}

// ─── Document Template File Upload ────────────────────────────

async function mockUploadDocumentTemplateFile(type: string, file: File): Promise<{ fileUrl: string; fileName: string; fileType: string }> {
  await new Promise(r => setTimeout(r, 500));
  return {
    fileUrl: URL.createObjectURL(file),
    fileName: file.name,
    fileType: file.type,
  };
}

async function apiUploadDocumentTemplateFile(type: string, file: File): Promise<{ fileUrl: string; fileName: string; fileType: string }> {
  const validationError = validateContractUploadFile(file);
  if (validationError) {
    console.warn('[DocUpload] Client-side validation failed:', validationError, { fileName: file.name, fileSize: file.size, fileType: file.type });
    throw new Error(validationError);
  }

  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('heliflow_token');
  console.log('[DocUpload] Starting upload:', { type, fileName: file.name, fileSize: file.size, fileType: file.type });

  const res = await fetch(`${API_BASE}/company-settings/document-templates/${encodeURIComponent(type)}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  let json: any;
  try {
    json = await res.json();
  } catch {
    json = {};
  }

  if (!res.ok || !json.success) {
    const errCode = json.code || '';
    const errMsg = json.error || json.message || 'Upload failed';
    console.error('[DocUpload] Upload failed:', {
      status: res.status,
      code: errCode,
      message: errMsg,
      serverResponse: json,
      type,
      fileName: file.name,
    });
    throw new Error(errCode ? `${errMsg} (${errCode})` : errMsg);
  }

  console.log('[DocUpload] Upload successful:', { fileUrl: json.data?.fileUrl, fileName: json.data?.fileName });
  return json.data as { fileUrl: string; fileName: string; fileType: string };
}

// ─── Document Template OCR API Methods ────────────────────────

async function mockTriggerDocumentOcr(type: string): Promise<void> {
  await new Promise(r => setTimeout(r, 100));
}

async function apiTriggerDocumentOcr(type: string): Promise<void> {
  await apiRequest(`/company-settings/document-templates/${encodeURIComponent(type)}/ocr/trigger`, {
    method: 'POST',
  });
}

async function mockGetDocumentOcrStatus(type: string): Promise<{ ocrText: string | null; ocrStatus: string | null; ocrProcessedAt: string | null }> {
  await new Promise(r => setTimeout(r, 150));
  return { ocrText: null, ocrStatus: null, ocrProcessedAt: null };
}

async function apiGetDocumentOcrStatus(type: string): Promise<{ ocrText: string | null; ocrStatus: string | null; ocrProcessedAt: string | null }> {
  return apiRequest(`/company-settings/document-templates/${encodeURIComponent(type)}/ocr/status`);
}

async function mockSaveDocumentOcrText(type: string, ocrText: string): Promise<void> {
  await new Promise(r => setTimeout(r, 100));
}

async function apiSaveDocumentOcrText(type: string, ocrText: string): Promise<void> {
  await apiRequest(`/company-settings/document-templates/${encodeURIComponent(type)}/ocr/text`, {
    method: 'PUT',
    body: JSON.stringify({ ocrText }),
  });
}

// ─── Contract Templates (Company Settings) ──────────────────────────────────

export interface ContractTemplate {
  id: string;
  companyCode: string;
  type: string;
  name: string;
  description?: string | null;
  content: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  ocrText?: string | null;
  ocrStatus?: string | null;
  ocrProcessedAt?: string | null;
}

export interface ContractTemplateInput {
  name: string;
  content: string;
  description?: string | null;
  isActive?: boolean;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
}

type ContractTemplateType = string;

const MOCK_CONTRACT_TEMPLATES: ContractTemplate[] = [
  { id: 'ct1', companyCode: 'HFL', type: 'PURCHASE_CONTRACT', name: 'Purchase Contract', content: '<h1>Purchase Contract</h1><p>Between {{companyName}} and {{vendorName}} dated {{currentDate}}.</p>', isActive: true, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ct2', companyCode: 'HFL', type: 'SERVICE_CONTRACT', name: 'Service Contract', content: '<h1>Service Contract</h1><p>Between {{companyName}} and {{vendorName}}.</p>', isActive: true, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ct3', companyCode: 'HFL', type: 'AMC', name: 'Annual Maintenance Contract', content: '<h1>AMC</h1><p>Annual maintenance agreement between {{companyName}} and {{vendorName}} for {{contractNumber}}.</p>', isActive: true, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ct4', companyCode: 'HFL', type: 'BINDING_CONTRACT', name: 'Binding Contract', content: '<h1>Binding Contract</h1><p>Binding agreement between {{companyName}} and {{vendorName}}.</p>', isActive: true, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  // ── Sample custom types ──
  { id: 'ct5', companyCode: 'HFL', type: 'LEASE_AGREEMENT', name: 'Lease Agreement', content: '<h1>Lease Agreement</h1><p>Lease agreement between {{companyName}} (Lessee) and {{vendorName}} (Lessor) for premises located at {{companyAddress}}.</p><p>Term: {{effectiveDate}} to {{expirationDate}}.</p>', isActive: true, version: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ct6', companyCode: 'HFL', type: 'CONSULTANCY_AGREEMENT', name: 'Consultancy Agreement', content: '<h1>Consultancy Agreement</h1><p>Consultancy services agreement between {{companyName}} and {{vendorName}}.</p><p>Scope: As defined in the attached Statement of Work (SOW).</p><p>Fees: {{awardValue}} {{currency}} as per payment terms {{paymentTerms}}.</p>', isActive: true, version: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ct7', companyCode: 'HFL', type: 'FRAMEWORK_AGREEMENT', name: 'Framework Agreement', content: '<h1>Framework Agreement</h1><p>Master framework agreement between {{companyName}} and {{vendorName}} (Vendor Code: {{vendorName}}).</p><p>This agreement sets out the general terms and conditions under which {{companyName}} may issue Purchase Orders to {{vendorName}} during the term {{effectiveDate}} to {{expirationDate}}.</p>', isActive: true, version: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ct8', companyCode: 'HFL', type: 'SOFTWARE_LICENCE', name: 'Software License Agreement', content: '<h1>Software License Agreement</h1><p>Software license agreement between {{companyName}} (Licensee) and {{vendorName}} (Licensor).</p><p>License Type: Perpetual / Subscription (as agreed).</p><p>License Fee: {{awardValue}} {{currency}}.</p><p>Support & Maintenance: {{supportPeriod}} with {{supportResponseTime}} response time.</p>', isActive: true, version: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

async function mockListContractTemplates(): Promise<ContractTemplate[]> {
  await new Promise(r => setTimeout(r, 200));
  return [...MOCK_CONTRACT_TEMPLATES];
}

async function apiListContractTemplates(): Promise<ContractTemplate[]> {
  try {
    const data = await apiRequest<{ templates: ContractTemplate[] }>('/company-settings/contract-templates', { cacheTtlMs: 60000 });
    return data.templates || [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[CompanySettings] Auth required for contract templates — falling back to local templates');
      return mockListContractTemplates();
    }
    throw err;
  }
}

async function mockGetContractTemplate(type: ContractTemplateType): Promise<{ template: ContractTemplate | null; defaultContent?: string }> {
  await new Promise(r => setTimeout(r, 150));
  const template = MOCK_CONTRACT_TEMPLATES.find(t => t.type === type) || null;
  return {
    template,
    defaultContent: template?.content ? undefined : '<h1>Contract</h1><p>Standard contract template between {{company_name}} and {{vendor_name}}.</p>',
  };
}

async function apiGetContractTemplate(type: ContractTemplateType): Promise<{ template: ContractTemplate | null; defaultContent?: string }> {
  const data = await apiRequest<{ template: ContractTemplate | null; defaultContent?: string }>(`/company-settings/contract-templates/${type}`);
  return data;
}

async function mockSaveContractTemplate(type: ContractTemplateType, input: ContractTemplateInput): Promise<ContractTemplate> {
  await new Promise(r => setTimeout(r, 200));
  const idx = MOCK_CONTRACT_TEMPLATES.findIndex(t => t.type === type);
  if (idx >= 0) {
    MOCK_CONTRACT_TEMPLATES[idx] = {
      ...MOCK_CONTRACT_TEMPLATES[idx],
      ...input,
      version: MOCK_CONTRACT_TEMPLATES[idx].version + 1,
      updatedAt: new Date().toISOString(),
    };
    return MOCK_CONTRACT_TEMPLATES[idx];
  }
  const newTemplate: ContractTemplate = {
    id: String(Date.now()), companyCode: 'HFL', type,
    name: input.name,
    content: input.content,
    isActive: input.isActive ?? true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  MOCK_CONTRACT_TEMPLATES.push(newTemplate);
  return newTemplate;
}

async function apiSaveContractTemplate(type: ContractTemplateType, input: ContractTemplateInput): Promise<ContractTemplate> {
  const data = await apiRequest<{ template: ContractTemplate }>(`/company-settings/contract-templates/${type}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.template;
}

async function mockDeleteContractTemplate(type: ContractTemplateType): Promise<void> {
  await new Promise(r => setTimeout(r, 150));
  const idx = MOCK_CONTRACT_TEMPLATES.findIndex(t => t.type === type);
  if (idx >= 0) MOCK_CONTRACT_TEMPLATES.splice(idx, 1);
}

async function apiDeleteContractTemplate(type: ContractTemplateType): Promise<void> {
  await apiRequest(`/company-settings/contract-templates/${type}`, { method: 'DELETE' });
}

// ─── Allowed upload types ────────────────────────────────────────────
const ALLOWED_CONTRACT_UPLOAD_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

/** Accepted file extensions for contract template uploads — shared with the UI's file input accept attribute */
export const ALLOWED_CONTRACT_UPLOAD_EXTENSIONS = '.pdf,.doc,.docx,.jpg,.jpeg,.png';

/**
 * Validate that the file type is supported for upload.
 * Returns an error message if invalid, or null if valid.
 */
function validateContractUploadFile(file: File): string | null {
  if (!file) return 'No file selected.';

  if (file.size > 10 * 1024 * 1024) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed is 10MB.`;
  }

  const isTypeAllowed = ALLOWED_CONTRACT_UPLOAD_TYPES.includes(file.type);
  if (!isTypeAllowed) {
    return `Unsupported file format: ${file.type || 'unknown'}. Please upload a PDF, DOC, or DOCX file.`;
  }

  return null;
}

// ─── Contract Template File Upload ──────────────────────────────────────

async function apiUploadContractTemplateFile(type: string, file: File): Promise<{ fileUrl: string; fileName: string; fileType: string }> {
  // Client-side validation first
  const validationError = validateContractUploadFile(file);
  if (validationError) {
    console.warn('[ContractUpload] Client-side validation failed:', validationError, { fileName: file.name, fileSize: file.size, fileType: file.type });
    throw new Error(validationError);
  }

  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('heliflow_token');
  console.log('[ContractUpload] Starting upload:', { type, fileName: file.name, fileSize: file.size, fileType: file.type });

  const res = await fetch(`${API_BASE}/company-settings/contract-templates/${encodeURIComponent(type)}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // No Content-Type — browser sets it for FormData
    },
    body: formData,
  });

  let json: any;
  try {
    json = await res.json();
  } catch {
    json = {};
  }

  if (!res.ok || !json.success) {
    const errCode = json.code || '';
    const errMsg = json.error || json.message || 'Upload failed';
    console.error('[ContractUpload] Upload failed:', {
      status: res.status,
      code: errCode,
      message: errMsg,
      serverResponse: json,
      type,
      fileName: file.name,
    });
    // Include the error code in the message so it's visible in the UI
    throw new Error(errCode ? `${errMsg} (${errCode})` : errMsg);
  }

  console.log('[ContractUpload] Upload successful:', { fileUrl: json.data?.fileUrl, fileName: json.data?.fileName });
  return json.data as { fileUrl: string; fileName: string; fileType: string };
}

async function mockUploadContractTemplateFile(type: string, file: File): Promise<{ fileUrl: string; fileName: string; fileType: string }> {
  await new Promise(r => setTimeout(r, 500));
  return {
    fileUrl: URL.createObjectURL(file),
    fileName: file.name,
    fileType: file.type,
  };
}

// ─── OCR API Methods ────────────────────────────────────────────

async function mockTriggerContractOcr(type: string): Promise<void> {
  await new Promise(r => setTimeout(r, 100));
}

async function apiTriggerContractOcr(type: string): Promise<void> {
  await apiRequest(`/company-settings/contract-templates/${encodeURIComponent(type)}/ocr/trigger`, {
    method: 'POST',
  });
}

async function mockGetContractOcrStatus(type: string): Promise<{ ocrText: string | null; ocrStatus: string | null; ocrProcessedAt: string | null }> {
  await new Promise(r => setTimeout(r, 150));
  return { ocrText: null, ocrStatus: null, ocrProcessedAt: null };
}

async function apiGetContractOcrStatus(type: string): Promise<{ ocrText: string | null; ocrStatus: string | null; ocrProcessedAt: string | null }> {
  return apiRequest(`/company-settings/contract-templates/${encodeURIComponent(type)}/ocr/status`);
}

async function mockSaveContractOcrText(type: string, ocrText: string): Promise<void> {
  await new Promise(r => setTimeout(r, 100));
}

async function apiSaveContractOcrText(type: string, ocrText: string): Promise<void> {
  await apiRequest(`/company-settings/contract-templates/${encodeURIComponent(type)}/ocr/text`, {
    method: 'PUT',
    body: JSON.stringify({ ocrText }),
  });
}

export const companySettingsService = {
  listDepartments: USE_MOCK ? mockListDepartments : apiListDepartments,
  listCategories: USE_MOCK ? mockListCategories : apiListCategories,
  createDepartment: USE_MOCK ? mockCreateDepartment : apiCreateDepartment,
  updateDepartment: USE_MOCK ? mockUpdateDepartment : apiUpdateDepartment,
  deleteDepartment: USE_MOCK ? mockDeleteDepartment : apiDeleteDepartment,
  createCategory: USE_MOCK ? mockCreateCategory : apiCreateCategory,
  updateCategory: USE_MOCK ? mockUpdateCategory : apiUpdateCategory,
  deleteCategory: USE_MOCK ? mockDeleteCategory : apiDeleteCategory,
  listUnits: USE_MOCK ? mockListUnits : apiListUnits,
  createUnit: USE_MOCK ? mockCreateUnit : apiCreateUnit,
  deleteUnit: USE_MOCK ? mockDeleteUnit : apiDeleteUnit,
  listPositions: USE_MOCK ? mockListPositions : apiListPositions,
  createPosition: USE_MOCK ? mockCreatePosition : apiCreatePosition,
  deletePosition: USE_MOCK ? mockDeletePosition : apiDeletePosition,
  listPaymentTerms: USE_MOCK ? mockListPaymentTerms : apiListPaymentTerms,
  createPaymentTerm: USE_MOCK ? mockCreatePaymentTerm : apiCreatePaymentTerm,
  deletePaymentTerm: USE_MOCK ? mockDeletePaymentTerm : apiDeletePaymentTerm,
  getCompanyProfile: USE_MOCK ? mockGetCompanyProfile : apiGetCompanyProfile,
  updateCompanyProfile: USE_MOCK ? mockUpdateCompanyProfile : apiUpdateCompanyProfile,
  getDefaultCurrency: USE_MOCK ? mockGetDefaultCurrency : apiGetDefaultCurrency,
  // Email Templates
  listEmailTemplates: USE_MOCK ? mockListEmailTemplates : apiListEmailTemplates,
  getEmailTemplate: USE_MOCK ? mockGetEmailTemplate : apiGetEmailTemplate,
  updateEmailTemplate: USE_MOCK ? mockUpdateEmailTemplate : apiUpdateEmailTemplate,
  resetEmailTemplate: USE_MOCK ? mockResetEmailTemplate : apiResetEmailTemplate,
  listRequiredDocuments: USE_MOCK ? mockListRequiredDocuments : apiListRequiredDocuments,
  listMandatoryDocuments: USE_MOCK
    ? () => mockListRequiredDocumentsByCategory('mandatory')
    : () => apiListRequiredDocumentsByCategory('mandatory'),
  listOptionalDocuments: USE_MOCK
    ? () => mockListRequiredDocumentsByCategory('optional')
    : () => apiListRequiredDocumentsByCategory('optional'),
  listAnyOtherDocuments: USE_MOCK
    ? () => mockListRequiredDocumentsByCategory('any_other')
    : () => apiListRequiredDocumentsByCategory('any_other'),
  createRequiredDocument: USE_MOCK ? mockCreateRequiredDocument : apiCreateRequiredDocument,
  updateRequiredDocument: USE_MOCK ? mockUpdateRequiredDocument : apiUpdateRequiredDocument,
  deleteRequiredDocument: USE_MOCK ? mockDeleteRequiredDocument : apiDeleteRequiredDocument,
  // Mandatory Information Fields
  getMandatoryFields: USE_MOCK ? mockGetMandatoryFields : apiGetMandatoryFields,
  updateMandatoryFields: USE_MOCK ? mockUpdateMandatoryFields : apiUpdateMandatoryFields,
  // Form Field Configurations (Form Builder & Flexi Fields)
  getFormConfig: USE_MOCK ? mockGetFormConfig : apiGetFormConfig,
  updateFormConfig: USE_MOCK ? mockUpdateFormConfig : apiUpdateFormConfig,
  seedFormConfig: USE_MOCK ? mockSeedFormConfig : apiSeedFormConfig,
  listFormFieldConfigs: async (formKey?: string) => {
    const query = formKey ? `?formKey=${encodeURIComponent(formKey)}` : '';
    // cacheTtlMs: 0 — always fetch fresh so newly added fields appear immediately
    const data = await apiRequest<{ configs: FormFieldConfig[] }>(`/form-config/form-fields${query}`, { cacheTtlMs: 0 });
    const configs = data.configs || [];
    return configs.filter((f) => f.sectionKey === 'custom_fields' || f.fieldKey.startsWith('cf_'));
  },
  createFormFieldConfig: async (payload: { formKey: string; fieldKey: string; label: string; fieldType: string; sectionKey?: string; sectionLabel?: string; sortOrder?: number; isVisible?: boolean }) => {
    const data = await apiRequest<FormFieldConfig>('/form-config/form-fields', {
      method: 'POST',
      body: JSON.stringify({
        sectionKey: 'custom_fields',
        sectionLabel: 'Custom Fields',
        sortOrder: 0,
        isVisible: true,
        ...payload,
      }),
    });
    return data;
  },
  updateFormFieldConfig: async (id: string, payload: Partial<FormFieldConfig>) => {
    const data = await apiRequest<FormFieldConfig>(`/form-config/form-fields/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return data;
  },
  deleteFormFieldConfig: async (id: string) => {
    await apiRequest(`/form-config/form-fields/${id}`, { method: 'DELETE' });
  },
  // Document Templates (NDA / MNDA)
  listDocumentTemplates: USE_MOCK ? mockListDocumentTemplates : apiListDocumentTemplates,
  getDocumentTemplate: USE_MOCK ? mockGetDocumentTemplate : apiGetDocumentTemplate,
  saveDocumentTemplate: USE_MOCK ? mockSaveDocumentTemplate : apiSaveDocumentTemplate,
  deleteDocumentTemplate: USE_MOCK ? mockDeleteDocumentTemplate : apiDeleteDocumentTemplate,
  createDocumentTemplate: USE_MOCK ? mockCreateDocumentTemplate : apiCreateDocumentTemplate,
  updateDocumentTemplateById: USE_MOCK ? mockUpdateDocumentTemplateById : apiUpdateDocumentTemplateById,
  deleteDocumentTemplateById: USE_MOCK ? mockDeleteDocumentTemplateById : apiDeleteDocumentTemplateById,
  uploadDocumentTemplateFile: USE_MOCK ? mockUploadDocumentTemplateFile : apiUploadDocumentTemplateFile,
  triggerDocumentOcr: USE_MOCK ? mockTriggerDocumentOcr : apiTriggerDocumentOcr,
  getDocumentOcrStatus: USE_MOCK ? mockGetDocumentOcrStatus : apiGetDocumentOcrStatus,
  saveDocumentOcrText: USE_MOCK ? mockSaveDocumentOcrText : apiSaveDocumentOcrText,
  // Contract Templates (Company Settings)
  listContractTemplates: USE_MOCK ? mockListContractTemplates : apiListContractTemplates,
  getContractTemplate: USE_MOCK ? mockGetContractTemplate : apiGetContractTemplate,
  saveContractTemplate: USE_MOCK ? mockSaveContractTemplate : apiSaveContractTemplate,
  deleteContractTemplate: USE_MOCK ? mockDeleteContractTemplate : apiDeleteContractTemplate,
  // Contract Template File Upload
  uploadContractTemplateFile: USE_MOCK ? mockUploadContractTemplateFile : apiUploadContractTemplateFile,
  // OCR for Contract Templates
  triggerContractOcr: USE_MOCK ? mockTriggerContractOcr : apiTriggerContractOcr,
  getContractOcrStatus: USE_MOCK ? mockGetContractOcrStatus : apiGetContractOcrStatus,
  saveContractOcrText: USE_MOCK ? mockSaveContractOcrText : apiSaveContractOcrText,
  // Branding Image Upload — always uses real API (no mock)
  uploadBrandingImage: apiUploadBrandingImage,
  // Document Serialization Sequences
  listSequenceSettings: apiListSequenceSettings,
  updateSequenceSetting: apiUpdateSequenceSetting,
  generateNextSequence: apiGenerateNextSequence,
  backfillSupplierCodes: apiBackfillSupplierCodes,
};

export interface SequenceSetting {
  id?: string;
  companyCode?: string;
  entityType: 'SUPPLIER_CODE' | 'PURCHASE_ORDER' | 'RFQ' | string;
  prefix: string;
  suffix?: string | null;
  nextNumber: number;
  paddingLength: number;
  resetFrequency: 'NEVER' | 'YEARLY' | 'MONTHLY' | string;
}

async function apiListSequenceSettings(): Promise<SequenceSetting[]> {
  try {
    const data = await apiRequest<{ settings: SequenceSetting[] }>('/company-settings/sequences');
    return data.settings || [];
  } catch {
    return [
      { entityType: 'SUPPLIER_CODE', prefix: 'SUP-', suffix: '', nextNumber: 1001, paddingLength: 4, resetFrequency: 'NEVER' },
      { entityType: 'PURCHASE_ORDER', prefix: 'PO-2026-', suffix: '', nextNumber: 770952, paddingLength: 6, resetFrequency: 'YEARLY' },
      { entityType: 'RFQ', prefix: 'RFQ-2026-', suffix: '', nextNumber: 101, paddingLength: 4, resetFrequency: 'YEARLY' },
    ];
  }
}

async function apiUpdateSequenceSetting(payload: SequenceSetting): Promise<SequenceSetting> {
  const data = await apiRequest<{ setting: SequenceSetting }>('/company-settings/sequences', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return data.setting;
}

async function apiGenerateNextSequence(entityType: string): Promise<{ formattedCode: string; nextNumber: number }> {
  const data = await apiRequest<{ formattedCode: string; nextNumber: number }>(`/company-settings/sequences/next/${entityType}`, {
    method: 'POST',
  });
  return data;
}

async function apiBackfillSupplierCodes(): Promise<{ updated: number; nextCounter: number }> {
  const data = await apiRequest<{ updated: number; nextCounter: number }>('/company-settings/sequences/backfill/suppliers', {
    method: 'POST',
  });
  return data;
}
