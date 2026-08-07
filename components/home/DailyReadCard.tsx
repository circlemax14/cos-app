/**
 * SCRUM-644 — Daily Read home-surface card (SKELETON).
 *
 * Pure primitive envelope (View / Text / Pressable / MaterialIcons /
 * StyleSheet) — iOS 26.5-hardened, no Animated, no LayoutAnimation,
 * no react-native-svg. Mirrors HealthAgeCard.tsx.
 *
 * HONEST-PLACEHOLDER STATE (per orchestrator brief + design brief):
 *   Final copy, headline tone taxonomy, pillar labels/CTAs, and band
 *   colors are BLOCKED on Ken clinical + design sign-off. This card
 *   ships as a design-in-progress skeleton so the flag-off path is
 *   byte-identical to today AND the wire is proven end-to-end for
 *   beta testers. Do NOT treat the copy on this card as production
 *   text.
 *
 * FLAG DISCIPLINE:
 *   Self-gated on `useDailyReadFlag()` (returns null when OFF) so a
 *   stray mount can't leak the surface — mirrors HabitCorrelationStrip
 *   discipline. Parent is ALSO expected to guard on the flag; both
 *   layers exist for defense in depth.
 *
 * States rendered when flag ON:
 *   - hidden           → flag OFF → return null (byte-identical)
 *   - loading          → em-dash "—" + "Pulling your read…" hint
 *                        (no shimmer; established repo precedent is
 *                        em-dash + hint per HealthAgeCard)
 *   - empty            → response.empty === true → onboarding CTA
 *                        ("Connect Apple Health to see your daily
 *                        read.") — this IS the first-run value moment
 *   - ready            → placeholder headline + placeholder body +
 *                        design-in-progress footer, pillars listed as
 *                        chips when present so beta testers can see
 *                        the wire is live
 *
 * AUG-6 AMENDMENT — TREND SPARKLINE
 *   The backend now emits a numeric 0-100 `score` per day and persists
 *   one bucket per UTC day. When at least TWO buckets exist, the card
 *   renders a 7-day ScoreHistorySparkline under the pillar chips plus a
 *   plain-text "Trend, last N days" caption.
 *
 *   Deliberate constraints:
 *     - ALL existing copy and every existing state are untouched. The
 *       sparkline is additive; with <2 buckets the card is byte-identical
 *       to what shipped.
 *     - Reuses components/home/ScoreHistorySparkline (plain <View> bars,
 *       deferred mount) — no SVG, no new deps, iOS 26.5 primitive
 *       envelope intact.
 *     - Never colour-only: the trend is always accompanied by the text
 *       caption AND an explicit today-score line, so a patient who
 *       cannot distinguish the bar colour still gets the information.
 *
 * PHI:
 *   Never renders raw numeric vitals — the backend aggregator's
 *   headline/oneLiner strings are already categorical-only per the
 *   design brief. This card just displays them verbatim. The read score
 *   is a derived 0-100 index (like the wellbeing score already shown on
 *   Home), not a measurement.
 *
 * A11Y:
 *   Every Text uses getScaledFontSize/getScaledFontWeight from the
 *   accessibility store — our patients skew older and Dynamic Type is
 *   not optional. The whole card remains a single 44pt+ tap target.
 */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { useDailyRead } from '@/hooks/use-daily-read'
import { useDailyReadFlag } from '@/hooks/use-daily-read-flag'
import {
  toSparklineSeries,
  useDailyReadHistory,
} from '@/hooks/use-daily-read-history'
import { ScoreHistorySparkline } from '@/components/home/ScoreHistorySparkline'
import { useAccessibility } from '@/stores/accessibility-store'
import type { ScoreBandName } from '@/constants/design-system'
import type {
  DailyReadPillar,
  DailyReadPillarBand,
} from '@/services/api/daily-read'

// ─── Placeholder copy (HONEST — pending Ken clinical + design) ──────
//
// Do NOT rewrite these to sound production-final. The point is that
// beta testers, Ken, and design see a skeleton that clearly reads as
// "wire is live, copy is pending" rather than a finished tile.
const PLACEHOLDER_HEADLINE = 'Your daily read'
const PLACEHOLDER_BODY =
  'One honest summary of how today is trending across the signals we can see. No values shown — just direction and what to do next.'
const PLACEHOLDER_LOADING_HINT = 'Pulling your read…'
const PLACEHOLDER_EMPTY_BODY = 'Connect Apple Health to see your daily read.'
const PLACEHOLDER_EMPTY_CTA = 'Connect'
const PLACEHOLDER_FOOTER =
  'Design in progress — copy and layout pending Ken clinical + design review.'

/**
 * Minimum buckets required before the sparkline appears. One point is
 * not a trend — drawing seven identical left-padded bars from a single
 * day would imply a week of stability the patient has not yet earned.
 */
const MIN_BUCKETS_FOR_SPARKLINE = 2
const SPARKLINE_DAYS = 7

/**
 * Map the daily read score onto the shared ScoreBands palette so the
 * sparkline reads consistently with the wellbeing/BPS cards next to it
 * on Home. Thresholds match wellbeing-score.service's BAND_THRESHOLDS
 * (85 / 65 / 40) — one taxonomy across every scored surface.
 *
 * Colour is NEVER the only signal: the caption and the score line
 * alongside the sparkline carry the same information in text.
 */
function bandForScore(score: number | null | undefined): ScoreBandName {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'developing'
  if (score >= 85) return 'optimal'
  if (score >= 65) return 'developing'
  if (score >= 40) return 'foundational'
  return 'initial'
}

/** Band token defaults. Final palette pending design sign-off; these
 *  match the HealthAgeCard neutral-forward palette so the skeleton
 *  reads as consistent with the surrounding daily-insights cluster. */
const BAND_TOKENS: Record<DailyReadPillarBand, { fg: string; bg: string }> = {
  good:      { fg: '#0F6B36', bg: '#E6F4EC' },
  fair:      { fg: '#0B6963', bg: '#E0F2F1' },
  attention: { fg: '#8A5100', bg: '#FDF3E4' },
}

export interface DailyReadCardProps {
  /** Called on tap — parent decides where (v1: read-only, no route). */
  onPress?: () => void
  testID?: string
}

/**
 * Read the backend's numeric daily read score off the response without
 * depending on the shared `DailyReadResponse` type carrying it yet.
 *
 * WHY THE CAST: `services/api/daily-read.ts` is owned by another
 * workstream this cycle, so its `DailyReadResponse` interface does not
 * declare `score` even though the backend now always sends it (and its
 * `normalizeResponse` passes unknown fields through untouched). Reading
 * it through a narrow local type keeps this card working today and
 * becomes a no-op the moment the shared type is updated — see the
 * follow-up noted in the handoff.
 */
function readScore(data: unknown): number | null {
  if (data == null || typeof data !== 'object') return null
  const s = (data as { score?: unknown }).score
  return typeof s === 'number' && Number.isFinite(s) ? s : null
}

function PillarChip({
  pillar,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  pillar: DailyReadPillar
  getScaledFontSize: (n: number) => number
  getScaledFontWeight: (n: number) => string
}): React.JSX.Element {
  const tokens = pillar.band ? BAND_TOKENS[pillar.band] : undefined
  const label = pillar.label || pillar.key
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}${pillar.band ? `, ${pillar.band}` : ''}`}
      style={[
        styles.pillarChip,
        tokens ? { backgroundColor: tokens.bg } : styles.pillarChipNeutral,
      ]}
    >
      <Text
        style={[
          styles.pillarChipLabel,
          {
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as '700',
          },
          tokens ? { color: tokens.fg } : styles.pillarChipLabelNeutral,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

function DailyReadCardBase({
  onPress,
  testID = 'daily-read-card',
}: DailyReadCardProps): React.JSX.Element | null {
  const flagEnabled = useDailyReadFlag()
  const { data, isLoading, isError } = useDailyRead(flagEnabled)
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility()
  // History is fetched alongside the read, gated on the same flag. The
  // fetcher never rejects, so this hook has no error state to handle —
  // a failure is indistinguishable from "no history yet", which is the
  // correct behaviour for a decoration.
  const { data: history } = useDailyReadHistory(SPARKLINE_DAYS, flagEnabled)

  // Defensive backstop — parent should already gate, but never leak
  // the surface if the flag is OFF.
  if (!flagEnabled) return null

  // Hard error path: collapse silently. The aggregator NEVER throws on
  // partial signal failure, so an error here is transport/auth — the
  // dark-launch discipline is to hide, not surface a scary banner.
  if (isError) return null

  const isLoadingInitial = isLoading && !data
  const isEmpty = data?.empty === true
  const headlineText = data?.headline.text ?? PLACEHOLDER_HEADLINE
  const readyPillars = (data?.pillars ?? []).filter((p) => p.state === 'ready')

  // ── Trend (Aug-6 amendment) ──────────────────────────────────────
  // `toSparklineSeries` drops null-score days rather than zeroing them,
  // so `series.length` is the count of days we can honestly plot — which
  // is exactly the number the gate below should test.
  const series = toSparklineSeries(history?.buckets)
  const showSparkline =
    !isLoadingInitial && !isEmpty && series.length >= MIN_BUCKETS_FOR_SPARKLINE
  // Prefer today's live score; fall back to the newest plotted bucket so
  // the caption still reads correctly on the (brief) window where the
  // history row has been written but the live payload is being refetched.
  const todayScore = readScore(data) ?? (series.length > 0 ? series[series.length - 1] : null)
  const trendCaption = `Trend, last ${series.length} ${series.length === 1 ? 'day' : 'days'}`

  // #9 first-day state. History is one row per UTC DAY, so a patient who has
  // just started (or whose account existed before this shipped) has exactly one
  // plottable point and no chart. Rendering nothing there is indistinguishable
  // from the feature being broken — which is precisely how it was read on the
  // day it launched. Say what is happening instead: show today's number, and
  // that the line arrives tomorrow. Deliberately NOT a fake chart: one point
  // left-padded into seven bars would draw a flat line that asserts six days of
  // stability we have no data for.
  const showFirstDayNote =
    !isLoadingInitial &&
    !isEmpty &&
    series.length === 1 &&
    todayScore !== null

  const a11yLabel = isLoadingInitial
    ? 'Daily read loading'
    : isEmpty
      ? `Daily read. ${PLACEHOLDER_EMPTY_BODY}`
      : `Daily read. ${headlineText || PLACEHOLDER_HEADLINE}${
          showSparkline && todayScore !== null
            ? `. Today's read score ${todayScore} out of 100. ${trendCaption}.`
            : showFirstDayNote
              ? `. Today's read score ${todayScore} out of 100. Your trend line starts tomorrow.`
              : ''
        }`

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Open your daily read"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID={testID}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.label,
            {
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as '700',
            },
          ]}
          numberOfLines={1}
        >
          DAILY READ
        </Text>
        <MaterialIcons
          name="today"
          size={16}
          color="#687076"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      {isLoadingInitial ? (
        <>
          <Text
            style={[styles.headlineDim, { fontSize: getScaledFontSize(42) }]}
            maxFontSizeMultiplier={1.3}
          >
            —
          </Text>
          <Text
            style={[styles.hint, { fontSize: getScaledFontSize(12) }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
          >
            {PLACEHOLDER_LOADING_HINT}
          </Text>
        </>
      ) : isEmpty ? (
        <>
          <Text
            style={[
              styles.headline,
              {
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(700) as '700',
              },
            ]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
          >
            {PLACEHOLDER_HEADLINE}
          </Text>
          <Text
            style={[styles.body, { fontSize: getScaledFontSize(13) }]}
            numberOfLines={3}
            maxFontSizeMultiplier={1.3}
          >
            {PLACEHOLDER_EMPTY_BODY}
          </Text>
          <View style={styles.ctaRow}>
            <Text
              style={[
                styles.ctaLabel,
                {
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(700) as '700',
                },
              ]}
              numberOfLines={1}
            >
              {PLACEHOLDER_EMPTY_CTA}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color="#0B6963" />
          </View>
        </>
      ) : (
        <>
          <Text
            style={[
              styles.headline,
              {
                fontSize: getScaledFontSize(18),
                fontWeight: getScaledFontWeight(700) as '700',
              },
            ]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
          >
            {headlineText || PLACEHOLDER_HEADLINE}
          </Text>
          <Text
            style={[styles.body, { fontSize: getScaledFontSize(13) }]}
            numberOfLines={3}
            maxFontSizeMultiplier={1.3}
          >
            {PLACEHOLDER_BODY}
          </Text>
          {readyPillars.length > 0 ? (
            <View style={styles.pillarRow}>
              {readyPillars.map((p) => (
                <PillarChip
                  key={p.key}
                  pillar={p}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                />
              ))}
            </View>
          ) : null}

          {/*
            Trend block — appears only with >= 2 plottable buckets. The
            caption + score line always accompany the bars so the trend
            is never communicated by colour or shape alone.
          */}
          {/*
            #9 first-day state — exactly one plottable bucket. Shows the real
            number plus when the line appears, rather than a blank space that
            reads as a broken feature. No bars: see showFirstDayNote.
          */}
          {showFirstDayNote ? (
            <View style={styles.trendBlock}>
              <View style={styles.trendHeaderRow}>
                <Text
                  style={[
                    styles.trendCaption,
                    {
                      fontSize: getScaledFontSize(11),
                      fontWeight: getScaledFontWeight(600) as '600',
                    },
                  ]}
                  numberOfLines={2}
                  maxFontSizeMultiplier={1.3}
                >
                  Your trend line starts tomorrow
                </Text>
                <Text
                  style={[
                    styles.trendScore,
                    {
                      fontSize: getScaledFontSize(11),
                      fontWeight: getScaledFontWeight(700) as '700',
                    },
                  ]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                >
                  {`Today ${todayScore}/100`}
                </Text>
              </View>
            </View>
          ) : null}

          {showSparkline ? (
            <View style={styles.trendBlock}>
              <View style={styles.trendHeaderRow}>
                <Text
                  style={[
                    styles.trendCaption,
                    {
                      fontSize: getScaledFontSize(11),
                      fontWeight: getScaledFontWeight(600) as '600',
                    },
                  ]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                >
                  {trendCaption}
                </Text>
                {todayScore !== null ? (
                  <Text
                    style={[
                      styles.trendScore,
                      {
                        fontSize: getScaledFontSize(11),
                        fontWeight: getScaledFontWeight(700) as '700',
                      },
                    ]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                  >
                    {`Today ${todayScore}/100`}
                  </Text>
                ) : null}
              </View>
              <ScoreHistorySparkline
                series={series}
                band={bandForScore(todayScore)}
                accessibilityLabel={`Daily read trend over the last ${series.length} ${
                  series.length === 1 ? 'day' : 'days'
                }`}
              />
            </View>
          ) : null}
        </>
      )}

      <Text
        style={[styles.footer, { fontSize: getScaledFontSize(10) }]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
      >
        {PLACEHOLDER_FOOTER}
      </Text>
    </Pressable>
  )
}

export const DailyReadCard = React.memo(DailyReadCardBase)
DailyReadCard.displayName = 'DailyReadCard'
export default DailyReadCard

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    minHeight: 132,
  },
  cardPressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#687076',
  },
  headline: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: -0.2,
  },
  headlineDim: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '700',
    color: '#C7CACD',
    letterSpacing: -1,
  },
  body: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#3E4448',
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#687076',
  },
  ctaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B6963',
    letterSpacing: 0.2,
  },
  pillarRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pillarChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  pillarChipNeutral: {
    backgroundColor: '#F1F3F5',
  },
  pillarChipLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  pillarChipLabelNeutral: {
    color: '#687076',
  },
  footer: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    color: '#98A0A6',
    fontStyle: 'italic',
  },
  // ── Trend block (Aug-6 amendment) ────────────────────────────────
  trendBlock: {
    marginTop: 10,
  },
  trendHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    // Wraps rather than truncates at large Dynamic Type sizes — the
    // score is the more important of the two, so it must never be the
    // thing that gets clipped off the right edge.
    flexWrap: 'wrap',
    gap: 6,
  },
  trendCaption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: '#687076',
  },
  trendScore: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: '#3E4448',
  },
})
