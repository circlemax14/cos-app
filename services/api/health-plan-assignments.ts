import { apiClient } from '@/lib/api-client'
import type { PlanType } from './plan-type'

/**
 * Per-plan-type assigned-assessment progress, served by
 * `/v1/patients/me/health-plan/assignments` (SCRUM-253).
 *
 * `canGenerate` is the one-field check the UI uses to enable/disable
 * the Generate Plan button:
 *   - basic                                  → always true
 *   - advanced/agency with empty assigned    → false (no assignments yet)
 *   - advanced/agency with remaining         → false
 *   - advanced/agency with all complete      → true
 */
export interface HealthPlanAssignments {
  type: PlanType
  assignedInstrumentIds: string[]
  completedInstrumentIds: string[]
  remainingInstrumentIds: string[]
  canGenerate: boolean
}

export async function fetchHealthPlanAssignments(): Promise<HealthPlanAssignments> {
  const res = await apiClient.get<{ success: boolean; data: HealthPlanAssignments }>(
    '/v1/patients/me/health-plan/assignments',
  )
  return res.data.data
}
