import { apiClient } from '@/lib/api-client'

export type PlanType = 'basic' | 'advanced' | 'agency'

export interface PlanTypeConsent {
  acknowledged: true
  consentVersion: string
  consentedAt: string
}

export interface PlanTypeRecord {
  type: PlanType
  updatedAt: string
  updatedBy: string
  consent?: PlanTypeConsent
}

export interface UpdatePlanTypeOpts {
  consent: { acknowledged: true; consentVersion?: string }
}

export async function fetchPlanType(): Promise<PlanType> {
  const res = await apiClient.get<{ success: boolean; data: { type: PlanType } }>(
    '/v1/patients/me/health-plan/type',
  )
  return res.data.data.type
}

/**
 * Set the user's plan type. Requires an explicit consent acknowledgement
 * payload (SCRUM-224); the backend writes an audit-log entry for
 * analytics. Backend may return 400 NO_AGENCY (no linked care manager)
 * or 400 CONSENT_REQUIRED (consent missing) — surfaced as a thrown
 * error with `code` set so callers can branch.
 */
export async function updatePlanType(
  type: PlanType,
  opts: UpdatePlanTypeOpts,
): Promise<PlanTypeRecord> {
  try {
    const res = await apiClient.put<{ success: boolean; data: PlanTypeRecord }>(
      '/v1/patients/me/health-plan/type',
      { type, consent: opts.consent },
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
