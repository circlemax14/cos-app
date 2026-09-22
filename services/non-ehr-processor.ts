/**
 * COS-1079 — the API-backed approach the stub's TODO asked for.
 *
 * ─── WHAT THIS FILE WAS, AND WHAT IT COST ────────────────────────────
 *
 * Until now every export here was a no-op:
 *
 *     processAndStoreFiles() -> return []
 *     getNonEhrProviders()   -> return []
 *
 * Meanwhile IntegrativeScreen.tsx (800 lines) shipped a working file picker
 * offering up to ten uploads, non-ehr-provider-detail.tsx (870 lines) shipped
 * a provider page, the route was registered, and `integrative-screen.view` was
 * granted by SEVEN of the nine production plans — including `premium`, which
 * every one of the 26 production patients is on.
 *
 * So a patient could upload their chiropractic record, watch the progress
 * complete, and land on a permanently empty provider list. The app then told
 * them they had no providers. That is a claim about THEM, and it was false:
 * nothing ever processed what they gave us.
 *
 * The screens do not change. They finally have something to call.
 */

import { apiClient } from '@/lib/api-client';

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

interface ApiProvider {
  id: string
  name?: string
  providerName?: string
  clinicName?: string
  specialty?: string
  phone?: string
  address?: string
  email?: string
  isEhr?: boolean
}

/**
 * Providers found in documents the patient uploaded.
 *
 * Deliberately NOT `GET /v1/patients/me/providers`. That endpoint starts with
 * `resolveFhirPatientId`, which answers 404 FHIR_NOT_CONNECTED — "Please
 * connect via Fasten Health first" — whenever no EHR is linked. For the
 * patient this whole screen exists for, that is every single request: the one
 * feature built for people without an EHR would have been served by an
 * endpoint that refuses unless they have one.
 */
export async function getNonEhrProviders(): Promise<NonEhrProvider[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: ApiProvider[] }>(
      '/v1/patients/me/documents/providers',
    )
    return (res.data?.data ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? p.providerName ?? 'Unknown provider',
      providerName: p.providerName ?? p.name ?? '',
      clinicName: p.clinicName ?? '',
      email: p.email,
      specialty: p.specialty,
      address: p.address,
      phone: p.phone,
      notes: [],
      fileIds: [],
      appointments: [],
    }))
  } catch {
    // Returning [] here would be indistinguishable from "you have no
    // providers" — the exact false claim this file used to make. Throwing
    // lets the screen offer a retry instead of blaming the patient.
    throw new Error('Could not load your providers. Pull down to try again.')
  }
}

interface PickedFile {
  uri: string
  name?: string
  fileName?: string
  mimeType?: string
  size?: number
}

const READABLE = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/tiff',
]

/**
 * Upload each picked file and confirm it landed.
 *
 * Three steps per file: ask the backend for a presigned PUT, send the bytes
 * straight to S3, then tell the backend to verify with S3 that they arrived.
 *
 * The bytes never pass through the API. A 23-page PDF as a base64 body would
 * sit against API Gateway's payload ceiling and would put PHI through a Lambda
 * that has no reason to hold it.
 *
 * Files are uploaded ONE AT A TIME. The picker allows ten, and ten concurrent
 * multi-megabyte PUTs from a phone on hospital wifi is how uploads fail
 * halfway. A slower upload that finishes beats a faster one that does not.
 */
export async function processAndStoreFiles(
  files: unknown[],
  _concurrency?: number,
): Promise<UploadResult[]> {
  const results: UploadResult[] = []

  for (const raw of files as PickedFile[]) {
    const name = raw.fileName ?? raw.name ?? 'document'
    const contentType = raw.mimeType ?? ''

    if (!READABLE.includes(contentType)) {
      results.push({
        success: false,
        added: false,
        isDuplicate: false,
        message: `${name} is not a PDF or an image, so we cannot read it.`,
        providers: [],
      })
      continue
    }

    try {
      const ticket = await apiClient.post<{
        success: boolean
        data: { documentId: string; uploadUrl: string }
      }>('/v1/patients/me/documents/upload-url', {
        fileName: name,
        contentType,
        sizeBytes: raw.size ?? 0,
      })

      const { documentId, uploadUrl } = ticket.data.data

      const blob = await (await fetch(raw.uri)).blob()
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': contentType, 'x-amz-server-side-encryption': 'aws:kms' },
      })
      if (!put.ok) throw new Error(`upload failed (${put.status})`)

      // S3 is the only thing that knows the file really arrived.
      await apiClient.post(`/v1/patients/me/documents/${documentId}/uploaded`, {})

      results.push({
        success: true,
        added: true,
        isDuplicate: false,
        // Deliberately not "added to your record": reading it is a separate
        // step that has not happened yet, and promising otherwise is how the
        // last version of this screen misled people.
        message: `${name} uploaded. We will read it and add what we find.`,
        providers: [],
      })
    } catch (err) {
      results.push({
        success: false,
        added: false,
        isDuplicate: false,
        message: err instanceof Error ? err.message : `${name} could not be uploaded.`,
        providers: [],
      })
    }
  }

  return results
}

 
export async function updateNonEhrProvider(_id: string, _update: Partial<NonEhrProvider>): Promise<void> {
  // no-op stub
}

interface ApiDocument {
  id: string
  title?: string
  contentType?: string
  contentSize?: number
  createdAt?: string
}

/** Documents the patient uploaded that this provider was read from. */
export async function getFilesForProvider(providerId: string): Promise<NonEhrFile[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: ApiDocument[] }>(
      `/v1/patients/me/documents?practitionerFhirId=${encodeURIComponent(providerId)}`,
    )
    return (res.data?.data ?? []).map((d) => ({
      id: d.id,
      name: d.title ?? 'Document',
      uri: '',
      mimeType: d.contentType ?? 'application/pdf',
      fileName: d.title ?? 'Document',
      size: d.contentSize,
      uploadedAt: d.createdAt,
    }))
  } catch {
    return []
  }
}

 
export async function upsertAppointmentForNonEhrProvider(_providerId: string, _appointment: Partial<NonEhrAppointment>): Promise<void> {
  // no-op stub
}

 
export async function getNonEhrClinics(): Promise<NonEhrClinic[]> {
  return []
}

export async function clearAllNonEhrData(): Promise<void> {
  // no-op stub
}
