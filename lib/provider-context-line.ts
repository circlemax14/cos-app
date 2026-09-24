/**
 * COS-1114 — say why a provider is in the list.
 *
 * COS-1087 resolved every provider's specialty from the public CMS NPPES
 * registry, and COS-1090 banded each one by how recently they were seen. Both
 * landed, and both are INVISIBLE: the provider row renders a name and a
 * qualifications string, and the recency band is used only to filter and sort.
 *
 * That is why a filter that works still reads as broken. Vishal picked
 * "stable / resolved", the list changed, and nothing on any row said what
 * changed or why — so the only available reading is that the app is guessing.
 * The fix is not more filtering. It is showing the evidence the filter acted
 * on, on the row it acted on.
 *
 * Deliberately NOT a clinical claim. "Last seen Mar 2025 · 4 visits" is a
 * statement about our records, and the absence of a date is stated as an
 * absence rather than hidden or guessed at.
 */

export interface ProviderContextInput {
  /** ISO timestamp of the newest dated record linking this provider. */
  lastSeenAt?: string | null
  /** How many dated encounters we hold for them. */
  treatedCount?: number | null
  /** Whether they treated the patient or were only named on a record. */
  involvement?: 'treated' | 'mentioned' | 'none' | null
}

/** "Mar 2025". Month precision: a day implies a confidence we do not have. */
export function formatLastSeen(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

/**
 * One short line of evidence, or null when we genuinely know nothing.
 *
 * Returning null rather than a placeholder matters: a row that says
 * "No visits recorded" next to a row that says "Last seen Mar 2025" is
 * informative, but a row that says it for EVERY provider — which is what an
 * EHR export with no dates produces — is noise that buries the real ones.
 * The caller decides whether a whole-list absence is worth one message at the
 * top instead, which is what COS-1101 already does.
 */
export function providerContextLine(p: ProviderContextInput): string | null {
  const parts: string[] = []

  const seen = formatLastSeen(p.lastSeenAt)
  if (seen) parts.push(`Last seen ${seen}`)

  const n = typeof p.treatedCount === 'number' ? p.treatedCount : 0
  if (n > 0) parts.push(`${n} visit${n === 1 ? '' : 's'}`)

  /*
   * Only surfaced when there is nothing better to say. "Named on your records"
   * is the honest description of a provider we have no encounter for — an
   * anaesthetist on an operation note, a radiologist who read one scan. It
   * explains their presence without implying a relationship.
   */
  if (parts.length === 0 && p.involvement === 'mentioned') {
    return 'Named on your records'
  }

  return parts.length > 0 ? parts.join(' · ') : null
}
