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
