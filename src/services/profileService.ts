import { apiRequest } from '../api/client';
import type { AuthResponse, User } from '../types';

export interface UserProfileDocument {
  id: number;
  documentType: string;
  originalName: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface UpdateProfilePayload {
  phone?: string;
  department?: string;
}

async function getDocuments(): Promise<UserProfileDocument[]> {
  const data = await apiRequest<{ documents: UserProfileDocument[] }>('/auth/profile/documents');
  return data.documents || [];
}

async function updateProfile(payload: UpdateProfilePayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<void> {
  await apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
}

export const profileService = {
  getDocuments,
  updateProfile,
  changePassword,
};

export type { User };
