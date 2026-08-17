/**
 * Is a lab value physically possible? — NOT "is it normal".
 *
 * ─── READ THIS BEFORE USING ANY NUMBER IN HERE ───────────────────────
 *
 * Source: AHRQ HCUP, "LOINC Codes for Laboratory Data in the Enhanced
 * Administrative Database" (Oct 2010), the table headed RANGE CHECKS FOR
 * LABORATORY DATA. Ken sent it on 2026-08-16 alongside the LOINC guide.
 *
 * It is tempting to read that table as reference ranges and render it as
 * "normal range" next to a patient's result. THAT WOULD BE A CLINICAL ERROR
 * AND IT WOULD BE OURS. These are data-validity bounds — the range outside
 * which a value in an administrative dataset is presumed to be a transcription
 * fault rather than a measurement. They are nowhere near clinical normals:
 *
 *     Glucose    absolute 10 – 2,500 mg/dL      normal fasting is 70 – 100
 *     Potassium  absolute 1 – 9 mEq/L           normal is 3.5 – 5.0; 9 is lethal
 *     Sodium     absolute 100 – 200 mEq/L       normal is 135 – 145
 *
 * A patient shown "Glucose 400 — within range 10–2,500" has been actively
 * misled by us about a result that needs same-week attention. So nothing in
 * this file is ever rendered as a range, and the module deliberately exposes
 * no function that returns one.
 *
 * ─── WHAT IT IS ACTUALLY FOR ─────────────────────────────────────────
 *
 * Catching values that cannot be real. That matters here specifically because
 * of `report-*` metrics: those come from OCR of lab PDFs a patient uploaded
 * (hooks/use-report-trends.ts), and OCR misreads decimal points and column
 * boundaries. A misplaced decimal turns 9.5 into 95, and a merged column turns
 * haemoglobin into a four-digit number. Today every one of those is charted as
 * a real result, and one bad point rescales the whole trend line so the
 * genuine readings flatten into noise.
 *
 * HCUP gives two bounds per analyte and we use the LOOSER one:
 *
 *   - ABSOLUTE — outside this the value cannot be a measurement at all.
 *   - RELATIVE — a tighter band HCUP uses for its own analyses.
 *
 * Absolute, because the cost of the two mistakes is not symmetric. Suppressing
 * a real extreme value hides something clinically urgent from a patient who is
 * genuinely very unwell; charting a garbage value makes one trend look wrong.
 * The first is far worse, so this rejects only the physically impossible and
 * lets every survivable-but-alarming value through untouched.
 *
 * ─── HOW IT MUST BE USED ─────────────────────────────────────────────
 *
 * Flag, never delete. A patient's own uploaded result must not vanish because
 * we doubted it — they may be looking at the paper copy while using the app.
 * `isImplausible` is a hint to mark a point as unverified and keep it out of
 * the axis-scaling maths, not a licence to drop it.
 *
 * Unknown analyte or unknown units => NOT implausible. Silence is the correct
 * answer when we have no bound to judge against; guessing one would reinvent
 * exactly the error this file exists to avoid.
 *
 * Import-free by design: `node --test` in this repo cannot resolve the `@/`
 * alias, so this module takes plain values and returns plain values.
 */

/** The unit each bound below is expressed in. A value in any other unit is not judged. */
export interface PlausibilityBound {
  /** LOINC codes this bound applies to, from the HCUP table. */
  readonly codes: readonly string[]
  /** Lowercase name fragments, for OCR-derived `report-*` metrics with no code. */
  readonly names: readonly string[]
  /** Units the bound is stated in, lowercased and punctuation-stripped. */
  readonly units: readonly string[]
  /** HCUP absolute lower bound; null where HCUP states n/a. */
  readonly min: number | null
  /** HCUP absolute upper bound; null where HCUP states n/a. */
  readonly max: number | null
}

/**
 * HCUP's ABSOLUTE bounds, transcribed verbatim. Every entry is from that one
 * table — nothing here is inferred, and nothing has been tightened. Where HCUP
 * wrote "n/a" the bound is null, meaning unbounded on that side.
 */
export const HCUP_ABSOLUTE_BOUNDS: readonly PlausibilityBound[] = [
  { codes: ['1920-8'], names: ['ast', 'aspartate amino'], units: ['ul'], min: null, max: 20000 },
  { codes: ['1751-7'], names: ['albumin'], units: ['gdl'], min: 0.5, max: 12 },
  { codes: ['6768-6', '1783-0'], names: ['alkaline phosphatase', 'alp'], units: ['ul'], min: null, max: 5000 },
  { codes: ['1798-8'], names: ['amylase'], units: ['ul'], min: null, max: 20000 },
  { codes: ['1975-2'], names: ['bilirubin'], units: ['mgdl'], min: null, max: 80 },
  { codes: ['3094-0'], names: ['bun', 'urea nitrogen'], units: ['mgdl'], min: null, max: 500 },
  { codes: ['17861-6'], names: ['calcium'], units: ['mgdl'], min: 5, max: 20 },
  { codes: ['2157-6'], names: ['creatine kinase', 'cpk'], units: ['ul'], min: null, max: 50000 },
  { codes: ['13969-1'], names: ['ck mb', 'creatine kinase mb'], units: ['ngml'], min: null, max: 5000 },
  { codes: ['2160-0'], names: ['creatinine'], units: ['mgdl'], min: null, max: 50 },
  { codes: ['2345-7', '1558-6', '2339-0'], names: ['glucose'], units: ['mgdl'], min: 10, max: 2500 },
  { codes: ['2532-0'], names: ['ldh', 'lactate dehydrogenase'], units: ['ul'], min: null, max: 10000 },
  { codes: ['2823-3', '6298-4'], names: ['potassium'], units: ['meql', 'mmoll'], min: 1, max: 9 },
  { codes: ['2951-2', '2947-0'], names: ['sodium'], units: ['meql', 'mmoll'], min: 100, max: 200 },
  { codes: ['10839-9', '42757-5'], names: ['troponin'], units: ['ngml', 'ugl'], min: null, max: 50 },
  { codes: ['2708-6'], names: ['o2 saturation', 'oxygen saturation'], units: ['%', 'percent'], min: 30, max: 100 },
  { codes: ['2019-8'], names: ['pco2'], units: ['mmhg'], min: 10, max: 100 },
  { codes: ['2744-1'], names: ['ph'], units: ['ph', ''], min: 6.7, max: 7.9 },
  { codes: ['2703-7'], names: ['po2'], units: ['mmhg'], min: 20, max: 1000 },
  { codes: ['1925-7'], names: ['base excess'], units: ['meql', 'mmoll'], min: -50, max: 50 },
  { codes: ['3150-0'], names: ['fio2', 'inhaled oxygen'], units: ['%', 'percent'], min: 20, max: 100 },
  { codes: ['718-7', '30352-9'], names: ['hemoglobin', 'haemoglobin', 'hgb'], units: ['gdl'], min: 1, max: 25 },
  { codes: ['6301-6'], names: ['inr'], units: ['', 'ratio'], min: 0.5, max: 20 },
  { codes: ['14979-9'], names: ['ptt', 'aptt', 'partial thromboplastin'], units: ['sec', 's'], min: 10, max: 150 },
  { codes: ['5902-2'], names: ['prothrombin'], units: ['sec', 's'], min: 5, max: 200 },
  { codes: ['777-3', '26515-7'], names: ['platelet'], units: ['cellsul', 'ul'], min: null, max: 2000000 },
  { codes: ['6690-2', '26464-8'], names: ['wbc', 'white blood', 'leukocyte'], units: ['cellsul', 'ul'], min: null, max: 500000 },
]

/** Lowercase and strip punctuation, so "mg/dL", "mg / dl" and "MGDL" all match. */
function canon(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9%]+/g, '')
}

/** The bound for a metric, or null when we have nothing to judge it against. */
export function boundFor(
  metricCode: string | null | undefined,
  metricName: string | null | undefined,
): PlausibilityBound | null {
  const code = String(metricCode ?? '').trim()
  if (code) {
    for (const b of HCUP_ABSOLUTE_BOUNDS) if (b.codes.includes(code)) return b
  }
  const name = ` ${String(metricName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  if (name.trim() === '') return null
  for (const b of HCUP_ABSOLUTE_BOUNDS) {
    for (const frag of b.names) if (name.includes(` ${frag} `) || name.includes(`${frag} `)) return b
  }
  return null
}

/**
 * True only when the value cannot be a real measurement of this analyte.
 *
 * Returns FALSE — not implausible — whenever we cannot be sure: unknown
 * analyte, unknown or mismatched units, or a non-finite value. Being unsure is
 * not evidence of a fault, and a false accusation against a patient's real
 * result is the more damaging error.
 */
export function isImplausible(
  value: number | null | undefined,
  metricCode: string | null | undefined,
  metricName: string | null | undefined,
  unit: string | null | undefined,
): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false

  const bound = boundFor(metricCode, metricName)
  if (!bound) return false

  // Units must match a unit the bound is stated in. A potassium in mmol/L is
  // judged; a potassium reported as a percentage of something is not, because
  // the number means something else entirely and 1–9 would be nonsense for it.
  const u = canon(unit)
  if (!bound.units.some((allowed) => canon(allowed) === u)) return false

  if (bound.min !== null && value < bound.min) return true
  if (bound.max !== null && value > bound.max) return true
  return false
}
