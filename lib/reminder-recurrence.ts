/**
 * Expanding a repeating iOS Reminder into the days it actually falls on.
 *
 * ─── WHY THIS IS NEEDED ──────────────────────────────────────────────
 *
 * EventKit expands recurring EVENTS for you: ask for a date range and you get
 * one EKEvent per occurrence. It does NOT do this for reminders. A reminder
 * that repeats every weekday is a SINGLE EKReminder carrying a
 * `recurrenceRule`, with one `dueDate`.
 *
 * So our two queries both miss it whenever that one date sits outside the
 * window being asked for:
 *   - the date-ranged predicates match on `dueDate`, which for an overdue or
 *     future series is not today
 *   - the null-status query returns it, but readReminders skips anything that
 *     HAS a due date on the undated path
 *
 * Result, reported 2026-08-12: "i have few more reminders for weekdays they
 * are not coming in home page and calendar." Correct — a weekday reminder
 * shows up on exactly one day and is invisible on the other four.
 *
 * This module answers one question, purely: given a rule and a series anchor,
 * does an occurrence land on this local day? No EventKit, no React, no clock
 * of its own — the failure modes of recurrence maths (an interval counted from
 * the wrong anchor, a weekday set silently ignored, a series that outlives its
 * endDate) are all invisible on a device until the wrong week arrives.
 *
 * Day-of-week values follow expo-calendar's DayOfTheWeek enum, which is
 * 1-based from SUNDAY — deliberately NOT JavaScript's 0-based getDay(). That
 * off-by-one is the single easiest way to shift someone's whole schedule by a
 * day, so the conversion happens in exactly one place below.
 */

/** expo-calendar Frequency, restated so this module needs no import. */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurrenceLike {
  frequency: RecurrenceFrequency
  /** Every N periods. Absent or < 1 is treated as 1. */
  interval?: number
  /** Series stops after this instant. */
  endDate?: string | Date | null
  /** Series stops after this many occurrences. */
  occurrence?: number | null
  /** 1 = Sunday … 7 = Saturday (expo-calendar DayOfTheWeek). */
  daysOfTheWeek?: { dayOfTheWeek: number }[] | null
  daysOfTheMonth?: number[] | null
  monthsOfTheYear?: number[] | null
}

/** Local midnight for a date, so day comparisons never straddle a time. */
function atLocalMidnight(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Whole local days from `a` to `b`. Uses midday to sidestep DST shifts. */
function daysBetween(a: Date, b: Date): number {
  const ma = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const mb = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((mb - ma) / 86_400_000)
}

/** JS getDay() (0=Sun) → expo-calendar DayOfTheWeek (1=Sun). */
function expoDayOfWeek(d: Date): number {
  return d.getDay() + 1
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

/**
 * Does an occurrence of `rule`, anchored at `seriesStart`, land on `day`?
 *
 * `day` is compared at local-day granularity — time of day is irrelevant to
 * "which day does this belong to", and the caller re-applies the series' own
 * time when it builds the row.
 *
 * Returns false rather than throwing for anything malformed. A recurrence we
 * cannot understand should quietly not appear, never appear every single day.
 */
export function occursOnDay(
  rule: RecurrenceLike | null | undefined,
  seriesStart: Date,
  day: Date,
): boolean {
  if (!rule) return false
  if (Number.isNaN(seriesStart.getTime()) || Number.isNaN(day.getTime())) return false

  const start = atLocalMidnight(seriesStart)
  const target = atLocalMidnight(day)

  // A series never occurs before it starts.
  const offsetDays = daysBetween(start, target)
  if (offsetDays < 0) return false

  // Past the series' own end date.
  if (rule.endDate) {
    const end = new Date(rule.endDate)
    if (!Number.isNaN(end.getTime()) && target > atLocalMidnight(end)) return false
  }

  const interval = Number.isInteger(rule.interval) && (rule.interval as number) > 0
    ? (rule.interval as number)
    : 1

  let hit = false
  switch (rule.frequency) {
    case 'daily':
      hit = offsetDays % interval === 0
      break

    case 'weekly': {
      const days = rule.daysOfTheWeek?.map((d) => d.dayOfTheWeek) ?? []
      if (days.length > 0) {
        // "Every weekday" is this: WEEKLY with Mon–Fri listed. The interval
        // counts WEEKS, measured from the start's week, not from the day —
        // counting it in days would make a fortnightly rule fire on the wrong
        // days of the alternate week.
        if (!days.includes(expoDayOfWeek(target))) return false
        const weeksApart = Math.floor(
          (daysBetween(startOfWeek(start), startOfWeek(target))) / 7,
        )
        hit = weeksApart % interval === 0
      } else {
        // No explicit days ⇒ same weekday as the anchor.
        hit = offsetDays % (7 * interval) === 0
      }
      break
    }

    case 'monthly': {
      const monthsApart = monthsBetween(start, target)
      if (monthsApart < 0 || monthsApart % interval !== 0) return false
      const daysOfMonth = rule.daysOfTheMonth ?? []
      hit = daysOfMonth.length > 0
        ? daysOfMonth.includes(target.getDate())
        : target.getDate() === start.getDate()
      break
    }

    case 'yearly': {
      const yearsApart = target.getFullYear() - start.getFullYear()
      if (yearsApart < 0 || yearsApart % interval !== 0) return false
      const months = rule.monthsOfTheYear ?? []
      const monthOk = months.length > 0
        ? months.includes(target.getMonth() + 1)
        : target.getMonth() === start.getMonth()
      hit = monthOk && target.getDate() === start.getDate()
      break
    }

    default:
      // Unrecognised frequency — fail closed. Firing daily would be the
      // loudest possible way to be wrong.
      return false
  }

  if (!hit) return false

  // `occurrence` caps the series by COUNT. We do not enumerate from the start
  // (a daily series running for years would be a long loop for a checkbox), so
  // this is a bound rather than an exact count: the Nth occurrence can never
  // be further out than N periods.
  if (Number.isInteger(rule.occurrence) && (rule.occurrence as number) > 0) {
    const maxDays = periodsToDays(rule.frequency, (rule.occurrence as number) * interval)
    if (offsetDays > maxDays) return false
  }

  return true
}

/** Local Sunday-anchored week start, matching the 1=Sunday day numbering. */
function startOfWeek(d: Date): Date {
  const out = atLocalMidnight(d)
  out.setDate(out.getDate() - out.getDay())
  return out
}

function periodsToDays(freq: RecurrenceFrequency, periods: number): number {
  switch (freq) {
    case 'daily': return periods
    case 'weekly': return periods * 7
    case 'monthly': return periods * 31
    case 'yearly': return periods * 366
  }
}

/**
 * Every local day in [windowStart, windowEnd] on which this series occurs.
 *
 * Capped: a daily reminder over the Appointments screen's ±1-year window would
 * otherwise produce ~400 rows for one reminder. The cap is generous enough for
 * any real window and exists to stop a malformed rule from melting the screen.
 */
export const MAX_OCCURRENCES = 400

export function occurrencesInWindow(
  rule: RecurrenceLike | null | undefined,
  seriesStart: Date,
  windowStart: Date,
  windowEnd: Date,
): Date[] {
  if (!rule) return []
  const out: Date[] = []
  const cursor = atLocalMidnight(windowStart)
  const last = atLocalMidnight(windowEnd)
  // Bound the loop by days scanned as well as hits, so a pathological window
  // cannot spin regardless of how few days match.
  let scanned = 0
  while (cursor <= last && out.length < MAX_OCCURRENCES && scanned <= 800) {
    if (occursOnDay(rule, seriesStart, cursor)) out.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
    scanned++
  }
  return out
}
