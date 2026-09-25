import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { pickList } from '../api/normalize';
import { mapVendorToTableRow, MOCK_VENDORS } from '../api/mappers';
import { VENDORS_PAGE_MOCK } from '../mocks/vendorsPage.mock';
import type { VendorTableRow } from '../types/viewModels';
import type { Vendor } from '../types';

export interface CreateVendorPayload {
  name: string;
  email: string;
  phone?: string;
  contactPerson?: string;
  category?: string;
  categoryId?: string;
  location?: string;
  website?: string;
  isMobileAccessEnabled?: boolean;
}

export interface UpdateVendorPayload {
  name?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  category?: string;
  categoryId?: string;
  location?: string;
  website?: string;
  isActive?: boolean;
  isMobileAccessEnabled?: boolean;
}

async function mockList(): Promise<VendorTableRow[]> {
  await new Promise((r) => setTimeout(r, 300));
  return VENDORS_PAGE_MOCK;
}

async function apiList(): Promise<VendorTableRow[]> {
  const data = await apiRequest<{ vendors: Vendor[] }>('/vendors?limit=100');
  const vendors = pickList<Vendor>(data, ['vendors']);
  return vendors.map((v) => mapVendorToTableRow(v as Vendor & Record<string, unknown>));
}

async function mockListTyped(): Promise<Vendor[]> {
  return MOCK_VENDORS;
}

async function apiListTyped(): Promise<Vendor[]> {
  const data = await apiRequest<{ vendors: Vendor[] }>('/vendors?limit=100');
  return pickList<Vendor>(data, ['vendors']);
}

async function mockCreate(payload: CreateVendorPayload): Promise<VendorTableRow> {
  await new Promise((r) => setTimeout(r, 300));
  const row: VendorTableRow = {
    id: String(Date.now()),
    name: payload.name,
    email: payload.email,
    phone: payload.phone || '—',
    contactPerson: payload.contactPerson || payload.name,
    category: payload.category || 'General',
    location: payload.location || '—',
    website: payload.website || '—',
    isActive: false,
    initials: payload.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    avatarMod: '1',
    avgQuality: 0,
    avgDelivery: 0,
    avgPriceScore: 0,
    overallScore: 0,
    totalOrders: 0,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  VENDORS_PAGE_MOCK.unshift(row);
  return row;
}

async function apiCreate(payload: CreateVendorPayload): Promise<VendorTableRow> {
  const vendor = await apiRequest<Vendor>('/vendors', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      // If categoryId is provided, send it; otherwise send just the category name
      category: payload.category || undefined,
      categoryId: payload.categoryId || undefined,
    }),
  });
  return mapVendorToTableRow(vendor as Vendor & Record<string, unknown>);
}

async function mockUpdate(id: string, payload: UpdateVendorPayload): Promise<VendorTableRow> {
  await new Promise((r) => setTimeout(r, 200));
  const idx = VENDORS_PAGE_MOCK.findIndex((v) => v.id === id);
  if (idx === -1) throw new Error('Vendor not found');
  const next = {
    ...VENDORS_PAGE_MOCK[idx],
    ...payload,
    ...(payload.phone !== undefined ? { phone: payload.phone || '—' } : {}),
    ...(payload.contactPerson !== undefined ? { contactPerson: payload.contactPerson || payload.name || VENDORS_PAGE_MOCK[idx].name } : {}),
    ...(payload.category !== undefined ? { category: payload.category || 'General' } : {}),
    ...(payload.location !== undefined ? { location: payload.location || '—' } : {}),
    ...(payload.website !== undefined ? { website: payload.website || '—' } : {}),
  };
  VENDORS_PAGE_MOCK[idx] = next;
  return next;
}

async function apiUpdate(id: string, payload: UpdateVendorPayload): Promise<VendorTableRow> {
  const vendor = await apiRequest<Vendor>(`/vendors/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...payload,
      category: payload.category || undefined,
      categoryId: payload.categoryId || undefined,
    }),
  });
  return mapVendorToTableRow(vendor as Vendor & Record<string, unknown>);
}

async function mockRemove(id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  const idx = VENDORS_PAGE_MOCK.findIndex((v) => v.id === id);
  if (idx === -1) throw new Error('Vendor not found');
  VENDORS_PAGE_MOCK.splice(idx, 1);
}

async function apiRemove(id: string): Promise<void> {
  await apiRequest(`/vendors/${id}`, { method: 'DELETE' });
}

async function mockResendPasswordSetup(_vendorId: string): Promise<{ emailSent: boolean }> {
  await new Promise((r) => setTimeout(r, 300));
  return { emailSent: true };
}

async function apiResendPasswordSetup(vendorId: string): Promise<{ emailSent: boolean }> {
  return apiRequest<{ emailSent: boolean }>(`/vendors/${vendorId}/resend-password-setup`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

async function mockChangePassword(
  _current: string,
  _newPassword: string,
  _confirm: string
): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
}

async function apiChangePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<void> {
  await apiRequest('/vendors/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
}

async function mockToggleVendorMobileAccess(id: string): Promise<{ isMobileAccessEnabled: boolean }> {
  await new Promise((r) => setTimeout(r, 200));
  const idStr = String(id);
  const v = VENDORS_PAGE_MOCK.find((v) => String(v.id) === idStr);
  if (v) {
    v.isMobileAccessEnabled = !v.isMobileAccessEnabled;
    return { isMobileAccessEnabled: v.isMobileAccessEnabled };
  }
  return { isMobileAccessEnabled: true };
}

async function apiToggleVendorMobileAccess(id: string): Promise<{ isMobileAccessEnabled: boolean }> {
  return apiRequest<{ isMobileAccessEnabled: boolean }>(`/vendors/${id}/toggle-mobile-access`, {
    method: 'PUT',
    body: JSON.stringify({}),
  });
}

export const vendorService = {
  list: USE_MOCK ? mockList : apiList,
  listTyped: USE_MOCK ? mockListTyped : apiListTyped,
  create: USE_MOCK ? mockCreate : apiCreate,
  update: USE_MOCK ? mockUpdate : apiUpdate,
  remove: USE_MOCK ? mockRemove : apiRemove,
  resendPasswordSetup: USE_MOCK ? mockResendPasswordSetup : apiResendPasswordSetup,
  changePassword: USE_MOCK ? mockChangePassword : apiChangePassword,
  toggleMobileAccess: USE_MOCK ? mockToggleVendorMobileAccess : apiToggleVendorMobileAccess,
};
