/**
 * Wellbeing map layout — dot positions DERIVED from the taxonomy (#5 Phase 1).
 *
 * WHY THIS EXISTS
 * The map used to carry a hand-written `SUBDOMAIN_POS` table of 26 (dx, dy)
 * pairs. Nothing tied those coordinates to `BPS_SUBDOMAINS`, so they drifted:
 * an audit on 2026-08-07 measured **12 of the 26 dots rendering in the wrong
 * region** — eight outside all three circles entirely, including
 * `faith_spiritual`, which sat outside the circle named for it. `trauma`,
 * `grief` and `substance_use` were drawn in Social-only despite being declared
 * overlap items.
 *
 * The positions were never a clinical judgement: `BPS_SUBDOMAINS` already
 * declares `domain` for every item and `overlap` for the seven cross-cutting
 * ones (COS-445, Ken's second Venn). The picture simply disagreed with the
 * data. So rather than hand-correcting 12 coordinates — which drifts again the
 * next time the taxonomy moves — this derives every position from the
 * declaration, and a test asserts the result.
 *
 * Misplacement is now structurally impossible rather than merely fixed once.
 *
 * DETERMINISTIC. No randomness anywhere: same taxonomy in, same layout out, on
 * every device and every render. `Math.random()` here would mean a patient's
 * map rearranged itself between visits.
 */

/**
 * NO RUNTIME IMPORTS. The taxonomy is passed IN rather than imported, which
 * keeps this module a pure function of its input: trivially testable, and it
 * cannot go stale against a taxonomy it never reads directly.
 */
export type BpsDomain = 'biological' | 'psychological' | 'social'
export type BpsOverlap = 'bio_psy' | 'bio_soc' | 'psy_soc'

/** Structural — accepts BpsSubdomain without importing it. */
export interface PlaceableSubdomain {
  key: string
  domain: BpsDomain
  overlap?: BpsOverlap
}

/** Venn geometry. Mirrors the values the map's <Svg viewBox> is built from. */
export const VIEWBOX = 350
export const CIRCLE_R = 95
export const CIRCLES: Record<BpsDomain, { x: number; y: number }> = {
  biological: { x: 125, y: 130 },
  psychological: { x: 225, y: 130 },
  social: { x: 175, y: 215 },
}

/**
 * Minimum distance between two dot centres. The map draws an invisible r=12
 * hit circle behind each dot, so anything closer overlaps and the
 * later-rendered dot swallows the other's taps — the Grief/Socioeconomic bug.
 */
export const MIN_SEPARATION = 24

/**
 * Keep dots off the stroke itself. A dot centred exactly on the boundary reads
 * as ambiguous — "is that inside or not?" — which is the whole failure this
 * module fixes, just at 1px instead of 40.
 */
const EDGE_MARGIN = 13

/**
 * The wellbeing score bubble sits at the tri-centre. Nothing may be placed
 * under it or it becomes unreadable and untappable.
 */
const HUB = { x: 175, y: 165, r: 22 }

const OVERLAP_PAIR: Record<BpsOverlap, readonly [BpsDomain, BpsDomain]> = {
  bio_psy: ['biological', 'psychological'],
  bio_soc: ['biological', 'social'],
  psy_soc: ['psychological', 'social'],
}

const ALL_DOMAINS: readonly BpsDomain[] = ['biological', 'psychological', 'social']

export interface DotPosition {
  key: string
  x: number
  y: number
  /** The region this dot was placed in — used by tests and by the a11y label. */
  region: BpsDomain | BpsOverlap
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

function insideCircle(x: number, y: number, d: BpsDomain, shrinkBy = 0): boolean {
  const c = CIRCLES[d]
  return dist(x, y, c.x, c.y) <= CIRCLE_R - shrinkBy
}

function outsideCircle(x: number, y: number, d: BpsDomain, growBy = 0): boolean {
  const c = CIRCLES[d]
  return dist(x, y, c.x, c.y) >= CIRCLE_R + growBy
}

/**
 * Is (x, y) in the region a subdomain with this declaration belongs to?
 *
 * A PURE domain item must be inside its own circle and outside both others —
 * "biological" means biological, not biological-and-also-social. An OVERLAP
 * item must be inside exactly its two and outside the third.
 *
 * Exported because the contract test asserts against the same predicate the
 * layout is built from; a bug in the predicate would otherwise be invisible.
 */
export function isInRegion(
  x: number,
  y: number,
  domain: BpsDomain,
  overlap: BpsOverlap | undefined,
  margin = EDGE_MARGIN,
): boolean {
  if (dist(x, y, HUB.x, HUB.y) < HUB.r) return false
  if (overlap) {
    const pair = OVERLAP_PAIR[overlap]
    const third = ALL_DOMAINS.find((d) => !pair.includes(d))
    if (!third) return false
    return (
      insideCircle(x, y, pair[0], margin) &&
      insideCircle(x, y, pair[1], margin) &&
      outsideCircle(x, y, third, margin)
    )
  }
  return (
    insideCircle(x, y, domain, margin) &&
    ALL_DOMAINS.filter((d) => d !== domain).every((d) => outsideCircle(x, y, d, margin))
  )
}

/**
 * Candidate points for a region, on a fixed lattice.
 *
 * A lattice rather than an analytic solution because the pure-domain regions
 * are crescents (circle minus two other circles) with no closed form worth
 * writing. Step 2 gives sub-pixel-ish granularity at this viewBox while
 * keeping the scan ~30k points — evaluated once at module load.
 */
function candidates(domain: BpsDomain, overlap: BpsOverlap | undefined): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let y = 0; y <= VIEWBOX; y += 2) {
    for (let x = 0; x <= VIEWBOX; x += 2) {
      if (isInRegion(x, y, domain, overlap)) out.push([x, y])
    }
  }
  return out
}

/**
 * Greedy farthest-point placement: seed at the point deepest inside the
 * region, then repeatedly take the candidate maximising distance to everything
 * already placed.
 *
 * This spreads items across the whole region instead of clumping them, which
 * matters because a crescent is long and thin — a naive centroid-outward fill
 * would stack the last few items on top of each other and re-create the
 * overlapping-tap-target bug.
 *
 * Ties are broken by lattice order, so the result is fully deterministic.
 */
function placeInRegion(
  keys: readonly string[],
  domain: BpsDomain,
  overlap: BpsOverlap | undefined,
): DotPosition[] {
  const pts = candidates(domain, overlap)
  const region = overlap ?? domain
  if (pts.length === 0) return []

  const placed: Array<[number, number]> = []
  const centre = overlap
    ? {
        x: (CIRCLES[OVERLAP_PAIR[overlap][0]].x + CIRCLES[OVERLAP_PAIR[overlap][1]].x) / 2,
        y: (CIRCLES[OVERLAP_PAIR[overlap][0]].y + CIRCLES[OVERLAP_PAIR[overlap][1]].y) / 2,
      }
    : CIRCLES[domain]

  for (let i = 0; i < keys.length; i++) {
    let best: [number, number] | null = null
    let bestScore = -Infinity
    for (const p of pts) {
      // First item: the point deepest into the region, measured as distance
      // from the far edge — i.e. closest to the region's natural centre.
      const score =
        placed.length === 0
          ? -dist(p[0], p[1], centre.x, centre.y)
          : Math.min(...placed.map((q) => dist(p[0], p[1], q[0], q[1])))
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
    if (!best) break
    placed.push(best)
  }

  return keys.map((key, i) => ({
    key,
    x: placed[i]?.[0] ?? Math.round(centre.x),
    y: placed[i]?.[1] ?? Math.round(centre.y),
    region,
  }))
}

/**
 * Every subdomain's dot position, derived.
 *
 * Grouped by region first so each region's items are spread within it
 * independently — a global placement would let a Body item wander into the
 * space a Mind item needs.
 */
export function computeDotPositions(
  subdomains: readonly PlaceableSubdomain[],
): DotPosition[] {
  const groups = new Map<string, { domain: BpsDomain; overlap?: BpsOverlap; keys: string[] }>()
  for (const s of subdomains) {
    const region = s.overlap ?? s.domain
    const g = groups.get(region) ?? { domain: s.domain, overlap: s.overlap, keys: [] }
    g.keys.push(s.key)
    groups.set(region, g)
  }
  const out: DotPosition[] = []
  for (const g of groups.values()) out.push(...placeInRegion(g.keys, g.domain, g.overlap))
  return out
}

/** Index a computed layout by subdomain key, for O(1) lookup while rendering. */
export function indexByKey(positions: readonly DotPosition[]): Record<string, DotPosition> {
  return Object.fromEntries(positions.map((p) => [p.key, p]))
}
