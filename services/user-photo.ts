import { apiClient } from '@/lib/api-client';

export async function getPresignedUploadUrl(
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; photoUrl: string }> {
  const response = await apiClient.post('/v1/uploads/user-photo/presign', {
    fileName,
    contentType,
  });
  return response.data.data;
}

export async function confirmPhotoUpload(photoUrl: string): Promise<void> {
  await apiClient.post('/v1/uploads/user-photo/confirm', { photoUrl });
}

export async function getPhotoDownloadUrl(): Promise<string | null> {
  try {
    const response = await apiClient.get('/v1/uploads/user-photo/download');
    return response.data.data.downloadUrl ?? null;
  } catch {
    return null;
  }
}
