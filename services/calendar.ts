/**
 * SCRUM-279 / COS-308 — Full calendar service.
 *
 * Builds on top of `expo-calendar` to provide a high-level Apple-Calendar-
 * style API: read events from all device calendars (Apple, iCloud, Google,
 * Outlook, Teams via Exchange), create/edit/delete events that propagate
 * back to the source calendar via EventKit/CalendarContract, and merge
 * our app's own appointments as a virtual overlay.
 *
 * Privacy stance:
 *  - READ — event data stays on device. We never forward titles/notes
 *    from device calendars to the cos-backend.
 *  - WRITE — events the USER creates from inside our app are written to
 *    the OS calendar they pick. That OS calendar may sync to a cloud
 *    service (iCloud, Google, Exchange) by the user's existing
 *    configuration — we do not initiate that sync, but we do enable it.
 *    The UI layer (see app/Home/calendar.tsx) must surface a one-time
 *    HIPAA disclosure before the first write-back so the user understands
 *    medical content they create here may sync to their other devices.
 *  - The OS calendar permission prompt happens just-in-time when the
 *    calendar screen first mounts; if denied we render a Grant button
 *    that deep-links to Settings.
 *
 * Defensive coding: every native bridge call is wrapped in try/catch.
 * react-native-health / expo-calendar both have a history of throwing
 * fatal NSException from the native side on iOS 26.5; until the SCRUM-269
 * launch crash bisection is done we hard-defense every entry point so
 * one bad call cannot tear down the JS bridge or the app.
 */

import * as Calendar from 'expo-calendar'
import { Platform } from 'react-native'

// ── Public types ──────────────────────────────────────────────────────────

export interface CalendarSource {
  id: string
  /** Human-readable name as the OS reports it ("Calendar", "Work", etc.). */
  title: string
  /** Account/source ("iCloud", "Google", "Outlook", "Local"). */
  source: string
  /** Hex color the OS suggested for this calendar. */
  color: string
  /**
   * Whether this calendar accepts NEW events from us. Some calendars
   * (subscribed / read-only) are display-only.
   */
  allowsWrite: boolean
}

export interface CalendarEvent {
  /** Stable OS id. For app-injected virtual events (past visits) this
   *  is `app:visit:${visitId}` etc. so the UI can disambiguate. */
  id: string
  /** Event title as the user wrote it (or our app's appointment title). */
  title: string
  /** ISO start (timezone preserved as the device reported it). */
  startDate: string
  /** ISO end. */
  endDate: string
  /** All-day flag from the source calendar. */
  allDay: boolean
  /** Optional location string. */
  location?: string
  /** Optional notes / description. */
  notes?: string
  /** Source calendar id (`calendarId` on EKEvent). */
  calendarId: string
  /** Resolved source calendar (color, name, source) — for the UI to
   *  render a dot or badge without an extra lookup. Falls back to a
   *  best-effort placeholder if the calendar isn't in our cache yet. */
  source: CalendarSource
  /** Where the event came from. `device` = OS-stored event;
   *  `reminder` = iOS Reminders app entry; `app` = virtual injected
   *  from our backend (past visit, appointment, etc.). */
  origin: 'device' | 'app' | 'reminder'
  /** If origin === 'app', what kind of app entity this represents. */
  appKind?: 'past-visit' | 'appointment' | 'task'
  /** Per-event reminders (offset minutes BEFORE startDate). */
  alarms: number[]
  /** For reminders: whether marked complete in iOS Reminders. */
  completed?: boolean
}

export interface PermissionState {
  granted: boolean
  /** True once the OS prompt has been shown at least once. iOS only
   *  shows it once — after that we have to deep-link to Settings. */
  prompted: boolean
  /** True if the user can WRITE events. Distinct from read on iOS 17+
   *  where there's a separate "full access" tier. */
  canWrite: boolean
}

export interface CreateEventInput {
  title: string
  startDate: Date
  endDate: Date
  allDay?: boolean
  location?: string
  notes?: string
  /** Which device calendar this should be written to (id from
   *  `listCalendars()`). Required so we don't guess. */
  calendarId: string
  /** Reminder offsets in minutes before start. e.g. [15, 60]. */
  alarms?: number[]
}

export type UpdateEventInput = Partial<Omit<CreateEventInput, 'calendarId'>> & {
  id: string
}

// ── Permissions ───────────────────────────────────────────────────────────

/**
 * Read the current calendar permission state without prompting.
 * Returns granted=false on any native error — see file header.
 */
export async function getPermissionStatus(): Promise<PermissionState> {
  try {
    const status = await Calendar.getCalendarPermissionsAsync()
    return {
      granted: status.status === 'granted',
      prompted: status.status !== 'undetermined',
      // iOS 17+ exposes a granular `accessLevel`. expo-calendar normalises
      // to "granted" when either full or write-only is held. Without an
      // explicit way to distinguish we treat any granted state as
      // writable; if the actual createEventAsync call fails with a
      // write-denied error, we surface that to the UI.
      canWrite: status.status === 'granted',
    }
  } catch {
    return { granted: false, prompted: false, canWrite: false }
  }
}

/**
 * Trigger the OS permission prompt. On iOS this only shows the system
 * dialog the FIRST time it is called; subsequent calls just return the
 * cached answer. The UI should detect `prompted && !granted` and offer a
 * "Grant Permission" button that opens iOS Settings.
 */
export async function requestPermission(): Promise<PermissionState> {
  try {
    const status = await Calendar.requestCalendarPermissionsAsync()
    return {
      granted: status.status === 'granted',
      prompted: status.status !== 'undetermined',
      canWrite: status.status === 'granted',
    }
  } catch {
    return { granted: false, prompted: false, canWrite: false }
  }
}

// ── Calendar listing ──────────────────────────────────────────────────────

/**
 * List all device calendars (Apple Calendar, iCloud, Google, Outlook,
 * Exchange-backed Teams, local). Returns `[]` if permission is missing
 * or the native call throws.
 */
export async function listCalendars(): Promise<CalendarSource[]> {
  const status = await getPermissionStatus()
  if (!status.granted) return []
  try {
    const raw = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
    return raw.map(mapCalendarToSource)
  } catch {
    return []
  }
}

function mapCalendarToSource(c: Calendar.Calendar): CalendarSource {
  return {
    id: c.id,
    title: c.title ?? 'Calendar',
    source: c.source?.name ?? 'Device',
    color: c.color ?? '#2E78F8',
    allowsWrite: c.allowsModifications ?? false,
  }
}

// ── Reading events ────────────────────────────────────────────────────────

export interface ReadEventsOptions {
  /** Inclusive lower bound. Defaults to 90 days ago. */
  windowStart?: Date
  /** Inclusive upper bound. Defaults to 365 days from now. */
  windowEnd?: Date
  /** If provided, only events from these calendar ids are returned;
   *  otherwise all calendars the user granted access to. */
  calendarIds?: string[]
}

/**
 * Read events from device calendars within the requested window. Always
 * returns a sorted-by-start array; never throws.
 *
 * Performance: a user with a busy calendar can have thousands of events
 * over a year. We cap the default window at 90d back / 365d forward —
 * callers asking for wider should expect proportionally more memory.
 */
export async function readEvents(opts: ReadEventsOptions = {}): Promise<CalendarEvent[]> {
  const status = await getPermissionStatus()
  if (!status.granted) return []

  const windowStart = opts.windowStart ?? defaultWindowStart()
  const windowEnd = opts.windowEnd ?? defaultWindowEnd()

  let calendars: Calendar.Calendar[]
  try {
    calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
  } catch {
    return []
  }
  if (calendars.length === 0) return []

  const sourceById = new Map(calendars.map((c) => [c.id, mapCalendarToSource(c)]))
  const calendarIds = (opts.calendarIds && opts.calendarIds.length > 0)
    ? opts.calendarIds
    : calendars.map((c) => c.id)

  let raw: Calendar.Event[]
  try {
    raw = await Calendar.getEventsAsync(calendarIds, windowStart, windowEnd)
  } catch {
    return []
  }

  const events: CalendarEvent[] = raw.map((e) => mapEventToCalendarEvent(e, sourceById))
  events.sort((a, b) => a.startDate.localeCompare(b.startDate))
  return events
}

function mapEventToCalendarEvent(
  e: Calendar.Event,
  sourceById: Map<string, CalendarSource>,
): CalendarEvent {
  const source = sourceById.get(e.calendarId) ?? {
    id: e.calendarId,
    title: 'Calendar',
    source: 'Device',
    color: '#2E78F8',
    allowsWrite: false,
  }
  return {
    id: e.id,
    title: e.title ?? '(No title)',
    startDate: isoOf(e.startDate),
    endDate: isoOf(e.endDate),
    allDay: !!e.allDay,
    location: e.location ?? undefined,
    notes: e.notes ?? undefined,
    calendarId: e.calendarId,
    source,
    origin: 'device',
    alarms: Array.isArray(e.alarms)
      ? e.alarms.map((a) => Math.round(a.relativeOffset ?? 0)).filter((m) => m <= 0).map((m) => -m)
      : [],
  }
}

function isoOf(d: string | Date | number): string {
  if (typeof d === 'string') return d
  return new Date(d).toISOString()
}

function defaultWindowStart(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  d.setHours(0, 0, 0, 0)
  return d
}

function defaultWindowEnd(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 365)
  d.setHours(23, 59, 59, 999)
  return d
}

// ── Writing events ────────────────────────────────────────────────────────

/**
 * Create a new event in the chosen device calendar. Returns the new
 * event id on success, null on failure. The created event will appear
 * in the source calendar app (Apple Calendar, Google, Outlook, etc.)
 * via the OS's normal sync.
 *
 * HIPAA-aware callers: if `notes` may contain medical content, the UI
 * must have already shown the disclosure that this event will sync to
 * the user's other calendar apps and any cloud accounts behind them.
 */
export async function createEvent(input: CreateEventInput): Promise<string | null> {
  const status = await getPermissionStatus()
  if (!status.granted || !status.canWrite) return null

  try {
    const eventId = await Calendar.createEventAsync(input.calendarId, {
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      allDay: input.allDay ?? false,
      location: input.location,
      notes: input.notes,
      alarms: (input.alarms ?? []).map((minutesBefore) => ({
        relativeOffset: -Math.abs(minutesBefore),
        method: Calendar.AlarmMethod.ALERT,
      })),
      timeZone: input.allDay ? undefined : intlTimeZone(),
    })
    return eventId
  } catch {
    return null
  }
}

export async function updateEvent(input: UpdateEventInput): Promise<boolean> {
  const status = await getPermissionStatus()
  if (!status.granted || !status.canWrite) return false
  try {
    const patch: Partial<Calendar.Event> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.startDate !== undefined) patch.startDate = input.startDate
    if (input.endDate !== undefined) patch.endDate = input.endDate
    if (input.allDay !== undefined) patch.allDay = input.allDay
    if (input.location !== undefined) patch.location = input.location
    if (input.notes !== undefined) patch.notes = input.notes
    if (input.alarms !== undefined) {
      patch.alarms = input.alarms.map((minutesBefore) => ({
        relativeOffset: -Math.abs(minutesBefore),
        method: Calendar.AlarmMethod.ALERT,
      }))
    }
    await Calendar.updateEventAsync(input.id, patch)
    return true
  } catch {
    return false
  }
}

export async function deleteEvent(id: string): Promise<boolean> {
  const status = await getPermissionStatus()
  if (!status.granted || !status.canWrite) return false
  try {
    await Calendar.deleteEventAsync(id)
    return true
  } catch {
    return false
  }
}

function intlTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

// ── App-injected virtual events (past visits, appointments) ───────────────

/**
 * Convert a backend appointment / past visit into a virtual `CalendarEvent`
 * that the calendar UI can render alongside device events. These are NOT
 * written to the device calendar — they live only in our UI layer.
 *
 * Callers pass a minimal shape; we fill in stable id, source badge, etc.
 */
export interface AppEventLike {
  id: string
  title: string
  startDate: string
  endDate: string
  location?: string
  notes?: string
  kind: 'past-visit' | 'appointment' | 'task'
}

export function virtualEventFromAppEntity(e: AppEventLike): CalendarEvent {
  const kindLabel = e.kind === 'past-visit' ? 'Past Visit'
    : e.kind === 'appointment' ? 'Appointment'
    : 'Task'
  return {
    id: `app:${e.kind}:${e.id}`,
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: false,
    location: e.location,
    notes: e.notes,
    calendarId: `app:${e.kind}`,
    source: {
      id: `app:${e.kind}`,
      title: kindLabel,
      source: 'Circle Support Health',
      color: e.kind === 'past-visit' ? '#5C8AC6' : e.kind === 'appointment' ? '#2E78F8' : '#7A6FF0',
      allowsWrite: false,
    },
    origin: 'app',
    appKind: e.kind,
    alarms: [],
  }
}

/**
 * Merge device events + app virtual events into a single time-sorted
 * stream. Callers fetch each side independently and pass them here.
 */
/**
 * Concatenate two event lists, dedup by `id` (first occurrence wins
 * — caller controls priority by ordering args), and sort by start
 * time.
 *
 * SCRUM-279 (2026-06-08 build 35): Ken's "iPad reminders appearing
 * 4-5 times" bug. The snapshot endpoint returns every uploaded row
 * for an event (each capturedAt = a new row); after multiple bg
 * uploads from iPhone, iPad fetched N copies. They mapped to the
 * same CalendarEvent.id, but the prior mergeEvents kept all N. Now
 * dedupes via a Set so even worst-case data has one row per id.
 */
export function mergeEvents(deviceEvents: CalendarEvent[], appEvents: CalendarEvent[]): CalendarEvent[] {
  // SCRUM-279 (2026-06-11 build 42): dedup key is now id + startDate.
  // Ken reported Apple Calendar showed 4 yesterday but the app showed 2.
  // Root cause: iOS expo-calendar returns the same `eventIdentifier`
  // for every occurrence of a recurring event, so a daily standup with
  // 4 instances in the window had all 4 collapsed to a single row by
  // dedup-by-id. Including startDate in the key keeps each instance
  // while still collapsing app-mirrored device events (which share both
  // id and startDate with their origin event).
  const seen = new Set<string>()
  const keyOf = (e: CalendarEvent): string => `${e.id}@${e.startDate}`
  const merged: CalendarEvent[] = []
  for (const e of deviceEvents) {
    const k = keyOf(e)
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(e)
  }
  for (const e of appEvents) {
    const k = keyOf(e)
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(e)
  }
  merged.sort((a, b) => a.startDate.localeCompare(b.startDate))
  return merged
}

// ── iOS Reminders integration ─────────────────────────────────────────────
//
// iOS keeps Calendar Events and Reminders in two separate EventKit stores.
// Apple's own Calendar app doesn't normally show Reminders alongside
// events, but Ken wants them merged. We read both stores and tag each
// item with `origin` so the UI can render them differently if needed.

export async function getReminderPermissionStatus(): Promise<PermissionState> {
  try {
    const status = await Calendar.getRemindersPermissionsAsync()
    return {
      granted: status.status === 'granted',
      prompted: status.status !== 'undetermined',
      canWrite: status.status === 'granted',
    }
  } catch {
    return { granted: false, prompted: false, canWrite: false }
  }
}

export async function requestReminderPermission(): Promise<PermissionState> {
  try {
    const status = await Calendar.requestRemindersPermissionsAsync()
    return {
      granted: status.status === 'granted',
      prompted: status.status !== 'undetermined',
      canWrite: status.status === 'granted',
    }
  } catch {
    return { granted: false, prompted: false, canWrite: false }
  }
}

/**
 * Read iOS Reminders within the window. Reminders without a due date
 * are EXCLUDED — they'd have nowhere to render on the calendar.
 */
export async function readReminders(opts: ReadEventsOptions = {}): Promise<CalendarEvent[]> {
  if (Platform.OS !== 'ios') return [] // expo-calendar reminders are iOS-only
  const status = await getReminderPermissionStatus()
  if (!status.granted) return []

  const windowStart = opts.windowStart ?? defaultWindowStart()
  const windowEnd = opts.windowEnd ?? defaultWindowEnd()

  let calendars: Calendar.Calendar[]
  try {
    calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER)
  } catch {
    return []
  }
  if (calendars.length === 0) return []

  const sourceById = new Map<string, CalendarSource>()
  for (const c of calendars) {
    sourceById.set(c.id, {
      id: c.id,
      title: c.title ?? 'Reminders',
      source: c.source?.name ?? 'Reminders',
      color: c.color ?? '#FF9500', // Apple Reminders orange
      allowsWrite: c.allowsModifications ?? false,
    })
  }

  // Reminders API: pass every calendar id we discovered (rather than
  // null) so the type checker is happy across expo-calendar 55 minor
  // versions. Pull incomplete + completed in the window separately so
  // we can render completed items struck-through (Apple Reminders UX).
  const calendarIds = calendars.map((c) => c.id)
  let raw: Calendar.Reminder[]
  try {
    const incomplete = await Calendar.getRemindersAsync(
      calendarIds,
      Calendar.ReminderStatus.INCOMPLETE,
      windowStart,
      windowEnd,
    )
    const completed = await Calendar.getRemindersAsync(
      calendarIds,
      Calendar.ReminderStatus.COMPLETED,
      windowStart,
      windowEnd,
    )
    raw = [...incomplete, ...completed]
  } catch {
    return []
  }

  const events: CalendarEvent[] = []
  for (const r of raw) {
    // Reminders without a due date have nothing to anchor on the calendar.
    const due = r.dueDate ?? r.startDate
    if (!due) continue
    const dueIso = isoOf(due)
    const source = sourceById.get(r.calendarId ?? '') ?? {
      id: r.calendarId ?? 'reminders',
      title: 'Reminders',
      source: 'Reminders',
      color: '#FF9500',
      allowsWrite: false,
    }

    // SCRUM-279 (build 46): respect the actual due TIME. Previously
    // every reminder was forced to allDay=true, so Ken's "daily
    // medication reminder at 9 AM" showed as a banner across the
    // whole day. Now: if iOS provides a dueDateComponents with hour
    // or minute set, the reminder is TIMED — render as a normal
    // point-in-time event. If all the time fields are absent OR the
    // dueDate is exactly midnight (00:00:00) with no time
    // components, treat as all-day.
    //
    // expo-calendar exposes `dueDateComponents` since v12; we
    // gracefully fall through on older runtimes.
    const dueComponents = (r as unknown as {
      dueDateComponents?: { hour?: number; minute?: number; second?: number }
    }).dueDateComponents
    const hasTimeComponent =
      typeof dueComponents?.hour === 'number' ||
      typeof dueComponents?.minute === 'number'
    const dueDateObj = due instanceof Date ? due : new Date(due)
    const looksLikeAllDay =
      dueDateObj.getHours() === 0 &&
      dueDateObj.getMinutes() === 0 &&
      dueDateObj.getSeconds() === 0
    const isAllDay = hasTimeComponent ? false : looksLikeAllDay

    // Timed reminders get a 30-min visual duration so they show as a
    // proper hour-aligned block in the day/week timelines, not a
    // zero-height sliver. All-day reminders keep the orange pill UI.
    const startIso = dueIso
    const endIso = isAllDay
      ? dueIso
      : new Date(dueDateObj.getTime() + 30 * 60_000).toISOString()

    events.push({
      id: `reminder:${r.id}`,
      title: r.title ?? '(No title)',
      startDate: startIso,
      endDate: endIso,
      allDay: isAllDay,
      location: r.location ?? undefined,
      notes: r.notes ?? undefined,
      calendarId: r.calendarId ?? '',
      source,
      origin: 'reminder',
      alarms: [],
      completed: !!r.completed,
    })
  }
  events.sort((a, b) => a.startDate.localeCompare(b.startDate))
  return events
}

// ── Platform guard ────────────────────────────────────────────────────────

export function isPlatformSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android'
}
