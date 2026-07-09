/**
 * Pure mapping from a push-notification `content.data` payload to the
 * in-app route a tap should open.
 *
 * COS-361 (Bug #9). Tapping any push previously dropped the user on
 * Home regardless of type, and cold-start taps (app launched from a
 * killed state) were not handled at all. This module centralises the
 * type → route map so it is unit-testable and lives in exactly one
 * place, and is consumed by both the warm-tap listener
 * (`addNotificationResponseReceivedListener`) and the cold-start path
 * (`useLastNotificationResponse`) in `hooks/use-notifications.ts`.
 *
 * The `type` strings are the exact values the backend stamps into
 * `content.data.type` when it sends each push:
 *   - HEALTH_PLAN_REMINDER       — daily task reminder
 *       (cos-backend health-plan-reminders.service.ts)
 *   - MEDICATION_REFILL_REMINDER — refill push, COS-359 / slice 6A
 *       (cos-backend tz-aware-reminders.service.ts)
 *   - DATA_SYNC_COMPLETE / EHI_EXPORT_COMPLETE — data ready
 *   - APPOINTMENT_REMINDER / RECOMMENDED_APPOINTMENTS — calendar
 *   - CARE_PLAN_UPDATE — plan changed
 *   - NEW_MESSAGE — chat
 *   - CARE_GAP — care checklist
 *   - BIOPSYCHOSOCIAL_PLAN_READY — biopsychosocial plan regeneration
 *       finished (COS-421 / cos-backend PR #260)
 *
 * BACK-COMPAT CONTRACT: returning `null` means "no specific route —
 * fall back to Home". Any unknown / new / data-ready type MUST land
 * here so a new backend type can never break tap handling on an
 * already-shipped binary. Never throw — a malformed payload returns
 * null (Home).
 */

/** Shape of `response.notification.request.content.data`. Untyped on
 *  the wire, so we treat every field as optional/unknown and read
 *  defensively. */
export type NotificationData = Record<string, unknown> | null | undefined;

/**
 * Decide the route for a notification payload.
 *
 * @returns an expo-router path to push, or `null` to use the Home
 *          default. Pure and total — never throws.
 */
export function routeForNotificationData(data: NotificationData): string | null {
  // Defensive: a missing/non-object payload routes to Home.
  if (!data || typeof data !== 'object') return null;

  const type = typeof data.type === 'string' ? data.type : undefined;
  if (!type) return null;

  switch (type) {
    // ── New in COS-361 ──────────────────────────────────────────────
    // Daily task reminder → Today's Schedule (where the pending tasks
    // for the reminded slot are actionable).
    case 'HEALTH_PLAN_REMINDER':
      return '/Home/today-schedule';
    // Refill reminder → Health Plan, focused on the medications section
    // so the patient lands directly on the refill/meds UI. The
    // `focus=medications` param is honored by health-plan.tsx; older
    // binaries that don't read it simply open the Health Plan screen
    // (still correct, just not pre-scrolled) — back-compatible.
    case 'MEDICATION_REFILL_REMINDER':
      return '/Home/health-plan?focus=medications';

    // ── New in COS-421 ───────────────────────────────────────────────
    // Biopsychosocial plan regeneration finished server-side → Health
    // Plan, so the patient lands on their freshly-regenerated plan.
    case 'BIOPSYCHOSOCIAL_PLAN_READY':
      return '/Home/health-plan';

    // ── Existing mappings (unchanged behavior) ──────────────────────
    case 'APPOINTMENT_REMINDER':
    case 'RECOMMENDED_APPOINTMENTS':
      return '/Home/appointments';
    case 'CARE_PLAN_UPDATE':
      return '/Home/plan';
    case 'NEW_MESSAGE':
      return '/Home/chat';
    case 'CARE_GAP':
      return '/Home/care-checklist';

    // ── Data-ready / EHI / sync-complete → Home (explicit) ──────────
    case 'DATA_SYNC_COMPLETE':
    case 'EHI_EXPORT_COMPLETE':
      return null;

    // ── Unknown / future types → Home (back-compat default) ─────────
    default:
      return null;
  }
}
