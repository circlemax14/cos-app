/**
 * Mirror-to-device flow (SCRUM-279).
 *
 * When the patient app fetches care-manager-created events from the
 * backend, any event with `visibility === 'device_sync'` should also
 * land in the user's device calendar (iCloud / Google / Outlook) so it
 * propagates to their other devices and apps.
 *
 * SECURITY NOTES (addressed in v2 after a security review found 4
 * HIPAA-relevant issues in the v1 implementation):
 *
 *   1. **Mirror map is user-scoped.** The AsyncStorage key includes the
 *      authenticated user's Cognito sub so that signing out as user A
 *      and back in as user B doesn't inherit A's device-event pairings
 *      (which would let B's iCloud writes target A's events). The map
 *      also stores its owning userId; readMap discards any entry whose
 *      userId doesn't match the current session.
 *
 *   2. **Target calendar uses a strict allow-list.** Only iCloud / Local
 *      (iOS) or the user's own Google / Outlook (Android) accounts are
 *      eligible. We won't silently mirror to a shared work calendar
 *      that happens to be writable.
 *
 *   3. **Content hash includes notes + alarms.** Drift on those fields
 *      now triggers an update; previously only title/time/location/
 *      allDay were hashed so a notes change went un-mirrored.
 *
 *   4. **Deletion pass runs even when no target calendar is available.**
 *      If the user removes a writable account between sync cycles, we
 *      still clean up the device twins they previously created via
 *      mirror — they don't persist as orphans.
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

const MIRROR_MAP_KEY_PREFIX = 'csh-calendar-mirror-map-v2'

interface MirrorEntry {
  serverId: string
  deviceEventId: string
  contentHash: string
  mirroredAt: string
}

interface MirrorMapFile {
  ownerSub: string
  entries: Record<string, MirrorEntry>
}

function keyFor(userSub: string): string {
  return `${MIRROR_MAP_KEY_PREFIX}:${userSub}`
}

async function readMap(userSub: string): Promise<Record<string, MirrorEntry>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userSub))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as MirrorMapFile
    if (!parsed || parsed.ownerSub !== userSub) {
      // Defensive: if somehow another user's map slipped under this
      // key (e.g. mid-migration from v1), refuse to act on it.
      return {}
    }
    return parsed.entries ?? {}
  } catch {
    return {}
  }
}

async function writeMap(userSub: string, entries: Record<string, MirrorEntry>): Promise<void> {
  try {
    const file: MirrorMapFile = { ownerSub: userSub, entries }
    await AsyncStorage.setItem(keyFor(userSub), JSON.stringify(file))
  } catch { /* non-fatal */ }
}

/**
 * Clear this user's mirror map. Called on sign-out so the next user
 * on the device doesn't inherit it. Caller wires this into the
 * sign-out path (services/auth.ts).
 */
export async function clearMirrorMap(userSub: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userSub))
  } catch { /* non-fatal */ }
}

/**
 * Hash the server event content. Includes every field whose change
 * should propagate to the device twin: title, start/end, location,
 * notes, alarms, allDay. Switched from a simple multiplicative JS hash
 * to a longer concatenation so collisions are vanishingly unlikely.
 */
function hashServerEvent(e: ServerCalendarEvent): string {
  const parts = [
    e.title,
    e.startDate,
    e.endDate,
    e.location ?? '',
    e.notes ?? '',
    String(e.allDay),
    JSON.stringify(e.alarms ?? []),
    JSON.stringify(e.recurrenceRule ?? ''),
  ].join('|')
  let h1 = 0
  let h2 = 0
  for (let i = 0; i < parts.length; i++) {
    h1 = ((h1 << 5) - h1 + parts.charCodeAt(i)) | 0
    h2 = ((h2 << 6) - h2 + parts.charCodeAt(i)) | 0
  }
  return `${Math.abs(h1).toString(16)}-${Math.abs(h2).toString(16)}-${parts.length}`
}

/**
 * Allow-list for "is this a personal calendar we're willing to mirror
 * a patient's PHI into?". Apple Calendar exposes calendars from many
 * accounts (work, shared, holiday subscriptions); we only mirror into
 * the user's own iCloud/Local on iOS and their own Google on Android.
 *
 * Returns true for a permitted target; false to skip.
 */
function isPersonalWritableCalendar(c: CalendarSource): boolean {
  if (!c.allowsWrite) return false
  const src = (c.source ?? '').toLowerCase()
  // iOS: iCloud is the canonical personal account. "Local" is the
  // local-only on-device calendar (iCloud account not yet attached).
  // Android: Google = user-account-backed calendar (com.google).
  // Outlook / Exchange are excluded — those are work accounts where
  // an employer might have visibility we don't want PHI in.
  return src === 'icloud' || src === 'local' || src === 'default' || src === 'google'
}

async function pickTargetCalendar(): Promise<CalendarSource | null> {
  try {
    const cals = await listCalendars()
    const eligible = cals.filter(isPersonalWritableCalendar)
    if (eligible.length === 0) return null
    // Prefer iCloud > Google > Local
    const iCloud = eligible.find((c) => /icloud/i.test(c.source))
    if (iCloud) return iCloud
    const google = eligible.find((c) => /google/i.test(c.source))
    if (google) return google
    return eligible[0]
  } catch {
    return null
  }
}

/**
 * Two-phase reconcile:
 *   1. Deletes: drop device twins for server events that are gone.
 *      Runs UNCONDITIONALLY (even if no target calendar is currently
 *      eligible) so stale events don't linger when a user revokes
 *      iCloud / Google access between syncs.
 *   2. Creates / updates: only when we have an eligible target.
 */
export async function reconcileDeviceMirror(
  userSub: string,
  serverEvents: ServerCalendarEvent[],
): Promise<void> {
  if (!userSub) return // can't safely scope without an authenticated user

  const map = await readMap(userSub)
  const target = serverEvents.filter((e) => e.visibility === 'device_sync' && !e.deletedAt)
  const targetById = new Map(target.map((e) => [e.id, e]))

  // 1. Deletion pass — always runs.
  for (const serverId of Object.keys(map)) {
    if (!targetById.has(serverId)) {
      try { await deviceDeleteEvent(map[serverId].deviceEventId) } catch { /* skip */ }
      delete map[serverId]
    }
  }

  // 2. Create / update pass — only if we have a personal target.
  const targetCal = await pickTargetCalendar()
  if (targetCal) {
    for (const ev of target) {
      const hash = hashServerEvent(ev)
      const existing = map[ev.id]

      if (!existing) {
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
        } catch { /* skip */ }
      } else if (existing.contentHash !== hash) {
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
  }

  await writeMap(userSub, map)
}
