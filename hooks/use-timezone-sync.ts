/**
 * COS-871 — tell the backend which timezone this device is in.
 *
 * ─── THE BUG THIS FIXES ──────────────────────────────────────────────
 *
 * Ken, in the US: "he should be receiving the notification according to his
 * time, but he is receiving the notification based on my time" (Vishal is in
 * India).
 *
 * It is not anyone's timezone — it is UTC. `healthPlanReminders` fires on three
 * fixed EventBridge crons (09:00 / 13:00 / 19:00 UTC), and serverless.yml says
 * so plainly: "UTC for v1; per-user timezone scheduling is a Phase 2
 * follow-up". 09:00 UTC is 14:30 in India and 04:00 in New York, so the
 * "morning" reminder wakes a US patient at four in the morning.
 *
 * ─── WHY THIS IS THE WHOLE FIX ───────────────────────────────────────
 *
 * Phase 2 was BUILT. It is just not connected at this end:
 *
 *   - `tzReminders` (SCRUM-259) is deployed and sweeps every 5 minutes,
 *     bucketing each reminder into the user's own local time.
 *   - `PUT /v1/patients/me/notification-prefs/timezone` (SCRUM-257) accepts an
 *     IANA zone and soft-validates it through Intl.
 *   - health-plan-reminders.service.ts:191 already reads
 *     `if (item.timezone) continue;` — a user WITH a timezone is handed to the
 *     tz sweeper, and only a user without one falls back to the UTC slots.
 *
 * Nothing in the app ever set it. Every user has no timezone, so every user
 * takes the legacy UTC path. Sending it moves them onto the sweeper that
 * already exists.
 *
 * ─── WHEN IT SENDS ───────────────────────────────────────────────────
 *
 * On sign-in and whenever the app returns to the foreground, because a
 * traveller's zone changes without the app restarting. It PUTs only when the
 * value differs from what it last sent, so a foreground event is not a request.
 */

import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'

import { apiClient } from '@/lib/api-client'
import { hasStoredSession } from '@/lib/auth-tokens'

/** The device's IANA zone, or '' if the platform cannot say. */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

export function useTimezoneSync(): void {
  // What we last successfully sent. Deliberately a ref, not state: this must
  // never trigger a re-render of the root layout.
  const lastSent = useRef<string | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    let cancelled = false

    const sync = async (): Promise<void> => {
      const tz = deviceTimezone()
      if (!tz || tz === lastSent.current || inFlight.current) return
      // Unauthenticated users have nothing to attach a timezone to, and the
      // PUT would 401 on every foreground until they sign in.
      if (!(await hasStoredSession())) return

      inFlight.current = true
      try {
        await apiClient.put('/v1/patients/me/notification-prefs/timezone', { timezone: tz })
        if (!cancelled) lastSent.current = tz
      } catch {
        /*
         * Swallowed on purpose. A failed timezone write must never surface to
         * a patient or block anything — the backend simply keeps them on the
         * legacy UTC path until the next foreground retries.
         */
      } finally {
        inFlight.current = false
      }
    }

    void sync()

    const onChange = (s: AppStateStatus): void => {
      if (s === 'active') void sync()
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [])
}
