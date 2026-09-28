/**
 * COS-1147 — Heart Age API client.
 *
 *   GET /v1/patients/me/heart-age — Framingham 2008 vascular age
 *
 * SEPARATE from Health Age, and the separation is the point. Health Age is
 * Levine PhenoAge, a biological-age estimate from nine analytes. This is a
 * cardiovascular risk-equivalent age from a different cohort answering a
 * different question. They are never blended, averaged, or presented as
 * versions of one another.
 *
 * Route is always mounted; the handler 404s `FEATURE_DISABLED` when the
 * backend flag is OFF, so the surface collapses silently rather than showing a
 * network error. Same discipline as the Health Age client next door.
 */

import axios from 'axios'

import { apiClient } from '@/lib/api-client'

export class HeartAgeFeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED'
  constructor() {
    super('Heart Age feature is disabled')
    this.name = 'HeartAgeFeatureDisabledError'
  }
}

export interface HeartAgeFactor {
  /** One of the Framingham inputs — 'hdl', 'diabetes', 'systolicBp', … */
  factor: string
  /** Signed years this factor adds (+) or removes (−) versus the reference. */
  years: number
}

export interface HeartAge {
  /** Years, or null when the model cannot be applied. */
  heartAge: number | null
  gapYears: number | null
  /** True when the figure exceeded the display cap and should render "80+". */
  capped: boolean
  reason?: 'age-out-of-range' | 'missing-inputs' | 'implausible-inputs'
  chronologicalAge: number | null
  /** Inputs we could not resolve. Non-empty means the figure is partial. */
  missing: string[]
  factors: HeartAgeFactor[]
  /** True when BP-medication status was assumed rather than answered. */
  bpTreatmentAssumed: boolean
  /**
   * What this model does NOT use. Carried on the wire, not just written into
   * the UI, so every consumer states it — the clinical lead asked specifically
   * about triglycerides and no published heart-age model reads them.
   */
  excludes: string[]
  generatedAt: string
}

export async function fetchHeartAge(): Promise<HeartAge> {
  try {
    const res = await apiClient.get<{ success?: boolean; data?: HeartAge } | HeartAge>(
      '/v1/patients/me/heart-age',
    )
    const body = res.data as { data?: HeartAge } & HeartAge
    return (body?.data ?? body) as HeartAge
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      const code = (err.response.data as { code?: string } | undefined)?.code
      if (code === 'FEATURE_DISABLED') throw new HeartAgeFeatureDisabledError()
    }
    throw err
  }
}

/** Patient-facing labels for the Framingham inputs. */
export const FACTOR_LABELS: Record<string, string> = {
  totalCholesterol: 'Total cholesterol',
  hdl: 'HDL cholesterol',
  systolicBp: 'Blood pressure',
  bpTreated: 'Blood pressure medication',
  currentSmoker: 'Smoking',
  diabetes: 'Blood sugar',
}
