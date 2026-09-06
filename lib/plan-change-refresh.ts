/**
 * COS-926 — everything a plan change invalidates, in one list.
 *
 * ─── THE BUG THIS EXISTS FOR ─────────────────────────────────────────
 *
 * Vishal: "we made a rule that whenever we switch plan, we ask the patient to
 * take the assessments again … But now when I click on switch to this plan, I
 * was directly switched."
 *
 * The server was right. switchPlan() writes the new plan's required
 * instruments, stamps assessmentsRequiredSince so previously-answered
 * screeners stop counting (COS-823), and sets planRegenPending (COS-821). All
 * of it landed.
 *
 * The APP never asked again. The gate on the Plan tab renders from
 * `useHealthPlanAssignments()`, query key ['health-plan-assignments'], and the
 * switch handler invalidated only ['patient-plans']. So the gate re-rendered
 * against a cache written BEFORE the switch — when the old plan's requirements
 * were already satisfied and canGenerate was true — and waved the patient
 * straight through to a plan built for the plan they had just left.
 *
 * ─── WHY A SHARED LIST AND NOT ANOTHER LINE ──────────────────────────
 *
 * There were FIVE places a plan can change, with five different refresh sets
 * between them, and exactly one — PlanAssessmentGate's own revert path — named
 * the key the gate reads. That is the same shape as COS-925's two copies of
 * the pricing rule: a rule implemented in one place and not the others.
 *
 * Adding ['health-plan-assignments'] to the four sites that lacked it would
 * fix today's report and leave the sixth site to get it wrong. So the set is
 * defined once here and every site calls it.
 *
 * ─── WHY EACH KEY IS IN THE LIST ─────────────────────────────────────
 *
 * A plan change is rare — a handful of times per patient, ever — so the cost
 * of refetching is irrelevant next to the cost of showing someone the wrong
 * plan. Every key here is genuinely a function of which plan they hold.
 */

import type { QueryClient } from '@tanstack/react-query';

/**
 * Query keys that are a function of the patient's plan.
 *
 * Order is deliberate: the two that decide what the patient SEES NEXT come
 * first, so the screen they land on is correct even if a later refetch is
 * still in flight.
 */
export const PLAN_CHANGE_KEYS = [
  /** The gate. THE one that was missing — see the header. */
  'health-plan-assignments',
  /** The shelf: which plan is marked as theirs. */
  'patient-plans',
  /** planRegenPending lives here, which drives "Building your plan". */
  'plan-type',
  /** Billing summary: plan name, cycle, period end. */
  'billing',
  /** The care plan itself is rebuilt from the new plan's answers (COS-821). */
  'biopsychosocial-plan',
  'health-plan',
  'unified-plan',
  'plan-tasks',
  /**
   * COS-855 — the health summary describes the plan, so a switch rebuilds it.
   * Cached copy would otherwise describe the plan they just left.
   */
  'health-summary',
  /**
   * The plan decides which SCREENS render at all (COS-859 enforcement). A
   * stale copy either hides something they just paid for, or bounces them off
   * a screen the new plan grants.
   */
  'feature-permissions',
  /** Which screeners are offered, which the plan also decides. */
  'instruments',
  'instruments-recommended',
] as const;

/**
 * Refresh everything a plan change affects. Call after ANY successful switch,
 * purchase, or revert.
 *
 * Awaited, and callers should await it BEFORE navigating or closing a chooser:
 * the whole failure this fixes was a screen rendering against a cache that had
 * not caught up yet.
 *
 * Failures are swallowed per key rather than aborting the rest. A plan change
 * has already happened on the server by the time this runs, and one refetch
 * failing must not leave the other ten stale — the next read repairs a single
 * missed key, but a half-refreshed app is the inconsistent state this exists
 * to prevent.
 */
export async function refreshAfterPlanChange(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    PLAN_CHANGE_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }).catch(() => undefined),
    ),
  );
}
