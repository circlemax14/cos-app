import { normalisePersonName } from './provider-identity.ts';

/**
 * COS-1009 — which of these people actually took part in your care.
 *
 * Vishal: "some people are like actually the pharmacist who actually provided
 * the medications, or some receptionist. We need to filter this provider
 * source."
 *
 * An EHR export names everyone who touched a record, not everyone who treated
 * the patient. On a real account of 59 rows that includes two pharmacists (both
 * filed under PCP), a technologist, and a row whose name is the literal string
 * "Provider". For a patient trying to remember who looked after them — the
 * stated audience for this screen — those are noise between them and their
 * surgeon.
 *
 * WHAT THIS DOES NOT DO: delete anything. These rows stay in the data and stay
 * reachable; they are moved out of the primary list. Hiding a medication
 * dispenser is a presentation choice, and a patient who wants the full list must
 * still be able to get it.
 */

/** Roles that support care without being someone you were treated BY. */
const SUPPORT_ROLE =
  /\b(pharm\.?d|r\.?ph|pharmacist|pharmacy|technologist|technician|tech|receptionist|registrar|scheduler|scheduling|billing|coder|transcription(ist)?|clerk|admin(istrator)?|secretary)\b/i;

/**
 * Names that are not names.
 *
 * "Provider" is a real row on a real account — the EHR's placeholder when it has
 * no person to name. It cannot be called, cannot be asked about your care, and
 * two of them are indistinguishable from each other.
 */
const PLACEHOLDER_NAME = /^\s*(provider|unknown( provider)?|unassigned|not (recorded|specified)|n\/?a|none)\s*$/i;

/**
 * A "name" that is nothing but a qualification.
 *
 * provider-identity deliberately stopped stripping trailing credentials, since
 * "Do" and "Pa" are real surnames — which means a row named only "MD" now
 * survives normalisation as though it were a person. Whole-string match only,
 * so a two-token name like "Hayley Do" can never be caught by it.
 */
const CREDENTIAL_ONLY =
  /^\s*(m\.?d|d\.?o|r\.?n|n\.?p|p\.?a(-c)?|pt|pta|ot|dc|rrt|arnp|pharm\.?d|r\.?ph|dds|dmd)\s*$/i;

export interface RelevanceInput {
  name?: string | null;
  /** The credential/role text, when it is carried separately from the name. */
  specialty?: string | null;
  qualifications?: string | null;
  subCategory?: string | null;
}

export type ProviderRelevance = 'care' | 'support' | 'unnamed';

/**
 * Classify a provider row.
 *
 * `care`    — a clinician the patient was seen by. Show in the main list.
 * `support` — pharmacy, admin, records. Real, but not who treated you.
 * `unnamed` — no usable identity at all.
 *
 * Deliberately decided from the ROLE TEXT rather than from whether the row has
 * clinical records attached. A surgeon the patient saw once has thin records and
 * must not disappear; a pharmacist can be attached to dozens of prescriptions
 * and still not be someone you were treated by. Record count answers "how much
 * is here", never "who is this".
 */
export function classifyProvider(p: RelevanceInput): ProviderRelevance {
  const name = (p.name ?? '').trim();
  if (!name || PLACEHOLDER_NAME.test(name) || CREDENTIAL_ONLY.test(name)) return 'unnamed';
  // A name that reduces to nothing was only ever a credential — "MD", "RN".
  if (normalisePersonName(name).length === 0) return 'unnamed';

  const haystack = [name, p.specialty, p.qualifications, p.subCategory]
    .filter(Boolean)
    .join(' ');
  if (SUPPORT_ROLE.test(haystack)) return 'support';

  return 'care';
}

/** Convenience for the common case: is this someone to show first? */
export function isCareProvider(p: RelevanceInput): boolean {
  return classifyProvider(p) === 'care';
}

/**
 * Collapse rows that describe the same clinician.
 *
 * The EHR emits a row per source system, so the same person arrives twice —
 * measured: 25 of 59 rows on a real account are duplicates of another row, with
 * identical names and credentials.
 *
 * The merge key is the NORMALISED NAME PLUS the credential, and both halves
 * matter. A previous attempt keyed on name alone and collapsed sixteen distinct
 * doctors, because the placeholder name "Provider" repeated across unrelated
 * people (COS-971). Requiring the credential to match too, and refusing to merge
 * anything classified `unnamed`, makes that impossible.
 *
 * Of a merged pair we keep the row with more records, so the survivor is the one
 * that can actually show the patient something.
 */
export function dedupeProviders<T extends RelevanceInput & { recordCount?: number }>(
  rows: T[],
): T[] {
  const bestByKey = new Map<string, T>();
  const unmergeable: T[] = [];

  for (const row of rows) {
    if (classifyProvider(row) === 'unnamed') {
      // Never merged: two unnamed rows are not evidence of one person.
      unmergeable.push(row);
      continue;
    }
    const credential = ((row.name ?? '').split(',')[1] ?? '').trim().toLowerCase();
    const key = `${normalisePersonName(row.name)}|${credential}`;
    const held = bestByKey.get(key);
    if (!held || (row.recordCount ?? 0) > (held.recordCount ?? 0)) {
      bestByKey.set(key, row);
    }
  }

  return [...bestByKey.values(), ...unmergeable];
}
