/**
 * Shared helper: resolve the per-category gate for the plan-task scheduler
 * (COS-373 / SCRUM-525).
 *
 * Extracted from app/Home/today-schedule.tsx so auth-prefetch.ts and
 * use-notification-categories.ts can reuse the IDENTICAL gate logic without
 * circular imports. No React Native / React imports here so it is usable in
 * any context (service layer, hooks, prefetch).
 *
 * Contract:
 *   - Flag OFF  → returns `undefined`  (scheduler treats every category as
 *                                        enabled — unchanged behaviour)
 *   - Flag ON   → fetches the patient's saved prefs and returns the
 *                 medicationTask / otherTask booleans.
 *   - Any error → returns `undefined`  (best-effort; scheduler stays open)
 */

import { NOTIFICATION_CATEGORIES_ENABLED } from '@/lib/notification-categories';
import { fetchNotificationCategories } from '@/services/api/notification-prefs';
import type { PlanTaskCategoryGate } from '@/services/plan-task-notifications';

export async function resolveCategoryGate(): Promise<PlanTaskCategoryGate | undefined> {
  if (!NOTIFICATION_CATEGORIES_ENABLED) return undefined;
  try {
    const res = await fetchNotificationCategories();
    if (!res.flagEnabled) return undefined;
    return {
      medicationTask: res.preferences.medicationTask,
      otherTask: res.preferences.otherTask,
    };
  } catch {
    return undefined;
  }
}

/**
 * Build a gate directly from already-resolved preferences (no network call).
 * Used after a successful category-prefs mutation where the server response is
 * already in hand — avoids a redundant round-trip.
 *
 * Returns `undefined` when the flag is off (same as resolveCategoryGate).
 */
export function buildCategoryGateFromPrefs(
  flagEnabled: boolean,
  preferences: { medicationTask: boolean; otherTask: boolean },
): PlanTaskCategoryGate | undefined {
  if (!NOTIFICATION_CATEGORIES_ENABLED) return undefined;
  if (!flagEnabled) return undefined;
  return {
    medicationTask: preferences.medicationTask,
    otherTask: preferences.otherTask,
  };
}
