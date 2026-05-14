/**
 * Mobile client for PR #118's entity-photo upload endpoints. Mirrors the
 * web client at cos-frontend/src/services/entity-photo-upload.service.ts
 * but uses the cos-app fetch pattern (EXPO_PUBLIC_API_BASE_URL + cookie
 * credentials) instead of the axios `api` instance.
 *
 * Two endpoints per entity type:
 *   POST /v1/uploads/{entity}-photo/presign  → { uploadUrl, photoUrl }
 *   POST /v1/uploads/{entity}-photo/confirm  → persists photoUrl on the row
 */

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL

export type EntityType = 'agency' | 'care-manager' | 'care-giver' | 'clinic'

export interface PresignArgs {
  entityType: EntityType
  entityId: string
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface PresignResult {
  uploadUrl: string
  photoUrl: string
}

export interface ConfirmArgs {
  entityType: EntityType
  entityId: string
  photoUrl: string
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  if (!API_BASE) throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured')
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error((errBody as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  const json = (await res.json()) as { success: boolean; data: T }
  return json.data
}

export async function presignEntityPhoto(args: PresignArgs): Promise<PresignResult> {
  return postJson<PresignResult>(`/v1/uploads/${args.entityType}-photo/presign`, {
    entityId: args.entityId,
    contentType: args.contentType,
  })
}

export async function confirmEntityPhoto(args: ConfirmArgs): Promise<void> {
  await postJson<{ message: string }>(`/v1/uploads/${args.entityType}-photo/confirm`, {
    entityId: args.entityId,
    photoUrl: args.photoUrl,
  })
}
