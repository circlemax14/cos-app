/**
 * COS-1041 — which medications are CURRENT, and which are history.
 *
 * Ken 2026-09-18: on Health Status, "medications by condition" listed every
 * drug from the start of his treatment — six or seven years — while he
 * currently takes two or three. He is right that it changed: COS-1009
 * (ccc91ce, 2026-09-14) deliberately removed the server-side
 * `status: 'active'` filter.
 *
 * THAT COMMIT WAS NOT WRONG AND IS NOT BEING REVERTED. Its reasoning holds:
 *
 *   "`status: 'active'` meant a patient with 59 prescriptions on record could
 *    only ever be shown 6, and a provider's Medications tab read as empty for
 *    anyone whose course had finished. 'What was I given by this doctor' and
 *    'what am I taking now' are different questions, and the screen was
 *    silently answering only the second while appearing to answer the first."
 *
 * It closed with: "Status still ships on every row, so the client separates
 * current from past rather than blending them."
 *
 * That was true of the API and false of this client. The server spreads the
 * raw FHIR resource, so `status` was on the wire all along — but
 * services/api/types.ts did not declare it and the mapper in
 * services/api/patient.ts did not read it. The separation COS-1009 assumed
 * would happen had nowhere to happen. So the fix belongs HERE, not in the
 * query: keep every prescription available, stop presenting them all as
 * current.
 *
 * FHIR MedicationRequest.status values are: active | on-hold | cancelled |
 * completed | entered-in-error | stopped | draft | unknown.
 */

/** Statuses that mean "the patient is meant to be taking this now". */
const CURRENT_STATUSES = new Set(['active', 'on-hold', 'draft']);

/**
 * Is this medication current?
 *
 * `on-hold` counts as current deliberately — a paused drug is part of the
 * present picture and a clinician needs to see it; hiding it in history reads
 * as "stopped", which is a different clinical fact.
 *
 * An ABSENT or unrecognised status is treated as PAST. The safe direction is
 * asymmetric: showing a discontinued drug as current can contribute to a
 * double-prescription, while filing a current one under history costs one tap
 * on a disclosure that says how many are there.
 */
export function isCurrentMedication(status: string | undefined | null): boolean {
  if (typeof status !== 'string') return false;
  return CURRENT_STATUSES.has(status.trim().toLowerCase());
}

/**
 * Split a list into current and past, past ordered newest-first.
 *
 * Generic over the row shape so it can be tested without importing the RN
 * types module, and so the Medications tab can reuse it later.
 */
export function splitByRecency<T extends { status?: string; authoredOn?: string | null }>(
  rows: readonly T[],
): { current: T[]; past: T[] } {
  const current: T[] = [];
  const past: T[] = [];
  for (const r of rows) (isCurrentMedication(r.status) ? current : past).push(r);
  past.sort((a, b) => {
    // Undated rows sink rather than sorting as epoch 0 among real dates.
    const ta = a.authoredOn ? Date.parse(a.authoredOn) : NaN;
    const tb = b.authoredOn ? Date.parse(b.authoredOn) : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
  return { current, past };
}

/**
 * COS-1109 — is this a finite course that has demonstrably finished?
 *
 * Ken's card led with cephalexin 500 mg: quantity 4, zero refills, authored
 * February 2025. Four capsules at four a day is a ONE DAY course, and it was
 * seven months old when he screenshotted it — yet the EHR still stamps it
 * `active`, so status alone can never demote it.
 *
 * The test is deliberately narrow: a dispenseRequest that was issued once
 * (`numberOfRepeatsAllowed === 0`) and is older than the window. A maintenance
 * drug is either represcribed (so a newer row exists and this one is stopped)
 * or carries repeats. We do NOT hide these — hiding a drug the patient is in
 * fact taking is the dangerous direction — we only stop them outranking
 * current therapy.
 *
 * Rows with no dispenseRequest at all are NOT finished courses: on a
 * reconciled home-medication list that field is simply absent.
 */
const FINISHED_COURSE_MS = 90 * 24 * 60 * 60 * 1000;

export function isFinishedCourse(
  med: { authoredOn?: string | null; dispenseRequest?: { numberOfRepeatsAllowed?: number } | null },
  now: number,
): boolean {
  const dr = med.dispenseRequest;
  if (!dr || dr.numberOfRepeatsAllowed !== 0) return false;
  if (!med.authoredOn) return false;
  const t = Date.parse(med.authoredOn);
  if (Number.isNaN(t)) return false;
  return now - t > FINISHED_COURSE_MS;
}

/**
 * Rank the CURRENT medications for display: what the patient is actually on,
 * first.
 *
 * Before this the card had no sort at all — group order and row order were both
 * the order HealthLake happened to return rows, and that search carries no
 * `_sort`. Ken's oldest record (2016) rendered first purely because it was
 * bundle index 1, and the two drugs he takes every night rendered last.
 *
 * Two keys, in order:
 *   1. finished one-off courses sink
 *   2. newest authoredOn first
 *
 * Undated rows sort after dated ones rather than as epoch 0.
 */
export function rankCurrent<
  T extends {
    authoredOn?: string | null
    dispenseRequest?: { numberOfRepeatsAllowed?: number } | null
  },
>(rows: readonly T[], now: number = Date.now()): T[] {
  return [...rows].sort((a, b) => {
    const fa = isFinishedCourse(a, now) ? 1 : 0
    const fb = isFinishedCourse(b, now) ? 1 : 0
    if (fa !== fb) return fa - fb
    const ta = a.authoredOn ? Date.parse(a.authoredOn) : NaN
    const tb = b.authoredOn ? Date.parse(b.authoredOn) : NaN
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}
