/**
 * SCRUM-269 Phase B — React hook that owns the device-calendar feed.
 *
 * Responsibilities:
 *  - On mount: hydrate from the AsyncStorage cache so UI renders fast.
 *  - Check permission status; if granted, kick a fresh fetch.
 *  - Register the hourly background sync task once.
 *  - Re-sync on app foreground (covers iOS not waking the task often).
 *  - Expose `requestPermission` for the in-app permission prompt.
 */

import { useCallback, useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  fetchDeviceEvents,
  getCachedDeviceEvents,
  getLastSyncedAt,
  getPermissionStatus,
  requestPermission as askForPermission,
  type DeviceEvent,
} from '@/services/device-calendar'
import { registerHourlySync } from '@/services/device-calendar-sync'

export interface UseDeviceCalendarResult {
  events: DeviceEvent[]
  loading: boolean
  /** True after the OS has at least been asked once. */
  prompted: boolean
  /** True when the user granted access. */
  granted: boolean
  lastSyncedAt: string | null
  refresh: () => Promise<void>
  requestPermission: () => Promise<boolean>
}

export function useDeviceCalendar(): UseDeviceCalendarResult {
  const [events, setEvents] = useState<DeviceEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [granted, setGranted] = useState(false)
  const [prompted, setPrompted] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const syncNow = useCallback(async () => {
    const status = await getPermissionStatus()
    setGranted(status.granted)
    setPrompted(status.prompted)
    if (!status.granted) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const fresh = await fetchDeviceEvents()
      setEvents(fresh)
      setLastSyncedAt(await getLastSyncedAt())
    } catch {
      // Swallow — UI stays on whatever we last had.
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial mount: hydrate from cache, then run a live sync.
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const cached = await getCachedDeviceEvents()
      if (cancelled) return
      if (cached.length > 0) setEvents(cached)
      setLastSyncedAt(await getLastSyncedAt())
      await syncNow()
      // Register the background sync task once. Cheap to call repeatedly
      // — OS treats it as idempotent.
      try {
        await registerHourlySync()
      } catch {
        // Permission may be Denied/Restricted; ignore.
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [syncNow])

  // Re-sync on foreground so users opening the app see fresh data even
  // if iOS hasn't been firing the background task as requested.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void syncNow()
    })
    return () => sub.remove()
  }, [syncNow])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const status = await askForPermission()
    setGranted(status.granted)
    setPrompted(status.prompted)
    if (status.granted) {
      await syncNow()
    }
    return status.granted
  }, [syncNow])

  return { events, loading, prompted, granted, lastSyncedAt, refresh: syncNow, requestPermission }
}
