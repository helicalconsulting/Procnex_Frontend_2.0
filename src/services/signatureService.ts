import { USE_MOCK } from '../config/mock';
import { API_BASE, apiRequest, authHeaders } from '../api/client';

export interface SavedSignature {
  id: number | string;
  name: string;
  dataUrl: string;
  type: 'drawn' | 'uploaded';
  isDefault: boolean;
  createdAt: string;
}

export interface DocumentSignatureRecord {
  id: string;
  module: string;
  referenceId: string;
  signatureId: string;
  signedBy: string;
  signedAt: string;
  dataUrl: string;
  levelNumber?: number;
  comments?: string;
}

export interface SignDocumentPayload {
  module: string;
  referenceId: string;
  signatureId: string;
  dataUrl?: string;
  levelNumber?: number;
  comments?: string;
}

function getSigStorageKey(): string {
  try {
    const userStr = localStorage.getItem('heliflow_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const code = user?.companyCode || 'DEFAULT';
    return `heliflow_signatures_${code}`;
  } catch {
    return 'heliflow_signatures';
  }
}

function getDocSigStorageKey(): string {
  try {
    const userStr = localStorage.getItem('heliflow_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const code = user?.companyCode || 'DEFAULT';
    return `heliflow_doc_signatures_${code}`;
  } catch {
    return 'heliflow_doc_signatures';
  }
}

function readSigs(): SavedSignature[] {
  try {
    const raw = localStorage.getItem(getSigStorageKey());
    const list: SavedSignature[] = raw ? JSON.parse(raw) : [];
    const seen = new Set<string>();
    const unique: SavedSignature[] = [];
    for (const s of list) {
      if (!s.dataUrl) continue;
      if (seen.has(s.dataUrl)) continue;
      seen.add(s.dataUrl);
      unique.push(s);
    }
    return unique;
  } catch {
    return [];
  }
}

function writeSigs(sigs: SavedSignature[]) {
  localStorage.setItem(getSigStorageKey(), JSON.stringify(sigs));
}

function readDocSigs(): DocumentSignatureRecord[] {
  try {
    const raw = localStorage.getItem(getDocSigStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeDocSigs(records: DocumentSignatureRecord[]) {
  localStorage.setItem(getDocSigStorageKey(), JSON.stringify(records));
}

async function mockList(): Promise<SavedSignature[]> {
  await new Promise((r) => setTimeout(r, 200));
  return readSigs();
}

async function mockCreate(data: { name: string; dataUrl: string; type: 'drawn' | 'uploaded' }): Promise<SavedSignature> {
  const sigs = readSigs();
  const existing = sigs.find((s) => s.dataUrl === data.dataUrl);
  if (existing) return existing;
  const sig: SavedSignature = {
    id: Date.now(),
    name: data.name,
    dataUrl: data.dataUrl,
    type: data.type,
    isDefault: sigs.length === 0,
    createdAt: new Date().toISOString(),
  };
  writeSigs([sig, ...sigs]);
  return sig;
}

async function mockDelete(id: string | number): Promise<void> {
  writeSigs(readSigs().filter((s) => s.id !== id));
}

async function mockSetDefault(id: string | number): Promise<void> {
  writeSigs(readSigs().map((s) => ({ ...s, isDefault: s.id === id })));
}

async function mockSignDocument(payload: SignDocumentPayload): Promise<DocumentSignatureRecord> {
  const sig = readSigs().find((s) => s.id === payload.signatureId);
  const userStr = localStorage.getItem('heliflow_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const userName = user?.name || user?.fullName || 'Authorized Approver';

  const record: DocumentSignatureRecord = {
    id: String(Date.now()),
    module: payload.module,
    referenceId: payload.referenceId,
    signatureId: payload.signatureId,
    signedBy: userName,
    signedAt: new Date().toISOString(),
    dataUrl: payload.dataUrl || sig?.dataUrl || '',
    levelNumber: payload.levelNumber,
    comments: payload.comments,
  };
  const existingDocSigs = readDocSigs().filter(
    (d) => !(d.module === payload.module && String(d.referenceId) === String(payload.referenceId) && Number(d.levelNumber) === Number(payload.levelNumber))
  );
  writeDocSigs([...existingDocSigs, record]);
  return record;
}

async function mockGetDocumentSignatures(module: string, referenceId: string): Promise<DocumentSignatureRecord[]> {
  return readDocSigs().filter((d) => (d.module === module || module.toLowerCase().includes(d.module.toLowerCase()) || d.module.toLowerCase().includes(module.toLowerCase())) && String(d.referenceId) === String(referenceId));
}

async function apiList(): Promise<SavedSignature[]> {
  return apiRequest<SavedSignature[]>('/signatures');
}

async function apiCreate(data: { name: string; dataUrl: string; type: 'drawn' | 'uploaded' }): Promise<SavedSignature> {
  return apiRequest<SavedSignature>('/signatures', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

async function apiDelete(id: string | number): Promise<void> {
  await fetch(`${API_BASE}/signatures/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

async function apiSetDefault(id: string | number): Promise<void> {
  await fetch(`${API_BASE}/signatures/${id}/default`, {
    method: 'PUT',
    headers: authHeaders(),
  });
}

const MODULE_MAP: Record<string, string> = {
  Payments: 'INVOICE',
  AccountsPayable: 'INVOICE',
  PurchaseInvoice: 'INVOICE',
  PurchaseOrder: 'PURCHASE_ORDER',
  RFQ: 'RFQ',
  Quotation: 'QUOTATION',
};

async function apiSignDocument(payload: SignDocumentPayload): Promise<DocumentSignatureRecord> {
  const mappedModule = MODULE_MAP[payload.module] || payload.module.toUpperCase();
  return apiRequest<DocumentSignatureRecord>('/signatures/sign', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      module: mappedModule,
    }),
  });
}

async function apiGetDocumentSignatures(module: string, referenceId: string): Promise<DocumentSignatureRecord[]> {
  const mappedModule = MODULE_MAP[module] || module.toUpperCase();
  return apiRequest<DocumentSignatureRecord[]>(`/signatures/document/${mappedModule}/${referenceId}`);
}

export const signatureService = {
  list: USE_MOCK ? mockList : apiList,
  create: USE_MOCK ? mockCreate : apiCreate,
  delete: USE_MOCK ? mockDelete : apiDelete,
  setDefault: USE_MOCK ? mockSetDefault : apiSetDefault,
  signDocument: USE_MOCK ? mockSignDocument : apiSignDocument,
  getDocumentSignatures: USE_MOCK ? mockGetDocumentSignatures : apiGetDocumentSignatures,
};
