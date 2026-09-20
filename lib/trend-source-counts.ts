/**
 * COS-1072 — how many measures each source contributes, derived ONCE.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────
 *
 * Home said "11 things we track". The Health Trends screen said 106. Same
 * component, same words, same patient, different number — because each screen
 * fed `buildTrendSources` whatever it happened to have in hand:
 *
 *   Home:          { clinic: 0, checkins: 0, devices: healthKitTrends.length }
 *   Health Trends: { clinic: deduped, checkins: distinct instruments,
 *                    devices: deduped against clinic }
 *
 * Home's zeroes carried a comment saying the clinic bucket "is empty on every
 * stage today". That stopped being true — Ken has ten lab reports — and a
 * hard-coded zero does not notice when the world changes. Meanwhile the device
 * count was raw, so it also counted metrics the clinic already covers.
 *
 * Sharing the COMPONENT was not enough. COS-1045 moved the labels and colours
 * here so two screens could not describe the same data two ways; the counts
 * stayed behind and did exactly that. This is the other half of that fix.
 *
 * ─── THE DEDUP RULES ARE THE POINT ───────────────────────────────────
 *
 * They are not incidental: they are what makes the number mean something.
 *
 *  - CLINIC: backend trends (FHIR Observations) plus report-derived trends,
 *    with report trends contributing only metrics the backend does not already
 *    cover. A lab panel that arrives both ways is one thing tracked, not two.
 *  - DEVICES: HealthKit metrics MINUS anything the clinic already tracks. If
 *    your clinic measures your heart rate and so does your watch, that is one
 *    measure with two sources, and counting it twice tells the patient
 *    something false about where their records come from.
 *  - CHECK-INS: DISTINCT INSTRUMENTS, not submissions. Someone who takes PHQ-9
 *    weekly for a year has taken one instrument, not fifty-two.
 *
 * Counting METRICS rather than READINGS matters for the same reason: a step
 * counter emits a point a day and would otherwise dwarf an entire lab panel.
 */

/** The minimum shape this needs. Both screens' trend types satisfy it. */
export interface TrendLike {
  metricCode: string;
  metricName: string;
}

export interface TrendSourceInputs {
  /** Backend-computed trends from FHIR Observations. */
  backend: readonly TrendLike[];
  /** Report-derived trends, pivoted client-side from the Reports tab. */
  reports: readonly TrendLike[];
  /** HealthKit trends, before any time filter. */
  healthKit: readonly TrendLike[];
  /** One entry per assessment submission; instruments are de-duplicated here. */
  assessments: readonly { instrumentId: string }[];
}

export interface TrendSourceCounts {
  clinic: number;
  checkins: number;
  devices: number;
}

const lower = (v: string | undefined): string => (v ?? '').toLowerCase();

/**
 * Clinic trends: backend wins on a metricCode OR metricName collision, because
 * it is the higher-fidelity source. Report-derived trends fill the gap when a
 * result never made it into Observation form.
 */
export function clinicTrendsFrom(
  backend: readonly TrendLike[],
  reports: readonly TrendLike[],
): TrendLike[] {
  const codes = new Set(backend.map((t) => lower(t.metricCode)));
  const names = new Set(backend.map((t) => lower(t.metricName)));
  const extras = reports.filter(
    (t) => !codes.has(lower(t.metricCode)) && !names.has(lower(t.metricName)),
  );
  return [...backend, ...extras];
}

/** The three counts, derived the same way for every caller. */
export function computeTrendSourceCounts(input: TrendSourceInputs): TrendSourceCounts {
  const clinic = clinicTrendsFrom(input.backend, input.reports);
  const clinicCodes = new Set(clinic.map((t) => t.metricCode));

  return {
    clinic: clinic.length,
    // Distinct instruments, never submissions.
    checkins: new Set(input.assessments.map((a) => a.instrumentId)).size,
    // A metric the clinic already tracks is not a second thing tracked.
    devices: input.healthKit.filter((t) => !clinicCodes.has(t.metricCode)).length,
  };
}
