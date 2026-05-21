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
