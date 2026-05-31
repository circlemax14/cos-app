/**
 * Core React state hook for the calendar screen. Owns:
 *   - the merged event list (device + our app's virtual events)
 *   - the source-calendar list (so the UI can render the colored legend
 *     and the calendar-picker in the event editor)
 *   - the loading / refreshing flags
 *   - one-shot create / update / delete actions that invalidate the cache
 *
 * Usage:
 *   const { events, calendars, isLoading, refresh, create, update, remove }
 *     = useCalendar({ appEvents })
 *
 * `appEvents` is whatever your screen wants to overlay (past visits,
 * appointments, etc.) — already passed through
 * `virtualEventFromAppEntity`. Empty array is fine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createEvent,
  deleteEvent,
  listCalendars,
  mergeEvents,
  readEvents,
  updateEvent,
  type CalendarEvent,
  type CalendarSource,
  type CreateEventInput,
  type UpdateEventInput,
} from '@/services/calendar'

export interface UseCalendarArgs {
  /** App-side virtual events (past visits, appointments, tasks). */
  appEvents?: CalendarEvent[]
  /** If set, only these calendar IDs are queried. Defaults to all. */
  enabledCalendarIds?: string[]
  /** Custom time window. */
  windowStart?: Date
  windowEnd?: Date
}

export interface UseCalendar {
  events: CalendarEvent[]
  calendars: CalendarSource[]
  isLoading: boolean
  isRefreshing: boolean
  refresh: () => Promise<void>
  create: (input: CreateEventInput) => Promise<string | null>
  update: (input: UpdateEventInput) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
}

export function useCalendar(args: UseCalendarArgs = {}): UseCalendar {
  const { appEvents = [], enabledCalendarIds, windowStart, windowEnd } = args
  const [deviceEvents, setDeviceEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<CalendarSource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchAll = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setIsLoading(true)
    else setIsRefreshing(true)
    try {
      const [evt, cals] = await Promise.all([
        readEvents({ windowStart, windowEnd, calendarIds: enabledCalendarIds }),
        listCalendars(),
      ])
      setDeviceEvents(evt)
      setCalendars(cals)
    } finally {
      if (showSpinner) setIsLoading(false)
      else setIsRefreshing(false)
    }
  }, [enabledCalendarIds, windowStart, windowEnd])

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

  const events = useMemo(
    () => mergeEvents(deviceEvents, appEvents),
    [deviceEvents, appEvents],
  )

  return {
    events,
    calendars,
    isLoading,
    isRefreshing,
    refresh,
    create,
    update,
    remove,
  }
}
