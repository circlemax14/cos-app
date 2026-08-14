/**
 * The current local calendar day, kept fresh across midnight and backgrounding.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────
 *
 * Home and Today's Schedule both computed their day window with
 * `useMemo(..., [])` — evaluated once, on mount, and never again:
 *
 *     const todayWindow = useMemo(() => {
 *       const start = new Date(); start.setHours(0, 0, 0, 0)
 *       ...
 *     }, [])
 *
 * Home is a long-lived tab and does not remount when the app returns from the
 * background. So a phone left on Home overnight wakes up still showing
 * YESTERDAY's window: yesterday's calendar events, yesterday's task list,
 * yesterday's adherence — with no indication anything is stale. Pull-to-refresh
 * does not help either, because the window itself is the thing that is wrong.
 *
 * This was latent while "today" was computed in UTC (the day rolled over at a
 * different, equally wrong moment). Fixing the day keys made it reachable, so
 * it is fixed here rather than left to surface as another bug report.
 *
 * ─── WHEN IT UPDATES ─────────────────────────────────────────────────
 *
 * Two triggers, because neither alone is sufficient:
 *
 *   AppState → 'active'. Covers the overwhelmingly common case — the phone was
 *   asleep and the patient opens the app the next morning. Cheap and immediate.
 *
 *   A timer to the next local midnight. Covers the app being left open and
 *   awake across midnight, which AppState never fires for. Scheduled to the
 *   exact boundary rather than polled, so an idle app does no work; it
 *   re-arms after each rollover.
 *
 * Returns a STRING day key rather than a Date so it is a stable dependency —
 * a Date would be a new reference every render and defeat every useMemo
 * downstream.
 */

import { useEffect, useMemo, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { todayLocalIso } from '@/lib/day-key'

/** Milliseconds from now until the next local midnight, floored at 1s. */
function msUntilLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return Math.max(1000, next.getTime() - now.getTime())
}

/**
 * Today's local day key (`YYYY-MM-DD`), refreshed on foreground and at midnight.
 *
 * Use this as the dependency for anything scoped to "today" — the value only
 * changes when the day actually changes, so downstream memos stay stable.
 */
export function useLocalDayKey(): string {
  const [day, setDay] = useState(() => todayLocalIso())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    // setState with the same string is a no-op in React, so a spurious wake
    // (foregrounding mid-morning) costs nothing.
    const sync = (): void => setDay(todayLocalIso())

    const armMidnightTimer = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        sync()
        // Re-arm for the following midnight. A single timeout would only ever
        // fire once, so an app left open for two days would go stale again.
        armMidnightTimer()
      }, msUntilLocalMidnight())
    }

    const onAppState = (next: AppStateStatus): void => {
      if (next !== 'active') return
      sync()
      // Re-arm on resume: a timer scheduled before the device slept may have
      // been delayed or coalesced by the OS, so its deadline is no longer
      // trustworthy.
      armMidnightTimer()
    }

    const sub = AppState.addEventListener('change', onAppState)
    armMidnightTimer()

    return () => {
      sub.remove()
      if (timer) clearTimeout(timer)
    }
  }, [])

  return day
}

/**
 * Local midnight → local end-of-day for the current day, refreshed with it.
 *
 * The shape the calendar hooks expect. Memoised on the day KEY, so the Date
 * objects keep a stable identity for the whole day and change exactly once
 * when it rolls over.
 */
export function useTodayWindow(): { start: Date; end: Date; dayKey: string } {
  const dayKey = useLocalDayKey()
  // Memoised on the day key, and it has to be: useCalendar takes these Dates
  // as dependencies, so returning fresh objects every render would re-run the
  // whole calendar fetch on every render. That is the same reference-identity
  // trap the completed-routines Set hit.
  //
  // Built from the KEY rather than from `new Date()` so the window always
  // matches the key it is derived from, even if the clock ticked between them.
  return useMemo(() => {
    const [y, m, d] = dayKey.split('-').map((n) => parseInt(n, 10))
    return {
      start: new Date(y, m - 1, d, 0, 0, 0, 0),
      end: new Date(y, m - 1, d, 23, 59, 59, 999),
      dayKey,
    }
  }, [dayKey])
}
