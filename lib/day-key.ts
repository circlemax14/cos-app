/**
 * "What day is it?" — one answer, in the device's LOCAL timezone.
 *
 * ─── WHY THIS FILE EXISTS ────────────────────────────────────────────
 *
 * The app derived a calendar day two different ways, and they disagree for
 * hours of every day:
 *
 *   UTC   `new Date().toISOString().slice(0, 10)`   — 15 call sites
 *   LOCAL `getFullYear()/getMonth()/getDate()`      — 5 call sites
 *
 * `toISOString()` converts to UTC first. So for a patient in Los Angeles
 * (UTC-7), from 17:00 local onward the UTC date is ALREADY TOMORROW, and the
 * app believed "today" was tomorrow for the last seven hours of every day.
 * East of UTC the mirror image: from local midnight until the offset elapses,
 * "today" was still yesterday.
 *
 * That was not cosmetic. It meant:
 *   - fetchTasksForDate() requested the wrong day, so the patient saw
 *     tomorrow's task list every evening
 *   - on a Friday evening every `weekdays` task returned zero occurrences, the
 *     list emptied, and computeAdherence reported 100% — a confident green
 *     score over undone tasks, because nothing was "due"
 *   - routine completion ticks were PERSISTED against tomorrow's date, so the
 *     routine read as already done the next morning
 *   - undated reminders vanished from Today's Schedule for the same window
 *
 * The backend has documented the correct contract all along. From
 * cos-backend/src/routes/plan-habits.routes.ts:
 *
 *     "The date is supplied by the CLIENT, not derived server-side: 'today'
 *      is a local-timezone question and the server's UTC day is wrong for a
 *      patient in Los Angeles for seven hours out of every twenty-four."
 *
 * ─── WHAT THIS FILE IS NOT FOR ───────────────────────────────────────
 *
 * Only for CALENDAR DAYS — "which day does this belong to". Never for an
 * instant. `completedAt`, `updatedAt`, `recordedAt` and friends are moments in
 * time and `toISOString()` is exactly right for them.
 *
 * And beware the inverse trap: a string that already carries a local offset
 * (HealthKit returns `2026-08-03T08:15:00.000-0700`) is ALREADY local when you
 * slice it, so `.slice(0, 10)` on those is correct and must be left alone.
 * `dayKeyOf` below is for UTC-anchored (`…Z`) instants only.
 */

/** `YYYY-MM-DD` for a Date, in the device's local timezone. */
export function localDayIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Today's calendar day, locally. THE canonical "what day is it" for this app.
 *
 * Replaces every `new Date().toISOString().slice(0, 10)`.
 */
export function todayLocalIso(now: Date = new Date()): string {
  return localDayIso(now)
}

/**
 * The local calendar day an instant falls on.
 *
 * Use for a UTC-anchored ISO string (`2026-08-12T02:30:00.000Z`) whose day you
 * need in the patient's terms. Do NOT use on a string that already carries a
 * local offset — slicing those directly is already correct.
 *
 * Returns null for anything unparseable, so callers decide what to do rather
 * than silently getting the epoch.
 */
export function dayKeyOf(iso: string | number | Date | null | undefined): string | null {
  if (iso === null || iso === undefined) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return localDayIso(d)
}

/** Minutes the local zone is ahead of UTC. Sent alongside a day key when the backend wants it. */
export function tzOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset()
}
