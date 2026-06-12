/**
 * Core React state hook for the calendar screen. Owns:
 *   - merged event list (device calendar events + iOS Reminders + our
 *     app's virtual events)
 *   - the source-calendar list (so the UI can render the colored legend
 *     and the calendar-picker in the event editor)
 *   - loading / refreshing flags
 *   - create / update / delete actions that invalidate the cache
 *   - per-calendar visibility filter (driven by user settings)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createEvent,
  deleteEvent,
  listCalendars,
  mergeEvents,
  readEvents,
  readReminders,
  updateEvent,
  type CalendarEvent,
  type CalendarSource,
  type CreateEventInput,
  type UpdateEventInput,
} from '@/services/calendar'
import {
  listMyCalendarSnapshot,
  listServerCalendarEvents,
  type ServerCalendarEvent,
  type SnapshotRow,
} from '@/services/api/calendar'
import { reconcileDeviceMirror } from '@/services/calendar-mirror'
import { checkSession } from '@/services/auth'

export interface UseCalendarArgs {
  appEvents?: CalendarEvent[]
  enabledCalendarIds?: string[]
  windowStart?: Date
  windowEnd?: Date
  includeReminders?: boolean
}

export interface UseCalendar {
  events: CalendarEvent[]
  calendars: CalendarSource[]
  hiddenCalendarIds: Set<string>
  notificationDisabledCalendarIds: Set<string>
  isLoading: boolean
  isRefreshing: boolean
  refresh: () => Promise<void>
  create: (input: CreateEventInput) => Promise<string | null>
  update: (input: UpdateEventInput) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  toggleCalendarVisibility: (calendarId: string) => Promise<void>
  toggleCalendarNotifications: (calendarId: string) => Promise<void>
}

const HIDDEN_CALS_KEY = 'csh-calendar-hidden-cals-v1'
const NOTIF_OFF_CALS_KEY = 'csh-calendar-notif-off-cals-v1'

export function useCalendar(args: UseCalendarArgs = {}): UseCalendar {
  const { appEvents = [], enabledCalendarIds, windowStart, windowEnd, includeReminders = true } = args
  const [deviceEvents, setDeviceEvents] = useState<CalendarEvent[]>([])
  const [reminders, setReminders] = useState<CalendarEvent[]>([])
  // Server-stored events (created in mobile new-event flow OR added by
  // a care manager from the admin dashboard). Fetched from cos-backend.
  //
  // SCRUM-279 (2026-06-08): health-plan tasks intentionally REMOVED from
  // the calendar feed at Ken's request — appointments + reminders only
  // here; tasks live in the existing health-plan UI to avoid
  // duplication / noise.
  const [serverEvents, setServerEvents] = useState<CalendarEvent[]>([])
  // Cross-device snapshot events — pulled from cos-backend so events
  // captured on one device (e.g. iPhone reminders) show up on another
  // (e.g. iPad without local reminders).
  const [snapshotEvents, setSnapshotEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<CalendarSource[]>([])
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(new Set())
  const [notificationDisabledCalendarIds, setNotificationDisabledCalendarIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Restore persisted visibility + notification prefs on mount
  useEffect(() => {
    void (async () => {
      try {
        const [hidden, notifOff] = await Promise.all([
          AsyncStorage.getItem(HIDDEN_CALS_KEY),
          AsyncStorage.getItem(NOTIF_OFF_CALS_KEY),
        ])
        if (hidden) setHiddenCalendarIds(new Set(JSON.parse(hidden) as string[]))
        if (notifOff) setNotificationDisabledCalendarIds(new Set(JSON.parse(notifOff) as string[]))
      } catch { /* ignore */ }
    })()
  }, [])

  const fetchAll = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setIsLoading(true)
    else setIsRefreshing(true)
    try {
      const fromIso = (windowStart ?? new Date(Date.now() - 30 * 24 * 60 * 60_000)).toISOString().slice(0, 10)
      const toIso = (windowEnd ?? new Date(Date.now() + 365 * 24 * 60 * 60_000)).toISOString().slice(0, 10)
      // Snapshot window is on CAPTURED-AT (when the sibling device
      // uploaded), not on event startDate. SCRUM-279 (build 46): Ken's
      // ask "always maintain sync between different devices" requires
      // a wider window — the previous 7-day capturedAt window meant
      // an iPad freshly installed couldn't see iPhone events captured
      // more than a week ago. Widened to 30 days back, since the
      // upload itself runs every 15 min so 30 days of capturedAt
      // gives plenty of overlap for normal use.
      const snapFromIso = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10)
      const snapToIso = new Date(Date.now() + 1 * 24 * 60 * 60_000).toISOString().slice(0, 10)
      const [evt, cals, rems, srv, snap] = await Promise.all([
        readEvents({ windowStart, windowEnd, calendarIds: enabledCalendarIds }),
        listCalendars(),
        includeReminders ? readReminders({ windowStart, windowEnd }) : Promise.resolve([] as CalendarEvent[]),
        // Server events + snapshot are best-effort: a backend outage
        // shouldn't blank the calendar.
        listServerCalendarEvents({ from: fromIso, to: toIso })
          .then((s) => s.map(serverEventToCalendarEvent))
          .catch(() => [] as CalendarEvent[]),
        listMyCalendarSnapshot({ from: snapFromIso, to: snapToIso })
          .catch(() => [] as SnapshotRow[]),
      ])
      setDeviceEvents(evt)
      setCalendars(cals)
      setReminders(rems)
      setServerEvents(srv)
      // SCRUM-279 (build 45): prune stale hidden-calendar IDs. Ken
      // reported reminders + Zoom-call events missing from the
      // calendar after upgrading. A common cause is a hidden-set entry
      // that survived an iOS account change / calendar rename — the
      // old id is in hiddenCalendarIds but no longer maps to a real
      // calendar, so it silently hides whatever the new id is. Drop
      // ids that no longer correspond to a live calendar OR reminder.
      const liveCalendarIds = new Set<string>()
      for (const c of cals) liveCalendarIds.add(c.id)
      for (const r of rems) liveCalendarIds.add(r.calendarId)
      setHiddenCalendarIds((prev) => {
        if (prev.size === 0) return prev
        let changed = false
        const next = new Set<string>()
        for (const id of prev) {
          if (liveCalendarIds.has(id)) next.add(id)
          else changed = true
        }
        if (!changed) return prev
        AsyncStorage.setItem(HIDDEN_CALS_KEY, JSON.stringify([...next])).catch(() => {})
        return next
      })
      // Convert snapshot rows → CalendarEvent shape, filtering out any
      // row that's already in the local device set (sourceEventId
      // match) so we don't double-count what's locally available.
      const localIds = new Set([...evt, ...rems].map((e) => e.id))
      // Dedup snapshot rows by sourceEventId, keeping the LATEST
      // capturedAt. The backend GET returns every row in the window
      // (one per upload — id = sourceEventId#capturedAt), so without
      // this dedup iPad showed each reminder 4-5 times after iPhone
      // bg-uploaded for 4-5 cycles.
      const latestBySourceId = new Map<string, SnapshotRow>()
      for (const r of snap) {
        const existing = latestBySourceId.get(r.sourceEventId)
        if (!existing || r.capturedAt > existing.capturedAt) {
          latestBySourceId.set(r.sourceEventId, r)
        }
      }
      const snapEvents: CalendarEvent[] = Array.from(latestBySourceId.values())
        .filter((r) => !localIds.has(r.sourceEventId))
        .map(snapshotRowToCalendarEvent)
      setSnapshotEvents(snapEvents)
      // Mirror care-manager-created (visibility='device_sync') events
      // to the user's device calendar so they sync to iCloud / Google.
      // Best-effort, non-blocking: we already returned the merged list
      // to the UI; mirroring runs in the background. Need the original
      // ServerCalendarEvent[] (with visibility flags), so refetch the
      // wire shape here — cheap because the backend round-trip was
      // just done in the Promise.all above. (We could thread it
      // through but that's brittle.)
      void (async () => {
        try {
          const session = await checkSession()
          if (!session.authenticated || !session.user?.sub) return
          const fresh = await listServerCalendarEvents({ from: fromIso, to: toIso })
          await reconcileDeviceMirror(session.user.sub, fresh)
        } catch { /* non-fatal */ }
      })()
    } finally {
      if (showSpinner) setIsLoading(false)
      else setIsRefreshing(false)
    }
  }, [enabledCalendarIds, windowStart, windowEnd, includeReminders])

  useEffect(() => { void fetchAll(true) }, [fetchAll])

  const refresh = useCallback(async () => {
    await fetchAll(false)
  }, [fetchAll])

  const create = useCallback(async (input: CreateEventInput): Promise<string | null> => {
    const id = await createEvent(input)
    if (id) await fetchAll(false)
    return id
  }, [fetchAll])

  const update = useCallback(async (input: UpdateEventInput): Promise<boolean> => {
    const ok = await updateEvent(input)
    if (ok) await fetchAll(false)
    return ok
  }, [fetchAll])

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const ok = await deleteEvent(id)
    if (ok) await fetchAll(false)
    return ok
  }, [fetchAll])

  const toggleCalendarVisibility = useCallback(async (calendarId: string) => {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev)
      if (next.has(calendarId)) next.delete(calendarId)
      else next.add(calendarId)
      AsyncStorage.setItem(HIDDEN_CALS_KEY, JSON.stringify([...next])).catch(() => {})
      return next
    })
  }, [])

  const toggleCalendarNotifications = useCallback(async (calendarId: string) => {
    setNotificationDisabledCalendarIds((prev) => {
      const next = new Set(prev)
      if (next.has(calendarId)) next.delete(calendarId)
      else next.add(calendarId)
      AsyncStorage.setItem(NOTIF_OFF_CALS_KEY, JSON.stringify([...next])).catch(() => {})
      return next
    })
  }, [])

  // Merge order: device → reminders → app-injected → server-stored →
  // health-plan tasks. mergeEvents dedups by id so a server event with
  // the same id as a device event is kept once. Hidden-calendar filter
  // applies last so the user's toggles still hide everything.
  const events = useMemo(() => {
    let all = mergeEvents(deviceEvents, reminders)
    all = mergeEvents(all, appEvents)
    all = mergeEvents(all, serverEvents)
    all = mergeEvents(all, snapshotEvents)
    if (hiddenCalendarIds.size === 0) return all
    return all.filter((e) => !hiddenCalendarIds.has(e.source.id))
  }, [deviceEvents, reminders, appEvents, serverEvents, snapshotEvents, hiddenCalendarIds])

  return {
    events,
    calendars,
    hiddenCalendarIds,
    notificationDisabledCalendarIds,
    isLoading,
    isRefreshing,
    refresh,
    create,
    update,
    remove,
    toggleCalendarVisibility,
    toggleCalendarNotifications,
  }
}

/**
 * Map a server-side CalendarEvent (cos-backend wire shape) into our
 * UI's CalendarEvent shape. Server events live as `app`-origin so the
 * UI can render them with a distinct badge and route taps to the
 * appropriate detail screen. Health-plan tasks come through here too
 * and get appKind='task' for the badge.
 */
/**
 * Map a SnapshotRow (cross-device device-calendar entry pulled from the
 * backend) to our UI's CalendarEvent shape. These render with a hint
 * that they came from a sibling device — the source title preserves
 * the original calendar (e.g. "Reminders (iCloud)") so the user
 * recognizes them.
 */
function snapshotRowToCalendarEvent(r: SnapshotRow): CalendarEvent {
  return {
    id: `snapshot:${r.sourceEventId}`,
    title: r.title || '(Untitled)',
    startDate: r.startDate,
    endDate: r.endDate,
    allDay: r.allDay,
    location: r.location,
    notes: r.notes,
    calendarId: 'csh-snapshot',
    source: {
      id: 'csh-snapshot',
      title: `${r.sourceCalendarName} (other device)`,
      source: r.sourceCalendarSource,
      color: r.sourceCalendarColor || '#FF9500',
      allowsWrite: false,
    },
    origin: r.origin,
    alarms: r.alarms,
    completed: r.completed,
  }
}

function serverEventToCalendarEvent(s: ServerCalendarEvent): CalendarEvent {
  const isHealthPlan = s.id.startsWith('healthplan:')
  const isCareManager = s.author === 'care_manager'
  // Color hint: health-plan tasks get a calm teal; care-manager-
  // created events get our primary tint; patient-created events get
  // neutral gray so they don't visually shout.
  const color = isHealthPlan ? '#34C759' : isCareManager ? '#007AFF' : '#8E8E93'
  return {
    id: `app:${s.id}`,
    title: s.title,
    startDate: s.startDate,
    endDate: s.endDate,
    allDay: s.allDay,
    location: s.location,
    notes: s.notes,
    calendarId: 'csh-server',
    source: {
      id: isHealthPlan ? 'csh-health-plan' : 'csh-server',
      title: isHealthPlan ? 'Health Plan' : isCareManager ? 'Care Team' : 'Circle Support Health',
      source: 'Circle Support Health',
      color,
      allowsWrite: !isHealthPlan,
    },
    origin: 'app',
    // SCRUM-279 (2026-06-08 build 38): server-stored events were
    // labeled appKind='appointment', which sent them to the FHIR-only
    // /Home/appointment-detail screen where they're not found. Leave
    // appKind undefined for non-task server events so openDetail
    // routes them to the unified /calendar-event-detail popover
    // (which DOES know how to look them up via listServerCalendarEvents).
    appKind: isHealthPlan ? 'task' : undefined,
    alarms: s.alarms,
  }
}
