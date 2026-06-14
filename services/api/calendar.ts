/**
 * Calendar API client (SCRUM-279 / COS-308).
 *
 * Talks to the cos-backend endpoints added in COS-309:
 *   - Patient self-service: CRUD on app-stored events, snapshot upload,
 *     health-plan-tasks-as-events.
 *   - (Care-manager endpoints are consumed by the web admin app, not
 *     by mobile.)
 *
 * Pure HTTP boundary — no React, no expo-calendar. Mobile-side wiring
 * lives in services/calendar.ts (merges server + device events) and
 * services/calendar-sync.ts (background snapshot upload).
 *
 * Response shape conforms to the backend's sendSuccess/sendError
 * contract: `{ success: true, data: { ... } }` on success.
 */

import { apiClient } from '../../lib/api-client'

// ── Wire types (kept in sync with cos-backend/src/types/calendar.types.ts)

export type ServerEventAuthor = 'patient' | 'care_manager' | 'system'
export type ServerEventVisibility = 'in_app_only' | 'device_sync'

export interface ServerCalendarEvent {
  id: string
  userId: string
  createdBy: string
  author: ServerEventAuthor
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  location?: string
  notes?: string
  url?: string
  showAs: 'busy' | 'free'
  alarms: number[]
  recurrenceRule?: string
  timeZone: string
  travelTimeMinutes?: number
  visibility: ServerEventVisibility
  clientId?: string
  scheduledDateIso: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface ServerCalendarEventCreatePayload {
  title: string
  startDate: string
  endDate: string
  allDay?: boolean
  location?: string
  notes?: string
  url?: string
  showAs?: 'busy' | 'free'
  alarms?: number[]
  recurrenceRule?: string
  timeZone?: string
  travelTimeMinutes?: number
  visibility?: ServerEventVisibility
  clientId?: string
}

export interface SnapshotEventPayload {
  origin: 'device' | 'reminder'
  sourceEventId: string
  sourceCalendarName: string
  sourceCalendarSource: string
  sourceCalendarColor: string
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  location?: string
  notes?: string
  alarms: number[]
  completed?: boolean
  contentHash: string
}

// ── Date-range helpers ───────────────────────────────────────────────────

function defaultRange(): { from: string; to: string } {
  const today = new Date()
  const from = new Date(today.getTime() - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10)
  const to = new Date(today.getTime() + 365 * 24 * 60 * 60_000).toISOString().slice(0, 10)
  return { from, to }
}

// ── Patient endpoints ────────────────────────────────────────────────────

export async function listServerCalendarEvents(
  range: { from?: string; to?: string } = {},
): Promise<ServerCalendarEvent[]> {
  const { from = defaultRange().from, to = defaultRange().to } = range
  const res = await apiClient.get(`/v1/patients/me/calendar-events?from=${from}&to=${to}`)
  return res.data?.data?.events ?? []
}

export async function createServerCalendarEvent(
  payload: ServerCalendarEventCreatePayload,
): Promise<ServerCalendarEvent> {
  const res = await apiClient.post('/v1/patients/me/calendar-events', payload)
  return res.data?.data?.event
}

export async function updateServerCalendarEvent(
  id: string,
  patch: Partial<ServerCalendarEventCreatePayload>,
): Promise<ServerCalendarEvent> {
  const res = await apiClient.put(`/v1/patients/me/calendar-events/${id}`, patch)
  return res.data?.data?.event
}

export async function deleteServerCalendarEvent(id: string): Promise<void> {
  await apiClient.delete(`/v1/patients/me/calendar-events/${id}`)
}

/**
 * SCRUM-279 (build 46): chunked snapshot upload.
 *
 * The wider snapshot window (build 46: 30d back → 365d forward) plus
 * busy patient calendars can produce 1000+ rows. The backend zod
 * validator caps at 500 per request, so we chunk transparently here.
 * Each chunk POSTs sequentially; if one fails we still report what
 * succeeded so the user's data isn't lost on a partial outage.
 */
const SNAPSHOT_CHUNK_SIZE = 200;

export async function uploadCalendarSnapshot(
  events: SnapshotEventPayload[],
  capturedAt: string = new Date().toISOString(),
): Promise<{ written: number }> {
  if (events.length === 0) return { written: 0 }
  let total = 0
  for (let i = 0; i < events.length; i += SNAPSHOT_CHUNK_SIZE) {
    const chunk = events.slice(i, i + SNAPSHOT_CHUNK_SIZE)
    try {
      const res = await apiClient.post('/v1/patients/me/calendar-snapshot', { events: chunk, capturedAt })
      total += res.data?.data?.written ?? chunk.length
    } catch {
      // Partial-failure: skip this chunk, keep going. The next bg
      // sync run will re-attempt the missing rows.
    }
  }
  return { written: total }
}

export interface SnapshotRow extends SnapshotEventPayload {
  id: string
  userId: string
  capturedAt: string
}

/**
 * Read back the patient's own snapshot. Used for cross-device parity:
 * iPad pulls in events iPhone uploaded so reminders that only live on
 * one device still surface in our calendar on every device.
 */
export async function listMyCalendarSnapshot(
  range: { from?: string; to?: string } = {},
): Promise<SnapshotRow[]> {
  const { from = defaultRange().from, to = defaultRange().to } = range
  const res = await apiClient.get(`/v1/patients/me/calendar-snapshot?from=${from}&to=${to}`)
  return res.data?.data?.events ?? []
}

export async function listHealthPlanTasksAsEvents(
  range: { from?: string; to?: string } = {},
): Promise<ServerCalendarEvent[]> {
  const { from = defaultRange().from, to = defaultRange().to } = range
  const res = await apiClient.get(
    `/v1/patients/me/health-plan/tasks-as-events?from=${from}&to=${to}`,
  )
  return res.data?.data?.events ?? []
}
