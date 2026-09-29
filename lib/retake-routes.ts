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
  if (instrumentKey === 'full-intake') return '/Home/patient-intake?source=retake-request'
  const q = encodeURIComponent(instrumentKey)
  return `/Home/assessment-stepper?instrumentId=${q}&source=retake-request`
}
