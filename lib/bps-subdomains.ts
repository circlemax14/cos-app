/**
 * NovoPsych biopsychosocial subdomain taxonomy (COS-430).
 *
 * Ken's stakeholder diagram from NovoPsych organizes each of the three
 * biopsychosocial domains (Biological / Psychological / Social) into named
 * subdomains, plus two shared cross-domain items at the Venn overlaps:
 * Stress Reactivity (Bio ↔ Psycho) and Coping (Psycho ↔ Social — modelled
 * here as a Psycho subdomain, since it appears primarily in that circle).
 *
 * Single source of truth for:
 *   - `MeasurableGoal.subdomains?: string[]` tags (services/api/types.ts)
 *   - `<SubdomainChip>` rendering (components/health-plan/SubdomainChip.tsx)
 *   - The Wellbeing map coverage heatmap (app/Home/wellbeing-map.tsx)
 *   - The biopsychosocial prompt's tagging vocabulary (cos-backend)
 *
 * Backward-compatible: `subdomains` is optional on every goal; legacy goals
 * without it just render no chips (and don't count in the coverage map).
 */

export type BpsDomain = 'biological' | 'psychological' | 'social'

export interface BpsSubdomain {
  /** Stable enum value persisted on `MeasurableGoal.subdomains[]`. */
  key: string
  /** Human label shown on chips + map. */
  label: string
  /** Primary domain — chip colour matches this. */
  domain: BpsDomain
  /**
   * When true, the subdomain sits at a Venn overlap. Rendered with a dashed
   * border on chips + placed between two circles on the Wellbeing map.
   */
  crossDomain?: boolean
}

export const BPS_SUBDOMAINS: readonly BpsSubdomain[] = [
  // Biological
  { key: 'genes', label: 'Genes', domain: 'biological' },
  { key: 'neurobiology', label: 'Neurobiology', domain: 'biological' },
  { key: 'sleep', label: 'Sleep', domain: 'biological' },
  { key: 'physical_health', label: 'Physical Health', domain: 'biological' },
  // Bio ↔ Psycho overlap
  { key: 'stress_reactivity', label: 'Stress Reactivity', domain: 'biological', crossDomain: true },
  // Psychological
  { key: 'beliefs', label: 'Beliefs', domain: 'psychological' },
  { key: 'thought_patterns', label: 'Thought Patterns', domain: 'psychological' },
  { key: 'emotions', label: 'Emotions', domain: 'psychological' },
  { key: 'coping', label: 'Coping', domain: 'psychological', crossDomain: true },
  // Social
  { key: 'relationships', label: 'Relationships', domain: 'social' },
  { key: 'social_support', label: 'Social Support', domain: 'social' },
  { key: 'life_stressors', label: 'Life Stressors', domain: 'social' },
  { key: 'socioeconomic_status', label: 'Socioeconomic Status', domain: 'social' },
] as const

export const BPS_SUBDOMAIN_KEYS: readonly string[] = BPS_SUBDOMAINS.map((s) => s.key)

const SUBDOMAIN_BY_KEY: Record<string, BpsSubdomain> = Object.fromEntries(
  BPS_SUBDOMAINS.map((s) => [s.key, s]),
)

/**
 * Look up a subdomain by its key. Returns `undefined` for unknown keys so
 * callers can skip rendering (never throw) — future backend versions may add
 * subdomains an older app doesn't recognize.
 */
export function getSubdomain(key: string): BpsSubdomain | undefined {
  return SUBDOMAIN_BY_KEY[key]
}

/** Group subdomains by domain, in taxonomy order. Used by the goal-editor picker. */
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
 * Filter an arbitrary string[] down to known subdomain keys, preserving
 * order. Used when reading persisted `MeasurableGoal.subdomains` so an older
 * app never crashes on a backend-added key it doesn't recognize.
 */
export function knownSubdomains(keys: readonly string[] | undefined): string[] {
  if (!keys || keys.length === 0) return []
  return keys.filter((k) => k in SUBDOMAIN_BY_KEY)
}
