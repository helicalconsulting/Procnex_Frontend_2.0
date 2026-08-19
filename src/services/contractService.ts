import { USE_MOCK } from '../config/mock';
import { apiRequest, ApiError } from '../api/client';

// ─── Types ──────────────────────────────────────────────────

export interface Contract {
  id: string;
  companyCode: string;
  rfqId: string;
  vendorId: string;
  templateId: string | null;
  contractNumber: string;
  title: string;
  contractType: string;
  contentSnapshot: string;
  contractValue: number;
  currency: string;
  effectiveDate: string;
  expirationDate: string | null;
  autoRenewal: boolean;
  renewalPeriod: string | null;
  renewalNoticePeriod: string | null;
  contractOwnerId: string | null;
  department: string | null;
  priority: string;
  internalRef: string | null;
  // Commercial terms
  paymentTerms: string | null;
  paymentSchedule: string | null;
  deliveryTerms: string | null;
  deliveryLocation: string | null;
  leadTime: string | null;
  freightTerms: string | null;
  priceValidity: string | null;
  priceAdjustmentAllowed: boolean;
  retentionPercentage: number | null;
  advancePaymentPercent: number | null;
  taxPercentage: number | null;
  // Performance / SLA
  deliverySchedule: string | null;
  leadTimeCommitment: string | null;
  onTimeDeliveryReq: number | null;
  qualityAcceptCriteria: string | null;
  inspectionRequired: boolean;
  replacementTerms: string | null;
  // Penalties
  lateDeliveryPenalty: string | null;
  qualityFailurePenalty: string | null;
  slaBreachPenalty: string | null;
  maxPenaltyCap: string | null;
  // Warranty
  warrantyPeriod: string | null;
  supportPeriod: string | null;
  supportResponseTime: string | null;
  // Compliance
  confidentiality: boolean;
  dataProtection: boolean;
  antiBriberyCompliance: boolean;
  regulatoryCompliance: boolean;
  insuranceRequired: boolean;
  auditRights: boolean;
  // Legal
  governingLaw: string | null;
  jurisdiction: string | null;
  arbitrationRequired: boolean;
  arbitrationLocation: string | null;
  terminationNotice: string | null;
  terminationConvenience: boolean;
  terminationBreach: boolean;
  terminationConditions: string | null;
  // Status lifecycle
  status: string;
  signedByCustomerAt: string | null;
  signedByVendorAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations
  vendor?: { id: string; name: string; email: string };
  rfq?: { id: string; rfqNumber: string; title: string };
  contractOwner?: { id: string; fullName: string; email?: string };
  items?: ContractItem[];
  clauses?: ContractClause[];
  slaEntries?: ContractSLAEntry[];
  milestones?: ContractMilestone[];
  purchaseOrders?: Array<{ id: string; poNumber: string; totalAmount: number; status: string; createdAt: string }>;
  documentSignatures?: Array<{
    id: string;
    signature?: { dataUrl: string };
    signedBy?: { id: string; fullName: string };
    signedAt: string;
  }>;
  _count?: { purchaseOrders: number; items: number };
}

export interface ContractItem {
  id?: string;
  itemName: string;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  tax?: number;
  totalValue: number;
  deliveryDate?: string | null;
  deliveryLocation?: string | null;
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
  minCommitValue?: number | null;
  maxCommitValue?: number | null;
  committedQty?: number | null;
  flexibleQtyPct?: number | null;
}

export interface ContractClause {
  id?: string;
  category: string;
  title: string;
  contentSnapshot: string;
  displayOrder?: number;
  isRequired?: boolean;
}

export interface ContractSLAEntry {
  slaName: string;
  target?: string | null;
  measurementMethod?: string | null;
  reviewFrequency?: string | null;
  penaltyForBreach?: string | null;
}

export interface ContractMilestone {
  name: string;
  description?: string | null;
  dueDate?: string | null;
  paymentPercent: number;
  paymentAmount: number;
}

export interface ContractCreatePayload {
  rfqId: string;
  title: string;
  contractType: string;
  contractValue?: number;
  currency?: string;
  effectiveDate: string;
  expirationDate?: string | null;
  autoRenewal?: boolean;
  renewalPeriod?: string | null;
  renewalNoticePeriod?: string | null;
  contractOwnerId?: string | null;
  department?: string | null;
  priority?: string;
  internalRef?: string | null;
  // Commercial
  paymentTerms?: string | null;
  paymentSchedule?: string | null;
  deliveryTerms?: string | null;
  deliveryLocation?: string | null;
  leadTime?: string | null;
  freightTerms?: string | null;
  priceValidity?: string | null;
  priceAdjustmentAllowed?: boolean;
  retentionPercentage?: number | null;
  advancePaymentPercent?: number | null;
  taxPercentage?: number | null;
  // SLA
  deliverySchedule?: string | null;
  leadTimeCommitment?: string | null;
  onTimeDeliveryReq?: number | null;
  qualityAcceptCriteria?: string | null;
  inspectionRequired?: boolean;
  replacementTerms?: string | null;
  // Penalties
  lateDeliveryPenalty?: string | null;
  qualityFailurePenalty?: string | null;
  slaBreachPenalty?: string | null;
  maxPenaltyCap?: string | null;
  // Warranty
  warrantyPeriod?: string | null;
  supportPeriod?: string | null;
  supportResponseTime?: string | null;
  // Compliance
  confidentiality?: boolean;
  dataProtection?: boolean;
  antiBriberyCompliance?: boolean;
  regulatoryCompliance?: boolean;
  insuranceRequired?: boolean;
  auditRights?: boolean;
  // Legal
  governingLaw?: string | null;
  jurisdiction?: string | null;
  arbitrationRequired?: boolean;
  arbitrationLocation?: string | null;
  terminationNotice?: string | null;
  terminationConvenience?: boolean;
  terminationBreach?: boolean;
  terminationConditions?: string | null;
  // Nested
  items?: ContractItem[];
  clauses?: ContractClause[];
  slaEntries?: ContractSLAEntry[];
  milestones?: ContractMilestone[];
}

export interface ContractListResponse {
  contracts: Contract[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Mock Data ──────────────────────────────────────────────

const MOCK_CONTRACTS: Contract[] = [];

// ─── Vendor-specific methods ──────────────────────────────────

async function mockListVendorContracts(): Promise<ContractListResponse> {
  await new Promise(r => setTimeout(r, 300));
  // Return only contracts where vendorId matches a mock vendor ID
  const filtered = MOCK_CONTRACTS.filter(c => c.status === 'AWAITING_VENDOR_SIGNATURE' || c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON');
  return { contracts: filtered, total: filtered.length, page: 1, limit: 20, pages: 1 };
}

async function apiListVendorContracts(): Promise<ContractListResponse> {
  try {
    const data = await apiRequest<{ contracts: Contract[]; total?: number }>('/contracts/vendor/my-contracts', { cacheTtlMs: 30000 });
    const contracts = data?.contracts || [];
    return { contracts, total: data?.total ?? contracts.length, page: 1, limit: 20, pages: 1 };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for listVendorContracts — falling back to local data');
      return mockListVendorContracts();
    }
    throw err;
  }
}

async function mockGetVendorContract(id: string): Promise<{ contract: Contract } | null> {
  await new Promise(r => setTimeout(r, 200));
  const contract = MOCK_CONTRACTS.find(c => c.id === id);
  if (!contract) return null;
  return { contract };
}

async function apiGetVendorContract(id: string): Promise<{ contract: Contract }> {
  try {
    const data = await apiRequest<{ contract: Contract }>(`/contracts/vendor/my-contracts/${id}`);
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for getVendorContract — falling back to local data');
      const result = await mockGetVendorContract(id);
      if (!result) throw new Error('Contract not found');
      return result;
    }
    throw err;
  }
}

async function mockListContracts(params?: Record<string, string>): Promise<ContractListResponse> {
  await new Promise(r => setTimeout(r, 300));
  let filtered = [...MOCK_CONTRACTS];
  if (params?.status) filtered = filtered.filter(c => c.status === params.status);
  if (params?.type) filtered = filtered.filter(c => c.contractType === params.type);
  if (params?.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(c => c.contractNumber.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
  }
  return { contracts: filtered, total: filtered.length, page: 1, limit: 20, pages: 1 };
}

async function apiListContracts(params?: Record<string, string>): Promise<ContractListResponse> {
  try {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const data = await apiRequest<ContractListResponse>(`/contracts${query}`, { cacheTtlMs: 30000 });
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for listContracts — falling back to local data');
      return mockListContracts(params);
    }
    throw err;
  }
}

async function mockGetContract(id: string): Promise<{ contract: Contract; activity: unknown[] } | null> {
  await new Promise(r => setTimeout(r, 200));
  const contract = MOCK_CONTRACTS.find(c => c.id === id);
  if (!contract) return null;
  return { contract, activity: [] };
}

async function apiGetContract(id: string): Promise<{ contract: Contract; activity: unknown[] }> {
  try {
    const data = await apiRequest<{ contract: Contract; activity: unknown[] }>(`/contracts/${id}`);
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for getContract — falling back to local data');
      const result = await mockGetContract(id);
      if (!result) throw new Error('Contract not found');
      return result;
    }
    throw err;
  }
}

async function mockCreateContract(payload: ContractCreatePayload): Promise<Contract> {
  await new Promise(r => setTimeout(r, 500));
  const contract: Contract = {
    id: String(Date.now()),
    companyCode: 'HFL',
    rfqId: payload.rfqId,
    vendorId: '',
    templateId: null,
    contractNumber: `CON-${new Date().getFullYear()}-${String(MOCK_CONTRACTS.length + 1).padStart(4, '0')}`,
    title: payload.title,
    contractType: payload.contractType,
    contentSnapshot: '<h1>Contract</h1><p>Mock content</p>',
    contractValue: payload.contractValue || 0,
    currency: payload.currency || 'KES',
    effectiveDate: payload.effectiveDate,
    expirationDate: payload.expirationDate || null,
    autoRenewal: payload.autoRenewal || false,
    renewalPeriod: payload.renewalPeriod || null,
    renewalNoticePeriod: payload.renewalNoticePeriod || null,
    contractOwnerId: payload.contractOwnerId || null,
    department: payload.department || null,
    priority: payload.priority || 'Medium',
    internalRef: payload.internalRef || null,
    paymentTerms: payload.paymentTerms || null,
    paymentSchedule: payload.paymentSchedule || null,
    deliveryTerms: payload.deliveryTerms || null,
    deliveryLocation: payload.deliveryLocation || null,
    leadTime: payload.leadTime || null,
    freightTerms: payload.freightTerms || null,
    priceValidity: payload.priceValidity || null,
    priceAdjustmentAllowed: payload.priceAdjustmentAllowed || false,
    retentionPercentage: payload.retentionPercentage || null,
    advancePaymentPercent: payload.advancePaymentPercent || null,
    taxPercentage: payload.taxPercentage || null,
    deliverySchedule: payload.deliverySchedule || null,
    leadTimeCommitment: payload.leadTimeCommitment || null,
    onTimeDeliveryReq: payload.onTimeDeliveryReq || null,
    qualityAcceptCriteria: payload.qualityAcceptCriteria || null,
    inspectionRequired: payload.inspectionRequired || false,
    replacementTerms: payload.replacementTerms || null,
    lateDeliveryPenalty: payload.lateDeliveryPenalty || null,
    qualityFailurePenalty: payload.qualityFailurePenalty || null,
    slaBreachPenalty: payload.slaBreachPenalty || null,
    maxPenaltyCap: payload.maxPenaltyCap || null,
    warrantyPeriod: payload.warrantyPeriod || null,
    supportPeriod: payload.supportPeriod || null,
    supportResponseTime: payload.supportResponseTime || null,
    confidentiality: payload.confidentiality || false,
    dataProtection: payload.dataProtection || false,
    antiBriberyCompliance: payload.antiBriberyCompliance || false,
    regulatoryCompliance: payload.regulatoryCompliance || false,
    insuranceRequired: payload.insuranceRequired || false,
    auditRights: payload.auditRights || false,
    governingLaw: payload.governingLaw || 'Kenya',
    jurisdiction: payload.jurisdiction || 'Kenya',
    arbitrationRequired: payload.arbitrationRequired || false,
    arbitrationLocation: payload.arbitrationLocation || null,
    terminationNotice: payload.terminationNotice || null,
    terminationConvenience: payload.terminationConvenience || false,
    terminationBreach: payload.terminationBreach || false,
    terminationConditions: payload.terminationConditions || null,
    status: 'DRAFT',
    signedByCustomerAt: null,
    signedByVendorAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: payload.items || [],
    clauses: payload.clauses || [],
    slaEntries: payload.slaEntries || [],
    milestones: payload.milestones || [],
  };
  MOCK_CONTRACTS.push(contract);
  return contract;
}

async function apiCreateContract(payload: ContractCreatePayload): Promise<Contract> {
  try {
    const data = await apiRequest<Contract>('/contracts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for create — falling back to local creation');
      return mockCreateContract(payload);
    }
    throw err;
  }
}

async function mockUpdateContract(id: string, data: Partial<ContractCreatePayload>): Promise<Contract> {
  await new Promise(r => setTimeout(r, 300));
  const idx = MOCK_CONTRACTS.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Contract not found');
  MOCK_CONTRACTS[idx] = { ...MOCK_CONTRACTS[idx], ...data, updatedAt: new Date().toISOString() };
  return MOCK_CONTRACTS[idx];
}

async function apiUpdateContract(id: string, data: Partial<ContractCreatePayload>): Promise<Contract> {
  try {
    const result = await apiRequest<Contract>(`/contracts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return result;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for updateContract — falling back to local update');
      return mockUpdateContract(id, data);
    }
    throw err;
  }
}

async function mockDeleteContract(id: string): Promise<void> {
  await new Promise(r => setTimeout(r, 200));
  const idx = MOCK_CONTRACTS.findIndex(c => c.id === id);
  if (idx >= 0) MOCK_CONTRACTS.splice(idx, 1);
}

async function apiDeleteContract(id: string): Promise<void> {
  try {
    await apiRequest(`/contracts/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for deleteContract — falling back to local delete');
      return mockDeleteContract(id);
    }
    throw err;
  }
}

async function mockSignContractBuyer(id: string, signerName: string, signatureBase64: string): Promise<{ status: string }> {
  await new Promise(r => setTimeout(r, 500));
  const idx = MOCK_CONTRACTS.findIndex(c => c.id === id);
  if (idx >= 0) {
    MOCK_CONTRACTS[idx].status = 'AWAITING_VENDOR_SIGNATURE';
    MOCK_CONTRACTS[idx].signedByCustomerAt = new Date().toISOString();
  }
  return { status: 'AWAITING_VENDOR_SIGNATURE' };
}

async function apiSignContractBuyer(id: string, signerName: string, signerTitle: string | null, signatureBase64: string): Promise<{ status: string }> {
  try {
    const result = await apiRequest<{ status: string }>(`/contracts/${id}/sign-buyer`, {
      method: 'POST',
      body: JSON.stringify({ signerName, signerTitle, signatureBase64 }),
    });
    return result;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for signContractBuyer — falling back to local sign');
      return mockSignContractBuyer(id, signerName, signatureBase64);
    }
    throw err;
  }
}

async function mockSignContractVendor(id: string, signerName: string, signatureBase64: string): Promise<{ status: string }> {
  await new Promise(r => setTimeout(r, 500));
  const idx = MOCK_CONTRACTS.findIndex(c => c.id === id);
  if (idx >= 0) {
    MOCK_CONTRACTS[idx].status = 'ACTIVE';
    MOCK_CONTRACTS[idx].signedByVendorAt = new Date().toISOString();
  }
  return { status: 'ACTIVE' };
}

async function apiSignContractVendor(id: string, signerName: string, signerTitle: string | null, signatureBase64: string): Promise<{ status: string }> {
  try {
    const result = await apiRequest<{ status: string }>(`/contracts/${id}/sign-vendor`, {
      method: 'POST',
      body: JSON.stringify({ signerName, signerTitle, signatureBase64 }),
    });
    return result;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for signContractVendor — falling back to local sign');
      return mockSignContractVendor(id, signerName, signatureBase64);
    }
    throw err;
  }
}

async function mockTerminateContract(id: string, reason?: string): Promise<void> {
  await new Promise(r => setTimeout(r, 300));
  const idx = MOCK_CONTRACTS.findIndex(c => c.id === id);
  if (idx >= 0) MOCK_CONTRACTS[idx].status = 'TERMINATED';
}

async function apiTerminateContract(id: string, reason?: string): Promise<void> {
  try {
    await apiRequest(`/contracts/${id}/terminate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for terminateContract — falling back to local terminate');
      return mockTerminateContract(id, reason);
    }
    throw err;
  }
}

export interface ContractBalance {
  contractValue: number;
  currency: string;
  consumedValue: number;
  remainingValue: number;
  totalPOs: number;
}

async function mockGetContractBalance(id: string): Promise<ContractBalance> {
  await new Promise(r => setTimeout(r, 300));
  return {
    contractValue: 100000,
    currency: 'KES',
    consumedValue: 50000,
    remainingValue: 50000,
    totalPOs: 1,
  };
}

async function apiGetContractBalance(id: string): Promise<ContractBalance> {
  try {
    const data = await apiRequest<ContractBalance>(`/contracts/${id}/balance`);
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for getContractBalance — falling back to local');
      return mockGetContractBalance(id);
    }
    throw err;
  }
}

async function mockCreatePOFromContract(id: string, amount?: number): Promise<{ poNumber: string; consumedValue?: number; remainingValue?: number }> {
  await new Promise(r => setTimeout(r, 400));
  const contract = MOCK_CONTRACTS.find(c => c.id === id);
  const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const poAmount = amount || (contract?.contractValue || 50000);
  if (contract) {
    if (!contract.purchaseOrders) contract.purchaseOrders = [];
    contract.purchaseOrders.push({
      id: String(Date.now()),
      poNumber,
      totalAmount: poAmount,
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
    });
    if (!contract._count) contract._count = { purchaseOrders: 0, items: 0 };
    contract._count.purchaseOrders = contract.purchaseOrders.length;
  }
  return { poNumber, consumedValue: poAmount, remainingValue: Math.max(0, (contract?.contractValue || 100000) - poAmount) };
}

async function apiCreatePOFromContract(id: string, amount?: number): Promise<{ poNumber: string; consumedValue?: number; remainingValue?: number }> {
  try {
    const result = await apiRequest<{ poNumber: string; consumedValue?: number; remainingValue?: number }>(`/contracts/${id}/create-po`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    return result;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for createPOFromContract — falling back to local creation');
      return mockCreatePOFromContract(id, amount);
    }
    throw err;
  }
}

async function mockUpdatePostAwardDecision(rfqId: string, decision: string): Promise<void> {
  await new Promise(r => setTimeout(r, 200));
}

async function apiUpdatePostAwardDecision(rfqId: string, decision: string): Promise<void> {
  try {
    await apiRequest(`/contracts/rfq/${rfqId}/post-award-decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for post-award decision — skipping');
      return;
    }
    throw err;
  }
}

async function apiGenerateFromTemplate(rfqId: string, templateType: string, contractValue?: number, currency?: string): Promise<Contract> {
  try {
    const data = await apiRequest<Contract>('/contracts/generate', {
      method: 'POST',
      body: JSON.stringify({ rfqId, templateType, contractValue, currency }),
    });
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for generate — falling back to local generation');
      return mockGenerateFromTemplate(rfqId, templateType, contractValue, currency);
    }
    throw err;
  }
}

async function mockGenerateFromTemplate(rfqId: string, templateType: string, contractValue?: number, currency?: string): Promise<Contract> {
  return mockCreateContract({
    rfqId,
    title: `Contract from ${templateType}`,
    contractType: templateType,
    contractValue: contractValue || 0,
    currency: currency || 'KES',
    effectiveDate: new Date().toISOString().slice(0, 10),
  });
}

async function apiSendToVendor(id: string): Promise<{ status: string }> {
  try {
    const data = await apiRequest<{ status: string }>(`/contracts/${id}/send-to-vendor`, { method: 'POST' });
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for sendToVendor — falling back to local send');
      return mockSendToVendor(id);
    }
    throw err;
  }
}

async function mockSendToVendor(id: string): Promise<{ status: string }> {
  await new Promise(r => setTimeout(r, 300));
  const idx = MOCK_CONTRACTS.findIndex(c => c.id === id);
  if (idx >= 0) MOCK_CONTRACTS[idx].status = 'PENDING_VENDOR_SIGNATURE';
  return { status: 'PENDING_VENDOR_SIGNATURE' };
}

async function apiCompleteContract(id: string): Promise<{ status: string }> {
  try {
    const data = await apiRequest<{ status: string }>(`/contracts/${id}/complete`, { method: 'POST' });
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      console.warn('[ContractService] Auth required for completeContract — falling back to local completion');
      return mockCompleteContract(id);
    }
    throw err;
  }
}

async function mockCompleteContract(id: string): Promise<{ status: string }> {
  await new Promise(r => setTimeout(r, 200));
  const idx = MOCK_CONTRACTS.findIndex(c => c.id === id);
  if (idx >= 0) MOCK_CONTRACTS[idx].status = 'COMPLETED';
  return { status: 'COMPLETED' };
}

export const contractService = {
  listContracts: USE_MOCK ? mockListContracts : apiListContracts,
  getContract: USE_MOCK ? mockGetContract : apiGetContract,
  createContract: USE_MOCK ? mockCreateContract : apiCreateContract,
  updateContract: USE_MOCK ? mockUpdateContract : apiUpdateContract,
  deleteContract: USE_MOCK ? mockDeleteContract : apiDeleteContract,
  signContractBuyer: USE_MOCK ? mockSignContractBuyer : apiSignContractBuyer,
  signContractVendor: USE_MOCK ? mockSignContractVendor : apiSignContractVendor,
  terminateContract: USE_MOCK ? mockTerminateContract : apiTerminateContract,
  createPOFromContract: USE_MOCK ? mockCreatePOFromContract : apiCreatePOFromContract,
  getContractBalance: USE_MOCK ? mockGetContractBalance : apiGetContractBalance,
  updatePostAwardDecision: USE_MOCK ? mockUpdatePostAwardDecision : apiUpdatePostAwardDecision,
  generateFromTemplate: USE_MOCK ? mockGenerateFromTemplate : apiGenerateFromTemplate,
  sendToVendor: USE_MOCK ? mockSendToVendor : apiSendToVendor,
  completeContract: USE_MOCK ? mockCompleteContract : apiCompleteContract,
  listVendorContracts: USE_MOCK ? mockListVendorContracts : apiListVendorContracts,
  getVendorContract: USE_MOCK ? mockGetVendorContract : apiGetVendorContract,
};
