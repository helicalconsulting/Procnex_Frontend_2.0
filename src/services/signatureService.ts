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
    const vendorStr = localStorage.getItem('heliflow_vendor_session') || localStorage.getItem('heliflow_vendor_user');
    const vendor = vendorStr ? JSON.parse(vendorStr) : null;
    const code = (user?.companyCode || vendor?.companyCode || vendor?.tenantId || 'DEFAULT').toUpperCase();
    const id = user?.id || vendor?.id || vendor?.vendorId || 'USER';
    return `heliflow_signatures_${code}_${id}`;
  } catch {
    return 'heliflow_signatures';
  }
}

function getDocSigStorageKey(): string {
  try {
    const userStr = localStorage.getItem('heliflow_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const vendorStr = localStorage.getItem('heliflow_vendor_session') || localStorage.getItem('heliflow_vendor_user');
    const vendor = vendorStr ? JSON.parse(vendorStr) : null;
    const code = (user?.companyCode || vendor?.companyCode || vendor?.tenantId || 'DEFAULT').toUpperCase();
    const id = user?.id || vendor?.id || vendor?.vendorId || 'USER';
    return `heliflow_doc_signatures_${code}_${id}`;
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
  try {
    localStorage.setItem(getSigStorageKey(), JSON.stringify(sigs));
  } catch {}
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
  try {
    localStorage.setItem(getDocSigStorageKey(), JSON.stringify(records));
  } catch {}
}

function cacheNamedSignatures(sigs: Array<{ name?: string; signedByName?: string; dataUrl?: string; userId?: string }>) {
  if (typeof window === 'undefined') return;
  for (const s of sigs) {
    const n = (s.name || s.signedByName || '').toLowerCase();
    const url = s.dataUrl;
    if (!url) continue;
    try {
      if (n.includes('mahi') || s.userId === '6a7d5a46bab343663a43aaad') {
        localStorage.setItem('heliflow_sig_mahi', url);
      }
      if (n.includes('nischal') || s.userId === '6a4a8823de28b3ac89d1a4cb') {
        localStorage.setItem('heliflow_sig_nischal', url);
      }
      if (n.includes('kanika') || n.includes('pari')) {
        localStorage.setItem('heliflow_sig_kanika', url);
      }
    } catch {}
  }
}

// In-Memory Fast Caches for 0ms Instant Rendering
let cachedSignatures: SavedSignature[] | null = null;
let inFlightListPromise: Promise<SavedSignature[]> | null = null;
const docSigCache = new Map<string, { expiresAt: number; data: DocumentSignatureRecord[] }>();
const inFlightDocSigPromises = new Map<string, Promise<DocumentSignatureRecord[]>>();

function getCached(): SavedSignature[] {
  if (cachedSignatures && cachedSignatures.length > 0) {
    return cachedSignatures;
  }
  const fromStorage = readSigs();
  if (fromStorage.length > 0) {
    cachedSignatures = fromStorage;
    cacheNamedSignatures(fromStorage);
    return fromStorage;
  }
  return [];
}

function getCachedDocSignatures(module: string, referenceId: string): DocumentSignatureRecord[] {
  const norm = (module || '').trim();
  const mappedModule = MODULE_MAP[norm] || MODULE_MAP[norm.toUpperCase()] || (norm.toUpperCase().includes('PURCHASE') ? 'PURCHASE_ORDER' : norm.toUpperCase());
  const cacheKey = `${mappedModule}:${referenceId}`;
  const entry = docSigCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  const allDocSigs = readDocSigs();
  const matching = allDocSigs.filter(
    (d) =>
      (d.module === mappedModule || d.module === module || module.toLowerCase().includes(d.module.toLowerCase())) &&
      String(d.referenceId) === String(referenceId)
  );
  if (matching.length > 0) {
    docSigCache.set(cacheKey, { expiresAt: Date.now() + 60000, data: matching });
    return matching;
  }
  return [];
}

async function mockList(): Promise<SavedSignature[]> {
  const cached = getCached();
  if (cached.length > 0) return cached;
  await new Promise((r) => setTimeout(r, 100));
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
  const updated = [sig, ...sigs];
  writeSigs(updated);
  cachedSignatures = updated;
  cacheNamedSignatures(updated);
  return sig;
}

async function mockDelete(id: string | number): Promise<void> {
  const updated = readSigs().filter((s) => s.id !== id);
  writeSigs(updated);
  cachedSignatures = updated;
}

async function mockSetDefault(id: string | number): Promise<void> {
  const updated = readSigs().map((s) => ({ ...s, isDefault: s.id === id }));
  writeSigs(updated);
  cachedSignatures = updated;
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

async function apiList(forceRefresh = false): Promise<SavedSignature[]> {
  if (!forceRefresh && cachedSignatures && cachedSignatures.length > 0) {
    if (!inFlightListPromise) {
      inFlightListPromise = apiRequest<SavedSignature[]>('/signatures', { cacheTtlMs: 30000 })
        .then((sigs) => {
          if (Array.isArray(sigs) && sigs.length > 0) {
            cachedSignatures = sigs;
            writeSigs(sigs);
            cacheNamedSignatures(sigs);
          }
          return sigs;
        })
        .catch(() => cachedSignatures || [])
        .finally(() => { inFlightListPromise = null; });
    }
    return cachedSignatures;
  }

  if (inFlightListPromise) return inFlightListPromise;

  const local = getCached();
  inFlightListPromise = apiRequest<SavedSignature[]>('/signatures', { cacheTtlMs: 30000 })
    .then((sigs) => {
      if (Array.isArray(sigs)) {
        cachedSignatures = sigs;
        writeSigs(sigs);
        cacheNamedSignatures(sigs);
        return sigs;
      }
      return local;
    })
    .catch((err) => {
      console.warn('Failed to fetch signatures from API, using cached:', err);
      return local;
    })
    .finally(() => {
      inFlightListPromise = null;
    });

  return inFlightListPromise;
}

async function apiCreate(data: { name: string; dataUrl: string; type: 'drawn' | 'uploaded' }): Promise<SavedSignature> {
  const created = await apiRequest<SavedSignature>('/signatures', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const current = getCached();
  const updated = [created, ...current.filter((s) => s.id !== created.id)];
  cachedSignatures = updated;
  writeSigs(updated);
  cacheNamedSignatures(updated);
  return created;
}

async function apiDelete(id: string | number): Promise<void> {
  await fetch(`${API_BASE}/signatures/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const current = getCached();
  const updated = current.filter((s) => s.id !== id);
  cachedSignatures = updated;
  writeSigs(updated);
}

async function apiSetDefault(id: string | number): Promise<void> {
  await fetch(`${API_BASE}/signatures/${id}/default`, {
    method: 'PUT',
    headers: authHeaders(),
  });
  const current = getCached();
  const updated = current.map((s) => ({ ...s, isDefault: s.id === id }));
  cachedSignatures = updated;
  writeSigs(updated);
}

const MODULE_MAP: Record<string, string> = {
  Payments: 'INVOICE',
  PAYMENTS: 'INVOICE',
  AccountsPayable: 'INVOICE',
  'Accounts Payable': 'INVOICE',
  PurchaseInvoice: 'INVOICE',
  'Purchase Invoice': 'INVOICE',
  PurchaseOrder: 'PURCHASE_ORDER',
  PurchaseOrders: 'PURCHASE_ORDER',
  'Purchase Order': 'PURCHASE_ORDER',
  'Purchase Orders': 'PURCHASE_ORDER',
  PURCHASEORDER: 'PURCHASE_ORDER',
  PURCHASEORDERS: 'PURCHASE_ORDER',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  RFQ: 'RFQ',
  RFQs: 'RFQ',
  Quotation: 'QUOTATION',
  Quotations: 'QUOTATION',
};

async function apiSignDocument(payload: SignDocumentPayload): Promise<DocumentSignatureRecord> {
  const norm = (payload.module || '').trim();
  const mappedModule = MODULE_MAP[norm] || MODULE_MAP[norm.toUpperCase()] || (norm.toUpperCase().includes('PURCHASE') ? 'PURCHASE_ORDER' : norm.toUpperCase());

  // Optimistic local persistence for 0ms instant display
  const userStr = typeof window !== 'undefined' ? localStorage.getItem('heliflow_user') : null;
  const user = userStr ? JSON.parse(userStr) : null;
  const userName = user?.name || user?.fullName || 'Authorized Approver';

  const optimisticRecord: DocumentSignatureRecord = {
    id: `opt_${Date.now()}`,
    module: mappedModule,
    referenceId: String(payload.referenceId),
    signatureId: payload.signatureId,
    signedBy: userName,
    signedAt: new Date().toISOString(),
    dataUrl: payload.dataUrl || '',
    levelNumber: payload.levelNumber || 1,
    comments: payload.comments,
  };

  // 1. Write to local doc signatures
  const existingDocSigs = readDocSigs().filter(
    (d) => !(d.module === mappedModule && String(d.referenceId) === String(payload.referenceId) && Number(d.levelNumber) === Number(payload.levelNumber))
  );
  writeDocSigs([...existingDocSigs, optimisticRecord]);

  // 2. Update in-memory cache
  const cacheKey = `${mappedModule}:${payload.referenceId}`;
  const currCache = docSigCache.get(cacheKey)?.data || [];
  docSigCache.set(cacheKey, {
    expiresAt: Date.now() + 60000,
    data: [...currCache.filter((d) => Number(d.levelNumber) !== Number(payload.levelNumber)), optimisticRecord],
  });

  // 3. Pre-seed document-specific approvers storage so documents open with 0ms delay
  const ref = payload.referenceId;
  const approverItem = {
    levelNumber: payload.levelNumber || 1,
    level: `Level ${payload.levelNumber || 1}`,
    name: userName,
    approverName: userName,
    signedByName: userName,
    status: 'APPROVED',
    signatureUrl: payload.dataUrl,
    dataUrl: payload.dataUrl,
    date: new Date().toISOString().slice(0, 10),
    comments: payload.comments,
  };

  try {
    const updateStorageList = (key: string) => {
      const existing = sessionStorage.getItem(key) || localStorage.getItem(key);
      const list = existing ? JSON.parse(existing) : [];
      const updated = Array.isArray(list)
        ? [...list.filter((x: any) => Number(x.levelNumber) !== Number(payload.levelNumber)), approverItem]
        : [approverItem];
      sessionStorage.setItem(key, JSON.stringify(updated));
      localStorage.setItem(key, JSON.stringify(updated));
    };

    if (mappedModule === 'PURCHASE_ORDER') {
      updateStorageList(`approvers_${ref}`);
    } else if (mappedModule === 'INVOICE') {
      updateStorageList(`invoice_approvers_${ref}`);
      updateStorageList(`voucher_approvers_${ref}`);
    }
  } catch {}

  // 4. Send to API with skipCacheBust: true to keep document cache intact
  try {
    const res = await apiRequest<DocumentSignatureRecord>('/signatures/sign', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        module: mappedModule,
      }),
      skipCacheBust: true,
    });
    return res;
  } catch (err) {
    console.warn('API document signing recorded locally:', err);
    return optimisticRecord;
  }
}

async function apiGetDocumentSignatures(module: string, referenceId: string): Promise<DocumentSignatureRecord[]> {
  const norm = (module || '').trim();
  const mappedModule = MODULE_MAP[norm] || MODULE_MAP[norm.toUpperCase()] || (norm.toUpperCase().includes('PURCHASE') ? 'PURCHASE_ORDER' : norm.toUpperCase());
  const cacheKey = `${mappedModule}:${referenceId}`;

  // Check memory cache
  const cached = docSigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Deduplicate in-flight requests for the exact same module & reference
  if (inFlightDocSigPromises.has(cacheKey)) {
    return inFlightDocSigPromises.get(cacheKey)!;
  }

  const localCached = getCachedDocSignatures(module, referenceId);

  const fetchPromise = apiRequest<DocumentSignatureRecord[]>(`/signatures/document/${mappedModule}/${referenceId}`, { cacheTtlMs: 30000 })
    .then((serverSigs) => {
      const records = Array.isArray(serverSigs) ? serverSigs : [];
      // Merge with local signatures
      const existing = readDocSigs();
      const combined = [...existing.filter((d) => !(d.module === mappedModule && String(d.referenceId) === String(referenceId))), ...records];
      writeDocSigs(combined);
      docSigCache.set(cacheKey, { expiresAt: Date.now() + 60000, data: records.length > 0 ? records : localCached });
      cacheNamedSignatures(records);
      return records.length > 0 ? records : localCached;
    })
    .catch(() => localCached)
    .finally(() => {
      inFlightDocSigPromises.delete(cacheKey);
    });

  inFlightDocSigPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export const signatureService = {
  list: USE_MOCK ? mockList : apiList,
  create: USE_MOCK ? mockCreate : apiCreate,
  delete: USE_MOCK ? mockDelete : apiDelete,
  setDefault: USE_MOCK ? mockSetDefault : apiSetDefault,
  signDocument: USE_MOCK ? mockSignDocument : apiSignDocument,
  getDocumentSignatures: USE_MOCK ? mockGetDocumentSignatures : apiGetDocumentSignatures,
  getCached,
  getCachedDocSignatures,
};

// Auto pre-warm on module load in browser
if (typeof window !== 'undefined') {
  setTimeout(() => {
    signatureService.list().catch(() => {});
  }, 50);
}

