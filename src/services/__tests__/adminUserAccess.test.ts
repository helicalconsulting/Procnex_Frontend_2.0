import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/mock', () => ({ USE_MOCK: false }));
vi.mock('../authService', () => ({ authService: { getToken: () => 'test-token' } }));
vi.mock('../../api/client', () => ({ apiRequest: vi.fn(), API_BASE: '/api', invalidateApiCache: vi.fn() }));
const { adminService } = await import('../adminService');

afterEach(() => vi.unstubAllGlobals());

describe('create user mobile permission', () => {
  it.each([true, false])('sends the explicit permission %s in the multipart request', async isMobileAccessEnabled => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {
      id: 'test', fullName: 'Test User', username: 'test', email: 'test@example.com',
      isActive: true, createdAt: '2026-09-27T00:00:00Z', role: 'Purchase Clerk',
    } }) });
    vi.stubGlobal('fetch', fetchMock);
    await adminService.createUser({ fullName: 'Test User', username: 'test', email: 'test@example.com',
      password: 'test-only', roleName: 'Purchase Clerk', userType: 'rfq', isMobileAccessEnabled });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/users');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('isMobileAccessEnabled')).toBe(String(isMobileAccessEnabled));
  });
});
