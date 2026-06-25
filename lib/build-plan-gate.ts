import type { HealthPlanAssignments } from '@/services/api/health-plan-assignments'

/**
 * Resolves whether the "Build my plan" button should be enabled and what
 * label to show for the remaining-count hint (SCRUM-521 / COS-380).
 *
 * Rules:
 *  - When `assignments` data is available AND resolved, trust `canGenerate`
 *    (the backend source of truth for all plan types).
 *  - When `assignments` is not yet loaded (null/undefined), fall back to the
 *    local heuristic (`completedCount >= minToBuild`) so the button behaves
 *    identically to pre-fix behaviour offline / during first load.
 *  - `remainingCount` is the number the button label uses when blocked:
 *      backend value when available, else `max(0, minToBuild - completedCount)`.
 *
 * Basic-tier users: the backend sets `canGenerate = true` unconditionally,
 * so they are never newly blocked by this logic.
 */
export interface BuildGateResult {
  /** Whether the Build CTA should be enabled. */
  canBuild: boolean
  /** How many more items the user must complete (only meaningful when !canBuild). */
  remainingCount: number
  /** True when the gate came from backend data (false = local heuristic). */
  fromBackend: boolean
}

export function resolveBuildGate(
  assignments: Pick<HealthPlanAssignments, 'canGenerate' | 'remainingInstrumentIds'> | null | undefined,
  completedCount: number,
  minToBuild: number,
): BuildGateResult {
  if (assignments != null) {
    return {
      canBuild: assignments.canGenerate,
      remainingCount: assignments.remainingInstrumentIds.length,
      fromBackend: true,
    }
  }
  // Fallback: assignments not yet loaded
  const deficit = Math.max(0, minToBuild - completedCount)
  return {
    canBuild: completedCount >= minToBuild,
    remainingCount: deficit,
    fromBackend: false,
  }
}
