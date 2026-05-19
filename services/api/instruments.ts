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
