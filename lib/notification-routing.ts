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
 * CHUNK 64 (2026-07-22) — client-side kill-switch to repoint the
 * MEDICATION_REFILL_REMINDER push at the BPS surface. Activates the
 * chunk-55 `?focus=medications` deep-link handler
 * (components/health-plan/BiopsychosocialPlanScreen.tsx:184-238) which
 * has been inert on push taps because the router was still pointing
 * every refill push at legacy `/Home/health-plan`.
 *
 * Kill-switch semantics:
 *   - true (default): bio-eligible patients (caller passes
 *     `bpsEnabled: true`) land on `/Home/biopsychosocial-plan?focus=medications`.
 *     Non-eligible patients still land on legacy — the flag DOES NOT
 *     force BPS on someone whose surface can't render it.
 *   - false: everyone routes to legacy (pre-chunk-64 behavior). Flip
 *     via OTA (~30-60s) if a regression surfaces.
 *
 * Follow-up (chunk 65+ candidate): promote to a runtime SSM /
 * feature-flags entry so the flip doesn't require an OTA. For v1 the
 * static const gives us a single-line revert without a code-review
 * cycle in an incident.
 */
export const NOTIFICATION_MEDS_ROUTE_BPS_ENABLED = true;

/**
 * CHUNK 70 (2026-07-23) — client-side kill-switch to repoint the
 * BIOPSYCHOSOCIAL_PLAN_READY push (fired by cos-backend when the AI
 * plan finishes regenerating, COS-421 / cos-backend PR #260) at the
 * BPS surface. Post-BPS-pivot the ready notification should land the
 * user on the surface where the newly-regenerated plan actually
 * renders — legacy `/Home/health-plan` no longer shows the fresh BPS
 * output for bio-eligible patients.
 *
 * Kill-switch semantics mirror NOTIFICATION_MEDS_ROUTE_BPS_ENABLED:
 *   - true (default): bio-eligible patients (caller passes
 *     `bpsEnabled: true`) land on `/Home/biopsychosocial-plan` (no
 *     `focus` param — the ready push lands at the top of the plan so
 *     the patient sees the regenerated plan holistically, not scrolled
 *     into a single section). Non-eligible patients still land on
 *     legacy — the flag DOES NOT force BPS on someone whose surface
 *     can't render it.
 *   - false: everyone routes to legacy (pre-chunk-70 behavior). Flip
 *     via OTA (~30-60s) if a regression surfaces.
 *
 * Follow-up (same as chunk 64): promote to a runtime SSM /
 * feature-flags entry so the flip doesn't require an OTA.
 */
export const NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED = true;

/**
 * COS-482 Phase 1 (2026-07-24) — kill-switch for the ASSESSMENT_RETAKE_REQUESTED
 * push (fired by cos-backend when a care manager or super-admin asks the
 * patient to redo an assessment via the retake-request feature). Follows
 * the chunk-64/70 pattern:
 *
 *   - true (default): the push lands on `/Home`, where the inbox card at
 *     the top of the Home surface renders the pending request. The card
 *     silent-drops when there are no pending items, so a stale-cache tap
 *     that races the row's completion never lands on empty chrome.
 *   - false: fall back to Home (null → Home) — same destination in the
 *     shipped version but documented as the pre-flag state so an OTA
 *     revert is unambiguous.
 *
 * Kept as a static const so the flip does not require a runtime SSM
 * round-trip — one-line OTA revert is the incident lever, same as the
 * two flags above.
 */
export const NOTIFICATION_RETAKE_ROUTE_ENABLED = true;

/**
 * Eligibility hints for the caller. Pure/optional — every field defaults
 * to conservative (legacy-preserving) behavior so back-compat with older
 * callers (and the unit-test contract) holds.
 */
export interface RouteOptions {
  /**
   * True iff the patient is on the biopsychosocial plan surface (i.e.
   * `useBiopsychosocialPlanFlag()` would return true for them, per
   * hooks/use-assessment-strategy-v2-flag.ts — both
   * `assessment_strategy_v2_enabled` AND `biopsychosocial_plan_enabled`).
   * Ineligible patients keep landing on legacy `/Home/health-plan` for
   * meds refill pushes, so we never drop them on a screen their build
   * won't render. Defaults to `false`.
   */
  bpsEnabled?: boolean;
}

/**
 * Decide the route for a notification payload.
 *
 * @returns an expo-router path to push, or `null` to use the Home
 *          default. Pure and total — never throws.
 */
export function routeForNotificationData(
  data: NotificationData,
  opts: RouteOptions = {},
): string | null {
  // Defensive: a missing/non-object payload routes to Home.
  if (!data || typeof data !== 'object') return null;

  const type = typeof data.type === 'string' ? data.type : undefined;
  if (!type) return null;

  const bpsEnabled = opts.bpsEnabled === true;

  switch (type) {
    // ── New in COS-361 ──────────────────────────────────────────────
    // Daily task reminder → Today's Schedule (where the pending tasks
    // for the reminded slot are actionable).
    case 'HEALTH_PLAN_REMINDER':
      return '/Home/today-schedule';
    // Refill reminder → the meds section on whichever plan surface the
    // patient is on. The `focus=medications` param is honored by both
    // health-plan.tsx (legacy, COS-361) and BiopsychosocialPlanScreen.tsx
    // (BPS, chunk 55) — older binaries that don't read it simply open
    // the plan screen (still correct, just not pre-scrolled), so this is
    // back-compatible on both surfaces.
    //
    // CHUNK 64 (2026-07-22): with the platform pivot to BPS as the
    // primary Care Plan surface, bio-eligible patients now land on the
    // BPS meds section instead of legacy. Ineligible patients (flag
    // off) still land on legacy — we never route someone to a surface
    // their build/flags can't render. The kill-switch above gates the
    // repoint; setting it to false restores pre-chunk-64 routing.
    case 'MEDICATION_REFILL_REMINDER':
      if (bpsEnabled && NOTIFICATION_MEDS_ROUTE_BPS_ENABLED) {
        return '/Home/biopsychosocial-plan?focus=medications';
      }
      return '/Home/health-plan?focus=medications';

    // ── New in COS-421 ───────────────────────────────────────────────
    // Biopsychosocial plan regeneration finished server-side → the
    // patient's plan surface, so they land on their freshly-regenerated
    // plan.
    //
    // CHUNK 70 (2026-07-23): with the platform pivot to BPS as the
    // primary Care Plan surface, bio-eligible patients now land on the
    // BPS screen (where the regenerated plan actually renders) instead
    // of legacy `/Home/health-plan`. No `focus` param — the ready push
    // should show the whole regenerated plan from the top, not scroll
    // into one section. Ineligible patients (flag off) still land on
    // legacy — we never route someone to a surface their build/flags
    // can't render. The kill-switch above gates the repoint; setting
    // it to false restores pre-chunk-70 routing.
    case 'BIOPSYCHOSOCIAL_PLAN_READY':
      if (bpsEnabled && NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED) {
        return '/Home/biopsychosocial-plan';
      }
      return '/Home/health-plan';

    // ── New in COS-482 Phase 1 ──────────────────────────────────────
    // A care manager (or super-admin from the unassigned pool) asked
    // the patient to redo an assessment. The push tap lands on Home,
    // where RetakeRequestInboxCard surfaces the pending row at the
    // top of the scroll. Returning null (→ Home) instead of a specific
    // sub-route is intentional: the card is the destination, not a
    // dedicated screen — matches the "durable inbox on Home" contract
    // Ken approved for Phase 1.
    case 'ASSESSMENT_RETAKE_REQUESTED':
      if (!NOTIFICATION_RETAKE_ROUTE_ENABLED) return null;
      return null;

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
