/**
 * Stub — WatermelonDB removed. Non-EHR provider local processing is no longer supported.
 * These exports exist only to prevent import errors while screens are migrated to API-backed data.
 * TODO: replace non-EHR provider integration with an API-backed approach.
 */

export interface NonEhrAppointment {
  id: string
  date: string
  time?: string
  type?: string
  status?: string
  notes?: string
  targetProviderId?: string
}

export interface NonEhrNote {
  id: string
  content: string
  createdAt: string
}

export interface NonEhrFile {
  id: string
  name: string
  uri: string
  mimeType: string
  fileName: string
  size?: number
  uploadedAt?: string
}

export interface NonEhrProvider {
  id: string
  name: string
  providerName: string
  clinicName: string
  email?: string
  specialty?: string
  address?: string
  phone?: string
  notes?: NonEhrNote[]
  fileIds: string[]
  appointments: NonEhrAppointment[]
}

export interface UploadResult {
  success: boolean
  message?: string
  added: boolean
  isDuplicate: boolean
  providers: NonEhrProvider[]
}

export interface NonEhrClinic {
  id: string
  name: string
  address?: string
  phone?: string
  email?: string
  createdAt?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getNonEhrProviders(): Promise<NonEhrProvider[]> {
  return []
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function processAndStoreFiles(_files: unknown[], _concurrency?: number): Promise<UploadResult[]> {
  return []
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function updateNonEhrProvider(_id: string, _update: Partial<NonEhrProvider>): Promise<void> {
  // no-op stub
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getFilesForProvider(_providerId: string): Promise<NonEhrFile[]> {
  return []
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function upsertAppointmentForNonEhrProvider(_providerId: string, _appointment: Partial<NonEhrAppointment>): Promise<void> {
  // no-op stub
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getNonEhrClinics(): Promise<NonEhrClinic[]> {
  return []
}

export async function clearAllNonEhrData(): Promise<void> {
  // no-op stub
}
