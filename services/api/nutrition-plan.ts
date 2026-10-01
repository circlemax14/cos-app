/**
 * AI nutrition plan API client (Ken 2026-08-07).
 *
 * Talks to:
 *   GET /v1/patients/me/nutrition-plan
 *
 * ── READ-ONLY SINCE COS-1217/1218/1222 ───────────────────────────────
 * The plan is now generated server-side ALONGSIDE the care plan, and a
 * nightly sweeper backfills anyone missing one. Nobody taps anything,
 * so the app only ever READS. `plan: null` means "the care plan has not
 * produced one yet" — never "tap to build".
 *
 * POST still exists so old installed builds do not 404. This client no
 * longer offers it: a second generation path would be a Bedrock call the
 * patient did not ask for and a plan the care plan does not know about.
 *
 * ── THE OUTCOMES THE UI HAS TO HANDLE ────────────────────────────────
 *   200 { plan: null }        → not generated yet; nothing to do
 *   404 FEATURE_DISABLED      → flag off; render nothing at all
 *   403 ENTITLEMENT_DENIED    → not on a plan that includes it
 * The 409 screener codes and the 503 generation error belonged to POST.
 * Their classes are kept — `rethrowTyped` is shared and the backend may
 * still emit them — but no read path produces them today.
 *
 * Response envelope: cos-backend `sendSuccess` wraps payloads as
 * `{ success: true, data: ... }`. Defensive unwrap mirrors daily-read.ts.
 */

import axios from 'axios'

import { apiClient } from '@/lib/api-client'
import type { PlanHabit } from '@/services/api/types'

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

/**
 * Which part of the plan an accepted suggestion belongs to.
 *
 * Deliberately the HABIT vocabulary rather than a parallel nutrition one:
 * COS-1219 routes accepted suggestions to routines, so `suggestion.domain`
 * is handed straight to `UpsertHabitInput.bpsDomain` with no mapping. Typing
 * it as the same thing is what makes that passthrough checkable — if the two
 * vocabularies ever diverge, this line fails to compile rather than the call
 * site silently sending a value the backend rejects.
 */
export type NutritionDomain = PlanHabit['bpsDomain']

export interface NutritionSuggestion {
  factor: NutritionFactor
  title: string
  rationale: string
  /**
   * REQUIRED, and there is no app-side default.
   *
   * The backend sends it on every suggestion including older stored plans
   * (COS-1222), so absence is a contract break, not a legacy shape. Guessing
   * a domain here would file a nutrition routine under whichever part of the
   * plan this file happened to pick.
   */
  domain: NutritionDomain
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

const DOMAINS: readonly NutritionDomain[] = ['bio', 'psycho', 'social', 'spiritual']

function normalize(shaped: Partial<NutritionPlan> | undefined): NutritionPlan {
  const raw = Array.isArray(shaped?.suggestions) ? shaped!.suggestions! : []
  const suggestions = raw
    // DROPPED, not defaulted, when `domain` is missing or unrecognised. This
    // rebuild is field-by-field, so a new field that is not named here simply
    // vanishes — which is how a suggestion would reach the UI with nothing to
    // route it by. A suggestion we cannot file is one we must not offer.
    .filter(
      (s): s is NutritionSuggestion =>
        !!s &&
        typeof s.title === 'string' &&
        s.title !== '' &&
        DOMAINS.includes(s.domain as NutritionDomain),
    )
    .map((s) => ({
      factor: s.factor,
      title: s.title,
      rationale: typeof s.rationale === 'string' ? s.rationale : '',
      domain: s.domain,
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
 * Read the patient's stored nutrition plan. One DynamoDB read, zero Bedrock
 * calls — the only call this client makes.
 *
 * Resolves to `null` when the care plan has not produced one yet: the backend
 * returns 200 with `plan: null` for that, deliberately, so it is
 * distinguishable from the feature being disabled (404). Null is a WAITING
 * state, not an invitation to build one.
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
