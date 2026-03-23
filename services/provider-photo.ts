/**
 * Provider photo upload service — uploads to S3 via backend presigned URLs,
 * stores the URL on the provider record in DynamoDB.
 */

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Request a presigned S3 upload URL from the backend.
 */
export async function getPresignedUploadUrl(
  providerId: string,
  contentType: string,
): Promise<{ uploadUrl: string; photoUrl: string }> {
  if (!API_BASE) throw new Error('API_BASE_URL not configured');

  const res = await fetch(`${API_BASE}/uploads/provider-photo/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ providerId, contentType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to get presigned URL: ${res.status}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * Upload a local file to S3 using the presigned PUT URL.
 */
export async function uploadFileToS3(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }
}

/**
 * Confirm the upload — saves the photo URL to the provider record in DynamoDB.
 */
export async function confirmProviderPhotoUpload(
  providerId: string,
  photoUrl: string,
): Promise<void> {
  if (!API_BASE) throw new Error('API_BASE_URL not configured');

  const res = await fetch(`${API_BASE}/uploads/provider-photo/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ providerId, photoUrl }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to confirm upload: ${res.status}`);
  }
}

/**
 * Full upload flow: pick → presign → upload to S3 → confirm with backend.
 */
export async function uploadProviderPhoto(
  providerId: string,
  fileUri: string,
): Promise<string> {
  // Infer content type from URI extension
  const ext = fileUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentTypeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const contentType = contentTypeMap[ext] ?? 'image/jpeg';

  // 1. Get presigned URL
  const { uploadUrl, photoUrl } = await getPresignedUploadUrl(providerId, contentType);

  // 2. Upload file to S3
  await uploadFileToS3(uploadUrl, fileUri, contentType);

  // 3. Confirm with backend (saves URL to DynamoDB)
  await confirmProviderPhotoUpload(providerId, photoUrl);

  return photoUrl;
}
