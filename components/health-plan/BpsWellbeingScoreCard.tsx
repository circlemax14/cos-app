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
import { useQueries, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'

import { Radii, Spacing } from '@/constants/design-system'
import {
  fetchAssessmentHistory,
  fetchAssessments,
  type AssessmentRecord,
} from '@/services/api/assessments'
import {
  ALL_TRACKED_INSTRUMENTS,
  DOMAIN_CALLOUT_NAME,
  DOMAIN_LABEL,
  deriveWellbeing,
  type BpsDomain,
  type TrendArrow,
  type WellbeingDerivation,
} from '@/lib/wellbeing-score'

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

function trendIcon(arrow: TrendArrow): 'trending-up' | 'trending-down' | 'trending-flat' {
  if (arrow === 'up') return 'trending-up'
  if (arrow === 'down') return 'trending-down'
  return 'trending-flat'
}

function trendTone(arrow: TrendArrow): 'good' | 'bad' | 'neutral' {
  if (arrow === 'up') return 'good'
  if (arrow === 'down') return 'bad'
  return 'neutral'
}

const TONE_COLOR = {
  good: '#10B981',
  bad: '#DC2626',
  neutral: '#6B7280',
} as const

/**
 * CHUNK 65 (2026-07-22) — deep-link focus param per BpsDomain.
 * Matches ASSESSMENT_ROUTE_FOR_SECTION in lib/unified-plan-assessment-routing.ts
 * (bio / psy / soc). The `focus` param is CURRENTLY IGNORED by
 * app/Home/assessments-catalog.tsx — it lands the user at the top of
 * the catalog regardless. Included so a follow-up chunk can teach the
 * catalog to scroll-to-domain without a separate deep-link handshake;
 * back-compatible today because the target screen just drops the unknown
 * param on the floor.
 */
const DOMAIN_TO_CATALOG_FOCUS: Record<BpsDomain, 'bio' | 'psy' | 'soc'> = {
  bio: 'bio',
  mind: 'psy',
  social: 'soc',
}

/**
 * CHUNK 65: build the assessments-catalog href for an empty domain pill.
 * Distinct `source=wellbeing-empty-pill` so engagement analytics can
 * attribute check-in completions back to this specific nudge (vs the
 * plan-upgrade banner, due banner, unified-plan-empty deep link, etc.).
 * `focus` is aspirational (see DOMAIN_TO_CATALOG_FOCUS docstring).
 */
function catalogHrefForDomain(domain: BpsDomain): string {
  return `/Home/assessments-catalog?source=wellbeing-empty-pill&focus=${DOMAIN_TO_CATALOG_FOCUS[domain]}`
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
  const summaryQuery = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
    enabled: !usingParentDerivation,
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
      return 'Wellbeing score not yet available. Complete a self-assessment to see your score.'
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

      {/* Focal number + trend arrow */}
      <View style={styles.numberRow}>
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
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
        <View style={{ flex: 1 }} />
        {/* Reserve fixed slot so trend flip-in doesn't reflow the row. */}
        <View style={styles.trendSlot}>
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
          // contributor suffix during LOADING. Before data lands,
          // deriveWellbeing() reports contributors: 0 for every
          // domain — showing "0 completed" during that window
          // misleads the patient into thinking they have no data,
          // AND the wider "0 completed" text triggers pill flexWrap
          // which then unwraps once real data arrives (CLS). Under
          // loading, render only the label (no score, no suffix) so
          // the pill footprint matches chunk 62. The suffix reveals
          // once we actually have a signal.
          const suffixText = isLoading
            ? ''
            : hasContributors ? `· ${d.contributors}` : `${d.contributors} completed`
          const suffixColor = hasContributors ? pillColor : subtext
          // CHUNK 65 (2026-07-22): empty pills (contributors === 0) become
          // tap targets that route to the assessments catalog so patients
          // can act on the transparency chunk 63 introduced ("0 completed"
          // → "tap here to take a check-in"). Scored pills stay
          // non-interactive (existing behavior). Loading pills stay
          // non-interactive — the suffix is suppressed during load so the
          // chevron never flashes in and out (no CLS, no misleading
          // "tap here" state before we know the real contributor count).
          //
          // RN responder system: nested Pressable — the child wins the
          // press, so tapping an empty pill navigates without also
          // triggering the outer scroll-to-Self-Assessments handler.
          //
          // Discoverability: a small chevron-right sits after the "N
          // completed" suffix so the pill visually reads as tappable.
          // Icon size is derived from getScaledFontSize so accessibility
          // scaling scales the affordance with everything else — no CLS
          // because the icon slot is only inserted for empty pills,
          // which is a stable state (empty stays empty until the patient
          // completes a check-in, at which point the whole pill
          // re-renders as a scored, non-tappable View).
          const isEmptyTappable = !isLoading && !hasContributors
          const chevronSize = getScaledFontSize(12)
          const pillA11y = isLoading
            ? `${DOMAIN_LABEL[d.domain as BpsDomain]} loading`
            : hasContributors
              ? `${DOMAIN_LABEL[d.domain as BpsDomain]} ${scoreText} out of 100, based on ${d.contributors} ${d.contributors === 1 ? 'assessment' : 'assessments'}`
              : `${DOMAIN_LABEL[d.domain as BpsDomain]} score not available, 0 assessments completed. Tap to take a check-in.`
          const pillContent = (
            <>
              <Text
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
              {isEmptyTappable ? (
                <MaterialIcons
                  name="chevron-right"
                  size={chevronSize}
                  color={suffixColor}
                  style={{ marginLeft: 2, width: chevronSize, height: chevronSize }}
                />
              ) : null}
            </>
          )
          if (isEmptyTappable) {
            const href = catalogHrefForDomain(d.domain as BpsDomain)
            return (
              <Pressable
                key={d.domain}
                onPress={() => router.push(href as never)}
                // Chunk 65 adversarial-verify fix: asymmetric hitSlop so the
                // horizontal extension doesn't overlap the pillsRow gap (6pt)
                // between adjacent empty pills — on cold-mount all 3 domains
                // are empty and adjacent, and a symmetric hitSlop:6 has hit
                // regions meeting at the gap midpoint so RN's sibling-order
                // tiebreak decides which domain the tap goes to. Vertical
                // padding preserved for accessibility taps above/below.
                hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                accessibilityRole="button"
                accessibilityLabel={pillA11y}
                accessibilityHint="Opens the assessments catalog to take a related check-in"
                style={({ pressed }) => [
                  styles.pill,
                  {
                    borderColor: pillColor,
                    backgroundColor: pillColor + '14',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                {pillContent}
              </Pressable>
            )
          }
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
              {pillContent}
            </View>
          )
        })}
      </View>

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
          <Text style={{ color: subtext, fontSize: getScaledFontSize(12) }}>
            Complete a self-assessment to see your wellbeing score.
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
