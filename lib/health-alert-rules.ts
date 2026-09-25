/**
 * COS-1112 — Health Alerts. Ken's crisis thresholds, as pure rules.
 *
 * ─── WHY THIS IS NOT vitals-red-flag-rules.ts ────────────────────────
 *
 * Ken, 2026-09-24: "Kind of like what you did with the dots and the vitals.
 * It's very similar to that, but this is much more about CRISIS. That's more
 * about monitoring."
 *
 * He means it literally, and the numbers prove it. vitals-red-flag-rules calls
 * 140/90 RED because that is stage-2 hypertension and warrants a call to your
 * doctor. Ken's document calls 140/90 MODERATE and reserves critical for
 * >180/120 — a hypertensive crisis, an emergency-room number. Merging the two
 * scales would either flood this indicator with amber on ordinary readings or
 * silently raise the monitoring thresholds. Both are worse than two modules.
 *
 * So: separate thresholds, separate vocabulary, same data sources.
 *
 * ─── THE FOURTH STATE ────────────────────────────────────────────────
 *
 * Ken specified three lights. There must be a fourth state, and it is the most
 * important one: UNKNOWN.
 *
 * Green here means "measured, and below the moderate threshold". It must never
 * mean "we have no data", because on a crisis indicator that is a false
 * reassurance — the screen would tell a patient with no readings at all that
 * they are fine. Every evaluator returns null for an absent or unusable value,
 * and the roll-up counts what was actually measured.
 *
 * ─── UNITS ARE PART OF THE CONTRACT ──────────────────────────────────
 *
 * Every evaluator names its unit in the parameter name. This is not
 * decoration: COS-1111 shipped a glucose flag that read mmol/L as mg/dL and
 * reported hyperglycaemia as hypoglycaemia, on production, for months. A
 * threshold module is exactly where that class of bug becomes dangerous, so
 * the unit is in the signature where a caller has to look at it.
 *
 * ─── SOURCES ─────────────────────────────────────────────────────────
 *
 * Every verdict carries `source`. Ken: "when they press on the i it gives you
 * the references, so people see that you're not just pulling a rabbit out of a
 * hat." The citation travels with the verdict rather than living in a separate
 * table that can drift out of step with the numbers.
 */

export type AlertLevel = 'none' | 'moderate' | 'critical'

export interface AlertVerdict {
  level: AlertLevel
  /** Patient-facing metric name. */
  metric: string
  /** Plain-language statement of what was measured and why it is flagged. */
  reason: string
  /** Where the threshold comes from, shown behind the info affordance. */
  source: string
}

/** A metric we deliberately do not evaluate, and why. Rendered honestly. */
export interface UnmonitoredMetric {
  metric: string
  why: string
}

const ACC_AHA = 'ACC/AHA 2017 hypertension guideline'
const ADA = 'ADA Standards of Care, glycaemic thresholds'
const WHO_SPO2 = 'WHO/BTS oxygen saturation targets'
const RCP_NEWS2 = 'RCP NEWS2 respiratory rate scoring'
const SEPSIS_TEMP = 'Sepsis-3 / NICE fever and hyperthermia thresholds'
const PHQ9 = 'PHQ-9: 0–4/5–9/10–14/15–19/20–27 (Kroenke 2001)'
const GAD7 = 'GAD-7: 0–4/5–9/10–14/15–21 (Spitzer 2006)'
const VAS = '0–10 visual analogue pain scale, standard clinical bands'

/**
 * Blood pressure.
 *
 * Ken's bands: moderate = stage 2, 140/90 through 179/109. Critical =
 * hypertensive crisis, >180 systolic OR >120 diastolic — either alone, which
 * is why this is not a single combined comparison.
 *
 * ⚠️ His document also lists "OR Severe Hypotension:" with NO number — the
 * table is truncated mid-cell. A low-BP crisis threshold is therefore NOT
 * implemented. Guessing one on a crisis indicator is not acceptable; see
 * PENDING_THRESHOLDS below.
 */
export function evaluateBloodPressure(
  systolicMmHg: number | null | undefined,
  diastolicMmHg: number | null | undefined,
): AlertVerdict | null {
  if (typeof systolicMmHg !== 'number' || !Number.isFinite(systolicMmHg)) return null
  if (typeof diastolicMmHg !== 'number' || !Number.isFinite(diastolicMmHg)) return null
  const metric = 'Blood pressure'
  const reading = `${Math.round(systolicMmHg)}/${Math.round(diastolicMmHg)} mmHg`
  if (systolicMmHg > 180 || diastolicMmHg > 120) {
    return { level: 'critical', metric, reason: `${reading} — hypertensive crisis range`, source: ACC_AHA }
  }
  if (systolicMmHg >= 140 || diastolicMmHg >= 90) {
    return { level: 'moderate', metric, reason: `${reading} — stage 2 hypertension range`, source: ACC_AHA }
  }
  return { level: 'none', metric, reason: `${reading}`, source: ACC_AHA }
}

/**
 * Blood glucose, mg/dL. The unit is in the name deliberately — see the header.
 *
 * Ken's bands: moderate 140–250 (random/post-meal) or fasting 126–250.
 * Critical low <55 ("risk of coma"). His critical-high cell is truncated to
 * ">30", which cannot be right as written; the standard companion to a <55 low
 * is >300, and that is what is used, flagged below for his confirmation.
 */
export function evaluateGlucoseMgDl(mgDl: number | null | undefined): AlertVerdict | null {
  if (typeof mgDl !== 'number' || !Number.isFinite(mgDl)) return null
  const metric = 'Blood glucose'
  const reading = `${Math.round(mgDl)} mg/dL`
  if (mgDl < 55) {
    return { level: 'critical', metric, reason: `${reading} — severe hypoglycaemia`, source: ADA }
  }
  if (mgDl > 300) {
    return { level: 'critical', metric, reason: `${reading} — severe hyperglycaemia`, source: ADA }
  }
  if (mgDl >= 140) {
    return { level: 'moderate', metric, reason: `${reading} — above target`, source: ADA }
  }
  if (mgDl < 70) {
    return { level: 'moderate', metric, reason: `${reading} — below target`, source: ADA }
  }
  return { level: 'none', metric, reason: reading, source: ADA }
}

/** Oxygen saturation, percent. Critical <90, moderate 90–94. */
export function evaluateSpo2Percent(percent: number | null | undefined): AlertVerdict | null {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return null
  // A 0..1 fraction here means someone forgot the scale — reject rather than
  // report 0.97% as a critical desaturation. COS-1111's lesson, applied.
  if (percent <= 1) return null
  const metric = 'Oxygen saturation'
  const reading = `${Math.round(percent)}%`
  if (percent < 90) {
    return { level: 'critical', metric, reason: `${reading} — severe hypoxaemia`, source: WHO_SPO2 }
  }
  if (percent <= 94) {
    return { level: 'moderate', metric, reason: `${reading} — mild to moderate hypoxaemia`, source: WHO_SPO2 }
  }
  return { level: 'none', metric, reason: reading, source: WHO_SPO2 }
}

/** Respiration rate, breaths per minute. Critical >25 or <10; moderate 21–24. */
export function evaluateRespirationRate(bpm: number | null | undefined): AlertVerdict | null {
  if (typeof bpm !== 'number' || !Number.isFinite(bpm)) return null
  const metric = 'Respiration rate'
  const reading = `${Math.round(bpm)} breaths/min`
  if (bpm > 25 || bpm < 10) {
    return { level: 'critical', metric, reason: `${reading} — respiratory distress range`, source: RCP_NEWS2 }
  }
  if (bpm >= 21) {
    return { level: 'moderate', metric, reason: `${reading} — tachypnoea`, source: RCP_NEWS2 }
  }
  return { level: 'none', metric, reason: reading, source: RCP_NEWS2 }
}

/**
 * Body temperature, CELSIUS.
 *
 * Ken's table gives Fahrenheit with Celsius in parentheses: moderate
 * 100.4–103.9°F (38–39.9°C), critical >104°F (>40°C). We store Celsius
 * (VITAL_SPECS body-temperature, and HealthKit's own default), so Celsius is
 * what this takes. Converting at the call site is how COS-1111 happened.
 */
export function evaluateTemperatureCelsius(celsius: number | null | undefined): AlertVerdict | null {
  if (typeof celsius !== 'number' || !Number.isFinite(celsius)) return null
  const metric = 'Body temperature'
  const reading = `${celsius.toFixed(1)}°C`
  if (celsius > 40) {
    return { level: 'critical', metric, reason: `${reading} — severe hyperthermia`, source: SEPSIS_TEMP }
  }
  if (celsius >= 38) {
    return { level: 'moderate', metric, reason: `${reading} — fever`, source: SEPSIS_TEMP }
  }
  return { level: 'none', metric, reason: reading, source: SEPSIS_TEMP }
}

/**
 * PHQ-9 total, 0–27. Moderate 10–14, critical 20–27.
 *
 * ⚠️ Ken's document adds: "particularly if item 9 (suicidal ideation) is
 * flagged". Item 9 is NOT read here, because ADR-0002 mandated an item-9
 * crisis cap that was never built — see project notes. A separate crisis
 * pathway component already exists (CrisisSupportCard). Wiring item 9 into
 * this indicator is deliberately left out of v1 rather than half-done: a
 * suicidality signal routed through a traffic light is worse than no signal.
 */
export function evaluatePhq9(total: number | null | undefined): AlertVerdict | null {
  if (typeof total !== 'number' || !Number.isFinite(total)) return null
  const metric = 'Depression (PHQ-9)'
  const reading = `score ${Math.round(total)} of 27`
  if (total >= 20) {
    return { level: 'critical', metric, reason: `${reading} — severe`, source: PHQ9 }
  }
  if (total >= 10) {
    return { level: 'moderate', metric, reason: `${reading} — moderate`, source: PHQ9 }
  }
  return { level: 'none', metric, reason: reading, source: PHQ9 }
}

/** GAD-7 total, 0–21. Moderate 10–14, critical 15–21. */
export function evaluateGad7(total: number | null | undefined): AlertVerdict | null {
  if (typeof total !== 'number' || !Number.isFinite(total)) return null
  const metric = 'Anxiety (GAD-7)'
  const reading = `score ${Math.round(total)} of 21`
  if (total >= 15) {
    return { level: 'critical', metric, reason: `${reading} — severe`, source: GAD7 }
  }
  if (total >= 10) {
    return { level: 'moderate', metric, reason: `${reading} — moderate`, source: GAD7 }
  }
  return { level: 'none', metric, reason: reading, source: GAD7 }
}

/** Self-reported pain, 0–10. Moderate 4–6, critical 7–10. */
export function evaluatePainScore(score: number | null | undefined): AlertVerdict | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  if (score < 0 || score > 10) return null
  const metric = 'Pain'
  const reading = `${Math.round(score)} of 10`
  if (score >= 7) {
    return { level: 'critical', metric, reason: `${reading} — disabling`, source: VAS }
  }
  if (score >= 4) {
    return { level: 'moderate', metric, reason: `${reading} — interfering with daily tasks`, source: VAS }
  }
  return { level: 'none', metric, reason: reading, source: VAS }
}

/**
 * What this indicator does NOT watch, and why. Rendered to the patient.
 *
 * A crisis light that silently covers seven of Ken's twenty-odd metrics, while
 * looking like it covers all of them, is a worse product than one that says
 * what it watches. This list is the honest half of the feature.
 */
export const UNMONITORED: readonly UnmonitoredMetric[] = [
  { metric: 'Lab panels (potassium, sodium, troponin, INR and 13 others)', why: 'not yet extracted as typed values from your records' },
  { metric: 'Cognition (MMSE / MoCA)', why: 'not collected — MoCA needs a licence and an administration screen' },
  { metric: 'Fall frequency', why: 'we screen for falls once a year, not as a running count' },
  { metric: 'Activities of daily living', why: 'measured by questionnaire, not continuously' },
]

/**
 * Thresholds Ken's document does not pin down. Deliberately NOT guessed.
 *
 * Both cells are truncated mid-sentence in the source PDF. On a crisis
 * indicator an invented number is worse than an absent one, so these stay out
 * of the rules until he confirms them.
 */
export const PENDING_THRESHOLDS: readonly string[] = [
  'Severe hypotension — the BP table reads "OR Severe Hypotension:" with no value.',
  'Severe hyperglycaemia — the glucose cell reads ">30" and is cut off; >300 mg/dL is used pending confirmation.',
  'Severe hypothermia — the temperature table ends "OR Severe …" with the value missing.',
  'The critical fever threshold is written ">104°F WITH confusion or seizures". We can read the temperature; we cannot observe confusion or seizures, so temperature alone decides here.',
]

/**
 * Every threshold source, for Ken's "i". Derived by hand from the constants
 * above rather than collected at runtime, because the list must be complete
 * even for metrics this patient has no reading for — "what do you check
 * against" is a different question from "what did you check today".
 */
export const SOURCES: readonly string[] = [
  ACC_AHA,
  ADA,
  WHO_SPO2,
  RCP_NEWS2,
  SEPSIS_TEMP,
  PHQ9,
  GAD7,
  VAS,
]

const ORDER: Record<AlertLevel, number> = { none: 0, moderate: 1, critical: 2 }

export interface AlertRollup {
  /** Worst level across everything measured, or null when nothing was. */
  level: AlertLevel | null
  /** Every verdict above `none`, worst first. */
  firing: AlertVerdict[]
  /** Verdicts that came back `none` — measured and in range. */
  clear: AlertVerdict[]
  /** How many metrics produced a reading at all. */
  measuredCount: number
}

/**
 * Reduce a set of verdicts to one light.
 *
 * Nulls are dropped, never treated as green — see THE FOURTH STATE above. A
 * roll-up over zero measured metrics returns level null, and the caller must
 * render that as "not enough data", not as reassurance.
 */
export function rollUpAlerts(verdicts: readonly (AlertVerdict | null)[]): AlertRollup {
  const measured = verdicts.filter((v): v is AlertVerdict => v !== null)
  const firing = measured
    .filter((v) => v.level !== 'none')
    .sort((a, b) => ORDER[b.level] - ORDER[a.level])
  const clear = measured.filter((v) => v.level === 'none')
  const level = measured.length === 0
    ? null
    : firing.length === 0
      ? 'none'
      : firing[0].level
  return { level, firing, clear, measuredCount: measured.length }
}

/** Ken's colours. Red is the only one that flashes. */
export const ALERT_COLOR: Record<AlertLevel, string> = {
  none: '#0F7A4A',
  moderate: '#B45309',
  critical: '#C02828',
}

/** Unknown is grey — visibly not a reassurance. */
export const ALERT_COLOR_UNKNOWN = '#6B7280'

export function alertColor(level: AlertLevel | null): string {
  return level === null ? ALERT_COLOR_UNKNOWN : ALERT_COLOR[level]
}

/** Only critical flashes. Ken: "with green it's not flashing, with yellow it's
 * not flashing, but with red it's flashing." */
export function alertShouldFlash(level: AlertLevel | null): boolean {
  return level === 'critical'
}

export function alertWord(level: AlertLevel | null): string {
  if (level === null) return 'Not enough data'
  if (level === 'critical') return 'Needs attention now'
  if (level === 'moderate') return 'Worth checking'
  return 'Nothing flagged'
}
