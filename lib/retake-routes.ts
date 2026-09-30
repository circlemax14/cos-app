/**
 * Where a retake request sends the patient.
 *
 * COS-1166 — extracted from RetakeRequestInboxCard.tsx so the push router
 * can reach it. `lib/notification-routing.ts` is pure and must not import a
 * .tsx component module; this is the same split as lib/lab-flagging.ts.
 *
 * The card still re-exports it, so every existing import and test keeps
 * working and there is exactly one definition of the destination.
 */

/**
 * Deep-link target for a pending retake.
 *
 * Full-intake routes to the intake wizard; every other instrument routes to
 * the shared assessment stepper (the same deep links AssessmentCatalogContent
 * and BpsWellbeingScoreCard already use).
 */
export function retakeStartRoute(instrumentKey: string): string {
  /*
   * COS-1167 — `retake=1` is the param the wizard actually reads.
   *
   * Vishal, 2026-09-29, testing a full-intake retake: "when I click on the
   * start now then it is taking me to a screen where it is showing that
   * intake complete and there is a button back to health status".
   *
   * This route sent only `?source=retake-request`, and NOTHING in the app
   * reads that param — it is decorative. IntakeWizardScreen gates the retake
   * on `params.retake === '1'`, so without it the wizard loaded, saw a
   * COMPLETE intake on the server and rendered IntakeCompleteView. A dead
   * end, and a guaranteed one: a retake is only ever requested from someone
   * who has already completed the intake, so this branch could never work
   * for the only people who reach it.
   *
   * Pre-existing — this is the same builder the card's "Start now" has used
   * since COS-482. COS-1166 made it reachable from a push and put a gate in
   * front of it, which is why it surfaced now.
   *
   * `source` is kept: it is harmless, and it records where the retake came
   * from if anything ever wants to read it.
   */
  if (instrumentKey === 'full-intake') return '/Home/patient-intake?retake=1&source=retake-request'

  /*
   * COS-1169 — a request can name a SCOPE rather than one instrument.
   *
   * Vishal, 2026-09-29: domains, "all assessments", and the health-status
   * intake kept separate from them — "full intake doesn't mean that they have
   * to take the full intake of the health status".
   *
   * No new screen. The catalog already groups by domain and already accepts
   * `?focus=bio|psy|soc` to open on a bucket (CHUNK 69, added for the
   * wellbeing-card tap), and that grouping already obeys the COS-851 single
   * oracle — the instrument's stored `domain`, with `spiritual` rolled into
   * `social`. Reusing it means the patient sees the same three groups here as
   * everywhere else in the app.
   */
  if (instrumentKey === 'all-assessments') {
    return '/Home/assessments-catalog?source=retake-request'
  }
  const focus = DOMAIN_FOCUS[instrumentKey]
  if (focus) {
    return `/Home/assessments-catalog?focus=${focus}&source=retake-request`
  }

  const q = encodeURIComponent(instrumentKey)
  return `/Home/assessment-stepper?instrumentId=${q}&source=retake-request`
}

/**
 * Scope key → the catalog's existing focus token.
 *
 * Only the three canonical domains appear. `spiritual` is deliberately absent:
 * it rolls up to `social` on every surface, so a `domain:spiritual` key is not
 * something the dashboard can produce.
 */
const DOMAIN_FOCUS: Record<string, 'bio' | 'psy' | 'soc' | undefined> = {
  'domain:biological': 'bio',
  'domain:psychological': 'psy',
  'domain:social': 'soc',
}
