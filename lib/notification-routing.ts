// COS-1166 — one definition of where a retake sends the patient, shared
// with the inbox card's "Start now". See lib/retake-routes.ts.
import { retakeStartRoute } from './retake-routes.ts';
import { retakeTrackOf } from './retake-queue.ts';

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
 *   - true (default): COS-1166 — the push opens the assessment itself, via
 *     retakeStartRoute(instrumentKey). Falls back to the plan surface (where
 *     the inbox card lives) when the payload carries no instrumentKey.
 *   - false: null → Home, the Phase-1 behaviour, kept as the one-line OTA
 *     revert if opening the stepper straight from a push misbehaves.
 *
 * Kept as a static const so the flip does not require a runtime SSM
 * round-trip — one-line OTA revert is the incident lever, same as the
 * two flags above.
 */
export const NOTIFICATION_RETAKE_ROUTE_ENABLED = true;

/**
 * COS-1180 — the one screen a pending retake is answered from.
 *
 * The visible Plan tab. Deliberately not '/Home/health-plan': COS-915 retired
 * that from the tab bar and it branches across three plan screens, one of which
 * (PlanScreenRedesignedV2) renders neither the retake card nor the gate.
 */
export const RETAKE_GATE_ROUTE = '/Home/care-plan-plus';

/**
 * COS-1182 — where a HEALTH-STATUS ask is answered.
 *
 * The 'plan' route is the Health Status tab (renamed by COS-964); it is NOT the
 * care plan. IntakeRequiredGate lives there.
 */
export const HEALTH_STATUS_GATE_ROUTE = '/Home/plan';

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
    /*
     * COS-1166 — the tap now OPENS THE ASSESSMENT.
     *
     * Vishal, 2026-09-29: "if we get the notification, we will take the user
     * to the plan screen and we will start the assessment directly. There
     * will be a deep link."
     *
     * Phase 1 deliberately returned null (→ Home) and let the inbox card be
     * the destination. That decision is now reversed: a patient who taps a
     * push that says "redo your PHQ-2" has already decided to do it, and
     * making them land on Home, find a card and press a second button loses
     * most of them.
     *
     * Everything needed was already on the wire — the backend has stamped
     * `instrumentKey` into this payload since COS-482 — and
     * retakeStartRoute() is the exact route the card's own "Start now"
     * button uses. This is the same shape as the SUPPORT_TICKET_STATUS case
     * below, which sat dead for the same reason.
     *
     * Falls back to the plan surface when the payload has no usable
     * instrumentKey: the card lives there, so the request is still
     * actionable. Never Home — Home is where this got lost.
     */
    case 'ASSESSMENT_RETAKE_REQUESTED': {
      if (!NOTIFICATION_RETAKE_ROUTE_ENABLED) return null;
      /*
       * COS-1180 — land on the GATE, not on the work.
       *
       * Vishal, 2026-09-30: "I received this notification that your care team
       * requested you to retake the assessment. When I clicked on it, it took
       * me to that check-in screen again. I don't know why. Ideally it should
       * take me to that screen that I was seeing when I click on the plan nav
       * button."
       *
       * COS-1166 pointed this at retakeStartRoute, which for a SCOPE request
       * (`all-assessments`, `domain:*`) resolves to the CATALOG — a wall of
       * cards whose primary action is "Build my plan". So the push and the Plan
       * tab disagreed about where a pending retake lives.
       *
       * One destination now: the gate. It names who asked and what for, and its
       * "Start now" is the single launcher — which for a `set:` goes straight
       * into the first check-in (COS-1175). The instrumentKey is no longer read
       * here; the gate reads the pending list itself, so it cannot go stale
       * against a payload.
       *
       * ⚠️ care-plan-plus, NOT '/Home/plan' (that is the Health Status screen)
       * and NOT '/Home/health-plan' (retired from the tab bar by COS-915, and
       * it can render PlanScreenRedesignedV2, which has no retake card and no
       * gate). care-plan-plus renders BiopsychosocialPlanScreen unconditionally,
       * which is where RetakeRequiredGate actually lives.
       */
      /*
       * COS-1182 — which gate depends on the TRACK.
       *
       * COS-1180 stopped reading instrumentKey entirely, which was right for the
       * question it was answering (never route into the catalog) and wrong for
       * this one: a "redo your Health Status questionnaire" ask is answered on
       * the Health Status screen, not the care plan. Sending it to the plan gate
       * put an intake ask behind assessment copy on a screen that no longer even
       * counts it (that gate is assessment-only now), so it would have shown
       * nothing at all.
       *
       * The key is used ONLY to pick between two gates — never to build a route
       * into the work — so the stale-payload risk COS-1180 removed does not come
       * back: whichever gate it lands on reads the pending list itself.
       */
      const track = retakeTrackOf(
        typeof data.instrumentKey === 'string' ? data.instrumentKey : null,
      );
      return track === 'health-status-intake' ? HEALTH_STATUS_GATE_ROUTE : RETAKE_GATE_ROUTE;
    }

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

    /*
     * COS-947 — SUPPORT_TICKET_STATUS. The type Vishal actually tapped.
     *
     * "I got the notification for help and support. But when I click the
     * notification, I went to the sign in screen, and then after sign in it
     * took me to the home screen."
     *
     * Making sign-in replay the deferred route was necessary and NOT
     * sufficient: with no case here the tap resolved to null, which
     * use-notifications turns into '/Home' BEFORE the queue ever sees it. The
     * queue then faithfully replayed /Home, so the fix would have looked
     * broken while working perfectly.
     *
     * The backend has carried `ticketId` on this payload all along and its own
     * comment calls the missing case "a dead tap ... one line to add"
     * (cos-backend ticket-notify.service.ts:115-121). Falls back to the list
     * when the id is absent, because landing on Support beats landing on Home.
     */
    case 'SUPPORT_TICKET_STATUS': {
      const ticketId = typeof data.ticketId === 'string' ? data.ticketId : null;
      return ticketId
        ? `/Home/support-ticket-detail?ticketId=${encodeURIComponent(ticketId)}`
        : '/Home/support';
    }

    /*
     * COS-947 — three senders that were reaching Home by accident.
     *
     * TASK_REMINDER is the one that matters most: it and HEALTH_PLAN_REMINDER
     * are mutually exclusive on whether the user has a timezone, only the
     * OTHER one was mapped, and use-timezone-sync now sets a timezone for
     * everyone who opens the app — so the routed branch is becoming vestigial
     * exactly as the unrouted one becomes the fleet's daily reminder.
     *
     * All three land on today-schedule rather than a CRUD editor: a reminder
     * exists to be acted on, and /Home/habits is where routines are edited,
     * not ticked off.
     */
    case 'TASK_REMINDER':
    case 'HABIT_REMINDER':
      return '/Home/today-schedule';

    case 'HEALTH_SUMMARY_READY':
      return '/Home/plan';

    case 'nudge':
    case 'NUDGE':
      return '/Home/nudges';

    /*
     * HEALTH_DATA_REFRESHED and SYSTEM_ALERT deliberately fall through to Home.
     * Neither names one screen — a refresh touches every surface, and a system
     * alert is by definition not about a place. Recorded so the next audit does
     * not re-file them as omissions.
     *
     * Unknown / future types → Home (back-compat default).
     */
    default:
      return null;
  }
}
