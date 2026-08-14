/**
 * Grouping self-assessments by biopsychosocial domain — Ken 2026-08-14:
 * "the self-assessments by biopsychosocial".
 *
 * NO NEW TAXONOMY. Every one of the 23 system instruments already carries
 * `subdomains` on its definition row (Wave 2 / COS-430, backfilled by
 * scripts/backfill-instrument-subdomains.ts), and lib/bps-subdomains.ts
 * already maps each subdomain to a domain. The only thing missing was the
 * join, which cos-backend now does on the assessments list. This module just
 * decides which pile each card lands in.
 *
 * ─── THE ONE REAL DECISION ───────────────────────────────────────────
 *
 * Instruments span domains. `hope` carries faith_spiritual, attitudes_beliefs,
 * coping_skills AND social_support; `pain-4` is physical_health plus
 * immune_stress_response.
 *
 * A card appears ONCE, under the domain of its FIRST subdomain.
 *
 * The alternative — showing it in every domain it touches — was rejected: the
 * same card appearing three times reads as three assessments, and a patient
 * counting "how many check-ins do I have?" would get the wrong answer. First
 * subdomain is the instrument author's own ordering, so it is a stated
 * primary rather than something inferred here.
 *
 * Instruments with no subdomains fall into a trailing "Other" group rather
 * than vanishing — a check-in the patient completed must never disappear
 * because a definition row is missing a field.
 */

// NO IMPORTS, deliberately. This module is exercised by `node --test`, which
// resolves neither the '@/' path alias nor an extensionless relative TS
// import — and TypeScript rejects the '.ts' extension that would fix the
// latter. Rather than duplicate the subdomain taxonomy to get around that, the
// caller injects the lookup. today-timeline.ts and reminder-recurrence.ts are
// import-free for the same reason.
export type BpsDomain = 'biological' | 'psychological' | 'social'

/** Resolves a subdomain key to its domain. Supplied by lib/bps-subdomains. */
export type DomainResolver = (subdomainKey: string) => BpsDomain | null

export interface GroupableAssessment {
  instrumentId: string
  subdomains?: string[]
}

export interface AssessmentGroup<T> {
  /** null for the trailing "Other" bucket. */
  domain: BpsDomain | null
  label: string
  records: T[]
}

/** Display order and copy. "Social & Spiritual" matches the wellbeing map. */
const DOMAIN_ORDER: readonly { domain: BpsDomain; label: string }[] = [
  { domain: 'biological', label: 'Biological' },
  { domain: 'psychological', label: 'Psychological' },
  { domain: 'social', label: 'Social & Spiritual' },
]

/** The domain a record belongs to, or null when it cannot be placed. */
export function domainForAssessment(
  record: GroupableAssessment | null | undefined,
  domainOf: DomainResolver,
): BpsDomain | null {
  const first = record?.subdomains?.find((k) => typeof k === 'string' && k.trim() !== '')
  if (!first) return null
  return domainOf(first)
}

/**
 * Group records into domain buckets, preserving the caller's order within
 * each and dropping buckets that would be empty.
 *
 * Returns a SINGLE unlabelled group when nothing can be placed. That is the
 * pre-backend state — before the subdomain join deploys, no record carries
 * subdomains — and it has to render exactly as the flat carousel did, or the
 * client half of this change breaks the screen on its own.
 */
export function groupAssessmentsByDomain<T extends GroupableAssessment>(
  records: readonly T[],
  domainOf: DomainResolver,
): AssessmentGroup<T>[] {
  const buckets = new Map<BpsDomain | null, T[]>()
  for (const r of records) {
    const d = domainForAssessment(r, domainOf)
    const list = buckets.get(d)
    if (list) list.push(r)
    else buckets.set(d, [r])
  }

  // Nothing placeable ⇒ one unlabelled group, i.e. today's behaviour.
  if (buckets.size === 1 && buckets.has(null)) {
    return [{ domain: null, label: '', records: [...records] }]
  }

  const out: AssessmentGroup<T>[] = []
  for (const { domain, label } of DOMAIN_ORDER) {
    const list = buckets.get(domain)
    if (list && list.length > 0) out.push({ domain, label, records: list })
  }
  const other = buckets.get(null)
  if (other && other.length > 0) out.push({ domain: null, label: 'Other', records: other })
  return out
}
