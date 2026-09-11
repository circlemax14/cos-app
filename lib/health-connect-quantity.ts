/**
 * COS-938 — read a Health Connect quantity, in the unit iOS reports.
 *
 * ─── THE BUG THIS EXISTS FOR ─────────────────────────────────────────
 *
 * Health Connect has TWO shapes for the same physical quantity, and they are
 * easy to confuse because the docs show both:
 *
 *   a RECORD field   { value: 78.4, unit: 'kilograms' }
 *   an AGGREGATE     { inGrams: 78400, inKilograms: 78.4, ... }
 *
 * The first version of the trend readers used the AGGREGATE spelling on RECORD
 * fields — `r.weight.inKilograms`, `r.energy.inKilocalories`,
 * `r.systolic.inMillimetersOfMercury` and so on. Every one of those is
 * `undefined` on a record, so six metrics returned null for every sample:
 * blood pressure (both), active energy, blood glucose, body temperature,
 * weight and distance.
 *
 * On screen that is indistinguishable from "this patient has no data" — which
 * is precisely the state we spent days trying to diagnose. A wrong reader and
 * an empty store look identical, and only one of them is fixable by the
 * patient.
 *
 * ─── WHY IT CONVERTS RATHER THAN ASSUMING ────────────────────────────
 *
 * `unit` is not decoration. Health Connect stores whatever the writing app
 * chose, so the same field can arrive as kilograms from one app and pounds
 * from another on the same device. Reading `.value` and ignoring `.unit` would
 * be a 2.2x error in a clinical number, appearing only for patients whose
 * fitness app happens to disagree with ours.
 *
 * The targets match what services/health.ts reports on iOS, so both platforms
 * emit one metricCode in one unit and a patient switching device keeps a
 * single continuous trend.
 *
 * ─── AN UNKNOWN UNIT RETURNS NULL ────────────────────────────────────
 *
 * Not the raw number. A weight of "78" that might be kilograms or pounds is
 * worse than a gap: a gap is visibly missing, a wrong number is quietly acted
 * on. If Health Connect adds a unit we do not know, the metric goes silent
 * until someone adds the conversion.
 */

/** What the app charts, matching services/health.ts's iOS units. */
export type QuantityKind =
  | 'energy-kcal'
  | 'length-miles'
  | 'temperature-f'
  | 'pressure-mmhg'
  | 'mass-lb'
  | 'glucose-mgdl';

/**
 * Multipliers INTO the target unit. A unit absent from a table is one we do
 * not know how to convert, and is treated as unreadable rather than guessed.
 */
const CONVERSIONS: Record<QuantityKind, Record<string, number>> = {
  'energy-kcal': {
    kilocalories: 1,
    calories: 0.001,
    joules: 0.000239006,
    kilojoules: 0.239006,
  },
  'length-miles': {
    miles: 1,
    meters: 1 / 1609.344,
    kilometers: 1 / 1.609344,
    feet: 1 / 5280,
    inches: 1 / 63360,
  },
  'temperature-f': {
    // Handled specially below — temperature is an OFFSET scale, so a plain
    // multiplier would be wrong. Present so the kind validates.
    fahrenheit: 1,
    celsius: Number.NaN,
  },
  'pressure-mmhg': {
    millimetersOfMercury: 1,
  },
  'mass-lb': {
    pounds: 1,
    kilograms: 2.2046226218,
    grams: 0.0022046226,
    milligrams: 0.0000022046,
    micrograms: 0.0000000022046,
    ounces: 0.0625,
  },
  'glucose-mgdl': {
    milligramsPerDeciliter: 1,
    // The standard clinical factor for glucose specifically; it is
    // molar-mass-dependent, so it is NOT a general mmol conversion.
    millimolesPerLiter: 18.0182,
  },
};

/**
 * Read one quantity off a Health Connect RECORD field.
 *
 * Accepts a bare number too: a few record fields (percentage, rate, count) are
 * plain numbers rather than a { value, unit } pair, and having one reader
 * means a caller cannot pick the wrong one.
 */
export function readQuantity(raw: unknown, kind: QuantityKind): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (!raw || typeof raw !== 'object') return null;

  const { value, unit } = raw as { value?: unknown; unit?: unknown };
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (typeof unit !== 'string') return null;

  if (kind === 'temperature-f') {
    if (unit === 'fahrenheit') return value;
    if (unit === 'celsius') return (value * 9) / 5 + 32;
    return null;
  }

  const factor = CONVERSIONS[kind][unit];
  if (typeof factor !== 'number' || !Number.isFinite(factor)) return null;
  return value * factor;
}

/**
 * Read one quantity off an AGGREGATE result, which uses `inX` keys instead.
 *
 * Separate from readQuantity on purpose: the two shapes are the thing that was
 * confused in the first place, so giving them one function with a mode flag
 * would preserve exactly the ambiguity that caused the bug.
 */
export function readAggregate(raw: unknown, unitKey: string): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (!raw || typeof raw !== 'object') return null;
  const n = (raw as Record<string, unknown>)[unitKey];
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
