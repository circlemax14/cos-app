/**
 * Mirror-to-device flow (SCRUM-279).
 *
 * When the patient app fetches care-manager-created events from the
 * backend, any event with `visibility === 'device_sync'` should also
 * land in the user's device calendar (iCloud / Google / Outlook) so it
 * propagates to their other devices and apps.
 *
 * Idempotency: we keep a per-server-id record in AsyncStorage of "this
 * server event has been mirrored as device event Y". If the server
 * event mutates (e.g. care manager re-times it), we update the
 * existing device event instead of creating a new one.
 *
 * Cleanup: if a server event is removed, we delete its device twin on
 * the next sync. (Soft-deleted server events are filtered out of the
 * list so they show up here as "no longer in the set".)
 *
 * All native calendar calls are guarded — a failure for one event
 * never kills the whole sync.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createEvent,
  deleteEvent as deviceDeleteEvent,
  listCalendars,
  updateEvent,
  type CalendarSource,
} from './calendar'
import type { ServerCalendarEvent } from './api/calendar'

const MIRROR_MAP_KEY = 'csh-calendar-mirror-map-v1'

interface MirrorEntry {
  serverId: string
  deviceEventId: string
  /** Hash of the server event content so we can detect drift. */
  contentHash: string
  mirroredAt: string
}

type MirrorMap = Record<string, MirrorEntry>

async function readMap(): Promise<MirrorMap> {
  try {
    const raw = await AsyncStorage.getItem(MIRROR_MAP_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as MirrorMap
  } catch {
    return {}
  }
}

async function writeMap(m: MirrorMap): Promise<void> {
  try {
    await AsyncStorage.setItem(MIRROR_MAP_KEY, JSON.stringify(m))
  } catch { /* non-fatal */ }
}

function hashServerEvent(e: ServerCalendarEvent): string {
  // Same trivial JS hash as the snapshot upload — stable across
  // (title, start, end, location, allDay) and recomputes cheaply.
  const s = `${e.title}|${e.startDate}|${e.endDate}|${e.location ?? ''}|${e.allDay}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16)
}

/**
 * Pick a writable device calendar to host the mirrored event. Prefer
 * iCloud if available, else any writable calendar. Returns null if
 * none are writable (in which case mirroring is silently disabled).
 */
async function pickTargetCalendar(): Promise<CalendarSource | null> {
  try {
    const cals = await listCalendars()
    const writable = cals.filter((c) => c.allowsWrite)
    if (writable.length === 0) return null
    const iCloud = writable.find((c) => /icloud/i.test(c.source))
    return iCloud ?? writable[0]
  } catch {
    return null
  }
}

/**
 * Reconcile the device calendar against the current set of
 * `device_sync` server events:
 *   - New server events (not in the map yet) → create a device event
 *     and record the pairing.
 *   - Server events whose content hash has drifted → update the
 *     existing device event in place.
 *   - Map entries with no matching server event → delete the device
 *     event and drop the map entry.
 *
 * Called from the foreground sync (use-calendar refresh) and from the
 * background fetch task. Idempotent — safe to call repeatedly.
 */
export async function reconcileDeviceMirror(serverEvents: ServerCalendarEvent[]): Promise<void> {
  const map = await readMap()
  const targetCal = await pickTargetCalendar()
  if (!targetCal) return // no writable calendar to mirror into

  // Index server events that should be mirrored (visibility = device_sync).
  const target = serverEvents.filter((e) => e.visibility === 'device_sync' && !e.deletedAt)
  const targetById = new Map(target.map((e) => [e.id, e]))

  // 1. Creates + updates
  for (const ev of target) {
    const hash = hashServerEvent(ev)
    const existing = map[ev.id]

    if (!existing) {
      // First time seeing this — create on device.
      try {
        const newDeviceId = await createEvent({
          title: ev.title,
          startDate: new Date(ev.startDate),
          endDate: new Date(ev.endDate),
          allDay: ev.allDay,
          location: ev.location,
          notes: ev.notes
            ? `${ev.notes}\n\n— from your Circle Support Health care team`
            : 'from your Circle Support Health care team',
          calendarId: targetCal.id,
          alarms: ev.alarms,
        })
        if (newDeviceId) {
          map[ev.id] = {
            serverId: ev.id,
            deviceEventId: newDeviceId,
            contentHash: hash,
            mirroredAt: new Date().toISOString(),
          }
        }
      } catch { /* skip this one, continue with others */ }
    } else if (existing.contentHash !== hash) {
      // Drift — update the device event in place.
      try {
        await updateEvent({
          id: existing.deviceEventId,
          title: ev.title,
          startDate: new Date(ev.startDate),
          endDate: new Date(ev.endDate),
          allDay: ev.allDay,
          location: ev.location,
          notes: ev.notes,
          alarms: ev.alarms,
        })
        map[ev.id].contentHash = hash
        map[ev.id].mirroredAt = new Date().toISOString()
      } catch { /* skip */ }
    }
  }

  // 2. Deletes — map entries with no matching server event.
  for (const serverId of Object.keys(map)) {
    if (!targetById.has(serverId)) {
      try { await deviceDeleteEvent(map[serverId].deviceEventId) } catch { /* skip */ }
      delete map[serverId]
    }
  }

  await writeMap(map)
}
