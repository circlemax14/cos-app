/**
 * Per-user-scoped storage for in-progress assessment drafts (SCRUM-367).
 *
 * The assessment stepper persists partial answers so a user can leave
 * the screen and return without losing what they entered. These drafts
 * are clinical-questionnaire responses (PHQ-9 etc.) — i.e. PHI under
 * HIPAA. The v1 implementation in `app/Home/assessment-stepper.tsx`
 * wrote them to AsyncStorage under a key derived only from the
 * instrument id (`assessment-draft:<instrumentId>`), which meant:
 *
 *   1. **No per-user scoping.** Signing out as user A and in as user B
 *      on the same device exposed A's in-progress answers to B until B
 *      either submitted or cleared the same instrument id.
 *
 *   2. **Plaintext JSON at rest.** Anyone with on-device access (e.g. a
 *      stolen unlocked device, a forensic extract) could read it.
 *
 * This module fixes (1) by prefixing every key with the authenticated
 * Cognito sub, and registers an explicit cleanup pass the sign-out
 * flow can call to evict the outgoing user's drafts. (2) is mitigated
 * structurally by (1) — only the matching user can read the key, and
 * we fail closed when no user is signed in — without taking on the
 * cost / migration risk of moving questionnaire drafts into
 * SecureStore (which has a small per-entry size cap and a noticeably
 * slower write path that would back-pressure the stepper UI). See the
 * audit doc (STORAGE-001) for the full reasoning.
 *
 * Key layout: `assessment_<userSub>_draft_<instrumentId>`.
 *
 * Read/write/clear all fail closed when the user is unknown: a missing
 * sub yields a null read, a no-op write, and a no-op clear. The
 * stepper UI already treats a null draft as "start fresh", so there's
 * no behavioural regression for signed-in users.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getCachedProfile } from './cached-profile'

/**
 * Key prefix used by all assessment-draft entries. Exported so the
 * sign-out cleanup can sweep `${ASSESSMENT_DRAFT_KEY_PREFIX}<sub>_`
 * without re-deriving the format.
 */
export const ASSESSMENT_DRAFT_KEY_PREFIX = 'assessment_'

export interface AssessmentDraft {
  stepIdx: number
  answers: Record<string, unknown>
}

/**
 * Pure: build the AsyncStorage key for a (userSub, instrumentId) pair.
 * Exported solely for unit tests — callers should go through
 * load/save/clear which resolve the userSub from the cached profile.
 */
export function assessmentDraftKey(userSub: string, instrumentId: string): string {
  return `${ASSESSMENT_DRAFT_KEY_PREFIX}${userSub}_draft_${instrumentId}`
}

async function currentUserSub(): Promise<string | null> {
  const profile = await getCachedProfile()
  const sub = profile?.sub
  return typeof sub === 'string' && sub.length > 0 ? sub : null
}

/**
 * Load this user's in-progress draft for the given instrument. Returns
 * null if no user is signed in, no draft exists, or the stored payload
 * is malformed.
 */
export async function loadAssessmentDraft(
  instrumentId: string,
): Promise<AssessmentDraft | null> {
  if (!instrumentId) return null
  const sub = await currentUserSub()
  if (!sub) return null
  try {
    const raw = await AsyncStorage.getItem(assessmentDraftKey(sub, instrumentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AssessmentDraft
    if (
      parsed &&
      typeof parsed.stepIdx === 'number' &&
      parsed.answers &&
      typeof parsed.answers === 'object'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/**
 * Save (overwrite) this user's draft for the given instrument. No-op
 * when no user is signed in — best-effort behaviour matches v1.
 */
export async function saveAssessmentDraft(
  instrumentId: string,
  draft: AssessmentDraft,
): Promise<void> {
  if (!instrumentId) return
  const sub = await currentUserSub()
  if (!sub) return
  try {
    await AsyncStorage.setItem(
      assessmentDraftKey(sub, instrumentId),
      JSON.stringify(draft),
    )
  } catch {
    /* draft persistence is best-effort */
  }
}

/**
 * Delete this user's draft for the given instrument (called on
 * successful submit).
 */
export async function clearAssessmentDraft(instrumentId: string): Promise<void> {
  if (!instrumentId) return
  const sub = await currentUserSub()
  if (!sub) return
  try {
    await AsyncStorage.removeItem(assessmentDraftKey(sub, instrumentId))
  } catch {
    /* ignore */
  }
}

/**
 * Sign-out cleanup: remove every assessment draft owned by the given
 * user. Called from `services/auth.ts` so the next user on the device
 * doesn't inherit the previous user's in-progress answers.
 *
 * Defensive: iterates AsyncStorage keys rather than relying on a known
 * instrument list, so drafts for instruments the user no longer has
 * access to are still cleaned up.
 */
export async function clearAllAssessmentDraftsForUser(userSub: string): Promise<void> {
  if (!userSub) return
  try {
    const keys = await AsyncStorage.getAllKeys()
    const userPrefix = `${ASSESSMENT_DRAFT_KEY_PREFIX}${userSub}_`
    const owned = keys.filter((k) => k.startsWith(userPrefix))
    if (owned.length > 0) {
      await AsyncStorage.multiRemove(owned)
    }
  } catch {
    /* non-fatal */
  }
}
