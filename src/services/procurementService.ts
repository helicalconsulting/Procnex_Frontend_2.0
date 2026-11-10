import { USE_MOCK } from '../config/mock';
import { apiRequest, authHeaders, API_BASE } from '../api/client';
import { pickList } from '../api/normalize';
import { MOCK_VENDORS } from '../api/mappers';
import type { Vendor } from '../types';

export interface OnboardingVendor {
  id: string;
  name: string;
  email: string;
  status: string;
  submittedAt: string;
  phone?: string | null;
  contactPerson?: string | null;
  website?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankBranch?: string | null;
  onboardingNotes?: string | null;
  category?: string | null;
  supplierType?: string | null;
  location?: string | null;
  rejectionReason?: string | null;
  isSubmitted?: boolean;
  documentSummary?: DocumentSummary;
  documents?: VendorDocument[];
}

export interface VendorDocument {
  id: string;
  vendorId: string;
  documentType: string;
  originalName: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  uploadedAt: string;
  rejectionReason?: string | null;
  // Signed NDA/MNDA onboarding document fields
  contentSnapshot?: string;
  signedBy?: string | null;
  signedAt?: string | null;
  signatureUrl?: string | null;
  // Company signer metadata (from VendorDocumentSignature)
  companySignatoryName?: string | null;
  companySignatureUrl?: string | null;
  companySignedAt?: string | null;
  // Vendor signer metadata
  vendorSignatoryName?: string | null;
  vendorSignatureUrl?: string | null;
  vendorSignedAt?: string | null;
}

export interface PendingVendorDocument extends VendorDocument {
  vendorName: string;
  vendorEmail: string;
  vendorStatus: string;
}

export interface DocumentSummary {
  required: number;
  uploaded: number;
  pending: number;
  verified: number;
  rejected: number;
}

export interface VendorInvitationRow {
  id: string;
  companyName: string;
  contactEmail: string;
  contactPerson?: string;
  contactPhone?: string;
  category?: string | null;
  categoryId?: string | null;
  supplierType?: string | null;
  notes?: string;
  sentAt: string;
  expiresAt: string;
  status: 'pending' | 'in_queue' | 'approved' | 'expired' | 'declined';
  inviteCode: string;
  items?: Array<{ itemCode: string; itemName: string }> | null;
  selectedDocuments?: Array<{ name: string; isRequired: boolean }> | null;
  documentIds?: string[];
  flexiFields?: Array<{ fieldKey?: string; label: string; fieldType: string; options?: string[] }> | null;
  flexiFieldValues?: Record<string, string> | null;
}

export interface SendInvitationPayload {
  companyName: string;
  contactEmail: string;
  contactPerson?: string;
  contactPhone?: string;
  category?: string;
  categoryId?: string;
  supplierType?: string;
  notes?: string;
  items?: Array<{ itemCode: string; itemName: string }>;
  documentIds?: string[];
  flexiFields?: Array<{ fieldKey: string; label: string; fieldType: string; options?: string[] }>;
  ndaMndaRequired?: boolean;
  ndaRequired?: boolean;
  mndaRequired?: boolean;
  anyOtherRequired?: boolean;
  ndaTemplateId?: string;
  mndaTemplateId?: string;
  anyOtherTemplateId?: string;
}

export interface UploadedRegistrationDoc {
  type: 'trade_license' | 'vat_certificate' | 'emirates_id' | string;
  label: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  dataUrl?: string;
  uploadedAt: string;
}

export interface VendorSelfRegistrationPayload {
  companyName: string;
  contactEmail: string;
  contactPerson?: string;
  countryCode: string;
  phone: string;
  category?: string;
  categoryId?: string;
  supplierType?: string;
  notes?: string;
  companyCode?: string;
  documents?: UploadedRegistrationDoc[];
}

export interface SelfRegisteredVendorRecord {
  id: string;
  vendorNo: string;
  name: string;
  email: string;
  phone: string;
  contactPerson?: string;
  category?: string;
  categoryId?: string;
  supplierType?: string;
  notes?: string;
  companyCode?: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  isSelfRegistered: true;
  documents?: UploadedRegistrationDoc[];
}

const STORAGE_KEY_REGISTRATIONS = 'procnex_vendor_registrations';

export function getSelfRegisteredVendors(): SelfRegisteredVendorRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_REGISTRATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSelfRegisteredVendor(payload: VendorSelfRegistrationPayload): SelfRegisteredVendorRecord {
  const existing = getSelfRegisteredVendors();
  const index = existing.length + 1;
  const vendorNo = `VND-${String(index).padStart(4, '0')}`;
  const id = `reg_${Date.now()}`;
  const fullPhone = payload.phone ? `${payload.countryCode || ''} ${payload.phone}`.trim() : '';
  const now = new Date().toISOString().slice(0, 10);

  const record: SelfRegisteredVendorRecord = {
    id,
    vendorNo,
    name: payload.companyName.trim(),
    email: payload.contactEmail.trim().toLowerCase(),
    phone: fullPhone,
    contactPerson: payload.contactPerson?.trim() || undefined,
    category: payload.category || undefined,
    categoryId: payload.categoryId || undefined,
    supplierType: payload.supplierType || undefined,
    notes: payload.notes?.trim() || undefined,
    companyCode: payload.companyCode || 'alzorah',
    status: 'PENDING_APPROVAL',
    submittedAt: now,
    isSelfRegistered: true,
    documents: payload.documents || [],
  };

  const updated = [record, ...existing.filter((r) => r.email !== record.email)];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('vendor_registered', { detail: record }));
  }
  return record;
}

export function updateSelfRegisteredStatus(vendorId: string, status: 'APPROVED' | 'REJECTED', reason?: string): boolean {
  if (typeof window === 'undefined') return false;
  const list = getSelfRegisteredVendors();
  let updated = false;
  const next = list.map((item) => {
    if (item.id === vendorId || item.vendorNo === vendorId) {
      updated = true;
      return {
        ...item,
        status,
        rejectionReason: reason || undefined,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });
  if (updated) {
    window.localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('vendor_queue_updated'));
  }
  return updated;
}

const ONBOARDING_MOCK: OnboardingVendor[] = [
  { id: '10', name: 'LabTech Solutions', email: 'contact@labtech.in', status: 'PENDING_APPROVAL', submittedAt: '2024-04-25', phone: '+971 50 123 4567' },
  { id: '11', name: 'SteelWorks India', email: 'bid@steelworks.in', status: 'PENDING_APPROVAL', submittedAt: '2024-04-24', phone: '+91 98765 43210' },
];

function mapSelfRegisteredToOnboarding(reg: SelfRegisteredVendorRecord): OnboardingVendor {
  const docs: VendorDocument[] = (reg.documents || []).map((doc, idx) => ({
    id: `${reg.id}_doc_${idx}`,
    vendorId: reg.id,
    documentType: doc.label || doc.type,
    originalName: doc.fileName,
    publicUrl: doc.dataUrl || '',
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    status: 'PENDING',
    uploadedAt: doc.uploadedAt || reg.submittedAt,
  }));

  return {
    id: reg.id,
    name: reg.name,
    email: reg.email,
    status: reg.status,
    submittedAt: reg.submittedAt,
    phone: reg.phone,
    contactPerson: reg.contactPerson,
    category: reg.category,
    supplierType: reg.supplierType,
    onboardingNotes: reg.notes,
    isSubmitted: true,
    documentSummary: {
      required: docs.length,
      uploaded: docs.length,
      pending: docs.length,
      verified: 0,
      rejected: 0,
    },
    documents: docs,
  };
}

async function mockOnboardingQueue(): Promise<OnboardingVendor[]> {
  const selfReg = getSelfRegisteredVendors().map(mapSelfRegisteredToOnboarding);
  return [...selfReg, ...ONBOARDING_MOCK];
}

async function apiOnboardingQueue(): Promise<OnboardingVendor[]> {
  const selfReg = getSelfRegisteredVendors().map(mapSelfRegisteredToOnboarding);
  let apiVendors: OnboardingVendor[] = [];
  try {
    const data = await apiRequest<{ vendors: Vendor[] }>('/procurement/vendor-approval-queue');
    const vendors = pickList<Vendor>(data, ['vendors']);
    apiVendors = vendors.map((v) => {
    const extended = v as Vendor & {
      status?: string;
      documentSummary?: DocumentSummary;
      documents?: VendorDocument[];
      phone?: string | null;
      contactPerson?: string | null;
      website?: string | null;
      address?: string | null;
      gstNumber?: string | null;
      panNumber?: string | null;
      bankName?: string | null;
      bankAccountNumber?: string | null;
      bankIfscCode?: string | null;
      bankBranch?: string | null;
      onboardingNotes?: string | null;
      category?: string | null;
      supplierType?: string | null;
      location?: string | null;
      createdAt?: string;
      updatedAt?: string;
      rejectionReason?: string;
    };
    // Normalize ACTIVE to APPROVED so both show under the Approved tab
    const rawStatus = extended.status || 'PENDING_APPROVAL';
    const normalizedStatus = rawStatus === 'ACTIVE' ? 'APPROVED' : rawStatus;
    return {
      id: v.id,
      name: v.name,
      email: v.email,
      status: normalizedStatus,
      submittedAt: extended.updatedAt
        ? new Date(extended.updatedAt).toISOString().slice(0, 10)
        : new Date(extended.createdAt || Date.now()).toISOString().slice(0, 10),
      phone: extended.phone ?? null,
      contactPerson: extended.contactPerson ?? null,
      website: extended.website ?? null,
      address: extended.address ?? null,
      gstNumber: extended.gstNumber ?? null,
      panNumber: extended.panNumber ?? null,
      bankName: extended.bankName ?? null,
      bankAccountNumber: extended.bankAccountNumber ?? null,
      bankIfscCode: extended.bankIfscCode ?? null,
      bankBranch: extended.bankBranch ?? null,
      onboardingNotes: extended.onboardingNotes ?? null,
      category: extended.category ?? null,
      supplierType: extended.supplierType ?? null,
      location: extended.location ?? null,
      isSubmitted: extended.isSubmitted,
      documentSummary: extended.documentSummary,
      rejectionReason: extended.rejectionReason ?? null,
      documents: extended.documents || [],
    };
    });
  } catch {
    apiVendors = [];
  }
  return [...selfReg, ...apiVendors];
}

async function mockVendors(): Promise<Vendor[]> {
  return MOCK_VENDORS;
}

async function mockApproveVendor(
  id: string,
  _message?: string,
  _meta?: {
    email?: string;
    name?: string;
    phone?: string;
    contactPerson?: string;
    category?: string;
    supplierType?: string;
    onboardingNotes?: string;
  }
): Promise<void> {
  updateSelfRegisteredStatus(id, 'APPROVED');
  await new Promise((r) => setTimeout(r, 200));
}

async function apiApproveVendor(
  vendorId: string,
  message?: string,
  meta?: {
    email?: string;
    name?: string;
    phone?: string;
    contactPerson?: string;
    category?: string;
    supplierType?: string;
    onboardingNotes?: string;
  }
): Promise<void> {
  updateSelfRegisteredStatus(vendorId, 'APPROVED');
  const res = await apiRequest<{ data?: { id?: string } }>(`/procurement/approve-vendor/${vendorId}`, {
    method: 'POST',
    body: JSON.stringify({
      notes: message || '',
      vendorEmail: meta?.email,
      vendorName: meta?.name,
      phone: meta?.phone,
      contactPerson: meta?.contactPerson,
      category: meta?.category,
      supplierType: meta?.supplierType,
      onboardingNotes: meta?.onboardingNotes,
    }),
  });

  if (res?.data?.id) {
    const list = getSelfRegisteredVendors();
    const next = list.map((item) =>
      item.id === vendorId || item.vendorNo === vendorId || item.email === meta?.email
        ? { ...item, id: res.data!.id!, status: 'APPROVED' as const }
        : item
    );
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('vendor_queue_updated'));
      window.dispatchEvent(new CustomEvent('vendors_updated'));
    }
  }
}

async function mockRejectVendor(id: string, reason?: string, _meta?: { email?: string; name?: string }): Promise<void> {
  updateSelfRegisteredStatus(id, 'REJECTED', reason);
  await new Promise((r) => setTimeout(r, 200));
}

async function apiRejectVendor(
  vendorId: string,
  reason?: string,
  meta?: { email?: string; name?: string }
): Promise<void> {
  const handled = updateSelfRegisteredStatus(vendorId, 'REJECTED', reason);
  try {
    await apiRequest(`/procurement/reject-vendor/${vendorId}`, {
      method: 'POST',
      body: JSON.stringify({
        reason: reason || '',
        vendorEmail: meta?.email,
        vendorName: meta?.name,
      }),
    });
  } catch (err) {
    if (!handled) throw err;
  }
}

const MOCK_INVITATIONS: VendorInvitationRow[] = [];

async function mockListInvitations(): Promise<VendorInvitationRow[]> {
  return [...MOCK_INVITATIONS];
}

async function apiListInvitations(): Promise<VendorInvitationRow[]> {
  const data = await apiRequest<{ invitations: VendorInvitationRow[] }>(
    '/procurement/onboarding-invitations'
  );
  return pickList<VendorInvitationRow>(data, ['invitations']);
}

export type SendInvitationResult = {
  invitation: VendorInvitationRow;
  emailSent: boolean;
  message?: string;
};

async function mockSendInvitation(payload: SendInvitationPayload): Promise<SendInvitationResult> {
  const row: VendorInvitationRow = {
    id: String(Date.now()),
    companyName: payload.companyName,
    contactEmail: payload.contactEmail,
    contactPerson: payload.contactPerson,
    contactPhone: payload.contactPhone,
    category: payload.category || null,
    categoryId: payload.categoryId || null,
    supplierType: payload.supplierType || null,
    notes: payload.notes,
    sentAt: new Date().toISOString().slice(0, 10),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    status: 'pending',
    inviteCode: `HLX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  };
  MOCK_INVITATIONS.unshift(row);
  return { invitation: row, emailSent: true };
}

async function apiSendInvitation(payload: SendInvitationPayload): Promise<SendInvitationResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/procurement/onboarding-invitations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        companyName: payload.companyName,
        contactEmail: payload.contactEmail,
        contactPerson: payload.contactPerson,
        contactPhone: payload.contactPhone,
        category: payload.category,
        categoryId: payload.categoryId,
        supplierType: payload.supplierType,
        notes: payload.notes,
        items: payload.items,
        documentIds: payload.documentIds,
        flexiFields: payload.flexiFields,
        ndaMndaRequired: payload.ndaMndaRequired,
        ndaRequired: payload.ndaRequired,
        mndaRequired: payload.mndaRequired,
        anyOtherRequired: payload.anyOtherRequired,
        ndaTemplateId: payload.ndaTemplateId,
        mndaTemplateId: payload.mndaTemplateId,
        anyOtherTemplateId: payload.anyOtherTemplateId,
      }),
    });
  } catch {
    throw new Error(
      `Cannot reach backend at ${API_BASE}. Open a terminal and run: cd Heliflow_Client_Backend → npm run dev`
    );
  }
  let json: { success?: boolean; data?: SendInvitationResult; message?: string; error?: string };
  try {
    json = await res.json();
  } catch {
    throw new Error('Invalid response from server');
  }
  if (!res.ok || !json.success) {
    throw new Error(json.error || json.message || `Request failed (${res.status})`);
  }
  const data = json.data!;
  return {
    invitation: data.invitation,
    emailSent: Boolean(data.emailSent),
    message: json.message,
  };
}

async function mockResendInvitation(id: string): Promise<void> {
  const idx = MOCK_INVITATIONS.findIndex((i) => i.id === id);
  if (idx >= 0) MOCK_INVITATIONS[idx] = { ...MOCK_INVITATIONS[idx], status: 'in_queue' };
}

async function apiResendInvitation(vendorId: string): Promise<void> {
  await apiRequest(`/procurement/onboarding-invitations/${vendorId}/resend`, { method: 'POST' });
}

async function mockDeleteInvitation(id: string): Promise<void> {
  const idx = MOCK_INVITATIONS.findIndex((i) => i.id === id);
  if (idx >= 0) MOCK_INVITATIONS.splice(idx, 1);
}

async function apiDeleteInvitation(vendorId: string): Promise<void> {
  await apiRequest(`/procurement/onboarding-invitations/${vendorId}`, { method: 'DELETE' });
}

async function mockGetVendorDocuments(_vendorId: string) {
  return { documents: [], summary: { required: 7, uploaded: 0, pending: 0, verified: 0, rejected: 0 } };
}

async function apiGetVendorDocuments(vendorId: string) {
  const selfReg = getSelfRegisteredVendors().find((r) => r.id === vendorId || r.vendorNo === vendorId);
  if (selfReg && selfReg.documents && selfReg.documents.length > 0) {
    const docs: VendorDocument[] = selfReg.documents.map((doc, idx) => ({
      id: `${selfReg.id}_doc_${idx}`,
      vendorId: selfReg.id,
      documentType: doc.label || doc.type,
      originalName: doc.fileName,
      publicUrl: doc.dataUrl || '',
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      status: 'PENDING',
      uploadedAt: doc.uploadedAt || selfReg.submittedAt,
    }));
    return {
      documents: docs,
      summary: {
        required: docs.length,
        uploaded: docs.length,
        pending: docs.length,
        verified: 0,
        rejected: 0,
      },
      requiredDocuments: [],
    };
  }
  return apiRequest<{ documents: VendorDocument[]; summary: DocumentSummary; requiredDocuments: string[] }>(
    `/procurement/vendors/${vendorId}/documents`
  );
}

async function mockGetVendorProfile(vendorId: string) {
  const selfReg = getSelfRegisteredVendors().find((r) => r.id === vendorId || r.vendorNo === vendorId);
  if (selfReg) {
    return {
      id: selfReg.id,
      vendorNo: selfReg.vendorNo,
      name: selfReg.name,
      email: selfReg.email,
      phone: selfReg.phone,
      contactPerson: selfReg.contactPerson,
      category: selfReg.category,
      supplierType: selfReg.supplierType,
      onboardingNotes: selfReg.notes,
      status: selfReg.status,
      createdAt: selfReg.submittedAt,
      isSelfRegistered: true,
      documents: selfReg.documents || [],
    };
  }
  return {
    id: vendorId,
    name: 'Mock Vendor',
    email: 'mock@example.com',
    phone: '+254712345678',
    contactPerson: 'John Doe',
    website: 'https://example.com',
    address: '123 Test Street, Nairobi, Kenya',
    gstNumber: 'GST123456',
    panNumber: 'PAN123456',
    bankName: 'Test Bank',
    bankAccountNumber: '1234567890',
    bankIfscCode: 'TEST0001234',
    bankBranch: 'Nairobi Main',
    onboardingNotes: 'Test onboarding notes',
    category: 'General',
    location: 'Nairobi',
    status: 'PENDING_APPROVAL',
    isActive: false,
    createdAt: new Date().toISOString(),
  };
}

async function apiGetVendorProfile(vendorId: string) {
  const selfReg = getSelfRegisteredVendors().find((r) => r.id === vendorId || r.vendorNo === vendorId);
  if (selfReg) {
    return {
      id: selfReg.id,
      vendorNo: selfReg.vendorNo,
      name: selfReg.name,
      email: selfReg.email,
      phone: selfReg.phone,
      contactPerson: selfReg.contactPerson,
      category: selfReg.category,
      supplierType: selfReg.supplierType,
      onboardingNotes: selfReg.notes,
      status: selfReg.status,
      createdAt: selfReg.submittedAt,
      isSelfRegistered: true,
      documents: selfReg.documents || [],
    };
  }
  return apiRequest<Record<string, unknown>>(`/procurement/vendors/${vendorId}/profile`);
}

async function mockDocumentAction(_documentId: string, _reason?: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
}

async function apiVerifyDocument(documentId: string): Promise<void> {
  await apiRequest(`/procurement/vendor-documents/${documentId}/verify`, { method: 'POST' });
}

async function apiRejectDocument(documentId: string, reason: string): Promise<void> {
  await apiRequest(`/procurement/vendor-documents/${documentId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export interface VendorSearchResult {
  id: string;
  name: string;
  email: string;
  contactPerson: string | null;
  phone?: string | null;
  contactPhone?: string | null;
  status: string;
  isActive: boolean;
  score: number;
}

async function mockSearchVendors(_q: string): Promise<VendorSearchResult[]> {
  await new Promise((r) => setTimeout(r, 200));
  // Return empty results for mock — real data comes from API
  return [];
}

async function apiSearchVendors(q: string): Promise<VendorSearchResult[]> {
  const data = await apiRequest<{ vendors: VendorSearchResult[] }>(
    `/procurement/vendor-search?q=${encodeURIComponent(q)}`,
    { cacheTtlMs: 0, skipCacheBust: false }
  );
  return data.vendors || [];
}

async function mockListPendingDocuments(): Promise<PendingVendorDocument[]> {
  return [];
}

async function apiListPendingDocuments(): Promise<PendingVendorDocument[]> {
  const data = await apiRequest<{ documents: PendingVendorDocument[] }>('/procurement/pending-documents');
  return pickList<PendingVendorDocument>(data, ['documents']);
}

export const procurementService = {
  getOnboardingQueue: USE_MOCK ? mockOnboardingQueue : apiOnboardingQueue,
  listPendingVendors: USE_MOCK ? mockVendors : apiOnboardingQueue,
  approveVendor: USE_MOCK ? mockApproveVendor : apiApproveVendor,
  rejectVendor: USE_MOCK ? mockRejectVendor : apiRejectVendor,
  listInvitations: USE_MOCK ? mockListInvitations : apiListInvitations,
  sendInvitation: USE_MOCK ? mockSendInvitation : apiSendInvitation,
  resendInvitation: USE_MOCK ? mockResendInvitation : apiResendInvitation,
  deleteInvitation: USE_MOCK ? mockDeleteInvitation : apiDeleteInvitation,
  getVendorDocuments: USE_MOCK ? mockGetVendorDocuments : apiGetVendorDocuments,
  getVendorProfile: USE_MOCK ? mockGetVendorProfile : apiGetVendorProfile,
  verifyDocument: USE_MOCK ? mockDocumentAction : apiVerifyDocument,
  rejectDocument: USE_MOCK ? mockDocumentAction : apiRejectDocument,
  listPendingDocuments: USE_MOCK ? mockListPendingDocuments : apiListPendingDocuments,
  searchVendors: USE_MOCK ? mockSearchVendors : apiSearchVendors,
  registerVendor: async (payload: VendorSelfRegistrationPayload) => {
    const record = saveSelfRegisteredVendor(payload);
    try {
      if (!USE_MOCK) {
        const res = await apiRequest<{ success?: boolean; data?: { vendorNo?: string; id?: string } }>(
          '/public/vendor-register',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
        if (res?.data) {
          const nextId = res.data.id || record.id;
          const nextVendorNo = res.data.vendorNo || record.vendorNo;
          record.id = nextId;
          record.vendorNo = nextVendorNo;
          const existing = getSelfRegisteredVendors();
          const next = existing.map((r) =>
            r.email === record.email ? { ...r, id: nextId, vendorNo: nextVendorNo } : r
          );
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(next));
          }
        }
      }
    } catch {
      // Local/offline fallback already stored in localStorage
    }
    return record;
  },
};
