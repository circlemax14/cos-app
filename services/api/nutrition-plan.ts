/**
 * AI nutrition plan API client (Ken 2026-08-07).
 *
 * Talks to:
 *   POST /v1/patients/me/nutrition-plan
 *
 * ── WHY POST, AND WHY THERE IS NO GET ────────────────────────────────
 * The backend generates on demand and does not persist the result, so
 * there is nothing to read back. Every call is a fresh Bedrock
 * generation, which is why the UI puts it behind an explicit button
 * rather than fetching on mount — nobody should pay for a model call by
 * scrolling past a section.
 *
 * ── THE FOUR OUTCOMES THE UI HAS TO HANDLE ───────────────────────────
 *   404 FEATURE_DISABLED      → flag off; render nothing at all
 *   403 ENTITLEMENT_DENIED    → not on a plan that includes it
 *   409 SCREENER_NOT_TAKEN    → take the dietary screener first
 *   409 SCREENER_INCOMPLETE   → finish the screener
 *   503 AI_INVALID_OUTPUT     → transient; worth retrying
 * Each gets its own error class so the section can say something true
 * instead of collapsing everything into "something went wrong".
 *
 * Response envelope: cos-backend `sendSuccess` wraps payloads as
 * `{ success: true, data: ... }`. Defensive unwrap mirrors daily-read.ts.
 */

import axios from 'axios'

import { apiClient } from '@/lib/api-client'

// ─── Errors ──────────────────────────────────────────────────────────

export class NutritionFeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED'
  constructor() {
    super('Nutrition plan feature is disabled')
    this.name = 'NutritionFeatureDisabledError'
  }
}

export class NutritionEntitlementError extends Error {
  readonly code = 'ENTITLEMENT_DENIED'
  constructor() {
    super('Your plan does not include the AI nutrition plan')
    this.name = 'NutritionEntitlementError'
  }
}

/** 409 — the patient has to do something before a plan can be built. */
export class NutritionScreenerRequiredError extends Error {
  constructor(
    public readonly code: 'SCREENER_NOT_TAKEN' | 'SCREENER_INCOMPLETE',
    message: string,
  ) {
    super(message)
    this.name = 'NutritionScreenerRequiredError'
  }
}

/** 503 — the model returned nothing usable. Retrying is reasonable. */
export class NutritionGenerationError extends Error {
  readonly code = 'AI_INVALID_OUTPUT'
  constructor(message: string) {
    super(message)
    this.name = 'NutritionGenerationError'
  }
}

// ─── Types (mirror BE NutritionPlan) ─────────────────────────────────

export type NutritionFactor =
  | 'fruits'
  | 'vegetables'
  | 'fruitsAndVegetables'
  | 'wholeGrains'
  | 'addedSugars'
  | 'sugarSweetenedBeverages'
  | 'dairy'
  | 'fibre'
  | 'calcium'
  | 'redAndProcessedMeat'

export interface NutritionSuggestion {
  factor: NutritionFactor
  title: string
  rationale: string
}

export interface NutritionPlan {
  instrument: 'dsq-nci'
  /**
   * 'frequency-only' means every number behind this plan is a reported
   * FREQUENCY, not a measured intake — the NCI regression coefficients
   * are not loaded. The UI must never present these as amounts.
   */
  scoreClass: 'frequency-only' | 'calibrated'
  summary: string
  suggestions: NutritionSuggestion[]
  /** Always true. A property of the generator, not of a given plan. */
  requiresCareTeamReview: boolean
  coverage: { answered: number; total: number; fraction: number }
  generatedAt: string
}

// ─── Envelope + normalisation ────────────────────────────────────────

function unwrap<T>(body: any): T {
  if (body == null) return body as T
  if (body.data && typeof body.data === 'object') return body.data as T
  return body as T
}

function normalize(shaped: Partial<NutritionPlan> | undefined): NutritionPlan {
  const raw = Array.isArray(shaped?.suggestions) ? shaped!.suggestions! : []
  const suggestions = raw
    .filter((s): s is NutritionSuggestion => !!s && typeof s.title === 'string' && s.title !== '')
    .map((s) => ({
      factor: s.factor,
      title: s.title,
      rationale: typeof s.rationale === 'string' ? s.rationale : '',
    }))
  return {
    instrument: 'dsq-nci',
    scoreClass: shaped?.scoreClass === 'calibrated' ? 'calibrated' : 'frequency-only',
    summary: typeof shaped?.summary === 'string' ? shaped.summary : '',
    suggestions,
    // Defaults to TRUE when absent. If the backend ever stops sending it,
    // the safe assumption is that review IS required, not that it isn't.
    requiresCareTeamReview: shaped?.requiresCareTeamReview !== false,
    coverage: shaped?.coverage ?? { answered: 0, total: 0, fraction: 0 },
    generatedAt: typeof shaped?.generatedAt === 'string' ? shaped.generatedAt : '',
  }
}

function rethrowTyped(err: unknown): never {
  if (axios.isAxiosError(err) && err.response) {
    const status = err.response.status
    const body = err.response.data as { code?: string; error?: string } | undefined
    const code = body?.code
    const message = body?.error ?? 'Could not build your nutrition plan'

    if (status === 404 && code === 'FEATURE_DISABLED') throw new NutritionFeatureDisabledError()
    if (status === 403) throw new NutritionEntitlementError()
    if (status === 409 && (code === 'SCREENER_NOT_TAKEN' || code === 'SCREENER_INCOMPLETE')) {
      throw new NutritionScreenerRequiredError(code, message)
    }
    if (status === 503) throw new NutritionGenerationError(message)
  }
  throw err as Error
}

// ─── Endpoints ───────────────────────────────────────────────────────

/**
 * Read the LAST GENERATED plan. One DynamoDB read, zero Bedrock calls, so
 * this is safe to call on mount — unlike generate.
 *
 * Resolves to `null` when the patient has not built one yet: the backend
 * returns 200 with `plan: null` for that, deliberately, so it is
 * distinguishable from the feature being disabled (404).
 */
export async function fetchNutritionPlan(): Promise<NutritionPlan | null> {
  try {
    const res = await apiClient.get('/v1/patients/me/nutrition-plan')
    const body = unwrap<{ plan: Partial<NutritionPlan> | null }>(res.data)
    return body?.plan ? normalize(body.plan) : null
  } catch (err) {
    rethrowTyped(err)
  }
}


/**
 * Generate a nutrition plan from the patient's latest dietary screener.
 *
 * Costs a Bedrock call every time — only invoke from an explicit user
 * action, never on mount or on focus.
 */
export async function generateNutritionPlan(): Promise<NutritionPlan> {
  try {
    const res = await apiClient.post('/v1/patients/me/nutrition-plan')
    return normalize(unwrap<Partial<NutritionPlan>>(res.data))
  } catch (err) {
    rethrowTyped(err)
  }
}
