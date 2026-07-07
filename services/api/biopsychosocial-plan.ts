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
      data: { plan: BiopsychosocialPlanRecord | null; staleness?: PlanStaleness }
    }>('/v1/health-plan/biopsychosocial')
    return {
      plan: res.data.data.plan ?? null,
      staleness: res.data.data.staleness ?? 'fresh',
    }
  } catch (err) {
    if (isFeatureDisabled(err)) {
      return { plan: null, staleness: 'fresh' }
    }
    throw err
  }
}

export interface RegenerateBiopsychosocialPlanResult {
  jobId: string
}

/**
 * POST /v1/health-plan/biopsychosocial/regenerate → 202 { jobId }.
 * Kicks off async regeneration; callers should poll/refetch
 * `fetchBiopsychosocialPlan` (e.g. via query invalidation) to see the result.
 */
export async function regenerateBiopsychosocialPlan(): Promise<RegenerateBiopsychosocialPlanResult> {
  const res = await apiClient.post<{
    success: boolean
    data: { jobId: string }
  }>('/v1/health-plan/biopsychosocial/regenerate')
  return res.data.data
}
