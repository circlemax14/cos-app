/**
 * The 12 wellbeing areas (#5 Phase 1).
 *
 * A patient-facing grouping over the 26 NovoPsych subdomains. The subdomains
 * are NOT replaced — goal tagging, scoring, the care-team view and the map's
 * dots all keep the full taxonomy. This is a rendering layer: 26 items is more
 * than a checklist can ask someone to read, 12 is not.
 *
 * WHAT IS DECLARED HERE vs WHAT IS DERIVED
 *
 *   Declared (a product decision, Ken confirms): which subdomains fold into
 *   which area, and what the area is called in patient language.
 *
 *   Derived (never written down twice): which instruments belong to an area.
 *   The backend seeds already tag every instrument with the subdomains it
 *   covers (cos-backend/src/data/system-instruments.ts). Copying that list
 *   here would create a second source of truth that silently drifts the first
 *   time an instrument's tags change — the exact failure mode that left 12 of
 *   26 map dots in the wrong region. So `instrumentsForArea` INVERTS the
 *   catalog at runtime instead.
 *
 * FIVE SUBDOMAINS DELIBERATELY GET NO AREA
 * `work_school`, `culture`, `life_events`, `family_circumstances` and
 * `socioeconomic_status` attach to areas as context rather than becoming rows.
 * They are circumstances, not things a patient can be weak in, and listing
 * someone's socioeconomic status as an unchecked gap grades them rather than
 * helping them. They keep their dots on the map; they just never show a
 * "Not yet" beside their name.
 */

/**
 * NO RUNTIME IMPORTS — same reasoning as wellbeing-map-layout.ts. The
 * taxonomy is validated against this module by its test, not imported by it.
 */
export type BpsDomain = 'biological' | 'psychological' | 'social'

/** Patient-facing domain grouping. Headers on the checklist, never navigation. */
export type AreaGroup = 'body' | 'mind' | 'life'

export const AREA_GROUP_LABEL: Record<AreaGroup, string> = {
  body: 'Body',
  mind: 'Mind',
  life: 'Life',
}

/** The BPS domain each patient-facing group corresponds to. */
export const AREA_GROUP_DOMAIN: Record<AreaGroup, BpsDomain> = {
  body: 'biological',
  mind: 'psychological',
  life: 'social',
}

export interface WellbeingArea {
  id: string
  /** Patient language. Not the clinical term. */
  label: string
  group: AreaGroup
  /** Subdomains folded into this area. The declared half. */
  subdomains: readonly string[]
  /**
   * One sentence answering "why are you asking me this?", shown at the top of
   * the detail sheet. Written for a 70-year-old: no jargon, no clinical
   * claims, and never implying a diagnosis.
   */
  whyItMatters: string
}

export const WELLBEING_AREAS: readonly WellbeingArea[] = [
  {
    id: 'sleep',
    label: 'Sleep',
    group: 'body',
    subdomains: ['sleep'],
    whyItMatters:
      'Poor sleep makes pain, mood and memory harder to manage. It is one of the few things that improves all three at once.',
  },
  {
    id: 'getting-around',
    label: 'Getting around & daily tasks',
    group: 'body',
    subdomains: ['physical_health'],
    whyItMatters:
      'How easily you move through your day tells your care team more about your independence than almost anything else.',
  },
  {
    id: 'pain',
    label: 'Pain',
    group: 'body',
    subdomains: ['physical_health', 'immune_stress_response'],
    whyItMatters:
      'Pain that goes unmentioned tends to get worked around rather than treated. Telling us about it gives your team something to work with.',
  },
  {
    id: 'nutrition',
    label: 'Eating & nutrition',
    group: 'body',
    subdomains: ['diet_lifestyle', 'metabolic_disorders'],
    whyItMatters:
      'What you eat affects your energy, your weight and how your medications work.',
  },
  {
    id: 'memory-thinking',
    label: 'Memory & thinking',
    group: 'body',
    subdomains: ['neurobiology', 'perceptions', 'genes'],
    whyItMatters:
      'Small changes in memory or concentration are worth knowing about early, when there is most that can be done.',
  },
  {
    id: 'mood',
    label: 'Mood',
    group: 'mind',
    subdomains: ['emotions', 'self_esteem', 'response_to_reward'],
    whyItMatters:
      'Low mood is common and treatable, and it changes how everything else on this list feels.',
  },
  {
    id: 'worry-stress',
    label: 'Worry & stress',
    group: 'mind',
    subdomains: ['immune_stress_response'],
    whyItMatters:
      'Ongoing worry affects sleep, appetite and blood pressure, so it is worth tracking alongside them.',
  },
  {
    id: 'coping',
    label: 'Coping & resilience',
    group: 'mind',
    subdomains: ['coping_skills', 'temperament', 'attitudes_beliefs'],
    whyItMatters:
      'What already works for you is the most useful thing your care team can build on.',
  },
  {
    id: 'difficult-experiences',
    label: 'Difficult experiences',
    group: 'mind',
    subdomains: ['trauma', 'grief'],
    whyItMatters:
      'Loss and difficult events shape health for years afterwards. You choose how much to share.',
  },
  {
    id: 'connection',
    label: 'Connection & loneliness',
    group: 'life',
    subdomains: ['social_support', 'interpersonal_relationships', 'peer_group'],
    whyItMatters:
      'Regular contact with other people affects health as much as many medical measures do.',
  },
  {
    id: 'substances',
    label: 'Alcohol & other substances',
    group: 'life',
    subdomains: ['substance_use'],
    whyItMatters:
      'Alcohol interacts with a great many medications. Knowing the real picture keeps your prescriptions safe.',
  },
  {
    id: 'faith-meaning',
    label: 'Faith & meaning',
    group: 'life',
    subdomains: ['faith_spiritual'],
    whyItMatters:
      'What gives your life meaning shapes the care you want — especially the decisions that matter most.',
  },
] as const

export const AREA_BY_ID: Record<string, WellbeingArea> = Object.fromEntries(
  WELLBEING_AREAS.map((a) => [a.id, a]),
)

/**
 * Subdomains that intentionally belong to no area. Exported so a test can
 * assert this set is EXACTLY the difference — otherwise a subdomain added to
 * the taxonomy later would silently vanish from the checklist with nobody
 * noticing.
 */
export const CONTEXT_ONLY_SUBDOMAINS: readonly string[] = [
  'work_school',
  'culture',
  'life_events',
  'family_circumstances',
  'socioeconomic_status',
]

/** Every subdomain claimed by some area. */
export const AREA_MAPPED_SUBDOMAINS: readonly string[] = Array.from(
  new Set(WELLBEING_AREAS.flatMap((a) => a.subdomains)),
)

/** Areas in render order, grouped. */
export function areasByGroup(group: AreaGroup): WellbeingArea[] {
  return WELLBEING_AREAS.filter((a) => a.group === group)
}

/** Minimal shape this module needs from a catalog entry. Structural on purpose
 *  so it accepts the API type without importing it and creating a cycle. */
export interface InstrumentLike {
  id: string
  subdomains?: readonly string[] | null
}

/**
 * DERIVED, never declared: the instruments that assess this area.
 *
 * An instrument belongs to an area when it tags ANY of that area's subdomains.
 * Intersection rather than exact match because instruments are broad —
 * `gad-7` tags `immune_stress_response`, which "Worry & stress" and "Pain"
 * both fold in, and both should legitimately offer it.
 *
 * Returns [] rather than throwing on a missing or untagged catalog: an empty
 * instrument list renders as "no questionnaire yet for this area", which is a
 * true statement, whereas a crash on the wellbeing screen is not a reasonable
 * response to a stale cache.
 */
export function instrumentsForArea(
  area: WellbeingArea,
  catalog: readonly InstrumentLike[] | null | undefined,
): string[] {
  if (!catalog || catalog.length === 0) return []
  const wanted = new Set(area.subdomains)
  return catalog
    .filter((i) => (i.subdomains ?? []).some((s) => wanted.has(s)))
    .map((i) => i.id)
}

/** Coverage state for one area, computed from the subdomains the patient has covered. */
export type AreaCoverage = 'covered' | 'not-yet'

/**
 * An area counts as covered when ANY of its subdomains is, not all of them.
 *
 * Deliberate: "Memory & thinking" folds in three subdomains but is served by a
 * single instrument, so requiring all three would leave it permanently
 * unchecked no matter what the patient did — a checklist item that cannot be
 * completed is worse than no checklist item.
 */
export function areaCoverage(
  area: WellbeingArea,
  coveredSubdomains: ReadonlySet<string>,
): AreaCoverage {
  return area.subdomains.some((s) => coveredSubdomains.has(s)) ? 'covered' : 'not-yet'
}

/** `{covered, total}` for a group — the "4 of 5" on the header and the ring arc. */
export function groupCoverage(
  group: AreaGroup,
  coveredSubdomains: ReadonlySet<string>,
): { covered: number; total: number } {
  const areas = areasByGroup(group)
  return {
    covered: areas.filter((a) => areaCoverage(a, coveredSubdomains) === 'covered').length,
    total: areas.length,
  }
}

/**
 * The single highest-value area to offer next — the "Start here" CTA.
 *
 * Order: the group with the WEAKEST coverage first (proportionally), then the
 * first uncovered area within it. Proportional rather than absolute so a group
 * with 3 areas is not permanently outranked by one with 5.
 *
 * Returns null when everything is covered, which the caller renders as a
 * congratulation rather than an empty button.
 */
export function pickStartHere(coveredSubdomains: ReadonlySet<string>): WellbeingArea | null {
  const groups: AreaGroup[] = ['body', 'mind', 'life']
  const ranked = groups
    .map((g) => ({ g, ...groupCoverage(g, coveredSubdomains) }))
    .filter((r) => r.covered < r.total)
    .sort((a, b) => a.covered / a.total - b.covered / b.total)
  for (const r of ranked) {
    const next = areasByGroup(r.g).find(
      (a) => areaCoverage(a, coveredSubdomains) === 'not-yet',
    )
    if (next) return next
  }
  return null
}
