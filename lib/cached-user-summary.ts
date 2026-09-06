import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiny local cache for the side-menu user summary (SCRUM-265 #16).
 *
 * ProfileContent fetches name / email / photo from the API every time the
 * drawer opens, leaving "User" + a spinner on first paint until the round
 * trip resolves. This cache stores the trio in AsyncStorage so the
 * drawer renders instantly on every subsequent open; the API call still
 * runs in the background and updates the cache + UI when fresh data lands.
 *
 * Intentionally narrow: just name / email / photoUrl. Don't grow this
 * into a general user-profile cache — the canonical cache for full
 * profile state lives in lib/cached-profile.ts.
 */

const KEY = 'cos_cached_user_summary_v1';

export interface CachedUserSummary {
  name: string;
  email: string;
  photoUrl?: string;
  /**
   * COS-891 — when `photoUrl` was signed, as epoch ms.
   *
   * The photo URL is a PRESIGNED S3 URL with a one-hour signature
   * (upload.routes.ts `expiresIn: 3600`). Storing it without the time it was
   * signed makes it unusable: a reader cannot tell a URL signed a minute ago
   * from one signed last week, so the only safe thing to do with it is
   * nothing — which is exactly what happened. The field was written and never
   * read.
   *
   * With the timestamp, a cold start can reuse a still-valid URL and skip the
   * /v1/uploads/user-photo/download round trip entirely. Vishal: "we don't
   * have to call it every time from our server."
   */
  photoSignedAt?: number;
}

export async function getCachedUserSummary(): Promise<CachedUserSummary | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedUserSummary;
  } catch {
    return null;
  }
}

/**
 * COS-891 — merge one or more fields into the cache, keeping the rest.
 *
 * setCachedUserSummary() replaces the whole record, so a caller that only
 * knows the new photo had to supply a name and an email it may not have —
 * and the drawer's fetch was the ONLY writer, which is why uploading a photo
 * left the device holding the old one until that fetch happened to run again.
 * Vishal: "even when they try to update it, we will update the local storage
 * of the device."
 *
 * Callers pass only what changed.
 */
export async function updateCachedUserSummary(
  patch: Partial<CachedUserSummary>,
): Promise<void> {
  try {
    const current = (await getCachedUserSummary()) ?? { name: '', email: '' };
    await setCachedUserSummary({ ...current, ...patch });
  } catch {
    // Non-fatal, same as every other write here.
  }
}

export async function setCachedUserSummary(summary: CachedUserSummary): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    // Cache write failures are non-fatal — the next open will refetch.
  }
}

export async function clearCachedUserSummary(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
