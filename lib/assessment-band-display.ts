/**
 * COS-1196 — turn a stored band into something a patient can read.
 *
 * ─── WHAT WAS ON SCREEN ───────────────────────────────────────────────
 *
 * Vishal, on the falls-risk detail: "it is saying elevated risk 5. What is the
 * meaning of that? ... previous result, 30th September, it is saying just
 * elevated risk. Why there was no number?"
 *
 * Both complaints are the same omission. The screen rendered `band.label`
 * verbatim — the kebab-case key `elevated-risk` — and, after COS-1189, a bare
 * `5` beside it on the latest card only. Nothing said 5 OF WHAT, nothing said
 * what elevated means, and the history rows had no number at all.
 *
 * ─── THE DATA WAS ALREADY THERE ───────────────────────────────────────
 *
 * falls-12's riskBands are:
 *   { min: 0, max: 3,  label: 'low-risk',      severity: 'low' }
 *   { min: 4, max: 7,  label: 'elevated-risk', severity: 'moderate', careAction: 'home-safety-review' }
 *   { min: 8, max: 12, label: 'high-risk',     severity: 'high',     careAction: 'care-team-check-in' }
 *
 * So the ceiling IS derivable — the top band's `max` — and so is the band a
 * score sits in, and what it suggests doing. An earlier audit concluded "no max
 * score exists anywhere"; that is true of the instrument root and false of its
 * bands, which is where the scale actually lives.
 *
 * Every function here degrades to null rather than guessing, because a band's
 * `max` is optional ("+Infinity if omitted") and some instruments genuinely have
 * no ceiling. A missing scale must read as absent, never as a wrong number.
 */

export interface DisplayBand {
  min?: number
  max?: number
  label: string
  severity?: 'low' | 'moderate' | 'high'
  careAction?: string
}

/**
 * `'elevated-risk'` → `'Elevated risk'`.
 *
 * The stored labels are machine keys and were being shown raw. Deliberately
 * generic rather than a lookup table: a new instrument's bands should read
 * correctly the day they are seeded, not the day someone remembers to add them
 * here.
 */
export function humaniseBandLabel(label: string | undefined | null): string {
  const raw = String(label ?? '').trim()
  if (!raw) return ''
  const spaced = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * The highest score this instrument can produce, from the top band's `max`.
 *
 * Null when the top band is unbounded — then there is no honest "out of".
 */
export function scoreCeiling(bands: readonly DisplayBand[] | undefined): number | null {
  if (!bands || bands.length === 0) return null
  let top: number | null = null
  for (const b of bands) {
    if (typeof b.max !== 'number' || !Number.isFinite(b.max)) continue
    if (top === null || b.max > top) top = b.max
  }
  return top
}

/** The band a score falls in, by its own min/max. Null when nothing matches. */
export function bandForScore(
  bands: readonly DisplayBand[] | undefined,
  score: number | null,
): DisplayBand | null {
  if (!bands || score === null) return null
  for (const b of bands) {
    const lo = typeof b.min === 'number' ? b.min : Number.NEGATIVE_INFINITY
    const hi = typeof b.max === 'number' ? b.max : Number.POSITIVE_INFINITY
    if (score >= lo && score <= hi) return b
  }
  return null
}

/** `'4–7'` for the band's own span, so "elevated" has a number attached. */
export function bandRangeLabel(band: DisplayBand | null | undefined): string | null {
  if (!band) return null
  const lo = band.min
  const hi = band.max
  if (typeof lo === 'number' && typeof hi === 'number') return `${lo}–${hi}`
  if (typeof lo === 'number') return `${lo}+`
  if (typeof hi === 'number') return `up to ${hi}`
  return null
}

/**
 * What a careAction suggests, in the patient's words.
 *
 * `careAction` has been written to every record since the bands were seeded and
 * read by nothing on this screen — the same "stored and never surfaced" shape as
 * `alertLevel` (COS-1162) and `subscales` (COS-1189).
 *
 * An unknown key returns null rather than being shown raw: a kebab-case token is
 * worse than silence on a screen about someone's health.
 */
const CARE_ACTION_TEXT: Record<string, string> = {
  'home-safety-review': 'Worth a look around the home for trip hazards — rugs, cords, lighting, stairs.',
  'care-team-check-in': 'Worth raising with your care team so they can look at this with you.',
}

export function careActionText(careAction: string | undefined | null): string | null {
  const key = String(careAction ?? '').trim()
  return key ? (CARE_ACTION_TEXT[key] ?? null) : null
}

/**
 * Direction between two takes, as a glyph name plus words.
 *
 * ⚠️ A RISING SCORE IS NOT AUTOMATICALLY WORSE, and the direction alone must
 * never be coloured as good or bad: on falls-12 higher is more risk, on
 * wellbeing-5 higher is better. So this reports MOVEMENT only, and the SEVERITY
 * of the band it landed in is what carries the judgement.
 */
export function scoreDelta(
  current: number | null,
  previous: number | null,
): { icon: 'trending-up' | 'trending-down' | 'trending-flat'; text: string } | null {
  if (current === null || previous === null) return null
  const diff = current - previous
  if (diff === 0) return { icon: 'trending-flat', text: 'Same as last time' }
  const n = Math.abs(diff)
  return diff > 0
    ? { icon: 'trending-up', text: `Up ${n} from last time` }
    : { icon: 'trending-down', text: `Down ${n} from last time` }
}

/** Severity → a colour that means the same thing everywhere on the screen. */
export function severityColor(severity: string | undefined | null): string {
  switch (severity) {
    case 'high':
      return '#DC2626'
    case 'moderate':
      return '#D97706'
    case 'low':
      return '#16A34A'
    default:
      // Unknown severity is NEUTRAL, never green — absence of a rating must not
      // read as reassurance.
      return '#64748B'
  }
}
