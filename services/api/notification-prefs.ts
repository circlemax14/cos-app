import { apiClient } from '@/lib/api-client'
import {
  defaultCategoryPrefs,
  NOTIFICATION_CATEGORY_KEYS,
  type NotificationCategory,
  type NotificationCategoryPrefs,
} from '@/lib/notification-categories'

export interface HealthPlanReminderPrefs {
  am: boolean
  midday: boolean
  eod: boolean
}

export async function fetchHealthPlanReminderPrefs(): Promise<HealthPlanReminderPrefs> {
  const res = await apiClient.get<{ success: boolean; data: HealthPlanReminderPrefs }>(
    '/v1/patients/me/notification-prefs/health-plan',
  )
  return res.data.data
}

export async function updateHealthPlanReminderPrefs(
  partial: Partial<HealthPlanReminderPrefs>,
): Promise<HealthPlanReminderPrefs> {
  const res = await apiClient.put<{ success: boolean; data: HealthPlanReminderPrefs }>(
    '/v1/patients/me/notification-prefs/health-plan',
    partial,
  )
  return res.data.data
}

// SCRUM-257: per-user-TZ reminder routing. The cos-app stores the
// user's IANA timezone on the server, and the new sweeper Lambda
// (SCRUM-256) reads it to bucket reminders to local time. Users
// without a stored TZ continue on the legacy UTC reminder path.

export interface TimezonePref {
  timezone: string | null
}

export async function fetchTimezonePref(): Promise<TimezonePref> {
  const res = await apiClient.get<{ success: boolean; data: TimezonePref }>(
    '/v1/patients/me/notification-prefs/timezone',
  )
  return res.data.data
}

export async function updateTimezonePref(
  timezone: string | null,
): Promise<TimezonePref> {
  const res = await apiClient.put<{ success: boolean; data: TimezonePref }>(
    '/v1/patients/me/notification-prefs/timezone',
    { timezone },
  )
  return res.data.data
}

// ─── COS-373: notification categories ─────────────────────────────────────────
//
// Ken's "too many notifications" feedback. The backend persists five boolean
// preferences (appointments / reminders / medicationReminders / medicationTask /
// otherTask) under the /categories sub-resource and returns them alongside a
// `flagEnabled` gate (default-on-read; `otherTask` defaults OFF). The client
// kill-switch lives in lib/notification-categories.ts
// (NOTIFICATION_CATEGORIES_ENABLED) — while it's off these helpers are never
// called from the UI. They're defensive in their own right: any error / missing
// route resolves to a disabled, default-prefs result so the screen never throws
// (mirrors plan-medications.ts).

export interface NotificationCategoriesResponse {
  flagEnabled: boolean
  preferences: NotificationCategoryPrefs
}

/** Coerce an unknown server payload into a complete, defaulted prefs map. */
function normalizeCategoryPrefs(raw: unknown): NotificationCategoryPrefs {
  const defaults = defaultCategoryPrefs()
  if (!raw || typeof raw !== 'object') return defaults
  const source = raw as Record<string, unknown>
  const out = { ...defaults }
  for (const key of NOTIFICATION_CATEGORY_KEYS) {
    const v = source[key]
    if (typeof v === 'boolean') out[key] = v
  }
  return out
}

/**
 * GET the patient's notification-category preferences.
 *
 * Back-compat / defensive: on any failure (404 on an older backend, network,
 * malformed body) we resolve to `{ flagEnabled: false, preferences: defaults }`
 * so the caller renders nothing and the scheduler is unaffected.
 */
export async function fetchNotificationCategories(): Promise<NotificationCategoriesResponse> {
  try {
    const res = await apiClient.get<{
      success: boolean
      data: { flagEnabled?: boolean; preferences?: unknown }
    }>('/v1/patients/me/notification-prefs/categories')
    const data = res.data?.data
    return {
      flagEnabled: data?.flagEnabled === true,
      preferences: normalizeCategoryPrefs(data?.preferences),
    }
  } catch {
    // A READ may fail soft: a stale view is survivable, and rendering nothing
    // is better than an error screen on a settings page.
    return { flagEnabled: false, preferences: defaultCategoryPrefs() }
  }
}

/**
 * PUT a partial set of category preferences. Returns the server-recomputed
 * full map so the caller can prime its cache.
 *
 * ─── THIS THROWS ON FAILURE, AND MUST (COS-777) ──────────────────────
 *
 * It used to swallow every error and RESOLVE with
 * `{ flagEnabled: false, preferences: defaults }`, described as "defensive".
 * It was the opposite: because it resolved, React Query treated a failed save
 * as a SUCCESS, so the onError rollback in useUpdateNotificationCategories was
 * unreachable dead code and onSuccess ran with the fabricated result.
 *
 * That result then did real damage. `flagEnabled: false` makes
 * buildCategoryGateFromPrefs return `undefined`
 * (notification-category-gate.ts:47), and plan-task-notifications.ts reads an
 * undefined gate as "every category enabled"
 * (`categoryPrefs?.medicationTask !== false`). onSuccess immediately calls
 * reconcilePlanTaskNotifications with that gate — so a FAILED attempt to turn
 * a category OFF re-scheduled the entire local notification queue with every
 * category ON.
 *
 * The toggle showed off, nothing was saved, and the device got MORE
 * notifications than before it was touched.
 *
 * A read may fail soft — a stale view is survivable. A write must not: silently
 * discarding it is how a patient ends up believing they opted out.
 */
export async function updateNotificationCategories(
  partial: Partial<Record<NotificationCategory, boolean>>,
): Promise<NotificationCategoriesResponse> {
  // No try/catch, deliberately. See the note above: swallowing here fabricated
  // a success that re-enabled every category on the device.
  const res = await apiClient.put<{
    success: boolean
    data: { flagEnabled?: boolean; preferences?: unknown }
  }>('/v1/patients/me/notification-prefs/categories', partial)
  const data = res.data?.data
  return {
    flagEnabled: data?.flagEnabled === true,
    preferences: normalizeCategoryPrefs(data?.preferences),
  }
}
