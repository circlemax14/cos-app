/**
 * Turning a visit's two UTC timestamps into something a patient reads at a
 * glance. SCRUM-688.
 *
 * Split out of the component because this is the part with the bugs in it.
 * Rendering a list is hard to get wrong; deciding that 00:15 tomorrow is
 * "Tomorrow" and not "in 12 hours", or that a visit crossing midnight is one
 * visit and not two, is where date code goes wrong — and none of it needs
 * React to test.
 *
 * IMPORT-FREE ON PURPOSE. `node --test` in this repo cannot resolve the `@/`
 * alias, so every helper here takes plain values and returns plain values.
 *
 * ─── LOCAL TIME, ALWAYS ──────────────────────────────────────────────
 *
 * The API sends UTC. A patient thinks in the time on their own clock, so every
 * function here converts once, at the boundary, using the device timezone.
 * "Thursday 2pm" must mean 2pm where the patient is standing, not 2pm UTC —
 * getting this wrong shows someone a visit on the wrong day, which is the one
 * failure that makes a schedule worse than no schedule.
 */

/** Days between two dates, counted in CALENDAR days rather than 24h blocks. */
function calendarDaysBetween(from: Date, to: Date): number {
  // Comparing midnights, not elapsed hours. A visit at 08:00 tomorrow is one
  // day away even though it is 14 hours off; a visit at 23:00 tonight is zero
  // days away even though it is 11 hours off. Elapsed-hours maths gets both
  // backwards and would label tonight's visit "Tomorrow".
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * The day a visit falls on, phrased the way a person would say it.
 *
 * Today / Tomorrow for the two days that matter most, weekday name inside the
 * coming week, and a plain date beyond that — because "next Tuesday" is
 * genuinely ambiguous to most people and a date never is.
 */
export function formatVisitDay(startAtIso: string, nowIso: string): string {
  const start = new Date(startAtIso)
  const now = new Date(nowIso)
  if (Number.isNaN(start.getTime())) return ''

  const days = calendarDaysBetween(now, start)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) {
    return start.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * The time range, e.g. "2:00 – 3:00 PM".
 *
 * Drops the meridiem from the start when both ends share it, because
 * "2:00 PM – 3:00 PM" reads as two separate facts and "2:00 – 3:00 PM" reads as
 * one span. Keeps both when they differ, since "11:30 – 12:30 PM" would
 * otherwise hide that the visit starts in the morning.
 */
export function formatVisitTime(startAtIso: string, endAtIso: string): string {
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)
  if (Number.isNaN(start.getTime())) return ''

  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  const startStr = start.toLocaleTimeString(undefined, opts)
  if (Number.isNaN(end.getTime())) return startStr

  const endStr = end.toLocaleTimeString(undefined, opts)

  // Meridiem is locale text, not a fixed "AM"/"PM" — derive it by comparing
  // each formatted string against its own hour-and-minute core rather than
  // string-matching "PM", which is simply absent in 24-hour locales.
  const startCore = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: false })
  const endCore = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: false })
  const startSuffix = startStr.replace(startCore, '').trim()
  const endSuffix = endStr.replace(endCore, '').trim()

  if (startSuffix !== '' && startSuffix === endSuffix) {
    return `${startStr.replace(startSuffix, '').trim()} – ${endStr}`
  }
  return `${startStr} – ${endStr}`
}

/**
 * Does this visit cross midnight into another calendar day?
 *
 * An overnight visit shown as "Today 11:00 PM – 1:00 AM" reads as ending two
 * hours BEFORE it starts. Callers use this to add the end day explicitly.
 */
export function spansMidnight(startAtIso: string, endAtIso: string): boolean {
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  return calendarDaysBetween(start, end) !== 0
}

/**
 * One line a screen reader can say, e.g.
 * "Dana Reed, Care Manager. Tomorrow, 2:00 – 3:00 PM."
 *
 * Composed here rather than left to the reader to stitch from separate Text
 * nodes, because a reader walking four fragments announces four things and the
 * relationship between them is lost.
 */
export function visitAccessibilityLabel(
  name: string,
  role: string,
  startAtIso: string,
  endAtIso: string,
  nowIso: string,
): string {
  const day = formatVisitDay(startAtIso, nowIso)
  const time = formatVisitTime(startAtIso, endAtIso)
  const when = [day, time].filter(Boolean).join(', ')
  const who = [name, role].filter(Boolean).join(', ')
  return when ? `${who}. ${when}.` : `${who}.`
}
