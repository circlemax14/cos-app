/**
 * Notification categories — pure client mirror of the backend contract
 * (COS-373: Ken's "too many notifications").
 *
 * The backend exposes GET/PUT `/v1/patients/me/notification-prefs/categories`
 * returning `{ flagEnabled, preferences }` where `preferences` is a map of the
 * five boolean keys below. This module is the PURE, RN-import-free counterpart:
 * the category type, the per-plan-task → category mapping, and the default
 * preferences. It is unit-tested in isolation (node:test) and consumed by the
 * scheduler gate, the settings UI, and the plan-creation preview card.
 *
 * Kill-switch — `NOTIFICATION_CATEGORIES_ENABLED` defaults to **false**. While
 * off the app behaves byte-for-byte as it does today: no settings section, no
 * preview card, and the scheduler schedules exactly as before (callers pass no
 * prefs → the gate treats every category as enabled).
 *
 * IMPORTANT: keep this file free of any React Native / Expo imports so it can
 * be loaded directly by `node --test`.
 */

/** Master kill-switch for the entire notification-categories feature. */
export const NOTIFICATION_CATEGORIES_ENABLED = false;

/**
 * The five notification categories the backend persists. Mirrors the backend's
 * preference keys exactly.
 *   - appointments        — appointment reminders
 *   - reminders           — generic plan reminders
 *   - medicationReminders — medication-refill / supply reminders
 *   - medicationTask      — per-dose plan-task notifications (medication tasks)
 *   - otherTask           — non-medication plan-task notifications
 */
export type NotificationCategory =
  | 'appointments'
  | 'reminders'
  | 'medicationReminders'
  | 'medicationTask'
  | 'otherTask';

/** Stable ordered list of the category keys (drives UI rows + iteration). */
export const NOTIFICATION_CATEGORY_KEYS: readonly NotificationCategory[] = [
  'appointments',
  'reminders',
  'medicationReminders',
  'medicationTask',
  'otherTask',
] as const;

/** A full set of category preferences (all five keys → on/off). */
export type NotificationCategoryPrefs = Record<NotificationCategory, boolean>;

/**
 * Map a plan task to the category that gates its local scheduling.
 * A plan task is a medication task when its `type` is exactly 'medication';
 * everything else (exercise, appointment, reminder, missing/unknown) maps to
 * `otherTask`. Mirrors the backend mapping.
 */
export function categoryForPlanTask(
  task: { type?: string } | null | undefined,
): 'medicationTask' | 'otherTask' {
  return task?.type === 'medication' ? 'medicationTask' : 'otherTask';
}

/**
 * Default preferences applied on read. Every category is on EXCEPT `otherTask`,
 * which starts OFF — matching the backend's default-on-read behaviour
 * (`otherTask: false`).
 */
export function defaultCategoryPrefs(): NotificationCategoryPrefs {
  return {
    appointments: true,
    reminders: true,
    medicationReminders: true,
    medicationTask: true,
    otherTask: false,
  };
}
