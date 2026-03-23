/**
 * Stub — WatermelonDB removed. Local Fasten Health file processing is no longer supported.
 * TODO: replace with API-backed EHR data via HealthLake endpoints.
 */

export interface ProcessedClinic {
  id: string
  name: string
  address?: { line?: string | string[]; city?: string; state?: string; zip?: string }
  phone?: string
  email?: string
}

export interface ProcessedFastenData {
  clinics: ProcessedClinic[]
}

export async function processFastenHealthDataFromFile(): Promise<ProcessedFastenData> {
  return { clinics: [] }
}
