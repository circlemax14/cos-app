import { useQuery } from '@tanstack/react-query'
import { fetchHealthPlanAssignments } from '@/services/api/health-plan-assignments'

/**
 * Reads the per-plan-type assigned-assessment progress (SCRUM-254).
 * Used by the Health Plan screen to:
 *   - show "X of Y assessments complete"
 *   - disable the Generate Plan button when canGenerate is false
 *   - render the right empty state for advanced (assigned but incomplete)
 *     vs agency-empty (waiting on care team)
 *
 * 60s stale time matches the rest of the screen's queries. After a
 * user completes an assessment elsewhere in the app, invalidate
 * ['health-plan-assignments'] so this hook re-fetches.
 */
export function useHealthPlanAssignments() {
  return useQuery({
    queryKey: ['health-plan-assignments'],
    queryFn: fetchHealthPlanAssignments,
    staleTime: 60_000,
  })
}
