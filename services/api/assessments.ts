import { apiClient } from '@/lib/api-client'

export type InstrumentId =
  | 'phq-2' | 'phq-9' | 'gad-7'
  | 'adl' | 'iadl'
  | 'lifestyle' | 'goals' | 'wellbeing' | 'sleep' | 'pain'
  | 'moca-xpresso'

export type AssessmentSource = 'self' | 'care-manager' | 'ehr-pre-fill'

export interface AssessmentRecord {
  instrumentId: InstrumentId
  version: number
  responses: Record<string, unknown>
  scores: Record<string, number>
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
