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
      const [evt, cals, rems] = await Promise.all([
        readEvents({ windowStart, windowEnd, calendarIds: enabledCalendarIds }),
        listCalendars(),
        includeReminders ? readReminders({ windowStart, windowEnd }) : Promise.resolve([] as CalendarEvent[]),
      ])
      setDeviceEvents(evt)
      setCalendars(cals)
      setReminders(rems)
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

  // Merge + filter by hidden-calendar set so the user's toggle preferences
  // are respected without re-fetching from the OS.
  const events = useMemo(() => {
    const all = mergeEvents(mergeEvents(deviceEvents, reminders), appEvents)
    if (hiddenCalendarIds.size === 0) return all
    return all.filter((e) => !hiddenCalendarIds.has(e.source.id))
  }, [deviceEvents, reminders, appEvents, hiddenCalendarIds])

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
