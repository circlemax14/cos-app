import { apiClient } from '@/lib/api-client'

export type Owner = 'system' | `agency:${string}`
export type OwnerType = 'system' | 'agency'
export type InstrumentStatus = 'draft' | 'active' | 'archived'
export type ItemKind = 'likert' | 'choice' | 'number' | 'multi' | 'text'

export interface InstrumentItem {
  id: string
  text: string
  kind: ItemKind
  options?: { label: string; value: number }[]
  min?: number
  max?: number
  help?: string
}

export interface RiskBand {
  min?: number
  max?: number
  label: string
  severity?: 'low' | 'moderate' | 'high'
  careAction?: string
}

export interface ScoringRules {
  kind: 'sum' | 'ratio' | 'count' | 'custom'
  numerator?: string
  denominator?: string
  itemIds?: string[]
  handler?: string
}

export interface InstrumentSummary {
  id: string
  instrumentId: string
  version: number
  name: string
  description: string
  clinicalPurpose: string
  items: InstrumentItem[]
  scoringRules: ScoringRules
  riskBands: RiskBand[]
  expiryDays: number
  owner: Owner
  ownerType: OwnerType
  agencyId?: string
  status: InstrumentStatus
  createdAt: string
  updatedAt: string
}

/**
 * Fetch the set of instrument definitions visible to the current user.
 * Backend filters by plan tier: basic → [], advanced → system rows,
 * agency → system + agency-customized.
 */
export async function fetchInstruments(): Promise<InstrumentSummary[]> {
  const res = await apiClient.get<{
    success: boolean
    data: { instruments: InstrumentSummary[] }
  }>('/v1/instruments')
  return res.data.data.instruments ?? []
}

export interface RecommendedInstrumentsResponse {
  instruments: InstrumentSummary[]
  rationale: Record<string, string>
  cached: boolean
}

/**
 * AI-recommended subset of the patient's available check-ins
 * (SCRUM-231). Backend reads FHIR context, calls Bedrock, and returns
 * 5–9 instrumentIds best suited to this patient + a one-sentence
 * rationale per id. On backend failure or partial result, the endpoint
 * falls back to the full set with an empty rationale map.
 */
export async function fetchRecommendedInstruments(): Promise<RecommendedInstrumentsResponse> {
  const res = await apiClient.get<{
    success: boolean
    data: RecommendedInstrumentsResponse
  }>('/v1/instruments/recommended')
  return {
    instruments: res.data.data.instruments ?? [],
    rationale: res.data.data.rationale ?? {},
    cached: !!res.data.data.cached,
  }
}
