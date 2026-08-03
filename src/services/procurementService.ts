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
  location?: string | null;
  rejectionReason?: string | null;
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
  notes?: string;
  sentAt: string;
  expiresAt: string;
  status: 'pending' | 'in_queue' | 'approved' | 'expired' | 'declined';
  inviteCode: string;
  items?: Array<{ itemCode: string; itemName: string }> | null;
  selectedDocuments?: Array<{ name: string; isRequired: boolean }> | null;
  documentIds?: string[];
}

export interface SendInvitationPayload {
  companyName: string;
  contactEmail: string;
  contactPerson?: string;
  contactPhone?: string;
  category?: string;
  categoryId?: string;
  notes?: string;
  items?: Array<{ itemCode: string; itemName: string }>;
  documentIds?: string[];
  ndaMndaRequired?: boolean;
  ndaRequired?: boolean;
  mndaRequired?: boolean;
  anyOtherRequired?: boolean;
  ndaTemplateId?: string;
  mndaTemplateId?: string;
  anyOtherTemplateId?: string;
}

const ONBOARDING_MOCK: OnboardingVendor[] = [
  { id: '10', name: 'LabTech Solutions', email: 'contact@labtech.in', status: 'PENDING_APPROVAL', submittedAt: '2024-04-25' },
  { id: '11', name: 'SteelWorks India', email: 'bid@steelworks.in', status: 'PENDING_APPROVAL', submittedAt: '2024-04-24' },
];

async function mockOnboardingQueue(): Promise<OnboardingVendor[]> {
  return ONBOARDING_MOCK;
}

async function apiOnboardingQueue(): Promise<OnboardingVendor[]> {
  const data = await apiRequest<{ vendors: Vendor[] }>('/procurement/vendor-approval-queue', {
    cacheTtlMs: 0,
  });
  const vendors = pickList<Vendor>(data, ['vendors']);
  return vendors.map((v) => {
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
      location: extended.location ?? null,
      documentSummary: extended.documentSummary,
      rejectionReason: extended.rejectionReason ?? null,
      documents: extended.documents || [],
    };
  });
}

async function mockVendors(): Promise<Vendor[]> {
  return MOCK_VENDORS;
}

async function mockApproveVendor(_id: string, _message?: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}

async function apiApproveVendor(vendorId: string, message?: string): Promise<void> {
  await apiRequest(`/procurement/approve-vendor/${vendorId}`, {
    method: 'POST',
    body: JSON.stringify({ notes: message || '' }),
  });
}

async function mockRejectVendor(_id: string, _reason?: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}

async function apiRejectVendor(vendorId: string, reason?: string): Promise<void> {
  await apiRequest(`/procurement/reject-vendor/${vendorId}`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || '' }),
  });
}

const MOCK_INVITATIONS: VendorInvitationRow[] = [];

async function mockListInvitations(): Promise<VendorInvitationRow[]> {
  return [...MOCK_INVITATIONS];
}

async function apiListInvitations(): Promise<VendorInvitationRow[]> {
  const data = await apiRequest<{ invitations: VendorInvitationRow[] }>(
    '/procurement/onboarding-invitations',
    { cacheTtlMs: 0 }
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
        notes: payload.notes,
        items: payload.items,
        documentIds: payload.documentIds,
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
  return apiRequest<{ documents: VendorDocument[]; summary: DocumentSummary; requiredDocuments: string[] }>(
    `/procurement/vendors/${vendorId}/documents`
  );
}

async function mockGetVendorProfile(_vendorId: string) {
  return {
    id: _vendorId,
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
};
