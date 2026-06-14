/**
 * Thin wrapper over expo-haptics that:
 *   - Is fully cross-platform (Android calls Vibration via expo-haptics
 *     which falls back to subtle vibrate patterns; iOS uses the Taptic
 *     Engine).
 *   - Swallows errors so a missing native module on a future platform
 *     never crashes the app (expo-haptics is in deps, but defense in
 *     depth — calendar UI should never block on haptics availability).
 *
 * Use these wrappers from any UI callsite — pressing a date, opening a
 * picker, saving an event, etc. — to match Apple's pervasive haptic
 * feedback in Calendar.
 */

import * as Haptics from 'expo-haptics'

export function hapticSelection(): void {
  try { void Haptics.selectionAsync() } catch { /* non-fatal */ }
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    const map = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    }
    void Haptics.impactAsync(map[style])
  } catch { /* non-fatal */ }
}

export function hapticNotify(type: 'success' | 'warning' | 'error' = 'success'): void {
  try {
    const map = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    }
    void Haptics.notificationAsync(map[type])
  } catch { /* non-fatal */ }
}
