/**
 * NovoPsych biopsychosocial subdomain taxonomy (COS-430, expanded in COS-445).
 *
 * COS-430 shipped a 13-item taxonomy based on Ken's first NovoPsych diagram.
 * COS-445 (SCRUM-581) expands it to 26 items per Ken's second Venn image
 * (bio-psycho-socio-environmental, 2026-07-13), adds dedicated overlap
 * regions (Bio∩Psy, Bio∩Soc, Psy∩Soc) with cross-cutting items placed at
 * each intersection, and preserves backwards compatibility for goals that
 * already carry the older keys via LEGACY_ALIASES.
 *
 * Domain names unchanged (Biological / Psychological / Social & Spiritual) —
 * FICA screener + Care Plan v2 work stays aligned.
 *
 * Single source of truth for:
 *   - `MeasurableGoal.subdomains?: string[]` tags (services/api/types.ts)
 *   - `<SubdomainChip>` rendering (components/health-plan/SubdomainChip.tsx)
 *   - The Wellbeing map (app/Home/wellbeing-map.tsx)
 *   - `BioGoalEditorModal` subdomain picker (components/health-plan/)
 *   - The biopsychosocial prompt's tagging vocabulary (cos-backend — updated
 *     separately in a follow-up Track 2 story; until then, new goals keep
 *     getting tagged with the older 13-key vocabulary and the 14 new
 *     subdomains render as gaps in the wellbeing map)
 *
 * Backward-compat plan:
 *   - `subdomains` is optional on every goal — no goal breaks on this expansion
 *   - LEGACY_ALIASES translates old keys → new canonical keys silently at
 *     read time (see getSubdomain + knownSubdomains). Existing plans keep
 *     their coverage counts even after taxonomy rename.
 */

export type BpsDomain = 'biological' | 'psychological' | 'social'

/** Precise overlap type for items that sit at a Venn intersection. */
export type BpsOverlap = 'bio_psy' | 'bio_soc' | 'psy_soc'

export interface BpsSubdomain {
  /** Stable enum value persisted on `MeasurableGoal.subdomains[]`. */
  key: string
  /** Human label shown on chips + map. */
  label: string
  /** Primary domain — chip colour + goal-editor picker grouping use this. */
  domain: BpsDomain
  /**
   * When true, the subdomain sits at a Venn overlap. Rendered with a dashed
   * border on chips + placed between circles on the Wellbeing map.
   * Preserved for backwards compat with SubdomainChip's existing check.
   */
  crossDomain?: boolean
  /**
   * Precise overlap type — set alongside crossDomain: true so the wellbeing
   * map can place the item at the correct Venn intersection.
   */
  overlap?: BpsOverlap
}

export const BPS_SUBDOMAINS: readonly BpsSubdomain[] = [
  // ── Biological (pure) — 6 items ─────────────────────────────────────
  { key: 'genes', label: 'Genes', domain: 'biological' },
  { key: 'neurobiology', label: 'Neurobiology', domain: 'biological' },
  { key: 'sleep', label: 'Sleep', domain: 'biological' },
  { key: 'physical_health', label: 'Physical Health', domain: 'biological' },
  { key: 'metabolic_disorders', label: 'Metabolic Disorders', domain: 'biological' },
  { key: 'immune_stress_response', label: 'Immune/Stress Response', domain: 'biological' },
  // ── Biological ∩ Psychological overlap — 2 items ────────────────────
  { key: 'emotions', label: 'Emotions', domain: 'psychological', crossDomain: true, overlap: 'bio_psy' },
  { key: 'response_to_reward', label: 'Response to Reward', domain: 'psychological', crossDomain: true, overlap: 'bio_psy' },
  // ── Psychological (pure) — 5 items ──────────────────────────────────
  { key: 'attitudes_beliefs', label: 'Attitudes/Beliefs', domain: 'psychological' },
  { key: 'perceptions', label: 'Perceptions', domain: 'psychological' },
  { key: 'coping_skills', label: 'Coping Skills', domain: 'psychological' },
  { key: 'self_esteem', label: 'Self-esteem', domain: 'psychological' },
  { key: 'temperament', label: 'Temperament', domain: 'psychological' },
  // ── Biological ∩ Social overlap — 2 items ───────────────────────────
  { key: 'diet_lifestyle', label: 'Diet/Lifestyle', domain: 'biological', crossDomain: true, overlap: 'bio_soc' },
  { key: 'substance_use', label: 'Substance Use', domain: 'biological', crossDomain: true, overlap: 'bio_soc' },
  // ── Psychological ∩ Social overlap — 3 items ────────────────────────
  { key: 'interpersonal_relationships', label: 'Interpersonal Relationships', domain: 'social', crossDomain: true, overlap: 'psy_soc' },
  { key: 'trauma', label: 'Trauma', domain: 'psychological', crossDomain: true, overlap: 'psy_soc' },
  { key: 'grief', label: 'Grief', domain: 'psychological', crossDomain: true, overlap: 'psy_soc' },
  // ── Social & Spiritual (pure) — 8 items ─────────────────────────────
  { key: 'social_support', label: 'Social Support', domain: 'social' },
  { key: 'family_circumstances', label: 'Family Circumstances', domain: 'social' },
  { key: 'peer_group', label: 'Peer Group', domain: 'social' },
  { key: 'work_school', label: 'Work / School', domain: 'social' },
  { key: 'culture', label: 'Culture', domain: 'social' },
  { key: 'socioeconomic_status', label: 'Socioeconomic Status', domain: 'social' },
  { key: 'life_events', label: 'Life Events', domain: 'social' },
  { key: 'faith_spiritual', label: 'Faith / Spiritual', domain: 'social' },
] as const

export const BPS_SUBDOMAIN_KEYS: readonly string[] = BPS_SUBDOMAINS.map((s) => s.key)

const SUBDOMAIN_BY_KEY: Record<string, BpsSubdomain> = Object.fromEntries(
  BPS_SUBDOMAINS.map((s) => [s.key, s]),
)

/**
 * Renamed / merged keys from the COS-430 taxonomy — silently translated to
 * the current canonical key at read time so existing goals keep counting
 * under their new subdomain. Any goal saved with a legacy key resolves to
 * the new canonical subdomain when the app reads it back.
 */
const LEGACY_ALIASES: Record<string, string> = {
  beliefs: 'attitudes_beliefs',
  thought_patterns: 'perceptions',
  coping: 'coping_skills',
  stress_reactivity: 'immune_stress_response',
  life_stressors: 'life_events',
  relationships: 'interpersonal_relationships',
}

/** Canonicalize a subdomain key — legacy alias → current key, or unchanged. */
export function canonicalSubdomainKey(key: string): string {
  return LEGACY_ALIASES[key] ?? key
}

/**
 * Look up a subdomain by its key. Accepts either the current canonical key
 * or a legacy alias — legacy keys resolve to their current definition so
 * pre-COS-445 goals still render correctly. Returns `undefined` for unknown
 * keys so callers can skip rendering (never throw).
 */
export function getSubdomain(key: string): BpsSubdomain | undefined {
  return SUBDOMAIN_BY_KEY[canonicalSubdomainKey(key)]
}

/** Group subdomains by primary domain, in taxonomy order. Used by the goal-editor picker. */
export function subdomainsByDomain(): Record<BpsDomain, BpsSubdomain[]> {
  const out: Record<BpsDomain, BpsSubdomain[]> = {
    biological: [],
    psychological: [],
    social: [],
  }
  for (const s of BPS_SUBDOMAINS) out[s.domain].push(s)
  return out
}

/**
 * Filter an arbitrary string[] down to known canonical subdomain keys,
 * preserving order and deduping. Legacy keys are canonicalized so a goal
 * saved with `["beliefs"]` returns `["attitudes_beliefs"]`. Used when
 * reading persisted `MeasurableGoal.subdomains` so an older app never
 * crashes on a backend-added key it doesn't recognize.
 */
export function knownSubdomains(keys: readonly string[] | undefined): string[] {
  if (!keys || keys.length === 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of keys) {
    const canonical = canonicalSubdomainKey(raw)
    if (canonical in SUBDOMAIN_BY_KEY && !seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }
  return out
}
