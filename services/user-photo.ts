import { apiClient } from '@/lib/api-client';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Profile-photo transport + presigned-URL freshness contract.
 *
 * ROOT CAUSE CONTEXT (bug: "photo showed for a while, now only initials")
 *
 * The backend (`cos-backend/src/routes/upload.routes.ts`,
 * `GET /v1/uploads/user-photo/download`) signs the S3 GET with
 * `expiresIn: 3600` — the URL is valid for exactly ONE HOUR.
 *
 * The client used to fetch that URL once per provider mount and hold it in
 * React state for the whole process lifetime. A React Native app commonly
 * stays resident for days (background → foreground, no cold start), so
 * roughly one hour after launch every <Image> pointed at a URL whose
 * signature had expired. S3 answers those with 403, RN fires `onError`,
 * and the avatar latched to initials permanently — because the URL string
 * never changed, nothing ever reset the failure flag.
 *
 * Two constants below encode the contract. Keep CLIENT_TTL comfortably
 * below SIGNATURE_TTL so we always re-sign BEFORE the signature dies,
 * with room for device clock skew and a slow network round-trip.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Server-side presigned GET lifetime. Mirrors `expiresIn: 3600` in upload.routes.ts. */
export const PHOTO_SIGNATURE_TTL_MS = 60 * 60 * 1000;

/**
 * How long the client is willing to reuse a signed URL. Deliberately 15
 * minutes short of the signature TTL: if this ever creeps above
 * PHOTO_SIGNATURE_TTL_MS we are back to serving dead URLs, so the
 * relationship is asserted in `assertPhotoTtlInvariant()` below.
 */
export const PHOTO_URL_CLIENT_TTL_MS = 45 * 60 * 1000;

/**
 * Minimum gap between two on-demand re-sign attempts. Without this a
 * genuinely broken image (object deleted in S3) would re-sign on every
 * render/error cycle and hammer the API.
 */
export const PHOTO_RESIGN_MIN_INTERVAL_MS = 5_000;

/**
 * Result of asking the backend for a download URL.
 *
 * Why a tagged union instead of `string | null`: `null` conflated two very
 * different states — "this user has no photo" (render initials, correct)
 * and "the request failed" (transient; must be retried, must NOT be cached
 * as a negative). Callers that treat them the same show initials forever
 * after a single network blip during app launch.
 */
export type PhotoDownloadResult =
  | { status: 'ok'; url: string }
  | { status: 'none' }
  | { status: 'error' };

/**
 * Request a presigned upload URL for a new profile photo.
 *
 * @param fileName Original file name; only used to build the S3 key suffix.
 * @param contentType One of image/jpeg | image/png | image/webp (enforced server-side).
 * @returns `uploadUrl` (short-lived PUT target) and `photoUrl` (the UNSIGNED
 *          canonical object URL — persist it, never render it directly; the
 *          bucket is private so an unsigned URL always 403s).
 */
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

/**
 * Tell the backend the bytes landed in S3 so it persists `photoUrl` on the
 * user record. The backend HEADs the object first and refuses to persist a
 * URL that points at nothing.
 */
export async function confirmPhotoUpload(photoUrl: string): Promise<void> {
  await apiClient.post('/v1/uploads/user-photo/confirm', { photoUrl });
}

/**
 * Fetch a freshly signed download URL, distinguishing "no photo" from "call
 * failed".
 *
 * Never logs the URL: a presigned S3 URL is a bearer credential for that
 * object, and the object is a patient's face. Errors are classified, not
 * printed.
 */
export async function fetchPhotoDownloadUrl(): Promise<PhotoDownloadResult> {
  try {
    const response = await apiClient.get('/v1/uploads/user-photo/download');
    const url = response.data?.data?.downloadUrl;
    if (typeof url === 'string' && url.length > 0) {
      return { status: 'ok', url };
    }
    // Backend explicitly returned `downloadUrl: null` — either no photoUrl is
    // stored, or the stored key no longer exists in S3 (it HEADs first). Both
    // are "there is nothing to render", not "retry me".
    return { status: 'none' };
  } catch {
    // Network failure, 401 mid-token-refresh, 5xx — transient. The caller
    // must keep whatever it had and try again later.
    return { status: 'error' };
  }
}

/**
 * Back-compat wrapper for callers that still want `string | null`.
 *
 * Prefer `fetchPhotoDownloadUrl()` — this signature is exactly the one that
 * made a transient failure indistinguishable from "no photo set".
 *
 * @deprecated Use {@link fetchPhotoDownloadUrl} so failures can be retried.
 */
export async function getPhotoDownloadUrl(): Promise<string | null> {
  const result = await fetchPhotoDownloadUrl();
  return result.status === 'ok' ? result.url : null;
}

/**
 * True when the URL carries an AWS SigV4 query signature.
 *
 * The bucket is private, so an unsigned `https://<bucket>.s3.<region>.amazonaws.com/...`
 * URL can NEVER render — it 403s every time. Several call sites used to fall
 * back to the stored unsigned URL when the download call failed, which
 * guaranteed a broken image that looked identical to "no photo set".
 */
export function isSignedPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('X-Amz-Signature=');
}

/**
 * Dev-time guard on the TTL relationship described in the header comment.
 * Returns the problem as a string (rather than throwing) so it can be
 * surfaced or asserted by a test without risking a runtime crash.
 */
export function assertPhotoTtlInvariant(): string | null {
  if (PHOTO_URL_CLIENT_TTL_MS >= PHOTO_SIGNATURE_TTL_MS) {
    return 'PHOTO_URL_CLIENT_TTL_MS must stay below PHOTO_SIGNATURE_TTL_MS';
  }
  return null;
}

/* ── Re-sign broker ────────────────────────────────────────────────────────
 *
 * The avatar component (components/icons/EntityIcon.tsx) is generic — it
 * renders doctors, agencies, clinics and the signed-in patient. It must be
 * able to ask "this image URL just failed to load; is there a fresher signed
 * version of it?" WITHOUT importing the user-photo React store (which would
 * couple a leaf presentational component to a provider it may not sit under,
 * and would do nothing for the doctor/agency cases anyway).
 *
 * So the store registers a re-signer here at mount, and EntityIcon asks this
 * module. Any URL the registered re-signer does not own returns null
 * immediately, so non-patient avatars pay nothing.
 */

type PhotoResigner = (failedUrl: string) => Promise<string | null>;

let activeResigner: PhotoResigner | null = null;

/**
 * Register the function that can mint a fresh signed URL for the signed-in
 * user's photo. Called by UserPhotoProvider.
 *
 * @returns an unregister function; safe to call from a useEffect cleanup.
 */
export function registerPhotoResigner(resigner: PhotoResigner): () => void {
  activeResigner = resigner;
  return () => {
    if (activeResigner === resigner) activeResigner = null;
  };
}

/**
 * Ask the registered re-signer for a fresh URL to replace one that just
 * failed to load.
 *
 * @param failedUrl the exact URI the <Image> was given when it errored.
 * @returns a different, freshly signed URL, or null if nothing can be done
 *          (no re-signer registered, the URL belongs to another entity, the
 *          re-sign itself failed, or the backend says there is no photo).
 */
export async function resolveResignedPhotoUrl(
  failedUrl: string | null | undefined,
): Promise<string | null> {
  if (!failedUrl || !activeResigner) return null;
  try {
    const fresh = await activeResigner(failedUrl);
    // A re-sign that returns the same string is not a retry — treat it as a
    // dead end so the caller falls through to initials instead of looping.
    return fresh && fresh !== failedUrl ? fresh : null;
  } catch {
    return null;
  }
}
