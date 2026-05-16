import { apiClient } from '@/lib/api-client'

export type PlanType = 'basic' | 'advanced' | 'agency'

export interface PlanTypeRecord {
  type: PlanType
  updatedAt: string
  updatedBy: string
}

export async function fetchPlanType(): Promise<PlanType> {
  const res = await apiClient.get<{ success: boolean; data: { type: PlanType } }>(
    '/v1/patients/me/health-plan/type',
  )
  return res.data.data.type
}

/**
 * Returns the persisted record on success. The backend returns 400 NO_AGENCY
 * when the user picks 'agency' but has no linked care manager — surfaced as
 * a thrown error with `code === 'NO_AGENCY'` that callers can branch on.
 */
export async function updatePlanType(type: PlanType): Promise<PlanTypeRecord> {
  try {
    const res = await apiClient.put<{ success: boolean; data: PlanTypeRecord }>(
      '/v1/patients/me/health-plan/type',
      { type },
    )
    return res.data.data
  } catch (err) {
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
    if (code) {
      const wrapped = new Error(`update plan type failed: ${code}`)
      ;(wrapped as Error & { code?: string }).code = code
      throw wrapped
    }
    throw err
  }
}
