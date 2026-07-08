import type { AxiosError } from 'axios'
import { apiClient } from '@/lib/api-client'
import type { AiPlanGoal } from './types'

/**
 * Biopsychosocial Care Plan v2 — Phase 3 (COS-360 / SCRUM-518).
 * Client mirror of `cos-backend/docs/assessment-strategy-v2.md` §3.1's
 * `BiopsychosocialPlanRecord` contract, served from a new SK
 * (`BIOPSYCHOSOCIAL_PLAN`) alongside the legacy `AI_GENERATED_PLAN` record.
 *
 * Gated end-to-end behind `BIOPSYCHOSOCIAL_PLAN_ENABLED` (requires
 * `ASSESSMENT_STRATEGY_V2_ENABLED` upstream) — both default OFF. While off,
 * `GET /v1/health-plan/biopsychosocial` 404s `FEATURE_DISABLED` and this
 * client swallows that into a null-plan response rather than throwing, so
 * callers never need their own try/catch just to render the flag-off state.
 */

export type InterventionKind = 'intervention' | 'support' | 'recommendation' | 'resource'

export interface Intervention {
  id: string
  kind: InterventionKind
  title: string
  description: string
  link?: string
  sourceAssessmentId?: string
}

/**
 * A measurable goal within a biopsychosocial section. Same shape as the
 * existing Care Plan v1 measurable goal (`AiPlanGoal`, COS-377/COS-382) —
 * reused rather than redefined so `GoalCard` (from `PlanScreenRedesignedV2`)
 * renders both without a fork, and so the backend's documented dual-write
 * (same goal, both plan records, for one release cycle) round-trips cleanly.
 */
export type MeasurableGoal = AiPlanGoal

export type SectionStatus = 'on-track' | 'needs-attention' | 'just-started'
export type SectionTrendDirection = 'improving' | 'stable' | 'declining' | 'unknown'

export interface SectionPlan {
  planBullets: string[]
  interventions: Intervention[]
  goals: MeasurableGoal[]
  status: SectionStatus
  trendSummary: string
  trendDirection: SectionTrendDirection
  lastUpdated: string
}

export interface BiopsychosocialPlanSections {
  biological: SectionPlan
  psychological: SectionPlan
  /** Includes spiritual content — there is no separate spiritual bucket here. */
  social: SectionPlan
}

export interface BiopsychosocialPlanRecord {
  version: number
  sections: BiopsychosocialPlanSections
  generatedAt: string
  sourceDataHash: string
  provider: 'bedrock' | 'openai'
}

export type PlanStaleness = 'fresh' | 'stale'

export interface BiopsychosocialPlanResponse {
  plan: BiopsychosocialPlanRecord | null
  staleness: PlanStaleness
  /**
   * COS-415: true while an async regenerate job is in flight (interim BE
   * lock, cos-backend PR #259). Additive field — absent on BE deploys that
   * predate this change, which we treat as `false` (no polling, existing
   * behavior) rather than throwing.
   */
  generating: boolean
  /** ISO timestamp the in-flight job started. Only meaningful when `generating` is true. */
  jobStartedAt?: string
}

function isFeatureDisabled(err: unknown): boolean {
  const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
  return code === 'FEATURE_DISABLED'
}

/**
 * GET /v1/health-plan/biopsychosocial → { plan, staleness }.
 * Resolves to `{ plan: null, staleness: 'fresh' }` — never throws — when the
 * backend reports `FEATURE_DISABLED` (flag off) so the flag-off/no-plan-yet
 * states collapse into one falsy check (`data?.plan == null`) for callers.
 * Any other failure (network, 5xx, auth) still throws.
 */
export async function fetchBiopsychosocialPlan(): Promise<BiopsychosocialPlanResponse> {
  try {
    const res = await apiClient.get<{
      success: boolean
      data: {
        plan: BiopsychosocialPlanRecord | null
        staleness?: PlanStaleness
        generating?: boolean
        jobStartedAt?: string
      }
    }>('/v1/health-plan/biopsychosocial')
    return {
      plan: res.data.data.plan ?? null,
      staleness: res.data.data.staleness ?? 'fresh',
      generating: res.data.data.generating ?? false,
      jobStartedAt: res.data.data.jobStartedAt,
    }
  } catch (err) {
    if (isFeatureDisabled(err)) {
      return { plan: null, staleness: 'fresh', generating: false }
    }
    throw err
  }
}

export interface RegenerateBiopsychosocialPlanResult {
  jobId: string
}

/**
 * COS-415: thrown by `regenerateBiopsychosocialPlan` when the backend
 * responds 409 `REGENERATION_IN_FLIGHT` (interim BE lock, cos-backend
 * PR #259) — a regeneration job is already running for this patient.
 * Callers must NOT retry the POST; fall back to polling
 * `GET /v1/health-plan/biopsychosocial` (now reports `generating: true` +
 * `jobStartedAt`) until the in-flight job completes.
 */
export class RegenerationInFlightError extends Error {
  code = 'REGENERATION_IN_FLIGHT' as const
  constructor(public jobId: string, public startedAt: string) {
    super('Regeneration already in progress')
    this.name = 'RegenerationInFlightError'
  }
}

type RegenerateErrorBody = {
  success?: boolean
  code?: string
  error?: string
  data?: { jobId: string; startedAt: string }
}

/**
 * POST /v1/health-plan/biopsychosocial/regenerate → 200 { jobId }.
 * Kicks off async regeneration; callers should poll/refetch
 * `fetchBiopsychosocialPlan` (e.g. via query invalidation) to see the result.
 *
 * COS-412: Bedrock Claude Haiku takes 30-40s to actually generate the plan
 * (prod regenerates observed at 31.5s/35.5s/32.4s), which blows past the
 * shared `apiClient`'s 30s default timeout — the request "fails" client-side
 * while the backend keeps working, the user retries, and the backend ends up
 * generating multiple plan versions for one intent. Override the timeout for
 * THIS call only rather than raising the global default, which would mask
 * slow/hanging requests on every other endpoint.
 *
 * COS-415: timeout tightened to 60s — a compromise that still comfortably
 * covers the observed worst case above, without over-promising past API
 * Gateway's 29s wall. If it's still running past that, the client falls back
 * to GET polling (see `useBiopsychosocialPlan`'s `refetchInterval`) instead
 * of blocking on this POST indefinitely.
 *
 * On 409 `REGENERATION_IN_FLIGHT`, throws `RegenerationInFlightError` — do
 * NOT retry. All other errors bubble unchanged.
 */
export async function regenerateBiopsychosocialPlan(): Promise<RegenerateBiopsychosocialPlanResult> {
  try {
    const res = await apiClient.post<{
      success: boolean
      data: { jobId: string }
    }>('/v1/health-plan/biopsychosocial/regenerate', undefined, { timeout: 60_000 })
    return res.data.data
  } catch (err) {
    const response = (err as AxiosError<RegenerateErrorBody>)?.response
    if (response?.status === 409 && response.data?.code === 'REGENERATION_IN_FLIGHT' && response.data.data) {
      throw new RegenerationInFlightError(response.data.data.jobId, response.data.data.startedAt)
    }
    throw err
  }
}
