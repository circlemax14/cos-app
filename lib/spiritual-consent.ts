/**
 * Spiritual-consent gate — one-time acknowledgment before the user's first
 * spiritual check-in (FICA / HOPE / any future `domain: 'spiritual'`
 * instrument).
 *
 * Rationale (2026-07-28 Ken walk-and-talk locked-in default Q4): before
 * asking a patient about faith, meaning, or religious practice, surface a
 * one-tap warm consent so nobody is surprised by the ask. Everything
 * downstream is voluntary — the consent is a "you can skip anytime"
 * acknowledgment, not a legal-style opt-in.
 *
 * v1 shape (deliberately minimal so Ken's Sunday feedback can reshape it
 * cheaply): a single app-install-scoped boolean in AsyncStorage. Once
 * acknowledged, subsequent spiritual check-ins skip the modal for the
 * lifetime of the install. Log-out or re-install re-shows the modal.
 *
 * Not per-user by design in v1 — the AsyncStorage namespace is the
 * app-install, and a user session is bound to a single install for our
 * consumer flow. If Ken wants per-user reset (e.g. a caregiver testing
 * multiple patient accounts on one device), the fix is one line here:
 * change the key to include `userSub`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const SPIRITUAL_CONSENT_KEY = 'spiritual_consent_v1_acknowledged'

/** Read the current consent state. Missing / unreadable → false (default deny). */
export async function hasAcknowledgedSpiritualConsent(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(SPIRITUAL_CONSENT_KEY)
    return v === 'true'
  } catch {
    return false
  }
}

/** Write consent = true. Fire-and-forget-safe: swallows failures so a
 * disk-full / permission error doesn't block the user from taking the
 * check-in. Worst case: the modal re-appears next time (annoying but not
 * a data-loss). */
export async function acknowledgeSpiritualConsent(): Promise<void> {
  try {
    await AsyncStorage.setItem(SPIRITUAL_CONSENT_KEY, 'true')
  } catch {
    // Deliberately silent — see doc-comment.
  }
}

/** Testing / caregiver-switch helper. Not wired to any UI in v1. */
export async function resetSpiritualConsent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SPIRITUAL_CONSENT_KEY)
  } catch {
    // silent
  }
}
