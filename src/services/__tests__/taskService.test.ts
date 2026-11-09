import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('../../api/client', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  API_BASE: 'http://localhost:3000/api',
  getClientInstanceId: () => 'mock-client-id',
}));

vi.mock('../../utils/tenantResolver', () => ({
  getTenantCompanyCode: () => 'HFL',
}));

const { taskService } = await import('../taskService');

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('taskService', () => {
  it('getTasks queries /tasks with correct params', async () => {
    apiRequestMock.mockResolvedValueOnce({ tasks: [], pendingCount: 0, currentUserId: 'u1' });

    const result = await taskService.getTasks({
      type: 'assigned_to_me',
      status: 'pending',
      search: 'audit',
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/tasks?type=assigned_to_me&status=pending&search=audit',
      expect.objectContaining({ cacheTtlMs: 0 })
    );
    expect(result.pendingCount).toBe(0);
  });

  it('createTask sends POST request with FormData and company header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'task-1',
          title: 'Audit Report',
          deadline: '2026-11-12T00:00:00Z',
          status: 'pending',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.append('title', 'Audit Report');
    formData.append('assignedToId', 'user-2');
    formData.append('deadline', '2026-11-12');

    const created = await taskService.createTask(formData);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/tasks');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Company-Code']).toBe('HFL');
    expect(options.headers['X-Client-Instance-Id']).toBe('mock-client-id');
    expect(created.id).toBe('task-1');
  });

  it('updateTaskStatus sends PATCH request with new status or reassign user', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'task-1',
      status: 'reassigned',
      currentAssigneeId: 'user-3',
    });

    const updated = await taskService.updateTaskStatus('task-1', {
      status: 'assigned_to_someone_else',
      reassignToUserId: 'user-3',
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/tasks/task-1/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          status: 'assigned_to_someone_else',
          reassignToUserId: 'user-3',
        }),
      })
    );
    expect(updated.status).toBe('reassigned');
  });

  it('deleteTask sends DELETE request to /tasks/:id', async () => {
    apiRequestMock.mockResolvedValueOnce(null);

    await taskService.deleteTask('task-1');

    expect(apiRequestMock).toHaveBeenCalledWith('/tasks/task-1', {
      method: 'DELETE',
    });
  });
});
