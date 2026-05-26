import { apiClient } from '@/lib/api-client'

/**
 * Known instrument IDs. The list is informational only — the backend
 * is the source of truth and validates against `INSTRUMENT_IDS`
 * server-side, and agency-authored instruments can have arbitrary IDs.
 * Callers may pass any string; this union just powers autocomplete for
 * common system instruments.
 */
export type InstrumentId =
  | 'phq-2' | 'phq-9' | 'gad-7'
  | 'adl' | 'iadl'
  | 'lifestyle' | 'goals' | 'wellbeing' | 'sleep' | 'pain'
  | 'moca-xpresso'
  | 'wellbeing-5' | 'alcohol-3' | 'loneliness-3'
  | 'sleep-4' | 'pain-4' | 'physical-function-4'
  | 'falls-12' | 'nutrition-5' | 'cognition-8'
  | (string & {})

export type AssessmentSource = 'self' | 'care-manager' | 'ehr-pre-fill'

/**
 * SCRUM-268 Phase 2: snapshot of the risk band that was computed at
 * completion. Backed by the matching entry in the instrument
 * definition's `riskBands`. May be missing for legacy records, free-form
 * instruments, or instruments with no bands.
 */
export interface BandSnapshot {
  label: string
  severity?: 'low' | 'moderate' | 'high'
  careAction?: string
}

export interface AssessmentRecord {
  instrumentId: InstrumentId
  version: number
  responses: Record<string, unknown>
  scores: Record<string, number>
  /** SCRUM-268 Phase 2: descriptive interpretation frozen at completion. */
  band?: BandSnapshot
  source: AssessmentSource
  completedAt: string
  expiresAt: string
  updatedBy: string
}

export interface PrefillItem<T> {
  data: T
  source: 'fhir' | 'profile' | 'self'
  recordedAt?: string
  stale: boolean
}

export interface PrefillSummary {
  demographics: { age?: number; sex?: string }
  conditions: PrefillItem<{ name: string; code?: string; onsetDate?: string; status?: string; severity?: string }>[]
  medications: PrefillItem<{ name: string; dosage?: string; status: string; prescriber?: string }>[]
  allergies: PrefillItem<{ substance: string; criticality?: string; reaction?: string }>[]
  vitals: PrefillItem<{ name: string; value: string; unit?: string; recordedAt: string; abnormal?: boolean }>[]
  abnormalLabs: PrefillItem<{ name: string; value: string; unit?: string; recordedAt: string; abnormal?: boolean }>[]
  computedAt: string
}

export async function fetchAssessmentPrefill(): Promise<PrefillSummary> {
  const res = await apiClient.get<{ success: boolean; data: PrefillSummary }>(
    '/v1/patients/me/assessments/pre-fill',
  )
  return res.data.data
}

export async function fetchAssessments(): Promise<AssessmentRecord[]> {
  const res = await apiClient.get<{ success: boolean; data: { assessments: AssessmentRecord[] } }>(
    '/v1/patients/me/assessments',
  )
  return res.data.data.assessments
}

export async function fetchAssessment(instrumentId: InstrumentId): Promise<AssessmentRecord | null> {
  try {
    const res = await apiClient.get<{ success: boolean; data: AssessmentRecord }>(
      `/v1/patients/me/assessments/${instrumentId}`,
    )
    return res.data.data
  } catch {
    return null
  }
}

export async function submitAssessment(
  instrumentId: InstrumentId,
  responses: Record<string, unknown>,
  source: AssessmentSource = 'self',
): Promise<AssessmentRecord> {
  const res = await apiClient.put<{ success: boolean; data: AssessmentRecord }>(
    `/v1/patients/me/assessments/${instrumentId}`,
    { responses, source },
  )
  return res.data.data
}

/**
 * SCRUM-268 Phase 3: fetch the full history (latest + all retake
 * snapshots) of one instrument for the current user, sorted newest
 * first. Used by the Self-Assessments trend view.
 */
export async function fetchAssessmentHistory(
  instrumentId: InstrumentId,
): Promise<AssessmentRecord[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: { records: AssessmentRecord[] } }>(
      `/v1/patients/me/assessments/${instrumentId}/history`,
    )
    return res.data.data.records ?? []
  } catch {
    return []
  }
}
