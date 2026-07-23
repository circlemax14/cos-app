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
}: BpsWellbeingScoreCardProps): React.JSX.Element {
  // Shared with SelfAssessmentTrends — same cache key, same staleTime.
  // If SelfAssessmentTrends has already primed the cache (parent mounts
  // this card ABOVE it, but auth-prefetch may have warmed it), first
  // paint is READY, not LOADING.
  const summaryQuery = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
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
    })),
  })

  // Index history newest-first per instrument, then defensively merge
  // the summary row (per-instrument /history may not have loaded yet
  // even when /assessments has). Chunk 58 pattern: never let a stale
  // per-instrument cache silently drop a valid score.
  const historyById = React.useMemo(() => {
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
  }, [historyQueries.map((q) => q.dataUpdatedAt).join('|'), summaryQuery.data])

  // Pure derivation — no React, no I/O. Everything the render needs.
  const derived = React.useMemo(() => deriveWellbeing(historyById), [historyById])
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

  // Any history query still loading AND we don't yet have a composite → LOADING.
  const anyHistoryLoading = historyQueries.some((q) => q.isLoading && !q.data)
  const isLoading =
    (summaryQuery.isLoading && !summaryQuery.data) ||
    (anyHistoryLoading && typeof composite !== 'number')

  const summaryReady = !summaryQuery.isLoading || !!summaryQuery.data
  const isEmpty = summaryReady && typeof composite !== 'number' && !isLoading

  const bigNumberText = isLoading ? '—' : typeof composite === 'number' ? String(composite) : '—'

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
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(10),
          }}
        >
          Self-report only
        </Text>
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

      {/* Three domain pills */}
      <View style={styles.pillsRow}>
        {domains.map((d) => {
          const scoreText = typeof d.score === 'number' ? String(Math.round(d.score)) : '—'
          const pillColor = typeof d.score === 'number' ? compositeColor(d.score, tint) : subtext
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
              accessibilityLabel={`${DOMAIN_LABEL[d.domain as BpsDomain]} ${scoreText} out of 100`}
            >
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
})
