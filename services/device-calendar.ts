/**
 * SCRUM-269 Phase B — device calendar bridge.
 *
 * Reads events from the user's device calendars (Apple Calendar, Google,
 * Outlook, work calendars, etc.) so personal appointments can render
 * alongside our medical appointments in one feed.
 *
 * Privacy stance:
 *  - Event titles + notes never leave the device. The cos-backend has
 *    no endpoint that accepts device-event payloads and we don't log
 *    them client-side either.
 *  - The user can revoke calendar permission at any time via OS settings;
 *    `requestPermission` re-prompts if needed but won't bypass a hard deny.
 *  - Read-only — `expo-calendar` allows writes too, but Phase B v1 does
 *    not create or modify any events. The medical reminder system stays
 *    inside the app's existing push-notification flow.
 */

import * as Calendar from 'expo-calendar'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface DeviceEvent {
  /** Stable id from the OS, used as the React key. */
  id: string
  /** Event title as the user wrote it. Stays on device. */
  title: string
  /** ISO start. */
  startDate: string
  /** ISO end. */
  endDate: string
  /** Whether the event is marked as an all-day event by the calendar. */
  allDay: boolean
  /** Optional location string. */
  location?: string
  /** Source calendar metadata so we can render a "from Apple Calendar" badge. */
  source: {
    /** OS calendar id. */
    id: string
    /** Human-readable calendar name ("Personal", "Work", etc.). */
    title: string
    /** App/account name as the OS reports it (e.g. "iCloud", "Google", "Outlook"). */
    source: string
    /** Color hint provided by the calendar. */
    color?: string
  }
}

const SYNC_TIMESTAMP_KEY = 'device-calendar-last-sync'
const SYNC_CACHE_KEY = 'device-calendar-cached-events'

export interface DeviceCalendarStatus {
  granted: boolean
  /**
   * True when the user has been asked at least once. On iOS the OS only
   * shows the permission dialog the first time; after that we have to
   * bounce the user to Settings.
   */
  prompted: boolean
}

/**
 * SCRUM-269 Phase B hotfix (2026-05-29): wrap every native-bridge call
 * in try/catch. The 1.4.0 build 10 binary that shipped to TestFlight
 * was missing `NSCalendarsFullAccessUsageDescription` in Info.plist —
 * the iOS-17+ replacement for `NSCalendarsUsageDescription`. On iOS 17+
 * devices the expo-calendar native module throws
 * `ExpoCalendar.MissingCalendarPListValueException` from
 * `getCalendarPermissionsAsync`, which RN promotes to a fatal crash.
 *
 * The next binary cut adds the missing key. Until then, this OTA-able
 * defense ensures the app *never* crashes from a calendar call — the
 * worst case is the personal-events feed shows nothing.
 */
export async function getPermissionStatus(): Promise<DeviceCalendarStatus> {
  try {
    const status = await Calendar.getCalendarPermissionsAsync()
    return {
      granted: status.status === 'granted',
      prompted: status.status !== 'undetermined',
    }
  } catch {
    return { granted: false, prompted: false }
  }
}

export async function requestPermission(): Promise<DeviceCalendarStatus> {
  try {
    const status = await Calendar.requestCalendarPermissionsAsync()
    return {
      granted: status.status === 'granted',
      prompted: status.status !== 'undetermined',
    }
  } catch {
    return { granted: false, prompted: false }
  }
}

/**
 * Fetch events from all OS calendars within the given window. Defaults
 * to a 90-days-back-to-365-days-forward range, matching how we surface
 * past + future medical visits today.
 */
export async function fetchDeviceEvents(opts?: {
  windowDaysBack?: number
  windowDaysForward?: number
}): Promise<DeviceEvent[]> {
  const status = await getPermissionStatus()
  if (!status.granted) return []

  const back = opts?.windowDaysBack ?? 90
  const forward = opts?.windowDaysForward ?? 365
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - back)
  startDate.setHours(0, 0, 0, 0)
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + forward)
  endDate.setHours(23, 59, 59, 999)

  // Read all calendars the OS will let us see. Filtering per-calendar is
  // a Phase C settings concern. Defense-in-depth (see header) — any
  // throw from the native bridge degrades gracefully to an empty feed.
  let calendars: Calendar.Calendar[]
  try {
    calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
  } catch {
    return []
  }
  if (calendars.length === 0) return []

  let events: Calendar.Event[]
  try {
    events = await Calendar.getEventsAsync(
      calendars.map((c) => c.id),
      startDate,
      endDate,
    )
  } catch {
    return []
  }

  const calendarById = new Map(calendars.map((c) => [c.id, c]))
  const mapped: DeviceEvent[] = events.map((event) => {
    const calendar = calendarById.get(event.calendarId)
    return {
      id: event.id,
      title: event.title ?? '(No title)',
      startDate: typeof event.startDate === 'string' ? event.startDate : new Date(event.startDate).toISOString(),
      endDate: typeof event.endDate === 'string' ? event.endDate : new Date(event.endDate).toISOString(),
      allDay: !!event.allDay,
      location: event.location ?? undefined,
      source: {
        id: calendar?.id ?? event.calendarId,
        title: calendar?.title ?? 'Calendar',
        source: calendar?.source?.name ?? 'Device',
        color: calendar?.color,
      },
    }
  })

  // Cache the latest fetch so the UI can show *something* immediately
  // while the next sync runs. Titles stay on device — AsyncStorage is
  // app-private sandboxed storage.
  try {
    await AsyncStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(mapped))
    await AsyncStorage.setItem(SYNC_TIMESTAMP_KEY, new Date().toISOString())
  } catch {
    // Cache failure is non-fatal; next fetch will rebuild.
  }

  return mapped
}

/** Last-known cached set of events from the most recent sync. */
export async function getCachedDeviceEvents(): Promise<DeviceEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_CACHE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as DeviceEvent[]
  } catch {
    return []
  }
}

/** ISO timestamp of the most recent successful sync, or null. */
export async function getLastSyncedAt(): Promise<string | null> {
  return AsyncStorage.getItem(SYNC_TIMESTAMP_KEY)
}
