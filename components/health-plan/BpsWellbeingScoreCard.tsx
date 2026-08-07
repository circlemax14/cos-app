/**
 * BpsWellbeingScoreCard (CHUNK 59, 2026-07-22) — composite "Wellbeing
 * Score" that sits at the top of the BPS surface as the daily
 * wake-up-and-glance number Ken asked for.
 *
 * Ken transcript quotes that shaped this file:
 *   - "The wellbeing score will be kind of like a flash that somebody
 *      wakes up to every day" — sits above the today hero, single big number
 *   - "That's kind of how I use this sleep score" — Oura-style single 0-100
 *   - "We're pulling all of it together, including the self-assessments"
 *   - "Very meaningful synthesis of all of these metrics"
 *   - "Everything is elevating except that domain" — worst-domain callout
 *
 * v1 SCOPE (deliberately narrow — Ken can iterate the formula in v2):
 *   - Feeds ONLY from self-assessment bands (chunk 58). No wearables,
 *     no EHR labs, no vitals. Card is honestly labeled "self-report" so
 *     Ken never wonders where the number came from.
 *   - Formula lives in lib/wellbeing-score.ts (pure, testable). This
 *     file is ONLY React Query wiring + summary/history merge + render.
 *
 * Data source & race safety:
 *   - Reuses the SAME react-query cache keys as SelfAssessmentTrends:
 *     ['assessments-trends'] and ['assessment-history', instrumentId].
 *     React Query dedupes across components on identical keys, so
 *     this card and SelfAssessmentTrends share one round-trip per
 *     instrument even though this card renders ABOVE it. No race:
 *     both consumers derive from the shared cache, and this card
 *     sorts history newest-first defensively (chunk 58 pattern) so
 *     it never trusts API ordering.
 *
 * Layout-shift discipline (chunks 47/48 pattern):
 *   - Card ALWAYS renders the same footprint. `LOADING` / `EMPTY` /
 *     `READY` share one outer <View> with a fixed minHeight so cold
 *     mount doesn't jitter downstream cards (BpsTodayHeroCard,
 *     BpsWelcomeBanner, IntakeCtaCard slot, SelfAssessmentTrends).
 *   - Placeholder score uses the same 48pt slot as the real number.
 *
 * iOS 26.5 hardening:
 *   - Only static View / Text / Pressable / MaterialIcons + StyleSheet
 *     primitives. No Modal, no Animated, no LayoutAnimation, no
 *     Portal, no gradient, no ActivityIndicator, no cross-fade. Ken
 *     tests on iPhone 14 iOS 26.5 build 62 at default text scale;
 *     these primitives are the ones already proven safe by chunks
 *     47/50/57 on that device class.
 *
 * Kill-switch: BPS_WELLBEING_SCORE_ENABLED = true (module const in
 * BiopsychosocialPlanScreen.tsx). Flip false to hide the card without
 * a binary cut — OTA-revertible in one line.
 *
 * OTA-safe (no native fingerprint change; pure JS + existing icons).
 */
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useIsMutating, useQueries, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'

import { Radii, Spacing } from '@/constants/design-system'
import {
  fetchAssessmentHistory,
  fetchAssessments,
  type AssessmentRecord,
} from '@/services/api/assessments'
import { fetchInstruments, type InstrumentSummary } from '@/services/api/instruments'
import {
  ALL_TRACKED_INSTRUMENTS,
  DOMAIN_CALLOUT_NAME,
  DOMAIN_LABEL,
  DOMAIN_MEMBERS,
  DOMAIN_ORDER,
  deriveWellbeing,
  type BpsDomain,
  type WellbeingDerivation,
} from '@/lib/wellbeing-score'
import {
  REGENERATE_BIO_PLAN_MUTATION_KEY,
} from '@/hooks/use-biopsychosocial-plan'
// Ken 2026-08-06 — hoisted to lib/wellbeing-trend.ts so the Home
// WellbeingScoreTile renders the identical arrow + tone. Aliased
// locally to keep the JSX render blocks below byte-identical.
import {
  trendIconName as trendIcon,
  trendTone,
  TREND_TONE_COLOR as TONE_COLOR,
} from '@/lib/wellbeing-trend'

/**
 * CHUNK 67 (2026-07-23) — kill-switch for the domain-scoped picker
 * introduced this chunk. When true, tapping the empty-pill CTA lands
 * the user in /Home/wellbeing-domain-checkins?domain=… where they can
 * pick which check-in to take. When false, the CTA falls back to the
 * chunk-66 behavior (deep-link straight into the stepper for the first
 * available incomplete instrument in the empty domain), which was
 * exactly what Ken complained about on 2026-07-23 ("nice to have extra
 * button for 0 completed"). Kept as a module const rather than a
 * server flag so the OTA revert is one-line. Cheaper than the churn of
 * a real feature flag for a chunk 66/67 tandem release.
 */
const WELLBEING_DOMAIN_PICKER_ENABLED = true


// Match the shape BiopsychosocialPlanScreen already casts `colors` to
// (Record<string, string>) so this drop-in component types cleanly at
// the call site without extra casts.
type ColorMap = Record<string, string>

export interface BpsWellbeingScoreCardProps {
  colors: ColorMap
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string | number
  /**
   * Parent-owned scroll-to for the Self-Assessments section further
   * down the same ScrollView. Tapping the card routes there so Ken
   * can drill from "78 improving" to the per-instrument bands that
   * fed it. Parent no-ops if the section hasn't laid out yet.
   */
  onPressDetails?: () => void
  /**
   * CHUNK 60 (2026-07-22): parent-hoisted wellbeing derivation.
   * When supplied, the card SKIPS its internal
   * useQuery / useQueries / deriveWellbeing pass and renders directly
   * from these props — the "compute once" guarantee the parent needs
   * so BpsPlanFocusBanner and each SectionCard's isFocus tag can
   * consume the SAME focus value without a second deriveWellbeing()
   * CPU pass. When absent, the card falls back to the original
   * internal path so it remains drop-in usable anywhere else with no
   * regressions.
   */
  derivation?: WellbeingDerivation
  isLoading?: boolean
  isEmpty?: boolean
}

// ---------------------------------------------------------------
// Display helpers — colors + icons only. Formula lives in
// lib/wellbeing-score.ts. Keep these in the card so the pure module
// stays free of visual concerns.
// ---------------------------------------------------------------

/**
 * CHUNK 65/66 (2026-07-23) — deep-link focus param per BpsDomain for the
 * assessments-catalog fallback route. Matches ASSESSMENT_ROUTE_FOR_SECTION
 * in lib/unified-plan-assessment-routing.ts (bio / psy / soc). Kept for the
 * chunk-66 fallback path only (all-domain-members-completed edge case);
 * primary CTA now deep-links straight to /Home/assessment-stepper with
 * an instrumentId, bypassing the catalog entirely (see CTA onPress below).
 *
 * The `focus` param is CURRENTLY IGNORED by app/Home/assessments-catalog.tsx
 * — it lands the user at the top of the catalog regardless. Included so a
 * follow-up chunk (SCRUM follow-up filed by user) can teach the catalog to
 * scroll-to-domain + filter-hide already-completed items without a separate
 * deep-link handshake; back-compatible today because the target screen just
 * drops the unknown param on the floor.
 */
const BPS_TO_CATALOG_FOCUS: Record<BpsDomain, 'bio' | 'psy' | 'soc'> = {
  bio: 'bio',
  mind: 'psy',
  social: 'soc',
}

/** Warm palette for the composite number based on the score band. */
function compositeColor(composite: number | undefined, tint: string): string {
  if (typeof composite !== 'number') return tint
  if (composite >= 70) return '#10B981' // green — thriving
  if (composite >= 40) return '#F59E0B' // amber — mid
  return '#DC2626' // red — needs work
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export function BpsWellbeingScoreCard({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onPressDetails,
  derivation: derivationProp,
  isLoading: isLoadingProp,
  isEmpty: isEmptyProp,
}: BpsWellbeingScoreCardProps): React.JSX.Element {
  // CHUNK 60: when the parent hoisted the derivation (via
  // useWellbeingDerivation), skip our own query observers AND the
  // deriveWellbeing() pass. Rules-of-hooks: `enabled: false` keeps
  // the observer registrations stable across renders without firing
  // network work. React Query dedupes on identical cache keys, so the
  // parent's active observers are the sole source of truth — this
  // card and BpsPlanFocusBanner + SectionCard.isFocus render from ONE
  // deriveWellbeing() pass per render.
  const usingParentDerivation = derivationProp !== undefined

  // Shared with SelfAssessmentTrends — same cache key, same staleTime.
  // If SelfAssessmentTrends has already primed the cache (parent mounts
  // this card ABOVE it, but auth-prefetch may have warmed it), first
  // paint is READY, not LOADING.
  //
  // CHUNK 66 (2026-07-23): summaryQuery is now ALWAYS enabled — the CTA
  // row below the pills needs record presence (fetchAssessments) to pick
  // the first incomplete instrument in the empty domain, so we can't gate
  // this observer behind `usingParentDerivation` anymore. React Query
  // dedupes on the shared `['assessments-trends']` cache key, so when the
  // parent hoists derivation (and is therefore already fetching the same
  // data), this extra observer is free — same round-trip, same cache
  // entry. The pure-derivation code path below still uses `derivationProp`
  // for the composite/domains/trend/focus values; summaryQuery.data is only
  // consumed by the CTA routing algorithm.
  const summaryQuery = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
  })

  // CHUNK 67 (2026-07-23): observe the biopsychosocial-plan regen
  // mutation CROSS-INSTANCE via useIsMutating + the shared mutation
  // key so that when the picker fires regen and immediately unmounts
  // on router.replace('/Home/biopsychosocial-plan'), this card still
  // sees the in-flight mutation. useMutation's per-instance `isPending`
  // would be false here (this card's own hook never called .mutate()),
  // so useIsMutating is the correct primitive. Returns the count of
  // in-flight mutations matching the key — treat any non-zero as
  // "pending" for pill display purposes.
  const regenPendingCount = useIsMutating({
    mutationKey: [...REGENERATE_BIO_PLAN_MUTATION_KEY],
  })
  const regenIsPending = regenPendingCount > 0

  // CHUNK 66: instruments catalog — needed by the CTA row to know which
  // domain-member instrumentIds are actually visible + not `comingSoon`
  // (comingSoon rows are catalog-visible but non-tappable, so routing a
  // patient straight to /Home/assessment-stepper for one would land them
  // on an unavailable take-flow). Reuses the SAME `['instruments']` cache
  // key that assessment-stepper.tsx (line 51) already uses, so it hits the
  // React Query cache instead of firing a duplicate network round-trip.
  // Deliberately NOT using fetchRecommendedInstruments — that endpoint's
  // AI-recommender subset can drop alcohol-3 / loneliness-3 from a
  // patient's list even though they're the ONLY members of DOMAIN_MEMBERS.social,
  // which was one of the failure modes behind Ken's 2026-07-23 dogfood
  // report ("clicked social & faith → all check-ins already completed").
  // The full instrument list guarantees every DOMAIN_MEMBERS entry has a
  // chance to be matched, then completion state gates the actual pick.
  const instrumentsQuery = useQuery({
    queryKey: ['instruments'],
    queryFn: fetchInstruments,
    staleTime: 5 * 60 * 1000,
  })

  // Per-instrument history — same key SelfAssessmentTrends uses.
  // React Query dedupes on identical keys, so both consumers share
  // one round-trip per instrument even though we mount above it. We
  // fetch history for the FULL tracked-instrument set (not just what
  // the summary returned) so we can compute defensible priors even
  // when the summary transiently omits one instrument.
  const historyQueries = useQueries({
    queries: ALL_TRACKED_INSTRUMENTS.map((id) => ({
      queryKey: ['assessment-history', id] as const,
      queryFn: () => fetchAssessmentHistory(id),
      staleTime: 5 * 60 * 1000,
      enabled: !usingParentDerivation,
    })),
  })

  // Index history newest-first per instrument, then defensively merge
  // the summary row (per-instrument /history may not have loaded yet
  // even when /assessments has). Chunk 58 pattern: never let a stale
  // per-instrument cache silently drop a valid score.
  const historyById = React.useMemo(() => {
    // Fast-path when parent supplied the derivation — no merge needed.
    if (usingParentDerivation) return new Map<string, AssessmentRecord[]>()
    const map = new Map<string, AssessmentRecord[]>()
    ALL_TRACKED_INSTRUMENTS.forEach((id, i) => {
      const data = historyQueries[i]?.data ?? []
      const sorted = [...data]
        .filter((rec) => !!rec?.completedAt)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      map.set(String(id), sorted)
    })
    // Fold the summary row in as an extra record per instrument so
    // deriveWellbeing() sees the freshest completion even when
    // /history is stale. Duplicates are harmless — the pure module
    // re-sorts and selects newest-first internally.
    const summary = summaryQuery.data ?? []
    summary
      .filter((r) => !!r.completedAt)
      .forEach((r) => {
        const key = String(r.instrumentId)
        const existing = map.get(key) ?? []
        // Only fold in if the summary record is strictly newer than
        // the freshest history record (dedupe on completedAt). If
        // history is empty, the summary record wins by default since
        // any non-empty ISO string beats ''.
        const newest = existing[0]?.completedAt ?? ''
        if ((r.completedAt ?? '') > newest) {
          map.set(key, [r, ...existing])
        }
      })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    usingParentDerivation,
    historyQueries.map((q) => q.dataUpdatedAt).join('|'),
    summaryQuery.data,
  ])

  // Pure derivation — no React, no I/O. When the parent hoisted the
  // derivation, use it directly (single-pass guarantee); otherwise
  // compute internally so this component stays drop-in usable
  // anywhere else without regressions.
  const derived = React.useMemo(
    () => (usingParentDerivation ? (derivationProp as WellbeingDerivation) : deriveWellbeing(historyById)),
    [usingParentDerivation, derivationProp, historyById],
  )
  const { composite, domains, trend, focus } = derived

  // -------------------------------------------------------------
  // Render — one shell, three states (LOADING / EMPTY / READY)
  // sharing minHeight so downstream cards don't shift on cold mount.
  // -------------------------------------------------------------

  const bg = (colors.card ?? '#ffffff') + 'D9'
  const border = colors.border ?? '#e0e0e0'
  const text = colors.text ?? '#11181C'
  const subtext = colors.subtext ?? '#687076'
  const tint = colors.tint ?? '#0D9488'
  const focalColor = compositeColor(composite, tint)

  // CHUNK 60: when the parent hoisted derivation, it also computes
  // isLoading + isEmpty using the same shared cache — trust those
  // values so all consumers reason from ONE truth. Fall back to the
  // internal query-observer gates otherwise (drop-in mode).
  const anyHistoryLoading = historyQueries.some((q) => q.isLoading && !q.data)
  const internalIsLoading =
    (summaryQuery.isLoading && !summaryQuery.data) ||
    (anyHistoryLoading && typeof composite !== 'number')
  const isLoading = usingParentDerivation ? !!isLoadingProp : internalIsLoading

  const summaryReady = !summaryQuery.isLoading || !!summaryQuery.data
  const internalIsEmpty = summaryReady && typeof composite !== 'number' && !internalIsLoading
  const isEmpty = usingParentDerivation ? !!isEmptyProp : internalIsEmpty

  const bigNumberText = isLoading ? '—' : typeof composite === 'number' ? String(composite) : '—'

  // CHUNK 92 (2026-07-23) — accessibility label for the composite score
  // CONTAINER (numberRow). Prior to this chunk the Text nodes making up
  // the score ("65", "/100", trend "Improving") were each their own
  // VoiceOver node — swiping into the card read "65" in isolation with
  // no context of what the number represents. The outer Pressable's
  // a11yLabel already reads a full summary, but VoiceOver still
  // fragments the numberRow because Text defaults to accessible=true.
  // Fix pattern (iOS + Android parity):
  //   - Mark numberRow accessible=true with a natural-language label
  //     that folds in the trend line adjacent to the number ("improving"
  //     / "worsening" / "steady") so one swipe reads the composite as
  //     one utterance.
  //   - Hide inner Text nodes from a11y (accessibilityElementsHidden on
  //     iOS, importantForAccessibility="no-hide-descendants" on Android)
  //     so the parent label wins and children don't double-read.
  // Empty-state icon is decorative — the same hidden treatment applies.
  const numberRowA11yLabel = (() => {
    if (isLoading) return 'Your wellbeing score: loading'
    if (typeof composite !== 'number') return 'Your wellbeing score: not yet calculated'
    const trendPhrase =
      trend?.arrow === 'up'
        ? ', improving'
        : trend?.arrow === 'down'
          ? ', worsening'
          : trend
            ? ', steady'
            : ''
    return `Your wellbeing score: ${composite} out of 100${trendPhrase}`
  })()

  // -------------------------------------------------------------
  // CHUNK 66 (2026-07-23): PROMINENT CTA below the domain pills.
  //
  // Ken's 2026-07-23 dogfood on chunk 65 reported two problems:
  //   (1) the tap-affordance on empty pills (subtle chevron) was not
  //       discoverable — patients didn't realize the pill was tappable.
  //   (2) tapping an empty pill routed to /Home/assessments-catalog which
  //       showed all check-ins as "Done" for his account — the catalog
  //       ignores `?focus=` and, worse, `fetchRecommendedInstruments`
  //       (the AI subset the catalog prefers) can drop the very instruments
  //       that feed the empty pill, so no card matches.
  //
  // Fix: empty pills revert to non-tappable transparency text (kept in
  // pill render below). A single prominent TEAL CTA row appears below the
  // pills row whenever at least one domain has contributors === 0. Its
  // onPress deep-links straight to /Home/assessment-stepper?instrumentId=…
  // for the first available incomplete member of the first empty domain
  // — bypassing the catalog entirely. If every member is already
  // completed-and-current (edge case), fall back to the catalog with
  // `source=wellbeing-empty-pill-all-done` so downstream analytics can
  // distinguish "user needed a check-in" from "user had none to take".
  //
  // Routing is driven by RECORD PRESENCE from fetchAssessments, NOT by
  // the wellbeing derivation's `contributors` count. This matters because
  // subscoreFromRecord() can return undefined for a completed record whose
  // scores payload arrives empty from the backend (Ken's alcohol-3 /
  // loneliness-3 records exhibited scores:{} in his 07-23 report).
  //
  // CHUNK 68 (2026-07-23) UPDATE: the root cause was NOT a missing
  // ASSESSMENT_BANDS entry — both alcohol-3 and loneliness-3 have valid
  // band defs. The real cause is the cos-backend legacy `computeScores`
  // switch (assessments.service.ts:236-250) lacking cases for these two
  // instrumentIds, so when getActive() returns null it falls through to
  // scoreFreeform() and writes scores:{} with populated responses. Chunk
  // 68 added a client-side defensive recompute via
  // extractScoreFromRecord() + computeFallback:'sum-responses' on the
  // two bands, so the contributors count no longer drops these records.
  // The parallel BE follow-up (missing switch cases + one-shot backfill
  // + investigate why getActive returned null for Ken's tenant) is
  // tracked separately; the client fallback is scaffolding to be
  // revisited for removal once that ships. The record-presence decoupling
  // below is retained belt-and-suspenders in case another instrument hits
  // the same trap before the BE fix lands.
  // -------------------------------------------------------------

  // CHUNK 67 adversarial-verify majors #1/#2/#3 fix: dropped the
  // justCompletedRecently window. Three problems the heuristic had:
  //   (a) render-time Date.now() snapshot with no timer → "Processing…"
  //       could stick indefinitely if no re-render fired at t=60s;
  //   (b) account-wide latest completedAt → a completion in ONE domain
  //       painted EVERY empty pill as processing, misrepresenting what
  //       Ken asked for ("processing until plan is updated");
  //   (c) sticks past the 30s regen latch when the plan is actually
  //       done regenerating.
  //
  // Only regenIsPending faithfully represents "plan is currently being
  // updated" — the user tapped Refresh my plan in the picker, which
  // fired useRegenerateBiopsychosocialPlan().mutate(); observed here
  // via the shared REGENERATE_BIO_PLAN_MUTATION_KEY. When regen
  // resolves, the invalidation cascade refetches ['assessments-trends']
  // and the derivation, and the pill flips to real data.
  //
  // Completions that never reach the Refresh step (user backs out of
  // the picker mid-flow) intentionally do NOT show "Processing…" —
  // the pill flips to the real contributor count as soon as the
  // record's subscore lands in the derivation.
  const isProcessing = regenIsPending

  const emptyDomains = React.useMemo<BpsDomain[]>(() => {
    if (isLoading || isEmpty) return []
    // Preserve DOMAIN_ORDER so "first empty" is deterministic and matches
    // the reading order of the pills row.
    return DOMAIN_ORDER.filter((d) => {
      const agg = domains.find((x) => x.domain === d)
      return !!agg && agg.contributors === 0
    })
  }, [isLoading, isEmpty, domains])

  const completedById = React.useMemo(() => {
    const map = new Map<string, AssessmentRecord>()
    const rows = summaryQuery.data ?? []
    rows.forEach((r) => {
      if (r && r.instrumentId && r.completedAt) {
        map.set(String(r.instrumentId), r)
      }
    })
    return map
  }, [summaryQuery.data])

  const visibleInstruments = React.useMemo(() => {
    const set = new Set<string>()
    const rows: InstrumentSummary[] = instrumentsQuery.data ?? []
    rows.forEach((it) => {
      if (it && it.instrumentId && !it.comingSoon) set.add(String(it.instrumentId))
    })
    return set
  }, [instrumentsQuery.data])

  /**
   * Pick an actionable instrumentId for a given empty BPS domain.
   * Chunk 66 adversarial-verify blocker fix (Ken 2026-07-23 repro):
   *
   * The domain landed in `emptyDomains` because its pill shows 0
   * contributors. That can happen for two reasons:
   *   (a) user genuinely has no records for any member instrument, OR
   *   (b) user HAS records but their scores don't produce a valid band
   *       (ASSESSMENT_BANDS coverage gap, or extractScore returns
   *       undefined for their record shape) — the wellbeing pill can't
   *       count them.
   *
   * Pre-fix behavior: this function returned undefined for case (b) and
   * the caller fell through to routing to /Home/assessments-catalog,
   * which showed Ken the same "all completed" screen he had already
   * complained about. Now we ALWAYS return an actionable instrumentId
   * when the domain has any visible member — walking a priority order:
   *   1. No record at all      → return it (truly incomplete)
   *   2. Record expired        → return it (retake overdue)
   *   3. Record present + fresh → return the OLDEST-completed one
   *                                (retake so the score refreshes)
   * Only returns undefined when the domain has ZERO visible members
   * (e.g. every member is coming-soon or unknown to the catalog).
   */
  const pickTargetForDomain = React.useCallback(
    (domain: BpsDomain): string | undefined => {
      const members = DOMAIN_MEMBERS[domain]
      const now = Date.now()
      let oldestCompleted: { id: string; completedAt: number } | undefined
      for (const id of members) {
        const idStr = String(id)
        if (!visibleInstruments.has(idStr)) continue
        const record = completedById.get(idStr)
        if (!record) return idStr
        const exp = Date.parse(record.expiresAt ?? '')
        if (Number.isFinite(exp) && exp <= now) return idStr
        const completedAt = Date.parse(record.completedAt ?? '')
        if (Number.isFinite(completedAt)) {
          if (!oldestCompleted || completedAt < oldestCompleted.completedAt) {
            oldestCompleted = { id: idStr, completedAt }
          }
        } else if (!oldestCompleted) {
          // Fall back to the first record without a valid completedAt
          // — still lets the user retake something in this domain.
          oldestCompleted = { id: idStr, completedAt: Infinity }
        }
      }
      return oldestCompleted?.id
    },
    [completedById, visibleInstruments],
  )

  // Chunk 66 adversarial-verify major #2 fix: show the CTA for
  // first-time users too. isEmpty === true means every domain has 0
  // contributors — exactly the users who most need the "take a
  // check-in" nudge. Pre-fix `!isEmpty` gate hid the CTA precisely
  // when it was most useful.
  const ctaDataReady =
    !!summaryQuery.data && !!instrumentsQuery.data && !summaryQuery.isLoading && !instrumentsQuery.isLoading
  // Chunk 67 adversarial-verify major #3 fix: hide the CTA while regen
  // is in flight. Ken's exact repro was "tap Refresh → land back on BPS
  // → pill still 0 → CTA still shows → tap again → loop." Hiding the
  // CTA under isProcessing lets the pill's "Processing…" state be the
  // sole affordance during regen; CTA returns once the pill flips to
  // real data or stays 0 after regen resolves.
  const showCta = !isLoading && !isProcessing && emptyDomains.length > 0 && ctaDataReady

  const ctaCopy = (() => {
    if (emptyDomains.length === 1) {
      return `Take a check-in for your ${DOMAIN_CALLOUT_NAME[emptyDomains[0]]}`
    }
    return `You have ${emptyDomains.length} areas with no data. Take a check-in`
  })()

  const onPressCta = React.useCallback(() => {
    if (emptyDomains.length === 0) return
    const firstEmpty = emptyDomains[0]

    // CHUNK 67 (2026-07-23): default path now hands control to the
    // domain-scoped picker so Ken sees a LIST of available check-ins
    // for the empty pill and picks one himself — his verbatim dogfood
    // ask. The picker owns the entire multi-check-in cycle (return to
    // list after each submit, "Refresh my plan" only when every member
    // is fresh) so this component no longer needs to model any of
    // that. Kill-switch WELLBEING_DOMAIN_PICKER_ENABLED = false
    // restores the chunk-66 deep-link-straight-into-stepper behavior
    // as a one-line OTA revert if the picker misbehaves in prod.
    if (WELLBEING_DOMAIN_PICKER_ENABLED) {
      router.push({
        pathname: '/Home/wellbeing-domain-checkins',
        params: { domain: firstEmpty, source: 'wellbeing-empty-pill' },
      } as never)
      return
    }

    // FALLBACK (chunk 66 behavior — kept for OTA revert only). Walk
    // empty domains in DOMAIN_ORDER; first one with a resolvable
    // target wins. pickTargetForDomain returns retake-oldest as a last
    // resort so we always route to a real take-flow instead of
    // dumping the user on a catalog page of "all completed" items.
    for (const domain of emptyDomains) {
      const instrumentId = pickTargetForDomain(domain)
      if (instrumentId) {
        router.push({
          pathname: '/Home/assessment-stepper',
          params: { instrumentId, source: 'wellbeing-empty-pill' },
        } as never)
        return
      }
    }
    // True final fallback (all members are coming-soon or unknown to
    // the catalog — extremely rare): route to catalog so the user at
    // least sees the section, with a distinct analytics source.
    router.push({
      pathname: '/Home/assessments-catalog',
      params: {
        source: 'wellbeing-empty-pill-no-visible-instruments',
        focus: BPS_TO_CATALOG_FOCUS[firstEmpty],
      },
    } as never)
  }, [emptyDomains, pickTargetForDomain])

  // CHUNK 63 (2026-07-22): "How is this calculated?" expandable panel.
  // Component-local state — no persistence. Straight conditional render
  // (no LayoutAnimation / Animated / Modal) per iOS 26.5 safe primitives
  // discipline. Card grows taller when expanded; that's user-initiated
  // so the layout-shift discipline still holds (card top stays put).
  const [howExpanded, setHowExpanded] = React.useState(false)

  // Accessibility: read as a single summary line so VoiceOver doesn't
  // fragment the score, trend, and callout across nodes.
  const a11yLabel = (() => {
    if (isLoading) return 'Loading your wellbeing score'
    if (isEmpty)
      return 'Wellbeing score not yet available. Take a quick check-in to see your daily wellbeing snapshot.'
    const trendWord =
      trend?.arrow === 'up'
        ? 'improving'
        : trend?.arrow === 'down'
          ? 'worsening'
          : trend
            ? 'steady'
            : ''
    const focusWord = focus ? `. Your ${DOMAIN_CALLOUT_NAME[focus]} could use some focus` : ''
    return `Wellbeing score ${composite} out of 100${trendWord ? `, ${trendWord}` : ''}${focusWord}. Self-report only.`
  })()

  return (
    <Pressable
      onPress={onPressDetails}
      disabled={!onPressDetails || isLoading}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: pressed && onPressDetails ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={onPressDetails ? 'Opens your self-assessment details' : undefined}
    >
      {/* Top row — eyebrow + honest self-report label */}
      <View style={styles.topRow}>
        <Text
          accessibilityRole="header"
          accessibilityLabel="Wellbeing overview"
          style={{
            color: subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          WELLBEING
        </Text>
        {/* CHUNK 63: "Self-report only" caption is now the tap target for
            the "How is this calculated?" panel — a small info icon sits
            adjacent so the interaction is discoverable without adding a
            second row. Whole label+icon is one Pressable so VoiceOver
            reads "How is your wellbeing score calculated, button". */}
        <Pressable
          onPress={() => setHowExpanded((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="How is your wellbeing score calculated"
          accessibilityHint={howExpanded ? 'Hides the explanation' : 'Shows how the score is calculated'}
          accessibilityState={{ expanded: howExpanded }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(10),
            }}
          >
            Self-report only
          </Text>
          <MaterialIcons
            name={howExpanded ? 'expand-less' : 'info-outline'}
            size={getScaledFontSize(14)}
            color={subtext}
            style={{ marginLeft: 4 }}
          />
        </Pressable>
      </View>

      {/* Focal number + trend arrow.
          CHUNK 74 (2026-07-23): on true empty state (composite === undefined
          AND !isLoading), swap the "—" focal + "/100" suffix for a warmer
          MaterialIcons "self-improvement" glyph in the muted subtext color,
          and hide the reserved trendSlot entirely. The 48pt/52pt line-height
          number slot would leave the icon looking small and misplaced, so
          size the icon to ~44pt to preserve card intrinsic-height (minHeight
          160 remains the floor). Non-empty/non-loading paths keep the
          reserved trend slot so real trend flip-in doesn't reflow the row
          (chunk 59 CLS discipline). */}
      <View
        style={styles.numberRow}
        accessible
        accessibilityLabel={numberRowA11yLabel}
      >
        {isEmpty ? (
          <MaterialIcons
            name="self-improvement"
            size={getScaledFontSize(44)}
            color={subtext}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                color: focalColor,
                fontSize: getScaledFontSize(48),
                fontWeight: getScaledFontWeight(800) as any,
                letterSpacing: -1,
                lineHeight: getScaledFontSize(52),
              }}
            >
              {bigNumberText}
            </Text>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                color: subtext,
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(600) as any,
                marginLeft: 4,
                marginBottom: 6,
              }}
            >
              /100
            </Text>
          </>
        )}
        <View style={{ flex: 1 }} />
        {/* Reserve fixed slot so trend flip-in doesn't reflow the row.
            CHUNK 74: suppressed on empty state so the row doesn't carry a
            phantom reserved footprint next to the value-prop icon.
            CHUNK 92: trend nodes hidden from a11y — the natural-language
            phrase is folded into numberRowA11yLabel above so VoiceOver
            reads score + trend as one utterance. */}
        {!isEmpty ? (
          <View
            style={styles.trendSlot}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {trend ? (
              <>
                <MaterialIcons
                  name={trendIcon(trend.arrow)}
                  size={getScaledFontSize(20)}
                  color={TONE_COLOR[trendTone(trend.arrow)]}
                />
                <Text
                  style={{
                    color: TONE_COLOR[trendTone(trend.arrow)],
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(700) as any,
                    marginLeft: 4,
                  }}
                >
                  {trend.arrow === 'up' ? 'Improving' : trend.arrow === 'down' ? 'Worsening' : 'Steady'}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Three domain pills.
          CHUNK 63 (2026-07-22): inline contributor count so the patient
          sees WHY a domain's number is what it is — a low MIND score
          with only 1 assessment behind it is a different story than a
          low MIND with 5 assessments behind it. Ken transcript: "we
          can also give users some option, how they can improve it" —
          transparency is the first step before prescription.
            - Non-zero: subtle "· N" suffix in the pill color, smaller
              font, so it reads as metadata not as part of the score.
            - Zero: "0 completed" in muted subtext so the patient
              understands this domain currently contributes 0 to the
              composite (chunk 62 always-divide-by-3 formula).
          The pill row already has flexWrap:'wrap' as a safety net for
          iPhone SE at large text scale — SOCIAL & FAITH with a full
          suffix can wrap to the next row without breaking layout. */}
      <View style={styles.pillsRow}>
        {domains.map((d) => {
          // Under loading, treat every domain as "score not yet known"
          // so the pill footprint matches the pre-chunk-63 loading
          // shape (bare label + "—"). Prevents both the misleading
          // "0 completed" flash AND the CLS from label-width changes
          // between load and ready.
          const isDomainScored = !isLoading && typeof d.score === 'number'
          const scoreText = isDomainScored ? String(Math.round(d.score as number)) : '—'
          const pillColor = isDomainScored ? compositeColor(d.score, tint) : subtext
          const hasContributors = !isLoading && d.contributors > 0
          // Chunk 63 adversarial-verify major fix: suppress the
          // contributor suffix during LOADING (see chunk-63 comment
          // history for the CLS + "0 completed" flash rationale).
          // CHUNK 67 (2026-07-23): when a regen is in flight
          // (isProcessing = regenIsPending, sourced from the shared
          // REGENERATE_BIO_PLAN_MUTATION_KEY — see the isProcessing
          // derivation above for the rationale behind sourcing this
          // solely from the regen mutation state), swap the
          // "0 completed" copy for "Processing…" on empty pills.
          // Rows that already
          // have contributors keep their real number — safer than
          // blanking a good pill during a regen. Only the SUFFIX text
          // changes; the pill container + layout are untouched so
          // LOADING/EMPTY/READY minHeight discipline from chunks 47/48
          // holds. "Processing…" (12ch) is within the existing pill
          // width — no CLS.
          const suffixText = isLoading
            ? ''
            : hasContributors
              ? `· ${d.contributors}`
              : isProcessing
                ? 'Processing…'
                : `${d.contributors} completed`
          const suffixColor = hasContributors ? pillColor : subtext
          // CHUNK 66 (2026-07-23): REVERTED chunk-65 empty-pill Pressable.
          // Ken's 2026-07-23 dogfood showed the chevron affordance on the
          // pill was not discoverable AND the catalog it routed to
          // confused him ("all check-ins were already completed"). The
          // tap affordance is now a PROMINENT teal CTA row rendered
          // below this pillsRow — see the CTA block after this View.
          // Empty pills go back to being plain Views with the "0 completed"
          // transparency text, non-tappable. Kept the transparency copy
          // so the patient still learns WHY a domain scored — the CTA
          // below explains WHAT to do about it.
          // CHUNK 96 (2026-07-23): compose an accessibilityLabel that
          // reads as a full natural-language sentence — prior version's
          // bare number ("70") on the score Text was VoiceOver-meaningless
          // when swiping through the pill. Domain name is lowercased so
          // screen-readers don't over-spell "SOCIAL & FAITH" as letters.
          // Suffix mirrors the visual suffix states (chunk 63 empty +
          // loading, chunk 67 processing) so a11y and visual read the same
          // story. Inner Text nodes are hidden from a11y below so this
          // parent label reads once instead of fragmenting per node.
          const domainNameLower = DOMAIN_LABEL[d.domain as BpsDomain].toLowerCase()
          const pillA11y = isLoading
            ? `${domainNameLower}: not yet available.`
            : hasContributors
              ? `${domainNameLower}: ${scoreText} out of 100. ${d.contributors} ${d.contributors === 1 ? 'check-in' : 'check-ins'} contributing.`
              : isProcessing
                ? `${domainNameLower}: refreshing.`
                : `${domainNameLower}: not yet available.`
          return (
            <View
              key={d.domain}
              style={[
                styles.pill,
                {
                  borderColor: pillColor,
                  backgroundColor: pillColor + '14',
                },
              ]}
              accessible
              accessibilityLabel={pillA11y}
            >
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  color: pillColor,
                  fontSize: getScaledFontSize(10),
                  fontWeight: getScaledFontWeight(700) as any,
                  letterSpacing: 0.4,
                }}
              >
                {DOMAIN_LABEL[d.domain as BpsDomain]}
              </Text>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  color: pillColor,
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(800) as any,
                  marginLeft: 6,
                }}
              >
                {scoreText}
              </Text>
              {suffixText ? (
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    color: suffixColor,
                    fontSize: getScaledFontSize(10),
                    fontWeight: getScaledFontWeight(600) as any,
                    marginLeft: 5,
                    opacity: hasContributors ? 0.75 : 1,
                  }}
                >
                  {suffixText}
                </Text>
              ) : null}
            </View>
          )
        })}
      </View>

      {/* CHUNK 66 (2026-07-23) — prominent teal CTA row.
          Only mounts when at least one domain has contributors === 0 AND
          all routing data is resolved (see showCta). Conditional-null
          render is intentional: reserving whitespace for the CTA on
          healthy accounts would eat ~46pt of always-present padding and
          regress the compact card design. Because the whole card is gated
          on data-ready (chunk 63 loading suppression), the CTA appears in
          the same render as the pills — no user-visible flash beyond what
          the card already causes on cold mount.
          iOS 26.5 safe: plain Pressable + Text + MaterialIcons (all
          already used in this file). No Animated / Modal / LayoutAnimation
          / shadow — solid teal fill + rounded corners carries the visual
          prominence Ken asked for. */}
      {showCta ? (
        <Pressable
          onPress={onPressCta}
          accessibilityRole="button"
          accessibilityLabel={ctaCopy}
          accessibilityHint="Opens the next check-in"
          style={({ pressed }) => [
            styles.ctaRow,
            {
              backgroundColor: tint,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            numberOfLines={2}
            style={{
              color: '#ffffff',
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as any,
              flexShrink: 1,
            }}
          >
            {ctaCopy}
          </Text>
          <MaterialIcons
            name="chevron-right"
            size={getScaledFontSize(22)}
            color="#ffffff"
            style={{ marginLeft: 8 }}
          />
        </Pressable>
      ) : null}

      {/* Focus callout — reserves height even when empty so the
          appearance of the line doesn't shift the following cards. */}
      <View style={styles.calloutSlot}>
        {focus ? (
          // Chunk 59 adversarial-verify major #1 fix: callout copy no
          // longer asserts "this week" because the focus signal is a
          // current-snapshot gap between domains (worst domain vs mean
          // of others), not a weekly trend measurement. Rewritten so
          // the sentence is truthful about what the formula computes.
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(600) as any,
            }}
          >
            Your{' '}
            <Text style={{ fontWeight: getScaledFontWeight(800) as any }}>
              {DOMAIN_CALLOUT_NAME[focus]}
            </Text>{' '}
            could use some focus.
          </Text>
        ) : isEmpty ? (
          // CHUNK 74 (2026-07-23): warmer value-prop copy. Prior version
          // ("Complete a self-assessment to see your wellbeing score.")
          // read as an instruction and duplicated the CTA row above it.
          // New copy names WHAT the patient gets (a daily snapshot) rather
          // than what to do — the CTA row already carries the "take a
          // check-in" action, so the callout complements instead of
          // repeating it.
          <Text style={{ color: subtext, fontSize: getScaledFontSize(12) }}>
            Take a quick check-in to see your daily wellbeing snapshot.
          </Text>
        ) : null}
      </View>

      {/* CHUNK 63: "How is this calculated?" inline explanation.
          Straight conditional render — no LayoutAnimation, Animated,
          or Modal (iOS 26.5 safe primitives per chunks 47/50/57). Card
          grows taller when open; that's a user-initiated action so it
          doesn't violate the layout-shift discipline that governs cold
          mount. Copy is patient-facing and non-clinical — it explains
          the always-divide-by-3 formula (chunk 62) in plain language
          so a low score reads as "incomplete data" rather than "I am
          unwell". */}
      {howExpanded ? (
        <View
          style={[
            styles.howPanel,
            { borderTopColor: border, backgroundColor: (colors.card ?? '#ffffff') + '00' },
          ]}
          accessible
          accessibilityLabel="How your wellbeing score is calculated"
        >
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(12),
              lineHeight: getScaledFontSize(17),
            }}
          >
            {`Your score is the average of three areas: physical health, mental health, and social & faith. Each area's score comes from your recent self-assessments. Missing data in any area lowers the overall score — the more check-ins you complete, the more accurate the number becomes.`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export default BpsWellbeingScoreCard

const styles = StyleSheet.create({
  // Match sibling BPS cards (BpsTodayHeroCard, BpsWelcomeBanner,
  // BpsAiSummaryBanner) — same padding/radius/marginBottom so they
  // read as one system. Fixed minHeight so LOADING / EMPTY / READY
  // states occupy the same vertical space and downstream cards don't
  // jitter on cold mount (chunks 47/48 discipline).
  card: {
    padding: Spacing.md,
    borderRadius: Radii.xl,
    borderWidth: 1,
    marginBottom: Spacing.md,
    minHeight: 160,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  trendSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 22,
    minWidth: 96,
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  // CHUNK 66 (2026-07-23): prominent teal CTA row below the pills.
  // Solid fill + rounded corners (borderRadius 12, not the pill's 999)
  // so it reads as a distinct button, not another pill. minHeight 44
  // hits the iOS tap-target guideline at default text scale, and grows
  // naturally at larger scales because the Text uses flexShrink instead
  // of a fixed size. marginTop 4 keeps it visually attached to the pills
  // it explains; marginBottom 8 matches the pillsRow's own marginBottom
  // so the callout slot below stays put.
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
    marginTop: 4,
    marginBottom: 8,
  },
  // Reserve space for the callout line so its appearance/disappearance
  // doesn't shift downstream cards. Enough for one wrapped line at
  // default text scale.
  calloutSlot: {
    minHeight: 18,
  },
  // CHUNK 63: how-is-this-calculated inline panel. Divider on top +
  // padding so it reads as a distinct section within the card. No
  // fixed height — the card grows to fit the explanatory copy, which
  // is fine because opening is user-initiated (chunk 63 constraints).
  howPanel: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
