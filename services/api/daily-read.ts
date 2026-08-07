/**
 * SCRUM-644 — Daily Read API client.
 *
 * Talks to the cos-backend daily-read route:
 *   GET /v1/patients/me/daily-read?tzOffsetMinutes=<int>
 *
 * The route is ALWAYS MOUNTED — handler short-circuits with a 404
 * `{ code: 'FEATURE_DISABLED' }` when the backend flag is OFF
 * (mirror of health-age.ts + wellbeing-score.routes.ts discipline).
 * The client surfaces FEATURE_DISABLED as a distinct thrown error via
 * `DailyReadFeatureDisabledError` so callers can silently collapse the
 * surface without surfacing a scary "network error".
 *
 * Response envelope: cos-backend `sendSuccess` wraps payloads as
 * `{ success: true, data: ... }`. Defensive unwrap matches the
 * health-age client so a benign envelope tweak never breaks UI.
 *
 * Types mirror the BE DailyReadResponse / DailyReadPillar shape
 * defined in cos-backend/src/services/home-daily-read/aggregator.ts.
 * Copy on the tile itself is HONEST-placeholder — final copy pending
 * Ken clinical + design (see feedback_design_before_implementation.md).
 */

import axios from 'axios'

import { apiClient } from '@/lib/api-client'

// ─── Errors ──────────────────────────────────────────────────────────

export class DailyReadFeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED'
  constructor() {
    super('Daily Read feature is disabled')
    this.name = 'DailyReadFeatureDisabledError'
  }
}

// ─── Types (mirror BE DailyReadResponse) ─────────────────────────────

/**
 * Ken 2026-08-07: habits and glucose are OUT as fixed pillars. `readings`
 * replaces them and is driven by whatever the patient actually records —
 * blood pressure, glucose, weight, pulse — so nobody sees a permanently
 * empty Glucose row, and someone logging BP finally sees it.
 */
export type DailyReadPillarKey =
  | 'healthAge'
  | 'wellbeing'
  // Task completion reads the same 7-day getTaskAnalytics rollup the
  // wellbeing composite uses, so the two surfaces cannot disagree.
  | 'taskCompletion'
  | 'readings'

export type DailyReadPillarState = 'ready' | 'insufficient_data' | 'flag_off'

export type DailyReadPillarBand = 'good' | 'fair' | 'attention'

export type DailyReadHeadlineTone = 'positive' | 'steady' | 'attention' | 'empty'

export interface DailyReadPillar {
  key: DailyReadPillarKey
  label: string
  state: DailyReadPillarState
  band?: DailyReadPillarBand
  oneLiner?: string
  ctaHref?: string
  /**
   * #9 — the pillar's value on its own native axis, 0-100. Optional and
   * nullable: a pillar that is `insufficient_data` has no number, and null
   * must never be coerced to 0 (a patient with no readings is not a patient
   * scoring zero). Absent on responses from a backend older than #9.
   */
  score?: number | null
}

export interface DailyReadHeadline {
  tone: DailyReadHeadlineTone
  text: string
}

export interface DailyReadResponse {
  /** ISO 8601 timestamp of aggregator computation. */
  generatedAt: string
  /** Client-supplied tz offset used for day bucketing (defaults 0/UTC). */
  tzOffsetMinutes: number
  /** YYYY-MM-DD bucket the payload represents (cache key input). */
  dayBucket: string
  pillars: DailyReadPillar[]
  headline: DailyReadHeadline
  /** True when every pillar landed non-ready — client renders onboarding CTA. */
  empty: boolean
  /**
   * #9 — weighted composite of the scoring pillars, 0-100, or null when every
   * scoring pillar is missing. Null rather than 0, same rule as the wellbeing
   * score. Absent on responses from a backend older than #9.
   */
  score?: number | null
}

// ─── Envelope helper ─────────────────────────────────────────────────

function unwrap<T>(body: any): T {
  if (body == null) return body as T
  if (body.data && typeof body.data === 'object') return body.data as T
  return body as T
}

function throwIfFeatureDisabled(err: unknown): never {
  if (axios.isAxiosError(err) && err.response?.status === 404) {
    const code = (err.response.data as { code?: string } | undefined)?.code
    if (code === 'FEATURE_DISABLED') {
      throw new DailyReadFeatureDisabledError()
    }
  }
  throw err as Error
}

function normalizePillar(p: Partial<DailyReadPillar> | undefined): DailyReadPillar | null {
  if (!p || !p.key || !p.state) return null
  return {
    key: p.key,
    label: p.label ?? '',
    state: p.state,
    band: p.band,
    oneLiner: p.oneLiner,
    ctaHref: p.ctaHref,
  }
}

function normalizeResponse(shaped: Partial<DailyReadResponse> | undefined): DailyReadResponse {
  const pillarsIn = Array.isArray(shaped?.pillars) ? shaped!.pillars! : []
  const pillars = pillarsIn
    .map((p) => normalizePillar(p as Partial<DailyReadPillar>))
    .filter((p): p is DailyReadPillar => p !== null)
  const headline = shaped?.headline ?? { tone: 'empty' as const, text: '' }
  return {
    generatedAt: shaped?.generatedAt ?? '',
    tzOffsetMinutes: typeof shaped?.tzOffsetMinutes === 'number' ? shaped!.tzOffsetMinutes! : 0,
    dayBucket: shaped?.dayBucket ?? '',
    pillars,
    headline: {
      tone: headline.tone ?? 'empty',
      text: headline.text ?? '',
    },
    empty: shaped?.empty === true,
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────

export interface GetDailyReadOptions {
  /** Client tz offset in minutes (e.g. -420 for PDT). Defaults to device tz. */
  tzOffsetMinutes?: number
}

/**
 * Fetch today's consolidated Daily Read for the authenticated patient.
 * Read-through (server caches per-user per-dayBucket for 5 min).
 *
 * Never throws on partial signal failure — the aggregator represents
 * missing signals as `state: 'insufficient_data'` inline. The only
 * expected throw is FEATURE_DISABLED (flag OFF) or an auth/network error.
 */
export async function getDailyRead(
  opts: GetDailyReadOptions = {},
): Promise<DailyReadResponse> {
  const tz = typeof opts.tzOffsetMinutes === 'number'
    ? opts.tzOffsetMinutes
    // Device tz: JS getTimezoneOffset returns minutes to add to local to
    // reach UTC (opposite sign of what "tz offset from UTC" usually
    // means). Negate so PDT (-7h) sends -420, matching the aggregator's
    // "add to UTC to reach local" convention.
    : -new Date().getTimezoneOffset()
  try {
    const res = await apiClient.get<any>('/v1/patients/me/daily-read', {
      params: { tzOffsetMinutes: tz },
    })
    return normalizeResponse(unwrap<Partial<DailyReadResponse>>(res.data))
  } catch (err) {
    throwIfFeatureDisabled(err)
  }
}
