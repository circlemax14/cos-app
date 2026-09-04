/**
 * SCRUM-638 followup (Vishal 2026-08-05) — Readiness info + detail screen.
 *
 * Reached from the Readiness hero tile / card. Explains what Readiness
 * is, how it's calculated, and why it matters — plus surfaces today's
 * composite + per-metric contribution so the user can see WHY today's
 * number is what it is.
 *
 * Replaces the previous tap-target which routed to /Home/apple-health
 * (the raw connect-permissions surface). That was jarring: users
 * expected an info drilldown, got a settings screen.
 *
 * ── 2026-08-06 (Vishal) — GRAPHABLE + ACTIONABLE ────────────────────
 * Two additions that turn a number you stare at into a number you can
 * do something about:
 *
 *   1. TREND. A 7d / 14d / 30d range toggle over
 *      `GET /v1/patients/me/readiness/history`, rendered with the
 *      shared ScoreHistorySparkline. The snapshots have been written
 *      daily since SCRUM-654 — until now nothing read them back, so a
 *      patient could see today's score but never whether it was going
 *      anywhere. 30d is the hard ceiling: the DDB table's TTL.
 *
 *   2. "HOW TO IMPROVE YOUR READINESS". Guidance for the metrics
 *      currently below the patient's OWN baseline, worst-first, capped
 *      at three. Copy lives in lib/readiness-score.ts METRIC_IMPROVEMENT
 *      (see the writing rules in that file's comment — 70-year-old
 *      audience, no jargon, no clinical claims, never about medication).
 *      "Below baseline" is decided by `metricsBelowBaseline`, which
 *      ranks on the DIRECTION-AWARE subscore rather than the raw
 *      above/below flag — for resting heart rate and walking heart rate
 *      a below-baseline reading is GOOD, and telling that patient to
 *      rest more would be both wrong and discouraging.
 *
 * iOS 26.5-safe primitive envelope. No Animated / LayoutAnimation /
 * ActivityIndicator / SVG.
 */

import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { router } from 'expo-router'

import { AppWrapper } from '@/components/app-wrapper'
import { Colors } from '@/constants/theme'
import { useAccessibility } from '@/stores/accessibility-store'
import { useReadinessScoreFlag } from '@/hooks/use-readiness-score-flag'
import { useReadinessDerivation } from '@/hooks/use-readiness-derivation'
import { useReadinessHistory } from '@/hooks/use-readiness-history'
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends'
import { useCanRender } from '@/hooks/use-entitlement'
import { ScoreHistorySparkline } from '@/components/home/ScoreHistorySparkline'
import {
  METRIC_IMPROVEMENT,
  metricsBelowBaseline,
  type ReadinessBand,
  type ReadinessDriver,
} from '@/lib/readiness-score'
import { snapshotBandToLocalBand } from '@/services/api/readiness-history'
import type { LongitudinalTrend } from '@/services/api/types'

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

const BAND_TOKENS: Record<ReadinessBand, { fg: string; bg: string; label: string }> = {
  optimal:      { fg: '#0F6B36', bg: '#E6F4EC', label: 'OPTIMAL' },
  developing:   { fg: '#0B6963', bg: '#E0F2F1', label: 'DEVELOPING' },
  foundational: { fg: '#8A5100', bg: '#FDF3E4', label: 'FOUNDATIONAL' },
  initial:      { fg: '#B23A48', bg: '#FBE7E9', label: 'INITIAL' },
}

const METRIC_LABEL: Record<ReadinessDriver['metric'], string> = {
  hrv: 'Heart rate variability',
  sleep: 'Sleep',
  restingHr: 'Resting heart rate',
  respRate: 'Respiratory rate',
  steps: 'Steps',
  activeEnergy: 'Active energy',
  exerciseMin: 'Exercise minutes',
  walkingHr: 'Walking heart rate',
  spo2: 'Blood oxygen',
  flights: 'Flights climbed',
}

const METRIC_UNIT: Record<ReadinessDriver['metric'], string> = {
  hrv: 'ms',
  sleep: 'h',
  restingHr: 'bpm',
  respRate: 'br/min',
  steps: 'steps',
  activeEnergy: 'kcal',
  exerciseMin: 'min',
  walkingHr: 'bpm',
  spo2: '%',
  flights: 'flights',
}

/**
 * Metric codes emitted by the FE HealthKit adapter (`services/health.ts`)
 * that correspond to the 10 Readiness metrics. Filters the trend list
 * to just the ones this screen cares about.
 */
const READINESS_HEALTHKIT_CODES: readonly string[] = [
  'hk-hrv', 'hk-sleep', 'hk-resting-heart-rate', 'hk-respiratory-rate',
  'hk-steps', 'hk-active-energy', 'hk-exercise-time', 'hk-walking-heart-rate',
  'hk-oxygen-saturation', 'hk-flights',
]

/**
 * Range options for the trend toggle. Capped at 30 because the
 * readiness snapshot table has a 30-day TTL — offering 90d (like the
 * wellbeing screen does) would promise history that has been reaped.
 */
const RANGE_OPTIONS: readonly { label: string; days: number; a11y: string }[] = [
  { label: '7d', days: 7, a11y: 'Last 7 days' },
  { label: '14d', days: 14, a11y: 'Last 14 days' },
  { label: '30d', days: 30, a11y: 'Last 30 days' },
]

/** At least this many real points before a sparkline says anything useful. */
const MIN_POINTS_FOR_SPARKLINE = 2

/** How many improvement cards we ever show. See metricsBelowBaseline. */
const MAX_IMPROVEMENT_CARDS = 3

/** Bar count ScoreHistorySparkline renders. Must match BARS in that file. */
const SPARKLINE_BARS = 7

/**
 * Compress a series down to `buckets` points by averaging contiguous,
 * roughly-equal chunks.
 *
 * WHY THIS EXISTS (do not delete it as "unnecessary"):
 *   ScoreHistorySparkline renders exactly 7 bars and, when handed more
 *   points than that, keeps only the LAST 7 (`clean.slice(len - BARS)`).
 *   So passing a raw 30-day series to a chart labelled "30d" would draw
 *   the last SEVEN days while the caption claimed a month — a chart that
 *   lies about its own axis. That is worse than no chart.
 *
 *   Averaging into 7 buckets keeps the full window on screen: for a
 *   30-day range each bar is ~4 days. The delta narration below still
 *   uses the RAW first and last values, so the headline number stays
 *   exact even though the bars are smoothed.
 *
 *   Series at or below the bar count pass through untouched — a 7-day
 *   range is still one bar per day.
 */
function downsampleForSparkline(series: number[], buckets: number = SPARKLINE_BARS): number[] {
  if (series.length <= buckets) return series
  const out: number[] = []
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor((i * series.length) / buckets)
    // Guard the empty-slice case (can't happen while series.length >
    // buckets, but a future caller passing buckets > length would hit it
    // and produce NaN bars).
    const end = Math.max(Math.floor(((i + 1) * series.length) / buckets), start + 1)
    const chunk = series.slice(start, end)
    out.push(Math.round(chunk.reduce((acc, v) => acc + v, 0) / chunk.length))
  }
  return out
}

export default function ReadinessScreen(): React.JSX.Element {
  const flag = useReadinessScoreFlag()
  const readiness = useReadinessDerivation(flag)
  const { data: hkTrends } = useHealthKitTrends()
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors.light
  // Entitlement gate. Hook, so it lives at the top of the component,
  // above every early return. Fail-open — see hooks/use-entitlement.ts.
  const canView = useCanRender('readiness.view')
  const canViewMetrics = useCanRender('readiness.view-metrics')

  const composite = readiness.score?.composite
  const band = readiness.score?.band
  const bandTokens = band ? BAND_TOKENS[band] : null
  // Vishal 2026-08-06 — memoized because the `?? []` fallback minted a
  // fresh array identity on every render, which made the improvement
  // useMemo below recompute on every render for exactly the patients
  // who have no score yet (the empty-drivers case). Cheap to compute,
  // but it also defeated the memo's purpose entirely.
  const drivers = React.useMemo(
    () => readiness.score?.drivers ?? [],
    [readiness.score],
  )
  const state = readiness.uiState

  // Filter Apple Health trends to the metrics Readiness looks at.
  // Sorted so the ones that CONTRIBUTED today come first, then the
  // ones the user has data for but weren't used, then the rest.
  const readinessTrends: LongitudinalTrend[] = React.useMemo(() => {
    const trends = (hkTrends ?? []).filter((t) => READINESS_HEALTHKIT_CODES.includes(t.metricCode))
    return trends
  }, [hkTrends])

  // ── Trend (Vishal 2026-08-06) ─────────────────────────────────────
  // Server-side history of the daily snapshots the derivation hook has
  // been POSTing since SCRUM-654. Gated on the same flag as the score
  // itself — with the flag OFF the endpoint 404s, so skipping the
  // request avoids a guaranteed-failed round trip on cellular.
  const [rangeDays, setRangeDays] = React.useState<number>(7)
  const { data: history } = useReadinessHistory(rangeDays, flag)

  // Sparkline series, oldest-first. The endpoint already returns
  // chronological order; we re-sort defensively because a mis-ordered
  // series would silently render a fake trend, which is worse than no
  // trend at all.
  const historySeries = React.useMemo(() => {
    const buckets = history?.buckets ?? []
    return buckets
      .filter((b) => typeof b.score === 'number' && Number.isFinite(b.score))
      .slice()
      .sort((a, b) => a.asOfLocalDay.localeCompare(b.asOfLocalDay))
      .map((b) => b.score)
  }, [history])

  // What the 7 bars actually plot. For 7d this is one bar per day; for
  // 14d/30d each bar is an average of a contiguous chunk, so the chart
  // spans the whole window instead of silently showing only the last
  // week. See downsampleForSparkline.
  const sparklineSeries = React.useMemo(
    () => downsampleForSparkline(historySeries),
    [historySeries],
  )

  /** Days folded into each bar — only surfaced when we actually smoothed. */
  const daysPerBar = React.useMemo(() => {
    if (historySeries.length <= SPARKLINE_BARS) return 1
    return Math.round(historySeries.length / SPARKLINE_BARS)
  }, [historySeries])

  // Band used to colour the sparkline. Today's on-device band wins
  // (it's the freshest); the newest persisted bucket is the fallback so
  // the chart still colours correctly when today hasn't computed yet.
  // Persisted bands use the BACKEND vocabulary, hence the bridge.
  const sparklineBand: ReadinessBand | undefined = React.useMemo(() => {
    if (band) return band
    const buckets = history?.buckets ?? []
    const newest = buckets.length > 0 ? buckets[buckets.length - 1] : undefined
    return newest ? snapshotBandToLocalBand(newest.band) : undefined
  }, [band, history])

  // Plain-english delta across the selected range. Only meaningful with
  // at least two real points; sub-1-point moves are noise and are not
  // narrated at all rather than dressed up as a trend.
  const trendLine = React.useMemo(() => {
    if (historySeries.length < MIN_POINTS_FOR_SPARKLINE) return null
    const oldest = historySeries[0]
    const newest = historySeries[historySeries.length - 1]
    const delta = Math.round(newest - oldest)
    const rangeLabel = RANGE_OPTIONS.find((r) => r.days === rangeDays)?.label ?? `${rangeDays}d`
    if (Math.abs(delta) < 1) return `About the same across the last ${rangeLabel}.`
    if (delta > 0) return `Up ${delta} points across the last ${rangeLabel}.`
    return `Down ${Math.abs(delta)} points across the last ${rangeLabel}.`
  }, [historySeries, rangeDays])

  // ── Improvement guidance (Vishal 2026-08-06) ──────────────────────
  // The metrics dragging today's composite down, worst-first, max 3.
  // See metricsBelowBaseline in lib/readiness-score.ts for why this
  // ranks on the direction-aware subscore and not driver.direction.
  const improvementDrivers = React.useMemo(
    () => metricsBelowBaseline(drivers, MAX_IMPROVEMENT_CARDS),
    [drivers],
  )

  return (
    <AppWrapper>
      {canView && <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <MaterialIcons name="arrow-back-ios" size={20} color={colors.text as string} />
          </Pressable>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(18),
              fontWeight: getScaledFontWeight(700) as any,
              flex: 1,
            }}
          >
            Readiness
          </Text>
        </View>

        {/* Hero — today's score */}
        <View style={[styles.heroCard, { backgroundColor: '#FFFFFF' }]}>
          {typeof composite === 'number' ? (
            <>
              <Text style={styles.heroNumber} maxFontSizeMultiplier={1.3}>
                {composite}
              </Text>
              <Text style={styles.heroScale}>/100</Text>
              {bandTokens && (
                <View style={[styles.chip, { backgroundColor: bandTokens.bg }]}>
                  <Text style={[styles.chipText, { color: bandTokens.fg }]}>
                    {bandTokens.label}
                  </Text>
                </View>
              )}
              {readiness.score?.state === 'warming-up' && (
                <Text style={styles.heroCaveat}>
                  Still learning your baseline — score gets more accurate as more days accrue.
                </Text>
              )}
              {readiness.debug?.usedRecentFallback && (
                <Text style={styles.heroCaveat}>
                  Score based on your most recent sync
                  {readiness.debug?.todayIsoUsed
                    ? ` (${formatFallbackAge(readiness.debug.todayIsoLocal, readiness.debug.todayIsoUsed)})`
                    : ''}
                  . Wear your Apple Watch or open the Health app to refresh.
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.heroNumberEmpty} maxFontSizeMultiplier={1.3}>
                —
              </Text>
              <Text style={styles.heroCaveat}>
                {state === 'no-samples' && 'Connect Apple Health so we can compute today\'s score.'}
                {state === 'pre-baseline' && 'Building your 14-day baseline. Score appears once ≥7 days of history exist for at least 2 metrics.'}
                {state === 'disconnected' && 'Apple Health is not connected. Tap "Manage Apple Health" below to grant access.'}
                {state === 'unavailable' && 'Apple Health is not available on this device.'}
                {state === 'loading' && 'Loading your metrics…'}
              </Text>
            </>
          )}
        </View>

        {/* ── Your trend (Vishal 2026-08-06) ───────────────────────
            Range toggle + sparkline over the persisted daily snapshots.
            Rendered even when today's score is missing: the history is
            server-side, so a patient whose watch didn't sync today can
            still see where they've been. */}
        <Section title="Your trend" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
          <View style={styles.rangeRow}>
            {RANGE_OPTIONS.map((opt) => {
              const active = opt.days === rangeDays
              return (
                <Pressable
                  key={opt.days}
                  onPress={() => setRangeDays(opt.days)}
                  accessibilityRole="button"
                  accessibilityLabel={opt.a11y}
                  accessibilityState={{ selected: active }}
                  hitSlop={4}
                  style={({ pressed }) => [
                    styles.rangeBtn,
                    // Selection is signalled THREE ways — border weight,
                    // fill, and font weight — so it never depends on
                    // colour perception alone.
                    active ? styles.rangeBtnActive : styles.rangeBtnInactive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={{
                      color: active ? '#0B6963' : (colors.subtext as string),
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(active ? 700 : 500) as any,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.trendCard}>
            {historySeries.length >= MIN_POINTS_FOR_SPARKLINE ? (
              <>
                <ScoreHistorySparkline
                  series={sparklineSeries}
                  band={sparklineBand}
                  accessibilityLabel={`Readiness score over the last ${rangeDays} days`}
                />
                {trendLine ? (
                  <Text
                    style={{
                      color: colors.text as string,
                      fontSize: getScaledFontSize(13),
                      lineHeight: 19,
                      marginTop: 10,
                    }}
                  >
                    {trendLine}
                  </Text>
                ) : null}
                <Text
                  style={{
                    color: colors.subtext as string,
                    fontSize: getScaledFontSize(11),
                    lineHeight: 16,
                    marginTop: 6,
                  }}
                >
                  {`${historySeries.length} days recorded in this range.`}
                  {daysPerBar > 1
                    ? ` Each bar covers about ${daysPerBar} days.`
                    : ' Each bar is one day.'}
                </Text>
              </>
            ) : (
              <Text
                style={{
                  color: colors.subtext as string,
                  fontSize: getScaledFontSize(13),
                  lineHeight: 19,
                }}
              >
                Your trend fills in as the days go by. Once we have two days of
                scores, a small chart appears here. We keep the last 30 days.
              </Text>
            )}
          </View>
        </Section>

        {/* ── How to improve your readiness (Vishal 2026-08-06) ────
            The actionable half of the score. Only shown once a score
            actually computed (drivers is non-empty) — before that the
            "Why no score today" section below is the useful surface,
            and offering advice about metrics we couldn't even read
            would be noise. */}
        {drivers.length > 0 && (
          <Section
            title="How to improve your readiness"
            colors={colors}
            sz={getScaledFontSize}
            wt={getScaledFontWeight}
          >
            {improvementDrivers.length > 0 ? (
              <>
                <Text
                  style={{
                    color: colors.subtext as string,
                    fontSize: getScaledFontSize(13),
                    lineHeight: 19,
                  }}
                >
                  {improvementDrivers.length === 1
                    ? 'One thing is sitting below your usual range today. Here is one small step.'
                    : `${improvementDrivers.length} things are sitting below your usual range today. Here are some small steps.`}
                </Text>
                {improvementDrivers.map((d) => {
                  const label = METRIC_LABEL[d.metric] ?? d.metric
                  const guidance = METRIC_IMPROVEMENT[d.metric]
                  return (
                    <View
                      key={d.metric}
                      style={styles.improveCard}
                      accessible
                      // One VoiceOver stop per card reading the whole
                      // story, rather than four separate stops the user
                      // has to stitch together.
                      accessibilityLabel={`${label}. Below your usual range. ${guidance.why} ${guidance.how}`}
                    >
                      <View style={styles.improveHeaderRow}>
                        <Text
                          style={{
                            flex: 1,
                            color: colors.text as string,
                            fontSize: getScaledFontSize(15),
                            fontWeight: getScaledFontWeight(700) as any,
                          }}
                        >
                          {label}
                        </Text>
                        {/* Text label, not just a colour — the status is
                            readable in greyscale and by screen reader. */}
                        <View style={styles.improveBadge}>
                          <MaterialIcons name="arrow-downward" size={13} color="#8A5100" />
                          <Text
                            style={{
                              color: '#8A5100',
                              fontSize: getScaledFontSize(11),
                              fontWeight: getScaledFontWeight(700) as any,
                            }}
                          >
                            Below your usual
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={{
                          color: colors.subtext as string,
                          fontSize: getScaledFontSize(13),
                          lineHeight: 19,
                          marginTop: 8,
                        }}
                      >
                        {guidance.why}
                      </Text>
                      <View style={styles.improveActionRow}>
                        <MaterialIcons name="lightbulb-outline" size={18} color="#0B6963" />
                        <Text
                          style={{
                            flex: 1,
                            color: colors.text as string,
                            fontSize: getScaledFontSize(14),
                            lineHeight: 20,
                            fontWeight: getScaledFontWeight(600) as any,
                          }}
                        >
                          {guidance.how}
                        </Text>
                      </View>
                    </View>
                  )
                })}
                <Text
                  style={{
                    color: colors.subtext as string,
                    fontSize: getScaledFontSize(11),
                    lineHeight: 16,
                  }}
                >
                  These are general wellness suggestions based on your own recent
                  readings. They are not medical advice. Talk to your care team
                  before making any change to your treatment.
                </Text>
              </>
            ) : (
              <View style={styles.improveGoodCard}>
                <MaterialIcons name="check-circle" size={22} color="#0F6B36" />
                <Text
                  style={{
                    flex: 1,
                    color: colors.text as string,
                    fontSize: getScaledFontSize(14),
                    lineHeight: 20,
                  }}
                >
                  Nothing is below your usual range today. Every metric we can see
                  is holding steady or better — keep doing what you are doing.
                </Text>
              </View>
            )}
          </Section>
        )}

        {/* What is Readiness */}
        <Section title="What is Readiness?" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Readiness is a daily 0–100 signal that answers one question: <Text style={styles.strong}>how recovered are you today?</Text>
          </Text>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            It&apos;s a <Text style={styles.strong}>behavioral cue</Text> — not a diagnosis, not a medical device output. Use it to decide whether today is a good day to push a workout or an easy day to rest.
          </Text>
        </Section>

        {/* How it's calculated */}
        <Section title="How it's calculated" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Readiness compares <Text style={styles.strong}>today&apos;s Apple Health readings against your own last 14 days</Text> — not a population average. Everyone&apos;s baseline is personal.
          </Text>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            We use whichever of these 10 metrics you&apos;ve granted access to (2 is enough for a score, more makes it richer):
          </Text>
          <View style={styles.metricGrid}>
            {(['hrv','sleep','restingHr','respRate','steps','activeEnergy','exerciseMin','walkingHr','spo2','flights'] as ReadinessDriver['metric'][]).map((m) => {
              const contributed = drivers.some((d) => d.metric === m)
              return (
                <View
                  key={m}
                  style={[styles.metricPill, contributed ? styles.metricPillActive : styles.metricPillInactive]}
                >
                  <MaterialIcons
                    name={contributed ? 'check-circle' : 'radio-button-unchecked'}
                    size={14}
                    color={contributed ? '#0B6963' : '#C7CBD1'}
                  />
                  <Text style={[styles.metricPillTextBase, contributed ? styles.metricPillTextActive : styles.metricPillTextInactive]}>
                    {METRIC_LABEL[m]}
                  </Text>
                </View>
              )
            })}
          </View>
          <Text style={[styles.hintText, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
            {drivers.length > 0
              ? `Today's score used ${drivers.length} of 10 metrics.`
              : 'No metrics contributed today yet — connect more in Apple Health.'}
          </Text>
        </Section>

        {/* Per-metric breakdown */}
        {canViewMetrics && drivers.length > 0 && (
          <Section title="Today's contribution" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
            {drivers.map((d) => {
              const label = METRIC_LABEL[d.metric] ?? d.metric
              const unit = METRIC_UNIT[d.metric] ?? ''
              const dirLabel =
                d.direction === 'above'
                  ? `+${d.delta}${unit} above baseline`
                  : d.direction === 'below'
                    ? `${d.delta}${unit} below baseline`
                    : 'at baseline'
              return (
                <View key={d.metric} style={styles.driverRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.driverLabel, { color: colors.text, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }]}>
                      {label}
                    </Text>
                    <Text style={[styles.driverDelta, { color: colors.subtext, fontSize: getScaledFontSize(12) }]}>
                      {dirLabel}
                    </Text>
                  </View>
                  <View style={styles.driverBadge}>
                    <Text style={styles.driverScore}>{d.subscore}</Text>
                    <Text style={styles.driverScoreOf}>/100</Text>
                  </View>
                </View>
              )
            })}
          </Section>
        )}

        {/* Vishal 2026-08-05 followup — diagnostic when score is undefined.
            Explains WHY the score didn't compute (below 7-day baseline,
            fewer than 2 metrics eligible, today not synced, etc.). */}
        {typeof composite !== 'number' && (
          <Section title="Why no score today" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
            <View style={styles.hkCard}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text as string, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                  Baseline history: {readiness.score?.baselineDays ?? 0} days
                </Text>
                <Text style={{ color: colors.subtext as string, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                  {(readiness.score?.baselineDays ?? 0) >= 7
                    ? '≥7 days ✓ — baseline is enough'
                    : 'Need ≥7 days for any score.'}
                </Text>
              </View>
            </View>
            <View style={styles.hkCard}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text as string, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                  Today&apos;s HealthKit sync
                </Text>
                <Text style={{ color: colors.subtext as string, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                  {readiness.debug?.todayFound
                    ? readiness.debug?.todayHasAnyMetric
                      ? 'Today\'s bucket has data ✓'
                      : `Bucket exists (${readiness.debug?.todayIsoLocal}) but no metric values landed today.`
                    : `No data yet for today (${readiness.debug?.todayIsoLocal}). Wear your Apple Watch or wait for the next sync.`}
                </Text>
              </View>
            </View>
            <View style={styles.hkCard}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text as string, fontSize: getScaledFontSize(14), fontWeight: getScaledFontWeight(600) as any }}>
                  Eligible metrics today: {drivers.length} / 10
                </Text>
                <Text style={{ color: colors.subtext as string, fontSize: getScaledFontSize(12), marginTop: 2 }}>
                  {drivers.length >= 2
                    ? '≥2 metrics ✓ — score should render. Try pull-to-refresh.'
                    : `Need ≥2 metrics with BOTH today's value AND baseline of ≥7 days (with variation, so z-score can compute). Currently ${drivers.length} eligible.`}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.subtext as string, fontSize: getScaledFontSize(11), marginTop: 6, lineHeight: 16 }}>
              A metric is dropped if its baseline has zero variation (all readings identical — rare for real data) or if today&apos;s value hasn&apos;t synced yet. Long-press the Readiness tile on Home for the full debug snapshot.
            </Text>
          </Section>
        )}

        {/* Vishal 2026-08-05 — raw Apple Health data cards mirror the
            Health Trends surface so users see today's actual values
            alongside the Readiness composite. Only rendered when we
            have any HealthKit trends for the 10 Readiness metrics. */}
        {readinessTrends.length > 0 && (
          <Section title="Your Apple Health data" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
            {readinessTrends.map((t) => {
              const sorted = [...t.dataPoints].sort((a, b) => a.date.localeCompare(b.date))
              const latest = sorted[sorted.length - 1]
              const unit = latest?.unit ?? ''
              const dir = t.trendDirection
              const dirIcon: 'trending-up' | 'trending-down' | 'trending-flat' | 'help-outline' =
                dir === 'improving' ? 'trending-down' :
                dir === 'worsening' ? 'trending-up' :
                dir === 'stable' ? 'trending-flat' :
                'help-outline'
              const upIsGood = ['hk-steps', 'hk-active-energy', 'hk-exercise-time', 'hk-hrv', 'hk-sleep', 'hk-flights'].includes(t.metricCode)
              let dirColor = '#6B7280'
              if (dir === 'improving') dirColor = '#16A34A'
              else if (dir === 'worsening') dirColor = '#DC2626'
              if (upIsGood && (dir === 'improving' || dir === 'worsening')) {
                const earliest = sorted[0]?.value ?? 0
                const last = latest?.value ?? 0
                dirColor = last > earliest ? '#16A34A' : last < earliest ? '#DC2626' : '#6B7280'
              }
              return (
                <View key={t.id} style={styles.hkCard}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.subtext as string,
                        fontSize: getScaledFontSize(11),
                        fontWeight: getScaledFontWeight(600) as any,
                        letterSpacing: 0.3,
                      }}
                      numberOfLines={1}
                    >
                      {t.metricName.toUpperCase()}
                    </Text>
                    <View style={styles.hkValueRow}>
                      <Text
                        style={{
                          color: colors.text as string,
                          fontSize: getScaledFontSize(22),
                          fontWeight: getScaledFontWeight(700) as any,
                        }}
                        numberOfLines={1}
                      >
                        {latest ? formatValue(latest.value) : '—'}
                      </Text>
                      {latest && unit ? (
                        <Text
                          style={{
                            color: colors.subtext as string,
                            fontSize: getScaledFontSize(12),
                            marginLeft: 4,
                          }}
                        >
                          {unit}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.hkTrendChip}>
                    <MaterialIcons name={dirIcon} size={16} color={dirColor} />
                    <Text style={[styles.hkTrendText, { color: dirColor }]} numberOfLines={1}>
                      {dir === 'insufficient_data' ? 'New' : dir.charAt(0).toUpperCase() + dir.slice(1)}
                    </Text>
                  </View>
                </View>
              )
            })}
          </Section>
        )}

        {/* Why it matters */}
        <Section title="Why it matters" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Recovery is a leading indicator. A low Readiness day is often the earliest signal that your body is trending toward getting sick, overtraining, or burning out — days before you&apos;d notice on your own.
          </Text>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Small responses compound: earlier bedtime on a low day, a lighter workout, extra water, a walk instead of a run. The score isn&apos;t a demand — it&apos;s information.
          </Text>
        </Section>

        {/* Manage Apple Health CTA */}
        <Pressable
          onPress={() => router.push('/Home/apple-health' as never)}
          accessibilityRole="button"
          accessibilityLabel="Manage Apple Health permissions"
          hitSlop={4}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <MaterialIcons name="settings" size={20} color="#0B6963" />
          <Text style={styles.ctaText}>Manage Apple Health permissions</Text>
          <MaterialIcons name="chevron-right" size={22} color="#0B6963" />
        </Pressable>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Readiness is a wellness signal computed on your device from Apple Health samples. It is not a diagnosis and does not replace guidance from your care team.
        </Text>
      </ScrollView>}
    </AppWrapper>
  )
}

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 10) return v.toFixed(0)
  return v.toFixed(1)
}

// Vishal 2026-08-05 — friendly age label for the 48h fallback caveat.
// Both inputs are LOCAL-day ISO strings (YYYY-MM-DD).
function formatFallbackAge(todayIso: string, usedIso: string): string {
  if (!todayIso || !usedIso || todayIso === usedIso) return 'today'
  const todayMs = new Date(`${todayIso}T00:00:00`).getTime()
  const usedMs = new Date(`${usedIso}T00:00:00`).getTime()
  const days = Math.round((todayMs - usedMs) / (1000 * 60 * 60 * 24))
  if (days === 1) return 'yesterday'
  if (days > 1) return `${days} days ago`
  return usedIso
}

// ─── Sub-components ─────────────────────────────────────────────────

function Section({
  title,
  colors,
  sz,
  wt,
  children,
}: {
  title: string
  colors: typeof Colors.light
  sz: (n: number) => number
  wt: (n: number) => string | number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <View style={{ marginTop: 24 }}>
      <Text
        style={{
          color: colors.subtext,
          fontSize: sz(11),
          fontWeight: wt(600) as any,
          letterSpacing: 0.8,
          marginBottom: 10,
        }}
      >
        {title.toUpperCase()}
      </Text>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { paddingRight: 8, paddingVertical: 4 },
  pressed: { opacity: 0.7 },
  heroCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(11, 105, 99, 0.15)',
  },
  heroNumber: {
    fontSize: 72,
    lineHeight: 78,
    fontWeight: '700',
    color: '#11181C',
    letterSpacing: -1,
  },
  heroNumberEmpty: {
    fontSize: 72,
    lineHeight: 78,
    fontWeight: '700',
    color: '#C7CBD1',
    letterSpacing: -1,
  },
  heroScale: {
    fontSize: 14,
    color: '#687076',
    marginTop: 2,
  },
  chip: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroCaveat: {
    fontSize: 12,
    color: '#687076',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    lineHeight: 17,
  },
  strong: { fontWeight: '700' as const },
  pText: {
    lineHeight: 22,
  },
  hintText: {
    marginTop: 8,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  metricPillActive: {
    backgroundColor: '#E0F2F1',
    borderColor: '#0B6963',
  },
  metricPillInactive: {
    backgroundColor: '#F5F6F7',
    borderColor: '#E1E4E8',
  },
  metricPillTextBase: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  metricPillTextActive: { color: '#0B6963' },
  metricPillTextInactive: { color: '#687076' },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  driverLabel: {},
  driverDelta: {
    marginTop: 2,
  },
  driverBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  driverScore: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0B6963',
  },
  driverScoreOf: {
    fontSize: 11,
    color: '#0B6963',
    marginLeft: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#E0F2F1',
    borderWidth: 1,
    borderColor: 'rgba(11, 105, 99, 0.25)',
    gap: 10,
  },
  ctaText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0B6963',
  },
  disclaimer: {
    fontSize: 11,
    color: '#687076',
    lineHeight: 16,
    marginTop: 24,
  },
  // Vishal 2026-08-05 — raw Apple Health value card, styled to match
  // the driver rows so the two sections read as a family.
  hkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  hkValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  hkTrendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  hkTrendText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  // ── Trend + improvement (Vishal 2026-08-06) ───────────────────────
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rangeBtn: {
    flex: 1,
    // 44pt minimum tap target — our patients skew older and the
    // toggle is the only interactive control on this screen.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  rangeBtnActive: {
    backgroundColor: '#E0F2F1',
    // Thicker border so selection survives greyscale / colour-blind
    // viewing — never colour-only signalling.
    borderWidth: 2,
    borderColor: '#0B6963',
  },
  rangeBtnInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E4E8',
  },
  trendCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  improveCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  improveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  improveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FDF3E4',
  },
  improveActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#E0F2F1',
  },
  improveGoodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#E6F4EC',
    borderWidth: 1,
    borderColor: 'rgba(15, 107, 54, 0.2)',
  },
})
