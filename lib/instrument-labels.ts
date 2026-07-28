/**
 * Wave 2 — canonical patient-facing labels for assessment instruments.
 *
 * Consolidates the informal `FRIENDLY_NAME` map that used to live locally
 * in `components/health-plan/SelfAssessmentTrends.tsx`, plus adds warmer
 * copy for the four Wave 1 wellbeing-library additions
 * (FICA / HOPE / DU Resilience / Ohio Leisure) and the previously-untagged
 * instruments. The backend `InstrumentSummary.name` remains the clinical
 * name — e.g. "PHQ-9", "FICA Spiritual History" — but for surfaces the
 * patient sees (assessment stepper header, catalog cards, trends), we want
 * softer copy that leads with what the check-in is _about_.
 *
 * Keying: canonical `instrumentId` (`'phq-2'`, `'wellbeing-5'`, etc.) —
 * the stable enum in `services/api/assessments.ts`.
 *
 * Fallback: `getWarmerInstrumentLabel(id, fallback)` returns `fallback`
 * (typically the backend-supplied `name`) when no mapping exists, so
 * unknown/agency-custom instruments render their raw BE name rather
 * than the id.
 *
 * v1 mapping pending Ken clinical review (2026-07-28 walk-and-talk).
 */

export const WARMER_INSTRUMENT_LABEL: Readonly<Record<string, string>> = {
  // ── Wave 1 spiritual + wellbeing additions ──────────────────
  'fica':                   'Faith & Meaning check-in',
  'hope':                   'Faith & Meaning: HOPE reflection',
  'du-resilience-13':       'Resilience self-check',
  'ohio-leisure-interest':  'Interests & activities check-in',

  // ── Mood, anxiety, stress ───────────────────────────────────
  'phq-2':                  'Mood: quick check',
  'phq-9':                  'Mood: full check',
  'gad-7':                  'Anxiety check-in',
  'pss-4':                  'Stress check-in',
  'wellbeing':              'Wellbeing rating',
  'wellbeing-5':            'Wellbeing check-in',

  // ── Sleep, pain, physical ───────────────────────────────────
  'sleep':                  'Sleep',
  'sleep-4':                'Sleep check-in',
  'pain':                   'Pain',
  'pain-4':                 'Pain check-in',
  'physical-function-4':    'Physical function check-in',
  'falls-12':               'Falls-risk check-in',
  'nutrition-5':            'Nutrition check-in',

  // ── Function / daily living ─────────────────────────────────
  'adl':                    'Daily living basics',
  'iadl':                   'Independent living basics',
  'lifestyle':              'Lifestyle check-in',
  'goals':                  'Your goals',

  // ── Cognition ───────────────────────────────────────────────
  'cognition-8':            'Thinking & memory check-in',
  'mini-cog':               'Quick cognition check',
  'moca':                   'Cognition assessment',
  'moca-xpresso':           'Quick cognition assessment',

  // ── Substance use, social ──────────────────────────────────
  'alcohol-3':              'Alcohol check-in',
  'loneliness-3':           'Connection check-in',

  // ── Comprehensive intake ────────────────────────────────────
  'full-intake':            'Full health intake',
}

/**
 * Look up the patient-facing label for an instrument. Falls back to the
 * `fallback` string (typically `InstrumentSummary.name` from the BE) when
 * no mapping exists — so agency-custom instruments and any new BE-added
 * instrument that hasn't been mapped yet still render a real name.
 */
export function getWarmerInstrumentLabel(
  instrumentId: string | undefined,
  fallback: string,
): string {
  if (!instrumentId) return fallback
  return WARMER_INSTRUMENT_LABEL[instrumentId] ?? fallback
}
