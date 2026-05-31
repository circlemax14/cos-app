/**
 * Tracks calendar permission state + exposes a request/open-settings flow
 * for the UI. Designed so the calendar screen can:
 *
 *   const { state, request, openSettings } = useCalendarPermissions()
 *
 *   if (!state.granted && !state.prompted) <RequestButton onPress={request} />
 *   if (!state.granted && state.prompted)  <SettingsButton onPress={openSettings} />
 *   if (state.granted)                     <Calendar />
 *
 * iOS only shows the system permission dialog ONCE per install. Once the
 * user denies, future `requestPermission()` calls just resolve to the
 * cached denial without re-prompting — so we deep-link to Settings via
 * `Linking.openSettings()` once `prompted=true`.
 */

import { useCallback, useEffect, useState } from 'react'
import { Linking } from 'react-native'
import {
  getPermissionStatus,
  requestPermission,
  type PermissionState,
} from '@/services/calendar'

export interface UseCalendarPermissions {
  state: PermissionState
  /** Re-read the OS state. Cheap; safe to call from focus listeners. */
  refresh: () => Promise<void>
  /** Trigger OS prompt (first time) or no-op return cached state. */
  request: () => Promise<void>
  /** Deep-link to iOS Settings so user can grant manually. */
  openSettings: () => void
  isLoading: boolean
}

export function useCalendarPermissions(): UseCalendarPermissions {
  const [state, setState] = useState<PermissionState>({
    granted: false,
    prompted: false,
    canWrite: false,
  })
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    const next = await getPermissionStatus()
    setState(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = await getPermissionStatus()
      if (!cancelled) {
        setState(next)
        setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const request = useCallback(async () => {
    const next = await requestPermission()
    setState(next)
  }, [])

  const openSettings = useCallback(() => {
    // openSettings() is a Promise but we don't need to await — the system
    // navigates the user away from our app. Swallow any error silently.
    void Linking.openSettings().catch(() => {})
  }, [])

  return { state, refresh, request, openSettings, isLoading }
}
