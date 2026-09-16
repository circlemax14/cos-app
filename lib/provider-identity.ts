/**
 * COS-1008 — deciding whether two records describe the same clinician.
 *
 * Every tab on the provider screen filters a patient's clinical records by
 * comparing the provider's display name against the name written inside each
 * record. Those two strings disagree by design: a provider's name carries
 * credentials — "Riley Rowntree, MD" — and the participant display inside an
 * Encounter or a report does not.
 *
 * Measured on a real record before this existed: THREE of 76 reports and ONE of
 * 19 encounter participants matched their provider. Every tab looked empty, and
 * the cause was a comma.
 *
 * Lives in lib/ with no imports so it can be unit-tested — `node --test` cannot
 * resolve the `@/` alias that services/api/providers.ts uses.
 */

/**
 * Honorifics that appear BEFORE a name. Only these are stripped from the name
 * itself.
 *
 * Trailing credentials are NOT stripped by pattern, and that is deliberate:
 * "Hayley Do, PA" is a real provider in this data, and a trailing-credential
 * rule turns her surname into a credential and her name into "hayley". The
 * comma does that job correctly and unambiguously — see below.
 */
const LEADING_TITLE = /^\s*(dr|doctor|nurse|prof(essor)?|mr|mrs|ms|miss)\b\.?\s*/i;

/**
 * A name reduced to just the person.
 *
 * Everything after the first comma goes. In this data the comma is always and
 * only the credential separator — "Nurse Josephine M, RN", "Hayley Do, PA",
 * "Julie K, Technologist" — so it is a far safer signal than guessing which
 * trailing word is a qualification.
 *
 * The trade-off, stated: a name written WITHOUT a comma ("Riley Rowntree MD")
 * keeps its credential and will not match "Riley Rowntree". Every record seen
 * in this system uses the comma, and the alternative provably corrupts real
 * surnames, so this is the right way round.
 */
export function normalisePersonName(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .split(',')[0]
    .replace(LEADING_TITLE, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Letters only — no spaces, no punctuation.
 *
 * "Mary-Jane O'Brien" and "Mary Jane OBrien" are one person, and whether a
 * hyphen or a curly apostrophe survived the trip through an EHR is not
 * information about who they are.
 */
function letters(raw: string | undefined | null): string {
  return normalisePersonName(raw).replace(/\s+/g, '');
}

/**
 * True when two records plausibly describe the same clinician.
 *
 * An id match is authoritative and is checked first. The name comparison is a
 * FALLBACK for records that carry no reference at all — it must never override
 * two ids that genuinely differ, which is why the id branch returns outright
 * rather than falling through.
 */
export function sameProvider(
  a: { id?: string | null; name?: string | null },
  b: { id?: string | null; name?: string | null },
): boolean {
  if (a.id && b.id) return a.id === b.id;
  const left = letters(a.name);
  const right = letters(b.name);
  return left.length > 0 && left === right;
}
