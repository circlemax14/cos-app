/**
 * hooks/use-score-catalog.ts — ADR-0003 Phase 1 (Home Redesign)
 *
 * Aggregator that adapts the shipped wellbeing derivation
 * (hooks/use-wellbeing-derivation.ts + lib/wellbeing-score.ts) into the
 * card-shaped rows the redesigned Home renders. The v1 wellbeing
 * derivation is *authoritative* — this hook must not re-implement or
 * re-weight any of it. Every value below is a lossless projection of
 * `WellbeingDerivation`.
 *
 * WHY A SEPARATE HOOK (not a component prop-shape):
 *   1. ScoreCardGrid, WellbeingMapPreview, and future consumers (Circle
 *      digest, notification banner) all need the same normalized row
 *      shape. A hook centralizes the projection so a formula-table
 *      edit in lib/wellbeing-score.ts propagates to every surface in
 *      one place.
 *   2. Placeholder mode (isHomeV2PlaceholdersEnabled) is a gate we
 *      apply *once* here — every downstream consumer sees real or shim
 *      data through the exact same shape, so QA drift is impossible.
 *
 * ZERO NEW BE CALLS: reuses useWellbeingDerivation()'s existing query
 * cache keys. React Query dedupes on cache key, so mounting this
 * anywhere on the Home surface still incurs the same round-trip
 * budget as the BPS screen.
 */

import React from 'react'

import {
  DOMAIN_LABEL,
  DOMAIN_ORDER,
  bpsToSection,
  type BpsDomain,
  type WellbeingDerivation,
} from '@/lib/wellbeing-score'
import { useWellbeingDerivation } from '@/hooks/use-wellbeing-derivation'
import { isHomeV2PlaceholdersEnabled } from '@/hooks/use-home-v2-flag'
import type { ScoreBandName } from '@/constants/design-system'

// -------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------

/**
 * Deep-link targets emitted per row. Kept as string routes (not a
 * router.push closure) so the row is serializable, snapshot-testable,
 * and safe to hand to future non-router consumers (Circle digest, push
 * payload). expo-router accepts these directly.
 */
export interface ScoreRowLinks {
  /** Drill into the domain's section on the BPS plan surface. */
  detail: string
  /** Open the full wellbeing map at the domain's slot. */
  map: string
}

/**
 * One row of the score catalog — the shape ScoreCard consumes.
 * Fields marked optional are undefined when there is no signal (empty
 * assessments, cold-mount, single-record patient); consumers MUST
 * render an empty-state affordance rather than defaulting to 0.
 */
export interface ScoreRow {
  /** Stable BPS domain key (matches lib/wellbeing-score BpsDomain). */
  domain: BpsDomain
  /** Human-facing pill label, canonical from DOMAIN_LABEL. */
  title: string
  /** Integer 0-100, or undefined if the domain has no contributor. */
  score: number | undefined
  /** WCAG-AA band name from ScoreBands. Undefined when score is. */
  band: ScoreBandName | undefined
  /**
   * Composite delta over the derivation's 7d comparison window.
   * Positive = improved, negative = declined. Undefined until the
   * derivation has both endpoints for enough instruments (see
   * deriveWellbeing's TREND_MIN_COHORT_SIZE).
   */
  deltaLast7Days: number | undefined
  /**
   * Sparse 7-day series for the sparkline. v1 derivation only carries
   * two endpoints (current + ≥7d prior), so the series has at most 2
   * points; the sparkline is defensive about length. When only one
   * point exists we return a single-item array so the sparkline can
   * render a "flat" bar rather than showing nothing.
   */
  series7Day: number[]
  /** Deep-link routes for the card's accessibility actions. */
  links: ScoreRowLinks
}

export interface ScoreCatalog {
  /** Composite integer 0-100 (mirrors WellbeingDerivation.composite). */
  composite: number | undefined
  /** Band for the composite (same threshold table as per-domain). */
  compositeBand: ScoreBandName | undefined
  /** Per-domain rows in canonical DOMAIN_ORDER. */
  rows: ScoreRow[]
  /** True while the underlying derivation is cold-loading. */
  isLoading: boolean
  /** True when the patient has no assessments backing any row. */
  isEmpty: boolean
}

// -------------------------------------------------------------------
// Band mapping — kept LOCAL and DATA-ONLY so ScoreBands owns the color
// tokens and this file owns only the threshold policy. When Ken tweaks
// the cutoffs, we edit this table (one place) and every ScoreCard,
// composite header, and future digest row re-bands together.
// -------------------------------------------------------------------

/**
 * Thresholds chosen to match the direction-normalized subscore table
 * in lib/wellbeing-score.ts (high=100 / med=60 / low=20). A composite
 * that rounds into each bucket therefore reads as "mostly-high",
 * "mostly-med", "mostly-low", or "at-risk":
 *   score >= 80 → optimal      (all-high or high+med lean)
 *   score >= 60 → developing   (predominantly medium band)
 *   score >= 40 → foundational (mix of med and low)
 *   score <  40 → initial      (predominantly low band, needs focus)
 * The `>=` boundaries mean a score of exactly 40 is 'foundational',
 * exactly 60 is 'developing', exactly 80 is 'optimal' — matches Ken's
 * "round up on the boundary" preference from the 07-22 dogfood.
 */
export function scoreToBand(score: number | undefined): ScoreBandName | undefined {
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined
  if (score >= 80) return 'optimal'
  if (score >= 60) return 'developing'
  if (score >= 40) return 'foundational'
  return 'initial'
}

// -------------------------------------------------------------------
// Placeholder catalog (dev/QA only, gated by
// EXPO_PUBLIC_HOME_V2_PLACEHOLDERS_ENABLED). Deliberately deterministic
// — no Math.random — so screenshot diffs stay stable across renders.
// -------------------------------------------------------------------

const PLACEHOLDER_SERIES: Record<BpsDomain, number[]> = {
  bio: [58, 62, 61, 65, 68, 72, 74],
  mind: [70, 68, 66, 65, 63, 61, 60],
  social: [42, 44, 45, 45, 48, 50, 52],
}

const PLACEHOLDER_SCORES: Record<BpsDomain, number> = {
  bio: 74,
  mind: 60,
  social: 52,
}

const PLACEHOLDER_DELTAS: Record<BpsDomain, number> = {
  bio: 6,
  mind: -8,
  social: 3,
}

function placeholderCatalog(): ScoreCatalog {
  const rows: ScoreRow[] = DOMAIN_ORDER.map((domain) => {
    const score = PLACEHOLDER_SCORES[domain]
    return {
      domain,
      title: DOMAIN_LABEL[domain],
      score,
      band: scoreToBand(score),
      deltaLast7Days: PLACEHOLDER_DELTAS[domain],
      series7Day: PLACEHOLDER_SERIES[domain],
      links: buildRowLinks(domain),
    }
  })
  const composite = Math.round(
    rows.reduce((acc, r) => acc + (r.score ?? 0), 0) / DOMAIN_ORDER.length,
  )
  return {
    composite,
    compositeBand: scoreToBand(composite),
    rows,
    isLoading: false,
    isEmpty: false,
  }
}

// -------------------------------------------------------------------
// Real projection from WellbeingDerivation → ScoreRow[]
// -------------------------------------------------------------------

/**
 * expo-router route strings. Kept together so a route rename touches
 * exactly one place. `bpsToSection()` converts BpsDomain → the section
 * key the BPS screen scrolls to.
 */
function buildRowLinks(domain: BpsDomain): ScoreRowLinks {
  const section = bpsToSection(domain) ?? 'biological'
  return {
    detail: `/health-plan/bps?section=${section}`,
    map: '/Home/wellbeing-map',
  }
}

/**
 * Build the sparse 7-day series from the derivation's endpoints.
 * v1 derivation only exposes composite + trend.delta (from ≥7d prior
 * composite), so the "series" here is at most 2 points. Rather than
 * fabricate intermediate days (which would look like fake data and
 * mislead Ken), we hand the sparkline exactly what we know and let
 * it degrade gracefully to a flat/two-point plot.
 */
function seriesFromDerivation(
  domainScore: number | undefined,
  compositeDelta: number | undefined,
): number[] {
  if (typeof domainScore !== 'number' || !Number.isFinite(domainScore)) return []
  if (typeof compositeDelta !== 'number' || !Number.isFinite(compositeDelta)) {
    // Only the current endpoint — sparkline renders a single flat bar.
    return [domainScore]
  }
  const prior = domainScore - compositeDelta
  // Prior first, current last: sparkline consumers assume left→right
  // = old→new so the visual arrow matches the numeric delta.
  return [prior, domainScore]
}

/**
 * Adapter — pure fn (extracted for testability). Rounds domain scores
 * for display; leaves the underlying derivation untouched.
 */
export function toCatalog(derivation: WellbeingDerivation): {
  composite: number | undefined
  compositeBand: ScoreBandName | undefined
  rows: ScoreRow[]
} {
  const compositeDelta = derivation.trend?.delta
  const rows: ScoreRow[] = DOMAIN_ORDER.map((domain) => {
    const agg = derivation.domains.find((d) => d.domain === domain)
    const rawScore = agg?.score
    const score =
      typeof rawScore === 'number' && Number.isFinite(rawScore)
        ? Math.round(rawScore)
        : undefined
    return {
      domain,
      title: DOMAIN_LABEL[domain],
      score,
      band: scoreToBand(score),
      // v1 derivation exposes composite trend only; per-domain trend
      // is not yet a field on WellbeingDerivation (Ken's v2 backlog).
      // We surface the composite delta on every row so the sparkline
      // reads directionally correct even though it's a proxy — this
      // matches the shipped HeroScoreBlock's dot-row semantics.
      deltaLast7Days: compositeDelta,
      series7Day: seriesFromDerivation(score, compositeDelta),
      links: buildRowLinks(domain),
    }
  })
  return {
    composite: derivation.composite,
    compositeBand: scoreToBand(derivation.composite),
    rows,
  }
}

/**
 * One-call hook returning the projected catalog + loading/empty gates.
 * Consumers should render an empty-state (not zeros) when isEmpty.
 */
export function useScoreCatalog(): ScoreCatalog {
  const placeholdersOn = isHomeV2PlaceholdersEnabled()
  const { derivation, isLoading, isEmpty } = useWellbeingDerivation()

  const projected = React.useMemo(() => toCatalog(derivation), [derivation])

  if (placeholdersOn && (isEmpty || typeof projected.composite !== 'number')) {
    // Placeholder mode ONLY when real data is missing — never overrides
    // a real signal. This keeps QA screenshots stable on empty test
    // accounts without ever masking a genuine patient value.
    return placeholderCatalog()
  }

  return {
    composite: projected.composite,
    compositeBand: projected.compositeBand,
    rows: projected.rows,
    isLoading,
    isEmpty,
  }
}
