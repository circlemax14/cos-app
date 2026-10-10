/**
 * COS-1152 — everything a device must forget when a session ends.
 *
 * There are TWO ways a session ends, and only one of them was cleaning up.
 *
 *   services/auth.ts signOut()      — the user taps Sign out. Purges the
 *                                     React Query cache, the cached profile,
 *                                     the cached user summary, the PHI
 *                                     AsyncStorage keys, tokens and username.
 *   lib/api-client.ts forceSignOut()— a 401 whose refresh failed. Purged
 *                                     tokens and the username. Nothing else.
 *
 * The second path is the COMMON one: an expired or revoked session, a rotated
 * refresh token, a password change on another device. The deliberate path
 * carries a comment explaining precisely why the query cache must go —
 * "PHI-bearing query responses (patients, health plans, providers, etc.)
 * can't be observed by the next signed-in user" — and that reasoning applies
 * identically to an involuntary sign-out. It simply was not wired there.
 *
 * On a shared device (and a care setting is full of them) the window is real:
 * the patient hooks use a 10-minute staleTime against a 10-minute gcTime, so
 * for up to ten minutes the next account's mount is served the previous
 * account's records FROM CACHE, with no HTTP request to fail and nothing on
 * screen to hint at it.
 *
 * ─── WHY A THIRD MODULE ──────────────────────────────────────────────
 *
 * services/auth.ts imports lib/api-client.ts, so api-client cannot import
 * auth.ts back without a cycle. Both import this instead. It deliberately
 * knows nothing about tokens or navigation — those differ between the two
 * paths and stay with their callers.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { clearCachedProfile } from '@/lib/cached-profile';
import { clearCachedUserSummary } from '@/lib/cached-user-summary';
import { queryClient } from '@/providers/QueryProvider';

/**
 * AsyncStorage key prefixes holding PHI.
 *
 *  - 'doctor_data_<providerId>'        cached doctor lookups (who the user sees)
 *  - 'assessment-draft:<instrumentId>' in-flight PHQ-9 / PROMIS / etc. drafts
 *  - 'assessment_'                     defensive: legacy/alternate naming
 */
export const PHI_KEY_PREFIXES = [
  'doctor_data_',
  'assessment-draft:',
  'assessment_',
] as const;

/** Best-effort sweep of PHI-bearing AsyncStorage keys. Returns what it removed. */
export async function purgePhiAsyncStorageKeys(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const doomed = keys.filter((k) => PHI_KEY_PREFIXES.some((p) => k.startsWith(p)));
    if (doomed.length > 0) await AsyncStorage.multiRemove(doomed);
    return [...doomed];
  } catch {
    // Never block a sign-out on cleanup. The alternative — throwing here —
    // leaves the user signed in WITH the data still cached, which is worse.
    return [];
  }
}

/**
 * Forget every local trace of the outgoing account's health data.
 *
 * Deliberately NOT token clearing: the two callers differ on ordering and on
 * what they do afterwards, and conflating them is how one path ends up
 * half-done again.
 *
 * Every step is independently guarded. A failure in one must not prevent the
 * others — a partial purge is bad, but a purge that stops at the first error
 * leaves strictly more behind.
 */
export async function purgeLocalPhi(): Promise<void> {
  try {
    // Removes all queries and mutations and resets internal state, so a
    // subsequent mount cannot be served the outgoing account's response.
    queryClient.clear();
  } catch {
    /* non-fatal */
  }
  try {
    await clearCachedProfile();
  } catch {
    /* non-fatal */
  }
  try {
    await clearCachedUserSummary();
  } catch {
    /* non-fatal */
  }
  await purgePhiAsyncStorageKeys();
  /*
   * MOB-03 — local notifications are the outgoing account's data too.
   * Plan-task and calendar reminders are scheduled up to 7 days ahead and only
   * the NEXT signed-in user's reconcile used to cancel them, so after sign-out
   * the previous patient's medication reminders kept firing on a shared phone.
   * Every one of them belongs to the outgoing session; the next sign-in's
   * reconcile reschedules its own.
   */
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* non-fatal */
  }
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    /* non-fatal */
  }
}
