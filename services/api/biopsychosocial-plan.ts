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

/**
 * Wave 2 — per-subdomain coverage row served alongside the plan. Additive
 * field on the plan endpoint response; absent when the BE predates the
 * wave-2 rollout, in which case the wellbeing-map falls back to its
 * client-side goal-only reducer (see `computeCoverage` in
 * `app/Home/wellbeing-map.tsx`). Always returned in the SAME order as the
 * backend's `NOVOPSYCH_SUBDOMAIN_KEYS`, one row per canonical subdomain.
 */
export type PlanCoverageFillLevel = 'none' | 'half' | 'full'

export interface PlanCoverageEntry {
  /** One of the 26 canonical NovoPsych subdomain keys. */
  key: string
  /** Number of unique non-expired instruments the user has completed touching this subdomain. */
  assessmentCount: number
  /** Number of measurable goals in the current plan tagged with this subdomain. */
  goalCount: number
  /**
   * Derived by the backend so the client never handles tie-breaking:
   * `'full'` when goalCount > 0 (goal wins), else `'half'` when
   * assessmentCount > 0, else `'none'`.
   */
  fillLevel: PlanCoverageFillLevel
}

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
  /**
   * Wave 2 (2026-07-28) — additive per-subdomain coverage array. Absent
   * on BE deploys that predate this change; the wellbeing-map treats
   * `undefined` as "fall back to the client-side goal reducer" so the
   * feature degrades to today's behavior rather than throwing.
   */
  coverage?: PlanCoverageEntry[]
  /**
   * SCRUM-651: server-provided expectation envelope for the pending regen job.
   * All three fields are OPTIONAL for backward-compat during the FE/BE rollout —
   * pre-rollout BE deploys omit them, in which case client-side defaults apply
   * (`clientBannerSwapSeconds`=300, `stuckJobThresholdSeconds`=2700).
   *
   * - `estimatedSeconds` — server's best guess at total job duration (p50 for
   *   the current path). Purely informational; not used to gate UI.
   * - `stuckJobThresholdSeconds` — past this elapsed, the FE surfaces a stuck-
   *   job affordance (default 2700s / 45min per SCRUM-651 spec).
   * - `clientBannerSwapSeconds` — past this elapsed, the FE swaps the active
   *   "generating for a while" copy for the passive "still working"/
   *   "we'll notify you" banner (default 300s / 5min per SCRUM-651 spec).
   */
  estimatedSeconds?: number
  stuckJobThresholdSeconds?: number
  clientBannerSwapSeconds?: number
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
        coverage?: PlanCoverageEntry[]
        // SCRUM-651: optional envelope — pass through as-is; the hook layer
        // applies client-side defaults so component reads are non-optional.
        estimatedSeconds?: number
        stuckJobThresholdSeconds?: number
        clientBannerSwapSeconds?: number
      }
    }>('/v1/health-plan/biopsychosocial')
    // Coalesce null → undefined so a BE that ever emits explicit null
    // still reaches the "fall back to client reducer" branch instead of
    // type-lying into caller code that expects an array.
    const rawCoverage = res.data.data.coverage
    const coverage = Array.isArray(rawCoverage) ? rawCoverage : undefined
    return {
      plan: res.data.data.plan ?? null,
      staleness: res.data.data.staleness ?? 'fresh',
      generating: res.data.data.generating ?? false,
      jobStartedAt: res.data.data.jobStartedAt,
      coverage,
      // SCRUM-651: pass through as-is. `undefined` preserves the "BE predates
      // this envelope" signal so the hook layer can fall back to the shipped
      // defaults instead of a truthy-check accidentally selecting 0.
      estimatedSeconds: res.data.data.estimatedSeconds,
      stuckJobThresholdSeconds: res.data.data.stuckJobThresholdSeconds,
      clientBannerSwapSeconds: res.data.data.clientBannerSwapSeconds,
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

/**
 * SCRUM-651: DELETE /v1/health-plan/biopsychosocial/regenerate/jobs/{jobId}.
 * Cancels the in-flight regenerate job identified by `jobId`. Server-side
 * this flips the job record to CANCELLED and fires the mirror push
 * (`BIOPSYCHOSOCIAL_PLAN_REGENERATE_CANCELLED`) which the FE mirror-branch
 * in use-notifications.ts uses to invalidate `['biopsychosocial-plan']` so
 * the cancelled state converges without a poll.
 *
 * Backward-compat: some in-tree call sites use `fireAndForgetDelete` (see
 * `useCancelBiopsychosocialRegeneration` in `use-biopsychosocial-plan.ts`)
 * to stay inside the chunk-9.5 turbomodule envelope. This awaited variant
 * exists for tests + any future non-mutation caller that needs the raw
 * response (e.g. a "cancel & retry" wizard).
 *
 * If `jobId` is missing or the server 404s (job already completed), we
 * treat as a no-op success — the pull-to-refresh / notification-invalidate
 * cycle will reconcile whichever terminal state actually landed. Other
 * failures bubble.
 */
export async function cancelBiopsychosocialRegeneration(jobId: string): Promise<void> {
  const safeId = encodeURIComponent(jobId)
  try {
    await apiClient.delete(`/v1/health-plan/biopsychosocial/regenerate/jobs/${safeId}`, {
      timeout: 15_000,
    })
  } catch (err) {
    const status = (err as AxiosError)?.response?.status
    // 404 = job already terminal (completed / cancelled / failed). Not an error
    // from the FE's POV — the caller wanted the job to stop and it has.
    if (status === 404) return
    throw err
  }
}
