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
 * iOS 26.5-safe primitive envelope. No Animated / LayoutAnimation /
 * ActivityIndicator.
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
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends'
import type { ReadinessBand, ReadinessDriver } from '@/lib/readiness-score'
import type { LongitudinalTrend } from '@/services/api/types'

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

export default function ReadinessScreen(): React.JSX.Element {
  const flag = useReadinessScoreFlag()
  const readiness = useReadinessDerivation(flag)
  const { data: hkTrends } = useHealthKitTrends()
  const { getScaledFontSize, getScaledFontWeight } = useAccessibility()
  const colors = Colors.light

  const composite = readiness.score?.composite
  const band = readiness.score?.band
  const bandTokens = band ? BAND_TOKENS[band] : null
  const drivers = readiness.score?.drivers ?? []
  const state = readiness.uiState

  // Filter Apple Health trends to the metrics Readiness looks at.
  // Sorted so the ones that CONTRIBUTED today come first, then the
  // ones the user has data for but weren't used, then the rest.
  const readinessTrends: LongitudinalTrend[] = React.useMemo(() => {
    const trends = (hkTrends ?? []).filter((t) => READINESS_HEALTHKIT_CODES.includes(t.metricCode))
    return trends
  }, [hkTrends])

  return (
    <AppWrapper>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

        {/* What is Readiness */}
        <Section title="What is Readiness?" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Readiness is a daily 0–100 signal that answers one question: <Text style={styles.strong}>how recovered are you today?</Text>
          </Text>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            It's a <Text style={styles.strong}>behavioral cue</Text> — not a diagnosis, not a medical device output. Use it to decide whether today is a good day to push a workout or an easy day to rest.
          </Text>
        </Section>

        {/* How it's calculated */}
        <Section title="How it's calculated" colors={colors} sz={getScaledFontSize} wt={getScaledFontWeight}>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Readiness compares <Text style={styles.strong}>today's Apple Health readings against your own last 14 days</Text> — not a population average. Everyone's baseline is personal.
          </Text>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            We use whichever of these 10 metrics you've granted access to (2 is enough for a score, more makes it richer):
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
        {drivers.length > 0 && (
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
                  Today's HealthKit sync
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
              A metric is dropped if its baseline has zero variation (all readings identical — rare for real data) or if today's value hasn't synced yet. Long-press the Readiness tile on Home for the full debug snapshot.
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
            Recovery is a leading indicator. A low Readiness day is often the earliest signal that your body is trending toward getting sick, overtraining, or burning out — days before you'd notice on your own.
          </Text>
          <Text style={[styles.pText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
            Small responses compound: earlier bedtime on a low day, a lighter workout, extra water, a walk instead of a run. The score isn't a demand — it's information.
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
      </ScrollView>
    </AppWrapper>
  )
}

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 10) return v.toFixed(0)
  return v.toFixed(1)
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
})
