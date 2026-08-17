/**
 * How a Health Age result is PHRASED and how confident we are in it.
 *
 * Split out of the screen because these are the decisions worth testing:
 * whether "younger" or "older" is the right word, how many decimals a slowly-
 * moving health figure earns, and — the one that matters most — how honest we
 * are about an estimate built from incomplete data.
 *
 * Import-free: `node --test` here cannot resolve the `@/` alias, so everything
 * takes plain values and returns plain values.
 *
 * ─── WHY THE GAP LEADS, NOT THE ABSOLUTE ─────────────────────────────
 *
 * Vishal supplied Bevel's Biological Age screen as the reference. Its hierarchy
 * is: big number, then "8.3 years younger" underneath in green. Ours led with
 * "vs chronological age 44", which makes the reader do the subtraction.
 *
 * The delta is the meaningful figure. "36" means nothing without knowing you
 * are 44; "8.3 years younger" is the whole finding in three words. So the gap
 * gets the prominent, coloured, plain-language treatment.
 */

/** One decimal. A health age that moves ~1 year annually earns more than an integer. */
export function formatAge(years: number | null | undefined): string {
  if (typeof years !== 'number' || !Number.isFinite(years)) return '—'
  return years.toFixed(1)
}

export interface GapPhrase {
  /** e.g. "8.3 years younger". Empty when it cannot be computed. */
  text: string
  /** Which way it points — drives colour. 'even' when the gap rounds to nothing. */
  direction: 'younger' | 'older' | 'even'
}

/**
 * The headline finding, in the words a person would use.
 *
 * `gap` is (healthAge − chronologicalAge), so NEGATIVE is younger and good.
 * That sign convention is easy to invert by accident, and inverting it would
 * congratulate a patient whose health age is climbing — which is the single
 * most damaging thing this screen could do. Hence a dedicated function and a
 * test for each direction.
 */
export function gapPhrase(gap: number | null | undefined): GapPhrase {
  if (typeof gap !== 'number' || !Number.isFinite(gap)) return { text: '', direction: 'even' }
  const rounded = Math.round(gap * 10) / 10
  // Under a tenth of a year is ~5 weeks. Reporting that as a direction implies
  // a precision the model does not have.
  if (Math.abs(rounded) < 0.1) return { text: 'about the same as your age', direction: 'even' }
  const magnitude = Math.abs(rounded).toFixed(1)
  return rounded < 0
    ? { text: `${magnitude} years younger`, direction: 'younger' }
    : { text: `${magnitude} years older`, direction: 'older' }
}

export interface WeekChange {
  /** e.g. "0.7 from last week". Empty when there is nothing to compare. */
  text: string
  direction: 'down' | 'up' | 'flat'
}

/**
 * Week-over-week movement, from the history series.
 *
 * Compares the newest point against the newest point at least 5 days older —
 * not simply the previous element. Buckets are irregular: two points a day
 * apart would otherwise be reported as "from last week", which is a claim
 * about a timescale the data does not support.
 */
export function weekChange(
  points: readonly { bucketDate: string; healthAge: number | null }[],
): WeekChange {
  const usable = points
    .filter((p) => typeof p.healthAge === 'number' && Number.isFinite(p.healthAge))
    .slice()
    .sort((a, b) => a.bucketDate.localeCompare(b.bucketDate))
  if (usable.length < 2) return { text: '', direction: 'flat' }

  const latest = usable[usable.length - 1]
  const latestMs = Date.parse(`${latest.bucketDate}T00:00:00Z`)
  if (Number.isNaN(latestMs)) return { text: '', direction: 'flat' }

  let prior: (typeof usable)[number] | undefined
  for (let i = usable.length - 2; i >= 0; i--) {
    const ms = Date.parse(`${usable[i].bucketDate}T00:00:00Z`)
    if (Number.isNaN(ms)) continue
    if (latestMs - ms >= 5 * 86_400_000) {
      prior = usable[i]
      break
    }
  }
  if (!prior) return { text: '', direction: 'flat' }

  const delta = Math.round(((latest.healthAge as number) - (prior.healthAge as number)) * 10) / 10
  if (Math.abs(delta) < 0.1) return { text: 'no change from last week', direction: 'flat' }
  return {
    text: `${Math.abs(delta).toFixed(1)} from last week`,
    direction: delta < 0 ? 'down' : 'up',
  }
}

export interface Coverage {
  /** Components with a usable, fresh reading. */
  fresh: number
  /** Components the model wants, excluding non-measured terms. */
  total: number
  /** 0-100. */
  percent: number
  label: string
  detail: string
  /** Drives the card's colour. Bevel shows 92% green and 56% amber. */
  tone: 'good' | 'caution' | 'weak'
}

/**
 * How complete is the data behind this estimate?
 *
 * ─── DELIBERATELY NOT CALLED "CONFIDENCE" ────────────────────────────
 *
 * Bevel's screen shows "92% confidence — High-quality age estimate with minor
 * gaps". Ours reports the same shape of information under an honest name,
 * because what we can actually compute is DATA COVERAGE — how many of the
 * model's markers had a fresh reading — and that is not a statistical
 * confidence interval.
 *
 * Presenting coverage as "confidence" would put a number in front of a
 * clinician that looks like it came from the model's error bounds when it came
 * from counting rows. The information is genuinely useful; the label just has
 * to be true. A patient whose estimate rests on 4 of 9 markers deserves to know
 * that, and right now the screen says nothing at all.
 *
 * `chronologicalAge` and `intercept` are excluded: they are always present by
 * construction, so counting them would inflate every score and make the figure
 * least honest exactly when data is thinnest.
 */
const NON_MEASURED = new Set(['chronologicalAge', 'intercept'])

export function coverage(
  components: readonly { name: string; status: string }[],
): Coverage | null {
  const measured = components.filter((c) => !NON_MEASURED.has(c.name))
  if (measured.length === 0) return null

  const fresh = measured.filter((c) => c.status === 'fresh').length
  const total = measured.length
  const percent = Math.round((fresh / total) * 100)

  // Thresholds are about how the sentence should READ, not clinical cut-offs,
  // so they are named for the reader rather than dressed up as statistics.
  let label: string
  let detail: string
  let tone: Coverage['tone']
  if (percent >= 90) {
    label = 'Complete data'
    detail = 'Every marker this estimate uses has a recent reading.'
    tone = 'good'
  } else if (percent >= 60) {
    label = 'Good data'
    detail = `Based on ${fresh} of ${total} markers. A few are missing or out of date.`
    tone = 'good'
  } else if (percent >= 30) {
    label = 'Partial data'
    detail = `Only ${fresh} of ${total} markers are current, so treat this as a rough estimate.`
    tone = 'caution'
  } else {
    label = 'Limited data'
    detail = `Just ${fresh} of ${total} markers are current. This estimate may change a lot as more results arrive.`
    tone = 'weak'
  }

  return { fresh, total, percent, label, detail, tone }
}

/**
 * Where the health age sits on a scale around the chronological age.
 *
 * Returns a 0-1 position for a horizontal range bar. Bevel draws this as an
 * arc; an arc needs SVG, which the iOS 26.5 envelope on this screen forbids
 * (ADR-0003 — the crashes were render-primitive density and native cost). A
 * straight bar carries the same three facts — floor, ceiling, and where you sit
 * relative to your actual age — using plain Views, so the information survives
 * even though the shape does not.
 */
export interface RangePosition {
  min: number
  max: number
  /** 0-1 along the bar. */
  healthAt: number
  /** 0-1 along the bar. */
  chronoAt: number
}

export function rangePosition(
  overall: number | null | undefined,
  chrono: number | null | undefined,
  span = 10,
): RangePosition | null {
  if (typeof overall !== 'number' || !Number.isFinite(overall)) return null
  if (typeof chrono !== 'number' || !Number.isFinite(chrono)) return null

  // Centred on chronological age so the midpoint always means "exactly your
  // age". A scale centred on the health age instead would move the meaning of
  // the middle every week.
  const min = chrono - span
  const max = chrono + span
  const clamp = (v: number): number => Math.max(0, Math.min(1, (v - min) / (max - min)))
  return { min, max, healthAt: clamp(overall), chronoAt: clamp(chrono) }
}

/**
 * How one marker's contribution reads in a row.
 *
 * ─── AN EMPTY MARKER IS STILL A ROW ──────────────────────────────────
 *
 * Bevel's second reference screen shows Sleep, Activity and Fitness all
 * rendering as "No data available" rather than being dropped. That is the
 * right call and the opposite of what a "sort by impact, take the top six"
 * list does: markers with nothing in them sort to the bottom and get cut.
 *
 * The empty rows are the most ACTIONABLE thing on the screen. A contribution
 * of +1.2 years tells a patient something is wrong; "No data available" tells
 * them exactly what to do about it — connect the tracker, get the bloods done
 * — and it is the only thing that will move the coverage figure above it.
 * Hiding them leaves a patient staring at a low-confidence estimate with no
 * idea why it is low.
 */
export function markerPhrase(
  contributionYears: number | null | undefined,
  status: string,
): { text: string; tone: 'younger' | 'older' | 'even' | 'none' } {
  if (status === 'missing' || typeof contributionYears !== 'number' || !Number.isFinite(contributionYears)) {
    return { text: 'No data available', tone: 'none' }
  }
  const rounded = Math.round(contributionYears * 10) / 10
  if (Math.abs(rounded) < 0.05) return { text: '0.0 years younger', tone: 'even' }
  return rounded < 0
    ? { text: `${Math.abs(rounded).toFixed(1)} years younger`, tone: 'younger' }
    : { text: `${rounded.toFixed(1)} years older`, tone: 'older' }
}

/**
 * Order for the marker list.
 *
 * Markers WITH data first, biggest effect first, then the empty ones. Empty
 * rows are kept — see markerPhrase — but they belong below the readings a
 * patient can actually act on today, not interleaved among them.
 */
export function orderMarkers<T extends { contributionYears: number | null; status: string }>(
  markers: readonly T[],
): T[] {
  const has = (m: T): boolean =>
    m.status !== 'missing' && typeof m.contributionYears === 'number' && Number.isFinite(m.contributionYears)
  return [...markers].sort((a, b) => {
    if (has(a) !== has(b)) return has(a) ? -1 : 1
    if (!has(a)) return 0
    return Math.abs(b.contributionYears as number) - Math.abs(a.contributionYears as number)
  })
}

/**
 * Grouping the markers into something a person can act on.
 *
 * ─── THE MISMATCH THIS FIXES ─────────────────────────────────────────
 *
 * Bevel's reference lists five rows: Sleep, Activity, Fitness, Lifestyle,
 * Blood. Ours listed nine: Albumin, Creatinine, C-reactive protein, Lymphocyte
 * %, Mean cell volume, Red-cell distribution width, Alkaline phosphatase,
 * White-blood-cell count, Glucose.
 *
 * A patient reading "Red-cell distribution width — 0.4 years older" has no idea
 * what to do with it. That is a lab report, not a health screen, and it was the
 * biggest difference from the reference — bigger than the arc gauge, and unlike
 * the arc it needs no native dependency to fix.
 *
 * ─── WHY THERE IS NO SLEEP OR ACTIVITY ROW ───────────────────────────
 *
 * There is a tempting version of this that mirrors Bevel exactly and adds
 * Sleep / Activity / Fitness rows reading "No data available". It would look
 * closer to the screenshot and it would be a LIE.
 *
 * Bevel's model consumes sleep and activity. Ours is Levine PhenoAge, which is
 * blood-only — all nine markers are analytes. A "Sleep — No data available" row
 * tells a patient that connecting a sleep tracker would improve their health
 * age estimate, and with this model it would not change it by a single day.
 * Matching a competitor's layout is not worth telling someone that.
 *
 * So the groups below are the body systems those nine analytes actually speak
 * for — the same taxonomy the LOINC work uses elsewhere in the app, so a
 * patient meets one vocabulary rather than two.
 */
export interface MarkerGroup {
  key: string
  label: string
  /** Plain-language hint at what the group speaks for. */
  hint: string
  members: string[]
}

export const MARKER_GROUPS: readonly MarkerGroup[] = [
  {
    key: 'metabolic',
    label: 'Blood sugar',
    hint: 'How your body handles glucose',
    members: ['glucose'],
  },
  {
    key: 'inflammation',
    label: 'Inflammation & immunity',
    hint: 'Signs of inflammation and immune activity',
    members: ['crp', 'whiteBloodCellCount', 'lymphocytePercent'],
  },
  {
    key: 'liver',
    label: 'Liver & nutrition',
    hint: 'Liver function and protein status',
    members: ['albumin', 'alkalinePhosphatase'],
  },
  {
    key: 'kidneys',
    label: 'Kidneys',
    hint: 'How well your kidneys are filtering',
    members: ['creatinine'],
  },
  {
    key: 'bloodcells',
    label: 'Blood cells',
    hint: 'Size and variation of your red cells',
    members: ['meanCellVolume', 'redCellDistWidth'],
  },
]

export interface GroupedMarker {
  key: string
  label: string
  hint: string
  /** Summed years across the group's members, or null when none has a reading. */
  contributionYears: number | null
  /** 'fresh' when ANY member has a current reading; drives the row's phrasing. */
  status: 'fresh' | 'missing'
  /** How many of the group's markers have a current reading. */
  freshCount: number
  total: number
  /** The underlying markers, for the drill-down. */
  members: { name: string; contributionYears: number | null; status: string }[]
}

/**
 * Roll the raw analytes up into the groups above.
 *
 * Contributions SUM within a group, which is the correct operation here: they
 * are additive year terms in a linear model, so "Liver & nutrition, 0.8 years
 * older" is a true statement about albumin plus alkaline phosphatase. It would
 * NOT be true of a model that combined them any other way, which is why this
 * lives beside the coefficients rather than in a generic helper.
 *
 * A group with no fresh member reports null rather than 0. Zero means "measured
 * and neutral"; null means "not measured", and collapsing the two would tell a
 * patient their kidneys are fine when nobody has looked.
 */
export function groupMarkers(
  components: readonly { name: string; contributionYears: number | null; status: string }[],
): GroupedMarker[] {
  const byName = new Map(components.map((c) => [c.name, c]))

  return MARKER_GROUPS.map((g) => {
    const members = g.members
      .map((n) => byName.get(n))
      .filter((c): c is NonNullable<typeof c> => c != null)

    const usable = members.filter(
      (m) =>
        m.status === 'fresh' &&
        typeof m.contributionYears === 'number' &&
        Number.isFinite(m.contributionYears),
    )

    return {
      key: g.key,
      label: g.label,
      hint: g.hint,
      contributionYears: usable.length
        ? usable.reduce((sum, m) => sum + (m.contributionYears as number), 0)
        : null,
      status: usable.length ? ('fresh' as const) : ('missing' as const),
      freshCount: usable.length,
      total: members.length,
      members: members.map((m) => ({
        name: m.name,
        contributionYears: m.contributionYears,
        status: m.status,
      })),
    }
  }).filter((g) => g.total > 0)
}

/**
 * How a group's ring divides into helping / hurting / unmeasured.
 *
 * ─── WHY THIS REPLACED THE COMPLETENESS RING ─────────────────────────
 *
 * The first ring encoded one number — what share of the group's tests had a
 * current reading. It was honest but it wasted the ring: the reference uses
 * TWO colours in one track, and the second colour is where the meaning is.
 *
 * A single fraction cannot say whether the readings you do have are good news.
 * Splitting the same track three ways can, and every piece comes from data we
 * already hold per member:
 *
 *   green  — measured, and pulling the age DOWN (contribution < 0)
 *   amber  — measured, and pulling it UP (contribution > 0)
 *   grey   — no current reading, so the remainder of the ring stays empty
 *
 * The grey is not padding. A half-grey ring means half this group is unknown,
 * which is the one thing on the row a patient can actually act on.
 *
 * Members that are measured but exactly neutral count as helping, so the ring
 * always closes when the group is fully measured — a sliver of grey that
 * merely means "0.0 years" would read as a missing test.
 */
export function splitGroup(members: readonly { contributionYears: number | null; status: string }[]): {
  helping: number
  hurting: number
  missing: number
} {
  const total = members.length
  if (total === 0) return { helping: 0, hurting: 0, missing: 0 }

  let helping = 0
  let hurting = 0
  for (const m of members) {
    const measured =
      m.status === 'fresh' && typeof m.contributionYears === 'number' && Number.isFinite(m.contributionYears)
    if (!measured) continue
    if ((m.contributionYears as number) > 0.05) hurting += 1
    else helping += 1
  }

  return {
    helping: helping / total,
    hurting: hurting / total,
    missing: (total - helping - hurting) / total,
  }
}
