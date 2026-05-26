import { apiClient } from '@/lib/api-client'

/**
 * SCRUM-268: 4-tier plan model.
 *   - basic            — light screeners (AI picks 1-3)
 *   - advanced         — clinical screeners (AI picks 3-5)
 *   - agency-supported — adds ADL/IADL/Mini-Cog (Mini-Cog is currently Coming Soon)
 *   - agency-managed   — adds full MOCA + Full Intake (both currently Coming Soon)
 *
 * Legacy 'agency' is still accepted at the API boundary; the backend
 * normalizes it to 'agency-supported' on write.
 */
export type PlanType = 'basic' | 'advanced' | 'agency-supported' | 'agency-managed'

/** Tier value as it arrives from older endpoints / older backend deploys. */
export type AcceptedPlanType = PlanType | 'agency'

export function normalizePlanType(t: string | undefined | null): PlanType {
  if (t === 'agency') return 'agency-supported'
  if (t === 'basic' || t === 'advanced' || t === 'agency-supported' || t === 'agency-managed') return t
  return 'basic'
}

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
  const res = await apiClient.get<{ success: boolean; data: { type: string } }>(
    '/v1/patients/me/health-plan/type',
  )
  // SCRUM-268: normalize on the client too so older backends returning
  // legacy 'agency' don't reach UI code that doesn't expect it.
  return normalizePlanType(res.data.data.type)
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
