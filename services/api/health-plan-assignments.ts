import { apiClient } from '@/lib/api-client'
import type { PlanType } from './plan-type'

/**
 * Per-plan-type assigned-assessment progress, served by
 * `/v1/patients/me/health-plan/assignments` (SCRUM-253).
 *
 * `canGenerate` is the one-field check the UI uses to enable/disable
 * the Generate Plan button:
 *   - nothing assigned, basic tier           → true
 *   - nothing assigned, advanced/agency      → false (waiting on care team)
 *   - anything assigned, still remaining     → false
 *   - anything assigned, all complete        → true
 *
 * COS-813 widened the middle: the assigned set can now come from the patient's
 * ENTITLEMENT plan, not just their tier, so a basic-tier patient holding a
 * plan that lists instruments is gated like anyone else. Basic with nothing
 * assigned still generates freely, which is where the exemption started.
 */
export interface HealthPlanAssignments {
  type: PlanType
  assignedInstrumentIds: string[]
  completedInstrumentIds: string[]
  remainingInstrumentIds: string[]
  canGenerate: boolean
  /**
   * COS-813 — the plan a switch came FROM, when there was one.
   *
   * The gate's escape hatch REVERTS the switch rather than waving it through,
   * so nobody sits on a plan whose assessments they have not done. Null means
   * there is nothing to go back to (a first-ever choice), and the gate then
   * renders without that button rather than with one that fails when pressed.
   */
  previousPlanKey?: string | null
  /**
   * COS-822 — a plan switch is still rebuilding.
   *
   * True from the moment someone switches until the new plan is built. The
   * care plan in the app during that window was generated for the plan they
   * just LEFT and looks entirely current, so this is the difference between
   * showing their plan and showing somebody else's.
   */
  regenPending?: boolean
}

export async function fetchHealthPlanAssignments(): Promise<HealthPlanAssignments> {
  const res = await apiClient.get<{ success: boolean; data: HealthPlanAssignments }>(
    '/v1/patients/me/health-plan/assignments',
  )
  return res.data.data
}
