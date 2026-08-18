/**
 * When is the next dose, what has already passed today, and what may we say
 * about supply.
 *
 * Pure and import-free so `node --test` can run it — see
 * feedback_node_test_no_alias_imports.
 *
 * ─── THE FACT THAT SHAPES ALL OF THIS ────────────────────────────────
 *
 * `supply` HAS NO BACKEND SOURCE. Traced 2026-08-18: `remainingQuantity` and
 * `dosesPerDay` enter only through `setSupply`, whose sole writer is the
 * hand-entry supply modal, and `needsRefill` / `runOutDate` are server-computed
 * from those two typed numbers. No EHR or FHIR path writes any of it.
 *
 * So supply is NULL on every row of every account until a patient types it in.
 * A design whose value rests on a supply bar would be empty for essentially
 * everyone. Every function here therefore treats "no supply" as the normal
 * case and returns a state that renders NOTHING, rather than a placeholder.
 *
 * ─── AND THE ONE THING WE MUST NOT IMPLY ─────────────────────────────
 *
 * There is no dose-taken event anywhere in the medication contract — the API
 * exposes add / edit / remove / setTracked / setSupply / snoozeRefill and
 * nothing else. So this module can say a dose was SCHEDULED, and must never
 * say one was taken, missed, or is due. `passedTodayTimes` is named for what
 * it knows.
 */

export type Cadence = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface ScheduleSupply {
  remainingQuantity?: number | null
  dosesPerDay?: number | null
  runOutDate?: string | null
  needsRefill?: boolean
  snoozedUntil?: string | null
  cadence?: Cadence | null
  startDate?: string | null
  /** Derived by the backend from the dispense quantity, not typed by anyone. */
  estimated?: boolean
  estimatedFrom?: string | null
}

export interface ScheduleMed {
  times?: readonly string[] | null
  form?: string | null
  supply?: ScheduleSupply | null
}

const CADENCE_DAYS: Record<Cadence, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
}

const CADENCE_LABEL: Record<Cadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

/** Minutes past midnight for "HH:MM", or null when unparseable. */
export function minutesOfDay(raw: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(raw ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Today's dose times that have already gone by.
 *
 * SCHEDULED, not missed. We have no idea whether the patient took them, and
 * the wording downstream must not pretend otherwise.
 */
export function passedTodayTimes(
  times: readonly string[] | null | undefined,
  now: Date,
): string[] {
  if (!Array.isArray(times) || times.length === 0) return []
  const cursor = now.getHours() * 60 + now.getMinutes()
  return times
    .filter((t) => {
      const m = minutesOfDay(t)
      return m !== null && m < cursor
    })
    .slice()
    .sort((a, b) => (minutesOfDay(a) as number) - (minutesOfDay(b) as number))
}

/** Today's dose times still to come, earliest first. */
export function upcomingTodayTimes(
  times: readonly string[] | null | undefined,
  now: Date,
): string[] {
  if (!Array.isArray(times) || times.length === 0) return []
  const cursor = now.getHours() * 60 + now.getMinutes()
  return times
    .filter((t) => {
      const m = minutesOfDay(t)
      return m !== null && m >= cursor
    })
    .slice()
    .sort((a, b) => (minutesOfDay(a) as number) - (minutesOfDay(b) as number))
}

export type NextDose =
  | { kind: 'time'; time: string; tomorrow: boolean }
  | { kind: 'cadence'; cadence: Cadence; label: string; nextDate: string }
  | null

/** YYYY-MM-DD in LOCAL time. `toISOString` would shift the date near midnight. */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The next scheduled dose, or null when we genuinely cannot compute one.
 *
 * TWO PATHS, and the second is the F3 fix. A weekly injectable has `times: []`
 * — correctly, because it has no clock time — so a times-only implementation
 * makes every injectable structurally invisible. Cadence plus a start date
 * gives a real answer.
 *
 * Returns null rather than a placeholder. A caller that gets null must render
 * nothing and reserve no space, not draw an em dash.
 */
export function nextDose(med: ScheduleMed | null | undefined, now: Date): NextDose {
  if (!med) return null

  const upcoming = upcomingTodayTimes(med.times, now)
  if (upcoming.length > 0) return { kind: 'time', time: upcoming[0] as string, tomorrow: false }

  // Times exist but all of today's have gone — the next one is tomorrow's first.
  const all = Array.isArray(med.times)
    ? med.times.filter((t) => minutesOfDay(t) !== null).slice().sort((a, b) => (minutesOfDay(a) as number) - (minutesOfDay(b) as number))
    : []
  if (all.length > 0) return { kind: 'time', time: all[0] as string, tomorrow: true }

  // No clock times at all. Fall back to an injectable's cadence.
  const cadence = med.supply?.cadence
  const startDate = med.supply?.startDate
  if (cadence && CADENCE_DAYS[cadence]) {
    const start = parseISODate(startDate)
    // A cadence with no start date cannot be projected. Not eligible —
    // guessing "today" would put a fabricated date on screen.
    if (!start) return null
    const step = CADENCE_DAYS[cadence]
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const elapsedDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
    const periods = elapsedDays < 0 ? 0 : Math.ceil(elapsedDays / step)
    const next = new Date(start.getTime())
    next.setDate(next.getDate() + periods * step)
    return {
      kind: 'cadence',
      cadence,
      label: CADENCE_LABEL[cadence],
      nextDate: localISODate(next),
    }
  }

  return null
}

/** "Weekly", "Every 2 weeks" — for the schedule line on an injectable. */
export function cadenceLabel(cadence: Cadence | null | undefined): string | null {
  return cadence && CADENCE_LABEL[cadence] ? CADENCE_LABEL[cadence] : null
}

/**
 * Signed whole days from today to an ISO date. NEGATIVE when already past.
 *
 * Deliberately signed. The clamped variant in MedicationsSection returns 0 for
 * anything overdue, which makes "overdue by 3 days" unsayable and, combined
 * with a `<= 14` comparison, makes `null` compare TRUE and render "null days
 * left". That is F12.
 */
export function signedDaysUntil(iso: string | null | undefined): number | null {
  const target = parseISODate(iso)
  if (!target) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/**
 * Whether a supply figure was DERIVED or TYPED, and what it was derived from.
 *
 * Carried on every non-empty status so the row can qualify the number. A
 * derived count assumes the fill date and full adherence; neither is
 * observable, so the screen must not state it as fact.
 */
export interface SupplyProvenance {
  estimated: boolean
  basedOn: string | null
}

export type SupplyStatus =
  | { kind: 'none' }
  | { kind: 'snoozed'; until: string }
  | { kind: 'overdue'; days: number }
  | { kind: 'reorder'; days: number | null; urgent: boolean }
  | { kind: 'ok'; days: number }
  | { kind: 'quantityOnly'; remaining: number }

/**
 * What, if anything, we may say about supply — the §4.5 table as a union.
 *
 * `kind: 'none'` is the DEFAULT and the overwhelmingly common case. It means
 * render nothing: no bar, no grey track, no dash, no "not tracked" badge. The
 * row without supply must look finished, not broken.
 *
 * Every branch guards `!= null` explicitly rather than relying on comparison,
 * because `null <= 2` is `true` in JavaScript and that is exactly how a row
 * ends up reading "About null days left".
 */
/**
 * Where a supply figure came from. Read alongside supplyStatus so the row can
 * qualify the number rather than assert it.
 */
export function supplyProvenance(
  supply: ScheduleSupply | null | undefined,
): SupplyProvenance {
  return {
    estimated: supply?.estimated === true,
    basedOn: typeof supply?.estimatedFrom === 'string' ? supply.estimatedFrom : null,
  }
}

export function supplyStatus(
  supply: ScheduleSupply | null | undefined,
  todayISO: string,
): SupplyStatus {
  if (!supply) return { kind: 'none' }

  const snoozedUntil = supply.snoozedUntil
  const snoozeActive = typeof snoozedUntil === 'string' && snoozedUntil > todayISO
  if (snoozeActive) return { kind: 'snoozed', until: snoozedUntil as string }

  const d = signedDaysUntil(supply.runOutDate)
  const needsRefill = supply.needsRefill === true

  if (needsRefill) {
    if (d != null && d < 0) return { kind: 'overdue', days: Math.abs(d) }
    if (d != null) return { kind: 'reorder', days: d, urgent: d <= 2 }
    return { kind: 'reorder', days: null, urgent: true }
  }

  if (d != null && d >= 0) return { kind: 'ok', days: d }

  const remaining = supply.remainingQuantity
  if (typeof remaining === 'number' && Number.isFinite(remaining) && remaining >= 0) {
    return { kind: 'quantityOnly', remaining }
  }

  return { kind: 'none' }
}

/**
 * Whether a supply BAR may be drawn.
 *
 * A bar needs both a day count and a quantity. With only one of them the bar's
 * length is invented — it would be drawing a fraction whose denominator we do
 * not have. Text still carries the information in that case.
 */
export function canDrawSupplyBar(supply: ScheduleSupply | null | undefined): boolean {
  if (!supply) return false
  const d = signedDaysUntil(supply.runOutDate)
  const q = supply.remainingQuantity
  return d != null && d >= 0 && typeof q === 'number' && Number.isFinite(q)
}

// ─── The "Next scheduled" band ──────────────────────────────────────

export interface BandMed {
  name: string
  dose?: string | null
  frequency?: string | null
  times?: readonly string[] | null
  form?: string | null
  supply?: ScheduleSupply | null
}

export interface BandModel {
  /** Up to three names; more are summarised by `overflow`. */
  names: string[]
  overflow: number
  /** The dose line, only when exactly ONE medication is due at that moment. */
  single: BandMed | null
  /** "08:00" for a clock dose, or null for a cadence dose. */
  time: string | null
  tomorrow: boolean
  /** Cadence label when the next dose is an injectable's. */
  cadence: string | null
  cadenceDate: string | null
  /** Times earlier today that were scheduled, across all medications. */
  earlierToday: string[]
}

/**
 * What the band should say, or null when it should not exist.
 *
 * NULL IS THE IMPORTANT RETURN. In an account whose medications all came from
 * the EHR, none has dose times and none has a cadence start date, so nothing
 * is computable — and the band must then render nothing at all. Not a shell,
 * not an empty state, and above all not a permanent "add dose times" nag on a
 * screen the patient did not come here to configure.
 *
 * Medications sharing the earliest time are grouped, because four separate
 * "next dose" claims for the same 2pm is three claims too many.
 */
export function nextScheduled(
  meds: readonly BandMed[] | null | undefined,
  now: Date,
): BandModel | null {
  if (!Array.isArray(meds) || meds.length === 0) return null

  const withNext = meds
    .map((m) => ({ med: m, next: nextDose(m, now) }))
    .filter((x): x is { med: BandMed; next: NonNullable<NextDose> } => x.next !== null)

  if (withNext.length === 0) return null

  // Rank: a clock time today beats tomorrow's, which beats a cadence date.
  const rank = (n: NonNullable<NextDose>): number => {
    if (n.kind === 'time') return n.tomorrow ? 10_000 + (minutesOfDay(n.time) ?? 0) : (minutesOfDay(n.time) ?? 0)
    // A cadence dose is dated, not timed — sort it after today's clock doses.
    return 20_000 + new Date(n.nextDate).getTime() / 86_400_000
  }
  withNext.sort((a, b) => rank(a.next) - rank(b.next))

  const winner = withNext[0] as { med: BandMed; next: NonNullable<NextDose> }
  const key = (n: NonNullable<NextDose>): string =>
    n.kind === 'time' ? `t:${n.time}:${n.tomorrow}` : `c:${n.nextDate}`
  const winnerKey = key(winner.next)
  const sharing = withNext.filter((x) => key(x.next) === winnerKey)

  const names = sharing.slice(0, 3).map((x) => x.med.name)
  const overflow = Math.max(0, sharing.length - 3)

  // Scoped to the medication(s) the band NAMES, not aggregated across the
  // whole list. Aggregating produced "2am, 8am, 9am" — three times belonging
  // to three different drugs, which reads as a day's summary but tells the
  // reader nothing they can act on. Per-medication lines on the rows below
  // already carry the whole-list picture, each attached to its own drug.
  const earlier = new Set<string>()
  for (const x of sharing) for (const t of passedTodayTimes(x.med.times, now)) earlier.add(t)

  return {
    names,
    overflow,
    single: sharing.length === 1 ? winner.med : null,
    time: winner.next.kind === 'time' ? winner.next.time : null,
    tomorrow: winner.next.kind === 'time' ? winner.next.tomorrow : false,
    cadence: winner.next.kind === 'cadence' ? winner.next.label : null,
    cadenceDate: winner.next.kind === 'cadence' ? winner.next.nextDate : null,
    earlierToday: Array.from(earlier).sort(
      (a, b) => (minutesOfDay(a) as number) - (minutesOfDay(b) as number),
    ),
  }
}

/**
 * "in about 4 hours" — deliberately vague, and never a countdown.
 *
 * Under an hour it says "soon" rather than a minute count: this is recomputed
 * on focus, not on a timer, so a precise "in 12 minutes" would be a lie within
 * a minute of backgrounding the app. An hour-grained phrase stays true long
 * enough to be worth saying.
 */
export function relativeToDose(time: string, now: Date, tomorrow: boolean): string | null {
  const m = minutesOfDay(time)
  if (m === null) return null
  const cursor = now.getHours() * 60 + now.getMinutes()
  const delta = tomorrow ? m + 24 * 60 - cursor : m - cursor
  if (delta < 0) return null
  if (delta < 60) return 'soon'
  const hours = Math.round(delta / 60)
  if (hours < 24) return `in about ${hours} hour${hours === 1 ? '' : 's'}`
  return null
}
