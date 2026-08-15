/**
 * FDA drug-label facts for the medication card — SCRUM-674b.
 *
 * The endpoint is dark behind `drug_label_lookup_enabled` and 404s when off.
 * A 404 is therefore the NORMAL state today, not an error: it resolves to
 * `found: false`, and the card renders nothing at all.
 */
import { apiClient } from '@/lib/api-client'

export interface DrugLabelFacts {
  query: string
  found: boolean
  brandName?: string
  genericName?: string
  usage?: string
  sideEffects?: string
  /**
   * Tri-state on purpose. `undefined` means the label carries no
   * pharmacologic class — which is NOT "no", and must never render as one.
   */
  isCorticosteroid?: boolean
  source?: string
  retrievedAt?: string
}

const NOT_FOUND: DrugLabelFacts = { query: '', found: false }

export async function fetchDrugLabel(name: string): Promise<DrugLabelFacts> {
  const trimmed = (name ?? '').trim()
  if (trimmed === '') return NOT_FOUND
  try {
    const res = await apiClient.get<{ success: boolean; data: DrugLabelFacts }>(
      '/v1/drug-label',
      { params: { name: trimmed } },
    )
    return res.data.data ?? NOT_FOUND
  } catch {
    // Flag off (404), offline, timeout — all the same to the patient, and all
    // render as nothing rather than as an error they cannot act on.
    return NOT_FOUND
  }
}
