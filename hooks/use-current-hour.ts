/**
 * hooks/use-current-hour.ts — SCRUM-653 (Home Redesign)
 *
 * Reactive hook that returns the current wall-clock hour (0-23) and
 * re-renders callers when the hour transitions. Used by the redesigned
 * Home to keep GreetingHeader ("Good morning" / "Good afternoon" /
 * "Good evening") in sync when a user lingers on the screen across a
 * boundary — the shipped GreetingHeader captured hour once at parent
 * render, which meant an idle screen kept showing "Good afternoon" past
 * 18:00 until something else forced a re-render.
 *
 * Why 60_000ms + primitive-diff bail:
 *   - A wall-clock hook that ticks every second would re-render the
 *     entire Home surface 60× per minute for zero user-visible signal.
 *   - Sampling once per minute costs one setState per minute; React
 *     BAILS OUT on identical primitives (`useState` uses Object.is),
 *     so parents only actually re-render on the 1-in-60 tick that
 *     crosses an hour boundary. Net cost: one comparison per minute.
 *   - Aligning to hour boundaries with setTimeout is tempting but adds
 *     failure modes (system clock jumps, DST, backgrounded timers
 *     firing late). A dumb one-minute setInterval is robust and its
 *     max drift (up to 60s past the boundary) is invisible to a user
 *     — the greeting bucket is a >4-hour window on either side.
 *
 * Consumers wanting deterministic tests should still accept a
 * `nowHour` prop override (see GreetingHeader) — this hook is for
 * production reactivity, not for unit-test injection.
 */

import { useEffect, useState } from 'react'

const ONE_MINUTE_MS = 60_000

/**
 * Returns the current hour of day (0-23). Re-renders on hour transitions.
 * Uses a 60s poll + primitive-diff bail (React skips re-render when
 * setState is called with an identical primitive).
 */
export function useCurrentHour(): number {
  const [hour, setHour] = useState<number>(() => new Date().getHours())

  useEffect(() => {
    const id = setInterval(() => {
      // Object.is on a number → React bails when the hour hasn't
      // changed. Only ~1 in 60 ticks per hour actually schedules a
      // render.
      setHour(new Date().getHours())
    }, ONE_MINUTE_MS)
    return () => clearInterval(id)
  }, [])

  return hour
}

export default useCurrentHour
