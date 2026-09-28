import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/mock', () => ({ USE_MOCK: false }));
vi.mock('../authService', () => ({ authService: { getToken: () => 'test-token' } }));
vi.mock('../../api/client', () => ({ apiRequest: vi.fn(), API_BASE: '/api', invalidateApiCache: vi.fn() }));
const { apiRequest } = await import('../../api/client');
const { adminService } = await import('../adminService');
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });

describe('approval level API contract', () => {
  it.each(['up', 'down'] as const)('persists a reorder with direction %s', async direction => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    await adminService.reorderApprovalLevel('level-a', direction);
    expect(apiRequest).toHaveBeenCalledWith('/admin/approval-levels/level-a/reorder', { method: 'PUT', body: JSON.stringify({ direction }) });
  });
  it('surfaces reorder failures for optimistic rollback', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('Save failed'));
    await expect(adminService.reorderApprovalLevel('level-a', 'down')).rejects.toThrow('Save failed');
  });
  it('surfaces deletion failures instead of reporting a removed level', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('Not permitted'));
    await expect(adminService.deleteApprovalLevel('level-a')).rejects.toThrow('Not permitted');
  });
});
