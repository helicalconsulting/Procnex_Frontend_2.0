import { API_BASE, apiRequest, getClientInstanceId } from '../api/client';
import { getTenantCompanyCode } from '../utils/tenantResolver';

export interface TaskUser {
  id: string;
  fullName: string;
  email: string;
  department?: string | null;
  username?: string;
}

export interface TaskAttachment {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  deadline: string;
  status: 'pending' | 'completed' | 'reassigned' | string;
  companyCode?: string | null;
  assignedById: string;
  assignedBy: TaskUser;
  assignedToId: string;
  assignedTo: TaskUser;
  currentAssigneeId?: string | null;
  currentAssignee?: TaskUser | null;
  attachments?: TaskAttachment[];
  creatorHasUnseenUpdate?: boolean;
  assigneeHasUnseenUpdate?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  tasks: TaskItem[];
  pendingCount: number;
  creatorUnseenCount?: number;
  assigneeUnseenCount?: number;
  totalIndicationCount?: number;
  hasUnseenUpdate?: boolean;
  currentUserId: string;
}

export const taskService = {
  /**
   * Fetch tasks for current user
   */
  async getTasks(params?: {
    type?: 'assigned_to_me' | 'assigned_by_me' | 'all';
    status?: string;
    search?: string;
  }): Promise<TaskListResponse> {
    const query = new URLSearchParams();
    if (params?.type) query.append('type', params.type);
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    if (params?.search) query.append('search', params.search);

    const queryString = query.toString();
    const endpoint = `/tasks${queryString ? `?${queryString}` : ''}`;

    const res = await apiRequest<TaskListResponse>(endpoint, {
      cacheTtlMs: 0,
    });
    return res;
  },

  /**
   * Create a new task with optional file attachments
   */
  async createTask(formData: FormData): Promise<TaskItem> {
    const token =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('heliflow_token') || localStorage.getItem('heliflow_vendor_token')
        : null;
    const companyCode = getTenantCompanyCode();

    const headers: Record<string, string> = {
      'X-Client-Instance-Id': getClientInstanceId(),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (companyCode) headers['X-Company-Code'] = companyCode;

    const response = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.message || errJson.error || 'Failed to create task');
    }

    const json = await response.json();
    return json.data;
  },

  /**
   * Update task status or reassign to another user
   */
  async updateTaskStatus(
    id: string,
    payload: { status?: string; reassignToUserId?: string }
  ): Promise<TaskItem> {
    const res = await apiRequest<TaskItem>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res;
  },

  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<void> {
    await apiRequest(`/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Mark all tasks seen for current user
   */
  async markTasksSeen(): Promise<void> {
    try {
      await apiRequest('/tasks/mark-seen', {
        method: 'POST',
      });
    } catch {
      // Non-blocking
    }
  },
};
